/**
 * Honest per-conversation spend, accumulated from the engine's own turn events.
 *
 * A session id is the only key. The same ids the chat/task surfaces already use
 * (the Codex thread id, or the Claude session id) are the ids the bridge wiring
 * reports on `result`, so a task's `sessions[]` refs can be looked up directly.
 *
 * What is summed and what is replaced:
 *   - `outputTokens` is added once per completed turn. The engine reports a
 *     turn's usage, not a session total, so summing is the only honest reading.
 *   - `costUsd` is added only for turns the engine prices (`totalCostUsd`). A
 *     turn whose price is absent leaves the field untouched rather than adding
 *     zero: unknown spend is not free spend.
 *   - `inputTokens` / `cacheReadTokens` are the *latest* reading, not sums.
 *     They describe the context the next request will carry (and what was read
 *     from cache for it); adding them across turns would count the same context
 *     again every turn.
 *   - `turns` counts the turns that actually ended with a result. A turn that
 *     dies without one spent tokens nobody can price; it is omitted, not
 *     guessed at.
 *
 * Failure discipline mirrors the task store: a missing or corrupt file is an
 * empty ledger (the damaged copy is kept for inspection), a malformed row is
 * dropped on its own, and a failed write is logged and never allowed to fail
 * the turn that triggered it. Nothing here leaves the machine.
 */
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { createLogger } from '../utils/logger'

const log = createLogger('usage-store')

export const USAGE_STORE_VERSION = 1

/**
 * The ledger is a long-lived report, not a history. Two thousand conversations
 * is far more than the sidebar or a task will ever reference, and the cap keeps
 * one turn's write bounded; the oldest rows are evicted first.
 */
export const MAX_USAGE_SESSIONS = 2000

/** A single IPC call may ask about at most this many ids. */
export const MAX_USAGE_QUERY_SESSIONS = 200

export interface UsageEntry {
  sessionId: string
  /** Latest context reading; not a sum across turns. */
  inputTokens: number
  /** Sum of completed turns' output tokens. */
  outputTokens: number
  /** Latest context reading from the prompt cache; absent until reported. */
  cacheReadTokens?: number
  /** Sum of the turns the engine priced; absent when no turn was priced. */
  costUsd?: number
  turns: number
  firstAt: number
  updatedAt: number
}

export interface UsageStore {
  entries: UsageEntry[]
}

export interface TurnUsageInput {
  /** A turn's output tokens, when the engine reported a reading. */
  outputTokens?: unknown
  /** The latest context reading; replaces the stored one. */
  inputTokens?: unknown
  /** The latest cache-read reading; replaces the stored one. */
  cacheReadTokens?: unknown
  /** `totalCostUsd` for this turn, when the engine priced it. */
  costUsd?: unknown
}

function getStorePath(): string {
  return path.join(app.getPath('userData'), 'usage.json')
}

function finiteNonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function normalizeEntry(raw: unknown): UsageEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const sessionId = typeof row.sessionId === 'string' ? row.sessionId.trim() : ''
  if (!sessionId || sessionId.length > 200) return null

  const inputTokens = finiteNonNegative(row.inputTokens)
  const outputTokens = finiteNonNegative(row.outputTokens)
  const turns = finiteNonNegative(row.turns)
  const firstAt = finiteNonNegative(row.firstAt)
  const updatedAt = finiteNonNegative(row.updatedAt)
  if (inputTokens === null || outputTokens === null || turns === null) return null
  if (firstAt === null || firstAt <= 0 || updatedAt === null || updatedAt <= 0) return null

  const cacheReadTokens = finiteNonNegative(row.cacheReadTokens)
  const costUsd = finiteNonNegative(row.costUsd)

  return {
    sessionId,
    inputTokens: Math.round(inputTokens),
    outputTokens: Math.round(outputTokens),
    ...(cacheReadTokens !== null ? { cacheReadTokens: Math.round(cacheReadTokens) } : {}),
    ...(costUsd !== null ? { costUsd } : {}),
    turns: Math.trunc(turns),
    firstAt,
    updatedAt,
  }
}

/** Newest first, at most the cap; the only order the ledger ever needs. */
function capEntries(entries: UsageEntry[]): UsageEntry[] {
  if (entries.length <= MAX_USAGE_SESSIONS) return entries
  return entries
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_USAGE_SESSIONS)
}

/**
 * Read the ledger. A missing file is empty; a corrupt file is preserved beside
 * the original and treated as empty. Never throws — a task page must open even
 * when its usage file was damaged by a disk or a hand edit.
 */
export function readUsageStore(file: string = getStorePath()): UsageStore {
  if (!fs.existsSync(file)) return { entries: [] }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>
    const list = Array.isArray(parsed.entries) ? parsed.entries : []
    const seen = new Set<string>()
    const entries: UsageEntry[] = []
    for (const row of list) {
      const entry = normalizeEntry(row)
      if (!entry || seen.has(entry.sessionId)) continue
      seen.add(entry.sessionId)
      entries.push(entry)
    }
    if (entries.length !== list.length) {
      log.warn(`usage.json: dropped ${list.length - entries.length} malformed or duplicate row(s)`)
    }
    return { entries: capEntries(entries) }
  } catch (err) {
    log.warn('Could not read usage.json:', err)
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      fs.copyFileSync(file, `${file}.corrupt-${stamp}`)
    } catch { /* best effort */ }
    return { entries: [] }
  }
}

/** Atomic write; false on failure. Callers must treat that as "not recorded". */
export function writeUsageStore(store: UsageStore, file: string = getStorePath()): boolean {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify({
      version: USAGE_STORE_VERSION,
      entries: capEntries(store.entries),
    }, null, 2), 'utf-8')
    fs.renameSync(tmp, file)
    return true
  } catch (err) {
    log.warn('Could not write usage.json:', err)
    return false
  }
}

/**
 * Record one turn that ended with a result: add its output tokens (and its
 * price, when the engine gave one), replace the context readings with the
 * latest, and increment the turn count. A failed write is logged, never thrown:
 * a bookkeeping problem must not turn a finished turn into a failed one.
 */
export function noteCompletedTurn(
  sessionId: unknown,
  input: TurnUsageInput,
  file: string = getStorePath(),
): void {
  const id = typeof sessionId === 'string' ? sessionId.trim() : ''
  if (!id || id.length > 200) return

  try {
    const store = readUsageStore(file)
    const index = store.entries.findIndex(entry => entry.sessionId === id)
    const now = Date.now()
    const previous = index >= 0 ? store.entries[index] : null

    const outputTokens = finiteNonNegative(input.outputTokens)
    const inputTokens = finiteNonNegative(input.inputTokens)
    const cacheReadTokens = finiteNonNegative(input.cacheReadTokens)
    const costUsd = finiteNonNegative(input.costUsd)

    const next: UsageEntry = {
      sessionId: id,
      inputTokens: inputTokens !== null ? Math.round(inputTokens) : (previous?.inputTokens ?? 0),
      outputTokens: (previous?.outputTokens ?? 0) + (outputTokens !== null ? Math.round(outputTokens) : 0),
      ...(cacheReadTokens !== null
        ? { cacheReadTokens: Math.round(cacheReadTokens) }
        : previous?.cacheReadTokens !== undefined ? { cacheReadTokens: previous.cacheReadTokens } : {}),
      // An unpriced turn contributes nothing; a priced one adds to whatever was
      // already known. The absence of the field means "no priced turn yet".
      ...(costUsd !== null
        ? { costUsd: (previous?.costUsd ?? 0) + costUsd }
        : previous?.costUsd !== undefined ? { costUsd: previous.costUsd } : {}),
      turns: (previous?.turns ?? 0) + 1,
      firstAt: previous?.firstAt ?? now,
      updatedAt: now,
    }

    if (index >= 0) store.entries[index] = next
    else store.entries.push(next)
    writeUsageStore(store, file)
  } catch (err) {
    // The ledger is reporting, never a dependency of the turn itself.
    log.warn(`Could not record usage for session ${id}:`, String(err))
  }
}

/**
 * Look up the ledger for a set of session ids.
 *
 * The renderer is the untrusted side: a non-array is an empty answer, non-string
 * and empty ids are ignored, duplicates collapse, and the query is bounded so a
 * compromised renderer cannot ask the main process to walk an unbounded list.
 * Entries come back in request order; a missing id is simply absent (unknown,
 * not zero).
 */
export function getUsageForSessions(sessionIds: unknown, file: string = getStorePath()): UsageEntry[] {
  if (!Array.isArray(sessionIds)) return []
  const wanted: string[] = []
  const seen = new Set<string>()
  for (const value of sessionIds) {
    if (typeof value !== 'string') continue
    const id = value.trim()
    if (!id || id.length > 200 || seen.has(id)) continue
    seen.add(id)
    wanted.push(id)
    if (wanted.length >= MAX_USAGE_QUERY_SESSIONS) break
  }
  if (wanted.length === 0) return []

  const byId = new Map(readUsageStore(file).entries.map(entry => [entry.sessionId, entry]))
  const found: UsageEntry[] = []
  for (const id of wanted) {
    const entry = byId.get(id)
    if (entry) found.push(entry)
  }
  return found
}
