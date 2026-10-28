// One department (or team) page. Owns the roster's search/sort/selection state
// and the hand-off into chat; the visual pieces live in the sibling modules.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  useDepartmentStore,
  useSessionStore,
  useChatStore,
  useUiStore,
  usePrefsStore,
  type Position,
} from '../../store'
import type { SessionListItem } from '../../types/app.types'
import RecruitEmployeeModal from './RecruitEmployeeModal'
import { sessionMatchesDir, teamsOf } from './deptUtils'
import { useT } from '../../i18n'
import DeptHeader from './DepartmentDashboard.header'
import DeptStats from './DepartmentDashboard.stats'
import DeptTeamStrip from './DepartmentDashboard.teams'
import { DeptSearchBox, DeptSelectionBar } from './DepartmentDashboard.controls'
import DeptRoster from './DepartmentDashboard.roster'
import {
  exportSessionsToFile,
  pinnedFirst,
  searchPositions,
  searchSessions,
  sortSessions,
  type SortOrder,
} from './DepartmentDashboard.data'

// Stable fallback — avoids a new [] on every render, which would invalidate the
// memo that filters these.
const NO_POSITIONS: Position[] = []

interface DeptViewProps {
  deptId: string
  onBack: () => void
  onOpenSession: (session: SessionListItem) => void
  /** Drill into another node — the parent in the breadcrumb, or a child team. */
  onSelectDept: (deptId: string) => void
  loadingSessionId?: string | null
  onDeleteSession?: (sessionId: string) => void
  autoNewSession?: boolean
}

export default function DeptView({
  deptId,
  onBack,
  onOpenSession,
  onSelectDept,
  loadingSessionId,
  onDeleteSession,
  autoNewSession,
}: DeptViewProps) {
  const t = useT()
  const departments = useDepartmentStore(s => s.departments)
  const dept = departments.find(d => d.id === deptId) ?? null

  const allSessions = useSessionStore(s => s.sessions)
  const sessionsLoading = useSessionStore(s => s.loading)
  const homeDir = useSessionStore(s => s.homeDir)
  const currentSessionId = useChatStore(s => s.currentSessionId)
  const isStreaming = useChatStore(s => s.isStreaming)
  const setPrefs = usePrefsStore(s => s.setPrefs)
  const removePosition = useDepartmentStore(s => s.removePosition)

  // A department's child teams are separate desks with their own directories, so
  // a team node is a valid place to be — the breadcrumb above shows where.
  const parentDept = dept?.parentId ? departments.find(d => d.id === dept.parentId) ?? null : null
  const childTeams = useMemo(
    () => (dept ? teamsOf(departments, dept.id) : []),
    [departments, dept],
  )
  const openPositions = dept?.positions ?? NO_POSITIONS

  const deptSessions = useMemo((): SessionListItem[] => {
    if (!dept) return []
    const dir = dept.directory
    return allSessions
      .filter(s => sessionMatchesDir(s, dir, homeDir))
      .sort((a, b) => b.timestamp - a.timestamp)
  }, [allSessions, dept, homeDir])

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [sortOrder, setSortOrder] = useState<SortOrder>('recent')
  const [recruitOpen, setRecruitOpen] = useState(false)

  const sortedSessions = useMemo(
    () => sortSessions(deptSessions, sortOrder),
    [deptSessions, sortOrder],
  )

  const pinnedFilteredSessions = useMemo(
    () => pinnedFirst(searchSessions(sortedSessions, searchQuery)),
    [sortedSessions, searchQuery],
  )

  // Unfilled positions are searched by title and brief. They are never sorted
  // into a timestamp group — a position has no timestamp, so it stays pinned at
  // the top of the roster under its own heading.
  const matchPositions = useMemo(
    () => searchPositions(openPositions, searchQuery),
    [openPositions, searchQuery],
  )

  // Recruiting is a conversation with the recruiter, not an immediate session:
  // the dialog collects (or has the model write) the job description first.
  const newSession = useCallback(() => {
    if (!dept) return
    setRecruitOpen(true)
  }, [dept])

  // Open the recruit dialog when coming from OrgChart's "Recruit" button
  useEffect(() => {
    if (autoNewSession && dept) {
      newSession()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // One-shot on mount only

  // The hand-off to chat, shared by recruiting and by hiring a ghost position:
  // the node becomes the working directory and `brief` becomes the first message
  // the freshly mounted ChatPanel sends. ChatPanel consumes the brief once it is
  // mounted, so the caller does not need to wait for a session id back.
  const startWork = useCallback((directory: string, brief: string) => {
    setPrefs({ workingDir: directory })
    window.electronAPI.prefsSet('workingDir', directory)
    useChatStore.getState().clearMessages()
    // New session from dept view: set fromDepartment so the back button shows in chat (Iteration 538)
    useUiStore.getState().setFromDepartment(true)
    useUiStore.getState().setPendingRecruitBrief(brief || null)
    useUiStore.getState().setMainView('chat')
  }, [setPrefs])

  // Confirm: the job description becomes the employee's first message, so the
  // new session opens in chat with the brief already on its way.
  const confirmRecruit = useCallback((brief: string) => {
    if (!dept) return
    setRecruitOpen(false)
    startWork(dept.directory, brief)
  }, [dept, startWork])

  // Hiring a ghost position is the same hand-off, minus the dialog — the brief
  // was written when the template was applied. Dropping the position right away
  // is safe: the session is guaranteed to be created, and the real employee
  // appears with the next session-list refresh.
  const hirePosition = useCallback((position: Position) => {
    if (!dept) return
    startWork(dept.directory, position.brief)
    removePosition(dept.id, position.id)
  }, [dept, startWork, removePosition])

  const dismissPosition = useCallback((position: Position) => {
    if (!dept) return
    removePosition(dept.id, position.id)
  }, [dept, removePosition])

  const handleExport = useCallback(() => {
    if (!dept) return
    exportSessionsToFile(dept.name, deptSessions)
  }, [dept, deptSessions])

  const openFiles = useCallback(() => {
    if (!dept) return
    setPrefs({ workingDir: dept.directory })
    window.electronAPI.prefsSet('workingDir', dept.directory)
    useUiStore.getState().setActiveNavItem('files')
  }, [dept, setPrefs])

  const toggleSelectMode = useCallback(() => {
    setSelectMode(prev => !prev)
    setSelectedSessions(new Set())
  }, [])

  const toggleSelect = useCallback((sessionId: string) => {
    setSelectedSessions(prev => {
      const next = new Set(prev)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedSessions(new Set(pinnedFilteredSessions.map(s => s.sessionId)))
  }, [pinnedFilteredSessions])

  const deleteSelected = useCallback(async () => {
    for (const id of selectedSessions) {
      await onDeleteSession?.(id)
    }
    setSelectedSessions(new Set())
    setSelectMode(false)
  }, [selectedSessions, onDeleteSession])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        newSession()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [newSession])

  if (!dept) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <DeptHeader
        dept={dept}
        parentDept={parentDept}
        active={deptSessions.some(s => s.sessionId === currentSessionId)}
        selectMode={selectMode}
        sortOrder={sortOrder}
        onBack={onBack}
        onSelectDept={onSelectDept}
        onToggleSelect={toggleSelectMode}
        onExport={handleExport}
        onOpenFiles={openFiles}
        onSortChange={setSortOrder}
        onNewSession={newSession}
      />

      {/* Sessions area */}
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 24px', background: 'var(--bg-chat)' }}>
        {/* Section header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          paddingLeft: 10,
          borderLeft: '2px solid rgba(99,102,241,0.7)',
          position: 'sticky',
          top: 0,
          zIndex: 5,
          background: 'var(--popup-bg)',
          paddingTop: 4,
          paddingBottom: 10,
          marginBottom: 8,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}>
          <span style={{
            color: 'var(--text-muted)',
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
          }}>
            {t('dept.sessions')}
          </span>
          <span style={{
            background: 'var(--border)',
            borderRadius: 20,
            padding: '1px 7px',
            fontSize: 10,
            fontWeight: 500,
            color: 'var(--text-muted)',
          }}>
            {searchQuery.trim() ? pinnedFilteredSessions.length : deptSessions.length}
          </span>
        </div>

        {(deptSessions.length > 0 || openPositions.length > 0) && (
          <DeptStats sessions={deptSessions} positions={openPositions} teams={childTeams} />
        )}

        {childTeams.length > 0 && (
          <DeptTeamStrip
            teams={childTeams}
            sessions={allSessions}
            homeDir={homeDir}
            deptColor={dept.color}
            onSelectDept={onSelectDept}
          />
        )}

        <DeptSearchBox value={searchQuery} onChange={setSearchQuery} />

        {selectMode && selectedSessions.size > 0 && (
          <DeptSelectionBar
            count={selectedSessions.size}
            onSelectAll={selectAll}
            onDeleteSelected={deleteSelected}
          />
        )}

        <DeptRoster
          sessions={pinnedFilteredSessions}
          positions={matchPositions}
          empty={deptSessions.length === 0 && openPositions.length === 0}
          sessionsLoading={sessionsLoading}
          searchQuery={searchQuery}
          sortOrder={sortOrder}
          selectMode={selectMode}
          selectedSessions={selectedSessions}
          currentSessionId={currentSessionId}
          isStreaming={isStreaming}
          loadingSessionId={loadingSessionId}
          deptColor={dept.color}
          onToggleSelect={toggleSelect}
          onOpenSession={onOpenSession}
          onDeleteSession={onDeleteSession}
          onNewSession={newSession}
          onHire={hirePosition}
          onDismiss={dismissPosition}
        />
      </div>

      {recruitOpen && (
        <RecruitEmployeeModal
          deptName={dept.name}
          deptColor={dept.color}
          onCancel={() => setRecruitOpen(false)}
          onConfirm={confirmRecruit}
        />
      )}
    </div>
  )
}
