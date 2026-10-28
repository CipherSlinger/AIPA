/**
 * CodexSessionReader — reads Codex thread/session data from local storage.
 *
 * Codex stores sessions under CODEX_HOME (default: ~/.codex/):
 *   - session_index.jsonl   → lightweight session listing
 *   - sessions/             → rollout JSONL files (full transcripts)
 *   - archived_sessions/    → archived threads
 *   - state_5.sqlite        → app-server state DB (not read here)
 *
 * This module reads the JSONL files directly for listing/loading sessions.
 * The app-server API (thread/list, thread/read) can be used for richer
 * queries when a bridge is active.
 */
import fs from 'fs'
import path from 'path'
import os from 'os'
import { isPathInside, isValidSessionId } from '../utils/validate'

// ── Constants ────────────────────────────────────────

function getCodexHome(): string {
  return process.env.CODEX_HOME || path.join(os.homedir(), '.codex')
}

function getSessionsDir(): string {
  return path.join(getCodexHome(), 'sessions')
}

function getArchivedDir(): string {
  return path.join(getCodexHome(), 'archived_sessions')
}

function getSessionIndexPath(): string {
  return path.join(getCodexHome(), 'session_index.jsonl')
}

// ── Types ────────────────────────────────────────────

export interface CodexSessionListItem {
  sessionId: string        // thread ID (e.g. "thr_abc123")
  lastPrompt: string       // first user message preview
  timestamp: number        // creation time (epoch ms)
  project: string          // the session's working directory, or its basename
  projectSlug: string      // dirToSlug-style encoding of the project path
  cwd?: string             // real working directory, when the index reports one
  title?: string           // user-set thread name
  messageCount?: number    // approximate message count
  firstTimestamp?: number  // first message timestamp
  archived?: boolean       // whether the session is archived
}

export interface CodexSessionMessage {
  type: string             // 'userMessage' | 'agentMessage' | 'toolCall' | 'reasoning' | etc.
  role?: string            // 'user' | 'assistant' | 'system'
  content?: unknown        // message text or structured content
  timestamp?: number
  id?: string              // item ID
  [key: string]: unknown
}

export interface CodexConfig {
  model?: string
  approvalPolicy?: string
  sandbox?: string
  [key: string]: unknown
}

// ── Rollout line shapes ──────────────────────────────
//
// Codex writes one JSON object per line. Top-level `type` is one of
// session_meta / response_item / event_msg / turn_context; `response_item`
// carries the Responses-API item that actually holds the conversation
// (message, reasoning, function_call, …). The renderer only understands the
// Claude transcript shape, so everything below normalizes into that.

interface RolloutLine {
  timestamp?: string | number
  type?: string
  payload?: Record<string, unknown>
  [key: string]: unknown
}

/** Claude-shaped entry understood by renderer parseSessionMessages(). */
interface NormalizedEntry {
  type: 'user' | 'assistant'
  message: { role: 'user' | 'assistant'; content: unknown }
  timestamp?: string
  [key: string]: unknown
}

// ── Session Index Reading ────────────────────────────

interface SessionIndexEntry {
  // Current Codex writes `{ id, thread_name, updated_at }`; older builds used
  // `{ threadId, name, createdAt }`. Accept both.
  id?: string
  threadId?: string
  thread_name?: string
  name?: string
  updated_at?: string | number
  createdAt?: number | string
  cwd?: string
  model?: string
  preview?: string
  messageCount?: number
}

function sessionIndexId(entry: SessionIndexEntry): string {
  return entry.threadId ?? entry.id ?? ''
}

/** Index timestamps are ISO strings in current Codex, numbers in older ones. */
function sessionIndexTime(entry: SessionIndexEntry): number {
  const raw = entry.updated_at ?? entry.createdAt
  if (typeof raw === 'number') return raw < 1e12 ? raw * 1000 : raw
  if (typeof raw === 'string' && raw) {
    const t = Date.parse(raw)
    if (!Number.isNaN(t)) return t
  }
  return 0
}

function readSessionIndex(): SessionIndexEntry[] {
  const indexPath = getSessionIndexPath()
  if (!fs.existsSync(indexPath)) return []

  try {
    const content = fs.readFileSync(indexPath, 'utf-8')
    const entries = content
      .split('\n')
      .filter(l => l.trim())
      .map(l => {
        try { return JSON.parse(l) as SessionIndexEntry } catch { return null }
      })
      .filter((e): e is SessionIndexEntry => e !== null && !!sessionIndexId(e))
    // The index is append-only: one line per update. Keep the newest line per
    // thread, otherwise the sidebar shows the same session several times.
    const latest = new Map<string, SessionIndexEntry>()
    for (const entry of entries) {
      const id = sessionIndexId(entry)
      const prev = latest.get(id)
      if (!prev || sessionIndexTime(entry) >= sessionIndexTime(prev)) latest.set(id, entry)
    }
    return [...latest.values()]
  } catch {
    return []
  }
}

// ── Session Listing ──────────────────────────────────

/**
 * List all sessions from the index and session directories.
 */
export function listSessions(): CodexSessionListItem[] {
  const byId = new Map<string, CodexSessionListItem>()

  // Rollout files are the source of truth for cwd and message counts; the index
  // (when present) only adds the user-set name and last-activity time. Current
  // Codex index lines carry no cwd, so relying on them alone would drop every
  // session out of its department.
  for (const filePath of collectRolloutFiles(getSessionsDir())) {
    const item = parseSessionFile(filePath)
    if (item) byId.set(item.sessionId, item)
  }
  for (const filePath of collectRolloutFiles(getArchivedDir())) {
    const item = parseSessionFile(filePath)
    if (item) {
      item.archived = true
      byId.set(item.sessionId, item)
    }
  }

  for (const entry of readSessionIndex()) {
    const threadId = sessionIndexId(entry)
    // An index entry with a non-segment id can never be loaded or deleted
    // safely, so keep it out of the list.
    if (!isValidSessionId(threadId)) continue
    const existing = byId.get(threadId)
    const cwd = entry.cwd || existing?.cwd
    const updated = sessionIndexTime(entry)
    const name = entry.thread_name || entry.name
    if (existing) {
      existing.title = name || existing.title
      existing.lastPrompt = entry.preview || existing.lastPrompt
      existing.timestamp = Math.max(existing.timestamp, updated)
      existing.cwd = cwd || undefined
      existing.project = cwd || extractProjectName(cwd)
      existing.projectSlug = cwd ? pathToSlug(cwd) : slugify(extractProjectName(cwd))
      existing.messageCount = existing.messageCount ?? entry.messageCount
    } else {
      byId.set(threadId, {
        sessionId: threadId,
        lastPrompt: entry.preview || name || '',
        timestamp: updated || Date.now(),
        project: cwd || extractProjectName(cwd),
        projectSlug: cwd ? pathToSlug(cwd) : slugify(extractProjectName(cwd)),
        cwd: cwd || undefined,
        title: name || undefined,
        messageCount: entry.messageCount,
      })
    }
  }

  return [...byId.values()].sort((a, b) => b.timestamp - a.timestamp)
}

// ── Session Loading ──────────────────────────────────

/** Session files may only live under the sessions or archived-sessions roots. */
function isSessionPathSafe(filePath: string): boolean {
  return isPathInside(getSessionsDir(), filePath) || isPathInside(getArchivedDir(), filePath)
}

/** Every rollout JSONL under a root, at any date-directory depth. */
function collectRolloutFiles(root: string): string[] {
  const files: string[] = []
  const walk = (dir: string, depth: number) => {
    if (depth > 8) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full, depth + 1)
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(full)
    }
  }
  walk(root, 0)
  return files
}

/** Codex names rollouts `rollout-<timestamp>-<uuid>.jsonl`. */
function uuidFromRolloutName(filePath: string): string | null {
  const m = path.basename(filePath).match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i)
  return m ? m[1] : null
}

/**
 * Locate the rollout file for a thread id. Current Codex shards sessions by
 * date (`sessions/2026/10/28/rollout-…-<uuid>.jsonl`), so the flat candidate
 * list alone never finds an existing session.
 */
function findSessionFile(sessionId: string): string | null {
  const direct = [
    path.join(getSessionsDir(), `${sessionId}.jsonl`),
    path.join(getSessionsDir(), sessionId, `${sessionId}.jsonl`),
    path.join(getArchivedDir(), `${sessionId}.jsonl`),
  ]
  for (const filePath of direct) {
    if (isSessionPathSafe(filePath) && fs.existsSync(filePath)) return filePath
  }

  const all = [
    ...collectRolloutFiles(getSessionsDir()),
    ...collectRolloutFiles(getArchivedDir()),
  ]
  // Filename match first; session_meta is the fallback for renamed/forked files.
  const byName = all.find(f => path.basename(f).includes(sessionId))
  if (byName) return byName
  for (const filePath of all) {
    const meta = readSessionMeta(filePath)
    if (meta.id === sessionId) return filePath
  }
  return null
}

/**
 * Load the full message history of a session, normalized to the Claude
 * transcript shape the renderer consumes.
 */
export function loadSession(sessionId: string): CodexSessionMessage[] {
  if (!isValidSessionId(sessionId)) return []
  const filePath = findSessionFile(sessionId)
  if (!filePath || !isSessionPathSafe(filePath)) return []
  return parseSessionMessages(filePath)
}

// ── Session Deletion ─────────────────────────────────

/**
 * Delete a session file.
 */
export function deleteSession(sessionId: string): boolean {
  // Without this a "../.." id would resolve outside CODEX_HOME and the
  // recursive rm below could delete an arbitrary directory.
  if (!isValidSessionId(sessionId)) return false

  const candidates = [
    path.join(getSessionsDir(), `${sessionId}.jsonl`),
    path.join(getSessionsDir(), sessionId),
    path.join(getArchivedDir(), `${sessionId}.jsonl`),
    findSessionFile(sessionId) ?? '',
  ].filter(Boolean)

  let deleted = false
  for (const p of candidates) {
    if (isSessionPathSafe(p) && fs.existsSync(p)) {
      try {
        const stat = fs.statSync(p)
        if (stat.isDirectory()) {
          fs.rmSync(p, { recursive: true, force: true })
        } else {
          fs.unlinkSync(p)
        }
        summaryCache.delete(p)
        deleted = true
      } catch { /* ignore */ }
    }
  }

  return deleted
}

// ── Session Search ───────────────────────────────────

/**
 * Search sessions by query string (basic text match).
 */
export function searchSessions(query: string, limit = 20): CodexSessionListItem[] {
  const allSessions = listSessions()
  const lowerQuery = query.toLowerCase()

  return allSessions
    .filter(s =>
      (s.lastPrompt && s.lastPrompt.toLowerCase().includes(lowerQuery)) ||
      (s.title && s.title.toLowerCase().includes(lowerQuery))
    )
    .slice(0, limit)
}

// ── Session Fork ─────────────────────────────────────

/**
 * Fork a session by copying messages up to a given index.
 * Note: For richer forking, use the app-server thread/fork API via CodexBridge.
 */
export function forkSession(sessionId: string, upToMessageIndex: number): { newSessionId: string; messages: CodexSessionMessage[] } | null {
  if (!isValidSessionId(sessionId)) return null
  const messages = loadSession(sessionId)
  if (messages.length === 0) return null

  const forkedMessages = messages.slice(0, upToMessageIndex + 1)
  const newSessionId = `fork-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  // Write forked messages to a new file
  const filePath = path.join(getSessionsDir(), `${newSessionId}.jsonl`)
  const sessionsDir = getSessionsDir()
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true })
  }

  const content = forkedMessages.map(m => JSON.stringify(m)).join('\n') + '\n'
  fs.writeFileSync(filePath, content, 'utf-8')

  return { newSessionId, messages: forkedMessages }
}

// ── Config Reading ───────────────────────────────────

/**
 * Read Codex config.toml (TOML format — simplified parser).
 */
export function readCodexConfig(): CodexConfig {
  const configPath = path.join(getCodexHome(), 'config.toml')
  if (!fs.existsSync(configPath)) return {}

  try {
    const content = fs.readFileSync(configPath, 'utf-8')
    return parseSimpleToml(content)
  } catch {
    return {}
  }
}

// ── Helpers ──────────────────────────────────────────

// ── Session summary cache ──
//
// The fallback scan parses every transcript in full just to produce a list
// row, and the renderer re-lists after every turn. Key the derived summary on
// mtime+size so only transcripts that changed are re-parsed.
const summaryCache = new Map<string, {
  mtimeMs: number
  size: number
  item: CodexSessionListItem | null
}>()

function readJsonLines(filePath: string): RolloutLine[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return content
      .split('\n')
      .filter(l => l.trim())
      .map(line => {
        try { return JSON.parse(line) as RolloutLine } catch { return null }
      })
      .filter((line): line is RolloutLine => line !== null)
  } catch {
    return []
  }
}

function readSessionMeta(filePath: string): { id?: string; cwd?: string } {
  for (const line of readJsonLines(filePath)) {
    if (line.type !== 'session_meta') continue
    const payload = (line.payload ?? {}) as Record<string, unknown>
    return {
      id: typeof payload.id === 'string' ? payload.id : undefined,
      cwd: typeof payload.cwd === 'string' ? payload.cwd : undefined,
    }
  }
  return {}
}

function isoTime(value: unknown): string | undefined {
  if (typeof value === 'string' && value) {
    const t = Date.parse(value)
    if (!Number.isNaN(t)) return new Date(t).toISOString()
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value
    const d = new Date(ms)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  return undefined
}

function parseSessionFile(filePath: string): CodexSessionListItem | null {
  let stat: fs.Stats
  try {
    stat = fs.statSync(filePath)
  } catch {
    return null
  }
  const cached = summaryCache.get(filePath)
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    // Copy: callers decorate the row with project/archived fields, and the
    // cached copy must stay pristine for the next caller.
    return cached.item ? { ...cached.item } : null
  }

  let item: CodexSessionListItem | null = null
  try {
    const lines = readJsonLines(filePath)
    if (lines.length > 0) {
      let sessionId = uuidFromRolloutName(filePath) ?? path.basename(filePath, '.jsonl')
      let cwd: string | undefined
      let firstTs: string | undefined
      let firstPrompt = ''
      let responseMessages = 0
      let eventMessages = 0
      let userText: string | null = null

      for (const line of lines) {
        const payload = (line.payload ?? {}) as Record<string, unknown>
        firstTs ??= isoTime(line.timestamp)
        if (line.type === 'session_meta') {
          if (typeof payload.id === 'string') sessionId = payload.id
          if (typeof payload.cwd === 'string') cwd = payload.cwd
          firstTs = isoTime(payload.timestamp) ?? firstTs
        } else if (line.type === 'turn_context') {
          if (!cwd && typeof payload.cwd === 'string') cwd = payload.cwd
        } else if (line.type === 'response_item' && payload.type === 'message') {
          const role = payload.role
          if (role !== 'user' && role !== 'assistant') continue
          responseMessages++
          if (role !== 'user') continue
          const text = extractContentText(payload.content)
          if (!text || isSyntheticUserText(text)) continue
          if (!firstPrompt) firstPrompt = text
        } else if (line.type === 'event_msg') {
          const type = payload.type
          if (type !== 'user_message' && type !== 'agent_message') continue
          eventMessages++
          if (type !== 'user_message') continue
          const text = String(payload.message ?? '')
          if (!text || isSyntheticUserText(text)) continue
          if (!firstPrompt) firstPrompt = text
        } else if (line.type === 'user' || line.type === 'assistant') {
          // forkSession output (already Claude-shaped)
          const message = line.message as Record<string, unknown> | undefined
          if (!message) continue
          responseMessages++
          if (line.type !== 'user') continue
          const text = extractContentText(message.content)
          if (!text || isSyntheticUserText(text) || text === userText) continue
          userText = text
          if (!firstPrompt) firstPrompt = text
        }
      }

      const firstTimestamp = firstTs ? Date.parse(firstTs) : stat.mtimeMs
      item = {
        sessionId,
        lastPrompt: firstPrompt.slice(0, 100),
        timestamp: firstTimestamp,
        // The rollout's session_meta carries the real cwd; keep it whole so the
        // renderer can join it against a department directory.
        project: cwd || '',
        projectSlug: cwd ? pathToSlug(cwd) : '',
        cwd,
        messageCount: Math.max(responseMessages, eventMessages),
        firstTimestamp,
      }
    }
  } catch {
    item = null
  }

  summaryCache.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, item })
  return item ? { ...item } : null
}

// ── Rollout normalization ────────────────────────────

function extractContentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map(part => {
      if (typeof part === 'string') return part
      const p = part as Record<string, unknown>
      return typeof p.text === 'string' ? p.text : ''
    })
    .join('')
}

/** Codex injects environment/instruction preambles as user messages. */
function isSyntheticUserText(text: string): boolean {
  const t = text.trimStart()
  return t.startsWith('<environment_context>') ||
    t.startsWith('<user_instructions>') ||
    t.startsWith('<permissions instructions>') ||
    t.startsWith('# AGENTS.md instructions') ||
    t.startsWith('<turn_aborted>')
}

function parseToolArguments(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>
  if (typeof raw !== 'string') return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : { input: raw }
  } catch {
    return { input: raw }
  }
}

interface PatchChange {
  path: string
  kind: 'add' | 'update' | 'delete'
  oldString: string
  newString: string
}

/**
 * Codex's apply_patch format, plus plain unified diffs from older builds.
 * Both reduce to per-file old/new text, which is what the Edit card renders.
 */
function parseApplyPatch(text: string): PatchChange[] {
  const changes: PatchChange[] = []
  if (!text.trim()) return changes

  const plainDiff = !text.includes('*** Begin Patch') && /^--- /m.test(text)
  let current: PatchChange | null = null

  for (const line of text.split('\n')) {
    if (plainDiff) {
      if (line.startsWith('--- ')) {
        current = { path: line.slice(4).trim(), kind: 'update', oldString: '', newString: '' }
        changes.push(current)
        continue
      }
      if (line.startsWith('+++ ')) {
        if (current) current.path = line.slice(4).trim()
        continue
      }
      if (/^(diff |index |@@)/.test(line)) continue
    } else {
      const header = line.match(/^\*\*\* (Update|Add|Delete) File:\s*(.+)$/)
      if (header) {
        current = {
          path: header[2].trim(),
          kind: header[1] === 'Add' ? 'add' : header[1] === 'Delete' ? 'delete' : 'update',
          oldString: '',
          newString: '',
        }
        changes.push(current)
        continue
      }
      const move = line.match(/^\*\*\* Move to:\s*(.+)$/)
      if (move) {
        if (current) current.path = move[1].trim()
        continue
      }
      if (/^\*\*\* (Begin|End) Patch/.test(line) || line.startsWith('@@')) continue
    }

    if (!current) continue
    if (line.startsWith('+')) current.newString += line.slice(1) + '\n'
    else if (line.startsWith('-')) current.oldString += line.slice(1) + '\n'
    else {
      const context = line.startsWith(' ') ? line.slice(1) : line
      current.oldString += context + '\n'
      current.newString += context + '\n'
    }
  }

  return changes.filter(c => c.path)
}

function normalizePlanStatus(status: unknown): 'pending' | 'in_progress' | 'completed' {
  if (status === 'completed') return 'completed'
  if (status === 'inProgress' || status === 'in_progress') return 'in_progress'
  return 'pending'
}

interface ToolEmission {
  id: string
  name: string
  input: Record<string, unknown>
}

/**
 * Map a Codex tool call onto the Claude tool names the renderer already knows.
 * Unknown tools keep their Codex name and get the generic JSON card.
 */
function toolsFromCall(name: string, rawArgs: unknown, callId: string): ToolEmission[] {
  const lower = name.toLowerCase()
  const args = parseToolArguments(rawArgs)

  if (lower === 'shell' || lower === 'container.exec' || lower === 'exec_command' || lower === 'shell_command') {
    const rawCommand = args.command ?? args.cmd ?? args.input
    const command = Array.isArray(rawCommand) ? rawCommand.join(' ') : String(rawCommand ?? '')
    return [{ id: callId, name: 'Bash', input: { command, ...(args.workdir ? { cwd: args.workdir } : {}) } }]
  }

  if (lower === 'apply_patch' || lower === 'patch' || lower === 'applypatch') {
    const patchText = typeof args.input === 'string'
      ? args.input
      : typeof rawArgs === 'string' ? rawArgs : ''
    const changes = parseApplyPatch(patchText)
    if (changes.length === 0) return [{ id: callId, name: 'Edit', input: args }]
    return changes.map((change, idx) => ({
      id: changes.length === 1 ? callId : `${callId}:${idx}`,
      name: 'Edit',
      input: {
        file_path: change.path,
        old_string: change.oldString,
        new_string: change.newString,
        change_kind: change.kind,
      },
    }))
  }

  if (lower === 'update_plan') {
    const plan = Array.isArray(args.plan) ? args.plan : Array.isArray(args.todos) ? args.todos : []
    const todos = plan.map(step => {
      if (typeof step === 'string') return { content: step, status: 'pending' }
      const s = step as Record<string, unknown>
      return { content: String(s.step ?? s.content ?? ''), status: normalizePlanStatus(s.status) }
    })
    return [{ id: callId, name: 'TodoWrite', input: { todos } }]
  }

  if (lower === 'read_file') {
    const file = args.path ?? args.file_path ?? args.file
    return [{ id: callId, name: 'Read', input: { file_path: String(file ?? '') } }]
  }

  if (lower === 'write_file') {
    const file = args.path ?? args.file_path ?? args.file
    return [{ id: callId, name: 'Write', input: { file_path: String(file ?? ''), content: String(args.content ?? '') } }]
  }

  return [{ id: callId, name, input: args }]
}

/** Shell/patch outputs are JSON envelopes; unwrap the text and exit status. */
function normalizeToolOutput(raw: unknown): { text: string; isError: boolean } {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        const p = parsed as Record<string, unknown>
        const metadata = p.metadata as Record<string, unknown> | undefined
        if ('output' in p || metadata) {
          const text = typeof p.output === 'string'
            ? p.output
            : p.output != null ? JSON.stringify(p.output) : ''
          return { text, isError: typeof metadata?.exit_code === 'number' && metadata.exit_code !== 0 }
        }
      }
    } catch { /* plain text output */ }
    return { text: raw, isError: false }
  }
  if (raw == null) return { text: '', isError: false }
  return { text: typeof raw === 'object' ? JSON.stringify(raw) : String(raw), isError: false }
}

function normalizeRollout(lines: RolloutLine[], fallbackTimestamp?: string): NormalizedEntry[] {
  const result: NormalizedEntry[] = []
  let blocks: Array<Record<string, unknown>> = []
  let blockTimestamp: string | undefined
  let lastUserText: string | null = null
  let lastAssistantText: string | null = null
  let lastThinking: string | null = null
  // call_id → ids of the tool cards it produced (an apply_patch can yield one
  // per file), so the single call output can resolve all of them.
  const callToolIds = new Map<string, string[]>()
  let anonymousCallId = 0

  let fallback = fallbackTimestamp
  if (!fallback) {
    for (const line of lines) {
      fallback = isoTime(line.timestamp)
      if (fallback) break
    }
  }
  fallback ??= new Date().toISOString()

  const flush = () => {
    if (blocks.length === 0) return
    result.push({
      type: 'assistant',
      message: { role: 'assistant', content: blocks },
      timestamp: blockTimestamp ?? fallback,
    })
    blocks = []
    blockTimestamp = undefined
  }

  const addBlock = (block: Record<string, unknown>, timestamp?: string) => {
    blockTimestamp ??= timestamp
    blocks.push(block)
  }

  const pushUserText = (text: string, timestamp?: string) => {
    if (!text.trim() || text === lastUserText) return
    lastUserText = text
    lastAssistantText = null
    lastThinking = null
    flush()
    result.push({
      type: 'user',
      message: { role: 'user', content: text },
      timestamp: timestamp ?? fallback,
    })
  }

  const pushAssistantText = (text: string, timestamp?: string) => {
    if (!text.trim() || text === lastAssistantText) return
    lastAssistantText = text
    addBlock({ type: 'text', text }, timestamp)
  }

  const pushThinking = (text: string, timestamp?: string) => {
    if (!text.trim() || text === lastThinking) return
    lastThinking = text
    addBlock({ type: 'thinking', thinking: text }, timestamp)
  }

  const emitTool = (name: string, rawArgs: unknown, callId: string | undefined, timestamp?: string) => {
    const id = callId || `tool-${++anonymousCallId}`
    const tools = toolsFromCall(name, rawArgs, id)
    if (tools.length === 0) return
    lastAssistantText = null
    lastThinking = null
    for (const tool of tools) addBlock({ type: 'tool_use', id: tool.id, name: tool.name, input: tool.input }, timestamp)
    if (callId) callToolIds.set(callId, tools.map(t => t.id))
  }

  const emitToolResult = (callId: string | undefined, rawOutput: unknown, timestamp?: string) => {
    const ids = callId ? callToolIds.get(callId) : undefined
    if (!ids || ids.length === 0) return
    const { text, isError } = normalizeToolOutput(rawOutput)
    flush()
    result.push({
      type: 'user',
      message: {
        role: 'user',
        content: ids.map(id => ({ type: 'tool_result', tool_use_id: id, content: text, is_error: isError })),
      },
      timestamp: timestamp ?? fallback,
    })
    if (callId) callToolIds.delete(callId)
  }

  for (const line of lines) {
    const timestamp = isoTime(line.timestamp)
    const payload = (line.payload ?? {}) as Record<string, unknown>

    // forkSession writes already-normalized Claude entries.
    if (line.type === 'user' || line.type === 'assistant') {
      const message = line.message as Record<string, unknown> | undefined
      if (line.type === 'user' && message) {
        flush()
        result.push({
          ...line,
          type: 'user',
          message,
          timestamp: isoTime(line.timestamp) ?? fallback,
        } as NormalizedEntry)
      } else if (line.type === 'assistant' && message) {
        flush()
        result.push({
          ...line,
          type: 'assistant',
          message,
          timestamp: isoTime(line.timestamp) ?? fallback,
        } as NormalizedEntry)
      }
      continue
    }

    if (line.type === 'session_meta' || line.type === 'turn_context') continue

    if (line.type === 'response_item') {
      switch (payload.type) {
        case 'message': {
          const role = payload.role
          const text = extractContentText(payload.content)
          if (role === 'user' && !isSyntheticUserText(text)) pushUserText(text, timestamp)
          else if (role === 'assistant') pushAssistantText(text, timestamp)
          break
        }
        case 'reasoning': {
          const summary = Array.isArray(payload.summary)
            ? (payload.summary as Array<Record<string, unknown>>).map(s => String(s.text ?? '')).join('\n\n')
            : ''
          const content = Array.isArray(payload.content)
            ? (payload.content as Array<Record<string, unknown>>).map(c => String(c.text ?? '')).join('\n\n')
            : ''
          pushThinking(summary || content, timestamp)
          break
        }
        case 'function_call':
        case 'custom_tool_call': {
          emitTool(
            String(payload.name ?? ''),
            payload.arguments ?? payload.input,
            typeof payload.call_id === 'string' ? payload.call_id : undefined,
            timestamp,
          )
          break
        }
        case 'local_shell_call': {
          const action = payload.action as Record<string, unknown> | undefined
          emitTool('shell', action ?? payload, typeof payload.call_id === 'string' ? payload.call_id : undefined, timestamp)
          break
        }
        case 'function_call_output':
        case 'custom_tool_call_output': {
          emitToolResult(
            typeof payload.call_id === 'string' ? payload.call_id : undefined,
            payload.output,
            timestamp,
          )
          break
        }
        case 'web_search_call': {
          const action = payload.action as Record<string, unknown> | undefined
          emitTool('web_search', { query: action?.query ?? '' }, typeof payload.call_id === 'string' ? payload.call_id : undefined, timestamp)
          break
        }
        case 'image_generation_call': {
          emitTool('image_generation', {}, typeof payload.call_id === 'string' ? payload.call_id : undefined, timestamp)
          break
        }
        default:
          break
      }
      continue
    }

    if (line.type === 'event_msg') {
      switch (payload.type) {
        case 'user_message':
          pushUserText(String(payload.message ?? ''), timestamp)
          break
        case 'agent_message':
          pushAssistantText(String(payload.message ?? ''), timestamp)
          break
        case 'agent_reasoning':
          pushThinking(String(payload.text ?? ''), timestamp)
          break
        case 'exec_command_begin': {
          const command = Array.isArray(payload.command) ? (payload.command as string[]).join(' ') : String(payload.command ?? '')
          emitTool('shell', { command }, typeof payload.call_id === 'string' ? payload.call_id : undefined, timestamp)
          break
        }
        case 'exec_command_end': {
          const output = [payload.stdout, payload.stderr].filter(Boolean).join('\n')
          const exitCode = typeof payload.exit_code === 'number' ? payload.exit_code : 0
          emitToolResult(
            typeof payload.call_id === 'string' ? payload.call_id : undefined,
            { output, metadata: { exit_code: exitCode } },
            timestamp,
          )
          break
        }
        case 'patch_apply_begin': {
          const changes = payload.changes as Record<string, Record<string, unknown>> | undefined
          const callId = typeof payload.call_id === 'string' ? payload.call_id : undefined
          if (changes && Object.keys(changes).length > 0) {
            const patchText: string[] = ['*** Begin Patch']
            for (const [file, change] of Object.entries(changes)) {
              if (change.add) {
                patchText.push(`*** Add File: ${file}`)
                patchText.push(...String((change.add as Record<string, unknown>).content ?? '').split('\n').map(l => `+${l}`))
              } else if (change.delete) {
                patchText.push(`*** Delete File: ${file}`)
              } else if (change.update) {
                patchText.push(`*** Update File: ${file}`)
                patchText.push(String((change.update as Record<string, unknown>).unified_diff ?? ''))
              }
            }
            patchText.push('*** End Patch')
            emitTool('apply_patch', { input: patchText.join('\n') }, callId, timestamp)
          }
          break
        }
        case 'patch_apply_end':
          emitToolResult(
            typeof payload.call_id === 'string' ? payload.call_id : undefined,
            { output: '', metadata: { exit_code: payload.success === false ? 1 : 0 } },
            timestamp,
          )
          break
        default:
          break
      }
      continue
    }
  }

  flush()
  return result
}

function parseSessionMessages(filePath: string): CodexSessionMessage[] {
  const lines = readJsonLines(filePath)
  if (lines.length === 0) return []
  let fallback: string | undefined
  try {
    fallback = fs.statSync(filePath).mtime.toISOString()
  } catch { /* use first line timestamp */ }
  return normalizeRollout(lines, fallback) as unknown as CodexSessionMessage[]
}

function extractProjectName(cwd?: string): string {
  if (!cwd) return ''
  return path.basename(cwd)
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Encode a directory path the way Claude names its project folders — every path
 * separator and the Windows drive colon becomes a hyphen, so
 * "D:\projects\AIPA" → "D--projects-AIPA". Mirrors `dirToSlug` in the renderer;
 * the two must stay in step, since a mismatch silently empties every roster.
 */
function pathToSlug(dir: string): string {
  return dir.replace(/[/\\:]/g, '-')
}

/**
 * Minimal TOML parser — handles simple key=value pairs at top level.
 * Does not handle nested tables, arrays, or inline tables.
 */
function parseSimpleToml(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const lines = content.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('[')) continue

    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue

    const key = trimmed.slice(0, eqIdx).trim()
    let value: unknown = trimmed.slice(eqIdx + 1).trim()

    // Parse value types
    if (typeof value === 'string') {
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1)
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1)
      } else if (value === 'true') {
        value = true
      } else if (value === 'false') {
        value = false
      } else if (/^\d+$/.test(value)) {
        value = parseInt(value, 10)
      } else if (/^\d+\.\d+$/.test(value)) {
        value = parseFloat(value)
      }
    }

    result[key] = value
  }

  return result
}
