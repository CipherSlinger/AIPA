// Which part of a hit matched (prose, tool output, thinking) and in what order
// the returned rows are shown. This is a pure view over the hits
// `useGlobalSessionSearch` already returned — it never starts a scan, so a
// filter or a sort can never race the search's request sequencing.
//
// `searchOriginFilter.ts` answers a different question ("who started this
// session"); this module answers "where in the transcript did the words sit".
// Both are client-side views, and both must stay honest about what they hide.

/**
 * How many rows one page of results holds. `session:searchPage` returns the
 * page and the counts that describe the scan behind it; asking for the next
 * page continues the same ordering. Exported here because the hook that passes
 * it and the copy that offers the next page must not drift apart.
 */
export const GLOBAL_SEARCH_RESULT_LIMIT = 40

/**
 * Whether the rows on screen are only part of what the query knows. Filters and
 * order are client-side views over the loaded rows: their counts describe that
 * set, and the copy must not imply the unloaded matches were filtered too. This
 * flag is what the copy keys off.
 */
export function isLoadedSetPartial(hasMore: boolean, ceilingReached: boolean): boolean {
  return hasMore || ceilingReached
}

/**
 * How many rows the next page would add. The last page can be short (the scan
 * knows fewer rows than a full page), so the button never promises a page size
 * it will not deliver.
 */
export function nextPageSize(
  loaded: number,
  total: number,
  pageSize: number = GLOBAL_SEARCH_RESULT_LIMIT,
): number {
  return Math.max(0, Math.min(pageSize, total - loaded))
}

/**
 * Which i18n key describes the loaded/known counts. Kept here — not inline in
 * the overlay — so the sentence and the state that selects it cannot drift:
 * a ceiling is "at least", a fetchable tail is "of", a complete scan is "all".
 * Saying "of 200" when the ceiling truncated the scan would state a total the
 * app never measured.
 */
export type PagingCountKey =
  | 'globalSearch.paging.loadedOf'
  | 'globalSearch.paging.loadedOfAtLeast'
  | 'globalSearch.paging.allLoaded'

export function pagingCountKey(hasMore: boolean, ceilingReached: boolean): PagingCountKey {
  if (ceilingReached) return 'globalSearch.paging.loadedOfAtLeast'
  return hasMore ? 'globalSearch.paging.loadedOf' : 'globalSearch.paging.allLoaded'
}

/**
 * Which sentence explains that a filter/order cannot speak for the unseen
 * matches: more can be fetched, or the scan never went further.
 *
 * Once the scan itself was narrowed, "earlier matches have not been filtered"
 * is no longer true — they were filtered at the source and simply not loaded.
 * The scoped copies say that instead of repeating a limitation the user has
 * already removed.
 */
export type PagingNarrowedKey =
  | 'globalSearch.paging.narrowedMore'
  | 'globalSearch.paging.narrowedCeiling'
  | 'globalSearch.paging.narrowedScopedMore'
  | 'globalSearch.paging.narrowedScopedCeiling'

export function pagingNarrowedKey(hasMore: boolean, scopedScan = false): PagingNarrowedKey {
  if (scopedScan) {
    return hasMore ? 'globalSearch.paging.narrowedScopedMore' : 'globalSearch.paging.narrowedScopedCeiling'
  }
  return hasMore ? 'globalSearch.paging.narrowedMore' : 'globalSearch.paging.narrowedCeiling'
}

export type SearchMatchFilter = 'all' | 'prose' | 'tool' | 'thinking'

/**
 * An origin a scan can be narrowed to. Distinct from `SearchMatchFilter`, which
 * also has `all`: a scan narrowing is always a positive list, and `all` is
 * expressed by not narrowing at all (null).
 */
export type ScanOrigin = 'prose' | 'tool' | 'thinking'

/**
 * Whether the filter bar should offer the explicit "search with this filter"
 * action.
 *
 * Only when the loaded rows are a partial answer and the active chip is a real
 * origin: with everything loaded, the filter already speaks for the whole
 * result set, and `all` is not a narrowing. The action is refused while the
 * scan is already narrowed to exactly this origin — pressing it again would
 * only re-run a scan that is already narrow.
 */
export function shouldOfferScopedScan(
  partial: boolean,
  filter: SearchMatchFilter,
  scannedOrigins: readonly ScanOrigin[] | null,
): boolean {
  if (!partial || filter === 'all') return false
  return !(scannedOrigins?.length === 1 && scannedOrigins[0] === filter)
}

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

export type SearchSortOrder = 'newest' | 'oldest'

export const SEARCH_SORT_ORDERS: readonly SearchSortOrder[] = ['newest', 'oldest']

/**
 * Ordering is only loaded-deep. The main-side scan sorts what it collected and
 * the pages are slices of that list, so "oldest first" reverses the loaded
 * rows — it cannot surface anything older than the scan's ceiling, because
 * those rows were never collected. The copy says so whenever the loaded set is
 * partial; the UI must not imply otherwise.
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
