// SessionList — decomposed orchestrator (Iteration 221, further decomposed Iteration 441, 452, 455)
// Sub-components: SessionItem, SessionFilters, SessionTooltip, GlobalSearchResults, TagPicker, BulkDeleteBar, SessionListHeader, DateGroupHeader, SelectAllBar, BulkActionBar
// Hooks: useSessionListActions, useSessionTooltip, useTagPicker, useSessionArchive, usePinnedSessions, useCollapsedGroups
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { MessageSquare, Globe } from 'lucide-react'
import { SessionListItem } from '../../types/app.types'
import { usePrefsStore, useSessionStore, useUiStore, useChatStore } from '../../store'
import { SkeletonSessionRow } from '../ui/Skeleton'
import { useT } from '../../i18n'
import { TAG_PRESETS, getDateGroup, generateAutoTags, SESSION_COLOR_LABELS } from './sessionUtils'
import SessionItem from './SessionItem'
import SessionFilters from './SessionFilters'
import SessionTooltip from './SessionTooltip'
import GlobalSearchResults from './GlobalSearchResults'
import TagPicker from './TagPicker'
import SessionFolders from './SessionFolders'
import SessionStats from './SessionStats'
import SessionListHeader from './SessionListHeader'
import DateGroupHeader from './DateGroupHeader'
import SelectAllBar from './SelectAllBar'
import BulkActionBar from './BulkActionBar'
import SessionEmptyState from './SessionEmptyState'
import { useSessionListActions } from './useSessionListActions'
import { useSessionTooltip } from './useSessionTooltip'
import { useTagPicker } from './useTagPicker'
import { useSessionArchive } from './useSessionArchive'
import { usePinnedSessions } from './usePinnedSessions'
import { useCollapsedGroups } from './useCollapsedGroups'

export default function SessionList() {
  const prefs = usePrefsStore(s => s.prefs)
  const setPrefs = usePrefsStore(s => s.setPrefs)
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
  // Per-session unread counts (Iteration 459)
  const unreadCounts = useUiStore(s => s.unreadCounts)
  const clearUnreadForSession = useUiStore(s => s.clearUnreadForSession)

  // Session preview tooltip (extracted hook, Iteration 441)
  const {
    tooltipSession, tooltipPos, previewMessages, previewLoading,
    showSessionTooltip, hideSessionTooltip,
  } = useSessionTooltip()

  // Tag picker (extracted hook, Iteration 452)
  const {
    sessionTags, tagPickerSessionId, tagPickerPos,
    toggleSessionTag, openTagPicker, closeTagPicker,
  } = useTagPicker()

  // Archive (extracted hook, Iteration 452)
  const {
    showArchived, setShowArchived, archivedSessions,
    toggleArchive, bulkArchive,
  } = useSessionArchive(actions.selectedIds, actions.exitSelectMode)

  // ── Session Tags ──
  const tagNames: string[] = prefs.tagNames || TAG_PRESETS.map(tp => t(tp.defaultKey))
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null)
  const [activeProjectFilter, setActiveProjectFilter] = useState<string | null>(null)
  const [activeFolderFilter, setActiveFolderFilter] = useState<string | null>(null)
  const [showStats, setShowStats] = useState(false)

  // Collapsible date groups (extracted hook, Iteration 455)
  const { collapsedGroups, toggleGroupCollapse } = useCollapsedGroups()
  const sessionColorLabels: Record<string, string> = (prefs as unknown as Record<string, unknown>).sessionColorLabels as Record<string, string> || {}

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

  // Pinned sessions (extracted hook, Iteration 455)
  const { pinnedIds, togglePin } = usePinnedSessions()

  // Open session in new tab — middle-click handler (Iteration 515)
  const addToast = useUiStore(s => s.addToast)
  const handleOpenInNewTab = useCallback(async (session: SessionListItem) => {
    const store = useChatStore.getState()
    // Check if already open in a tab
    const existingTabId = store.findTabBySessionId(session.sessionId)
    if (existingTabId) {
      store.switchTab(existingTabId)
      return
    }
    if (store.tabs.length >= 8) {
      addToast('warning', t('tabs.maxReached'))
      return
    }
    try {
      const raw = await window.electronAPI.sessionLoad(session.sessionId)
      const { parseSessionMessages } = await import('./sessionUtils')
      const chatMessages = parseSessionMessages(raw)
      const title = session.title || session.lastPrompt || t('session.untitledSession')
      store.openTab(session.sessionId, title, chatMessages)
    } catch {
      addToast('error', t('session.loadFailed'))
    }
  }, [addToast, t])

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

  // Compute auto-tags for sessions (Iteration 436)
  const sessionAutoTags = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const s of actions.sessions) {
      if ((s.messageCount || 0) >= 3) {
        map[s.sessionId] = generateAutoTags(s.title || '', s.lastPrompt || '')
      }
    }
    return map
  }, [actions.sessions])

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

  // Pre-compute date groups for session count display and collapsing
  const dateGroupMap = useMemo(() => {
    if (!showDateGroups) return new Map<string, number>()
    const counts = new Map<string, number>()
    for (const s of filtered) {
      if (pinnedIds.has(s.sessionId)) continue
      const group = getDateGroup(s.timestamp, t)
      counts.set(group, (counts.get(group) || 0) + 1)
    }
    return counts
  }, [filtered, showDateGroups, pinnedIds, t])

  // Compact view mode from prefs
  const sessionListCompact = prefs.sessionListCompact || false

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'transparent' }}>
      {/* Search bar + toolbar (extracted Iteration 441) */}
      <SessionListHeader
        filter={filter}
        onFilterChange={(value) => { setFilter(value); if (!value) actions.setShowGlobalResults(false) }}
        filteredCount={filtered.length}
        sortBy={sortBy}
        onSortChange={(newSort) => {
          setSortBy(newSort)
          try { localStorage.setItem('aipa:session-sort', newSort) } catch {}
        }}
        selectMode={actions.selectMode}
        onToggleSelectMode={() => {
          if (actions.selectMode) {
            actions.exitSelectMode()
          } else {
            actions.setSelectMode(true)
            actions.setSelectedIds(new Set())
          }
        }}
        showArchived={showArchived}
        archivedCount={archivedSessions.length}
        onToggleArchived={() => setShowArchived(!showArchived)}
        showStats={showStats}
        onToggleStats={() => setShowStats(!showStats)}
        onRefresh={actions.loadSessions}
        onDeleteAll={actions.deleteAll}
        onSearchKeyDown={handleSearchKeyDown}
        showGlobalResults={actions.showGlobalResults}
        searchInputRef={searchInputRef}
        sessionListCompact={sessionListCompact}
        onToggleCompact={() => {
          const next = !sessionListCompact
          setPrefs({ sessionListCompact: next })
          window.electronAPI.prefsSet('sessionListCompact', next)
        }}
      />

      {/* Folder filter */}
      <div style={{ padding: '4px 10px', borderBottom: '1px solid var(--glass-border)', flexShrink: 0, background: 'var(--glass-bg-low)' }}>
        <SessionFolders
          activeFolder={activeFolderFilter}
          onFolderSelect={setActiveFolderFilter}
          folderCounts={folderCounts}
        />
      </div>

      {/* Stats view (Iteration 436) */}
      {showStats ? (
        <SessionStats onBack={() => setShowStats(false)} />
      ) : (
      <>

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

      {/* Select All bar (extracted component, Iteration 452) */}
      {actions.selectMode && filtered.length > 0 && (
        <SelectAllBar
          filtered={filtered}
          currentSessionId={actions.currentSessionId}
          selectedIds={actions.selectedIds}
          onSetSelectedIds={actions.setSelectedIds}
        />
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
          color: 'var(--text-faint)',
          fontWeight: 600,
          letterSpacing: '0.05em',
          borderBottom: '1px solid var(--glass-border)',
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
            const fakeEvent = { stopPropagation: () => {} } as React.MouseEvent
            actions.deleteSession(fakeEvent, session.sessionId)
          }
        }}
        style={{ flex: 1, overflowY: 'auto', outline: 'none', scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.10) transparent' }}
      >
        {sessionLoading && (
          <div>
            {[0, 1, 2, 3, 4].map(i => <SkeletonSessionRow key={i} />)}
          </div>
        )}
        {!sessionLoading && filtered.length === 0 && !filter && (
          <SessionEmptyState
            onNewChat={() => window.dispatchEvent(new CustomEvent('aipa:newConversation'))}
          />
        )}
        {!sessionLoading && filtered.length === 0 && filter && (
          <div style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            textAlign: 'center',
            padding: '32px 16px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
          }}>
            <div style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: 'rgba(99,102,241,0.12)',
              border: '1px solid rgba(99,102,241,0.20)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <MessageSquare size={22} style={{ color: '#818cf8' }} />
            </div>
            <div style={{ fontWeight: 600, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              {t('session.noResults')}
            </div>
          </div>
        )}
        {filtered.map((session, idx) => {
          const isPinned = pinnedIds.has(session.sessionId)
          const prevSession = filtered[idx - 1]
          const prevIsPinned = prevSession ? pinnedIds.has(prevSession.sessionId) : false

          // Date group header
          let dateHeader: React.ReactNode = null
          let isGroupCollapsed = false
          if (showDateGroups && !isPinned) {
            const group = getDateGroup(session.timestamp, t)
            isGroupCollapsed = collapsedGroups.has(group)
            const prevGroup = prevSession ? (pinnedIds.has(prevSession.sessionId) ? null : getDateGroup(prevSession.timestamp, t)) : null
            if (group !== prevGroup) {
              const groupCount = dateGroupMap.get(group) || 0
              dateHeader = (
                <DateGroupHeader
                  key={`date-${group}`}
                  group={group}
                  count={groupCount}
                  isCollapsed={isGroupCollapsed}
                  onToggle={() => toggleGroupCollapse(group)}
                />
              )
            } else if (isGroupCollapsed) {
              return null
            }
          }

          // Skip sessions in collapsed groups (but show the header)
          if (showDateGroups && !isPinned && isGroupCollapsed && !dateHeader) {
            return null
          }

          // Pinned section header (first pinned session)
          const showPinnedHeader = isPinned && idx === 0
          // Divider between pinned and unpinned sections
          const showPinnedDivider = !isPinned && prevIsPinned

          return (
            <React.Fragment key={session.sessionId}>
              {showPinnedHeader && (
                <div style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.07em',
                  textTransform: 'uppercase' as const,
                  color: 'var(--text-faint)', padding: '6px 12px 2px',
                }}>
                  {t('session.pinned')}
                </div>
              )}
              {showPinnedDivider && (
                <div style={{ height: 1, background: 'var(--glass-border)', margin: '4px 12px 6px' }} />
              )}
              {dateHeader}
              {!isGroupCollapsed && (
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
                onOpenInNewTab={handleOpenInNewTab}
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
                colorLabel={sessionColorLabels[session.sessionId]}
                autoTags={sessionAutoTags[session.sessionId]}
                compact={sessionListCompact}
                unreadCount={unreadCounts[session.sessionId] || 0}
              />
              )}
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

      {/* Bulk archive + delete floating action bars */}
      {actions.selectMode && actions.selectedIds.size > 0 && (
        <BulkActionBar
          selectedCount={actions.selectedIds.size}
          onBulkArchive={bulkArchive}
          confirmBulkDelete={actions.confirmBulkDelete}
          onCancelSelect={actions.exitSelectMode}
          onBulkDelete={actions.bulkDelete}
          onConfirmDelete={() => actions.setConfirmBulkDelete(true)}
        />
      )}

      </>
      )}
    </div>
  )
}
