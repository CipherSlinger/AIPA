// DateGroupHeader — extracted from SessionList.tsx (Iteration 450)
// Collapsible date group header for session list (Today, Yesterday, This Week, etc.)
import React from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'

interface DateGroupHeaderProps {
  group: string
  count: number
  isCollapsed: boolean
  onToggle: () => void
}

export default function DateGroupHeader({ group, count, isCollapsed, onToggle }: DateGroupHeaderProps) {
  return (
    <div
      onClick={onToggle}
      style={{
        padding: '6px 14px 4px',
        position: 'sticky',
        top: 0,
        zIndex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'all 0.15s ease',
        background: 'var(--glass-bg-high)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      {/* left divider line */}
      <span style={{ flex: 1, height: 1, background: 'var(--glass-border)' }} />

      {/* label — micro-label style */}
      <span style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '0 8px',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.07em',
        textTransform: 'uppercase' as const,
        color: 'var(--text-faint)',
        lineHeight: 1,
      }}>
        {isCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
        {group}
        {/* count badge */}
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255,255,255,0.08)',
          color: 'var(--text-faint)',
          borderRadius: 6,
          padding: '0 5px',
          fontSize: 10,
          fontWeight: 600,
          lineHeight: '16px',
          height: 16,
          letterSpacing: 0,
          textTransform: 'none' as const,
          fontVariantNumeric: 'tabular-nums',
          fontFeatureSettings: '"tnum"',
        }}>{count}</span>
      </span>

      {/* right divider line */}
      <span style={{ flex: 1, height: 1, background: 'var(--glass-border)' }} />
    </div>
  )
}
