// Session list header toolbar — extracted from SessionList.tsx (Iteration 441)
import React from 'react'
import { RefreshCw, ArrowUpDown, Search, CheckSquare, Trash2, Archive, BarChart3 } from 'lucide-react'
import { useT } from '../../i18n'

interface SessionListHeaderProps {
  filter: string
  onFilterChange: (value: string) => void
  filteredCount: number
  sortBy: 'newest' | 'oldest' | 'alpha' | 'messages'
  onSortChange: () => void
  selectMode: boolean
  onToggleSelectMode: () => void
  showArchived: boolean
  archivedCount: number
  onToggleArchived: () => void
  showStats: boolean
  onToggleStats: () => void
  onRefresh: () => void
  onDeleteAll: () => void
  onSearchKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  showGlobalResults: boolean
  searchInputRef: React.RefObject<HTMLInputElement | null>
}

export default function SessionListHeader({
  filter,
  onFilterChange,
  filteredCount,
  sortBy,
  onSortChange,
  selectMode,
  onToggleSelectMode,
  showArchived,
  archivedCount,
  onToggleArchived,
  showStats,
  onToggleStats,
  onRefresh,
  onDeleteAll,
  onSearchKeyDown,
  showGlobalResults,
  searchInputRef,
}: SessionListHeaderProps) {
  const t = useT()

  return (
    <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
        <Search size={14} style={{ position: 'absolute', left: 8, color: 'var(--text-muted)', pointerEvents: 'none' }} />
        <input
          ref={searchInputRef}
          value={filter}
          onChange={(e) => { onFilterChange(e.target.value) }}
          onKeyDown={onSearchKeyDown}
          placeholder={t('session.search')}
          style={{
            flex: 1,
            width: '100%',
            background: 'var(--bg-input)',
            border: '1px solid transparent',
            borderRadius: 6,
            padding: '6px 10px 6px 28px',
            color: 'var(--text-primary)',
            fontSize: 12,
            outline: 'none',
            transition: 'border-color 0.15s ease',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'transparent')}
        />
        {filter && (
          <span style={{
            position: 'absolute',
            right: 8,
            fontSize: 10,
            color: filteredCount === 0 ? 'var(--error)' : 'var(--text-muted)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}>
            {filteredCount === 0 ? t('session.noResults') : t('session.results', { count: filteredCount })}
          </span>
        )}
      </div>
      <button
        onClick={onRefresh}
        title={t('session.refresh')}
        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
      >
        <RefreshCw size={13} />
      </button>
      <button
        onClick={onSortChange}
        title={`${t('session.sort')}: ${sortBy === 'newest' ? t('session.sortNewest') : sortBy === 'oldest' ? t('session.sortOldest') : sortBy === 'messages' ? t('session.sortMessages') : t('session.sortAlpha')}`}
        style={{
          background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 2, fontSize: 10,
        }}
      >
        <ArrowUpDown size={11} />
        <span>{sortBy === 'newest' ? t('session.sortNew') : sortBy === 'oldest' ? t('session.sortOld') : sortBy === 'messages' ? t('session.sortMsgs') : 'A-Z'}</span>
      </button>
      <button
        onClick={onToggleSelectMode}
        title={selectMode ? t('session.exitSelect') : t('session.selectMode')}
        style={{
          background: selectMode ? 'var(--accent)' : 'none',
          border: 'none',
          color: selectMode ? '#fff' : 'var(--text-muted)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          borderRadius: 3,
          padding: selectMode ? '1px 4px' : 0,
        }}
      >
        <CheckSquare size={13} />
      </button>
      <button
        onClick={onDeleteAll}
        title={t('session.deleteAll')}
        style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
      >
        <Trash2 size={13} />
      </button>
      <button
        onClick={onToggleArchived}
        title={showArchived ? t('session.hideArchived') : `${t('session.showArchived')}${archivedCount > 0 ? ` (${archivedCount})` : ''}`}
        style={{
          background: showArchived ? 'var(--accent)' : 'none',
          border: 'none',
          color: showArchived ? '#fff' : 'var(--text-muted)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          borderRadius: 3,
          padding: showArchived ? '1px 4px' : 0,
          position: 'relative',
        }}
      >
        <Archive size={13} />
        {!showArchived && archivedCount > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -6,
            background: 'var(--accent)', color: '#fff',
            fontSize: 8, fontWeight: 700,
            width: 14, height: 14, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {archivedCount > 99 ? '99' : archivedCount}
          </span>
        )}
      </button>
      <button
        onClick={onToggleStats}
        title={t('session.statsTitle')}
        style={{
          background: showStats ? 'var(--accent)' : 'none',
          border: 'none',
          color: showStats ? '#fff' : 'var(--text-muted)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          borderRadius: 3,
          padding: showStats ? '1px 4px' : 0,
        }}
      >
        <BarChart3 size={13} />
      </button>
    </div>
  )
}
