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
 * A row skeleton that mimics a session list item (icon + two text lines).
 */
export function SkeletonSessionRow() {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '8px 12px', alignItems: 'center' }}>
      <Skeleton width={32} height={32} borderRadius="50%" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Skeleton width="70%" height={12} />
        <Skeleton width="45%" height={10} />
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
