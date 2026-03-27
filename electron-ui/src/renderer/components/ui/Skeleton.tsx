import React from 'react'

interface SkeletonProps {
  width?: string | number
  height?: string | number
  borderRadius?: string | number
  style?: React.CSSProperties
}

/**
 * Animated loading skeleton placeholder.
 * Uses a CSS pulse animation via globals.css .skeleton class.
 */
export default function Skeleton({ width = '100%', height = 16, borderRadius = 4, style }: SkeletonProps) {
  return (
    <div
      className="skeleton"
      style={{
        width,
        height,
        borderRadius,
        background: 'var(--bg-secondary, #252526)',
        ...style,
      }}
    />
  )
}

/**
 * A row skeleton that mimics a session list item (square avatar icon + title row + preview row).
 */
export function SkeletonSessionRow() {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '10px 12px', alignItems: 'center' }}>
      {/* Square avatar skeleton (matches 36x36, borderRadius 8) */}
      <Skeleton width={36} height={36} borderRadius={8} style={{ flexShrink: 0 }} />
      {/* Text area: title row (70%) + preview row (50%) */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <Skeleton width="65%" height={12} />
          <Skeleton width={40} height={10} />
        </div>
        <Skeleton width="50%" height={10} />
      </div>
    </div>
  )
}

/**
 * A message-shaped skeleton (avatar + two paragraphs).
 */
export function SkeletonMessage() {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '8px 20px', alignItems: 'flex-start' }}>
      <Skeleton width={28} height={28} borderRadius="50%" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Skeleton width="85%" height={12} />
        <Skeleton width="65%" height={12} />
        <Skeleton width="50%" height={12} />
      </div>
    </div>
  )
}
