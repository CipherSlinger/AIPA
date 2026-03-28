import React, { useState, useCallback } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'

interface SettingsGroupProps {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  groupKey: string
}

export default function SettingsGroup({ title, icon, children, groupKey }: SettingsGroupProps) {
  const [expanded, setExpanded] = useState(() => {
    try {
      const stored = localStorage.getItem(`aipa:settings-group-${groupKey}`)
      return stored !== null ? stored === 'true' : true
    } catch { return true }
  })

  const toggle = useCallback(() => {
    setExpanded(prev => {
      const next = !prev
      try { localStorage.setItem(`aipa:settings-group-${groupKey}`, String(next)) } catch {}
      return next
    })
  }, [groupKey])

  return (
    <div style={{ marginBottom: 4 }}>
      <button
        onClick={toggle}
        aria-expanded={expanded}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: '8px 10px',
          background: 'none',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          color: 'var(--text-primary)',
          fontSize: 12,
          fontWeight: 600,
          textAlign: 'left',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
      >
        <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>{icon}</span>
        <span style={{ flex: 1 }}>{title}</span>
        {expanded
          ? <ChevronDown size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          : <ChevronRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        }
      </button>
      <div style={{
        overflow: 'hidden',
        maxHeight: expanded ? 2000 : 0,
        opacity: expanded ? 1 : 0,
        transition: 'max-height 0.3s ease, opacity 0.2s ease',
        padding: expanded ? '4px 10px 8px' : '0 10px',
      }}>
        {children}
      </div>
    </div>
  )
}
