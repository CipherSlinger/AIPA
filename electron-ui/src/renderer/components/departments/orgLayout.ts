// The arithmetic behind the org chart's two shapes.
//
// Split out of OrgChart.tsx so the card geometry (which the section renderer and
// the chart's own width cap both need) lives in one place, and so the numbers
// can be reasoned about without reading JSX.
//
// Why pixels and not percentages: the connector bus is drawn between card
// *centres*, and a percentage width would leave the bus short (or long) by the
// gap between cards. Every coordinate here is therefore an absolute pixel value
// derived from the measured container width.
//
// The two shapes:
//
//   1 row  — symmetric: HQ centred, a trunk dropping straight into the middle of
//            the row, with a bus spanning the card centres.
//   2+ rows — a rail: the trunk runs down the left edge and every row hangs off
//            it on its own bus. Column count comes from the measured width, and
//            the rows are balanced so the last one never holds a single stray
//            card. Past DENSE_FROM departments the cards themselves compact and
//            more columns fit.

/** Horizontal gap between cards in a row. */
export const GAP = 16
/** Below this card width a card stops being readable, so a column is dropped. */
export const CARD_MIN_FULL = 216
export const CARD_MIN_DENSE = 180
/** Cards stop growing past this width — otherwise one department gets a billboard. */
export const CARD_MAX_FULL = 400
export const CARD_MAX_DENSE = 300
export const MAX_COLS_FULL = 4
export const MAX_COLS_DENSE = 5
/** Department count at which cards compact to keep the whole tree on screen. */
export const DENSE_FROM = 9
/** X of the rail in the multi-row layout, and the gap between rail and cards. */
const RAIL_X = 26
const RAIL_GAP = 26

/** Connector lengths — tightened in dense mode to keep many rows compact. */
export interface TreeMetrics { trunk: number; drop: number; rowGap: number }
export const METRICS_FULL: TreeMetrics = { trunk: 28, drop: 28, rowGap: 26 }
export const METRICS_DENSE: TreeMetrics = { trunk: 20, drop: 20, rowGap: 16 }

export interface TreeLayout {
  /** Card count per row — always sums to the number of departments. */
  rows: number[]
  cols: number
  cardWidth: number
  /** Left edge of the card area (top-left of the first card). */
  cardLeft: number
  /** X of the trunk: the pane centre in single-row mode, the rail otherwise. */
  spineX: number
  single: boolean
  metrics: TreeMetrics
}

/**
 * Split `count` cards into rows of at most `cols`, then even out a lone trailing
 * card — `4 + 1` reads as a stray, `3 + 2` reads as deliberate. Only safe with
 * 3+ columns, since borrowing would otherwise leave the row above with one card.
 */
export function balanceRows(count: number, cols: number): number[] {
  const rows: number[] = []
  for (let left = count; left > 0;) {
    const take = Math.min(cols, left)
    rows.push(take)
    left -= take
  }
  if (rows.length >= 2 && rows[rows.length - 1] === 1 && cols >= 3) {
    rows[rows.length - 2] -= 1
    rows[rows.length - 1] = 2
  }
  return rows
}

export function computeLayout(width: number, count: number, dense: boolean): TreeLayout | null {
  if (width <= 0 || count <= 0) return null
  const cardMin = dense ? CARD_MIN_DENSE : CARD_MIN_FULL
  const cardMax = dense ? CARD_MAX_DENSE : CARD_MAX_FULL
  const maxCols = dense ? MAX_COLS_DENSE : MAX_COLS_FULL
  const railOffset = RAIL_X + RAIL_GAP

  const colsWithin = (avail: number) =>
    Math.max(1, Math.min(maxCols, Math.floor((avail + GAP) / (cardMin + GAP))))

  // The rail costs a lane on the left, so first ask how many columns fit with it
  // taken out. If everything still lands on one row, the rail is unnecessary and
  // the full width is available again.
  const colsWithRail = colsWithin(width - railOffset)
  const single = count <= colsWithRail
  const cols = single ? colsWithin(width) : colsWithRail

  const rows = balanceRows(count, cols)
  const avail = width - (single ? 0 : railOffset)
  const cardWidth = Math.min(cardMax, Math.max(0, (avail - (cols - 1) * GAP) / cols))
  const rowWidth = count * cardWidth + (count - 1) * GAP
  return {
    rows,
    cols,
    cardWidth,
    cardLeft: single ? Math.max(0, (width - rowWidth) / 2) : railOffset,
    spineX: single ? width / 2 : RAIL_X,
    single,
    metrics: dense ? METRICS_DENSE : METRICS_FULL,
  }
}

/** Centre x of each card in a row of `size`, in container coordinates. */
export function rowCenters(size: number, cardWidth: number, cardLeft: number): number[] {
  return Array.from({ length: size }, (_, i) => cardLeft + i * (cardWidth + GAP) + cardWidth / 2)
}