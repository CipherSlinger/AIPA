/**
 * Derive the rows of the "draft a skill from a stored conversation" picker.
 *
 * The picker's job is selection, not interpretation. These rules are pure so
 * the list behaves the same whether the store holds real rows, an old cache or
 * something malformed: a row without a usable session id is not a choice, and
 * a broken payload yields an empty list instead of throwing in render.
 */

/** How many rows are shown before the list offers to reveal the rest. */
export const SKILL_DRAFT_SOURCE_VISIBLE = 12

export interface SkillDraftSource {
  sessionId: string
  /** The stored title, absent when the transcript never named the session. */
  title?: string
  lastPrompt: string
  timestamp: number
  messageCount?: number
  project?: string
}

export interface SkillDraftSourceList {
  /** The rows to render, already sorted, filtered and capped. */
  rows: SkillDraftSource[]
  /** How many rows matched the search before the cap. */
  matched: number
  /** Matched rows the cap keeps out of `rows`, so the UI can say so. */
  hidden: number
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/**
 * One stored row, or null when it cannot be a source. A session id is the only
 * field generalisation cannot work without, so it is the only hard requirement;
 * a missing timestamp is sorted last rather than invented.
 */
function normalizeRow(value: unknown): SkillDraftSource | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const sessionId = optionalString(row.sessionId)
  if (!sessionId) return null
  const title = optionalString(row.title)
  const messageCount = finiteNumber(row.messageCount)
  const project = optionalString(row.project)
  return {
    sessionId,
    ...(title ? { title } : {}),
    lastPrompt: typeof row.lastPrompt === 'string' ? row.lastPrompt : '',
    timestamp: finiteNumber(row.timestamp) ?? 0,
    ...(messageCount !== undefined ? { messageCount } : {}),
    ...(project ? { project } : {}),
  }
}

/**
 * Sort by recency, match title or last prompt, then cap.
 *
 * `cap` counts rows, not characters. `Infinity` shows everything (the picker's
 * expanded state); any other non-finite value falls back to the default cap so
 * a caller cannot accidentally hide the whole list. `hidden` is derived from
 * the matched rows, so "Show N more" is always the true remainder.
 */
export function deriveSkillDraftSources(
  sessions: unknown,
  query: string,
  cap: number = SKILL_DRAFT_SOURCE_VISIBLE,
): SkillDraftSourceList {
  if (!Array.isArray(sessions)) return { rows: [], matched: 0, hidden: 0 }

  const normalized: SkillDraftSource[] = []
  for (const value of sessions) {
    const row = normalizeRow(value)
    if (row) normalized.push(row)
  }

  // A stable sort keeps equal timestamps in the order the store supplied them,
  // so the list does not shuffle between renders.
  const ordered = normalized
    .map((row, index) => ({ row, index }))
    .sort((a, b) => (b.row.timestamp - a.row.timestamp) || (a.index - b.index))
    .map(entry => entry.row)

  const needle = typeof query === 'string' ? query.trim().toLowerCase() : ''
  const matchedRows = needle
    ? ordered.filter(row => (
      (row.title ?? '').toLowerCase().includes(needle)
      || row.lastPrompt.toLowerCase().includes(needle)
    ))
    : ordered

  const limit = Number.isFinite(cap)
    ? Math.max(0, Math.floor(cap))
    : (cap === Number.POSITIVE_INFINITY
      ? matchedRows.length
      : SKILL_DRAFT_SOURCE_VISIBLE)
  const rows = matchedRows.slice(0, limit)
  return {
    rows,
    matched: matchedRows.length,
    hidden: matchedRows.length - rows.length,
  }
}
