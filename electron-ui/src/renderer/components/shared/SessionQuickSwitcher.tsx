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
import { Search, Clock, Folder, MessageSquare } from 'lucide-react'
import { useSessionStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import { sessionFolderProvenance } from '../../lib/folderPick'
import { quickSwitchFolderOf, showsFolderRevealHint } from '../../lib/deptQuickSwitch'
import { RowRevealHint, FooterRevealHint } from './SessionQuickSwitcherRevealHint'
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

/**
 * Does the conversation's recorded folder answer this query?
 *
 * A substring, not a fuzzy match: fuzzy over a long path lights up rows whose
 * letters happen to appear somewhere in it, while the reader typed a folder
 * they remember. Separators fold because Windows records `C:\work\proj` and
 * people type `work/proj`; both name the same place. Case folds for the same
 * reason a folder comparison does.
 */
function folderMatchesQuery(cwd: string | null | undefined, query: string): boolean {
  const dir = typeof cwd === 'string' ? cwd.trim() : ''
  const needle = query.trim().replace(/\\/g, '/').toLowerCase()
  if (!dir || !needle) return false
  return dir.replace(/\\/g, '/').toLowerCase().includes(needle)
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
  // PERF: field selector — useSessionStore() would also re-render this overlay
  // on every unrelated session-store change (selection, loading flags).
  const sessions = useSessionStore(s => s.sessions)
  // Only for shortening the provenance line below; not a re-render trigger.
  const homeDir = useSessionStore(s => s.homeDir)
  const sessionNotes = useUiStore(s => s.sessionNotes)

  // Sort by recent, limit to 15
  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => b.timestamp - a.timestamp).slice(0, 15)
  }, [sessions])

  // Whether any listed conversation records where it ran. The placeholder only
  // mentions folders when one exists: a hint that promises a search dimension
  // the list does not have would be a promise the list cannot keep.
  const hasRecordedFolder = useMemo(
    () => sortedSessions.some(s => typeof s.cwd === 'string' && s.cwd.trim() !== ''),
    [sortedSessions],
  )

  // Filter by fuzzy search over the text the row shows — plus the recorded
  // folder, which the row shows too but which was the one visible field the
  // filter ignored. The folder is matched as a path (not fuzzily), so the
  // same query cannot light up unrelated rows.
  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) return sortedSessions
    return sortedSessions.filter(s => {
      const title = s.title || ''
      const prompt = s.lastPrompt || ''
      const note = sessionNotes[s.sessionId] || ''
      return fuzzyMatch(title, q)
        || fuzzyMatch(prompt, q)
        || fuzzyMatch(note, q)
        || folderMatchesQuery(s.cwd, q)
    })
  }, [sortedSessions, query, sessionNotes])

  // Reset selection when filter changes
  useEffect(() => { setSelectedIndex(0) }, [query])

  // Whether the highlighted row is one the reveal chord can act on. Derived
  // once here so the footer's hint, the row's hint and the key handler cannot
  // disagree about whether there is a folder to reveal.
  const highlightedRecordsFolder = showsFolderRevealHint(filtered[selectedIndex]?.cwd)

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

  // Ctrl+Enter on the highlighted row: reveal the folder that conversation
  // actually ran in. `quickSwitchFolderOf` takes one argument on purpose — the
  // conversation's own record — so there is no preference to fall back to. A
  // session with no recorded folder reveals nothing: the overlay stays open so
  // the key is visible as having done nothing rather than silently opening a
  // folder this conversation never used.
  const revealFolder = useCallback(async (session: SessionListItem) => {
    const dir = quickSwitchFolderOf(session.cwd)
    if (!dir) return
    const api = window.electronAPI
    if (!api?.shellShowItemInFolder) return
    try {
      const result = await api.shellShowItemInFolder(dir)
      if (result && !result.success) {
        useUiStore.getState().addToast('error', result.error || t('quickSwitcher.revealFailed', { folder: dir }))
      }
    } catch (err) {
      useUiStore.getState().addToast('error', String(err))
    }
  }, [t])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Ctrl+Enter is checked before the plain Enter case: the two differ by one
    // modifier and both would otherwise match `e.key === 'Enter'`.
    if (e.key === 'Enter' && e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
      e.preventDefault()
      const row = filtered[selectedIndex]
      if (row) void revealFolder(row)
      return
    }
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
  }, [filtered, selectedIndex, onClose, openSession, revealFolder])

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
        background: 'var(--glass-overlay)',
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
          background: 'var(--popup-bg)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid var(--border)',
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
          borderBottom: '1px solid var(--border)',
          background: inputFocused ? 'rgba(99,102,241,0.04)' : 'var(--bg-hover)',
          transition: 'all 0.15s ease',
          boxShadow: inputFocused ? 'inset 0 0 0 1px rgba(99,102,241,0.40)' : 'none',
        }}>
          <Search size={16} style={{ color: inputFocused ? '#818cf8' : 'var(--text-muted)', flexShrink: 0, transition: 'all 0.15s ease' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder={hasRecordedFolder
              ? t('quickSwitcher.placeholderWithFolders')
              : t('session.quickSwitcherPlaceholder')}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: 16,
              fontFamily: 'inherit',
            }}
          />
          <kbd style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            background: 'var(--border)',
            border: '1px solid var(--border)',
            borderRadius: 5,
            padding: '2px 6px',
            fontFamily: 'monospace',
            fontWeight: 700,
            letterSpacing: '0.07em',
          }}>Ctrl+K</kbd>
        </div>

        {/* Session list */}
        <div ref={listRef} style={{ maxHeight: 380, overflowY: 'auto', padding: '6px', scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent' }}>
          {filtered.length === 0 && (
            <div style={{
              fontSize: 12,
              color: 'var(--text-muted)',
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
                <Search size={18} style={{ color: 'var(--text-muted)', opacity: 0.6 }} />
              </div>
              <span>
                {sessions.length === 0 ? t('session.noSessions') : t('session.noResults')}
              </span>
            </div>
          )}
          {filtered.map((session, index) => {
            const title = session.title || session.lastPrompt?.slice(0, 60) || session.sessionId.slice(0, 12)
            const prompt = session.lastPrompt || ''
            const preview = prompt.slice(0, 80)
            const note = sessionNotes[session.sessionId]
            // Where the conversation actually ran. Codex records it; a Claude
            // transcript or an index that cannot tell leaves it unknown, and an
            // unknown folder is left blank — never filled in with a guess.
            const folder = sessionFolderProvenance(session.cwd, homeDir)
            const q = query.trim()
            const folderMatched = folderMatchesQuery(session.cwd, q)
            // The Ctrl+Enter hint is offered only where the key can act: on
            // the highlighted row, and only when this conversation records a
            // folder. A row with no recorded folder shows no hint, and the key
            // does nothing there — never the app's global working folder.
            const revealHintVisible = index === selectedIndex && showsFolderRevealHint(session.cwd)
            // A row can enter the list only because of its folder. Say so on
            // the folder line: a row that matches nothing visible reads as a
            // bug, and the hint is the one thing that explains itself.
            const folderOnlyMatch = folderMatched
              && !fuzzyMatch(title, q)
              && !fuzzyMatch(prompt, q)
              && !fuzzyMatch(note || '', q)
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
                <MessageSquare size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: index === selectedIndex ? '#818cf8' : 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {title}
                  </div>
                  {preview && preview !== title && (
                    <div style={{
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {preview}
                    </div>
                  )}
                  {folder && (
                    // Quiet provenance: which folder this conversation would
                    // reopen into. The full path lives in the tooltip; the date
                    // on the right keeps its own column and the keyboard order
                    // is untouched, because this is one more line inside the
                    // row's existing text block.
                    <div
                      title={session.cwd}
                      data-folder-match={folderOnlyMatch ? 'true' : undefined}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        minWidth: 0,
                        fontSize: 10,
                        // The folder is emphasised only when this row is here
                        // because of it; otherwise every list row would glow.
                        color: folderOnlyMatch ? '#818cf8' : 'var(--text-subtle)',
                      }}
                    >
                      <Folder size={9} style={{ flexShrink: 0, opacity: 0.7 }} />
                      <span style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontWeight: folderOnlyMatch ? 500 : 400,
                      }}>{folder}</span>
                      {folderOnlyMatch && (
                        <span style={{ flexShrink: 0, opacity: 0.8 }}>
                          · {t('quickSwitcher.matchedFolder')}
                        </span>
                      )}
                      {/* The chord, on the row it acts on. `revealHintVisible`
                          is the same answer the key handler asks, so a row can
                          never advertise a reveal its own key refuses. Kept on
                          the folder line itself: it describes the path to its
                          left, and adding a line would shift the row height on
                          every arrow-key move. */}
                      {revealHintVisible && <RowRevealHint />}
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
                  color: 'var(--text-muted)',
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
          borderTop: '1px solid var(--border)',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          alignItems: 'center',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <kbd style={{ background: 'var(--border)', border: '1px solid var(--border)', borderRadius: 5, padding: '1px 5px', fontSize: 9, fontFamily: 'monospace' }}>↑↓</kbd>
            {t('command.arrowKeysHint')}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <kbd style={{ background: 'var(--border)', border: '1px solid var(--border)', borderRadius: 5, padding: '1px 5px', fontSize: 9, fontFamily: 'monospace' }}>↵</kbd>
            {t('command.enterHint')}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <kbd style={{ background: 'var(--border)', border: '1px solid var(--border)', borderRadius: 5, padding: '1px 5px', fontSize: 9, fontFamily: 'monospace' }}>Esc</kbd>
            {t('command.escHint')}
          </span>
          {/* The reveal chord is listed only while the row it would act on
              records a folder — the same condition the row's own hint uses. */}
          {highlightedRecordsFolder && <FooterRevealHint />}
        </div>
      </div>
    </div>
  )
}
