import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react'

interface Props {
  onSearch: (query: string) => void
  onNavigate: (direction: 'next' | 'prev') => void
  onClose: () => void
  matchCount: number
  currentMatch: number
}

export default function SearchBar({ onSearch, onNavigate, onClose, matchCount, currentMatch }: Props) {
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
        placeholder="Search in conversation..."
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
      {query && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {matchCount > 0 ? `${currentMatch + 1} / ${matchCount}` : 'No matches'}
        </span>
      )}
      <button
        onClick={() => onNavigate('prev')}
        disabled={matchCount === 0}
        title="Previous match (Shift+Enter)"
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
        title="Next match (Enter)"
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
        title="Close (Escape)"
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
