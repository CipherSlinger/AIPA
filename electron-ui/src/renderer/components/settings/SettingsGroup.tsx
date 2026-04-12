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
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 10,
      marginBottom: 12,
      overflow: 'hidden',
    }}>
      <button
        onClick={toggle}
        aria-expanded={expanded}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: '10px 16px',
          background: 'none',
          border: 'none',
          borderRadius: expanded ? '10px 10px 0 0' : 10,
          cursor: 'pointer',
          color: 'rgba(255,255,255,0.82)',
          textAlign: 'left',
          transition: 'background 0.15s ease',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
      >
        <span style={{ color: 'rgba(255,255,255,0.38)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>{icon}</span>
        <span style={{
          flex: 1,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.38)',
        }}>{title}</span>
        {expanded
          ? <ChevronDown size={14} style={{ color: 'rgba(255,255,255,0.38)', flexShrink: 0 }} />
          : <ChevronRight size={14} style={{ color: 'rgba(255,255,255,0.38)', flexShrink: 0 }} />
        }
      </button>
      <div style={{
        overflow: 'hidden',
        maxHeight: expanded ? 2000 : 0,
        opacity: expanded ? 1 : 0,
        transition: 'max-height 0.15s ease, opacity 0.15s ease',
        padding: expanded ? '4px 16px 14px' : '0 16px',
      }}>
        {children}
      </div>
    </div>
  )
}
