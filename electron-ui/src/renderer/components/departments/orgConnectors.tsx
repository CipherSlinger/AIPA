// The two primitives every connector in the org chart is drawn from.
//
// They are plain divs rather than an SVG overlay because every coordinate in the
// chart is already a pixel value derived from the measured container width, and
// absolute-positioned divs put those values exactly where the arithmetic says
// without a second coordinate system to keep in sync.
//
// Both are pointer-events:none and non-interactive: a connector must never
// intercept a click meant for the card beneath it.

export interface VLineProps {
  /** Centre x in container coordinates. The 2px stroke straddles it. */
  x: number
  top: number
  /** Omit together with `stretch` to run to the container's bottom edge. */
  height?: number
  stretch?: boolean
}

/** Vertical connector at x (px), from `top` downwards. */
export function VLine({ x, top, height, stretch }: VLineProps) {
  return (
    <div style={{
      position: 'absolute',
      left: x - 1,
      top,
      ...(stretch ? { bottom: 0 } : { height }),
      width: 2,
      borderRadius: 2,
      background: 'linear-gradient(180deg, rgba(99,102,241,0.55), rgba(99,102,241,0.22))',
      pointerEvents: 'none',
    }} />
  )
}

export interface HLineProps {
  /** Left end, in container coordinates. */
  from: number
  /** Right end — a bus shorter than 1px is not worth drawing. */
  to: number
  top: number
}

/** Horizontal bus line between two card centres. */
export function HLine({ from, to, top }: HLineProps) {
  if (to - from <= 1) return null
  return (
    <div style={{
      position: 'absolute',
      left: from,
      width: to - from,
      top,
      height: 2,
      borderRadius: 2,
      background: 'linear-gradient(90deg, rgba(99,102,241,0.22), rgba(99,102,241,0.55), rgba(99,102,241,0.22))',
      pointerEvents: 'none',
    }} />
  )
}