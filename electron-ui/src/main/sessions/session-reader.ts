import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawn } from 'child_process'
import { TextDecoder } from 'util'
import { isPathInside, isValidSessionId } from '../utils/validate'
import {
  dropCachedSummary,
  getCachedSummary,
  pruneCachedSummaries,
  setCachedSummary,
} from './session-index-cache'
import { cleanPrompt, deriveTitle, isSyntheticPrompt } from './prompt-text'
import { buildSnippet, contentContainsQuery, textFromBlocks } from './search-types'
import {
  MAX_FALLBACK_READS,
  MAX_FILE_CHARS,
  SessionSearchIndex,
  mapWithConcurrency,
  readJsonlLines,
} from './search-index'
import type { SearchIndexDoc, SearchIndexFile, SearchIndexRecord, SearchIndexStats } from './search-index'
import type { SearchResult } from './search-types'

export type { SearchResult } from './search-types'

const CLAUDE_DIR = path.join(os.homedir(), '.claude')
const SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json')
const HISTORY_PATH = path.join(CLAUDE_DIR, 'history.jsonl')
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects')

export interface ClaudeSettings {
  apiKeyHelper?: string
  model?: string
  [key: string]: unknown
}

export interface SessionListItem {
  sessionId: string
  lastPrompt: string
  timestamp: number
  project: string
  projectSlug: string
  /** Unused for Claude sessions (their project dir name IS the slug), kept for a shared shape. */
  cwd?: string
  title?: string
  messageCount?: number
  firstTimestamp?: number
}

export interface SessionMessage {
  type: string
  role?: string
  content?: unknown
  message?: unknown
  timestamp?: number
  [key: string]: unknown
}

export function readSettings(): ClaudeSettings {
  try {
    if (!fs.existsSync(SETTINGS_PATH)) return {}
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8')
    return JSON.parse(raw) as ClaudeSettings
  } catch {
    return {}
  }
}

export function writeSettings(patch: Partial<ClaudeSettings>): void {
  const current = readSettings()
  const merged = { ...current, ...patch }
  if (!fs.existsSync(CLAUDE_DIR)) fs.mkdirSync(CLAUDE_DIR, { recursive: true })
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(merged, null, 2), 'utf-8')
}

// ── Session list cache ──
//
// Building the list means reading (and JSON-parsing) every line of every
// transcript, and the renderer re-lists after each turn (auto-title, sidebar
// refresh). Two layers: an in-process map, and a persisted summary index so a
// fresh app launch does not re-scan the whole corpus (see session-index-cache).
// A summary is keyed on (mtimeMs, size) — the make-style staleness check. The
// in-memory layer must carry the same key: the active session's transcript
// grows after every turn, and a values-only map would freeze its title,
// timestamp and message count for the rest of the process.
const sessionSummaryCache = new Map<string, {
  mtimeMs: number
  size: number
  item: SessionListItem
}>()

function statOf(filePath: string): { mtimeMs: number; size: number } | null {
  try {
    const st = fs.statSync(filePath)
    return { mtimeMs: st.mtimeMs, size: st.size }
  } catch {
    return null
  }
}

/** Summary for one Claude transcript, or null when it has no usable timestamp. */
function summarizeSessionFile(filePath: string, sessionId: string, projectSlug: string): SessionListItem | null {
  const stat = statOf(filePath)
  if (!stat) return null

  const memoryHit = sessionSummaryCache.get(filePath)
  if (memoryHit && memoryHit.mtimeMs === stat.mtimeMs && memoryHit.size === stat.size) {
    // Copy: the renderer decorates rows and the cached copy must stay pristine.
    return { ...memoryHit.item }
  }

  const project = decodeProjectSlug(projectSlug)
  const persisted = getCachedSummary(filePath, stat.mtimeMs, stat.size)
  if (persisted && persisted.sessionId === sessionId && persisted.projectSlug === projectSlug) {
    const item: SessionListItem = {
      sessionId: persisted.sessionId,
      lastPrompt: persisted.lastPrompt,
      timestamp: persisted.timestamp,
      project,
      projectSlug: persisted.projectSlug,
      title: persisted.title,
      messageCount: persisted.messageCount,
      firstTimestamp: persisted.firstTimestamp,
    }
    sessionSummaryCache.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, item })
    return { ...item }
  }

  let lastPrompt = ''
  // The first message a human actually wrote — the fallback title when the
  // transcript carries no explicit session-title entry.
  let firstMeaningfulPrompt = ''
  let timestamp = 0
  let firstTimestamp = Infinity
  let title: string | undefined
  let messageCount = 0

  try {
    // Stream the file in chunks instead of readFileSync + split: a transcript
    // can be tens of megabytes, and the decoded string is the peak cost.
    for (const line of iterateLines(filePath, stat.size)) {
      if (!line) continue
      let entry: Record<string, unknown>
      try {
        entry = JSON.parse(line) as Record<string, unknown>
      } catch {
        continue
      }
      const ts = entry.timestamp
      if (ts) {
        const t = new Date(ts as string).getTime()
        if (t > timestamp) timestamp = t
        if (t < firstTimestamp) firstTimestamp = t
      }
      if (entry.type === 'last-prompt' && entry.prompt) {
        const cleaned = cleanPrompt(String(entry.prompt))
        if (cleaned && !isSyntheticPrompt(String(entry.prompt))) lastPrompt = cleaned.slice(0, 120)
      }
      if (entry.type === 'user' && (entry.message as { content?: unknown } | undefined)?.content) {
        const content = (entry.message as { content: unknown }).content
        let raw = ''
        if (typeof content === 'string') raw = content
        else if (Array.isArray(content)) {
          const textPart = content.find((c: Record<string, unknown>) => c.type === 'text') as { text?: unknown } | undefined
          if (textPart?.text) raw = String(textPart.text)
        }
        // Slash commands, shell echoes and image placeholders are user entries
        // too, but they are not something the user said in their own words.
        if (raw && !isSyntheticPrompt(raw)) {
          const cleaned = cleanPrompt(raw)
          if (cleaned) {
            lastPrompt = cleaned.slice(0, 120)
            if (!firstMeaningfulPrompt) firstMeaningfulPrompt = cleaned
          }
        }
      }
      if (entry.type === 'session-title' && entry.title) {
        title = String(entry.title)
      }
      if (entry.type === 'user' || entry.type === 'assistant') {
        messageCount++
      }
    }
  } catch {
    return null
  }

  if (timestamp <= 0) return null

  // An explicit title always wins; otherwise the first human message names the
  // session. Using the *first* message keeps a passing `/clear` in the middle
  // of a conversation from renaming the whole session.
  if (!title && firstMeaningfulPrompt) title = deriveTitle(firstMeaningfulPrompt)

  const item: SessionListItem = {
    sessionId,
    lastPrompt,
    timestamp,
    project,
    projectSlug,
    title,
    messageCount,
    firstTimestamp: firstTimestamp < Infinity ? firstTimestamp : undefined,
  }
  sessionSummaryCache.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, item })
  setCachedSummary(filePath, {
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    sessionId,
    lastPrompt: item.lastPrompt,
    timestamp: item.timestamp,
    firstTimestamp: item.firstTimestamp,
    title: item.title,
    messageCount: messageCount,
    projectSlug,
  })
  return { ...item }
}

/**
 * Yield the lines of a JSONL file.
 *
 * Reading the file whole and splitting once is roughly 30% faster than
 * streaming it in chunks here — a transcript is dominated by a handful of
 * very large lines, so chunking just adds a string concat and a decode per
 * chunk without shortening the longest line. Whole-file is therefore the
 * normal path; chunking is kept only as a memory guard for pathological
 * transcripts (a 500 MB file must not become a 1 GB string in the main
 * process).
 */
const READ_CHUNK_BYTES = 256 * 1024
const WHOLE_FILE_MAX_BYTES = 32 * 1024 * 1024

function* iterateLines(filePath: string, size: number): Generator<string> {
  if (size <= WHOLE_FILE_MAX_BYTES) {
    yield* fs.readFileSync(filePath, 'utf-8').split('\n')
    return
  }

  const fd = fs.openSync(filePath, 'r')
  const buf = Buffer.allocUnsafe(READ_CHUNK_BYTES)
  let carry = ''
  try {
    for (;;) {
      const read = fs.readSync(fd, buf, 0, READ_CHUNK_BYTES, null)
      if (read === 0) break
      const text = carry + buf.toString('utf-8', 0, read)
      const lines = text.split('\n')
      carry = lines.pop() ?? ''
      yield* lines
      // A single malformed/huge line must not grow `carry` without bound.
      if (carry.length > 4 * READ_CHUNK_BYTES) {
        yield carry
        carry = ''
      }
    }
    if (carry) yield carry
  } finally {
    fs.closeSync(fd)
  }
}

export function listSessions(): SessionListItem[] {
  const sessions: SessionListItem[] = []

  if (!fs.existsSync(PROJECTS_DIR)) return sessions
  const liveFiles = new Set<string>()

  try {
    const projectDirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())

    for (const dir of projectDirs) {
      const projectSlug = dir.name
      const dirPath = path.join(PROJECTS_DIR, projectSlug)

      try {
        const files = fs.readdirSync(dirPath)
          .filter(f => f.endsWith('.jsonl'))

        for (const file of files) {
          const sessionId = file.replace('.jsonl', '')
          const filePath = path.join(dirPath, file)
          if (!isValidSessionId(sessionId) || !isPathInside(PROJECTS_DIR, filePath)) continue
          liveFiles.add(filePath)
          const item = summarizeSessionFile(filePath, sessionId, projectSlug)
          if (item) sessions.push(item)
        }
      } catch {}
    }
  } catch {}

  pruneCachedSummaries(liveFiles)
  // Do NOT flush here: serializing a few thousand summaries is ~400 ms, and
  // the index cache's debounced writer persists it right after this call
  // returns (plus a forced flush on quit). Blocking the list on it turns the
  // cold launch path into the slowest thing the app does.
  return sessions.sort((a, b) => b.timestamp - a.timestamp)
}

export function loadSession(sessionId: string): SessionMessage[] {
  if (!isValidSessionId(sessionId)) return []
  if (!fs.existsSync(PROJECTS_DIR)) return []

  const projectDirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())

  for (const dir of projectDirs) {
    const filePath = path.join(PROJECTS_DIR, dir.name, `${sessionId}.jsonl`)
    if (isPathInside(PROJECTS_DIR, filePath) && fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8')
        .split('\n')
        .filter(l => l.trim())
        .map(l => { try { return JSON.parse(l) as SessionMessage } catch { return null } })
        .filter(Boolean) as SessionMessage[]
    }
  }
  return []
}

export function deleteSession(sessionId: string): boolean {
  if (!isValidSessionId(sessionId)) return false

  const projectDirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())

  for (const dir of projectDirs) {
    const filePath = path.join(PROJECTS_DIR, dir.name, `${sessionId}.jsonl`)
    if (isPathInside(PROJECTS_DIR, filePath) && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      sessionSummaryCache.delete(filePath)
      dropCachedSummary(filePath)
      return true
    }
  }
  return false
}

function decodeProjectSlug(slug: string): string {
  // Claude stores project paths as slug by replacing / and \ with -
  // Try to reverse it to a readable path
  try {
    return slug.replace(/-/g, path.sep)
  } catch {
    return slug
  }
}

export function forkSession(sessionId: string, upToMessageIndex: number): string | null {
  if (!isValidSessionId(sessionId)) return null
  if (!fs.existsSync(PROJECTS_DIR)) return null

  const projectDirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())

  for (const dir of projectDirs) {
    const filePath = path.join(PROJECTS_DIR, dir.name, `${sessionId}.jsonl`)
    if (isPathInside(PROJECTS_DIR, filePath) && fs.existsSync(filePath)) {
      const lines = fs.readFileSync(filePath, 'utf-8')
        .split('\n')
        .filter(l => l.trim())
      const truncated = lines.slice(0, upToMessageIndex + 1)
      const newSessionId = `fork-${Date.now()}`
      const newFilePath = path.join(PROJECTS_DIR, dir.name, `${newSessionId}.jsonl`)
      fs.writeFileSync(newFilePath, truncated.join('\n') + '\n', 'utf-8')
      return newSessionId
    }
  }
  return null
}

export function renameSession(sessionId: string, title: string): boolean {
  if (!isValidSessionId(sessionId)) return false
  if (!fs.existsSync(PROJECTS_DIR)) return false

  const projectDirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())

  for (const dir of projectDirs) {
    const filePath = path.join(PROJECTS_DIR, dir.name, `${sessionId}.jsonl`)
    if (isPathInside(PROJECTS_DIR, filePath) && fs.existsSync(filePath)) {
      const titleEntry = JSON.stringify({ type: 'session-title', title, timestamp: new Date().toISOString() })
      fs.appendFileSync(filePath, titleEntry + '\n', 'utf-8')
      return true
    }
  }
  return false
}

/**
 * Detect turn interruption in a session's JSONL file.
 * Inspired by Claude Code's utils/conversationRecovery.ts detectTurnInterruption().
 *
 * Returns:
 * - 'none'                 — session completed normally
 * - 'interrupted_prompt'   — user sent a message but AI never responded
 * - 'interrupted_turn'     — AI was mid-response when the session ended
 */
export type TurnInterruptionResult = 'none' | 'interrupted_prompt' | 'interrupted_turn'

export function detectTurnInterruption(sessionId: string): TurnInterruptionResult {
  if (!isValidSessionId(sessionId)) return 'none'
  if (!fs.existsSync(PROJECTS_DIR)) return 'none'

  const projectDirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())

  for (const dir of projectDirs) {
    const filePath = path.join(PROJECTS_DIR, dir.name, `${sessionId}.jsonl`)
    if (!isPathInside(PROJECTS_DIR, filePath) || !fs.existsSync(filePath)) continue

    const lines = fs.readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter(l => l.trim())
      .map(l => { try { return JSON.parse(l) } catch { return null } })
      .filter(Boolean)

    if (lines.length === 0) return 'none'

    // Walk backward from end to find the last meaningful event
    let lastUserIdx = -1
    let lastAssistantIdx = -1
    let lastResultIdx = -1

    for (let i = lines.length - 1; i >= 0; i--) {
      const entry = lines[i] as Record<string, unknown>
      if (lastUserIdx < 0 && entry.type === 'user') lastUserIdx = i
      if (lastAssistantIdx < 0 && (entry.type === 'assistant' || entry.role === 'assistant')) lastAssistantIdx = i
      if (lastResultIdx < 0 && entry.type === 'result') lastResultIdx = i
      if (lastUserIdx >= 0 && lastAssistantIdx >= 0 && lastResultIdx >= 0) break
    }

    // If we have a result event, the session completed normally
    if (lastResultIdx >= 0 && lastResultIdx > lastUserIdx) return 'none'

    // User sent message but no assistant response followed
    if (lastUserIdx >= 0 && lastAssistantIdx < lastUserIdx) return 'interrupted_prompt'

    // Assistant was responding but no result event after the last assistant message
    if (lastAssistantIdx >= 0 && lastResultIdx < lastAssistantIdx) return 'interrupted_turn'

    return 'none'
  }

  return 'none'
}

// MCP server reads/writes used to live here; they are now engine-routed so the
// same UI can serve ~/.claude/settings.json or ~/.codex/config.toml.
// See src/main/config/mcp-config.ts.

export function generateSessionTitle(description: string, cliPath: string): Promise<string> {
  return new Promise((resolve) => {
    const nodePath = process.env.CLAUDE_NODE_PATH || 'node'
    const proc = spawn(nodePath, [
      cliPath,
      'generate-session-title',
      '--description', description.slice(0, 200),
    ], { stdio: ['ignore', 'pipe', 'ignore'] })

    let output = ''
    proc.stdout.on('data', (d: Buffer) => { output += d.toString() })
    proc.on('close', () => {
      try {
        const parsed = JSON.parse(output.trim())
        resolve(parsed.title || parsed.result || output.trim().slice(0, 80))
      } catch {
        resolve(output.trim().slice(0, 80) || description.slice(0, 40))
      }
    })
    // Timeout after 8 seconds
    setTimeout(() => { try { proc.kill() } catch {} resolve(description.slice(0, 40)) }, 8000)
  })
}

/**
 * Generate a prompt suggestion (predict what the user will type next)
 * using a lightweight CLI call with --print mode.
 * Context: last few user/assistant message pairs for prediction.
 */
export function generatePromptSuggestion(context: string, cliPath: string): Promise<string> {
  return new Promise((resolve) => {
    const nodePath = process.env.CLAUDE_NODE_PATH || 'node'
    const systemPrompt = 'You are a prompt predictor. Given the conversation context, predict what the user would naturally type next as their follow-up message. Output ONLY the predicted prompt text (2-12 words). Match the user\'s language and style. No quotes, no explanation.'
    const proc = spawn(nodePath, [
      cliPath,
      '--print',
      '--output-format', 'text',
      '--max-turns', '1',
      '--append-system-prompt', systemPrompt,
      '-p', `Conversation context:\n${context}\n\nPredict the user's next message (2-12 words):`,
    ], { stdio: ['ignore', 'pipe', 'ignore'] })

    let output = ''
    proc.stdout.on('data', (d: Buffer) => { output += d.toString() })
    proc.on('close', () => {
      const suggestion = output.trim().replace(/^["']|["']$/g, '').trim()
      resolve(suggestion.length > 0 && suggestion.length <= 120 ? suggestion : '')
    })
    // Timeout after 10 seconds
    setTimeout(() => { try { proc.kill() } catch {} resolve('') }, 10000)
  })
}

/**
 * Generate an "away summary" — a short 1-3 sentence recap of the conversation
 * context for the "while you were away" dialog. Uses a lightweight CLI call.
 */
export function generateAwaySummary(context: string, cliPath: string): Promise<string> {
  return new Promise((resolve) => {
    const nodePath = process.env.CLAUDE_NODE_PATH || 'node'
    const systemPrompt = 'You are a session recap assistant. The user stepped away and is coming back. Write exactly 1-3 short sentences. Start by stating the high-level task — what they are building or debugging, not implementation details. Next: the concrete next step. Skip status reports and commit recaps. Match the user\'s language.'
    const proc = spawn(nodePath, [
      cliPath,
      '--print',
      '--output-format', 'text',
      '--max-turns', '1',
      '--append-system-prompt', systemPrompt,
      '-p', `Conversation context:\n${context}\n\nWrite a 1-3 sentence recap of where we left off:`,
    ], { stdio: ['ignore', 'pipe', 'ignore'] })

    let output = ''
    proc.stdout.on('data', (d: Buffer) => { output += d.toString() })
    proc.on('close', () => {
      const summary = output.trim()
      resolve(summary.length > 0 && summary.length <= 500 ? summary : '')
    })
    // Timeout after 10 seconds
    setTimeout(() => { try { proc.kill() } catch {} resolve('') }, 10000)
  })
}

/**
 * Stream a file looking for the query without materialising it.
 *
 * A single project can hold a hundreds-of-megabytes transcript; `readFile`
 * on it would allocate a string larger than several ordinary sessions and
 * stall the main process. Streaming keeps the miss path (the common one)
 * flat in memory, and lets a superseded search stop mid-file.
 */
async function fileContainsQuery(
  filePath: string,
  query: string,
  lowerQuery: string,
  isCurrent: () => boolean,
): Promise<boolean> {
  const decoder = new TextDecoder('utf-8')
  let handle: Awaited<ReturnType<typeof fs.promises.open>> | undefined
  try {
    handle = await fs.promises.open(filePath, 'r')
    const buffer = Buffer.allocUnsafe(64 * 1024)
    let carry = ''
    for (;;) {
      if (!isCurrent()) return false
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null)
      if (bytesRead === 0) break
      const chunk = carry + decoder.decode(buffer.subarray(0, bytesRead), { stream: true })
      if (contentContainsQuery(chunk, query, lowerQuery)) return true
      // A multi-byte character may straddle the boundary; the decoder holds
      // it, but a query could still span chunks, so keep the tail.
      carry = chunk.slice(-Math.max(0, query.length - 1))
    }
    return false
  } catch {
    return false
  } finally {
    if (handle) await handle.close().catch(() => { /* already gone */ })
  }
}

interface ClaudeFileHit {
  title?: string
  timestamp: number
  matchType: 'title' | 'content'
  snippet: string
  messageTimestamp?: number
  messageRole?: 'user' | 'assistant'
}

function scanClaudeFile(content: string, query: string, lowerQuery: string): ClaudeFileHit | null {
  let title: string | undefined
  let timestamp = 0
  let match: { snippet: string; messageTimestamp: number; messageRole: 'user' | 'assistant' } | null = null

  for (const line of content.split('\n')) {
    if (!line || line.charCodeAt(0) !== 123 /* '{' */) continue
    try {
      const entry = JSON.parse(line) as Record<string, unknown>

      if (typeof entry.timestamp === 'string') {
        const t = new Date(entry.timestamp).getTime()
        if (!Number.isNaN(t) && t > timestamp) timestamp = t
      }

      if (entry.type === 'session-title' && entry.title) {
        title = String(entry.title)
      }

      if (!match && (entry.type === 'user' || entry.type === 'assistant')) {
        const message = entry.message as Record<string, unknown> | undefined
        const text = textFromBlocks(message?.content)
        if (text.toLowerCase().includes(lowerQuery)) {
          const matchedTs = typeof entry.timestamp === 'string'
            ? new Date(entry.timestamp).getTime()
            : 0
          match = {
            snippet: buildSnippet(text, query),
            messageTimestamp: Number.isNaN(matchedTs) ? 0 : matchedTs,
            messageRole: entry.type === 'user' ? 'user' : 'assistant',
          }
        }
      }
    } catch { /* one malformed line must not hide the rest of the transcript */ }
  }

  if (match && match.snippet) {
    return {
      title,
      timestamp,
      matchType: 'content',
      snippet: match.snippet,
      messageTimestamp: match.messageTimestamp,
      messageRole: match.messageRole,
    }
  }
  if (title && title.toLowerCase().includes(lowerQuery)) {
    return { title, timestamp, matchType: 'title', snippet: title }
  }
  return null
}

// ── Incremental search index ──
//
// Search used to stream every transcript per query (~2.5-3 s here for 1.3 GB,
// 4240 files) even though the searchable prose is only ~5.6 MB: tool results
// and snapshots are the bulk of a transcript. `SessionSearchIndex` keeps that
// prose in memory, keyed on (mtimeMs, size); see ./search-index.ts for the
// freshness and eviction rules. Files the index cannot hold fall back to the
// pre-index disk scan below, so results always carry evidence fields.

interface ClaudeSearchFile extends SearchIndexFile {}

/**
 * Extract the searchable prose of one Claude transcript.
 *
 * `maxChars` is the store cap (the index keeps only the file's prefix to stay
 * within budget). Excerpt extraction passes Infinity so a session quoted from
 * a long transcript still exposes its newest matching line.
 */
async function extractClaudeSearchDoc(
  file: SearchIndexFile,
  maxChars = MAX_FILE_CHARS,
): Promise<SearchIndexDoc> {
  let title: string | undefined
  let timestamp = 0
  let chars = 0
  let partial = false
  const records: SearchIndexRecord[] = []

  for await (const line of readJsonlLines(file.filePath)) {
    if (!line || line.charCodeAt(0) !== 123) continue
    let entry: Record<string, unknown>
    try {
      entry = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }

    // The session's own recency is the newest timestamp of any entry — title
    // rows included — so it is tracked even for rows search never matches.
    if (typeof entry.timestamp === 'string') {
      const t = new Date(entry.timestamp).getTime()
      if (!Number.isNaN(t) && t > timestamp) timestamp = t
    }

    if (entry.type === 'session-title' && entry.title) {
      title = String(entry.title)
    }

    if (entry.type !== 'user' && entry.type !== 'assistant') continue
    const message = entry.message as Record<string, unknown> | undefined
    const text = textFromBlocks(message?.content)
    if (!text || partial) continue

    if (chars + text.length > maxChars) {
      // Keep the metadata pass running (title and timestamp still matter), but
      // stop growing the buffer; a miss in the prefix is verified on disk.
      partial = true
      continue
    }

    const rawTs = typeof entry.timestamp === 'string' ? new Date(entry.timestamp).getTime() : 0
    records.push({
      ts: Number.isNaN(rawTs) ? 0 : rawTs,
      role: entry.type === 'user' ? 'user' : 'assistant',
      text,
    })
    chars += text.length
  }

  return {
    filePath: file.filePath,
    sessionId: file.sessionId,
    projectSlug: file.projectSlug,
    mtimeMs: file.mtimeMs,
    size: file.size,
    timestamp,
    title,
    records,
    partial,
  }
}

const claudeSearchIndex = new SessionSearchIndex('claude', extractClaudeSearchDoc)

/** Test/debug hook: what the in-memory index currently holds. */
export function getSearchIndexStats(): SearchIndexStats {
  return claudeSearchIndex.stats
}

/** Locate a transcript's file without the synchronous directory walk. */
async function findClaudeSearchFile(sessionId: string): Promise<ClaudeSearchFile | null> {
  let projectDirs: fs.Dirent[]
  try {
    projectDirs = await fs.promises.readdir(PROJECTS_DIR, { withFileTypes: true })
  } catch {
    return null
  }

  for (const dir of projectDirs) {
    if (!dir.isDirectory()) continue
    const dirPath = path.join(PROJECTS_DIR, dir.name)
    if (!isPathInside(PROJECTS_DIR, dirPath)) continue
    const filePath = path.join(dirPath, `${sessionId}.jsonl`)
    if (!isPathInside(PROJECTS_DIR, filePath)) continue
    try {
      const stat = await fs.promises.stat(filePath)
      if (!stat.isFile()) continue
      return {
        filePath,
        sessionId,
        projectSlug: dir.name,
        mtimeMs: stat.mtimeMs,
        size: stat.size,
      }
    } catch { /* this project does not hold the session */ }
  }
  return null
}

/**
 * The user/assistant prose of one Claude session, for quoting evidence.
 *
 * Async on purpose. The sync `loadSession` reads and JSON-parses the entire
 * transcript on the calling tick, and excerpt extraction runs for up to eight
 * multi-megabyte files in a row — that froze every other IPC while the ask was
 * being prepared. Prefer the search index the preceding query just synced;
 * fall back to the same streaming extractor with its store cap lifted, so a
 * partial (prefix-only) index document still yields the newest lines.
 */
export async function readSessionProse(sessionId: string): Promise<SearchIndexRecord[]> {
  if (!isValidSessionId(sessionId)) return []

  const cached = claudeSearchIndex.findBySessionId(sessionId)
  if (cached && !cached.deferred && !cached.partial) return cached.records

  // Even a deferred document knows its path; only a not-yet-extracted session
  // needs the directory walk.
  let file: ClaudeSearchFile | null = cached && isPathInside(PROJECTS_DIR, cached.filePath)
    ? {
        filePath: cached.filePath,
        sessionId,
        projectSlug: cached.projectSlug,
        mtimeMs: cached.mtimeMs,
        size: cached.size,
      }
    : await findClaudeSearchFile(sessionId)
  if (!file) return []

  const doc = await extractClaudeSearchDoc(file, Number.POSITIVE_INFINITY)
  return doc.records
}

/** Match a cached document, mirroring `scanClaudeFile`'s first-match semantics. */
function matchClaudeDoc(doc: SearchIndexDoc, query: string, lowerQuery: string): ClaudeFileHit | null {
  for (const record of doc.records) {
    if (!record.text.toLowerCase().includes(lowerQuery)) continue
    const snippet = buildSnippet(record.text, query)
    if (!snippet) break
    return {
      title: doc.title,
      timestamp: doc.timestamp,
      matchType: 'content',
      snippet,
      messageTimestamp: record.ts,
      messageRole: record.role,
    }
  }
  if (doc.title && doc.title.toLowerCase().includes(lowerQuery)) {
    return { title: doc.title, timestamp: doc.timestamp, matchType: 'title', snippet: doc.title }
  }
  return null
}

/** Old disk path, kept for files the index could not hold or only partly holds. */
async function searchClaudeFileOnDisk(
  file: ClaudeSearchFile,
  query: string,
  lowerQuery: string,
  isCurrent: () => boolean,
): Promise<ClaudeFileHit | null> {
  if (!(await fileContainsQuery(file.filePath, query, lowerQuery, isCurrent))) return null
  if (!isCurrent()) return null
  let content: string
  try {
    content = await fs.promises.readFile(file.filePath, 'utf-8')
  } catch {
    return null
  }
  if (!isCurrent()) return null
  return scanClaudeFile(content, query, lowerQuery)
}

function toClaudeResult(file: ClaudeSearchFile, hit: ClaudeFileHit): SearchResult {
  return {
    sessionId: file.sessionId,
    title: hit.title,
    project: decodeProjectSlug(file.projectSlug),
    matchType: hit.matchType,
    snippet: hit.snippet,
    timestamp: hit.timestamp || Date.now(),
    engine: 'claude',
    ...(hit.matchType === 'content' && hit.messageTimestamp
      ? { messageTimestamp: hit.messageTimestamp, messageRole: hit.messageRole }
      : {}),
  }
}

/**
 * Async walk plus concurrent stats so freshness checking does not block the
 * event loop. The stats are what make the index correct; doing them serially
 * costs ~200 ms on 4000 transcripts, concurrent ~30 ms.
 */
async function collectClaudeSearchFiles(): Promise<ClaudeSearchFile[]> {
  const entries: Array<Omit<ClaudeSearchFile, 'mtimeMs' | 'size'>> = []
  let projectDirs: fs.Dirent[]
  try {
    projectDirs = await fs.promises.readdir(PROJECTS_DIR, { withFileTypes: true })
  } catch {
    return []
  }

  for (const dir of projectDirs) {
    if (!dir.isDirectory()) continue
    const dirPath = path.join(PROJECTS_DIR, dir.name)
    // One containment check per project directory: `dir.name` comes from
    // readdir and cannot contain a separator, so every path below it is inside.
    if (dir.name !== path.basename(dirPath) || !isPathInside(PROJECTS_DIR, dirPath)) continue
    let names: string[]
    try {
      names = await fs.promises.readdir(dirPath)
    } catch {
      continue
    }
    for (const name of names) {
      if (!name.endsWith('.jsonl')) continue
      const sessionId = name.slice(0, -'.jsonl'.length)
      if (!isValidSessionId(sessionId)) continue
      entries.push({ filePath: path.join(dirPath, name), sessionId, projectSlug: dir.name })
    }
  }

  const stats = await mapWithConcurrency(entries, 32, async entry => {
    try {
      const stat = await fs.promises.stat(entry.filePath)
      return { ...entry, mtimeMs: stat.mtimeMs, size: stat.size }
    } catch {
      return null // vanished between readdir and stat
    }
  })
  return stats.filter((file): file is ClaudeSearchFile => file !== null)
}

// Newest-first file order makes a scan stop as soon as the result limit is
// reached; without it a common query would produce every hit in the corpus to
// render 30 rows. The counter lets a newer keystroke cancel a query in flight.
let claudeSearchEpoch = 0

/**
 * Cross-session content search over Claude transcripts.
 *
 * Asynchronous on purpose: the IPC handler is the only caller and a synchronous
 * scan of the corpus would freeze the window. The corpus walk and stat are
 * async, and the match itself is an in-memory scan over the incremental index.
 * Files not indexed (cold start, budget eviction, truncated prefix) are read
 * with the previous streaming/parse path so their evidence fields stay intact.
 */
export async function searchSessions(query: string, limit = 30): Promise<SearchResult[]> {
  if (!query || query.length < 2 || !fs.existsSync(PROJECTS_DIR)) return []

  const epoch = ++claudeSearchEpoch
  const isCurrent = () => epoch === claudeSearchEpoch
  const lowerQuery = query.toLowerCase()

  const files = await collectClaudeSearchFiles()
  if (!isCurrent()) return []
  files.sort((a, b) => b.mtimeMs - a.mtimeMs)

  const candidates = await claudeSearchIndex.sync(files)
  if (!isCurrent()) return []

  const results: SearchResult[] = []
  let fallbackBudget = MAX_FALLBACK_READS

  for (const candidate of candidates) {
    if (!isCurrent() || results.length >= limit) break

    let hit = candidate.doc ? matchClaudeDoc(candidate.doc, query, lowerQuery) : null

    // A partial document may hold the match past its stored prefix. A deferred
    // document was evicted for budget and was never in memory. Either way the
    // disk path answers with the same evidence the old implementation produced.
    // A `pending` document is being extracted by a running build: the query
    // answers with what is indexed so far instead of reading it now.
    const needsDisk = candidate.doc
      ? candidate.doc.partial && hit?.matchType !== 'content'
      : candidate.state === 'deferred'
    if (needsDisk && fallbackBudget > 0) {
      fallbackBudget--
      const diskHit = await searchClaudeFileOnDisk(candidate, query, lowerQuery, isCurrent)
      if (!isCurrent()) return []
      hit = diskHit ?? hit
    }
    if (!hit) continue
    results.push(toClaudeResult(candidate, hit))
  }

  if (!isCurrent()) return []
  return results.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit)
}

/**
 * Returns the mtime (ms since epoch) of ~/.claude/<cwd-hash>/.consolidate-lock,
 * which the CLI updates whenever a dream (auto memory consolidation) completes.
 * Returns 0 if the file does not exist or cannot be read.
 *
 * The CLI uses the sanitised CWD as the project hash directory name,
 * so we iterate all project dirs and return the most-recently-modified lock.
 * Callers compare this value against the timestamp when a CLI session began
 * to detect whether a dream happened during the session.
 */
export function getDreamConsolidationMtime(): number {
  if (!fs.existsSync(PROJECTS_DIR)) return 0
  let latest = 0
  try {
    const projectDirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
    for (const dir of projectDirs) {
      const lockPath = path.join(PROJECTS_DIR, dir.name, '.consolidate-lock')
      try {
        const stat = fs.statSync(lockPath)
        if (stat.mtimeMs > latest) latest = stat.mtimeMs
      } catch { /* file absent */ }
    }
  } catch { /* projects dir unreadable */ }
  return latest
}

export function rewindSession(sessionId: string, beforeTimestamp: string, cliPath: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const nodePath = process.env.CLAUDE_NODE_PATH || 'node'
    if (!isValidSessionId(sessionId)) {
      resolve({ success: false, error: 'Invalid session id' })
      return
    }
    if (!fs.existsSync(PROJECTS_DIR)) {
      resolve({ success: false, error: 'Projects directory not found' })
      return
    }
    const projectDirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true }).filter(d => d.isDirectory())
    let sessionFound = false
    for (const dir of projectDirs) {
      const fp = path.join(PROJECTS_DIR, dir.name, `${sessionId}.jsonl`)
      if (isPathInside(PROJECTS_DIR, fp) && fs.existsSync(fp)) { sessionFound = true; break }
    }
    if (!sessionFound) {
      resolve({ success: false, error: `Session ${sessionId} not found` })
      return
    }

    const proc = spawn(nodePath, [
      cliPath,
      '--resume', sessionId,
      '--resume-session-at', beforeTimestamp,
      '--rewind-files',
      '--print',
      '--output-format', 'stream-json',
    ], { stdio: ['ignore', 'pipe', 'pipe'] })

    let stderr = ''
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })
    proc.on('close', (code) => {
      if (code === 0) resolve({ success: true })
      else resolve({ success: false, error: stderr.slice(0, 500) || `Exit code ${code}` })
    })
    setTimeout(() => { try { proc.kill() } catch {} resolve({ success: false, error: 'Timeout after 15s' }) }, 15000)
  })
}
