import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Search, X, ChevronUp, ChevronDown, CaseSensitive, User, Bot } from 'lucide-react'
import { useT } from '../../i18n'
import type { SearchRoleFilter } from '../../hooks/useConversationSearch'

interface Props {
  onSearch: (query: string) => void
  onNavigate: (direction: 'next' | 'prev') => void
  onClose: () => void
  matchCount: number
  currentMatch: number
  caseSensitive?: boolean
  onToggleCaseSensitive?: () => void
  roleFilter?: SearchRoleFilter
  onChangeRoleFilter?: (role: SearchRoleFilter) => void
}

export default function SearchBar({ onSearch, onNavigate, onClose, matchCount, currentMatch, caseSensitive = false, onToggleCaseSensitive, roleFilter = 'all', onChangeRoleFilter }: Props) {
  const t = useT()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        onNavigate(e.shiftKey ? 'prev' : 'next')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, onNavigate])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    onSearch(val)
  }, [onSearch])

  const toggleBtnStyle = (active: boolean): React.CSSProperties => ({
    background: active ? 'var(--accent)' : 'none',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    borderRadius: 3,
    color: active ? '#fff' : 'var(--text-muted)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 22,
    flexShrink: 0,
    transition: 'background 100ms, color 100ms, border-color 100ms',
  })

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        background: 'var(--popup-bg)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}
    >
      <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      <input
        ref={inputRef}
        value={query}
        onChange={handleChange}
        placeholder={t('chat.searchPlaceholder')}
        style={{
          flex: 1,
          background: 'var(--bg-input)',
          border: '1px solid var(--border)',
          borderRadius: 3,
          padding: '3px 8px',
          color: 'var(--text-primary)',
          fontSize: 12,
          outline: 'none',
        }}
      />
      {/* Case sensitive toggle */}
      {onToggleCaseSensitive && (
        <button
          onClick={onToggleCaseSensitive}
          title={t('chat.searchCaseSensitive')}
          style={toggleBtnStyle(caseSensitive)}
          onMouseEnter={(e) => { if (!caseSensitive) e.currentTarget.style.borderColor = 'var(--accent)' }}
          onMouseLeave={(e) => { if (!caseSensitive) e.currentTarget.style.borderColor = 'var(--border)' }}
        >
          <CaseSensitive size={14} />
        </button>
      )}
      {/* Role filter: User / Claude */}
      {onChangeRoleFilter && (
        <>
          <button
            onClick={() => onChangeRoleFilter(roleFilter === 'user' ? 'all' : 'user')}
            title={t('chat.searchFilterUser')}
            style={toggleBtnStyle(roleFilter === 'user')}
            onMouseEnter={(e) => { if (roleFilter !== 'user') e.currentTarget.style.borderColor = 'var(--accent)' }}
            onMouseLeave={(e) => { if (roleFilter !== 'user') e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            <User size={12} />
          </button>
          <button
            onClick={() => onChangeRoleFilter(roleFilter === 'assistant' ? 'all' : 'assistant')}
            title={t('chat.searchFilterClaude')}
            style={toggleBtnStyle(roleFilter === 'assistant')}
            onMouseEnter={(e) => { if (roleFilter !== 'assistant') e.currentTarget.style.borderColor = 'var(--accent)' }}
            onMouseLeave={(e) => { if (roleFilter !== 'assistant') e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            <Bot size={12} />
          </button>
        </>
      )}
      {query && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {matchCount > 0 ? t('chat.searchCount', { current: String(currentMatch + 1), total: String(matchCount) }) : t('chat.noMatches')}
        </span>
      )}
      <button
        onClick={() => onNavigate('prev')}
        disabled={matchCount === 0}
        title={t('chat.previousMatch')}
        style={{
          background: 'none', border: 'none', color: 'var(--text-muted)',
          cursor: matchCount > 0 ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center',
          opacity: matchCount > 0 ? 1 : 0.3,
        }}
      >
        <ChevronUp size={14} />
      </button>
      <button
        onClick={() => onNavigate('next')}
        disabled={matchCount === 0}
        title={t('chat.nextMatch')}
        style={{
          background: 'none', border: 'none', color: 'var(--text-muted)',
          cursor: matchCount > 0 ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center',
          opacity: matchCount > 0 ? 1 : 0.3,
        }}
      >
        <ChevronDown size={14} />
      </button>
      <button
        onClick={onClose}
        title={t('chat.closeSearch')}
        style={{
          background: 'none', border: 'none', color: 'var(--text-muted)',
          cursor: 'pointer', display: 'flex', alignItems: 'center',
        }}
      >
        <X size={14} />
      </button>
    </div>
  )
}
