// DepartmentDashboard — org chart (all depts) or single dept session list
import React, { useEffect, useMemo, useState } from 'react'
import { Building2, FolderOpen, MessageSquarePlus, ChevronRight, ArrowLeft } from 'lucide-react'
import { useDepartmentStore, useSessionStore, useChatStore, useUiStore, usePrefsStore } from '../../store'
import { SessionListItem } from '../../types/app.types'
import SessionCard from './SessionCard'
import { useT } from '../../i18n'
import { parseSessionMessages } from '../sessions/sessionUtils'

// Normalize path for comparison (strip trailing slashes, normalize separators)
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '')
}

// ── Single Department View ──────────────────────────────────────────────────
interface DeptViewProps {
  deptId: string
  onBack: () => void
}

function DeptView({ deptId, onBack }: DeptViewProps) {
  const t = useT()
  const departments = useDepartmentStore(s => s.departments)
  const dept = departments.find(d => d.id === deptId) ?? null

  const allSessions = useSessionStore(s => s.sessions)
  const sessionsLoading = useSessionStore(s => s.loading)
  const currentSessionId = useChatStore(s => s.currentSessionId)
  const setPrefs = usePrefsStore(s => s.setPrefs)

  const [loadingSession, setLoadingSession] = useState<string | null>(null)

  const deptSessions = useMemo((): SessionListItem[] => {
    if (!dept) return []
    const deptDir = normalizePath(dept.directory)
    return allSessions
      .filter(s => normalizePath(s.project) === deptDir)
      .sort((a, b) => b.timestamp - a.timestamp)
  }, [allSessions, dept])

  const openSession = async (session: SessionListItem) => {
    if (loadingSession) return
    setLoadingSession(session.sessionId)
    try {
      useUiStore.getState().setMainView('chat')
      useUiStore.getState().closeSettingsModal()
      const raw = await window.electronAPI.sessionLoad(session.sessionId)
      const chatMessages = parseSessionMessages(raw)
      useChatStore.getState().clearMessages()
      useChatStore.getState().loadHistory(chatMessages)
      useChatStore.getState().setSessionId(session.sessionId)
      useUiStore.getState().clearUnreadForSession(session.sessionId)
      if (dept) {
        setPrefs({ workingDir: dept.directory })
        window.electronAPI.prefsSet('workingDir', dept.directory)
      }
    } catch {
      // ignore
    } finally {
      setLoadingSession(null)
    }
  }

  const newSession = () => {
    if (!dept) return
    setPrefs({ workingDir: dept.directory })
    window.electronAPI.prefsSet('workingDir', dept.directory)
    useChatStore.getState().clearMessages()
    useUiStore.getState().setMainView('chat')
  }

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
        height: 52,
        flexShrink: 0,
        background: 'var(--chat-header-bg, var(--bg-nav))',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 10,
      }}>
        {/* Back to org chart */}
        <button
          onClick={onBack}
          title={t('dept.backToOrgChart')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
            padding: 4, borderRadius: 4, flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          <ArrowLeft size={16} />
        </button>

        {/* Color dot */}
        <div style={{
          width: 10, height: 10, borderRadius: '50%',
          background: dept.color || 'var(--accent)', flexShrink: 0,
        }} />

        {/* Dept name + dir */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>
            {dept.name}
          </div>
          <div style={{
            fontSize: 10, color: 'var(--text-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'center', gap: 3,
          }}>
            <FolderOpen size={10} />
            {dept.directory}
          </div>
        </div>

        <button
          onClick={openFiles}
          title={t('dept.files')}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 10px', borderRadius: 6,
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', flexShrink: 0,
            transition: 'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
        >
          <FolderOpen size={13} />
          {t('dept.files')}
        </button>

        <button
          onClick={newSession}
          title={t('dept.newSession')}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 12px', borderRadius: 6,
            border: 'none', background: 'var(--accent)', color: '#fff',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.85' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
        >
          <MessageSquarePlus size={13} />
          {t('dept.newSession')}
        </button>
      </div>

      {/* Sessions area */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          marginBottom: 16, color: 'var(--text-muted)',
          fontSize: 11, fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          <ChevronRight size={12} />
          {t('dept.sessions')}
          <span style={{
            background: 'rgba(255,255,255,0.08)',
            borderRadius: 4, padding: '1px 6px',
            fontSize: 10, fontWeight: 500,
          }}>
            {deptSessions.length}
          </span>
        </div>

        {sessionsLoading ? (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{
                width: 220, minHeight: 110, borderRadius: 10,
                background: 'rgba(255,255,255,0.04)',
                border: '1.5px solid var(--border)',
                animation: 'pulse 1.5s ease-in-out infinite',
              }} />
            ))}
          </div>
        ) : deptSessions.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '40px 20px', gap: 12,
            color: 'var(--text-muted)', textAlign: 'center',
          }}>
            <MessageSquarePlus size={36} style={{ opacity: 0.3 }} />
            <div style={{ fontSize: 13, fontWeight: 500 }}>{t('dept.noSessions')}</div>
            <div style={{ fontSize: 11, opacity: 0.7, maxWidth: 240, lineHeight: 1.6 }}>{t('dept.noSessionsHint')}</div>
            <button
              onClick={newSession}
              style={{
                marginTop: 4, padding: '7px 16px', borderRadius: 6,
                border: 'none', background: 'var(--accent)',
                color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {t('dept.newSession')}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {deptSessions.map(session => (
              <SessionCard
                key={session.sessionId}
                session={session}
                isActive={session.sessionId === currentSessionId}
                onClick={() => openSession(session)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Org Chart — all departments ──────────────────────────────────────────────
interface OrgChartProps {
  onSelectDept: (deptId: string) => void
}

function OrgChart({ onSelectDept }: OrgChartProps) {
  const t = useT()
  const departments = useDepartmentStore(s => s.departments)
  const allSessions = useSessionStore(s => s.sessions)
  const sessionsLoading = useSessionStore(s => s.loading)
  const currentSessionId = useChatStore(s => s.currentSessionId)
  const setPrefs = usePrefsStore(s => s.setPrefs)

  const [loadingSession, setLoadingSession] = useState<string | null>(null)

  // Sessions per dept
  const sessionsByDept = useMemo(() => {
    const map: Record<string, SessionListItem[]> = {}
    for (const dept of departments) {
      const deptDir = normalizePath(dept.directory)
      map[dept.id] = allSessions
        .filter(s => normalizePath(s.project) === deptDir)
        .sort((a, b) => b.timestamp - a.timestamp)
    }
    return map
  }, [departments, allSessions])

  const openSession = async (session: SessionListItem, deptDirectory: string) => {
    if (loadingSession) return
    setLoadingSession(session.sessionId)
    try {
      useUiStore.getState().setMainView('chat')
      const raw = await window.electronAPI.sessionLoad(session.sessionId)
      const chatMessages = parseSessionMessages(raw)
      useChatStore.getState().clearMessages()
      useChatStore.getState().loadHistory(chatMessages)
      useChatStore.getState().setSessionId(session.sessionId)
      useUiStore.getState().clearUnreadForSession(session.sessionId)
      setPrefs({ workingDir: deptDirectory })
      window.electronAPI.prefsSet('workingDir', deptDirectory)
    } catch {
      // ignore
    } finally {
      setLoadingSession(null)
    }
  }

  if (departments.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', gap: 12,
        color: 'var(--text-muted)',
      }}>
        <Building2 size={40} style={{ opacity: 0.3 }} />
        <div style={{ fontSize: 14, fontWeight: 500 }}>{t('dept.noSelection')}</div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>{t('dept.noSelectionHint')}</div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px 20px' }}>
      {departments.map(dept => {
        const sessions = sessionsByDept[dept.id] || []
        return (
          <div key={dept.id} style={{ marginBottom: 32 }}>
            {/* Dept header — clickable to enter dept view */}
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                marginBottom: 12, cursor: 'pointer',
              }}
              onClick={() => onSelectDept(dept.id)}
            >
              <div style={{
                width: 12, height: 12, borderRadius: '50%',
                background: dept.color || 'var(--accent)', flexShrink: 0,
              }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                {dept.name}
              </span>
              <span style={{
                fontSize: 10, color: 'var(--text-muted)',
                background: 'rgba(255,255,255,0.06)',
                borderRadius: 4, padding: '1px 5px',
              }}>
                {sessions.length}
              </span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <ChevronRight size={12} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
            </div>

            {sessionsLoading ? (
              <div style={{ display: 'flex', gap: 10 }}>
                {[1, 2].map(i => (
                  <div key={i} style={{
                    width: 200, height: 90, borderRadius: 8,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1.5px solid var(--border)',
                  }} />
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <div style={{
                padding: '12px 16px',
                borderRadius: 8,
                border: '1px dashed var(--border)',
                color: 'var(--text-muted)',
                fontSize: 11,
                opacity: 0.6,
              }}>
                {t('dept.noSessions')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {sessions.slice(0, 6).map(session => (
                  <SessionCard
                    key={session.sessionId}
                    session={session}
                    isActive={session.sessionId === currentSessionId}
                    onClick={() => openSession(session, dept.directory)}
                  />
                ))}
                {sessions.length > 6 && (
                  <div
                    onClick={() => onSelectDept(dept.id)}
                    style={{
                      width: 220, minHeight: 110, borderRadius: 10,
                      border: '1.5px dashed var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexDirection: 'column', gap: 6,
                      cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11,
                      transition: 'border-color 0.15s, color 0.15s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}
                  >
                    <span style={{ fontSize: 16, fontWeight: 600 }}>+{sessions.length - 6}</span>
                    <span>{t('dept.sessions')}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function DepartmentDashboard() {
  const t = useT()
  const departments = useDepartmentStore(s => s.departments)
  const activeDepartmentId = useDepartmentStore(s => s.activeDepartmentId)
  const setActiveDepartmentId = useDepartmentStore(s => s.setActiveDepartmentId)

  const allSessions = useSessionStore(s => s.sessions)
  const sessionsLoading = useSessionStore(s => s.loading)
  const setSessions = useSessionStore(s => s.setSessions)
  const setLoading = useSessionStore(s => s.setLoading)

  // Local state: which dept is being drilled into (null = org chart)
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(activeDepartmentId)

  // Load sessions if not yet loaded
  useEffect(() => {
    if (allSessions.length === 0 && !sessionsLoading) {
      setLoading(true)
      window.electronAPI.sessionList().then(list => {
        setSessions(list || [])
        setLoading(false)
      }).catch(() => setLoading(false))
    }
  }, [allSessions.length, sessionsLoading, setSessions, setLoading])

  const handleSelectDept = (deptId: string) => {
    setActiveDepartmentId(deptId)
    setSelectedDeptId(deptId)
  }

  const handleBack = () => {
    setSelectedDeptId(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Top bar — always shown */}
      {!selectedDeptId && (
        <div style={{
          height: 52, flexShrink: 0,
          background: 'var(--chat-header-bg, var(--bg-nav))',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center',
          padding: '0 16px', gap: 8,
        }}>
          <Building2 size={16} style={{ color: 'var(--text-muted)' }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
            {t('dept.orgChart')}
          </span>
          <span style={{
            fontSize: 11, color: 'var(--text-muted)',
            background: 'rgba(255,255,255,0.06)',
            borderRadius: 4, padding: '2px 8px',
          }}>
            {departments.length} {t('dept.title')}
          </span>
        </div>
      )}

      {selectedDeptId ? (
        <DeptView deptId={selectedDeptId} onBack={handleBack} />
      ) : (
        <OrgChart onSelectDept={handleSelectDept} />
      )}
    </div>
  )
}
