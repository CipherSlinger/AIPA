/**
 * Pure matching and stepping logic for the in-conversation find bar.
 *
 * Deliberately free of React and the DOM: the renderer feeds it the visible
 * text segments it collected from the transcript, and the harness exercises
 * it directly. Keeping the two halves apart also makes the rule "a count is
 * of what was actually searched" checkable: the counter is the length of the
 * match list this module produced, never an estimate.
 */

/** One visible piece of a message, e.g. a rendered text node's content. */
export interface FindTextSegment {
  /** The message whose rendered text this segment belongs to. */
  messageId: string
  /** Visible text — not the markdown source behind it. */
  text: string
}

export interface TextMatch {
  messageId: string
  /** Position of the segment in the caller's ordered segment list. */
  segmentIndex: number
  /** Inclusive offset in the segment's text. */
  start: number
  /** Exclusive offset in the segment's text. */
  end: number
}

export interface TextRange {
  start: number
  end: number
}

/**
 * A query that is empty or only whitespace is not a query. It must read as
 * "nothing typed yet" rather than "matched nothing", so trimming happens once
 * here and every other decision derives from the result.
 */
export function normalizeFindQuery(query: string): string {
  return typeof query === 'string' ? query.trim() : ''
}

export function isActiveFindQuery(query: string): boolean {
  return normalizeFindQuery(query).length > 0
}

/**
 * Every regex metacharacter is escaped: `(`, `*` and `\` are text a user can
 * find, not an expression that may throw or over-match.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Literal, case-insensitive occurrences of `query` in `text`, left to right.
 *
 * A RegExp with the `i` flag is used rather than lowercasing both sides:
 * `toLowerCase()` can change a string's length (e.g. "İ" -> "i̇"), which would
 * shift every subsequent offset. Escaping keeps the match literal.
 */
export function findRangesInText(text: string, query: string): TextRange[] {
  const needle = normalizeFindQuery(query)
  if (!needle || !text) return []

  const pattern = new RegExp(escapeRegExp(needle), 'gi')
  const ranges: TextRange[] = []
  let match: RegExpExecArray | null

  // The needle is non-empty after trimming, so every exec advances lastIndex
  // and the loop terminates. The zero-length guard stays anyway: a future
  // caller must not be able to turn this into an infinite loop.
  while ((match = pattern.exec(text)) !== null) {
    if (match[0].length === 0) {
      pattern.lastIndex += 1
      continue
    }
    ranges.push({ start: match.index, end: match.index + match[0].length })
  }

  return ranges
}

/**
 * Match every ordered segment and report positions together with the message
 * they belong to, so the caller can say which message a match lives in.
 *
 * Occurrences are non-overlapping (the same convention browser find uses):
 * "aaaa" holds two "aa" matches, not three.
 */
export function findMatches(
  segments: readonly FindTextSegment[],
  query: string,
): TextMatch[] {
  const matches: TextMatch[] = []
  segments.forEach((segment, segmentIndex) => {
    for (const range of findRangesInText(segment.text, query)) {
      matches.push({
        messageId: segment.messageId,
        segmentIndex,
        start: range.start,
        end: range.end,
      })
    }
  })
  return matches
}

export type FindDirection = 'next' | 'prev'

/** Keep an index inside a match list that may have shrunk after a re-scan. */
export function clampMatchIndex(index: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0
  if (!Number.isFinite(index) || index < 0) return 0
  return Math.min(Math.floor(index), total - 1)
}

/**
 * Step one match forward or back, wrapping at both ends: last -> first and
 * first -> last. A list with no matches always reports index 0.
 */
export function stepMatchIndex(
  current: number,
  total: number,
  direction: FindDirection,
): number {
  if (!Number.isFinite(total) || total <= 0) return 0
  const index = clampMatchIndex(current, total)
  return direction === 'next'
    ? (index + 1) % total
    : (index - 1 + total) % total
}

/**
 * The three honest states of the bar, plus the untouched one.
 *
 *   idle               no query yet: the counter stays blank, never "0 of 0"
 *   empty-conversation a query but nothing has loaded: say the conversation
 *                      is empty instead of claiming to have searched it
 *   none               the conversation was searched and matched nothing
 *   matches            what was searched, and which one is current
 */
export type FindState =
  | { kind: 'idle' }
  | { kind: 'empty-conversation' }
  | { kind: 'none' }
  | { kind: 'matches'; total: number; current: number }

export function buildFindState(
  query: string,
  totalMatches: number,
  hasMessages: boolean,
  currentMatch = 0,
): FindState {
  if (!isActiveFindQuery(query)) return { kind: 'idle' }
  if (!hasMessages) return { kind: 'empty-conversation' }
  if (!Number.isFinite(totalMatches) || totalMatches <= 0) return { kind: 'none' }
  return {
    kind: 'matches',
    total: Math.floor(totalMatches),
    current: clampMatchIndex(currentMatch, Math.floor(totalMatches)),
  }
}
