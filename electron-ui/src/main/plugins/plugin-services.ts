/**
 * Host capabilities exposed to nav plugins through the iframe bridge.
 *
 * Plugins run as sandboxed file:// pages, so anything that needs Node
 * (file-backed storage, local folder scans, cross-origin HTTP, Codex) is
 * implemented here and reached via PluginHostView → preload → IPC.
 */
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { EventEmitter } from 'events'
import { net } from 'electron'
import { CodexBridge, CodexAuthError } from '../codex/codex-bridge'
import { StreamBridge } from '../pty/stream-bridge'
import { buildCliEnv, migrateProviderConfig, type ModelProviderConfig } from '../providers/types'
import { getPref } from '../config/config-manager'
import { createLogger } from '../utils/logger'

const log = createLogger('plugin-services')

// ── File-backed plugin data ──────────────────────────

const SAFE_SEGMENT = /^[A-Za-z0-9._-]{1,80}$/

function getPluginDataDir(pluginId: string): string {
  if (!SAFE_SEGMENT.test(pluginId)) throw new Error(`Invalid plugin id: ${pluginId}`)
  return path.join(os.homedir(), '.aipa', 'plugin-data', pluginId)
}

function getDataFile(pluginId: string, key: string): string {
  if (!SAFE_SEGMENT.test(key)) throw new Error(`Invalid data key: ${key}`)
  return path.join(getPluginDataDir(pluginId), `${key}.json`)
}

export function readPluginData(pluginId: string, key: string): unknown {
  const file = getDataFile(pluginId, key)
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch (err) {
    log.warn(`Corrupted plugin data ${file}:`, err)
    return null
  }
}

export function writePluginData(pluginId: string, key: string, value: unknown): void {
  const file = getDataFile(pluginId, key)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  // Write to a temp file first so a crash mid-write never truncates user data
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf-8')
  fs.renameSync(tmp, file)
}

// ── Work-source pulling ──────────────────────────────

export interface PullItem {
  title: string
  desc: string
}

export interface GithubCommitsArgs {
  repo: string
  branch?: string
  author?: string
  token?: string
  since: string   // YYYY-MM-DD inclusive
  until: string   // YYYY-MM-DD inclusive
}

const MAX_GITHUB_ITEMS = 100
const MAX_FOLDER_ITEMS = 200
const GITHUB_TIMEOUT_MS = 20_000

function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatLocal(ms: number, withYear: boolean): string {
  const d = new Date(ms)
  const md = `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  return withYear ? `${d.getFullYear()}-${md}` : md
}

export async function fetchGithubCommits(args: GithubCommitsArgs): Promise<PullItem[]> {
  const repo = (args.repo || '').trim()
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    throw new Error('GitHub 仓库格式应为 owner/repo')
  }
  const url = new URL(`https://api.github.com/repos/${repo}/commits`)
  url.searchParams.set('since', `${args.since}T00:00:00Z`)
  url.searchParams.set('until', `${addDays(args.until, 1)}T00:00:00Z`)
  url.searchParams.set('per_page', '100')
  if (args.branch && args.branch !== 'main') url.searchParams.set('sha', args.branch)

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'aipa-work-calendar',
  }
  if (args.token) headers.Authorization = `Bearer ${args.token}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS)
  let res: Response
  try {
    res = await net.fetch(url.toString(), { headers, signal: controller.signal })
  } catch (err) {
    const aborted = controller.signal.aborted
    throw new Error(aborted ? 'GitHub 请求超时（20 秒）' : `拉取 GitHub 提交失败：${String(err)}`)
  } finally {
    clearTimeout(timer)
  }

  if (res.status === 404) throw new Error(`仓库 ${repo} 不存在、非公开或分支不存在`)
  if (res.status === 401 || res.status === 403) throw new Error('GitHub 鉴权失败或触发限流，请检查 Token')
  if (!res.ok) throw new Error(`拉取 GitHub 提交失败：HTTP ${res.status}`)

  const commits = await res.json() as Array<{
    sha: string
    commit: { message: string; author?: { name?: string; email?: string; date?: string } }
  }>
  const authorFilter = (args.author || '').trim().toLowerCase()
  return commits
    .filter(c => {
      if (!authorFilter) return true
      const name = (c.commit.author?.name || '').toLowerCase()
      const email = (c.commit.author?.email || '').toLowerCase()
      return name.includes(authorFilter) || email.includes(authorFilter)
    })
    .slice(0, MAX_GITHUB_ITEMS)
    .map(c => {
      const date = c.commit.author?.date ? formatLocal(Date.parse(c.commit.author.date), false) : ''
      return {
        title: c.commit.message.split('\n')[0].trim(),
        desc: `${c.sha.slice(0, 7)} · ${c.commit.author?.name || 'unknown'} · ${date}`,
      }
    })
}

export interface ScanFolderArgs {
  folderPath: string
  filter?: string   // '*' | '*.ext' | exact file name; comma-separated list allowed
  since: string     // YYYY-MM-DD inclusive (local time)
  until: string     // YYYY-MM-DD inclusive (local time)
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'out', 'target', '__pycache__'])

function buildMatcher(filter: string): (name: string) => boolean {
  const patterns = (filter || '*').split(/[,;\s]+/).map(p => p.trim()).filter(Boolean)
  if (patterns.length === 0 || patterns.includes('*')) return () => true
  return (name: string) => {
    const lower = name.toLowerCase()
    return patterns.some(p => {
      const ext = /^\*\.([a-z0-9]+)$/i.exec(p)
      return ext ? lower.endsWith(`.${ext[1].toLowerCase()}`) : name === p
    })
  }
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export async function scanFolderChanges(args: ScanFolderArgs): Promise<PullItem[]> {
  const root = path.resolve(args.folderPath || '')
  let stat: fs.Stats
  try {
    stat = await fs.promises.stat(root)
  } catch {
    throw new Error(`文件夹不存在：${root}`)
  }
  if (!stat.isDirectory()) throw new Error(`不是文件夹：${root}`)

  const startMs = new Date(`${args.since}T00:00:00`).getTime()
  const endMs = new Date(`${args.until}T00:00:00`).getTime() + 24 * 60 * 60 * 1000
  const matches = buildMatcher(args.filter || '*')
  const found: Array<PullItem & { mtime: number }> = []

  const walk = async (dir: string, rel: string): Promise<void> => {
    if (found.length >= MAX_FOLDER_ITEMS) return
    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (found.length >= MAX_FOLDER_ITEMS) return
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
        await walk(path.join(dir, entry.name), `${rel}${entry.name}/`)
        continue
      }
      if (!entry.isFile() || !matches(entry.name)) continue
      try {
        const st = await fs.promises.stat(path.join(dir, entry.name))
        if (st.mtimeMs < startMs || st.mtimeMs >= endMs) continue
        found.push({
          title: `${rel}${entry.name}`,
          desc: `修改于 ${formatLocal(st.mtimeMs, true)} · ${formatBytes(st.size)}`,
          mtime: st.mtimeMs,
        })
      } catch { /* file vanished mid-scan */ }
    }
  }

  await walk(root, '')
  found.sort((a, b) => b.mtime - a.mtime)
  return found.map(({ title, desc }) => ({ title, desc }))
}

// ── One-shot AI generation ───────────────────────────

export type PluginAiEvent =
  | { requestId: string; type: 'delta'; text: string }
  | { requestId: string; type: 'status'; message: string }
  | { requestId: string; type: 'done'; text: string }
  | { requestId: string; type: 'error'; message: string }

export interface PluginAiArgs {
  requestId: string
  prompt: string
  instructions?: string
  model?: string
  apiKey?: string
}

const AI_TIMEOUT_MS = 5 * 60 * 1000

// Shared failure wording for both AI paths, so the two branches stay in step.
const AI_TIMEOUT_MESSAGE = 'AI 生成超时（5 分钟），请重试'
const AI_FAILED_MESSAGE = 'AI 生成失败'
const AI_EMPTY_MESSAGE = '生成内容为空，请重试'
const AI_CANCELLED_MESSAGE = '已取消生成'

const DEFAULT_AI_INSTRUCTIONS =
  'You are a writing assistant embedded in a desktop plugin. ' +
  'Answer directly with the requested text only. ' +
  'Do not run shell commands, read files, or call any tools.'

/** Live runs by request id — the value aborts that run. */
const aiRuns = new Map<string, () => void>()

/**
 * Per-run bookkeeping shared by both AI paths: a one-shot `finish` guard (the
 * first terminal event wins), the 5-minute timeout, and the stderr tail used in
 * error messages.
 */
function createRun(
  requestId: string,
  bridge: EventEmitter & { abort: () => void },
  emit: (e: PluginAiEvent) => void,
): { finish: (event: PluginAiEvent) => void; stderrTail: () => string } {
  let finished = false
  let lastStderr = ''

  const finish = (event: PluginAiEvent) => {
    if (finished) return
    finished = true
    clearTimeout(timer)
    aiRuns.delete(requestId)
    emit(event)
    bridge.abort()
  }

  const timer = setTimeout(() => {
    finish({ requestId, type: 'error', message: AI_TIMEOUT_MESSAGE })
  }, AI_TIMEOUT_MS)

  bridge.on('stderr', (text: string) => {
    lastStderr = text.trim().split('\n').pop() || lastStderr
  })

  return { finish, stderrTail: () => lastStderr }
}

function pluginAiCwd(): string {
  const cwd = path.join(os.homedir(), '.aipa', 'plugin-data')
  fs.mkdirSync(cwd, { recursive: true })
  return cwd
}

/**
 * Which provider should serve a plugin AI turn, and with which model.
 *
 * Mirrors the chat's `resolveProvider()`: when the requested model (or the
 * app's active model) belongs to an enabled provider other than the built-in
 * Claude CLI — i.e. an AI gateway or a compatible endpoint — that provider
 * serves the turn. Without this, a gateway-only setup fails the Codex auth
 * check even though chat works, because plugin AI never saw the gateway.
 *
 * The resolved model is returned too: a gateway usually serves only the models
 * it advertises, so the CLI must be told which one to ask for.
 */
function resolvePluginAiTarget(model?: string): { config: ModelProviderConfig; model: string } | null {
  const target = (model || '').trim() || (getPref('model') || '').trim()
  if (!target) return null
  const saved = (getPref('modelProviders') as unknown[] | undefined) ?? []
  for (const entry of saved) {
    const config = migrateProviderConfig(entry as Record<string, unknown>)
    if (config.id === 'claude-cli' || !config.enabled) continue
    if ((config.models ?? []).some(m => m.id === target)) return { config, model: target }
  }
  return null
}

/**
 * Run one ephemeral generation and stream the agent's text back.
 *
 * Routing follows the active provider config: gateway / compatible setups run
 * through the Claude CLI on that provider's own credentials, everything else
 * falls back to a one-shot read-only Codex turn. Neither path keeps a session,
 * so plugin generations never show up in chat history.
 */
export async function startPluginAi(args: PluginAiArgs, emit: (e: PluginAiEvent) => void): Promise<void> {
  const { requestId } = args
  if (aiRuns.has(requestId)) throw new Error(`Duplicate AI request id: ${requestId}`)

  const target = resolvePluginAiTarget(args.model)
  return target
    ? startProviderAi(args, emit, target.config, target.model)
    : startCodexAi(args, emit)
}

/** Provider path — Claude CLI carrying the provider's env (base URL + token). */
async function startProviderAi(
  args: PluginAiArgs,
  emit: (e: PluginAiEvent) => void,
  config: ModelProviderConfig,
  model: string
): Promise<void> {
  const { requestId } = args
  const bridge = new StreamBridge(`plugin-ai-${requestId}`)

  // Deltas drive the live preview; the CLI's result event carries the finished
  // answer verbatim, which is what we return.
  let streaming = ''
  let completedText = ''
  let cancelled = false

  const abort = () => {
    cancelled = true
    try { bridge.endSession() } catch { /* stdin may already be closed */ }
    bridge.abort()
  }
  aiRuns.set(requestId, abort)

  const { finish, stderrTail } = createRun(requestId, bridge, emit)

  bridge.on('textDelta', (d: { text?: string }) => {
    if (!d?.text) return
    streaming += d.text
    emit({ requestId, type: 'delta', text: streaming })
  })
  bridge.on('result', (d: { subtype?: string; event?: { result?: unknown } }) => {
    const raw = d.event?.result
    if (typeof raw === 'string' && raw.trim()) completedText = raw
    const text = (completedText || streaming).trim()
    if (d.subtype !== 'success') {
      finish({ requestId, type: 'error', message: text || AI_FAILED_MESSAGE })
    } else if (!text) {
      finish({ requestId, type: 'error', message: AI_EMPTY_MESSAGE })
    } else {
      finish({ requestId, type: 'done', text })
    }
  })

  try {
    // bypassPermissions is what makes StreamBridge run one-shot (--print with
    // stdin closed). `--tools ""` disables every tool, so a plugin prompt can
    // never touch the filesystem — the same guarantee the Codex path's
    // read-only sandbox gave. The tool-free instruction goes in as a system
    // prompt as well, for models that ignore the empty tool list.
    await bridge.sendMessage({
      prompt: args.prompt,
      cwd: pluginAiCwd(),
      model,
      env: { ...buildCliEnv(config), CLAUDECODE: '' },
      permissionMode: 'bypassPermissions',
      flags: [
        '--tools', '',
        ...(args.instructions ? ['--append-system-prompt', args.instructions] : []),
      ],
    })
  } catch (err) {
    const tail = stderrTail()
    finish({
      requestId,
      type: 'error',
      message: cancelled
        ? AI_CANCELLED_MESSAGE
        : `${AI_FAILED_MESSAGE}：${err instanceof Error ? err.message : String(err)}${tail ? `（${tail}）` : ''}`,
    })
    return
  }

  // Process exited without a usable result event.
  const text = (completedText || streaming).trim()
  const tail = stderrTail()
  finish(text
    ? { requestId, type: 'done', text }
    : {
        requestId,
        type: 'error',
        message: cancelled
          ? AI_CANCELLED_MESSAGE
          : `${AI_EMPTY_MESSAGE}${tail ? `（${tail}）` : ''}`,
      })
}

/** Codex path — used when no gateway / compatible provider owns the model. */
async function startCodexAi(args: PluginAiArgs, emit: (e: PluginAiEvent) => void): Promise<void> {
  const { requestId } = args
  const bridge = new CodexBridge(`plugin-ai-${requestId}`)
  aiRuns.set(requestId, () => { bridge.interruptTurn().catch(() => bridge.abort()) })

  // Deltas arrive without itemId; a completed agentMessage re-sends the full
  // text with its itemId. Keep only the latest message so preambles like
  // "I'll write the report…" don't leak into the result.
  let streaming = ''
  let lastCompleted = ''

  const { finish, stderrTail } = createRun(requestId, bridge, emit)

  bridge.on('textDelta', (d: { text: string; itemId?: string }) => {
    if (d.itemId) {
      lastCompleted = d.text
      streaming = ''
    } else {
      streaming += d.text
    }
    emit({ requestId, type: 'delta', text: streaming || lastCompleted })
  })
  bridge.on('turnError', (d: { message: string; details?: string; willRetry: boolean }) => {
    if (d.willRetry) {
      emit({ requestId, type: 'status', message: d.message })
    } else {
      finish({ requestId, type: 'error', message: d.details ? `${d.message}（${d.details}）` : d.message })
    }
  })
  bridge.on('result', (d: { status?: string; event?: { turn?: { error?: { message?: string } } } }) => {
    const text = (lastCompleted || streaming).trim()
    if (d.status === 'failed') {
      finish({ requestId, type: 'error', message: d.event?.turn?.error?.message || AI_FAILED_MESSAGE })
    } else if (d.status === 'interrupted') {
      finish({ requestId, type: 'error', message: AI_CANCELLED_MESSAGE })
    } else if (!text) {
      finish({ requestId, type: 'error', message: AI_EMPTY_MESSAGE })
    } else {
      finish({ requestId, type: 'done', text })
    }
  })
  bridge.on('processExit', (d: { code?: number | null }) => {
    finish({
      requestId,
      type: 'error',
      message: `Codex 进程意外退出（code ${d.code ?? 'null'}）${stderrTail() ? `：${stderrTail()}` : ''}`,
    })
  })

  const env: Record<string, string> = {}
  if (args.apiKey) env.OPENAI_API_KEY = args.apiKey

  try {
    await bridge.sendMessage({
      prompt: args.prompt,
      cwd: pluginAiCwd(),
      model: args.model || undefined,
      env,
      approvalPolicy: 'never',
      sandbox: 'read-only',
      personality: 'none',
      ephemeral: true,
      requireAuth: true,
      developerInstructions: args.instructions || DEFAULT_AI_INSTRUCTIONS,
    })
  } catch (err) {
    finish({
      requestId,
      type: 'error',
      message: err instanceof CodexAuthError
        ? 'Codex 尚未登录，也未配置 OpenAI API Key。请在 AIPA 设置中填写 API Key，或在「模型提供商」中把网关 / 兼容接口设为当前模型，或执行 codex login 后重试'
        : `启动 Codex 失败：${err instanceof Error ? err.message : String(err)}`,
    })
  }
}

export function abortPluginAi(requestId: string): void {
  aiRuns.get(requestId)?.()
}

export function abortAllPluginAi(): void {
  for (const abort of [...aiRuns.values()]) abort()
  aiRuns.clear()
}
