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
  /**
   * Where the matched text sat: the conversation's own prose, a tool call's
   * input / output, or an assistant thinking block. Absent on title matches and
   * on rows produced before the index learned about tool text.
   */
  matchOrigin?: SearchTextOrigin
  /**
   * The matched block was cut at the index ceiling, so the snippet ends at the
   * real boundary of what was indexed rather than the end of the block. The
   * row must say so; never let it read as the whole output.
   */
  truncated?: boolean
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

/**
 * Which part of a transcript entry a piece of searchable text came from.
 *
 * Search used to see only `prose`, so a command the assistant ran, a file it
 * read or a shell error was invisible even though the transcript is full of
 * it. The index now stores all three kinds and labels every record, so a hit
 * can tell the user it came from tool output rather than the conversation.
 */
export type SearchTextOrigin = 'prose' | 'tool' | 'thinking'

/**
 * How one scan may narrow the corpus before it collects hits.
 *
 * Search used to narrow only what had already been returned: an origin filter
 * re-partitioned the loaded page, and a match outside that page was invisible.
 * The filter now travels into the scan, so the result limit and the ceiling
 * count hits the caller asked for rather than hits it will later discard.
 *
 * Both fields follow one rule: `null` means "no narrowing", an ARRAY or SET
 * means "exactly these". An empty list is therefore an empty scope that matches
 * nothing — it must never fall back to the whole history, because the caller
 * asked one question and "everything" would answer a different one.
 */
export interface SearchScanFilter {
  /**
   * Origins to keep, or `null` to keep every origin. A positive list also
   * excludes title hits: a conversation's name has no origin, and no caller who
   * asked for tool output meant to be shown title matches.
   */
  origins: readonly SearchTextOrigin[] | null
  /** Session ids the scan may report, or `null` for the whole history. */
  sessionIds: ReadonlySet<string> | null
}

/**
 * Whether a matched block of `origin` survives the scan filter. Title hits do
 * not come through here: they are gated separately by `origins !== null`.
 */
export function searchOriginAllowed(
  filter: SearchScanFilter | null | undefined,
  origin: SearchTextOrigin,
): boolean {
  if (!filter || filter.origins === null) return true
  return filter.origins.includes(origin)
}

/** One block's contribution to search, before per-file budget merging. */
export interface SearchTextSegment {
  origin: SearchTextOrigin
  text: string
  /** `tool_result` only: the call id it belongs to, for locating its message. */
  toolUseId?: string
}

/**
 * How much one tool or thinking block may add to the index. Tool output
 * dominates a transcript (a single file read can be megabytes of text);
 * without a ceiling the index would become a second copy of the corpus. 2000
 * characters keep a command line, a stack frame or a diff hunk searchable
 * while bounding ten thousand such blocks to 20 M characters.
 *
 * Prose is deliberately not capped here: it is the part search is expected to
 * quote back, it is small next to tool output, and excerpt extraction reads it
 * from the same records.
 */
export const SEARCH_MAX_BLOCK_CHARS = 2000

/** Cut at the ceiling without splitting a surrogate pair (invalid UTF-16). */
export function capSearchText(text: string, cap: number): { text: string; truncated: boolean } {
  if (!Number.isFinite(cap) || cap < 0 || text.length <= cap) return { text, truncated: false }
  let cut = cap
  const last = cut > 0 ? text.charCodeAt(cut - 1) : 0
  if (last >= 0xd800 && last <= 0xdbff) cut -= 1
  return { text: text.slice(0, cut), truncated: true }
}

function stringifySearchValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (value == null) return ''
  if (typeof value === 'object') {
    try { return JSON.stringify(value) } catch { return '' }
  }
  return String(value)
}

/** A tool result is a string, or content blocks whose text is the output. */
function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return stringifySearchValue(content)
  const parts: string[] = []
  for (const part of content) {
    if (typeof part === 'string') { parts.push(part); continue }
    if (!part || typeof part !== 'object') continue
    const block = part as Record<string, unknown>
    if (typeof block.text === 'string') parts.push(block.text)
    else if (typeof block.content === 'string') parts.push(block.content)
  }
  return parts.join('\n')
}

/**
 * Everything one entry contributes to cross-session search, split by origin.
 * Not capped: the cap is what a block may *store*, applied by the indexer, and
 * the on-disk fallback scan must see the whole block to find what the cap left
 * out.
 *
 * Separate from `textFromBlocks` on purpose: that helper's other consumers
 * (workflow generalization digests) want the user/assistant prose and nothing
 * else, and silently widening it would change what they quote. This one is for
 * the search index and the on-disk fallback scan only.
 */
export function searchSegmentsFromBlocks(content: unknown): SearchTextSegment[] {
  if (typeof content === 'string') {
    return content ? [{ origin: 'prose', text: content }] : []
  }
  if (!Array.isArray(content)) return []

  const segments: SearchTextSegment[] = []
  for (const raw of content) {
    if (typeof raw === 'string') {
      if (raw) segments.push({ origin: 'prose', text: raw })
      continue
    }
    if (!raw || typeof raw !== 'object') continue
    const block = raw as Record<string, unknown>

    if (block.type === 'text') {
      const text = typeof block.text === 'string' ? block.text : ''
      if (text) segments.push({ origin: 'prose', text })
      continue
    }

    if (block.type === 'thinking') {
      // Claude's thinking blocks carry `thinking`; older shapes use `text`.
      const text = typeof block.thinking === 'string'
        ? block.thinking
        : typeof block.text === 'string' ? block.text : ''
      if (text) segments.push({ origin: 'thinking', text })
      continue
    }

    if (block.type === 'tool_use') {
      // The arguments are where the command, path or query lives. The tool
      // name alone is not user content and would make every shell call match.
      const text = stringifySearchValue(block.input)
      if (text) segments.push({ origin: 'tool', text })
      continue
    }

    if (block.type === 'tool_result') {
      const text = toolResultText(block.content)
      if (!text) continue
      segments.push({
        origin: 'tool',
        text,
        ...(typeof block.tool_use_id === 'string' ? { toolUseId: block.tool_use_id } : {}),
      })
    }
  }
  return segments
}

/**
 * Join adjacent segments of one origin (and one tool call) the way the index
 * stores an entry's blocks. The disk fallback scans with this so a phrase that
 * spans two text blocks of one message stays matchable, as it was when prose
 * was joined per entry.
 */
export function mergeAdjacentSegments(segments: SearchTextSegment[]): SearchTextSegment[] {
  const out: SearchTextSegment[] = []
  for (const segment of segments) {
    const last = out[out.length - 1]
    if (last && last.origin === segment.origin && last.toolUseId === segment.toolUseId) {
      last.text += `\n${segment.text}`
    } else {
      out.push({ ...segment })
    }
  }
  return out
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
