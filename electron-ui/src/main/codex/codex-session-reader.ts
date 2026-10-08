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

// ── Session Index Reading ────────────────────────────

interface SessionIndexEntry {
  threadId: string
  name?: string
  createdAt?: number | string
  cwd?: string
  model?: string
  preview?: string
  messageCount?: number
}

function readSessionIndex(): SessionIndexEntry[] {
  const indexPath = getSessionIndexPath()
  if (!fs.existsSync(indexPath)) return []

  try {
    const content = fs.readFileSync(indexPath, 'utf-8')
    return content
      .split('\n')
      .filter(l => l.trim())
      .map(l => {
        try { return JSON.parse(l) as SessionIndexEntry } catch { return null }
      })
      .filter((e): e is SessionIndexEntry => e !== null && !!e.threadId)
  } catch {
    return []
  }
}

// ── Session Listing ──────────────────────────────────

/**
 * List all sessions from the index and session directories.
 */
export function listSessions(): CodexSessionListItem[] {
  const sessions: CodexSessionListItem[] = []

  // Try the session index first (fastest)
  const indexEntries = readSessionIndex()
  if (indexEntries.length > 0) {
    for (const entry of indexEntries) {
      sessions.push({
        sessionId: entry.threadId,
        lastPrompt: entry.preview || entry.name || '',
        timestamp: typeof entry.createdAt === 'number'
          ? entry.createdAt
          : entry.createdAt ? new Date(entry.createdAt).getTime() : Date.now(),
        // The index carries the real cwd; keep it whole so the renderer can join
        // it against a department directory. The basename alone cannot identify
        // a folder, and slugify() of a non-ASCII name is empty.
        project: entry.cwd || extractProjectName(entry.cwd),
        projectSlug: entry.cwd ? pathToSlug(entry.cwd) : slugify(extractProjectName(entry.cwd)),
        cwd: entry.cwd || undefined,
        title: entry.name || undefined,
        messageCount: entry.messageCount,
      })
    }
    return sessions.sort((a, b) => b.timestamp - a.timestamp)
  }

  // Fallback: scan session directories for JSONL rollout files
  const sessionsDir = getSessionsDir()
  if (fs.existsSync(sessionsDir)) {
    try {
      const entries = fs.readdirSync(sessionsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          const sessionId = entry.name.replace('.jsonl', '')
          const filePath = path.join(sessionsDir, entry.name)
          const session = parseSessionFile(sessionId, filePath)
          if (session) sessions.push(session)
        } else if (entry.isDirectory()) {
          // Some Codex versions use per-session directories
          const dirPath = path.join(sessionsDir, entry.name)
          const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl'))
          for (const file of files) {
            const sessionId = file.replace('.jsonl', '')
            const filePath = path.join(dirPath, file)
            const session = parseSessionFile(sessionId, filePath)
            if (session) {
              session.project = extractProjectName(entry.name)
              session.projectSlug = slugify(entry.name)
              sessions.push(session)
            }
          }
        }
      }
    } catch (err) {
      // Ignore scan errors
    }
  }

  // Also include archived sessions (marked as archived)
  const archivedDir = getArchivedDir()
  if (fs.existsSync(archivedDir)) {
    try {
      const files = fs.readdirSync(archivedDir).filter(f => f.endsWith('.jsonl'))
      for (const file of files) {
        const sessionId = file.replace('.jsonl', '')
        const filePath = path.join(archivedDir, file)
        const session = parseSessionFile(sessionId, filePath)
        if (session) {
          session.archived = true
          sessions.push(session)
        }
      }
    } catch { /* ignore */ }
  }

  return sessions.sort((a, b) => b.timestamp - a.timestamp)
}

// ── Session Loading ──────────────────────────────────

/**
 * Load the full message history of a session.
 */
export function loadSession(sessionId: string): CodexSessionMessage[] {
  // Check sessions directory first, then archived
  const candidates = [
    path.join(getSessionsDir(), `${sessionId}.jsonl`),
    path.join(getSessionsDir(), sessionId, `${sessionId}.jsonl`),
    path.join(getArchivedDir(), `${sessionId}.jsonl`),
  ]

  // Also try finding in subdirectories
  const sessionsDir = getSessionsDir()
  if (fs.existsSync(sessionsDir)) {
    try {
      const dirs = fs.readdirSync(sessionsDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
      for (const dir of dirs) {
        candidates.push(path.join(sessionsDir, dir.name, `${sessionId}.jsonl`))
      }
    } catch { /* ignore */ }
  }

  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      return parseSessionMessages(filePath)
    }
  }

  return []
}

// ── Session Deletion ─────────────────────────────────

/**
 * Delete a session file.
 */
export function deleteSession(sessionId: string): boolean {
  const candidates = [
    path.join(getSessionsDir(), `${sessionId}.jsonl`),
    path.join(getSessionsDir(), sessionId),
    path.join(getArchivedDir(), `${sessionId}.jsonl`),
  ]

  let deleted = false
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const stat = fs.statSync(p)
        if (stat.isDirectory()) {
          fs.rmSync(p, { recursive: true, force: true })
        } else {
          fs.unlinkSync(p)
        }
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

function parseSessionFile(sessionId: string, filePath: string): CodexSessionListItem | null {
  try {
    const messages = parseSessionMessages(filePath)
    if (messages.length === 0) return null

    const firstUserMsg = messages.find(m => m.role === 'user' || m.type === 'userMessage')
    const lastPrompt = firstUserMsg
      ? String(firstUserMsg.content || '').slice(0, 100)
      : ''

    const firstTimestamp = messages[0]?.timestamp || fs.statSync(filePath).mtimeMs

    return {
      sessionId,
      lastPrompt,
      timestamp: firstTimestamp,
      project: '',
      projectSlug: '',
      messageCount: messages.length,
      firstTimestamp,
    }
  } catch {
    return null
  }
}

function parseSessionMessages(filePath: string): CodexSessionMessage[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return content
      .split('\n')
      .filter(l => l.trim())
      .map(line => {
        try { return JSON.parse(line) as CodexSessionMessage } catch { return null }
      })
      .filter((m): m is CodexSessionMessage => m !== null)
  } catch {
    return []
  }
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
