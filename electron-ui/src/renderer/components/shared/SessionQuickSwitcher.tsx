// SessionQuickSwitcher — Ctrl+K overlay for fast session switching (Iteration 434)

// ── Keyframe injection (idempotent) ───────────────────────────────────────────
;(function ensureQSKeyframes() {
  if (typeof document === 'undefined') return
  if (document.getElementById('qs-kf')) return
  const s = document.createElement('style')
  s.id = 'qs-kf'
  s.textContent = `
    @keyframes qs-fadeIn  { from { opacity: 0 } to { opacity: 1 } }
    @keyframes qs-slideUp { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }
  `
  document.head.appendChild(s)
})()

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
  const [inputFocused, setInputFocused] = useState(false)
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
        background: 'rgba(0,0,0,0.70)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 500,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '15vh',
        animation: 'qs-fadeIn 0.15s ease',
      }}
    >
      <div
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('session.quickSwitcher')}
        onKeyDown={handleKeyDown}
        style={{
          background: 'rgba(15,15,25,0.96)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 16,
          boxShadow: '0 16px 48px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)',
          width: '100%',
          maxWidth: 560,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'qs-slideUp 0.15s ease',
        }}
      >
        {/* Search input */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '14px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.09)',
          background: inputFocused ? 'rgba(99,102,241,0.04)' : 'rgba(255,255,255,0.06)',
          transition: 'all 0.15s ease',
          boxShadow: inputFocused ? 'inset 0 0 0 1px rgba(99,102,241,0.40)' : 'none',
        }}>
          <Search size={16} style={{ color: inputFocused ? '#818cf8' : 'rgba(255,255,255,0.38)', flexShrink: 0, transition: 'all 0.15s ease' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder={t('session.quickSwitcherPlaceholder')}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'rgba(255,255,255,0.82)',
              fontSize: 16,
              fontFamily: 'inherit',
            }}
          />
          <kbd style={{
            fontSize: 10,
            color: 'rgba(255,255,255,0.38)',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 5,
            padding: '2px 6px',
            fontFamily: 'monospace',
            fontWeight: 700,
            letterSpacing: '0.07em',
          }}>Ctrl+K</kbd>
        </div>

        {/* Session list */}
        <div ref={listRef} style={{ maxHeight: 380, overflowY: 'auto', padding: '6px', scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.10) transparent' }}>
          {filtered.length === 0 && (
            <div style={{
              fontSize: 12,
              color: 'rgba(255,255,255,0.38)',
              textAlign: 'center',
              padding: '24px 16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
            }}>
              <div style={{
                background: 'rgba(99,102,241,0.08)',
                borderRadius: 12,
                padding: 12,
                display: 'inline-flex',
              }}>
                <Search size={18} style={{ color: 'rgba(255,255,255,0.38)', opacity: 0.6 }} />
              </div>
              <span>
                {sessions.length === 0 ? t('session.noSessions') : t('session.noResults')}
              </span>
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
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  borderRadius: 7,
                  cursor: 'pointer',
                  background: index === selectedIndex ? 'rgba(99,102,241,0.10)' : 'transparent',
                  borderLeft: index === selectedIndex ? '2px solid rgba(99,102,241,0.60)' : '2px solid transparent',
                  transition: 'all 0.15s ease',

                }}
              >
                <MessageSquare size={14} style={{ color: 'rgba(255,255,255,0.45)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: index === selectedIndex ? '#818cf8' : 'rgba(255,255,255,0.82)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {title}
                  </div>
                  {preview && preview !== title && (
                    <div style={{
                      fontSize: 11,
                      color: 'rgba(255,255,255,0.38)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {preview}
                    </div>
                  )}
                  {note && (
                    <div style={{
                      fontSize: 10,
                      color: '#fbbf24',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontStyle: 'italic',
                    }}>
                      {note}
                    </div>
                  )}
                </div>
                <span style={{
                  fontSize: 10,
                  color: 'rgba(255,255,255,0.38)',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  flexShrink: 0,
                  fontVariantNumeric: 'tabular-nums',
                  fontFeatureSettings: '"tnum"',
                }}>
                  <Clock size={10} />
                  {relativeTime(session.timestamp)}
                </span>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          gap: 12,
          padding: '8px 14px',
          borderTop: '1px solid rgba(255,255,255,0.09)',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.38)',
          alignItems: 'center',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <kbd style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 5, padding: '1px 5px', fontSize: 9, fontFamily: 'monospace' }}>↑↓</kbd>
            {t('command.arrowKeysHint')}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <kbd style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 5, padding: '1px 5px', fontSize: 9, fontFamily: 'monospace' }}>↵</kbd>
            {t('command.enterHint')}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <kbd style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 5, padding: '1px 5px', fontSize: 9, fontFamily: 'monospace' }}>Esc</kbd>
            {t('command.escHint')}
          </span>
        </div>
      </div>
    </div>
  )
}
