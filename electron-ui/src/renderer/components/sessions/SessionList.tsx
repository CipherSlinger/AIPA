// SessionList — decomposed orchestrator (Iteration 221)
// Sub-components: SessionItem, SessionFilters, SessionTooltip, GlobalSearchResults, TagPicker, BulkDeleteBar
// Hook: useSessionListActions
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { RefreshCw, MessageSquare, ArrowUpDown, Search, CheckSquare, Square, Globe, Trash2, Archive, ArchiveRestore } from 'lucide-react'
import { SessionListItem } from '../../types/app.types'
import { usePrefsStore, useSessionStore } from '../../store'
import { SkeletonSessionRow } from '../ui/Skeleton'
import { useT } from '../../i18n'
import { TAG_PRESETS, getDateGroup } from './sessionUtils'
import SessionItem from './SessionItem'
import SessionFilters from './SessionFilters'
import SessionTooltip, { PreviewMessage } from './SessionTooltip'
import GlobalSearchResults from './GlobalSearchResults'
import TagPicker from './TagPicker'
import BulkDeleteBar from './BulkDeleteBar'
import SessionFolders from './SessionFolders'
import { useSessionListActions } from './useSessionListActions'

export default function SessionList() {
  const { prefs, setPrefs } = usePrefsStore()
  const t = useT()
  const actions = useSessionListActions()

  const [filter, setFilter] = useState('')
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'alpha' | 'messages'>(() => {
    try {
      const stored = localStorage.getItem('aipa:session-sort')
      if (stored === 'newest' || stored === 'oldest' || stored === 'alpha' || stored === 'messages') return stored
    } catch {}
    return 'newest'
  })

  const [focusedIdx, setFocusedIdx] = useState(-1)
  const listRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Session preview tooltip state
  const [tooltipSession, setTooltipSession] = useState<SessionListItem | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [previewMessages, setPreviewMessages] = useState<PreviewMessage[] | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  // ── Session Tags ──
  const sessionTags: Record<string, string[]> = prefs.sessionTags || {}
  const tagNames: string[] = prefs.tagNames || TAG_PRESETS.map(tp => t(tp.defaultKey))
  const [tagPickerSessionId, setTagPickerSessionId] = useState<string | null>(null)
  const [tagPickerPos, setTagPickerPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null)
  const [activeProjectFilter, setActiveProjectFilter] = useState<string | null>(null)
  const [activeFolderFilter, setActiveFolderFilter] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const archivedSessions: string[] = prefs.archivedSessions || []

  const toggleArchive = (sessionId: string) => {
    const current = archivedSessions
    const isArchived = current.includes(sessionId)
    const updated = isArchived ? current.filter(id => id !== sessionId) : [...current, sessionId]
    setPrefs({ archivedSessions: updated })
    window.electronAPI.prefsSet('archivedSessions', updated)
  }

  const bulkArchive = () => {
    const selectedArr = [...actions.selectedIds]
    const current = archivedSessions
    const toArchive = selectedArr.filter(id => !current.includes(id))
    if (toArchive.length === 0) return
    const updated = [...current, ...toArchive]
    setPrefs({ archivedSessions: updated })
    window.electronAPI.prefsSet('archivedSessions', updated)
    actions.exitSelectMode()
  }

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
  const uniqueProjects = useMemo(() => {
    const projects = new Map<string, number>()
    for (const s of actions.sessions) {
      if (s.project) {
        projects.set(s.project, (projects.get(s.project) || 0) + 1)
      }
    }
    return [...projects.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }))
  }, [actions.sessions])

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

  useEffect(() => { actions.loadSessions() }, [])

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
      actions.handleOpenGlobalResult(sessionId)
    }
    window.addEventListener('aipa:openSession', handler)
    return () => window.removeEventListener('aipa:openSession', handler)
  }, [])

  const showSessionTooltip = useCallback((session: SessionListItem, e: React.MouseEvent) => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current)
    const rect = e.currentTarget.getBoundingClientRect()
    tooltipTimerRef.current = setTimeout(() => {
      setTooltipSession(session)
      setTooltipPos({ top: rect.top, left: rect.right + 8 })
      // Load preview messages asynchronously
      setPreviewMessages(null)
      setPreviewLoading(true)
      window.electronAPI.sessionLoad(session.sessionId).then((rawMessages: Array<Record<string, unknown>>) => {
        const msgs: PreviewMessage[] = []
        for (const entry of rawMessages) {
          if (entry.type !== 'user' && entry.type !== 'assistant') continue
          let content = ''
          const msg = entry.message as Record<string, unknown> | undefined
          if (msg?.content) {
            if (typeof msg.content === 'string') content = msg.content
            else if (Array.isArray(msg.content)) {
              const textPart = (msg.content as Array<Record<string, unknown>>).find(c => c.type === 'text')
              if (textPart?.text) content = String(textPart.text)
            }
          }
          if (content) {
            msgs.push({
              role: entry.type as 'user' | 'assistant',
              content: content.slice(0, 300),
              timestamp: entry.timestamp ? new Date(entry.timestamp as string).getTime() : undefined,
            })
          }
        }
        setPreviewMessages(msgs.slice(-5))
        setPreviewLoading(false)
      }).catch(() => {
        setPreviewLoading(false)
      })
    }, 400)
  }, [])

  const hideSessionTooltip = useCallback(() => {
    if (tooltipTimerRef.current) {
      clearTimeout(tooltipTimerRef.current)
      tooltipTimerRef.current = null
    }
    setTooltipSession(null)
    setPreviewMessages(null)
    setPreviewLoading(false)
  }, [])

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && filter.trim().length >= 2) {
      e.preventDefault()
      actions.handleGlobalSearch(filter.trim())
    }
    if (e.key === 'Escape' && actions.showGlobalResults) {
      e.preventDefault()
      actions.setShowGlobalResults(false)
    }
  }, [filter, actions.handleGlobalSearch, actions.showGlobalResults])

  const sessionLoading = useSessionStore(s => s.loading)

  const sessionFolderMap = prefs.sessionFolderMap || {}

  // Compute folder session counts
  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const [sid, fid] of Object.entries(sessionFolderMap)) {
      if (fid) counts[fid] = (counts[fid] || 0) + 1
    }
    return counts
  }, [sessionFolderMap])

  const filtered = actions.sessions
    .filter((s) => {
      const matchesText = !filter || (s.title || s.lastPrompt).toLowerCase().includes(filter.toLowerCase()) ||
        s.project.toLowerCase().includes(filter.toLowerCase())
      const matchesTag = !activeTagFilter || (sessionTags[s.sessionId] || []).includes(activeTagFilter)
      const matchesProject = !activeProjectFilter || s.project === activeProjectFilter
      const matchesFolder = !activeFolderFilter || sessionFolderMap[s.sessionId] === activeFolderFilter
      const isArchived = archivedSessions.includes(s.sessionId)
      const matchesArchive = showArchived ? isArchived : !isArchived
      return matchesText && matchesTag && matchesProject && matchesFolder && matchesArchive
    })
    .sort((a, b) => {
      const aPinned = pinnedIds.has(a.sessionId) ? 1 : 0
      const bPinned = pinnedIds.has(b.sessionId) ? 1 : 0
      if (aPinned !== bPinned) return bPinned - aPinned
      if (sortBy === 'oldest') return a.timestamp - b.timestamp
      if (sortBy === 'alpha') return (a.title || a.lastPrompt).localeCompare(b.title || b.lastPrompt)
      if (sortBy === 'messages') return (b.messageCount || 0) - (a.messageCount || 0)
      return b.timestamp - a.timestamp
    })

  const showDateGroups = sortBy !== 'alpha' && sortBy !== 'messages' && !filter

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Search bar */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
        <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={14} style={{ position: 'absolute', left: 8, color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            ref={searchInputRef}
            value={filter}
            onChange={(e) => { setFilter(e.target.value); if (!e.target.value) actions.setShowGlobalResults(false) }}
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
          onClick={actions.loadSessions}
          title={t('session.refresh')}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          <RefreshCw size={13} />
        </button>
        <button
          onClick={() => setSortBy(prev => {
            const next = prev === 'newest' ? 'oldest' : prev === 'oldest' ? 'alpha' : prev === 'alpha' ? 'messages' : 'newest'
            try { localStorage.setItem('aipa:session-sort', next) } catch {}
            return next
          })}
          title={`${t('session.sort')}: ${sortBy === 'newest' ? t('session.sortNewest') : sortBy === 'oldest' ? t('session.sortOldest') : sortBy === 'messages' ? t('session.sortMessages') : t('session.sortAlpha')}`}
          style={{
            background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 2, fontSize: 10,
          }}
        >
          <ArrowUpDown size={11} />
          <span>{sortBy === 'newest' ? t('session.sortNew') : sortBy === 'oldest' ? t('session.sortOld') : sortBy === 'messages' ? t('session.sortMsgs') : 'A-Z'}</span>
        </button>
        <button
          onClick={() => {
            if (actions.selectMode) {
              actions.exitSelectMode()
            } else {
              actions.setSelectMode(true)
              actions.setSelectedIds(new Set())
            }
          }}
          title={actions.selectMode ? t('session.exitSelect') : t('session.selectMode')}
          style={{
            background: actions.selectMode ? 'var(--accent)' : 'none',
            border: 'none',
            color: actions.selectMode ? '#fff' : 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            borderRadius: 3,
            padding: actions.selectMode ? '1px 4px' : 0,
          }}
        >
          <CheckSquare size={13} />
        </button>
        <button
          onClick={actions.deleteAll}
          title={t('session.deleteAll')}
          style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          <Trash2 size={13} />
        </button>
        <button
          onClick={() => setShowArchived(!showArchived)}
          title={showArchived ? t('session.hideArchived') : `${t('session.showArchived')}${archivedSessions.length > 0 ? ` (${archivedSessions.length})` : ''}`}
          style={{
            background: showArchived ? 'var(--accent)' : 'none',
            border: 'none',
            color: showArchived ? '#fff' : 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            borderRadius: 3,
            padding: showArchived ? '1px 4px' : 0,
            position: 'relative',
          }}
        >
          <Archive size={13} />
          {!showArchived && archivedSessions.length > 0 && (
            <span style={{
              position: 'absolute', top: -4, right: -6,
              background: 'var(--accent)', color: '#fff',
              fontSize: 8, fontWeight: 700,
              width: 14, height: 14, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {archivedSessions.length > 99 ? '99' : archivedSessions.length}
            </span>
          )}
        </button>
      </div>

      {/* Folder filter */}
      <div style={{ padding: '4px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <SessionFolders
          activeFolder={activeFolderFilter}
          onFolderSelect={setActiveFolderFilter}
          folderCounts={folderCounts}
        />
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
      {actions.selectMode && filtered.length > 0 && (
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
                .filter(s => s.sessionId !== actions.currentSessionId)
                .map(s => s.sessionId)
              const allSelected = selectableIds.every(id => actions.selectedIds.has(id))
              if (allSelected) {
                actions.setSelectedIds(new Set())
              } else {
                actions.setSelectedIds(new Set(selectableIds))
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
              const selectableIds = filtered.filter(s => s.sessionId !== actions.currentSessionId).map(s => s.sessionId)
              const allSelected = selectableIds.length > 0 && selectableIds.every(id => actions.selectedIds.has(id))
              return allSelected
                ? <CheckSquare size={13} style={{ color: 'var(--accent)' }} />
                : <Square size={13} />
            })()}
            <span>{t('session.selectAll')}</span>
          </button>
          {actions.selectedIds.size > 0 && (
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--accent)', fontWeight: 500 }}>
              {t('session.selectedCount', { count: String(actions.selectedIds.size) })}
            </span>
          )}
        </div>
      )}

      {/* Global search results */}
      {actions.showGlobalResults && (
        <GlobalSearchResults
          results={actions.globalSearchResults}
          isSearching={actions.isGlobalSearching}
          lastQuery={actions.lastGlobalQuery}
          currentSessionId={actions.currentSessionId}
          onOpenSession={actions.handleOpenGlobalResult}
          onClose={() => actions.setShowGlobalResults(false)}
        />
      )}

      {/* Global search hint */}
      {filter.trim().length >= 2 && !actions.showGlobalResults && (
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
            actions.openSession(filtered[focusedIdx])
          } else if (e.key === 'F2' && focusedIdx >= 0 && focusedIdx < filtered.length) {
            e.preventDefault()
            const session = filtered[focusedIdx]
            actions.setRenamingId(session.sessionId)
            actions.setRenameValue(session.title || session.lastPrompt || '')
          } else if (e.key === 'Delete' && focusedIdx >= 0 && focusedIdx < filtered.length) {
            e.preventDefault()
            const session = filtered[focusedIdx]
            if (session.sessionId === actions.currentSessionId) return
            // Simulate the double-press delete pattern via synthetic mouse event
            const fakeEvent = { stopPropagation: () => {} } as React.MouseEvent
            actions.deleteSession(fakeEvent, session.sessionId)
          }
        }}
        style={{ flex: 1, overflowY: 'auto', outline: 'none' }}
      >
        {sessionLoading && (
          <div>
            {[0, 1, 2, 3, 4].map(i => <SkeletonSessionRow key={i} />)}
          </div>
        )}
        {!sessionLoading && filtered.length === 0 && (
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
                isActive={actions.currentSessionId === session.sessionId}
                isFocused={idx === focusedIdx}
                isPinned={isPinned}
                isStreaming={actions.isStreaming}
                isSelected={actions.selectedIds.has(session.sessionId)}
                isSelectDisabled={actions.selectMode && actions.currentSessionId === session.sessionId}
                selectMode={actions.selectMode}
                filter={filter}
                renamingId={actions.renamingId}
                renameValue={actions.renameValue}
                confirmDeleteId={actions.confirmDeleteId}
                sessionTags={sessionTags}
                tagNames={tagNames}
                onOpen={actions.openSession}
                onToggleSelect={actions.toggleSelectId}
                onTogglePin={togglePin}
                onOpenTagPicker={openTagPicker}
                onStartRename={actions.startRename}
                onFork={actions.forkSession}
                onDuplicate={actions.duplicateSession}
                onRegenerateTitle={actions.regenerateTitle}
                onExport={actions.exportSession}
                onDelete={actions.deleteSession}
                onRenameChange={actions.setRenameValue}
                onRenameCommit={actions.commitRename}
                onRenameCancel={() => actions.setRenamingId(null)}
                onShowTooltip={showSessionTooltip}
                onHideTooltip={hideSessionTooltip}
                isArchived={archivedSessions.includes(session.sessionId)}
                onToggleArchive={toggleArchive}
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
          previewMessages={previewMessages}
          previewLoading={previewLoading}
        />
      )}

      {/* Bulk delete floating action bar */}
      {actions.selectMode && actions.selectedIds.size > 0 && (
        <div style={{ display: 'flex', gap: 4, padding: '6px 10px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <button
            onClick={bulkArchive}
            title={t('session.archiveSelected')}
            style={{
              flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border)',
              borderRadius: 4, padding: '5px 0', color: 'var(--text-muted)',
              cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 4,
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <Archive size={11} />
            {t('session.archiveSelected')}
          </button>
        </div>
      )}
      {actions.selectMode && actions.selectedIds.size > 0 && (
        <BulkDeleteBar
          selectedCount={actions.selectedIds.size}
          confirmBulkDelete={actions.confirmBulkDelete}
          onCancel={actions.exitSelectMode}
          onDelete={actions.bulkDelete}
          onConfirm={() => actions.setConfirmBulkDelete(true)}
        />
      )}
    </div>
  )
}
