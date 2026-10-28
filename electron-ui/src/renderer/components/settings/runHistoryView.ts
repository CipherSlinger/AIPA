// Which remembered runs a job's disclosure shows.
//
// The job stores at most twenty records, oldest first (`appendRunRecord` in
// `src/main/automation/run-history.ts` appends and slices the tail). The
// disclosure has always presented the newest first, so the caller reverses the
// returned rows for display; this module only decides *which* records are
// visible, and keeps them in their stored oldest→newest order so that reversal
// stays a single, obvious step in the component.
//
// Pure and React-free so `.scratch/wave35-run-history-harness` can exercise it
// without mounting anything.

/** How many remembered runs a collapsed disclosure lists. */
export const RUN_HISTORY_CAP = 5

/** The one field this view needs; anything with a run status fits. */
export interface RunHistoryRecord {
  status: string
}

export interface RunHistoryViewOptions {
  /** Narrow to failed attempts (`status === 'error'`). Skips and successes are not failures. */
  failuresOnly?: boolean
  /** Reveal every remembered run instead of the newest `cap`. */
  expanded?: boolean
  /** Override for tests; production always uses `RUN_HISTORY_CAP`. */
  cap?: number
}

export interface RunHistoryView<T extends RunHistoryRecord> {
  /**
   * Selected records in stored order (oldest → newest). References to the
   * original array's records; the input is never mutated or reordered.
   */
  rows: T[]
  /** Every remembered run, regardless of the filter. */
  totalCount: number
  /** Runs with `status === 'error'`. Never skips or successes. */
  failureCount: number
  /** What the current filter matches: all failures, or every run when off. */
  matchingCount: number
  /** The failures filter is on and nothing matched — the caller must say so. */
  isEmpty: boolean
  /** A "Show all N runs" control is warranted. */
  canShowAll: boolean
  /** A "Show fewer" control is warranted. */
  canShowFewer: boolean
}

/**
 * Select the runs to list.
 *
 * The five-row cap applies to ordinary viewing only. The failures filter lifts
 * it entirely: someone asking "what failed?" wants every failure, so a filtered
 * list is never truncated and therefore never needs a "Show all" control — no
 * matching failure is ever left behind a click. `expanded` is likewise ignored
 * while filtering, since the filtered list is already complete.
 */
export function viewRunHistory<T extends RunHistoryRecord>(
  history: readonly T[],
  options: RunHistoryViewOptions = {},
): RunHistoryView<T> {
  const cap = options.cap !== undefined && options.cap > 0 ? options.cap : RUN_HISTORY_CAP
  const failuresOnly = options.failuresOnly === true
  const expanded = options.expanded === true

  const totalCount = history.length
  let failureCount = 0
  for (const record of history) {
    if (record.status === 'error') failureCount += 1
  }

  if (failuresOnly) {
    const rows = history.filter(record => record.status === 'error')
    return {
      rows,
      totalCount,
      failureCount,
      matchingCount: rows.length,
      isEmpty: rows.length === 0,
      canShowAll: false,
      canShowFewer: false,
    }
  }

  // `slice` copies, so reverse() in the renderer cannot touch the job's array.
  const rows = expanded ? history.slice() : history.slice(-cap)
  return {
    rows,
    totalCount,
    failureCount,
    matchingCount: totalCount,
    isEmpty: totalCount === 0,
    canShowAll: !expanded && totalCount > cap,
    canShowFewer: expanded && totalCount > cap,
  }
}
