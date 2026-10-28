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
      background: 'var(--glass-bg-low)',
      border: '1px solid var(--glass-border)',
      borderRadius: 10,
      marginBottom: 12,
      overflow: 'hidden',
      // On single-column pages the card is centred at a readable measure, so a
      // wide window never turns its inputs into full-width rulers. In the
      // General page's two-column flow the column is narrower than this cap.
      // `width: 100%` is required: auto cross-axis margins in the column flex
      // container would otherwise shrink the card to its fit-content width.
      width: '100%',
      maxWidth: 800,
      marginLeft: 'auto',
      marginRight: 'auto',
      breakInside: 'avoid',
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
          color: 'var(--text-primary)',
          textAlign: 'left',
          transition: 'background 0.15s ease',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
      >
        <span style={{ color: 'var(--text-faint)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>{icon}</span>
        <span style={{
          flex: 1,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          color: 'var(--text-subtle)',
        }}>{title}</span>
        {expanded
          ? <ChevronDown size={14} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
          : <ChevronRight size={14} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
        }
      </button>
      {/* A 0fr → 1fr grid track animates to the content's natural height, so a
          tall group is never clipped (a fixed max-height cap would cut it off). */}
      <div style={{
        display: 'grid',
        gridTemplateRows: expanded ? '1fr' : '0fr',
        transition: 'grid-template-rows 0.15s ease',
      }}>
        <div style={{
          overflow: 'hidden',
          minHeight: 0,
          opacity: expanded ? 1 : 0,
          transition: 'opacity 0.15s ease',
        }}>
          <div style={{ padding: '4px 16px 14px' }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
