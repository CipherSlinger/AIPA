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
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        opacity: 0.7,
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-sessionpanel)',
        position: 'sticky',
        top: 0,
        zIndex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'background 0.1s ease',
      }}
    >
      {isCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
      <span style={{ flex: 1 }}>{group}</span>
      <span style={{ fontSize: 9, opacity: 0.6 }}>{count}</span>
    </div>
  )
}
