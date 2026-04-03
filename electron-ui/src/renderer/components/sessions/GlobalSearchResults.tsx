import React, { useState, useEffect, useCallback } from 'react'
import { MessageSquare, Globe, X } from 'lucide-react'
import { useT, useDateLocale } from '../../i18n'
import { getSessionAvatarColor } from './sessionUtils'
import HighlightText from './HighlightText'
import { formatDistanceToNow } from 'date-fns'

interface GlobalSearchResult {
  sessionId: string
  title?: string
  project: string
  matchType: 'title' | 'content'
  snippet: string
  timestamp: number
}

interface GlobalSearchResultsProps {
  results: GlobalSearchResult[]
  isSearching: boolean
  lastQuery: string
  currentSessionId: string | null
  onOpenSession: (sessionId: string) => void
  onClose: () => void
}

export default function GlobalSearchResults({
  results,
  isSearching,
  lastQuery,
  currentSessionId,
  onOpenSession,
  onClose,
}: GlobalSearchResultsProps) {
  const t = useT()
  const dateLocale = useDateLocale()
  const [focusedIdx, setFocusedIdx] = useState(-1)

  // Reset focused index when results change
  useEffect(() => { setFocusedIdx(-1) }, [results])

  // Keyboard navigation: ArrowUp/Down to navigate, Enter to open, Escape to close
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIdx(prev => Math.min(prev + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIdx(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && focusedIdx >= 0 && focusedIdx < results.length) {
      e.preventDefault()
      onOpenSession(results[focusedIdx].sessionId)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }, [results, focusedIdx, onOpenSession, onClose])

  useEffect(() => {
    if (results.length === 0) return
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [results.length, handleKeyDown])

  return (
    <div style={{
      borderBottom: '1px solid var(--border)',
      maxHeight: '50%',
      overflowY: 'auto',
      flexShrink: 0,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 12px',
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--text-muted)',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.5px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--popup-bg)',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Globe size={10} />
          {isSearching
            ? t('session.globalSearching')
            : results.length === 0
              ? t('session.globalSearchNoResults')
              : t('session.globalSearchResults', { count: String(results.length) })}
        </span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
        >
          <X size={12} />
        </button>
      </div>
      {results.map((result, idx) => {
        const isActive = result.sessionId === currentSessionId
        const isFocused = idx === focusedIdx
        return (
          <div
            key={result.sessionId}
            onClick={() => onOpenSession(result.sessionId)}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              padding: '8px 12px',
              cursor: 'pointer',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              background: isFocused ? 'var(--popup-item-hover)' : isActive ? 'var(--bg-active)' : 'transparent',
              outline: isFocused ? '1px solid var(--accent)' : 'none',
              outlineOffset: -1,
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = isActive ? 'var(--bg-active)' : 'var(--popup-item-hover)'; setFocusedIdx(idx) }}
            onMouseLeave={(e) => { e.currentTarget.style.background = isActive ? 'var(--bg-active)' : 'transparent' }}
          >
            <div style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: getSessionAvatarColor(result.sessionId),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              marginTop: 1,
            }}>
              <MessageSquare size={13} color="#fff" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {result.title || result.project.split(/[/\\]/).pop() || t('session.untitled')}
              </div>
              <div style={{
                fontSize: 10,
                color: 'var(--text-muted)',
                marginTop: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}>
                <span style={{
                  display: 'inline-block',
                  padding: '0 4px',
                  borderRadius: 3,
                  background: result.matchType === 'title' ? 'rgba(59,130,246,0.15)' : 'rgba(34,197,94,0.15)',
                  color: result.matchType === 'title' ? '#60a5fa' : '#4ade80',
                  fontWeight: 500,
                  fontSize: 9,
                }}>
                  {result.matchType === 'title' ? t('session.matchInTitle') : t('session.matchInContent')}
                </span>
                <span>{formatDistanceToNow(result.timestamp, { addSuffix: true, locale: dateLocale })}</span>
              </div>
              {result.matchType === 'content' && result.snippet && (
                <div style={{
                  fontSize: 10,
                  color: 'var(--text-secondary)',
                  marginTop: 2,
                  lineHeight: 1.3,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical' as const,
                }}>
                  <HighlightText text={result.snippet} highlight={lastQuery} />
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
