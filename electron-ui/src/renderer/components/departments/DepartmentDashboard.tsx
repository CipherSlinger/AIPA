// DepartmentDashboard — the single-department view: the roster of employees
// (sessions) belonging to the department the user drilled into from the
// organization chart (OrgChart.tsx). Employees are shown as standing figures
// (EmployeeFigure) rather than generic session cards.
import { useEffect, useState } from 'react'
import { Building2 } from 'lucide-react'
import { useChatStore, useDepartmentStore, useSessionStore, useUiStore } from '../../store'
import type { SessionListItem } from '../../types/app.types'
import OrgChart from './OrgChart'
import { kindOf } from './deptUtils'
import { openSessionCore } from './openSessionCore'
import { useT } from '../../i18n'
import { listSessionsShared } from '../../utils/sessionListShared'
import DeptView from './DepartmentDashboard.deptView'

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
    listSessionsShared().then(list => {
      if (!isMounted) return
      setSessions((list ?? []) as SessionListItem[])
      setLoading(false)
    })
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

  const handleDeleteSession = async (sessionId: string, sessionTitle?: string) => {
    try {
      if (typeof window.electronAPI.sessionDelete === 'function') {
        // The delete now only moves the transcript into "Recently deleted" and
        // says why when it could not. A refused delete must not make the row
        // vanish: it is still on disk, so the sidebar keeps it — and the toast
        // says why, because a click that appears to do nothing reads as broken.
        const result = await window.electronAPI.sessionDelete(sessionId, sessionTitle)
        if (!result.success) {
          useUiStore.getState().addToast(
            'error',
            result.code === 'not_found'
              ? t('trash.failure.notFound')
              : t('sessionTrash.failure.deleteFailed', { message: result.error }),
          )
          return
        }
        // The number of days is deliberately not spoken here: main owns the
        // window, and a sentence with no number cannot disagree with it.
        useUiStore.getState().addToast('success', t('sessionTrash.deleted'))
      }
      // If the conversation was the one on screen, close it: it is no longer in
      // the sidebar, and leaving it displayed would let the next turn write a
      // fresh transcript at the path the trashed copy would need back.
      if (useChatStore.getState().viewSessionId === sessionId) {
        useChatStore.getState().clearMessages()
      }
      const updated = useSessionStore.getState().sessions.filter(s => s.sessionId !== sessionId)
      useSessionStore.getState().setSessions(updated)
    } catch (err) {
      useUiStore.getState().addToast(
        'error',
        t('sessionTrash.failure.deleteFailed', { message: String(err) }),
      )
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
            onOpenSession={(session, directory) => handleOpenSession(
              session,
              directory ?? departments.find(d => d.id === selectedDeptId)?.directory ?? '',
            )}
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
              background: 'rgba(99,102,241,0.12)', color: 'var(--accent-text)',
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
