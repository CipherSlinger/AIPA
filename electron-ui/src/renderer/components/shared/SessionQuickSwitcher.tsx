// SessionQuickSwitcher — Ctrl+K overlay for fast session switching (Iteration 434)

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Search, Clock, MessageSquare } from 'lucide-react'
import { useSessionStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import type { SessionListItem } from '../../types/app.types'

interface Props {
  onClose: () => void
}

function fuzzyMatch(text: string, query: string): boolean {
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  let qi = 0
  for (let ti = 0; ti < lowerText.length && qi < lowerQuery.length; ti++) {
    if (lowerText[ti] === lowerQuery[qi]) qi++
  }
  return qi === lowerQuery.length
}

function relativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 4) return `${weeks}w ago`
  return new Date(timestamp).toLocaleDateString()
}

export default function SessionQuickSwitcher({ onClose }: Props) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const focusTrapRef = useFocusTrap(true)
  const t = useT()
  const { sessions } = useSessionStore()
  const sessionNotes = useUiStore(s => s.sessionNotes)

  // Sort by recent, limit to 15
  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => b.timestamp - a.timestamp).slice(0, 15)
  }, [sessions])

  // Filter by fuzzy search
  const filtered = useMemo(() => {
    if (!query.trim()) return sortedSessions
    return sortedSessions.filter(s => {
      const title = s.title || ''
      const prompt = s.lastPrompt || ''
      const note = sessionNotes[s.sessionId] || ''
      return fuzzyMatch(title, query) || fuzzyMatch(prompt, query) || fuzzyMatch(note, query)
    })
  }, [sortedSessions, query, sessionNotes])

  // Reset selection when filter changes
  useEffect(() => { setSelectedIndex(0) }, [query])

  // Focus input on mount
  useEffect(() => { inputRef.current?.focus() }, [])

  // Scroll selected into view
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const items = list.querySelectorAll('[data-switcher-item]')
    const selected = items[selectedIndex] as HTMLElement | undefined
    if (selected) selected.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const openSession = useCallback((session: SessionListItem) => {
    window.dispatchEvent(new CustomEvent('aipa:openSession', { detail: session.sessionId }))
    onClose()
  }, [onClose])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(i => Math.min(i + 1, filtered.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(i => Math.max(i - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (filtered[selectedIndex]) openSession(filtered[selectedIndex])
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
    }
  }, [filtered, selectedIndex, onClose, openSession])

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose()
  }, [onClose])

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        justifyContent: 'center',
        paddingTop: 60,
      }}
    >
      <div
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('session.quickSwitcher')}
        onKeyDown={handleKeyDown}
        style={{
          width: '100%',
          maxWidth: 520,
          maxHeight: 440,
          background: 'var(--popup-bg)',
          border: '1px solid var(--popup-border)',
          borderRadius: 10,
          boxShadow: 'var(--popup-shadow)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          alignSelf: 'flex-start',
        }}
      >
        {/* Search input */}
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('session.quickSwitcherPlaceholder')}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: 14,
              fontFamily: 'inherit',
            }}
          />
          <kbd style={{
            fontSize: 9,
            color: 'var(--text-muted)',
            background: 'var(--action-btn-bg)',
            border: '1px solid var(--border)',
            padding: '1px 5px',
            borderRadius: 3,
            fontFamily: 'monospace',
          }}>Ctrl+K</kbd>
        </div>

        {/* Session list */}
        <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {filtered.length === 0 && (
            <div style={{
              padding: 24,
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 13,
            }}>
              {sessions.length === 0 ? t('session.noSessions') : t('session.noResults')}
            </div>
          )}
          {filtered.map((session, index) => {
            const title = session.title || session.lastPrompt?.slice(0, 60) || session.sessionId.slice(0, 12)
            const preview = session.lastPrompt?.slice(0, 80) || ''
            const note = sessionNotes[session.sessionId]
            return (
              <div
                key={session.sessionId}
                data-switcher-item
                onClick={() => openSession(session)}
                onMouseEnter={() => setSelectedIndex(index)}
                style={{
                  padding: '8px 16px',
                  cursor: 'pointer',
                  background: index === selectedIndex ? 'var(--popup-item-hover)' : 'transparent',
                  transition: 'background 0.1s',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <MessageSquare size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <span style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}>
                    {title}
                  </span>
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    fontSize: 10,
                    color: 'var(--text-muted)',
                    flexShrink: 0,
                  }}>
                    <Clock size={10} />
                    {relativeTime(session.timestamp)}
                  </span>
                </div>
                {preview && preview !== title && (
                  <div style={{
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    paddingLeft: 20,
                  }}>
                    {preview}
                  </div>
                )}
                {note && (
                  <div style={{
                    fontSize: 10,
                    color: 'var(--warning)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    paddingLeft: 20,
                    fontStyle: 'italic',
                  }}>
                    {note}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: '6px 16px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          gap: 12,
          fontSize: 10,
          color: 'var(--text-muted)',
        }}>
          <span>{t('command.arrowKeysHint')}</span>
          <span>{t('command.enterHint')}</span>
          <span>{t('command.escHint')}</span>
        </div>
      </div>
    </div>
  )
}
