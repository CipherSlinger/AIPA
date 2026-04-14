// Session list header toolbar — extracted from SessionList.tsx (Iteration 442)
import React, { useState, useRef, useEffect } from 'react'
import { RefreshCw, ArrowUpDown, Search, CheckSquare, Trash2, Archive, BarChart3, LayoutList, Plus } from 'lucide-react'
import { useT } from '../../i18n'

type SortOption = 'newest' | 'oldest' | 'alpha' | 'messages'

interface SessionListHeaderProps {
  filter: string
  onFilterChange: (value: string) => void
  filteredCount: number
  sortBy: SortOption
  onSortChange: (sortBy: SortOption) => void
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
  searchInputRef: React.RefObject<HTMLInputElement>
  sessionListCompact?: boolean
  onToggleCompact?: () => void
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
  sessionListCompact,
  onToggleCompact,
}: SessionListHeaderProps) {
  const t = useT()
  const [showSortDropdown, setShowSortDropdown] = useState(false)
  const sortBtnRef = useRef<HTMLButtonElement>(null)
  const sortDropdownRef = useRef<HTMLDivElement>(null)

  // Close sort dropdown on outside click or Escape
  useEffect(() => {
    if (!showSortDropdown) return
    const mouseHandler = (e: MouseEvent) => {
      if (
        sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node) &&
        sortBtnRef.current && !sortBtnRef.current.contains(e.target as Node)
      ) {
        setShowSortDropdown(false)
      }
    }
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setShowSortDropdown(false) }
    }
    document.addEventListener('mousedown', mouseHandler)
    document.addEventListener('keydown', keyHandler)
    return () => { document.removeEventListener('mousedown', mouseHandler); document.removeEventListener('keydown', keyHandler) }
  }, [showSortDropdown])

  const sortOptions: { id: SortOption; labelKey: string; shortKey: string }[] = [
    { id: 'newest', labelKey: 'session.sortNewest', shortKey: 'session.sortNew' },
    { id: 'oldest', labelKey: 'session.sortOldest', shortKey: 'session.sortOld' },
    { id: 'alpha', labelKey: 'session.sortAlpha', shortKey: 'A-Z' },
    { id: 'messages', labelKey: 'session.sortMessages', shortKey: 'session.sortMsgs' },
  ]

  // Shared resting style for icon-only toolbar buttons
  const iconBtnStyle: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    borderRadius: 8,
    color: 'var(--text-muted)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    padding: '3px 4px',
    transition: 'all 0.15s ease',
  }

  const iconBtnHover = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
    e.currentTarget.style.color = 'var(--text-primary)'
  }
  const iconBtnLeave = (e: React.MouseEvent<HTMLButtonElement>, active?: boolean) => {
    e.currentTarget.style.background = active ? '#6366f1' : 'transparent'
    e.currentTarget.style.color = active ? 'var(--text-primary)' : 'var(--text-muted)'
  }

  return (
    <div style={{
      padding: '8px 10px',
      background: 'var(--glass-bg-popup)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--glass-border)',
      display: 'flex',
      gap: 4,
      flexShrink: 0,
      alignItems: 'center',
    }}>
      {/* Sessions label + count badge */}
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-faint)', flexShrink: 0 }}>
        Sessions
      </span>
      {filteredCount > 0 && (
        <span style={{
          background: 'var(--glass-border)',
          borderRadius: 10,
          padding: '1px 6px',
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--text-faint)',
          flexShrink: 0,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {filteredCount}
        </span>
      )}
      {/* Search input */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
        <Search size={12} style={{ position: 'absolute', left: 8, color: 'var(--text-faint)', pointerEvents: 'none' }} />
        <input
          ref={searchInputRef}
          value={filter}
          onChange={(e) => { onFilterChange(e.target.value) }}
          onKeyDown={onSearchKeyDown}
          placeholder={t('session.search')}
          style={{
            flex: 1,
            width: '100%',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid var(--glass-border)',
            borderRadius: 6,
            padding: '4px 10px 4px 26px',
            color: 'var(--text-primary)',
            fontSize: 12,
            outline: 'none',
            transition: 'all 0.15s ease',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'rgba(99,102,241,0.45)'
            e.currentTarget.style.background = 'var(--glass-border)'
            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.10)'
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--glass-border)'
            e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        />
        {filter && (
          <span style={{
            position: 'absolute',
            right: 8,
            fontSize: 10,
            color: filteredCount === 0 ? '#f87171' : 'var(--text-faint)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {filteredCount === 0 ? t('session.noResults') : t('session.results', { count: filteredCount })}
          </span>
        )}
      </div>
      {/* Refresh */}
      <button
        onClick={onRefresh}
        title={t('session.refresh')}
        style={iconBtnStyle}
        onMouseEnter={iconBtnHover}
        onMouseLeave={(e) => iconBtnLeave(e)}
      >
        <RefreshCw size={13} />
      </button>
      {/* Sort */}
      <div style={{ position: 'relative' }}>
        <button
          ref={sortBtnRef}
          onClick={() => setShowSortDropdown(!showSortDropdown)}
          title={`${t('session.sort')}: ${sortBy === 'newest' ? t('session.sortNewest') : sortBy === 'oldest' ? t('session.sortOldest') : sortBy === 'messages' ? t('session.sortMessages') : t('session.sortAlpha')}`}
          style={{
            ...iconBtnStyle,
            background: showSortDropdown ? 'rgba(255,255,255,0.08)' : 'transparent',
            color: showSortDropdown ? 'var(--text-primary)' : 'var(--text-muted)',
            gap: 2,
            fontSize: 10,
          }}
          onMouseEnter={iconBtnHover}
          onMouseLeave={(e) => iconBtnLeave(e, showSortDropdown)}
        >
          <ArrowUpDown size={11} />
          <span>{sortBy === 'newest' ? t('session.sortNew') : sortBy === 'oldest' ? t('session.sortOld') : sortBy === 'messages' ? t('session.sortMsgs') : 'A-Z'}</span>
        </button>
        {showSortDropdown && (
          <div
            ref={sortDropdownRef}
            className="popup-enter"
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 4,
              background: 'var(--glass-bg-deep)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid var(--glass-border-md)',
              borderRadius: 8,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
              padding: '4px 0',
              zIndex: 100,
              minWidth: 130,
              animation: 'slideUp 0.15s ease',
            }}
          >
            {sortOptions.map(opt => {
              const isActive = sortBy === opt.id
              return (
                <button
                  key={opt.id}
                  onClick={() => { onSortChange(opt.id); setShowSortDropdown(false) }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    width: '100%',
                    padding: '5px 12px',
                    background: isActive ? 'rgba(99,102,241,0.15)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 11,
                    color: isActive ? '#818cf8' : 'var(--text-primary)',
                    fontWeight: isActive ? 600 : 400,
                    textAlign: 'left',
                    borderRadius: 0,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                >
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: isActive ? '#818cf8' : 'transparent',
                    border: `1.5px solid ${isActive ? '#818cf8' : 'var(--text-faint)'}`,
                    flexShrink: 0,
                  }} />
                  {opt.id === 'alpha' ? 'A-Z' : t(opt.labelKey)}
                </button>
              )
            })}
          </div>
        )}
      </div>
      {/* Select mode */}
      <button
        onClick={onToggleSelectMode}
        title={selectMode ? t('session.exitSelect') : t('session.selectMode')}
        style={{
          ...iconBtnStyle,
          background: selectMode ? '#6366f1' : 'transparent',
          color: selectMode ? 'var(--text-primary)' : 'var(--text-muted)',
          padding: selectMode ? '2px 5px' : '3px 4px',
        }}
        onMouseEnter={(e) => { if (!selectMode) iconBtnHover(e) }}
        onMouseLeave={(e) => iconBtnLeave(e, selectMode)}
      >
        <CheckSquare size={13} />
      </button>
      {/* Delete all */}
      <button
        onClick={onDeleteAll}
        title={t('session.deleteAll')}
        style={{ ...iconBtnStyle, color: '#f87171' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(248,113,113,0.12)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
      >
        <Trash2 size={13} />
      </button>
      {/* Archive toggle */}
      <button
        onClick={onToggleArchived}
        title={showArchived ? t('session.hideArchived') : `${t('session.showArchived')}${archivedCount > 0 ? ` (${archivedCount})` : ''}`}
        style={{
          ...iconBtnStyle,
          background: showArchived ? '#6366f1' : 'transparent',
          color: showArchived ? 'var(--text-primary)' : 'var(--text-muted)',
          padding: showArchived ? '2px 5px' : '3px 4px',
          position: 'relative',
        }}
        onMouseEnter={(e) => { if (!showArchived) iconBtnHover(e) }}
        onMouseLeave={(e) => iconBtnLeave(e, showArchived)}
      >
        <Archive size={13} />
        {!showArchived && archivedCount > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -5,
            background: 'rgba(255,255,255,0.08)',
            borderRadius: 10,
            padding: '1px 4px',
            fontSize: 8,
            fontWeight: 600,
            color: 'var(--text-faint)',
            lineHeight: 1.4,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {archivedCount > 99 ? '99' : archivedCount}
          </span>
        )}
      </button>
      {/* Stats */}
      <button
        onClick={onToggleStats}
        title={t('session.statsTitle')}
        style={{
          ...iconBtnStyle,
          background: showStats ? '#6366f1' : 'transparent',
          color: showStats ? 'var(--text-primary)' : 'var(--text-muted)',
          padding: showStats ? '2px 5px' : '3px 4px',
        }}
        onMouseEnter={(e) => { if (!showStats) iconBtnHover(e) }}
        onMouseLeave={(e) => iconBtnLeave(e, showStats)}
      >
        <BarChart3 size={13} />
      </button>
      {/* Compact toggle */}
      {onToggleCompact && (
        <button
          onClick={onToggleCompact}
          title={t('session.compactViewTooltip')}
          style={{
            ...iconBtnStyle,
            background: sessionListCompact ? '#6366f1' : 'transparent',
            color: sessionListCompact ? 'var(--text-primary)' : 'var(--text-muted)',
            padding: sessionListCompact ? '2px 5px' : '3px 4px',
          }}
          onMouseEnter={(e) => { if (!sessionListCompact) iconBtnHover(e) }}
          onMouseLeave={(e) => iconBtnLeave(e, sessionListCompact)}
        >
          <LayoutList size={13} />
        </button>
      )}
    </div>
  )
}
