import React, { useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'

// Dropdowns rendered inside headers/toolbars get trapped in their parent's
// stacking context and end up under message bubbles, date dividers or the
// input toolbar. Rendering into document.body with fixed coordinates keeps
// them above everything regardless of where the anchor lives.

type Placement = 'below-start' | 'above-end'

interface FloatingPortalProps {
  anchorRef: React.RefObject<HTMLElement>
  placement: Placement
  children: React.ReactNode
  gap?: number
}

const FLOATING_Z_INDEX = 1000

function computeStyle(anchor: HTMLElement, placement: Placement, gap: number): React.CSSProperties {
  const r = anchor.getBoundingClientRect()
  if (placement === 'below-start') {
    return { top: r.bottom + gap, left: Math.max(8, r.left) }
  }
  return { bottom: window.innerHeight - r.top + gap, right: Math.max(8, window.innerWidth - r.right) }
}

const FloatingPortal = React.forwardRef<HTMLDivElement, FloatingPortalProps>(
  function FloatingPortal({ anchorRef, placement, children, gap = 4 }, ref) {
    const [pos, setPos] = useState<React.CSSProperties | null>(null)

    useLayoutEffect(() => {
      const update = () => {
        if (anchorRef.current) setPos(computeStyle(anchorRef.current, placement, gap))
      }
      update()
      window.addEventListener('resize', update)
      window.addEventListener('scroll', update, true)
      return () => {
        window.removeEventListener('resize', update)
        window.removeEventListener('scroll', update, true)
      }
    }, [anchorRef, placement, gap])

    if (!pos) return null
    return createPortal(
      <div ref={ref} style={{ position: 'fixed', zIndex: FLOATING_Z_INDEX, ...pos }}>
        {children}
      </div>,
      document.body,
    )
  },
)

export default FloatingPortal
