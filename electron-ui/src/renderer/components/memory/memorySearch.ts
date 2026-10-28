/**
 * Cross-tier memory search — the pure half.
 *
 * The console keeps its five tiers in five different shapes: personal items
 * live in the prefs store, project/instruction memory are files, memdir rows
 * and dream passes come back from IPC. This module flattens each into the same
 * `{ title, body }` document so one query can score them all, and keeps every
 * decision (matching, snippet window, grouping, counts) free of React so the
 * Node harness can exercise it directly.
 *
 * No storage or IPC lives here. Loading is the hook's job; rendering is the
 * panel's.
 */

export type MemorySearchTier = 'personal' | 'project' | 'memdir' | 'dream' | 'config'

/** Display order in the tab strip, the result list and the harness. */
export const MEMORY_SEARCH_TIERS: readonly MemorySearchTier[] = [
  'personal',
  'project',
  'memdir',
  'dream',
  'config',
]

/** Existing tab labels, so the results never invent a tier name. */
export const MEMORY_TIER_LABEL_KEYS: Record<MemorySearchTier, string> = {
  personal: 'memory.globalMemory',
  project: 'memory.projectMemory',
  memdir: 'memory.memdirTab',
  dream: 'dream.tabLabel',
  config: 'memory.instructionTab',
}

/**
 * A tier's load lifecycle. `error` is a first-class state rather than an empty
 * document list: "could not be read" and "read fine, nothing matched" are
 * different truths and the results view must be able to say so.
 */
export type MemoryTierState = 'loading' | 'ready' | 'error'

export interface MemorySearchDocument {
  tier: MemorySearchTier
  /** Stable within the tier; the tier's tab uses it to open the item. */
  id: string
  /** File name or fact preview — what the result row leads with. */
  title: string
  /** Everything else that counts as searchable text. */
  body: string
  /** File path (or scope label) shown under the title. */
  source?: string
}

export interface MemoryTierSource {
  tier: MemorySearchTier
  state: MemoryTierState
  documents: readonly MemorySearchDocument[]
  error?: string
}

/** Inclusive start, exclusive end. */
export type HighlightRange = readonly [number, number]

export interface MemorySearchHit {
  tier: MemorySearchTier
  documentId: string
  title: string
  source?: string
  matchedTitle: boolean
  matchedBody: boolean
  titleRanges: HighlightRange[]
  /** Excerpt around the first body match, with its own local offsets. */
  snippet: string
  snippetRanges: HighlightRange[]
}

export interface MemoryTierSearchGroup {
  tier: MemorySearchTier
  state: MemoryTierState
  error?: string
  hits: MemorySearchHit[]
}

/** Focus handed to the owning tab after a result row is opened. */
export interface MemoryOpenFocus {
  tier: MemorySearchTier
  documentId: string
  query: string
  nonce: number
}

/** Trim once; an all-whitespace query means "no search", not "match nothing". */
export function normaliseMemoryQuery(query: string): string {
  return query.trim()
}

const WORD_CHAR = /[A-Za-z0-9_]/

function isWordBounded(text: string, start: number, end: number): boolean {
  const before = start === 0 || !WORD_CHAR.test(text[start - 1])
  const after = end === text.length || !WORD_CHAR.test(text[end])
  return before && after
}

/**
 * Literal, case-insensitive occurrences of the whole query. Deliberately not
 * a regex: memory text is user-authored and may contain any punctuation, and
 * highlighting must never throw on it.
 *
 * Standalone occurrences win: "deploy" marks the word, not the same letters
 * buried inside "redeploy" or "deployment". When the query only occurs inside
 * a longer word (a genuine substring search), every occurrence is marked so
 * the hit still shows where the query is.
 */
export function findHighlightRanges(text: string, query: string): HighlightRange[] {
  const needle = normaliseMemoryQuery(query)
  if (!needle || !text) return []
  const haystack = text.toLowerCase()
  const lowered = needle.toLowerCase()
  const all: HighlightRange[] = []
  const bounded: HighlightRange[] = []
  let from = 0
  for (;;) {
    const at = haystack.indexOf(lowered, from)
    if (at === -1) break
    const end = at + lowered.length
    const range: HighlightRange = [at, end]
    all.push(range)
    if (isWordBounded(text, at, end)) bounded.push(range)
    from = end
  }
  return bounded.length > 0 ? bounded : all
}

/** A fact's first line is its name; the whole text stays searchable as body. */
export function memoryDocumentTitle(content: string, maxLength = 120): string {
  const firstLine = content.trim().split(/\r?\n/, 1)[0]?.trim() ?? ''
  if (firstLine.length <= maxLength) return firstLine
  return `${firstLine.slice(0, maxLength).trimEnd()}…`
}

/**
 * A short excerpt around the first match. The window is moved off word
 * boundaries so a highlight never starts or ends mid-word, and ranges are
 * recomputed against the sliced text because the excerpt's offsets differ
 * from the document's.
 */
export function buildSnippet(
  text: string,
  query: string,
  maxLength = 160,
): { text: string; ranges: HighlightRange[] } {
  const needle = normaliseMemoryQuery(query)
  if (!text) return { text: '', ranges: [] }
  if (!needle) return { text: clipFromStart(text, maxLength), ranges: [] }

  const ranges = findHighlightRanges(text, needle)
  if (ranges.length === 0) return { text: clipFromStart(text, maxLength), ranges: [] }

  const first = ranges[0][0]
  let start = Math.max(0, first - Math.floor(maxLength / 3))
  if (start > 0) {
    // Prefer starting after the nearest space before the match; fall back to
    // the raw window when there is no space to cut on.
    const space = text.indexOf(' ', start)
    if (space !== -1 && space < first) start = space + 1
  }
  let end = Math.min(text.length, start + maxLength)
  if (end < text.length) {
    const space = text.lastIndexOf(' ', end)
    if (space > first + needle.length) end = space
  }

  const raw = text.slice(start, end)
  const snippet = `${start > 0 ? '…' : ''}${raw}${end < text.length ? '…' : ''}`
  return { text: snippet, ranges: findHighlightRanges(snippet, needle) }
}

function clipFromStart(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength).trimEnd()}…`
}

/**
 * Match every document against the query. Title and body are reported
 * separately: a title hit still earns a body preview, while a body-only hit
 * leaves the title unmarked. The original document order is preserved so the
 * caller controls ranking (personal items arrive pinned-first).
 */
export function searchMemoryDocuments(
  documents: readonly MemorySearchDocument[],
  query: string,
): MemorySearchHit[] {
  const needle = normaliseMemoryQuery(query)
  if (!needle) return []

  const hits: MemorySearchHit[] = []
  for (const document of documents) {
    const titleRanges = findHighlightRanges(document.title, needle)
    const bodyRanges = findHighlightRanges(document.body, needle)
    // A title-only match is still a hit, even when the body is empty.
    if (titleRanges.length === 0 && bodyRanges.length === 0) continue
    const snippet = bodyRanges.length > 0
      ? buildSnippet(document.body, needle)
      : { text: clipFromStart(document.body, 160), ranges: [] }
    hits.push({
      tier: document.tier,
      documentId: document.id,
      title: document.title,
      source: document.source,
      matchedTitle: titleRanges.length > 0,
      matchedBody: bodyRanges.length > 0,
      titleRanges,
      snippet: snippet.text,
      snippetRanges: snippet.ranges,
    })
  }
  return hits
}

/** Group hits in tab order; loading/error tiers are kept so they can speak. */
export function groupMemorySearchResults(
  tierSources: readonly MemoryTierSource[],
  query: string,
): MemoryTierSearchGroup[] {
  const needle = normaliseMemoryQuery(query)
  const order = new Map(MEMORY_SEARCH_TIERS.map((tier, index) => [tier, index]))
  return [...tierSources]
    .sort((a, b) => (order.get(a.tier) ?? 99) - (order.get(b.tier) ?? 99))
    .map(source => ({
      tier: source.tier,
      state: source.state,
      error: source.error,
      hits: needle ? searchMemoryDocuments(source.documents, needle) : [],
    }))
}

/** Flattening is the keyboard order: Enter opens the first, arrows walk it. */
export function flattenMemorySearchGroups(
  groups: readonly MemoryTierSearchGroup[],
): MemorySearchHit[] {
  return groups.flatMap(group => group.hits)
}

export function memoryHitCounts(
  groups: readonly MemoryTierSearchGroup[],
): Record<MemorySearchTier, number> {
  const counts: Record<MemorySearchTier, number> = {
    personal: 0,
    project: 0,
    memdir: 0,
    dream: 0,
    config: 0,
  }
  for (const group of groups) counts[group.tier] = group.hits.length
  return counts
}

/**
 * "Nothing in memory matches" is only true once every tier has finished and
 * every tier actually answered. A loading or failed tier must not be rounded
 * down to an empty one.
 */
export function isMemorySearchEmpty(groups: readonly MemoryTierSearchGroup[]): boolean {
  return groups.every(group => group.state === 'ready' && group.hits.length === 0)
}
