// The footer under the results, and the sentence the polite live region says
// when a page lands.
//
// Both are copy, so both need the translator, and neither needs React — which
// is why they live here rather than in the coordinator that shows them. The
// coordinator was over its size ceiling after the folder facet and the rule the
// wave holds is to split rather than to raise the ceiling.
//
// Two facts the copy depends on:
//
//   - the next page does not always add a full page: the last page of a result
//     set can be short, and it can be short because the scan's own ceiling cut
//     it. `nextPageSize` is the number the button may promise;
//
//   - the announcement is said once per page and only for a page that landed.
//     Before one lands it is empty, so a screen reader hears nothing rather
//     than "0 more results" — absence is not a count.

import { nextPageSize } from './searchMatchFilter'

export interface LoadedPageNotice {
  /** Rows this page added to the view. */
  added: number
  /** Rows the view holds now. */
  loaded: number
}

export interface SearchPagingNoticeArgs {
  /** The page that most recently landed, or null before the first one. */
  lastPage: LoadedPageNotice | null
  /** Rows currently shown. */
  loaded: number
  /** Distinct hits the scan knows, or the ceiling it hit. */
  total: number
  translate: (key: string, params?: Record<string, string | number>) => string
}

export interface SearchPagingNotices {
  /** How many rows the next page would actually add. */
  nextCount: number
  /** What the live region says; empty when no page has landed. */
  announcement: string
}

export function derivePagingNotices({
  lastPage,
  loaded,
  total,
  translate,
}: SearchPagingNoticeArgs): SearchPagingNotices {
  return {
    nextCount: nextPageSize(loaded, total),
    announcement: lastPage
      ? translate(
          lastPage.added === 1 ? 'globalSearch.paging.announceOne' : 'globalSearch.paging.announce',
          { added: lastPage.added, loaded: lastPage.loaded },
        )
      : '',
  }
}
