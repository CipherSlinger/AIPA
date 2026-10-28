// The scope an "ask about these rows" snapshot creates.
//
// The archive knows exactly which conversations it is showing, but the search
// overlay cannot re-derive that list: the overlay's origin/department filters,
// the filing map and the archive's own grouping all change independently. So
// the archive hands over an exact list of session ids, taken once, and every
// decision here treats it as a snapshot rather than as a live query.
//
// Three things matter for honesty:
//   - rows are narrowed to membership by id, never by title or folder;
//   - a cap means the snapshot is shorter than the archive's list, so the
//     difference is reported instead of hidden;
//   - when a department filter is also active the two narrow each other, and
//     an empty intersection is a real empty scope. It is sent as [], never
//     widened back to the whole history (the same doctrine as a department
//     subtree with nothing filed under it).
//
// Pure and React-free so the overlay's harness can exercise the same code the
// component runs.

/** The archive seed as the overlay holds it, with a set for O(1) membership. */
export interface ListScope {
  ids: Set<string>
  sessionIds: string[]
  /** Rows the archive was showing before its cap. */
  total: number
  truncated: boolean
}

/**
 * Freeze the archive's seed into the overlay's own structure. `null` means no
 * seed was waiting, which is the ordinary global search. The id array is
 * copied so a later mutation of the seed cannot retarget an open overlay.
 */
export function buildListScope(
  seed: { sessionIds: string[]; total: number; truncated: boolean } | null | undefined,
): ListScope | null {
  if (!seed) return null
  const sessionIds = [...seed.sessionIds]
  return {
    ids: new Set(sessionIds),
    sessionIds,
    total: seed.total,
    truncated: seed.truncated,
  }
}

export interface ListFilteredResults<T> {
  visible: T[]
  /** Rows this snapshot is keeping out of the current result set. */
  hidden: number
}

/**
 * Keep only rows whose session the archive listed. `null` means no snapshot:
 * the rows are copied (not aliased) and nothing is hidden, so callers can
 * render this pass unconditionally. Membership is exact by `sessionId` and the
 * incoming order is preserved — a snapshot is a filter, never a re-ranking.
 */
export function filterByListScope<T extends { sessionId: string }>(
  rows: ReadonlyArray<T>,
  ids: ReadonlySet<string> | null,
): ListFilteredResults<T> {
  if (!ids) return { visible: [...rows], hidden: 0 }
  const visible: T[] = []
  for (const row of rows) {
    if (ids.has(row.sessionId)) visible.push(row)
  }
  return { visible, hidden: rows.length - visible.length }
}

/**
 * The ids an ask may read when a snapshot and an optional department subtree
 * both apply.
 *
 * The snapshot's order is the user's order, so it is preserved; duplicates
 * collapse to their first occurrence. `deptIds === null` means no department
 * filter, so the snapshot passes through unchanged. A non-null intersection
 * that comes out empty stays empty: the caller must send [], because falling
 * back to the whole history would answer from conversations the user did not
 * pick.
 */
export function resolveListAskIds(
  listIds: readonly string[],
  deptIds: readonly string[] | null,
): string[] {
  const deptSet = deptIds ? new Set(deptIds) : null
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of listIds) {
    if (deptSet && !deptSet.has(id)) continue
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/**
 * How many rows the archive's cap left out of the snapshot. Never negative:
 * a seed whose `total` is not ahead of its list is simply not truncated.
 */
export function listScopeOmitted(total: number, count: number): number {
  return Math.max(0, total - count)
}
