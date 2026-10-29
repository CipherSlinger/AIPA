// Which rows of the archive ledger are selected.
//
// The selection is scoped to the *current filtered view* by construction. The
// panel prunes it whenever the visible ids change, and every action reads its
// ids from `selectedInView`, so a row hidden by a filter can never be acted on
// — not even in the one render between a filter change and the pruning effect.
//
// Kept away from React (no hooks, no JSX) so the rule can be exercised without
// a DOM: none/some/all on a filtered view, select-all, and the prune.

export type SelectionMode = 'none' | 'some' | 'all'

/**
 * The header checkbox's three honest states, measured on the visible ids only.
 * An empty view is 'none' rather than 'all' — "everything (of nothing)" would
 * tick the box over an empty ledger.
 */
export function selectionMode(
  selected: ReadonlySet<string>,
  visibleIds: readonly string[],
): SelectionMode {
  if (visibleIds.length === 0) return 'none'
  let count = 0
  for (const id of visibleIds) if (selected.has(id)) count += 1
  if (count === 0) return 'none'
  return count === visibleIds.length ? 'all' : 'some'
}

/** Selected ids in the ledger's own order — what a bulk action receives. */
export function selectedInView(
  selected: ReadonlySet<string>,
  visibleIds: readonly string[],
): string[] {
  return visibleIds.filter(id => selected.has(id))
}

export function toggleSelected(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected)
  if (!next.delete(id)) next.add(id)
  return next
}

/**
 * The header checkbox. Selecting covers exactly `visibleIds`; clearing removes
 * exactly those ids too — anything the view cannot show was never selected.
 */
export function selectAllInView(
  selected: ReadonlySet<string>,
  visibleIds: readonly string[],
  select: boolean,
): Set<string> {
  const next = new Set(selected)
  for (const id of visibleIds) {
    if (select) next.add(id)
    else next.delete(id)
  }
  return next
}

export interface PruneResult {
  selected: ReadonlySet<string>
  /** How many selected rows the view no longer contains. */
  dropped: number
}

/**
 * Keep only visible-and-selected ids and count the rest away.
 *
 * Returns the *same* set when nothing was dropped, so the panel's effect can
 * bail out without a re-render and without looping on its own setState.
 */
export function pruneSelection(
  selected: ReadonlySet<string>,
  visibleIds: readonly string[],
): PruneResult {
  if (selected.size === 0) return { selected, dropped: 0 }
  const visible = new Set(visibleIds)
  const next = new Set<string>()
  for (const id of selected) if (visible.has(id)) next.add(id)
  const dropped = selected.size - next.size
  return dropped === 0 ? { selected, dropped: 0 } : { selected: next, dropped }
}

/** A fresh empty selection — never share one Set between callers. */
export function emptySelection(): Set<string> {
  return new Set<string>()
}
