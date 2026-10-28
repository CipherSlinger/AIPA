// Controls that sit directly above the roster: the search field and the
// select-mode action bar.

import { useState } from 'react'
import { Search, X } from 'lucide-react'
import { useT } from '../../i18n'

interface DeptSearchBoxProps {
  value: string
  onChange: (value: string) => void
}

export function DeptSearchBox({ value, onChange }: DeptSearchBoxProps) {
  const t = useT()
  const [focused, setFocused] = useState(false)

  return (
    <div style={{
      position: 'relative',
      marginBottom: 18,
    }}>
      <Search size={12} style={{
        position: 'absolute',
        left: 10,
        top: '50%',
        transform: 'translateY(-50%)',
        color: 'var(--text-muted)',
        pointerEvents: 'none',
        opacity: 0.6,
      }} />
      <input
        placeholder={t('dept.searchPlaceholder')}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%',
          padding: '6px 32px 6px 30px',
          borderRadius: 6,
          border: `1px solid ${focused ? 'rgba(99,102,241,0.40)' : 'var(--border)'}`,
          background: 'var(--bg-hover)',
          color: 'var(--text-primary)',
          fontSize: 12,
          boxSizing: 'border-box',
          outline: 'none',
          transition: 'border-color 0.15s, box-shadow 0.15s',
          boxShadow: focused ? '0 0 0 3px rgba(99,102,241,0.15)' : 'none',
        }}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          style={{
            position: 'absolute',
            right: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            padding: 2,
            display: 'flex',
            alignItems: 'center',
            borderRadius: 3,
            transition: 'color 0.15s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          <X size={11} />
        </button>
      )}
    </div>
  )
}

interface DeptSelectionBarProps {
  count: number
  onSelectAll: () => void
  onDeleteSelected: () => void
}

export function DeptSelectionBar({ count, onSelectAll, onDeleteSelected }: DeptSelectionBarProps) {
  const t = useT()

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 12px',
      background: 'rgba(99,102,241,0.08)',
      border: '1px solid rgba(99,102,241,0.2)',
      borderRadius: 8,
      marginBottom: 12,
    }}>
      <span style={{ fontSize: 12, color: '#6366f1', fontWeight: 600, flex: 1 }}>
        {t('session.selectedCount', { count })}
      </span>
      <button
        onClick={onSelectAll}
        style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
      >
        {t('session.selectAll')}
      </button>
      <button
        onClick={onDeleteSelected}
        style={{
          fontSize: 11, fontWeight: 600,
          color: '#f87171',
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 5,
          padding: '3px 10px',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'rgba(239,68,68,0.2)'
          e.currentTarget.style.borderColor = 'rgba(239,68,68,0.5)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'rgba(239,68,68,0.1)'
          e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'
        }}
      >
        {t('session.deleteSelected')} ({count})
      </button>
    </div>
  )
}
