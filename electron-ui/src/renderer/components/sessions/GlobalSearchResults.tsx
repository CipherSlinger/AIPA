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
      background: 'rgba(15,15,25,0.92)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 10,
      maxHeight: '50%',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      marginBottom: 4,
      overflow: 'hidden',
      boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
    }}>
      {/* Section header — micro-label style */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px 4px',
        fontSize: 10,
        fontWeight: 700,
        color: 'rgba(255,255,255,0.38)',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.07em',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
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
          style={{
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 6,
            color: 'rgba(255,255,255,0.45)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            padding: '2px 4px',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
            e.currentTarget.style.color = 'rgba(255,255,255,0.60)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'rgba(255,255,255,0.45)'
          }}
        >
          <X size={12} />
        </button>
      </div>

      {/* Empty state */}
      {results.length === 0 && !isSearching && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 12px',
          gap: 8,
        }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: 'rgba(99,102,241,0.12)',
            border: '1px solid rgba(99,102,241,0.20)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Globe size={20} color="rgba(99,102,241,0.60)" />
          </div>
          <span style={{
            fontSize: 12,
            color: 'rgba(255,255,255,0.45)',
            textAlign: 'center',
            maxWidth: 180,
            lineHeight: 1.55,
          }}>
            {t('session.globalSearchNoResults')}
          </span>
        </div>
      )}

      <div style={{ overflowY: 'auto', flex: 1, scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.10) transparent' }}>
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
              margin: '3px 4px',
              cursor: 'pointer',
              borderRadius: 6,
              background: isFocused || isActive ? 'rgba(255,255,255,0.05)' : 'transparent',
              outline: isFocused ? '1px solid rgba(99,102,241,0.4)' : 'none',
              outlineOffset: -1,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
              setFocusedIdx(idx)
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = isActive ? 'rgba(255,255,255,0.05)' : 'transparent'
            }}
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
              {/* Session title */}
              <div style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'rgba(255,255,255,0.82)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {result.title || result.project.split(/[/\\]/).pop() || t('session.untitled')}
              </div>
              {/* Match type badge + date/time */}
              <div style={{
                marginTop: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}>
                <span style={{
                  display: 'inline-block',
                  padding: '0 4px',
                  borderRadius: 6,
                  background: result.matchType === 'title' ? 'rgba(99,102,241,0.15)' : 'rgba(34,197,94,0.15)',
                  color: result.matchType === 'title' ? '#818cf8' : '#4ade80',
                  fontWeight: 700,
                  fontSize: 9,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase' as const,
                }}>
                  {result.matchType === 'title' ? t('session.matchInTitle') : t('session.matchInContent')}
                </span>
                {/* Session date/time */}
                <span style={{
                  fontSize: 10,
                  color: 'rgba(255,255,255,0.45)',
                  fontVariantNumeric: 'tabular-nums',
                  fontFeatureSettings: '"tnum"',
                }}>
                  {formatDistanceToNow(result.timestamp, { addSuffix: true, locale: dateLocale })}
                </span>
              </div>
              {/* Message preview / snippet */}
              {result.matchType === 'content' && result.snippet && (
                <div style={{
                  fontSize: 12,
                  color: 'rgba(255,255,255,0.60)',
                  marginTop: 3,
                  lineHeight: 1.5,
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
    </div>
  )
}
