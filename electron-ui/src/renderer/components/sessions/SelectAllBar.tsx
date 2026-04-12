import React from 'react'
import { CheckSquare, Square } from 'lucide-react'
import { SessionListItem } from '../../types/app.types'
import { useT } from '../../i18n'

/**
 * SelectAllBar — select-all checkbox bar extracted from SessionList.tsx (Iteration 452)
 */
interface SelectAllBarProps {
  filtered: SessionListItem[]
  currentSessionId: string | null
  selectedIds: Set<string>
  onSetSelectedIds: (ids: Set<string>) => void
}

export default function SelectAllBar({ filtered, currentSessionId, selectedIds, onSetSelectedIds }: SelectAllBarProps) {
  const t = useT()

  const selectableIds = filtered
    .filter(s => s.sessionId !== currentSessionId)
    .map(s => s.sessionId)
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selectedIds.has(id))

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 10px',
      flexShrink: 0,
      background: 'rgba(15,15,25,0.95)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 8,
      fontSize: 12,
      color: 'rgba(255,255,255,0.60)',
    }}>
      <button
        onClick={() => {
          if (allSelected) {
            onSetSelectedIds(new Set())
          } else {
            onSetSelectedIds(new Set(selectableIds))
          }
        }}
        style={{
          background: 'none',
          border: 'none',
          color: 'rgba(255,255,255,0.60)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: 0,
          fontSize: 12,
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.82)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.60)' }}
      >
        {allSelected
          ? <CheckSquare size={13} style={{ color: '#6366f1' }} />
          : <Square size={13} style={{ color: 'rgba(255,255,255,0.38)' }} />
        }
        <span>{t('session.selectAll')}</span>
      </button>
      {selectedIds.size > 0 && (
        <span style={{
          marginLeft: 'auto',
          background: 'rgba(99,102,241,0.18)',
          border: '1px solid rgba(99,102,241,0.28)',
          borderRadius: 20,
          padding: '1px 7px',
          fontSize: 10,
          fontWeight: 700,
          color: '#818cf8',
          fontVariantNumeric: 'tabular-nums',
          fontFeatureSettings: '"tnum"',
          letterSpacing: '0.02em',
        }}>
          {t('session.selectedCount', { count: String(selectedIds.size) })}
        </span>
      )}
    </div>
  )
}
