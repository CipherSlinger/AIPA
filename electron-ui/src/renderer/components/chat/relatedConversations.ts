/**
 * Pure helpers behind the chat header's "Related conversations" action.
 *
 * Two jobs, both React-free so the harness can exercise them directly:
 *
 *   1. turn the open conversation into the prose that is searched for —
 *      recent, human-readable turns only, capped so one long answer cannot
 *      crowd out the rest;
 *   2. read the IPC reply defensively. Main is trusted to be well-behaved, but
 *      this crossing is a process boundary: an older renderer, a failed
 *      handler or a hand-written invoke must degrade to an honest error state
 *      rather than crash a header button.
 *
 * The relation is lexical throughout: shared words, not shared meaning.
 */
import type { ChatMessage, StandardChatMessage } from '../../types/app.types'
import { isHumanTurn } from '../../lib/sessionReuse'

/** Total prose budget sent to the main process. */
export const RELATED_MAX_TEXT_CHARS = 6000
/** Per-message clip. One giant paste must not spend the whole budget. */
export const RELATED_MESSAGE_CHARS = 800
/** Most recent rows considered, across both roles. */
export const RELATED_MAX_MESSAGES = 14
/** Shared-word chips shown per row; main already caps this, we re-cap on read. */
const RELATED_MAX_TERMS = 3

export interface RelatedText {
  text: string
  /** How many transcript rows the text was built from. */
  messages: number
  /** True when a row was clipped or left out by the caps. */
  truncated: boolean
}

export interface RelatedRowView {
  sessionId: string
  title: string
  project: string
  engine: 'claude' | 'codex'
  timestamp: number
  matchType: 'title' | 'content'
  termsHit: number
  matchedTerms: string[]
}

export type RelatedView =
  | { state: 'ready'; rows: RelatedRowView[]; indexing: boolean }
  | { state: 'empty'; indexing: boolean }
  | { state: 'noTerms' }
  | { state: 'error' }

/** A string row's prose, or null when the row is not eligible at all. */
function proseRow(message: ChatMessage): { role: 'user' | 'assistant'; content: string } | null {
  if (message.role !== 'user' && message.role !== 'assistant') return null
  const standard = message as StandardChatMessage
  if (typeof standard.content !== 'string') return null
  // Notices and retrieved answers are renderer bookkeeping, not conversation:
  // searching them would surface "related" sessions that share hook noise.
  if (standard.hookNotice || standard.historyAsk) return null
  if (standard.isStreaming) return null
  const content = standard.content.trim()
  if (!content) return null
  return { role: message.role, content }
}

/**
 * Clip to `max` UTF-16 units without splitting a surrogate pair, ending in a
 * visible ellipsis. The returned length never exceeds `max`.
 */
export function clipRelatedProse(raw: string, max = RELATED_MESSAGE_CHARS): {
  text: string
  clipped: boolean
} {
  const text = raw.trim()
  if (text.length <= max) return { text, clipped: false }
  let cut = Math.max(0, max - 1)
  if (cut > 0) {
    const last = text.charCodeAt(cut - 1)
    if (last >= 0xd800 && last <= 0xdbff) cut -= 1
  }
  return { text: `${text.slice(0, cut).trimEnd()}…`, clipped: true }
}

/**
 * Build the prose searched for.
 *
 * User rows prefer real human turns. Transcripts also carry harness echoes —
 * "This session is being continued…", slash commands, image placeholders —
 * and searching those would return every session that ever resumed. If a
 * conversation has no human row at all (a command-only session, for example),
 * the latest user rows are used instead: a little noise beats a button that
 * always says "too little prose".
 *
 * Only the most recent `RELATED_MAX_MESSAGES` rows are considered, walking
 * backwards, so the text describes what the conversation is about now rather
 * than what it opened with. Rows are emitted oldest-first so the engine-side
 * term extraction sees normal reading order.
 */
export function buildRelatedText(messages: ChatMessage[]): RelatedText {
  const rows: Array<{ role: 'user' | 'assistant'; content: string }> = []
  const userRows: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const message of messages) {
    const row = proseRow(message)
    if (!row) continue
    rows.push(row)
    if (row.role === 'user') userRows.push(row)
  }

  const humanUserRows = userRows.filter(row => isHumanTurn(row.content))
  // Everything is noise: fall back to the user rows themselves rather than
  // searching nothing. The rows are still prose rows, never notices.
  const usableUserRows = humanUserRows.length > 0 ? humanUserRows : userRows
  const allowed = new Set(usableUserRows)
  const source = rows.filter(row => row.role === 'assistant' || allowed.has(row))

  const picked: string[] = []
  let used = 0
  let truncated = false
  for (let i = source.length - 1; i >= 0; i--) {
    if (picked.length >= RELATED_MAX_MESSAGES) {
      truncated = true
      break
    }
    const clipped = clipRelatedProse(source[i].content)
    if (clipped.clipped) truncated = true
    // Separators are part of the returned text, so they are part of the budget.
    const addition = clipped.text.length + (picked.length > 0 ? 2 : 0)
    if (used + addition > RELATED_MAX_TEXT_CHARS) {
      truncated = true
      break
    }
    picked.push(clipped.text)
    used += addition
  }

  picked.reverse()
  return { text: picked.join('\n\n'), messages: picked.length, truncated }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * One row, or null when it is too malformed to render honestly.
 *
 * `matchType` and `engine` are strict: a row that cannot say whether it matched
 * the title or the body, or which engine produced it, would put a made-up badge
 * in front of a real transcript. `termsHit` is the engine's own count and is
 * kept as given (a finite number ≥ 0); it is not re-derived from
 * `matchedTerms`, which is deliberately capped for display.
 */
function readRelatedRow(raw: unknown): RelatedRowView | null {
  if (!isRecord(raw)) return null

  const sessionId = raw.sessionId
  if (typeof sessionId !== 'string' || !sessionId.trim()) return null
  const timestamp = raw.timestamp
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return null
  const termsHit = raw.termsHit
  if (typeof termsHit !== 'number' || !Number.isFinite(termsHit) || termsHit < 0) return null
  const matchType = raw.matchType
  if (matchType !== 'title' && matchType !== 'content') return null
  const engine = raw.engine
  if (engine !== 'claude' && engine !== 'codex') return null

  const matchedTerms = Array.isArray(raw.matchedTerms)
    ? raw.matchedTerms
      .filter((term): term is string => typeof term === 'string')
      .map(term => term.trim())
      .filter(Boolean)
      .slice(0, RELATED_MAX_TERMS)
    : []

  return {
    sessionId: sessionId.trim(),
    title: typeof raw.title === 'string' ? raw.title : '',
    project: typeof raw.project === 'string' ? raw.project : '',
    engine,
    timestamp,
    matchType,
    termsHit,
    matchedTerms,
  }
}

/**
 * Read `session:related`'s reply.
 *
 * `reason: 'noTerms'` is its own state — "there was nothing to compare" is not
 * "nothing matched". A failed retrieval or a reply without a rows array is an
 * error, never an empty history. A non-empty array whose every row is
 * malformed is also an error: reporting "no conversation shares these words"
 * from a reply we could not read would be a claim we cannot support.
 */
export function readRelatedReply(raw: unknown): RelatedView {
  if (!isRecord(raw)) return { state: 'error' }
  if (raw.reason === 'noTerms') return { state: 'noTerms' }
  if (raw.reason === 'failed') return { state: 'error' }
  if (!Array.isArray(raw.rows)) return { state: 'error' }

  const indexing = raw.indexing === true
  const rows: RelatedRowView[] = []
  for (const entry of raw.rows) {
    const row = readRelatedRow(entry)
    if (row) rows.push(row)
  }
  if (rows.length === 0) {
    return raw.rows.length > 0 ? { state: 'error' } : { state: 'empty', indexing }
  }
  return { state: 'ready', rows, indexing }
}

/**
 * Stable React keys for a row list. The engine merges Claude and Codex hits,
 * and a migrated session can legitimately appear under the same id twice; the
 * numeric suffix keeps the keys unique without pretending the rows are the
 * same conversation.
 */
export function relatedRowKeys(rows: ReadonlyArray<{ sessionId: string }>): string[] {
  const seen = new Map<string, number>()
  return rows.map(row => {
    const count = (seen.get(row.sessionId) ?? 0) + 1
    seen.set(row.sessionId, count)
    return count === 1 ? row.sessionId : `${row.sessionId}#${count}`
  })
}
