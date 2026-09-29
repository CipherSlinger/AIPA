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
import { net } from 'electron'
import { CodexBridge, CodexAuthError } from '../codex/codex-bridge'
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

// ── One-shot AI generation via Codex ─────────────────

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

const DEFAULT_AI_INSTRUCTIONS =
  'You are a writing assistant embedded in a desktop plugin. ' +
  'Answer directly with the requested text only. ' +
  'Do not run shell commands, read files, or call any tools.'

const aiRuns = new Map<string, CodexBridge>()

/**
 * Run a single ephemeral, read-only Codex turn and stream the agent's text back.
 * The thread is ephemeral so plugin generations never show up in chat history.
 */
export async function startPluginAi(args: PluginAiArgs, emit: (e: PluginAiEvent) => void): Promise<void> {
  const { requestId } = args
  if (aiRuns.has(requestId)) throw new Error(`Duplicate AI request id: ${requestId}`)

  const bridge = new CodexBridge(`plugin-ai-${requestId}`)
  aiRuns.set(requestId, bridge)

  // Deltas arrive without itemId; a completed agentMessage re-sends the full
  // text with its itemId. Keep only the latest message so preambles like
  // "I'll write the report…" don't leak into the result.
  let streaming = ''
  let lastCompleted = ''
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
    finish({ requestId, type: 'error', message: 'AI 生成超时（5 分钟），请重试' })
  }, AI_TIMEOUT_MS)

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
      finish({ requestId, type: 'error', message: d.event?.turn?.error?.message || 'AI 生成失败' })
    } else if (d.status === 'interrupted') {
      finish({ requestId, type: 'error', message: '已取消生成' })
    } else if (!text) {
      finish({ requestId, type: 'error', message: '生成内容为空，请重试' })
    } else {
      finish({ requestId, type: 'done', text })
    }
  })
  bridge.on('stderr', (text: string) => {
    lastStderr = text.trim().split('\n').pop() || lastStderr
  })
  bridge.on('processExit', (d: { code?: number | null }) => {
    finish({
      requestId,
      type: 'error',
      message: `Codex 进程意外退出（code ${d.code ?? 'null'}）${lastStderr ? `：${lastStderr}` : ''}`,
    })
  })

  const env: Record<string, string> = {}
  if (args.apiKey) env.OPENAI_API_KEY = args.apiKey

  const cwd = path.join(os.homedir(), '.aipa', 'plugin-data')
  fs.mkdirSync(cwd, { recursive: true })

  try {
    await bridge.sendMessage({
      prompt: args.prompt,
      cwd,
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
        ? 'Codex 尚未登录，也未配置 OpenAI API Key。请在 AIPA 设置中填写 API Key，或在终端执行 codex login 后重试'
        : `启动 Codex 失败：${err instanceof Error ? err.message : String(err)}`,
    })
  }
}

export function abortPluginAi(requestId: string): void {
  const bridge = aiRuns.get(requestId)
  if (!bridge) return
  bridge.interruptTurn().catch(() => bridge.abort())
}

export function abortAllPluginAi(): void {
  for (const bridge of aiRuns.values()) bridge.abort()
  aiRuns.clear()
}
