// Reviewing hand filings from the archive ledger.
//
// A manual filing (`useDepartmentStore().filings`) overrides the folder join
// everywhere, but the archive is the only surface that lists *every* finished
// conversation. Without a way to pick them out, a user who filed a conversation
// by hand has no place to review that assertion later — and a filing whose
// department was deleted lives in the unassigned bucket, indistinguishable from
// work that was never filed at all.
//
// These decisions are pure and React-free so the ledger's row marker and its
// "hand-filed only" filter answer the same question the same way, and a harness
// can exercise them without Electron or a store.

import type { FilingMap } from '../../store/departmentStore'

/**
 * Does this session carry a manual filing? A filing whose target node was
 * deleted still counts: it is the user's assertion, remembered on purpose, and
 * the row's removed tag says the node is gone. "Not filed by the folder" is the
 * question here, not "filed under a live department".
 */
export function hasHandFiling(
  filings: Readonly<FilingMap> | undefined,
  sessionId: string,
): boolean {
  return filings?.[sessionId] !== undefined
}

export interface HandFilingFilterResult<T> {
  visible: T[]
  /** Rows the toggle removed from the listing it was applied to. */
  hidden: number
}

/**
 * Apply the "hand-filed only" toggle to an already-filtered listing. With the
 * toggle off the listing is returned unchanged (a fresh array, so callers never
 * retain the pre-filter shape by aliasing), and the order is always preserved.
 *
 * An empty filing map with the toggle on hides every row: that is the honest
 * answer ("you have filed nothing by hand"), and the panel blames the filter
 * rather than claiming the archive is empty.
 */
export function filterByHandFiling<T extends { session: { sessionId: string } }>(
  records: readonly T[],
  filings: Readonly<FilingMap> | undefined,
  onlyHandFiled: boolean,
): HandFilingFilterResult<T> {
  if (!onlyHandFiled) return { visible: [...records], hidden: 0 }
  const visible = records.filter(record => hasHandFiling(filings, record.session.sessionId))
  return { visible, hidden: records.length - visible.length }
}
