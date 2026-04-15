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
    background: active ? '#6366f1' : 'none',
    border: `1px solid ${active ? '#6366f1' : 'var(--border)'}`,
    borderRadius: 8,
    color: active ? 'rgba(255,255,255,0.95)' : 'var(--text-muted)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 22,
    flexShrink: 0,
    transition: 'background 0.15s ease, color 0.15s ease, border-color 0.15s ease',
  })

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 8px',
        background: 'var(--popup-bg)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
        flexShrink: 0,
        transition: 'border-color 0.15s ease',
        animation: 'slideUp 0.15s ease',
      }}
    >
      <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      <input
        ref={inputRef}
        value={query}
        onChange={handleChange}
        placeholder={t('chat.searchPlaceholder')}
        className="search-bar-input"
        onFocus={(e) => {
          const parent = e.currentTarget.closest('div') as HTMLElement | null
          if (parent) { parent.style.borderColor = 'rgba(99,102,241,0.40)'; parent.style.boxShadow = '0 4px 16px rgba(0,0,0,0.4), 0 0 0 3px rgba(99,102,241,0.10)' }
        }}
        onBlur={(e) => {
          const parent = e.currentTarget.closest('div') as HTMLElement | null
          if (parent) { parent.style.borderColor = 'var(--border)'; parent.style.boxShadow = '0 4px 16px rgba(0,0,0,0.4)' }
        }}
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: 'var(--text-primary)',
          fontSize: 13,
          lineHeight: 1.5,
        }}
      />
      {/* Case sensitive toggle */}
      {onToggleCaseSensitive && (
        <button
          onClick={onToggleCaseSensitive}
          title={t('chat.searchCaseSensitive')}
          style={toggleBtnStyle(caseSensitive)}
          onMouseEnter={(e) => { if (!caseSensitive) e.currentTarget.style.borderColor = '#6366f1' }}
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
            onMouseEnter={(e) => { if (roleFilter !== 'user') e.currentTarget.style.borderColor = '#6366f1' }}
            onMouseLeave={(e) => { if (roleFilter !== 'user') e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            <User size={12} />
          </button>
          <button
            onClick={() => onChangeRoleFilter(roleFilter === 'assistant' ? 'all' : 'assistant')}
            title={t('chat.searchFilterClaude')}
            style={toggleBtnStyle(roleFilter === 'assistant')}
            onMouseEnter={(e) => { if (roleFilter !== 'assistant') e.currentTarget.style.borderColor = '#6366f1' }}
            onMouseLeave={(e) => { if (roleFilter !== 'assistant') e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            <Bot size={12} />
          </button>
        </>
      )}
      {query && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          {matchCount > 0 ? t('chat.searchCount', { current: String(currentMatch + 1), total: String(matchCount) }) : t('chat.noMatches')}
        </span>
      )}
      <button
        onClick={() => onNavigate('prev')}
        disabled={matchCount === 0}
        title={t('chat.previousMatch')}
        style={{
          background: 'transparent', border: 'none', color: 'var(--text-muted)',
          borderRadius: 8, padding: '3px 5px', transition: 'all 0.15s ease',
          cursor: matchCount > 0 ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center',
          opacity: matchCount > 0 ? 1 : 0.3,
        }}
        onMouseEnter={(e) => { if (matchCount > 0) { e.currentTarget.style.background = 'rgba(99,102,241,0.10)'; e.currentTarget.style.color = '#a5b4fc' } }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
      >
        <ChevronUp size={14} />
      </button>
      <button
        onClick={() => onNavigate('next')}
        disabled={matchCount === 0}
        title={t('chat.nextMatch')}
        style={{
          background: 'transparent', border: 'none', color: 'var(--text-muted)',
          borderRadius: 8, padding: '3px 5px', transition: 'all 0.15s ease',
          cursor: matchCount > 0 ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center',
          opacity: matchCount > 0 ? 1 : 0.3,
        }}
        onMouseEnter={(e) => { if (matchCount > 0) { e.currentTarget.style.background = 'rgba(99,102,241,0.10)'; e.currentTarget.style.color = '#a5b4fc' } }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
      >
        <ChevronDown size={14} />
      </button>
      <button
        onClick={onClose}
        title={t('chat.closeSearch')}
        style={{
          background: 'transparent', border: 'none', color: 'var(--text-muted)',
          borderRadius: 8, padding: '3px 5px', transition: 'all 0.15s ease',
          cursor: 'pointer', display: 'flex', alignItems: 'center',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.10)'; e.currentTarget.style.color = '#f87171' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
      >
        <X size={14} />
      </button>
    </div>
  )
}
