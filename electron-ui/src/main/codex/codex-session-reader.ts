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
import { cleanPrompt, deriveTitle, isSyntheticPrompt } from '../sessions/prompt-text'
import {
  buildSnippet,
  contentContainsQuery,
  mergeAdjacentSegments,
  searchOriginAllowed,
  searchSegmentsFromBlocks,
} from '../sessions/search-types'
import {
  MAX_FALLBACK_READS,
  MAX_FILE_CHARS,
  SessionSearchIndex,
  appendSearchRecord,
  createSearchRecordState,
  mapWithConcurrency,
  readJsonlLines,
} from '../sessions/search-index'
import type { SearchIndexDoc, SearchIndexFile, SearchIndexRecord, SearchIndexStats } from '../sessions/search-index'
import type { SearchResult, SearchScanFilter } from '../sessions/search-types'

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

/** One composer image that still lives on disk, mirrored to the renderer. */
interface StoredImageAttachment {
  name: string
  path: string
  size: number
  mimeType: string
}

/** Claude-shaped entry understood by renderer parseSessionMessages(). */
interface NormalizedEntry {
  type: 'user' | 'assistant'
  message: { role: 'user' | 'assistant'; content: unknown }
  timestamp?: string
  /** Codex records the localImage paths it was given; carry them through. */
  attachments?: StoredImageAttachment[]
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
 * The index preview is written by the CLI and can be a slash command or an
 * attachment marker. Keep it only when a human wrote it.
 */
function meaningfulPreview(raw: string | undefined): string {
  if (!raw || isSyntheticPrompt(raw)) return ''
  return cleanPrompt(raw)
}

/**
 * Does this id name a Codex thread? Rename must know before it spawns an
 * app-server: a Claude session id is also a UUID, and asking Codex about it
 * costs a process plus a "thread not found" round trip.
 */
export function isCodexSession(sessionId: string): boolean {
  if (!isValidSessionId(sessionId)) return false
  if (findSessionFile(sessionId)) return true
  return readSessionIndex().some(entry => sessionIndexId(entry) === sessionId)
}

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
      existing.lastPrompt = meaningfulPreview(entry.preview) || existing.lastPrompt
      existing.timestamp = Math.max(existing.timestamp, updated)
      existing.cwd = cwd || undefined
      existing.project = cwd || extractProjectName(cwd)
      existing.projectSlug = cwd ? pathToSlug(cwd) : slugify(extractProjectName(cwd))
      existing.messageCount = existing.messageCount ?? entry.messageCount
    } else {
      const preview = meaningfulPreview(entry.preview)
      byId.set(threadId, {
        sessionId: threadId,
        lastPrompt: preview || meaningfulPreview(name),
        timestamp: updated || Date.now(),
        project: cwd || extractProjectName(cwd),
        projectSlug: cwd ? pathToSlug(cwd) : slugify(extractProjectName(cwd)),
        cwd: cwd || undefined,
        // An index name is a user-set title and always wins; otherwise the
        // first preview line names the session.
        title: name || deriveTitle(preview) || undefined,
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

/** The roots as an array, for callers that guard more than one path at a time. */
export function codexSessionRoots(): string[] {
  return [getSessionsDir(), getArchivedDir()]
}

function isInsideRoots(roots: string[], target: string): boolean {
  return roots.some(root => isPathInside(root, target))
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
  return findSessionFileInRoots(sessionId, codexSessionRoots())
}

/**
 * The same probe over caller-chosen roots. The trash module needs to look in
 * an arbitrary directory tree (its harness) and to prove that everything it
 * found is inside the roots it was given.
 */
function findSessionFileInRoots(sessionId: string, roots: string[]): string | null {
  const [sessionsRoot, archivedRoot = sessionsRoot] = roots
  const direct = [
    path.join(sessionsRoot, `${sessionId}.jsonl`),
    path.join(sessionsRoot, sessionId, `${sessionId}.jsonl`),
    path.join(archivedRoot, `${sessionId}.jsonl`),
  ]
  for (const filePath of direct) {
    if (isInsideRoots(roots, filePath) && fs.existsSync(filePath)) return filePath
  }

  const all = [
    ...collectRolloutFiles(sessionsRoot),
    ...collectRolloutFiles(archivedRoot),
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
 * Every path that belongs to one thread, for a delete that must be complete.
 *
 * Older Codex kept a folder per thread (`sessions/<id>/`), which the old
 * delete removed whole; the trash takes that folder rather than lifting the
 * JSONL out of it, so nothing of the session is left behind. The rollout file
 * found by the reader is added for the current date-sharded layout.
 */
export function findSessionPaths(sessionId: string, roots: string[] = codexSessionRoots()): string[] {
  if (!isValidSessionId(sessionId)) return []
  const [sessionsRoot, archivedRoot = sessionsRoot] = roots
  const found: string[] = []
  for (const candidate of [
    path.join(sessionsRoot, sessionId),
    path.join(sessionsRoot, `${sessionId}.jsonl`),
    path.join(archivedRoot, `${sessionId}.jsonl`),
  ]) {
    if (isInsideRoots(roots, candidate) && fs.existsSync(candidate)) found.push(candidate)
  }
  const rollout = findSessionFileInRoots(sessionId, roots)
  if (rollout) found.push(rollout)
  return found
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
 * Forget the cached list row of a transcript. A restored file keeps the mtime
 * and size the cache keyed on, so without this the row would stay missing (or
 * stale) until the file changed again.
 */
export function forgetSessionCache(filePath: string): void {
  summaryCache.delete(filePath)
}

// ── Session Search ───────────────────────────────────

/**
 * call id → timestamp of the assistant entry that issued it.
 *
 * A rollout records a tool's output on its own `function_call_output` line,
 * which `normalizeRollout` turns into a separate `user` entry holding only
 * `tool_result` blocks. The renderer merges that output into the assistant
 * message's tool card and never shows the user entry, so a hit there has to
 * carry the issuing message's timestamp or the reveal jump lands on a row that
 * does not exist. Mapping by `tool_use_id` is exact; nothing is inferred from
 * file offsets or adjacency.
 */
function toolOwnerTimestamps(entries: NormalizedEntry[]): Map<string, number> {
  const owners = new Map<string, number>()
  for (const entry of entries) {
    if (entry.type !== 'assistant' || !Array.isArray(entry.message.content)) continue
    const parsed = entry.timestamp ? Date.parse(entry.timestamp) : 0
    const ts = Number.isNaN(parsed) ? 0 : parsed
    for (const block of entry.message.content) {
      if (!block || typeof block !== 'object') continue
      const b = block as Record<string, unknown>
      if (b.type === 'tool_use' && typeof b.id === 'string') owners.set(b.id, ts)
    }
  }
  return owners
}

// ── Incremental search index ─────────────────────────
//
// The pre-index search read every candidate rollout per query, parsed it
// through `normalizeRollout` just to find the first prose hit, and only then
// answered. `SessionSearchIndex` keeps the prose, the identity (session id,
// cwd, title) and the newest timestamp from that same normalization, keyed on
// (mtimeMs, size); see ../sessions/search-index.ts for freshness and budget
// rules. Uncached or truncated files still take the old disk path.

/**
 * Extract the searchable text of one rollout. `maxChars` is the index's store
 * cap; excerpt extraction passes Infinity to see a long rollout's newest lines.
 * Exported for the search harness: the index is otherwise only reachable
 * through a full corpus sync.
 */
export async function extractCodexSearchDoc(
  file: SearchIndexFile,
  maxChars = MAX_FILE_CHARS,
): Promise<SearchIndexDoc> {
  const lines: RolloutLine[] = []
  for await (const line of readJsonlLines(file.filePath)) {
    if (!line.trim()) continue
    try {
      lines.push(JSON.parse(line) as RolloutLine)
    } catch {
      // One malformed line must not hide the rest of the rollout.
    }
  }

  const fallback = new Date(file.mtimeMs).toISOString()
  const summary = summarizeRollout(file.filePath, file, lines)
  const sessionId = summary?.sessionId || file.sessionId || path.basename(file.filePath, '.jsonl')

  const records: SearchIndexRecord[] = []
  const state = createSearchRecordState()
  let newest = summary?.timestamp ?? file.mtimeMs
  const entries = normalizeRollout(lines, fallback)
  const toolOwners = toolOwnerTimestamps(entries)
  for (let group = 0; group < entries.length; group++) {
    const entry = entries[group]
    const parsed = entry.timestamp ? Date.parse(entry.timestamp) : 0
    if (!Number.isNaN(parsed) && parsed > newest) newest = parsed
    if (state.partial) continue
    const role = entry.type === 'user' ? 'user' : entry.type === 'assistant' ? 'assistant' : null
    if (!role) continue
    // Not merged here: each block gets its own ceiling in appendSearchRecord,
    // and the record merge below joins the ones that share a message anyway.
    for (const segment of searchSegmentsFromBlocks(entry.message.content)) {
      const ownerTs = segment.toolUseId ? toolOwners.get(segment.toolUseId) : undefined
      appendSearchRecord(state, records, {
        ts: ownerTs ?? (Number.isNaN(parsed) ? 0 : parsed),
        role: ownerTs !== undefined ? 'assistant' : role,
        origin: segment.origin,
        text: segment.text,
        group,
      }, maxChars)
    }
  }

  return {
    filePath: file.filePath,
    sessionId,
    projectSlug: summary?.projectSlug ?? file.projectSlug,
    project: summary?.project,
    mtimeMs: file.mtimeMs,
    size: file.size,
    timestamp: newest,
    title: summary?.title,
    records,
    partial: state.partial,
    ...(state.truncated ? { truncated: true } : {}),
  }
}

const codexSearchIndex = new SessionSearchIndex('codex', extractCodexSearchDoc)

/** Test/debug hook: what the in-memory index currently holds. */
export function getSearchIndexStats(): SearchIndexStats {
  return codexSearchIndex.stats
}

/** Async rollout walk, so locating a transcript never blocks the main thread. */
async function collectRolloutFilesAsync(root: string): Promise<string[]> {
  const files: string[] = []
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > 8) return
    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) await walk(full, depth + 1)
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(full)
    }
  }
  await walk(root, 0)
  return files
}

/** Read only a rollout's session_meta line, without materialising the file. */
async function readSessionMetaIdAsync(filePath: string): Promise<string | null> {
  for await (const line of readJsonlLines(filePath)) {
    if (!line.trim()) continue
    try {
      const parsed = JSON.parse(line) as RolloutLine
      if (parsed.type !== 'session_meta') continue
      const payload = (parsed.payload ?? {}) as Record<string, unknown>
      return typeof payload.id === 'string' ? payload.id : null
    } catch { /* one malformed line must not hide the rest */ }
  }
  return null
}

/** `findSessionFile`, without the synchronous directory walk and file reads. */
async function findSessionFileAsync(sessionId: string): Promise<string | null> {
  const direct = [
    path.join(getSessionsDir(), `${sessionId}.jsonl`),
    path.join(getSessionsDir(), sessionId, `${sessionId}.jsonl`),
    path.join(getArchivedDir(), `${sessionId}.jsonl`),
  ]
  for (const filePath of direct) {
    if (!isSessionPathSafe(filePath)) continue
    try {
      await fs.promises.access(filePath)
      return filePath
    } catch { /* try the next candidate */ }
  }

  const all = [
    ...await collectRolloutFilesAsync(getSessionsDir()),
    ...await collectRolloutFilesAsync(getArchivedDir()),
  ]
  const byName = all.find(f => path.basename(f).includes(sessionId))
  if (byName) return byName
  for (const filePath of all) {
    if (await readSessionMetaIdAsync(filePath) === sessionId) return filePath
  }
  return null
}

/**
 * The user/assistant prose of one Codex rollout, for quoting evidence.
 *
 * The search that produced the hit has already synced the index, so the cached
 * document is preferred. A partial (prefix-only) or deferred document falls
 * back to the same streaming extractor with its store cap lifted. Never uses
 * the synchronous `loadSession`/`findSessionFile` path: eight multi-megabyte
 * rollouts parsed on the calling tick would freeze every other IPC.
 */
export async function readSessionProse(sessionId: string): Promise<SearchIndexRecord[]> {
  if (!isValidSessionId(sessionId)) return []

  // The index now also holds tool and thinking text; excerpt extraction quotes
  // the conversation, so it keeps receiving prose only, as before.
  const proseOnly = (records: SearchIndexRecord[]) => records.filter(r => r.origin === 'prose')

  const cached = codexSearchIndex.findBySessionId(sessionId)
  if (cached && !cached.deferred && !cached.partial) return proseOnly(cached.records)

  let filePath = cached?.filePath ?? null
  if (filePath && !isSessionPathSafe(filePath)) filePath = null
  if (!filePath) filePath = await findSessionFileAsync(sessionId)
  if (!filePath || !isSessionPathSafe(filePath)) return []

  let stat: fs.Stats
  try {
    stat = await fs.promises.stat(filePath)
  } catch {
    return []
  }

  const doc = await extractCodexSearchDoc({
    filePath,
    sessionId,
    projectSlug: cached?.projectSlug ?? '',
    mtimeMs: stat.mtimeMs,
    size: stat.size,
  }, Number.POSITIVE_INFINITY)
  return proseOnly(doc.records)
}

async function collectCodexSearchFiles(): Promise<SearchIndexFile[]> {
  const paths: string[] = []
  for (const root of [getSessionsDir(), getArchivedDir()]) {
    for (const filePath of collectRolloutFiles(root)) {
      if (isSessionPathSafe(filePath)) paths.push(filePath)
    }
  }

  const files = await mapWithConcurrency(paths, 32, async filePath => {
    try {
      const stat = await fs.promises.stat(filePath)
      return {
        filePath,
        sessionId: uuidFromRolloutName(filePath) ?? '',
        projectSlug: '',
        mtimeMs: stat.mtimeMs,
        size: stat.size,
      }
    } catch {
      return null // vanished mid-walk
    }
  })
  return files.filter((file): file is SearchIndexFile => file !== null)
}

interface CodexFileMatch {
  snippet: string
  timestamp: number
  role: 'user' | 'assistant'
  origin: 'prose' | 'tool' | 'thinking'
  truncated: boolean
}

/** First hit in a cached document, in normalized file order. */
function matchCodexDoc(
  doc: SearchIndexDoc,
  query: string,
  lowerQuery: string,
  filter: SearchScanFilter | null = null,
): CodexFileMatch | null {
  for (const record of doc.records) {
    if (!searchOriginAllowed(filter, record.origin)) continue
    if (!record.text.toLowerCase().includes(lowerQuery)) continue
    const snippet = buildSnippet(record.text, query)
    if (!snippet) break
    return {
      snippet,
      timestamp: record.ts,
      role: record.role,
      origin: record.origin,
      truncated: record.truncated === true,
    }
  }
  return null
}

/**
 * The pre-index single-file scan, kept verbatim for files that are not in the
 * index. It returns a complete SearchResult so a hit always carries evidence.
 */
async function searchCodexFileOnDisk(
  file: SearchIndexFile,
  query: string,
  lowerQuery: string,
  indexTitles: Map<string, string>,
  isCurrent: () => boolean,
  filter: SearchScanFilter | null = null,
): Promise<SearchResult | null> {
  let content: string
  try {
    content = await fs.promises.readFile(file.filePath, 'utf-8')
  } catch {
    return null
  }
  if (!isCurrent()) return null
  if (!contentContainsQuery(content, query, lowerQuery)) return null

  const lines = parseJsonLines(content)
  const fallback = new Date(file.mtimeMs).toISOString()
  const summary = summarizeRollout(file.filePath, file, lines)
  if (!summary) return null
  summaryCache.set(file.filePath, { mtimeMs: file.mtimeMs, size: file.size, item: summary })

  let match: CodexFileMatch | null = null
  let newest = summary.timestamp
  const entries = normalizeRollout(lines, fallback)
  const toolOwners = toolOwnerTimestamps(entries)
  for (const entry of entries) {
    const parsed = entry.timestamp ? Date.parse(entry.timestamp) : 0
    if (!Number.isNaN(parsed) && parsed > newest) newest = parsed
    if (match) continue
    const role = entry.type === 'user' ? 'user' : entry.type === 'assistant' ? 'assistant' : null
    if (!role) continue
    // Uncapped: this scan exists to find what the index's per-block ceiling
    // left out.
    for (const segment of mergeAdjacentSegments(searchSegmentsFromBlocks(entry.message.content))) {
      // The filter runs inside the scan so a limit counts the caller's kind of
      // hit, not the first hits in file order.
      if (!searchOriginAllowed(filter, segment.origin)) continue
      const snippet = buildSnippet(segment.text, query)
      if (!snippet) continue
      const ownerTs = segment.toolUseId ? toolOwners.get(segment.toolUseId) : undefined
      match = {
        snippet,
        timestamp: ownerTs ?? (Number.isNaN(parsed) ? 0 : parsed),
        role: ownerTs !== undefined ? 'assistant' : role,
        origin: segment.origin,
        truncated: false,
      }
      break
    }
  }

  const title = indexTitles.get(summary.sessionId) || summary.title
  // A title has no origin, so an origin narrowing excludes it (see the cached
  // path above).
  const titleMatched = filter?.origins === undefined || filter?.origins === null
    ? !!title && title.toLowerCase().includes(lowerQuery)
    : false
  if (!match && !titleMatched) return null

  return {
    sessionId: summary.sessionId,
    title,
    project: summary.project,
    matchType: match ? 'content' : 'title',
    snippet: match ? match.snippet : title || '',
    timestamp: newest || summary.timestamp || file.mtimeMs,
    engine: 'codex',
    ...(match && match.timestamp > 0
      ? { messageTimestamp: match.timestamp, messageRole: match.role }
      : {}),
    ...(match ? { matchOrigin: match.origin } : {}),
    ...(match && match.truncated ? { truncated: true } : {}),
  }
}

let codexSearchEpoch = 0

/**
 * Cross-session content search over Codex rollout files.
 *
 * The corpus walk and stat stay on disk (rollouts live in date-sharded
 * directories, so there is no index to rely on), but the match itself is an
 * in-memory scan over the incremental index. A user-set index title is read at
 * query time so a rename is visible immediately. Uncached files fall back to
 * `searchCodexFileOnDisk`, which is the previous implementation unchanged.
 */
export async function searchSessions(
  query: string,
  limit = 20,
  filter: SearchScanFilter | null = null,
): Promise<SearchResult[]> {
  if (!query || query.length < 2) return []

  const epoch = ++codexSearchEpoch
  const isCurrent = () => epoch === codexSearchEpoch
  const lowerQuery = query.toLowerCase()

  const files = await collectCodexSearchFiles()
  if (!isCurrent()) return []
  files.sort((a, b) => b.mtimeMs - a.mtimeMs)

  // The rollout file's derived title loses to a user-set index name, exactly as
  // it does in the sidebar. Read per query: a rename does not touch the rollout.
  const indexTitles = new Map<string, string>()
  for (const entry of readSessionIndex()) {
    const name = entry.thread_name || entry.name
    if (name) indexTitles.set(sessionIndexId(entry), name)
  }

  const candidates = await codexSearchIndex.sync(files)
  if (!isCurrent()) return []

  const results: SearchResult[] = []
  let fallbackBudget = MAX_FALLBACK_READS

  for (const candidate of candidates) {
    if (!isCurrent() || results.length >= limit) break
    const doc = candidate.doc

    // The allowlist is checked against the id the row will report. A rollout
    // whose filename carries no uuid is only known after it is parsed, so it is
    // read and then dropped if its own id is out of scope.
    const candidateId = doc ? doc.sessionId : candidate.sessionId
    if (filter?.sessionIds && candidateId && !filter.sessionIds.has(candidateId)) continue

    if (!doc) {
      // Only an evicted document is read from disk. A pending one belongs to a
      // build still in flight; the query answers with the partial index.
      if (candidate.state !== 'deferred' || fallbackBudget <= 0) continue
      fallbackBudget--
      const result = await searchCodexFileOnDisk(candidate, query, lowerQuery, indexTitles, isCurrent, filter)
      if (!isCurrent()) return []
      if (result && (!filter?.sessionIds || filter.sessionIds.has(result.sessionId))) results.push(result)
      continue
    }

    let match = matchCodexDoc(doc, query, lowerQuery, filter)

    // A truncated document may hold the match past its stored prefix — a huge
    // tool output is cut at the ceiling, and the file cap stops earlier still;
    // let the disk path answer with the full result (evidence included). It is
    // authoritative for this file either way, so do not scan the prefix again.
    if (!match && (doc.partial || doc.truncated === true) && fallbackBudget > 0) {
      fallbackBudget--
      const result = await searchCodexFileOnDisk(candidate, query, lowerQuery, indexTitles, isCurrent, filter)
      if (!isCurrent()) return []
      if (result && (!filter?.sessionIds || filter.sessionIds.has(result.sessionId))) results.push(result)
      continue
    }

    const title = indexTitles.get(doc.sessionId) || doc.title
    // A title has no origin; an origin narrowing cannot include it.
    const titleMatched = filter?.origins === undefined || filter?.origins === null
      ? !!title && title.toLowerCase().includes(lowerQuery)
      : false
    if (!match && !titleMatched) continue

    // The old scan only read a file after its raw bytes passed the content
    // prefilter, so a title-only hit required the query to appear somewhere in
    // the rollout. Preserve that (it also keeps result sets identical); a
    // content hit never needs the check because the index covers all prose.
    if (!match && fallbackBudget > 0) {
      fallbackBudget--
      let content: string | null = null
      try {
        content = await fs.promises.readFile(candidate.filePath, 'utf-8')
      } catch { /* vanished; treat as no hit */ }
      if (!isCurrent()) return []
      if (!content || !contentContainsQuery(content, query, lowerQuery)) continue
    }

    results.push({
      sessionId: doc.sessionId,
      title,
      project: doc.project ?? '',
      matchType: match ? 'content' : 'title',
      snippet: match ? match.snippet : title || '',
      timestamp: doc.timestamp || candidate.mtimeMs,
      engine: 'codex',
      ...(match && match.timestamp > 0
        ? { messageTimestamp: match.timestamp, messageRole: match.role }
        : {}),
      ...(match ? { matchOrigin: match.origin } : {}),
      ...(match && match.truncated ? { truncated: true } : {}),
    })
  }

  if (!isCurrent()) return []
  return results.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit)
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

function parseJsonLines(content: string): RolloutLine[] {
  return content
    .split('\n')
    .filter(l => l.trim())
    .map(line => {
      try { return JSON.parse(line) as RolloutLine } catch { return null }
    })
    .filter((line): line is RolloutLine => line !== null)
}

function readJsonLines(filePath: string): RolloutLine[] {
  try {
    return parseJsonLines(fs.readFileSync(filePath, 'utf-8'))
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

/** The human part of a user message, or '' when the entry is harness noise. */
function meaningfulUserText(raw: string): string {
  if (!raw || isSyntheticUserText(raw) || isSyntheticPrompt(raw)) return ''
  return cleanPrompt(raw)
}

/**
 * Derive the list row from already-parsed rollout lines. Split out of
 * `parseSessionFile` so the content search can summarise a file it has
 * already read instead of reading it a second time.
 */
function summarizeRollout(
  filePath: string,
  stat: { mtimeMs: number },
  lines: RolloutLine[],
): CodexSessionListItem | null {
  if (lines.length === 0) return null
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
      const text = meaningfulUserText(extractContentText(payload.content))
      if (text && !firstPrompt) firstPrompt = text
    } else if (line.type === 'event_msg') {
      const type = payload.type
      if (type !== 'user_message' && type !== 'agent_message') continue
      eventMessages++
      if (type !== 'user_message') continue
      const text = meaningfulUserText(String(payload.message ?? ''))
      if (text && !firstPrompt) firstPrompt = text
    } else if (line.type === 'user' || line.type === 'assistant') {
      // forkSession output (already Claude-shaped)
      const message = line.message as Record<string, unknown> | undefined
      if (!message) continue
      responseMessages++
      if (line.type !== 'user') continue
      const text = meaningfulUserText(extractContentText(message.content))
      if (!text || text === userText) continue
      userText = text
      if (!firstPrompt) firstPrompt = text
    }
  }

  const firstTimestamp = firstTs ? Date.parse(firstTs) : stat.mtimeMs
  return {
    sessionId,
    lastPrompt: firstPrompt.slice(0, 100),
    title: firstPrompt ? deriveTitle(firstPrompt) : undefined,
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
    item = summarizeRollout(filePath, stat, readJsonLines(filePath))
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

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

/** `file:///C:/…` (Windows) and `file:///home/…` both map back to a real path. */
function fileUrlToPath(url: string): string | null {
  if (!url.startsWith('file://')) return null
  let decoded = url.slice('file://'.length)
  try { decoded = decodeURIComponent(decoded) } catch { /* keep the raw form */ }
  if (/^\/[A-Za-z]:/.test(decoded)) decoded = decoded.slice(1)
  return decoded.replace(/\//g, path.sep)
}

function attachmentForPath(imagePath: string): StoredImageAttachment {
  let size = 0
  try { size = fs.statSync(imagePath).size } catch { /* missing file: shown as a placeholder */ }
  const ext = path.extname(imagePath).slice(1).toLowerCase()
  return {
    name: path.basename(imagePath),
    path: imagePath,
    size,
    mimeType: IMAGE_MIME_BY_EXT[ext] || 'application/octet-stream',
  }
}

/**
 * Extract on-disk image references a Codex rollout recorded for a user turn.
 * Base64 `input_image` parts are deliberately ignored: the transcript must not
 * carry base64, and a data URL is not a file the thumbnail can reopen.
 */
function attachmentsFromContent(content: unknown): StoredImageAttachment[] {
  if (!Array.isArray(content)) return []
  const out: StoredImageAttachment[] = []
  const seen = new Set<string>()
  for (const part of content) {
    if (!part || typeof part !== 'object') continue
    const record = part as Record<string, unknown>
    let imagePath: string | null = null
    if (record.type === 'local_image' && typeof record.path === 'string') {
      imagePath = record.path
    } else if (record.type === 'input_image' && typeof record.image_url === 'string') {
      imagePath = fileUrlToPath(record.image_url)
    }
    if (!imagePath || seen.has(imagePath)) continue
    seen.add(imagePath)
    out.push(attachmentForPath(imagePath))
  }
  return out
}

function attachmentsFromLocalImages(value: unknown): StoredImageAttachment[] {
  if (!Array.isArray(value)) return []
  const out: StoredImageAttachment[] = []
  const seen = new Set<string>()
  for (const item of value) {
    const imagePath = typeof item === 'string'
      ? item
      : (item && typeof item === 'object' ? (item as Record<string, unknown>).path : null)
    if (typeof imagePath !== 'string' || !imagePath || seen.has(imagePath)) continue
    seen.add(imagePath)
    out.push(attachmentForPath(imagePath))
  }
  return out
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

  const pushUserText = (text: string, timestamp?: string, attachments: StoredImageAttachment[] = []) => {
    if (!text.trim()) return
    if (text === lastUserText) {
      // The same turn can appear twice (response_item and event_msg); keep the
      // row but merge in images only the second copy recorded.
      if (attachments.length > 0) {
        const last = result[result.length - 1]
        if (last?.type === 'user') {
          const existing = (last.attachments as StoredImageAttachment[] | undefined) ?? []
          const seen = new Set(existing.map(a => a.path))
          const merged = [...existing]
          for (const attachment of attachments) {
            if (seen.has(attachment.path)) continue
            seen.add(attachment.path)
            merged.push(attachment)
          }
          last.attachments = merged
        }
      }
      return
    }
    lastUserText = text
    lastAssistantText = null
    lastThinking = null
    flush()
    result.push({
      type: 'user',
      message: { role: 'user', content: text },
      timestamp: timestamp ?? fallback,
      ...(attachments.length > 0 ? { attachments } : {}),
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
          if (role === 'user' && !isSyntheticUserText(text)) {
            pushUserText(text, timestamp, attachmentsFromContent(payload.content))
          } else if (role === 'assistant') pushAssistantText(text, timestamp)
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
          pushUserText(
            String(payload.message ?? ''),
            timestamp,
            attachmentsFromLocalImages(payload.local_images),
          )
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
 * Encode a directory path the way Claude names its project folders — every
 * non-alphanumeric character becomes a hyphen, so "D:\projects\AIPA" →
 * "D--projects-AIPA" and "C:\x\.aipa\plugin-data" → "C--x--aipa-plugin-data".
 * Mirrors `dirToSlug` in the renderer and `cwdToProjectSlug` in promptMemory;
 * the three must stay in step, since a mismatch silently empties every roster
 * whenever a path contains a dot, space or underscore.
 */
function pathToSlug(dir: string): string {
  return dir.replace(/[^a-zA-Z0-9]/g, '-')
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
