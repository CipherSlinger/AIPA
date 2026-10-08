// DepartmentDashboard — the single-department view: the roster of employees
// (sessions) belonging to the department the user drilled into from the
// organization chart (OrgChart.tsx). Employees are shown as standing figures
// (EmployeeFigure) rather than generic session cards.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, FolderOpen, MessageSquarePlus, ArrowLeft, ChevronRight, Search, Users, X } from 'lucide-react'
import { useDepartmentStore, useSessionStore, useChatStore, useUiStore, usePrefsStore, type Position } from '../../store'
import { SessionListItem } from '../../types/app.types'
import EmployeeFigure, { SkeletonFigure } from './EmployeeFigure'
import GhostPositionTile from './GhostPositionTile'
import OrgChart from './OrgChart'
import RecruitEmployeeModal from './RecruitEmployeeModal'
import { kindOf, sessionMatchesDir, teamsOf } from './deptUtils'
import { openSessionCore } from './openSessionCore'
import { useT } from '../../i18n'

// ── Single Department View ──────────────────────────────────────────────────
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

function DeptView({ deptId, onBack, onOpenSession, onSelectDept, loadingSessionId, onDeleteSession, autoNewSession }: DeptViewProps) {
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
  const [searchFocused, setSearchFocused] = useState(false)
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [sortOrder, setSortOrder] = useState<'recent' | 'oldest' | 'msgs'>('recent')
  const [recruitOpen, setRecruitOpen] = useState(false)

  const sortedSessions = useMemo(() => {
    const arr = [...deptSessions]
    if (sortOrder === 'oldest') arr.sort((a, b) => a.timestamp - b.timestamp)
    else if (sortOrder === 'msgs') arr.sort((a, b) => (b.messageCount ?? 0) - (a.messageCount ?? 0))
    return arr
  }, [deptSessions, sortOrder])

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sortedSessions
    const q = searchQuery.toLowerCase()
    return sortedSessions.filter(s =>
      (s.title || '').toLowerCase().includes(q) ||
      (s.lastPrompt || '').toLowerCase().includes(q)
    )
  }, [sortedSessions, searchQuery])

  const pinnedFilteredSessions = useMemo(() => {
    const pinned = filteredSessions.filter(s => localStorage.getItem(`aipa:session-pin:${s.sessionId}`) === '1')
    const unpinned = filteredSessions.filter(s => localStorage.getItem(`aipa:session-pin:${s.sessionId}`) !== '1')
    return [...pinned, ...unpinned]
  }, [filteredSessions])

  // Unfilled positions are searched by title and brief. They are never sorted
  // into a timestamp group — a position has no timestamp, so it stays pinned at
  // the top of the roster under its own heading.
  const matchPositions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return openPositions
    return openPositions.filter(p =>
      p.title.toLowerCase().includes(q) || p.brief.toLowerCase().includes(q))
  }, [openPositions, searchQuery])

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

  const openFiles = () => {
    if (!dept) return
    setPrefs({ workingDir: dept.directory })
    window.electronAPI.prefsSet('workingDir', dept.directory)
    useUiStore.getState().setActiveNavItem('files')
  }

  if (!dept) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        height: 56,
        flexShrink: 0,
        background: 'var(--popup-bg)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '14px 20px',
        gap: 10,
        position: 'relative',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}>
        {/* Dept color accent bar */}
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: 3,
          background: dept.color || '#6366f1',
          opacity: 0.75,
          borderRadius: '0 0 0 0',
        }} />
        {/* Back button — icon-only with hover background */}
        <button
          onClick={onBack}
          title={t('dept.backToOrgChart')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 30,
            height: 30,
            borderRadius: 6,
            flexShrink: 0,
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--border)'
            e.currentTarget.style.color = 'var(--text-primary)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'none'
            e.currentTarget.style.color = 'var(--text-muted)'
          }}
        >
          <ArrowLeft size={15} />
        </button>

        {/* Color dot */}
        <div style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: dept.color || '#6366f1',
          flexShrink: 0,
          boxShadow: `0 0 0 2px var(--border)`,
        }} />

        {/* Dept name + dir */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {/* Breadcrumb — a team is a desk of its own, so its page needs to say
              which department it belongs to and offer the way back up. */}
          {parentDept && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>
              <button
                onClick={() => onSelectDept(parentDept.id)}
                title={t('dept.backToParent')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 2,
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  color: 'var(--text-muted)', fontSize: 10, maxWidth: 160,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = '#818cf8' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
              >
                <ArrowLeft size={9} />
                {parentDept.name}
              </button>
              <ChevronRight size={9} style={{ opacity: 0.5, flexShrink: 0 }} />
              <span style={{ opacity: 0.7 }}>{t('dept.team')}</span>
            </div>
          )}
          <div style={{
            fontSize: 15,
            fontWeight: 700,
            color: 'var(--text-primary)',
            lineHeight: 1.3,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            {dept.name}
            {deptSessions.some(s => s.sessionId === currentSessionId) && (
              <div style={{
                width: 7, height: 7,
                borderRadius: '50%',
                background: '#22c55e',
                boxShadow: '0 0 0 2px rgba(34,197,94,0.25)',
                animation: 'dept-active-pulse 2s ease-in-out infinite',
                flexShrink: 0,
                marginLeft: 4,
              }} />
            )}
          </div>
          <div style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            marginTop: 1,
          }}>
            <FolderOpen size={10} style={{ opacity: 0.7, flexShrink: 0 }} />
            {dept.directory}
          </div>
        </div>

        <button
          onClick={() => {
            setSelectMode(prev => !prev)
            setSelectedSessions(new Set())
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '5px 10px',
            borderRadius: 6,
            border: `1px solid ${selectMode ? 'rgba(99,102,241,0.7)' : 'var(--border)'}`,
            background: selectMode ? 'rgba(99,102,241,0.1)' : 'transparent',
            color: selectMode ? '#818cf8' : 'var(--text-secondary)',
            fontSize: 11,
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            if (!selectMode) {
              e.currentTarget.style.borderColor = 'var(--text-muted)'
              e.currentTarget.style.color = 'var(--text-primary)'
            }
          }}
          onMouseLeave={e => {
            if (!selectMode) {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.color = 'var(--text-secondary)'
            }
          }}
        >
          {selectMode ? t('session.exitSelect') : t('session.selectMode')}
        </button>

        <button
          onClick={() => {
            const data = deptSessions.map(s => ({
              id: s.sessionId,
              title: s.title || s.lastPrompt?.slice(0, 60) || 'Untitled',
              lastPrompt: s.lastPrompt,
              messageCount: s.messageCount,
              timestamp: new Date(s.timestamp).toISOString(),
              project: s.project,
            }))
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${dept.name.replace(/[^a-z0-9]/gi, '_')}_sessions_${new Date().toISOString().slice(0,10)}.json`
            a.click()
            URL.revokeObjectURL(url)
          }}
          title={t('dept.exportSessionsTitle')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '5px 10px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            fontSize: 11,
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'border-color 0.15s, color 0.15s, background 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'rgba(34,197,94,0.4)'
            e.currentTarget.style.color = '#22c55e'
            e.currentTarget.style.background = 'rgba(34,197,94,0.06)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.color = 'var(--text-secondary)'
            e.currentTarget.style.background = 'transparent'
          }}
        >
          {t('dept.export')}
        </button>

        <button
          onClick={openFiles}
          title={t('dept.files')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '5px 11px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            fontSize: 12,
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'border-color 0.15s, color 0.15s, background 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'rgba(99,102,241,0.6)'
            e.currentTarget.style.color = '#818cf8'
            e.currentTarget.style.background = 'rgba(99,102,241,0.08)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.color = 'var(--text-secondary)'
            e.currentTarget.style.background = 'transparent'
          }}
        >
          <FolderOpen size={13} />
          {t('dept.files')}
        </button>

        <div style={{ display: 'flex', gap: 2, background: 'var(--bg-hover)', borderRadius: 6, padding: 2, flexShrink: 0 }}>
          {([['recent', '↓Time'], ['oldest', '↑Time'], ['msgs', 'Msgs']] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setSortOrder(val)}
              style={{
                padding: '3px 7px',
                borderRadius: 4,
                border: 'none',
                background: sortOrder === val ? 'rgba(99,102,241,0.25)' : 'transparent',
                color: sortOrder === val ? '#6366f1' : 'var(--text-muted)',
                fontSize: 10,
                cursor: 'pointer',
                fontWeight: sortOrder === val ? 600 : 400,
                transition: 'all 0.15s ease',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          onClick={newSession}
          title={t('dept.newSession')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '9px 20px',
            borderRadius: 8,
            border: 'none',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
            color: 'rgba(255,255,255,0.95)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'opacity 0.15s, box-shadow 0.15s',
            boxShadow: '0 2px 8px rgba(99,102,241,0.35)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.opacity = '0.88'
            e.currentTarget.style.boxShadow = '0 4px 14px rgba(99,102,241,0.45)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.opacity = '1'
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(99,102,241,0.35)'
          }}
        >
          <MessageSquarePlus size={13} />
          {t('dept.newSession')}
          <kbd style={{
            fontSize: 9,
            background: 'var(--bg-input)',
            borderRadius: 3,
            padding: '0px 4px',
            lineHeight: '14px',
            fontFamily: 'monospace',
            marginLeft: 2,
          }}>N</kbd>
        </button>
      </div>

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

        {/* Stats row. Open positions get their own tile: they are seats we are
            counting, not employees, so they are never folded into the session
            totals above them. */}
        {(deptSessions.length > 0 || openPositions.length > 0) && (
          <div
            style={{
              display: 'flex',
              gap: 12,
              marginBottom: 14,
              padding: '10px 14px',
              background: 'var(--glass-bg-low)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              transition: 'box-shadow 0.15s ease, border-color 0.15s ease, transform 0.15s ease',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement
              el.style.boxShadow = '0 4px 16px rgba(0,0,0,0.4)'
              el.style.borderColor = 'var(--border)'
              el.style.transform = 'translateY(-1px)'
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement
              el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)'
              el.style.borderColor = 'var(--border)'
              el.style.transform = 'translateY(0)'
            }}
          >
            {[
              {
                label: t('dept.sessions'),
                value: deptSessions.length,
                color: '#6366f1',
              },
              {
                label: t('session.today'),
                value: (() => {
                  const todayStart = new Date().setHours(0,0,0,0)
                  return deptSessions.filter(s => s.timestamp >= todayStart).length
                })(),
                color: (() => {
                  const todayStart = new Date().setHours(0,0,0,0)
                  return deptSessions.filter(s => s.timestamp >= todayStart).length > 0 ? '#22c55e' : 'var(--text-primary)'
                })(),
              },
              {
                label: t('dept.msgCount'),
                value: deptSessions.reduce((sum, s) => sum + (s.messageCount ?? 0), 0),
                color: 'var(--text-primary)',
              },
              ...(openPositions.length > 0 ? [{
                label: t('dept.positionOpen'),
                value: openPositions.length,
              }] : []),
              ...(childTeams.length > 0 ? [{
                label: t('dept.teams'),
                value: childTeams.length,
              }] : []),
            ].map(stat => (
              <div key={stat.label} style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2, fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', lineHeight: 1.4 }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Teams. Without this, a team could only be reached from the org chart,
            and a department page would look like the teams did not exist. */}
        {childTeams.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {childTeams.map(team => {
              const teamCount = allSessions.filter(s => sessionMatchesDir(s, team.directory, homeDir)).length
              const teamOpen = team.positions?.length ?? 0
              const color = team.color || dept.color || '#6366f1'
              return (
                <button
                  key={team.id}
                  onClick={() => onSelectDept(team.id)}
                  title={team.directory}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    maxWidth: 220, padding: '4px 10px', borderRadius: 999,
                    border: `1px solid ${color}44`, background: `${color}12`,
                    color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = `${color}22` }}
                  onMouseLeave={e => { e.currentTarget.style.background = `${color}12` }}
                >
                  <Users size={11} style={{ flexShrink: 0, color }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team.name}</span>
                  <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{teamCount}</span>
                  {teamOpen > 0 && (
                    <span style={{ color, fontVariantNumeric: 'tabular-nums' }}>· {t('dept.positionOpen')} {teamOpen}</span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        <div style={{
          position: 'relative',
          marginBottom: 18,
        }}>
          <Search size={12} style={{
            position: 'absolute',
            left: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-muted)',
            pointerEvents: 'none',
            opacity: 0.6,
          }} />
          <input
            placeholder={t('dept.searchPlaceholder')}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            style={{
              width: '100%',
              padding: '6px 32px 6px 30px',
              borderRadius: 6,
              border: `1px solid ${searchFocused ? 'rgba(99,102,241,0.40)' : 'var(--border)'}`,
              background: 'var(--bg-hover)',
              color: 'var(--text-primary)',
              fontSize: 12,
              boxSizing: 'border-box',
              outline: 'none',
              transition: 'border-color 0.15s, box-shadow 0.15s',
              boxShadow: searchFocused ? '0 0 0 3px rgba(99,102,241,0.15)' : 'none',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                padding: 2,
                display: 'flex',
                alignItems: 'center',
                borderRadius: 3,
                transition: 'color 0.15s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              <X size={11} />
            </button>
          )}
        </div>

        {selectMode && selectedSessions.size > 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            background: 'rgba(99,102,241,0.08)',
            border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: 8,
            marginBottom: 12,
          }}>
            <span style={{ fontSize: 12, color: '#6366f1', fontWeight: 600, flex: 1 }}>
              {t('session.selectedCount', { count: selectedSessions.size })}
            </span>
            <button
              onClick={() => setSelectedSessions(new Set(pinnedFilteredSessions.map(s => s.sessionId)))}
              style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              {t('session.selectAll')}
            </button>
            <button
              onClick={async () => {
                for (const id of selectedSessions) {
                  await onDeleteSession?.(id)
                }
                setSelectedSessions(new Set())
                setSelectMode(false)
              }}
              style={{
                fontSize: 11, fontWeight: 600,
                color: '#f87171',
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 5,
                padding: '3px 10px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(239,68,68,0.2)'
                e.currentTarget.style.borderColor = 'rgba(239,68,68,0.5)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(239,68,68,0.1)'
                e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'
              }}
            >
              {t('session.deleteSelected')} ({selectedSessions.size})
            </button>
          </div>
        )}

        {sessionsLoading ? (
          <div className="emp-roster">
            {[0, 1, 2].map(i => <SkeletonFigure key={i} />)}
            <div className="emp-floor" />
          </div>
        ) : deptSessions.length === 0 && openPositions.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '56px 20px',
            gap: 16,
            color: 'var(--text-muted)',
            textAlign: 'center',
            animation: 'dept-empty-in 0.15s ease-out',
          }}>
            <div style={{
              width: 72,
              height: 72,
              borderRadius: 20,
              background: 'rgba(99,102,241,0.06)',
              border: '1px solid rgba(99,102,241,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <MessageSquarePlus size={30} style={{ opacity: 0.35, color: '#6366f1' }} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>
                {t('dept.noSessions')}
              </div>
              <div style={{ fontSize: 12, opacity: 0.65, maxWidth: 240, lineHeight: 1.65 }}>
                {t('dept.noSessionsHint')}
              </div>
            </div>
            <button
              onClick={newSession}
              style={{
                marginTop: 4,
                padding: '9px 22px',
                borderRadius: 8,
                border: 'none',
                background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
                color: 'rgba(255,255,255,0.95)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(99,102,241,0.45)',
                transition: 'opacity 0.15s, box-shadow 0.15s, transform 0.15s',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.opacity = '0.9'
                e.currentTarget.style.boxShadow = '0 6px 18px rgba(99,102,241,0.55)'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.opacity = '1'
                e.currentTarget.style.boxShadow = '0 4px 14px rgba(99,102,241,0.45)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <MessageSquarePlus size={13} />
              {t('dept.newSession')}
            </button>
          </div>
        ) : pinnedFilteredSessions.length === 0 && matchPositions.length === 0 && searchQuery ? (
          <div style={{
            padding: '40px 16px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: 13,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
          }}>
            <Search size={22} style={{ opacity: 0.2 }} />
            <span style={{ opacity: 0.65 }}>{t('dept.noSearchResults')}</span>
          </div>
        ) : (
          (() => {
            const renderEmployee = (session: SessionListItem) => (
              <div
                key={session.sessionId}
                style={{ position: 'relative' }}
                onClick={selectMode ? e => {
                  e.stopPropagation()
                  setSelectedSessions(prev => {
                    const next = new Set(prev)
                    if (next.has(session.sessionId)) next.delete(session.sessionId)
                    else next.add(session.sessionId)
                    return next
                  })
                } : undefined}
              >
                {selectMode && (
                  <div style={{
                    position: 'absolute',
                    top: 0, left: 0,
                    width: 18, height: 18,
                    borderRadius: 4,
                    border: `2px solid ${selectedSessions.has(session.sessionId) ? '#6366f1' : 'var(--border)'}`,
                    background: selectedSessions.has(session.sessionId) ? '#6366f1' : 'transparent',
                    zIndex: 5,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s ease',
                  }}>
                    {selectedSessions.has(session.sessionId) && (
                      <div style={{ width: 4, height: 8, borderRight: '2px solid #fff', borderBottom: '2px solid #fff', transform: 'rotate(45deg) translate(-1px, -1px)' }} />
                    )}
                  </div>
                )}
                <div style={{ opacity: selectMode ? 0.85 : 1, pointerEvents: selectMode ? 'none' : 'auto' }}>
                  <EmployeeFigure
                    session={session}
                    isActive={!selectMode && session.sessionId === currentSessionId}
                    isStreaming={!selectMode && session.sessionId === currentSessionId && isStreaming}
                    onClick={selectMode ? () => {} : () => onOpenSession(session)}
                    isLoading={loadingSessionId === session.sessionId}
                    onDelete={selectMode ? undefined : () => onDeleteSession?.(session.sessionId)}
                  />
                </div>
              </div>
            )

            // Unfilled positions lead the roster in every sort order: the seat is
            // already at the desk, it just has nobody in it yet.
            const ghostGroup = matchPositions.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.07em',
                  marginBottom: 10,
                  paddingLeft: 8,
                  borderLeft: `2px dashed ${dept.color || '#6366f1'}`,
                }}>
                  {t('dept.positionOpen')}
                  <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, opacity: 0.7 }}>
                    {matchPositions.length}
                  </span>
                </div>
                <div className="emp-roster">
                  {matchPositions.map(pos => (
                    <GhostPositionTile
                      key={pos.id}
                      position={{ ...pos, color: pos.color || dept.color }}
                      onHire={() => hirePosition(pos)}
                      onDismiss={() => removePosition(dept.id, pos.id)}
                    />
                  ))}
                  <div className="emp-floor" />
                </div>
              </div>
            )

            if (sortOrder !== 'recent') {
              return (
                <div>
                  {ghostGroup}
                  <div className="emp-roster">
                    {pinnedFilteredSessions.map(renderEmployee)}
                    <div className="emp-floor" />
                  </div>
                </div>
              )
            }

            const now = new Date()
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
            const yesterdayStart = todayStart - 86400000
            const weekStart = todayStart - 6 * 86400000

            const groups: { label: string; sessions: SessionListItem[] }[] = []
            const today = pinnedFilteredSessions.filter(s => s.timestamp >= todayStart)
            const yesterday = pinnedFilteredSessions.filter(s => s.timestamp >= yesterdayStart && s.timestamp < todayStart)
            const thisWeek = pinnedFilteredSessions.filter(s => s.timestamp >= weekStart && s.timestamp < yesterdayStart)
            const older = pinnedFilteredSessions.filter(s => s.timestamp < weekStart)

            if (today.length) groups.push({ label: t('session.today'), sessions: today })
            if (yesterday.length) groups.push({ label: t('session.yesterday'), sessions: yesterday })
            if (thisWeek.length) groups.push({ label: t('session.thisWeek'), sessions: thisWeek })
            if (older.length) groups.push({ label: t('session.thisMonth'), sessions: older })

            return (
              <div>
                {ghostGroup}
                {groups.map(group => (
                  <div key={group.label} style={{ marginBottom: 20 }}>
                    <div style={{
                      fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                      textTransform: 'uppercase', letterSpacing: '0.07em',
                      marginBottom: 10,
                      paddingLeft: 8,
                      borderLeft: `2px solid ${dept.color || '#6366f1'}`,
                    }}>
                      {group.label}
                    </div>
                    <div className="emp-roster">
                      {group.sessions.map(renderEmployee)}
                      <div className="emp-floor" />
                    </div>
                  </div>
                ))}
              </div>
            )
          })()
        )}
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

// ── Main export ───────────────────────────────────────────────────────────────
export default function DepartmentDashboard() {
  const t = useT()
  const departments = useDepartmentStore(s => s.departments)
  const setActiveDepartmentId = useDepartmentStore(s => s.setActiveDepartmentId)

  const setSessions = useSessionStore(s => s.setSessions)
  const setLoading = useSessionStore(s => s.setLoading)

  // Local state: which dept is being drilled into (null = org chart)
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null)
  const [loadingSession, setLoadingSession] = useState<string | null>(null)
  // When coming from OrgChart "New Session", auto-create a pending card in DeptView
  const [autoNewSessionDeptId, setAutoNewSessionDeptId] = useState<string | null>(null)

  // Always reload sessions when DepartmentDashboard mounts
  useEffect(() => {
    let isMounted = true
    setLoading(true)
    window.electronAPI.sessionList().then((list: any) => {
      if (!isMounted) return
      setSessions(list || [])
      setLoading(false)
    }).catch(() => { if (isMounted) setLoading(false) })
    return () => { isMounted = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run on mount — always refresh sessions when entering dept view

  const handleSelectDept = (deptId: string) => {
    setActiveDepartmentId(deptId)
    setSelectedDeptId(deptId)
  }

  // Called from OrgChart "New Session" — drill into dept and auto-create a pending card
  const handleNewSessionInDept = (deptId: string) => {
    setActiveDepartmentId(deptId)
    setAutoNewSessionDeptId(deptId)
    setSelectedDeptId(deptId)
  }

  const handleBack = () => {
    setSelectedDeptId(null)
    setAutoNewSessionDeptId(null)
  }

  // Shared openSession handler passed down to both DeptView and OrgChart
  const handleOpenSession = async (session: SessionListItem, deptDirectory: string) => {
    if (loadingSession) return
    setLoadingSession(session.sessionId)
    try {
      await openSessionCore(session, deptDirectory)
    } catch {
      // ignore
    } finally {
      setLoadingSession(null)
    }
  }

  const handleDeleteSession = async (sessionId: string) => {
    try {
      if (typeof window.electronAPI.sessionDelete === 'function') {
        await window.electronAPI.sessionDelete(sessionId)
      }
      const updated = useSessionStore.getState().sessions.filter(s => s.sessionId !== sessionId)
      useSessionStore.getState().setSessions(updated)
    } catch {
      // ignore
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg-chat)' }}>
      <style>{`
        @keyframes dept-view-in {
          from { opacity: 0; transform: translateX(14px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes dept-org-in {
          from { opacity: 0; transform: translateX(-14px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes dept-active-pulse {
          0%, 100% { box-shadow: 0 0 0 2px rgba(34,197,94,0.25); }
          50%       { box-shadow: 0 0 0 5px rgba(34,197,94,0.0); }
        }
        @keyframes dept-stats-in {
          from { opacity: 0; transform: translateY(6px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(6px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes dept-empty-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {selectedDeptId ? (
        <div key={selectedDeptId} style={{ flex: 1, overflow: 'hidden', animation: 'dept-view-in 0.15s ease-out' }}>
          <DeptView
            deptId={selectedDeptId}
            onBack={handleBack}
            onSelectDept={handleSelectDept}
            onOpenSession={session => handleOpenSession(session, departments.find(d => d.id === selectedDeptId)?.directory ?? '')}
            loadingSessionId={loadingSession}
            onDeleteSession={handleDeleteSession}
            autoNewSession={autoNewSessionDeptId === selectedDeptId}
          />
        </div>
      ) : (
        <div key="org" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', animation: 'dept-org-in 0.15s ease-out' }}>
          {/* Top bar — shown on org chart view */}
          <div style={{
            height: 56,
            flexShrink: 0,
            background: 'var(--popup-bg)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 20px',
            gap: 9,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}>
            <span style={{
              width: 28, height: 28, borderRadius: 9, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(99,102,241,0.12)', color: '#818cf8',
            }}>
              <Building2 size={15} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', lineHeight: 1.25 }}>
                {t('dept.orgChart')}
              </span>
            </span>
            <span style={{
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--text-muted)',
              background: 'var(--border)',
              borderRadius: 20,
              padding: '2px 10px',
              flexShrink: 0,
            }}>
              {/* Only real departments count here — companies and teams are
                  structure, not the thing the badge is naming. */}
              {departments.filter(d => kindOf(d) === 'department').length} {t('dept.title')}
            </span>
          </div>
          <OrgChart
            onSelectDept={handleSelectDept}
            onNewSessionInDept={handleNewSessionInDept}
          />
        </div>
      )}
    </div>
  )
}
