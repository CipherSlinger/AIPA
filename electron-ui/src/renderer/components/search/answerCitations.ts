/**
 * Split a history answer into plain text and resolvable `[n]` citations.
 *
 * Both the search overlay and the in-chat history row render these, and they
 * must agree: a number becomes a chip only when the answer could have meant a
 * source that was actually returned. A `[7]` next to four sources, a `[x]`, or
 * any marker outside 1..sourceCount stays literal text — offering a chip that
 * cannot navigate would be worse than showing the model's mistake.
 *
 * React-free: the overlay builds buttons from segments, the row builds its own,
 * and the harness checks the rules on their own.
 */
export type AnswerSegment =
  | { kind: 'text'; text: string; start: number }
  | { kind: 'cite'; n: number; sourceIndex: number; raw: string; start: number }

/**
 * `start` is the offset into the original answer, which gives both renderers a
 * stable React key that survives the streamed text growing at the end.
 */
export function parseAnswerCitations(answer: string, sourceCount: number): AnswerSegment[] {
  if (typeof answer !== 'string' || answer.length === 0) return []
  const count = Number.isFinite(sourceCount) ? Math.max(0, Math.floor(sourceCount)) : 0

  const segments: AnswerSegment[] = []
  const re = /\[(\d+)\]/g
  let from = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(answer))) {
    if (match.index > from) {
      segments.push({ kind: 'text', text: answer.slice(from, match.index), start: from })
    }
    const n = Number(match[1])
    // `[0]` and anything past the last returned source stay literal. Leading
    // zeros (`[01]`) resolve to 1: the model named a real source.
    if (Number.isSafeInteger(n) && n >= 1 && n <= count) {
      segments.push({ kind: 'cite', n, sourceIndex: n - 1, raw: match[0], start: match.index })
    } else {
      segments.push({ kind: 'text', text: match[0], start: match.index })
    }
    from = re.lastIndex
  }
  if (from < answer.length) {
    segments.push({ kind: 'text', text: answer.slice(from), start: from })
  }
  return segments
}
