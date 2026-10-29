// The employee roster itself: skeletons, the two empty states, unfilled
// positions, and the standing figures grouped by recency.
//
// Unfilled positions lead the roster in every sort order: the seat is already
// at the desk, it just has nobody in it yet.

import { MessageSquarePlus, Search } from 'lucide-react'
import type { Position } from '../../store'
import type { Persona, SessionListItem } from '../../types/app.types'
import { useT } from '../../i18n'
import EmployeeFigure, { SkeletonFigure } from './EmployeeFigure'
import GhostPositionTile from './GhostPositionTile'
import { groupSessionsByRecency, type SortOrder } from './DepartmentDashboard.data'

const SKELETON_ROWS = [0, 1, 2]

interface DeptRosterProps {
  /** Sessions after search and pin ordering. */
  sessions: SessionListItem[]
  /** Unfilled positions after search. */
  positions: Position[]
  /** The desk had no sessions and no positions before filtering. */
  empty: boolean
  sessionsLoading: boolean
  searchQuery: string
  sortOrder: SortOrder
  selectMode: boolean
  selectedSessions: Set<string>
  currentSessionId: string | null
  isStreaming: boolean
  loadingSessionId?: string | null
  deptColor?: string
  /** All personas, to resolve a seat's binding (and its department fallback). */
  personas: Persona[]
  /** Persona an unbound position inherits. */
  defaultPersonaId?: string
  /**
   * Session ids on this page the user filed by hand. Membership is already
   * decided by `sessions`; this only marks the label's provenance.
   */
  filedByHand: ReadonlySet<string>
  onToggleSelect: (sessionId: string) => void
  onOpenSession: (session: SessionListItem) => void
  onDeleteSession?: (sessionId: string, sessionTitle?: string) => void
  onNewSession: () => void
  onHire: (position: Position) => void
  onEdit: (position: Position) => void
  onDismiss: (position: Position) => void
}

export default function DeptRoster({
  sessions,
  positions,
  empty,
  sessionsLoading,
  searchQuery,
  sortOrder,
  selectMode,
  selectedSessions,
  currentSessionId,
  isStreaming,
  loadingSessionId,
  deptColor,
  personas,
  defaultPersonaId,
  filedByHand,
  onToggleSelect,
  onOpenSession,
  onDeleteSession,
  onNewSession,
  onHire,
  onEdit,
  onDismiss,
}: DeptRosterProps) {
  const t = useT()

  if (sessionsLoading) {
    return (
      <div className="emp-roster">
        {SKELETON_ROWS.map(i => <SkeletonFigure key={i} />)}
        <div className="emp-floor" />
      </div>
    )
  }

  if (empty) {
    return (
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
          onClick={onNewSession}
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
    )
  }

  if (sessions.length === 0 && positions.length === 0 && searchQuery) {
    return (
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
    )
  }

  const renderEmployee = (session: SessionListItem) => (
    <div
      key={session.sessionId}
      style={{ position: 'relative' }}
      onClick={selectMode ? e => {
        e.stopPropagation()
        onToggleSelect(session.sessionId)
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
          filedByHand={filedByHand.has(session.sessionId)}
          onDelete={selectMode ? undefined : () => onDeleteSession?.(
            session.sessionId,
            session.title || session.lastPrompt,
          )}
        />
      </div>
    </div>
  )

  const ghostGroup = positions.length > 0 && (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.07em',
        marginBottom: 10,
        paddingLeft: 8,
        borderLeft: `2px dashed ${deptColor || '#6366f1'}`,
      }}>
        {t('dept.positionOpen')}
        <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, opacity: 0.7 }}>
          {positions.length}
        </span>
      </div>
      <div className="emp-roster">
        {positions.map(pos => {
          // A position without its own binding shows the department default,
          // because that is exactly who it will be hired as.
          const persona = personas.find(p => p.id === (pos.personaId || defaultPersonaId))
          return (
            <GhostPositionTile
              key={pos.id}
              position={{ ...pos, color: pos.color || deptColor }}
              persona={persona}
              onHire={() => onHire(pos)}
              onEdit={() => onEdit(pos)}
              onDismiss={() => onDismiss(pos)}
            />
          )
        })}
        <div className="emp-floor" />
      </div>
    </div>
  )

  if (sortOrder !== 'recent') {
    return (
      <div>
        {ghostGroup}
        <div className="emp-roster">
          {sessions.map(renderEmployee)}
          <div className="emp-floor" />
        </div>
      </div>
    )
  }

  return (
    <div>
      {ghostGroup}
      {groupSessionsByRecency(sessions, t).map(group => (
        <div key={group.label} style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.07em',
            marginBottom: 10,
            paddingLeft: 8,
            borderLeft: `2px solid ${deptColor || '#6366f1'}`,
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
}
