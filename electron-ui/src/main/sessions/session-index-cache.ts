/**
 * Persistent summary cache for Claude Code transcripts.
 *
 * Building the session list means reading and JSON-parsing every `.jsonl`
 * transcript under `~/.claude/projects`. On a machine with a few thousand
 * sessions that is ~1.5 s of synchronous I/O in the main process, and the
 * renderer re-lists after naming a session, after each turn, and when the
 * sidebar refreshes. The in-memory cache alone cannot help the first list of a
 * new process, so the derived summaries are persisted to `~/.aipa/cache/`.
 *
 * Entries are validated by (mtimeMs, size) — the standard make-style check —
 * so only transcripts that changed since the last run are re-parsed. The file
 * is a cache: a missing, corrupt or future-versioned file is simply ignored,
 * and writing it is best-effort.
 */
import fs from 'fs'
import path from 'path'
import os from 'os'

export interface CachedSessionSummary {
  mtimeMs: number
  size: number
  sessionId: string
  lastPrompt: string
  timestamp: number
  firstTimestamp?: number
  title?: string
  messageCount: number
  projectSlug: string
}

// Bump whenever the meaning of a cached field changes. v2 stores cleaned
// prompts and a derived title; v1 rows would keep showing slash commands even
// though their transcripts never changed again.
const CACHE_VERSION = 2
const CACHE_DIR = path.join(os.homedir(), '.aipa', 'cache')
const CACHE_PATH = path.join(CACHE_DIR, 'claude-sessions.json')

/** Hard cap so a runaway corpus cannot turn the cache into a startup cost. */
const MAX_ENTRIES = 20000
const SAVE_DEBOUNCE_MS = 1500

let entries: Map<string, CachedSessionSummary> | null = null
let dirty = false
let saveTimer: NodeJS.Timeout | null = null

function load(): Map<string, CachedSessionSummary> {
  if (entries) return entries
  entries = new Map()
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8')) as {
      version?: number
      entries?: Record<string, CachedSessionSummary>
    }
    if (raw?.version !== CACHE_VERSION || !raw.entries || typeof raw.entries !== 'object') {
      return entries
    }
    for (const [filePath, entry] of Object.entries(raw.entries)) {
      if (!entry || typeof entry !== 'object') continue
      if (typeof entry.mtimeMs !== 'number' || typeof entry.size !== 'number') continue
      if (typeof entry.sessionId !== 'string' || typeof entry.timestamp !== 'number') continue
      entries.set(filePath, entry)
    }
  } catch {
    // First run, unreadable, or corrupt — start empty and rebuild below.
  }
  return entries
}

/** Drop duplicate transcript paths (same session in two project dirs keeps the first). */
function enforceCap(): void {
  if (!entries || entries.size <= MAX_ENTRIES) return
  // Map preserves insertion order; the oldest-loaded entries are the stalest.
  const excess = entries.size - MAX_ENTRIES
  let removed = 0
  for (const key of entries.keys()) {
    if (removed >= excess) break
    entries.delete(key)
    removed++
  }
  dirty = true
}

/** Cached summary for `filePath`, or undefined when the file changed or is unknown. */
export function getCachedSummary(
  filePath: string,
  mtimeMs: number,
  size: number,
): CachedSessionSummary | undefined {
  const entry = load().get(filePath)
  if (!entry) return undefined
  if (entry.mtimeMs !== mtimeMs || entry.size !== size) return undefined
  return entry
}

export function setCachedSummary(filePath: string, summary: CachedSessionSummary): void {
  load().set(filePath, summary)
  dirty = true
  scheduleSave()
}

export function dropCachedSummary(filePath: string): void {
  if (load().delete(filePath)) {
    dirty = true
    scheduleSave()
  }
}

/** Remove entries whose transcripts no longer exist on disk. */
export function pruneCachedSummaries(liveFiles: Set<string>): void {
  const map = load()
  if (map.size <= liveFiles.size) return
  for (const filePath of map.keys()) {
    if (!liveFiles.has(filePath)) {
      map.delete(filePath)
      dirty = true
    }
  }
  if (dirty) scheduleSave()
}

function scheduleSave(): void {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    saveNow()
  }, SAVE_DEBOUNCE_MS)
  // Never keep the process alive just to flush a cache.
  if (typeof saveTimer.unref === 'function') saveTimer.unref()
}

/** Flush immediately (used on quit and by tests). Best-effort. */
export function saveNow(): void {
  if (!dirty || !entries) return
  dirty = false
  try {
    enforceCap()
    fs.mkdirSync(CACHE_DIR, { recursive: true })
    const payload = {
      version: CACHE_VERSION,
      entries: Object.fromEntries(entries),
    }
    const tmp = `${CACHE_PATH}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(payload), 'utf-8')
    fs.renameSync(tmp, CACHE_PATH)
  } catch {
    // A cache that cannot be written is only a performance regression.
    dirty = true
  }
}

/** Test hook: forget everything held in memory. */
export function resetCacheForTests(): void {
  entries = null
  dirty = false
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
}