// Which part of a hit matched (prose, tool output, thinking) and in what order
// the returned rows are shown. This is a pure view over the hits
// `useGlobalSessionSearch` already returned — it never starts a scan, so a
// filter or a sort can never race the search's request sequencing.
//
// `searchOriginFilter.ts` answers a different question ("who started this
// session"); this module answers "where in the transcript did the words sit".
// Both are client-side views, and both must stay honest about what they hide.

/**
 * The result window. `session:search` scans transcript files newest-first and
 * stops once it has this many hits, so the renderer never sees more than this
 * even for a term that appears thousands of times. Exported here because the
 * hook that passes it and the copy that admits to it must not drift apart.
 */
export const GLOBAL_SEARCH_RESULT_LIMIT = 40

export type SearchMatchFilter = 'all' | 'prose' | 'tool' | 'thinking'

export const SEARCH_MATCH_FILTERS: readonly SearchMatchFilter[] = [
  'all',
  'prose',
  'tool',
  'thinking',
]

/**
 * The bucket a hit falls into. `title` is not a fourth filter: a conversation's
 * name is not prose the conversation said, and it is certainly not tool output,
 * so a title hit is shown under All only. Treating it as prose would let
 * "prose only" claim a match the row itself labels as a title match.
 */
export type SearchHitOriginKind = 'prose' | 'tool' | 'thinking' | 'title'

export interface MatchableHit {
  matchType: 'title' | 'content'
  matchOrigin?: 'prose' | 'tool' | 'thinking'
}

export function searchHitOriginKind(hit: MatchableHit): SearchHitOriginKind {
  if (hit.matchType === 'title') return 'title'
  // A content hit without an explicit origin comes from an index written before
  // origins existed; the row shows it unlabelled, so prose is the honest bucket.
  return hit.matchOrigin ?? 'prose'
}

/** Per-bucket totals over one result set, plus the total rows it came from. */
export interface MatchFilterCounts extends Record<SearchHitOriginKind, number> {
  total: number
}

export interface MatchFilteredResults<T> {
  visible: T[]
  /** Rows this filter keeps out of the current result set. */
  hidden: number
  /** Counts over the *whole* current result set, not over `visible`. */
  counts: MatchFilterCounts
}

/**
 * Counts always describe the array passed in — the current query's window.
 * They are never carried across queries: the overlay recomputes them from the
 * new `results`, and a query change empties `results` while the new scan runs.
 */
export function filterResultsByMatchOrigin<T extends MatchableHit>(
  results: ReadonlyArray<T>,
  filter: SearchMatchFilter,
): MatchFilteredResults<T> {
  const counts: MatchFilterCounts = {
    prose: 0,
    tool: 0,
    thinking: 0,
    title: 0,
    total: results.length,
  }
  const visible: T[] = []
  for (const hit of results) {
    const kind = searchHitOriginKind(hit)
    counts[kind] += 1
    if (filter === 'all' || kind === filter) visible.push(hit)
  }
  return { visible, hidden: results.length - visible.length, counts }
}

/**
 * True only when the search found rows and the match filter hid every one.
 * An empty result array means the search itself found nothing, and that is a
 * different statement: the phrase may not exist at all.
 */
export function isMatchFilterEmpty(
  totalResults: number,
  visibleResults: number,
  filter: SearchMatchFilter,
): boolean {
  return filter !== 'all' && totalResults > 0 && visibleResults === 0
}

/** Whether the main-side scan stopped at its cap, i.e. older hits were never read. */
export function isSearchWindowCapped(returnedCount: number): boolean {
  return returnedCount >= GLOBAL_SEARCH_RESULT_LIMIT
}

export type SearchSortOrder = 'newest' | 'oldest'

export const SEARCH_SORT_ORDERS: readonly SearchSortOrder[] = ['newest', 'oldest']

/**
 * Ordering is only window-deep. `searchSessions` sorts what it collected and
 * slices at the cap, so "oldest first" reverses the newest N hits — it cannot
 * surface anything older, because those rows were never returned. The copy
 * says so whenever the window is capped; the UI must not imply otherwise.
 *
 * Sort is stable for equal timestamps: the original index is the tiebreak, so
 * two hits sharing a second keep the main process's order instead of shuffling
 * between renders. The input array is never mutated.
 */
export function sortSearchResults<T extends { timestamp: number }>(
  results: ReadonlyArray<T>,
  order: SearchSortOrder,
): T[] {
  return results
    .map((hit, index) => ({ hit, index }))
    .sort((a, b) => {
      const diff = order === 'newest'
        ? b.hit.timestamp - a.hit.timestamp
        : a.hit.timestamp - b.hit.timestamp
      return diff !== 0 ? diff : a.index - b.index
    })
    .map(entry => entry.hit)
}
