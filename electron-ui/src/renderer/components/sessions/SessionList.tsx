import React, { useEffect, useState, useRef, useCallback } from 'react'
import { Trash2, RefreshCw, MessageSquare, ArrowUpDown, Search, CheckSquare, Square, Globe } from 'lucide-react'
import { SessionListItem, StandardChatMessage, ChatMessage } from '../../types/app.types'
import { useSessionStore, useChatStore, useUiStore, usePrefsStore } from '../../store'
import { SkeletonSessionRow } from '../ui/Skeleton'
import { useT } from '../../i18n'
import { TAG_PRESETS, parseSessionMessages, getDateGroup } from './sessionUtils'
import SessionItem from './SessionItem'
import SessionFilters from './SessionFilters'
import SessionTooltip from './SessionTooltip'
import GlobalSearchResults from './GlobalSearchResults'
import TagPicker from './TagPicker'
import BulkDeleteBar from './BulkDeleteBar'

export default function SessionList() {
  const { sessions, loading, setSessions, setLoading } = useSessionStore()
  const { clearMessages, loadHistory, setSessionId, currentSessionId } = useChatStore()
  const isStreaming = useChatStore(s => s.isStreaming)
  const { addToast } = useUiStore()
  const { prefs, setPrefs } = usePrefsStore()
  const t = useT()
  const [filter, setFilter] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'alpha'>(() => {
    try {
      const stored = localStorage.getItem('aipa:session-sort')
      if (stored === 'newest' || stored === 'oldest' || stored === 'alpha') return stored
    } catch {}
    return 'newest'
  })

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const listRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // ── Multi-select mode ──
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)

  const exitSelectMode = useCallback(() => {
    setSelectMode(false)
    setSelectedIds(new Set())
    setConfirmBulkDelete(false)
  }, [])

  const toggleSelectId = (sessionId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(sessionId)) {
        next.delete(sessionId)
      } else {
        next.add(sessionId)
      }
      return next
    })
  }

  // Exit select mode on Escape
  useEffect(() => {
    if (!selectMode) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitSelectMode()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [selectMode, exitSelectMode])

  // Session preview tooltip state
  const [tooltipSession, setTooltipSession] = useState<SessionListItem | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Global search state ──
  const [globalSearchResults, setGlobalSearchResults] = useState<{ sessionId: string; title?: string; project: string; matchType: 'title' | 'content'; snippet: string; timestamp: number }[]>([])
  const [isGlobalSearching, setIsGlobalSearching] = useState(false)
  const [showGlobalResults, setShowGlobalResults] = useState(false)
  const [lastGlobalQuery, setLastGlobalQuery] = useState('')

  const handleGlobalSearch = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setGlobalSearchResults([])
      setShowGlobalResults(false)
      return
    }
    setIsGlobalSearching(true)
    setShowGlobalResults(true)
    setLastGlobalQuery(query)
    try {
      const results = await window.electronAPI.sessionSearch(query, 20)
      setGlobalSearchResults(results)
    } catch {
      setGlobalSearchResults([])
    }
    setIsGlobalSearching(false)
  }, [])

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && filter.trim().length >= 2) {
      e.preventDefault()
      handleGlobalSearch(filter.trim())
    }
    if (e.key === 'Escape' && showGlobalResults) {
      e.preventDefault()
      setShowGlobalResults(false)
    }
  }, [filter, handleGlobalSearch, showGlobalResults])

  const showSessionTooltip = useCallback((session: SessionListItem, e: React.MouseEvent) => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current)
    const rect = e.currentTarget.getBoundingClientRect()
    tooltipTimerRef.current = setTimeout(() => {
      setTooltipSession(session)
      setTooltipPos({ top: rect.top, left: rect.right + 8 })
    }, 500)
  }, [])

  const hideSessionTooltip = useCallback(() => {
    if (tooltipTimerRef.current) {
      clearTimeout(tooltipTimerRef.current)
      tooltipTimerRef.current = null
    }
    setTooltipSession(null)
  }, [])

  // ── Session Tags ──
  const sessionTags: Record<string, string[]> = prefs.sessionTags || {}
  const tagNames: string[] = prefs.tagNames || TAG_PRESETS.map(tp => t(tp.defaultKey))
  const [tagPickerSessionId, setTagPickerSessionId] = useState<string | null>(null)
  const [tagPickerPos, setTagPickerPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null)
  const [activeProjectFilter, setActiveProjectFilter] = useState<string | null>(null)

  const toggleSessionTag = (sessionId: string, tagId: string) => {
    const current = sessionTags[sessionId] || []
    const updated = current.includes(tagId)
      ? current.filter(id => id !== tagId)
      : [...current, tagId]
    const newSessionTags = { ...sessionTags, [sessionId]: updated }
    if (updated.length === 0) delete newSessionTags[sessionId]
    setPrefs({ sessionTags: newSessionTags })
    window.electronAPI.prefsSet('sessionTags', newSessionTags)
  }

  const openTagPicker = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setTagPickerSessionId(sessionId)
    setTagPickerPos({ top: rect.bottom + 4, left: rect.left })
  }

  const closeTagPicker = useCallback(() => {
    setTagPickerSessionId(null)
  }, [])

  // Close tag picker on Escape or click outside
  useEffect(() => {
    if (!tagPickerSessionId) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeTagPicker() }
    const handleClick = () => closeTagPicker()
    window.addEventListener('keydown', handleKey)
    const timer = setTimeout(() => window.addEventListener('click', handleClick), 50)
    return () => {
      window.removeEventListener('keydown', handleKey)
      window.removeEventListener('click', handleClick)
      clearTimeout(timer)
    }
  }, [tagPickerSessionId, closeTagPicker])

  // Compute unique project paths for project filter
  const uniqueProjects = React.useMemo(() => {
    const projects = new Map<string, number>()
    for (const s of sessions) {
      if (s.project) {
        projects.set(s.project, (projects.get(s.project) || 0) + 1)
      }
    }
    return [...projects.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }))
  }, [sessions])

  // Pinned sessions
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('aipa:pinned-sessions')
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch { return new Set() }
  })

  const togglePin = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    setPinnedIds(prev => {
      const next = new Set(prev)
      if (next.has(sessionId)) {
        next.delete(sessionId)
      } else {
        next.add(sessionId)
      }
      try { localStorage.setItem('aipa:pinned-sessions', JSON.stringify([...next])) } catch { /* ignore */ }
      return next
    })
  }

  const loadSessions = async () => {
    setLoading(true)
    const list = await window.electronAPI.sessionList()
    setSessions(list || [])
    setLoading(false)
  }

  useEffect(() => { loadSessions() }, [])

  // Listen for global search focus (Ctrl+Shift+F from ChatPanel)
  useEffect(() => {
    const handler = () => {
      if (searchInputRef.current) {
        searchInputRef.current.focus()
        searchInputRef.current.select()
      }
    }
    window.addEventListener('aipa:globalSearchFocus', handler)
    return () => window.removeEventListener('aipa:globalSearchFocus', handler)
  }, [])

  // Listen for global session navigation (Ctrl+[ / Ctrl+])
  useEffect(() => {
    const handler = async (e: Event) => {
      const sessionId = (e as CustomEvent).detail as string
      if (!sessionId) return
      const raw = await window.electronAPI.sessionLoad(sessionId)
      const chatMessages = parseSessionMessages(raw)
      clearMessages()
      loadHistory(chatMessages)
      setSessionId(sessionId)
    }
    window.addEventListener('aipa:openSession', handler)
    return () => window.removeEventListener('aipa:openSession', handler)
  }, [])

  const openSession = async (session: SessionListItem) => {
    if (renamingId === session.sessionId) return
    const raw = await window.electronAPI.sessionLoad(session.sessionId)
    const chatMessages = parseSessionMessages(raw)
    clearMessages()
    loadHistory(chatMessages)
    setSessionId(session.sessionId)
  }

  const deleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    if (confirmDeleteId === sessionId) {
      setConfirmDeleteId(null)
      await window.electronAPI.sessionDelete(sessionId)
      addToast('success', t('session.deleted'))
      loadSessions()
    } else {
      setConfirmDeleteId(sessionId)
      setTimeout(() => setConfirmDeleteId(prev => prev === sessionId ? null : prev), 3000)
    }
  }

  const forkSession = async (e: React.MouseEvent, session: SessionListItem) => {
    e.stopPropagation()
    const messages = await window.electronAPI.sessionLoad(session.sessionId)
    const newId = await window.electronAPI.sessionFork(session.sessionId, messages.length - 1)
    if (newId) {
      addToast('success', t('session.forked'))
      await loadSessions()
    } else {
      addToast('error', t('session.forkFailed'))
    }
  }

  const exportSession = async (e: React.MouseEvent, session: SessionListItem) => {
    e.stopPropagation()
    try {
      const raw = await window.electronAPI.sessionLoad(session.sessionId)
      const chatMessages = parseSessionMessages(raw)
      const title = session.title || session.lastPrompt || t('session.untitledSession')
      const lines: string[] = [`# ${title}\n`]
      lines.push(`_Exported: ${new Date().toLocaleString()} | Messages: ${chatMessages.length}_\n`)
      lines.push('---\n')
      for (const msg of chatMessages) {
        if (msg.role === 'user') {
          lines.push(`## You\n`)
          lines.push((msg as StandardChatMessage).content + '\n')
        } else if (msg.role === 'assistant') {
          lines.push(`## Claude\n`)
          lines.push((msg as StandardChatMessage).content + '\n')
        }
      }
      const markdown = lines.join('\n')
      const sanitizedTitle = title.replace(/[<>:"/\\|?*]/g, '_').slice(0, 50)
      const filePath = await window.electronAPI.fsShowSaveDialog(`${sanitizedTitle}.md`, [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'Text', extensions: ['txt'] },
      ])
      if (!filePath) return
      const result = await window.electronAPI.fsWriteFile(filePath, markdown)
      if (result?.error) {
        addToast('error', t('chat.exportFailed', { error: result.error }))
      } else {
        addToast('success', t('chat.exportSuccess'))
      }
    } catch (err) {
      addToast('error', t('chat.exportFailed', { error: String(err) }))
    }
  }

  const startRename = (e: React.MouseEvent, session: SessionListItem) => {
    e.stopPropagation()
    setRenamingId(session.sessionId)
    setRenameValue(session.title || session.lastPrompt || '')
  }

  const commitRename = async (sessionId: string) => {
    if (renameValue.trim()) {
      await window.electronAPI.sessionRename(sessionId, renameValue.trim())
      await loadSessions()
    }
    setRenamingId(null)
  }

  const handleOpenGlobalResult = useCallback(async (sessionId: string) => {
    const raw = await window.electronAPI.sessionLoad(sessionId)
    const chatMessages = parseSessionMessages(raw)
    clearMessages()
    loadHistory(chatMessages)
    setSessionId(sessionId)
    setShowGlobalResults(false)
  }, [clearMessages, loadHistory, setSessionId])

  const filtered = sessions
    .filter((s) => {
      const matchesText = !filter || (s.title || s.lastPrompt).toLowerCase().includes(filter.toLowerCase()) ||
        s.project.toLowerCase().includes(filter.toLowerCase())
      const matchesTag = !activeTagFilter || (sessionTags[s.sessionId] || []).includes(activeTagFilter)
      const matchesProject = !activeProjectFilter || s.project === activeProjectFilter
      return matchesText && matchesTag && matchesProject
    })
    .sort((a, b) => {
      const aPinned = pinnedIds.has(a.sessionId) ? 1 : 0
      const bPinned = pinnedIds.has(b.sessionId) ? 1 : 0
      if (aPinned !== bPinned) return bPinned - aPinned
      if (sortBy === 'oldest') return a.timestamp - b.timestamp
      if (sortBy === 'alpha') return (a.title || a.lastPrompt).localeCompare(b.title || b.lastPrompt)
      return b.timestamp - a.timestamp
    })

  const showDateGroups = sortBy !== 'alpha' && !filter

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Search bar */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
        <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={14} style={{ position: 'absolute', left: 8, color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            ref={searchInputRef}
            value={filter}
            onChange={(e) => { setFilter(e.target.value); if (!e.target.value) setShowGlobalResults(false) }}
            onKeyDown={handleSearchKeyDown}
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
              color: filtered.length === 0 ? 'var(--error)' : 'var(--text-muted)',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}>
              {filtered.length === 0 ? t('session.noResults') : t('session.results', { count: filtered.length })}
            </span>
          )}
        </div>
        <button
          onClick={loadSessions}
          title={t('session.refresh')}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          <RefreshCw size={13} />
        </button>
        <button
          onClick={() => setSortBy(prev => {
            const next = prev === 'newest' ? 'oldest' : prev === 'oldest' ? 'alpha' : 'newest'
            try { localStorage.setItem('aipa:session-sort', next) } catch {}
            return next
          })}
          title={`${t('session.sort')}: ${sortBy === 'newest' ? t('session.sortNewest') : sortBy === 'oldest' ? t('session.sortOldest') : t('session.sortAlpha')}`}
          style={{
            background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 2, fontSize: 10,
          }}
        >
          <ArrowUpDown size={11} />
          <span>{sortBy === 'newest' ? t('session.sortNew') : sortBy === 'oldest' ? t('session.sortOld') : 'A-Z'}</span>
        </button>
        <button
          onClick={() => {
            if (selectMode) {
              exitSelectMode()
            } else {
              setSelectMode(true)
              setSelectedIds(new Set())
            }
          }}
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
          onClick={async () => {
            if (!sessions.length) return
            const ok = window.confirm(t('session.deleteAllConfirm', { count: String(sessions.length) }))
            if (!ok) return
            for (const s of sessions) {
              await window.electronAPI.sessionDelete(s.sessionId)
            }
            loadSessions()
          }}
          title={t('session.deleteAll')}
          style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Filters */}
      <SessionFilters
        sessionTags={sessionTags}
        tagNames={tagNames}
        activeTagFilter={activeTagFilter}
        onTagFilterChange={setActiveTagFilter}
        uniqueProjects={uniqueProjects}
        activeProjectFilter={activeProjectFilter}
        onProjectFilterChange={setActiveProjectFilter}
      />

      {/* Select All bar */}
      {selectMode && filtered.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 12px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          fontSize: 11,
          color: 'var(--text-muted)',
        }}>
          <button
            onClick={() => {
              const selectableIds = filtered
                .filter(s => s.sessionId !== currentSessionId)
                .map(s => s.sessionId)
              const allSelected = selectableIds.every(id => selectedIds.has(id))
              if (allSelected) {
                setSelectedIds(new Set())
              } else {
                setSelectedIds(new Set(selectableIds))
              }
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: 0,
              fontSize: 11,
            }}
          >
            {(() => {
              const selectableIds = filtered.filter(s => s.sessionId !== currentSessionId).map(s => s.sessionId)
              const allSelected = selectableIds.length > 0 && selectableIds.every(id => selectedIds.has(id))
              return allSelected
                ? <CheckSquare size={13} style={{ color: 'var(--accent)' }} />
                : <Square size={13} />
            })()}
            <span>{t('session.selectAll')}</span>
          </button>
          {selectedIds.size > 0 && (
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--accent)', fontWeight: 500 }}>
              {t('session.selectedCount', { count: String(selectedIds.size) })}
            </span>
          )}
        </div>
      )}

      {/* Global search results */}
      {showGlobalResults && (
        <GlobalSearchResults
          results={globalSearchResults}
          isSearching={isGlobalSearching}
          lastQuery={lastGlobalQuery}
          currentSessionId={currentSessionId}
          onOpenSession={handleOpenGlobalResult}
          onClose={() => setShowGlobalResults(false)}
        />
      )}

      {/* Global search hint */}
      {filter.trim().length >= 2 && !showGlobalResults && (
        <div style={{
          padding: '4px 12px',
          fontSize: 10,
          color: 'var(--text-muted)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          flexShrink: 0,
        }}>
          <Globe size={10} />
          <span>{t('session.globalSearchHint')}</span>
        </div>
      )}

      {/* List */}
      <div
        ref={listRef}
        tabIndex={0}
        onKeyDown={(e) => {
          if (filtered.length === 0) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setFocusedIdx(prev => Math.min(prev + 1, filtered.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setFocusedIdx(prev => Math.max(prev - 1, 0))
          } else if (e.key === 'Enter' && focusedIdx >= 0 && focusedIdx < filtered.length) {
            e.preventDefault()
            openSession(filtered[focusedIdx])
          }
        }}
        style={{ flex: 1, overflowY: 'auto', outline: 'none' }}
      >
        {loading && (
          <div>
            {[0, 1, 2, 3, 4].map(i => <SkeletonSessionRow key={i} />)}
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div style={{
            padding: '32px 16px',
            color: 'var(--text-muted)',
            fontSize: 12,
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}>
            <MessageSquare size={28} style={{ opacity: 0.3 }} />
            <div style={{ fontWeight: 500 }}>
              {filter ? t('session.noResults') : t('session.noSessions')}
            </div>
            {!filter && (
              <div style={{ fontSize: 11, opacity: 0.6 }}>
                {t('session.startNew')}
              </div>
            )}
          </div>
        )}
        {filtered.map((session, idx) => {
          const isPinned = pinnedIds.has(session.sessionId)

          // Date group header
          let dateHeader: React.ReactNode = null
          if (showDateGroups && !isPinned) {
            const group = getDateGroup(session.timestamp, t)
            const prevSession = filtered[idx - 1]
            const prevGroup = prevSession ? (pinnedIds.has(prevSession.sessionId) ? null : getDateGroup(prevSession.timestamp, t)) : null
            if (group !== prevGroup) {
              dateHeader = (
                <div
                  key={`date-${group}`}
                  style={{
                    padding: '6px 14px 4px',
                    fontSize: 10,
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    opacity: 0.7,
                    borderBottom: '1px solid var(--border)',
                    background: 'var(--bg-sessionpanel)',
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                  }}
                >
                  {group}
                </div>
              )
            }
          }

          return (
            <React.Fragment key={session.sessionId}>
              {dateHeader}
              <SessionItem
                session={session}
                isActive={currentSessionId === session.sessionId}
                isFocused={idx === focusedIdx}
                isPinned={isPinned}
                isStreaming={isStreaming}
                isSelected={selectedIds.has(session.sessionId)}
                isSelectDisabled={selectMode && currentSessionId === session.sessionId}
                selectMode={selectMode}
                filter={filter}
                renamingId={renamingId}
                renameValue={renameValue}
                confirmDeleteId={confirmDeleteId}
                sessionTags={sessionTags}
                tagNames={tagNames}
                onOpen={openSession}
                onToggleSelect={toggleSelectId}
                onTogglePin={togglePin}
                onOpenTagPicker={openTagPicker}
                onStartRename={startRename}
                onFork={forkSession}
                onExport={exportSession}
                onDelete={deleteSession}
                onRenameChange={setRenameValue}
                onRenameCommit={commitRename}
                onRenameCancel={() => setRenamingId(null)}
                onShowTooltip={showSessionTooltip}
                onHideTooltip={hideSessionTooltip}
              />
            </React.Fragment>
          )
        })}
      </div>

      {/* Tag picker popup */}
      {tagPickerSessionId && (
        <TagPicker
          sessionId={tagPickerSessionId}
          pos={tagPickerPos}
          sessionTags={sessionTags}
          tagNames={tagNames}
          onToggle={toggleSessionTag}
        />
      )}

      {/* Session preview tooltip */}
      {tooltipSession && (
        <SessionTooltip
          session={tooltipSession}
          pos={tooltipPos}
          sessionTags={sessionTags}
          tagNames={tagNames}
        />
      )}

      {/* Bulk delete floating action bar */}
      {selectMode && selectedIds.size > 0 && (
        <BulkDeleteBar
          selectedCount={selectedIds.size}
          confirmBulkDelete={confirmBulkDelete}
          onCancel={exitSelectMode}
          onDelete={async () => {
            const toDelete = [...selectedIds]
            for (const id of toDelete) {
              await window.electronAPI.sessionDelete(id)
            }
            addToast('success', t('session.bulkDeleted', { count: String(toDelete.length) }))
            exitSelectMode()
            loadSessions()
          }}
          onConfirm={() => setConfirmBulkDelete(true)}
        />
      )}
    </div>
  )
}
