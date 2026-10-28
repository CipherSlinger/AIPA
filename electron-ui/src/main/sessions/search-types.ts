/**
 * The one shape the renderer sees for a cross-session search hit.
 *
 * The Claude and Codex readers produce transcripts in different formats; the
 * IPC handler merges their results, so everything that survives to the overlay
 * has to agree on these fields. `messageTimestamp` + `messageRole` are what
 * let the renderer find the exact row after it parses the transcript — a
 * snippet alone cannot identify a message.
 */
export interface SearchResult {
  sessionId: string
  title?: string
  project: string
  matchType: 'title' | 'content'
  snippet: string
  /** Epoch ms of the newest transcript entry (the session's own recency). */
  timestamp: number
  engine: 'claude' | 'codex'
  /** Epoch ms of the matched entry; only set for `matchType: 'content'`. */
  messageTimestamp?: number
  messageRole?: 'user' | 'assistant'
}

/**
 * Centre a readable window on the match. Sixty characters either side is
 * enough to tell two similar hits apart without turning the row into a wall of
 * text; whitespace (transcripts are full of newlines) is collapsed.
 */
export function buildSnippet(text: string, query: string, radius = 60): string {
  if (!text || query.length === 0) return ''
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return ''
  const start = Math.max(0, idx - radius)
  const end = Math.min(text.length, idx + query.length + radius)
  return (start > 0 ? '...' : '') +
    text.slice(start, end).replace(/\s+/g, ' ') +
    (end < text.length ? '...' : '')
}

/**
 * Cheap byte-level gate before paying for JSON parsing.
 *
 * Upper-case queries rarely appear verbatim in transcripts, so a lower-cased
 * copy is the common path; keeping the original as the first probe avoids
 * copying huge files for the (very common) exact-case hit. The full
 * `toLowerCase()` allocates a second copy, so it is the last resort.
 */
export function contentContainsQuery(content: string, query: string, lowerQuery: string): boolean {
  return content.includes(query) || content.includes(lowerQuery) || content.toLowerCase().includes(lowerQuery)
}

/** Text a transcript entry contributes to search: user/assistant prose only. */
export function textFromBlocks(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (typeof block === 'string') {
      parts.push(block)
      continue
    }
    if (block && typeof block === 'object' && (block as Record<string, unknown>).type === 'text') {
      const text = (block as Record<string, unknown>).text
      if (typeof text === 'string') parts.push(text)
    }
  }
  return parts.join('\n')
}
