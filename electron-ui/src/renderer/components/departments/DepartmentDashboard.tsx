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
        height: 56,
        flexShrink: 0,
        background: 'var(--chat-header-bg, var(--bg-nav))',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        gap: 10,
      }}>
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
            e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
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
          background: dept.color || 'var(--accent)',
          flexShrink: 0,
          boxShadow: `0 0 0 2px rgba(255,255,255,0.08)`,
        }} />

        {/* Dept name + dir */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{
            fontSize: 15,
            fontWeight: 700,
            color: 'var(--text-primary)',
            lineHeight: 1.3,
          }}>
            {dept.name}
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
          onClick={openFiles}
          title={t('dept.files')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '5px 11px',
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            fontSize: 12,
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'border-color 0.15s, color 0.15s, background 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--accent)'
            e.currentTarget.style.color = 'var(--accent)'
            e.currentTarget.style.background = 'rgba(99,102,241,0.08)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
            e.currentTarget.style.color = 'var(--text-secondary)'
            e.currentTarget.style.background = 'transparent'
          }}
        >
          <FolderOpen size={13} />
          {t('dept.files')}
        </button>

        <button
          onClick={newSession}
          title={t('dept.newSession')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '5px 13px',
            borderRadius: 6,
            border: 'none',
            background: 'var(--accent)',
            color: '#fff',
            fontSize: 12,
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
        </button>
      </div>

      {/* Sessions area */}
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 24px' }}>
        {/* Section header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 18,
          paddingLeft: 10,
          borderLeft: '2px solid var(--accent)',
        }}>
          <span style={{
            color: 'var(--text-muted)',
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}>
            {t('dept.sessions')}
          </span>
          <span style={{
            background: 'rgba(255,255,255,0.08)',
            borderRadius: 20,
            padding: '1px 7px',
            fontSize: 10,
            fontWeight: 500,
            color: 'var(--text-muted)',
          }}>
            {deptSessions.length}
          </span>
        </div>

        {sessionsLoading ? (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[1, 2, 3].map(i => (
              <div
                key={i}
                style={{
                  width: 240,
                  minHeight: 130,
                  borderRadius: 12,
                  background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.04) 75%)',
                  backgroundSize: '200% 100%',
                  border: '1.5px solid rgba(255,255,255,0.06)',
                  animation: 'shimmer 1.6s ease-in-out infinite',
                }}
              />
            ))}
          </div>
        ) : deptSessions.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '48px 20px',
            gap: 14,
            color: 'var(--text-muted)',
            textAlign: 'center',
          }}>
            <MessageSquarePlus size={40} style={{ opacity: 0.18 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>
              {t('dept.noSessions')}
            </div>
            <div style={{ fontSize: 12, opacity: 0.65, maxWidth: 240, lineHeight: 1.65 }}>
              {t('dept.noSessionsHint')}
            </div>
            <button
              onClick={newSession}
              style={{
                marginTop: 4,
                padding: '8px 18px',
                borderRadius: 7,
                border: 'none',
                background: 'var(--accent)',
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 10px rgba(99,102,241,0.4)',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.85' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
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
  const [hoveredDept, setHoveredDept] = useState<string | null>(null)

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

  const newSessionInDept = (dept: { id: string; directory: string; name: string; color?: string }) => {
    setPrefs({ workingDir: dept.directory })
    window.electronAPI.prefsSet('workingDir', dept.directory)
    useChatStore.getState().clearMessages()
    useUiStore.getState().setMainView('chat')
  }

  if (departments.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 0,
      }}>
        {/* Beautiful empty state card */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
          padding: '40px 36px',
          borderRadius: 16,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          maxWidth: 300,
          textAlign: 'center',
        }}>
          <Building2 size={48} color="var(--text-muted)" style={{ opacity: 0.2 }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
              {t('dept.noSelection')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.65, opacity: 0.8 }}>
              {t('dept.noSelectionHint')}
            </div>
          </div>
          <button
            style={{
              marginTop: 4,
              padding: '8px 18px',
              borderRadius: 7,
              border: '1px solid var(--accent)',
              background: 'rgba(99,102,241,0.1)',
              color: 'var(--accent)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.18)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.1)' }}
          >
            + {t('dept.create')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '28px 24px' }}>
      {departments.map(dept => {
        const sessions = sessionsByDept[dept.id] || []
        const isHovered = hoveredDept === dept.id
        return (
          <div key={dept.id} style={{ marginBottom: 36 }}>
            {/* Dept header — clickable to enter dept view */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                marginBottom: 14,
                cursor: 'pointer',
                padding: '6px 10px',
                borderRadius: 8,
                margin: '0 -10px 14px',
                background: isHovered ? 'rgba(255,255,255,0.04)' : 'transparent',
                transition: 'background 0.15s',
              }}
              onClick={() => onSelectDept(dept.id)}
              onMouseEnter={() => setHoveredDept(dept.id)}
              onMouseLeave={() => setHoveredDept(null)}
            >
              {/* Color dot — larger and more prominent */}
              <div style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: dept.color || 'var(--accent)',
                flexShrink: 0,
                boxShadow: `0 0 0 2px rgba(255,255,255,0.08)`,
              }} />

              {/* Dept name */}
              <span style={{
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--text-primary)',
              }}>
                {dept.name}
              </span>

              {/* Session count badge — pill */}
              <span style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                background: 'rgba(255,255,255,0.10)',
                borderRadius: 20,
                padding: '1px 8px',
                fontWeight: 500,
              }}>
                {sessions.length}
              </span>

              {/* Divider line — thinner, more subtle */}
              <div style={{
                flex: 1,
                height: 1,
                background: 'rgba(255,255,255,0.08)',
                marginLeft: 2,
              }} />

              <ChevronRight
                size={13}
                style={{
                  color: isHovered ? 'var(--text-secondary)' : 'var(--text-muted)',
                  opacity: isHovered ? 0.8 : 0.4,
                  transition: 'color 0.15s, opacity 0.15s',
                }}
              />
            </div>

            {sessionsLoading ? (
              <div style={{ display: 'flex', gap: 10 }}>
                {[1, 2].map(i => (
                  <div
                    key={i}
                    style={{
                      width: 240,
                      height: 130,
                      borderRadius: 12,
                      background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.04) 75%)',
                      backgroundSize: '200% 100%',
                      border: '1.5px solid rgba(255,255,255,0.06)',
                      animation: 'shimmer 1.6s ease-in-out infinite',
                      animationDelay: `${i * 0.15}s`,
                    }}
                  />
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <div style={{
                padding: '13px 16px',
                borderRadius: 8,
                border: '1px dashed rgba(255,255,255,0.1)',
                color: 'var(--text-muted)',
                fontSize: 11,
                opacity: 0.55,
                letterSpacing: '0.01em',
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
                      width: 240,
                      minHeight: 130,
                      borderRadius: 12,
                      border: '1.5px dashed rgba(255,255,255,0.12)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'column',
                      gap: 6,
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      fontSize: 11,
                      transition: 'border-color 0.15s, color 0.15s, background 0.15s',
                      background: 'rgba(255,255,255,0.02)',
                    }}
                    onMouseEnter={e => {
                      const el = e.currentTarget as HTMLElement
                      el.style.borderColor = 'var(--accent)'
                      el.style.color = 'var(--accent)'
                      el.style.background = 'rgba(99,102,241,0.06)'
                    }}
                    onMouseLeave={e => {
                      const el = e.currentTarget as HTMLElement
                      el.style.borderColor = 'rgba(255,255,255,0.12)'
                      el.style.color = 'var(--text-muted)'
                      el.style.background = 'rgba(255,255,255,0.02)'
                    }}
                  >
                    <span style={{ fontSize: 18, fontWeight: 700 }}>+{sessions.length - 6}</span>
                    <span style={{ letterSpacing: '0.03em' }}>{t('dept.sessions')}</span>
                  </div>
                )}
                {/* New session card */}
                <div
                  onClick={() => newSessionInDept(dept)}
                  title={t('dept.newSession')}
                  style={{
                    width: 240,
                    minHeight: 130,
                    borderRadius: 12,
                    border: '1.5px dashed rgba(255,255,255,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    gap: 6,
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    transition: 'border-color 0.15s, color 0.15s, background 0.15s',
                    background: 'rgba(255,255,255,0.02)',
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLElement
                    el.style.borderColor = 'var(--accent)'
                    el.style.color = 'var(--accent)'
                    el.style.background = 'rgba(99,102,241,0.06)'
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLElement
                    el.style.borderColor = 'rgba(255,255,255,0.15)'
                    el.style.color = 'var(--text-muted)'
                    el.style.background = 'rgba(255,255,255,0.02)'
                  }}
                >
                  <span style={{ fontSize: 28, fontWeight: 200, lineHeight: 1 }}>+</span>
                  <span style={{ fontSize: 10, letterSpacing: '0.03em' }}>{t('dept.newSession')}</span>
                </div>
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
  const setActiveDepartmentId = useDepartmentStore(s => s.setActiveDepartmentId)

  const setSessions = useSessionStore(s => s.setSessions)
  const setLoading = useSessionStore(s => s.setLoading)

  // Local state: which dept is being drilled into (null = org chart)
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null)

  // Always reload sessions when DepartmentDashboard mounts
  useEffect(() => {
    setLoading(true)
    window.electronAPI.sessionList().then((list: any) => {
      setSessions(list || [])
      setLoading(false)
    }).catch(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run on mount — always refresh sessions when entering dept view

  const handleSelectDept = (deptId: string) => {
    setActiveDepartmentId(deptId)
    setSelectedDeptId(deptId)
  }

  const handleBack = () => {
    setSelectedDeptId(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Top bar — shown on org chart view */}
      {!selectedDeptId && (
        <div style={{
          height: 56,
          flexShrink: 0,
          background: 'var(--chat-header-bg, var(--bg-nav))',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          gap: 9,
        }}>
          <Building2 size={16} style={{ color: 'var(--text-muted)', opacity: 0.8 }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', flex: 1, letterSpacing: '-0.01em' }}>
            {t('dept.orgChart')}
          </span>
          <span style={{
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--text-muted)',
            background: 'rgba(255,255,255,0.07)',
            borderRadius: 20,
            padding: '2px 10px',
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
