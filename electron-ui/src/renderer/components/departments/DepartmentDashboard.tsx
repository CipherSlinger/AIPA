// DepartmentDashboard — main content view showing session cards for the active department
import React, { useEffect, useMemo, useState } from 'react'
import { Building2, FolderOpen, MessageSquarePlus, ChevronRight } from 'lucide-react'
import { useDepartmentStore, useSessionStore, useChatStore, useUiStore, usePrefsStore } from '../../store'
import { SessionListItem } from '../../types/app.types'
import SessionCard from './SessionCard'
import { useT } from '../../i18n'
import { parseSessionMessages } from '../sessions/sessionUtils'

// Normalize path for comparison (strip trailing slashes, normalize separators)
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '')
}

export default function DepartmentDashboard() {
  const t = useT()
  const departments = useDepartmentStore(s => s.departments)
  const activeDepartmentId = useDepartmentStore(s => s.activeDepartmentId)
  const dept = departments.find(d => d.id === activeDepartmentId) ?? null

  const allSessions = useSessionStore(s => s.sessions)
  const sessionsLoading = useSessionStore(s => s.loading)
  const setSessions = useSessionStore(s => s.setSessions)
  const setLoading = useSessionStore(s => s.setLoading)

  const setMainView = useUiStore(s => s.setMainView)
  const setSidebarTab = useUiStore(s => s.setSidebarTab)
  const setActiveNavItem = useUiStore(s => s.setActiveNavItem)
  const currentSessionId = useChatStore(s => s.currentSessionId)

  const setPrefs = usePrefsStore(s => s.setPrefs)

  const [loadingSession, setLoadingSession] = useState<string | null>(null)

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

  // Filter sessions for this department by matching project path
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
      // Set working dir to department directory for this session
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
    // Set working dir to department directory
    setPrefs({ workingDir: dept.directory })
    window.electronAPI.prefsSet('workingDir', dept.directory)
    useChatStore.getState().clearMessages()
    setMainView('chat')
  }

  const openFiles = () => {
    if (!dept) return
    // Set working dir to department directory then open files panel
    setPrefs({ workingDir: dept.directory })
    window.electronAPI.prefsSet('workingDir', dept.directory)
    setActiveNavItem('files')
  }

  if (!dept) {
    // No active department — show empty state prompting user to select or create one
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 12,
        color: 'var(--text-muted)',
      }}>
        <Building2 size={40} style={{ opacity: 0.3 }} />
        <div style={{ fontSize: 14, fontWeight: 500 }}>{t('dept.noSelection')}</div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>{t('dept.noSelectionHint')}</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Department header / toolbar */}
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
        {/* Color dot */}
        <div style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: dept.color || 'var(--accent)',
          flexShrink: 0,
        }} />

        {/* Department name + directory */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>
            {dept.name}
          </div>
          <div style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: 3,
          }}>
            <FolderOpen size={10} />
            {dept.directory}
          </div>
        </div>

        {/* 部门资料 (Department Files) button */}
        <button
          onClick={openFiles}
          title={t('dept.files')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '5px 10px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            fontSize: 12,
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
        >
          <FolderOpen size={13} />
          {t('dept.files')}
        </button>

        {/* 新建会话 (New Session) button */}
        <button
          onClick={newSession}
          title={t('dept.newSession')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '5px 12px',
            borderRadius: 6,
            border: 'none',
            background: 'var(--accent)',
            color: '#fff',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.85' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
        >
          <MessageSquarePlus size={13} />
          {t('dept.newSession')}
        </button>
      </div>

      {/* Sessions area */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 20px' }}>

        {/* Section label */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 16,
          color: 'var(--text-muted)',
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}>
          <ChevronRight size={12} />
          {t('dept.sessions')}
          <span style={{
            background: 'rgba(255,255,255,0.08)',
            borderRadius: 4,
            padding: '1px 6px',
            fontSize: 10,
            fontWeight: 500,
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
          // Empty state
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 20px',
            gap: 12,
            color: 'var(--text-muted)',
            textAlign: 'center',
          }}>
            <MessageSquarePlus size={36} style={{ opacity: 0.3 }} />
            <div style={{ fontSize: 13, fontWeight: 500 }}>{t('dept.noSessions')}</div>
            <div style={{ fontSize: 11, opacity: 0.7, maxWidth: 240, lineHeight: 1.6 }}>{t('dept.noSessionsHint')}</div>
            <button
              onClick={newSession}
              style={{
                marginTop: 4,
                padding: '7px 16px',
                borderRadius: 6,
                border: 'none',
                background: 'var(--accent)',
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {t('dept.newSession')}
            </button>
          </div>
        ) : (
          // Session cards grid
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
