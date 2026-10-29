/**
 * Narrowing "Recently deleted" — the pure half.
 *
 * The holding area is one merged list of four kinds and grows to dozens of
 * rows over the 30-day window, so the section has a text box and four kind
 * chips. Both narrow only the rows already loaded; there is no new IPC and no
 * second read. This module is React-free and DOM-free so the matching rules
 * can be exercised directly.
 *
 * What the text box searches — every one of these is text the row puts on
 * screen:
 *   - the title line (`row.name`). A conversation with no title displays its
 *     session id, so that id is searchable — it is on screen. An id the row
 *     never renders is not;
 *   - the kind badge ("Workflow", "Skill", "Scheduled job", "Conversation");
 *   - the second line: "Removes on <date>", or the "no longer on disk"
 *     sentence a broken row shows instead.
 *
 * What it does NOT search: internal ids (`row.id`, the trash entry id), the
 * session's folder path, and anything else the row never renders. A filter
 * that claims to search "everything" while missing what is on screen is the
 * same false-negative class the app's find bars exist to avoid, so the list
 * above is the contract and the comment is the place it is written down.
 *
 * Matching is case-insensitive (`toLowerCase`, locale-independent on purpose:
 * the Turkish dotless-i rule would make a query match or miss depending on the
 * user's locale). A blank or whitespace-only query does not narrow anything.
 */

/** The four kinds the holding area merges. */
export const TRASH_FILTER_KINDS = ['workflow', 'skill', 'session', 'job'] as const

export type TrashFilterKind = typeof TRASH_FILTER_KINDS[number]

/** The part of a trash row this module needs; the row itself carries more. */
export interface TrashFilterRow {
  kind: TrashFilterKind
  name: string
}

export interface TrashFilterState {
  query: string
  /**
   * The kinds the user picked. Empty is not "show nothing" — it is "show every
   * kind", and the UI says so. A filter control that defaults to an empty page
   * is not a filter, it is a bug with a checkbox.
   */
  kinds: readonly TrashFilterKind[]
}

export const EMPTY_TRASH_FILTER: TrashFilterState = Object.freeze({
  query: '',
  kinds: Object.freeze([]) as readonly TrashFilterKind[],
})

/** The localized strings that sit on the row and are therefore searchable. */
export interface TrashFilterText {
  /** The kind badge, e.g. "Workflow" or "Scheduled job". */
  kind: string
  /** The row's second line: retention date, or why it cannot come back. */
  detail: string
}

export type TrashFilterTextOf<Row> = (row: Row) => TrashFilterText

export interface TrashFilterResult<Row> {
  /** The rows to render, original order preserved (newest first). */
  visible: Row[]
  /**
   * Per-kind counts under the current *text* query, with the kind selection
   * deliberately not applied. A chip reading 0 merely because it is unselected
   * could not tell the user what selecting it would show; this number is what
   * the chip promises. The header count is `visible.length`, which is the
   * number of rows actually on screen.
   */
  byKind: Record<TrashFilterKind, number>
  /** Rows the filter is keeping out of sight — what the no-match line reports. */
  hidden: number
  /** True when the text box or the kind chips narrow anything at all. */
  filtered: boolean
}

function normalizeTrashQuery(query: string): string {
  return query.trim().toLowerCase()
}

/** Add or remove one kind; never mutates the array it was given. */
export function toggleTrashKind(
  kinds: readonly TrashFilterKind[],
  kind: TrashFilterKind,
): TrashFilterKind[] {
  return kinds.includes(kind) ? kinds.filter(entry => entry !== kind) : [...kinds, kind]
}

/**
 * An empty holding area and a filter that matches nothing are different
 * answers, and the caller must keep them apart: `rows.length === 0` is the
 * first, `visible.length === 0 && rows.length > 0` is the second. This function
 * cannot say which without the rows, so it returns both counts and lets the
 * component decide — the result never conflates them.
 */
export function filterTrashRows<Row extends TrashFilterRow>(
  rows: readonly Row[],
  state: TrashFilterState,
  textOf: TrashFilterTextOf<Row>,
): TrashFilterResult<Row> {
  const query = normalizeTrashQuery(state.query)
  const allKinds = state.kinds.length === 0
  const selected = new Set<TrashFilterKind>(state.kinds)
  const byKind: Record<TrashFilterKind, number> = { workflow: 0, skill: 0, session: 0, job: 0 }
  const visible: Row[] = []

  for (const row of rows) {
    const text = textOf(row)
    const haystack = `${row.name}\n${text.kind}\n${text.detail}`.toLowerCase()
    const matchesText = query === '' || haystack.includes(query)
    if (matchesText) byKind[row.kind] += 1
    if (matchesText && (allKinds || selected.has(row.kind))) visible.push(row)
  }

  return {
    visible,
    byKind,
    hidden: rows.length - visible.length,
    filtered: query !== '' || !allKinds,
  }
}
