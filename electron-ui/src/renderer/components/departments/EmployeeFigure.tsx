// EmployeeFigure — one employee (a session) standing in a department roster.
//
// Replaces the generic SessionCard inside a department drill-down: instead of a
// text card, each employee is a little yellow helper. The drawing itself lives in
// employeeFigureArt.tsx; what is here is the chrome around it — the label, the
// pin/fire actions, the status line. Every animation lives in globals.css
// (.emp-*) rather than in per-tile React state, so a roster of 50 costs no
// re-renders on hover.

import React, { useMemo, useState } from 'react'
import { MessageSquare, Pin, Trash2 } from 'lucide-react'
import { SessionListItem } from '../../types/app.types'
import { formatRelativeTime, readSessionPersonaId } from './deptUtils'
import { useI18n } from '../../i18n'
import { useChatStore, usePrefsStore } from '../../store'
import { Figure, GhostSilhouette, lookFor } from './employeeFigureArt'
import { displayTitle } from '../../lib/sessionTitle'
import SessionOriginBadge from '../shared/SessionOriginBadge'

// Stable fallback — avoids a new {} on every Zustand selector call
const EMPTY_COLOR_LABELS: Record<string, string> = {}
// Same for personas: `?? []` in a selector would invalidate the subscription.
const EMPTY_PERSONAS: NonNullable<ReturnType<typeof usePrefsStore.getState>['prefs']['personas']> = []
const LABEL_COLORS = ['#f87171', '#f97316', '#fbbf24', '#22c55e', '#6366f1', '#a78bfa', '#ec4899']

const ACTION_BTN: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 22,
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--bg-primary)',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  padding: 0,
}

interface EmployeeFigureProps {
  session: SessionListItem
  onClick: () => void
  isActive?: boolean
  /** Whether this session is streaming right now — drives the working pose. */
  isStreaming?: boolean
  isLoading?: boolean
  onDelete?: () => void
}

export default function EmployeeFigure({
  session,
  onClick,
  isActive,
  isStreaming,
  isLoading,
  onDelete,
}: EmployeeFigureProps) {
  const { t, resolvedLocale } = useI18n()
  const colorLabels = usePrefsStore(s => s.prefs?.sessionColorLabels ?? EMPTY_COLOR_LABELS)
  const setPrefs = usePrefsStore(s => s.setPrefs)
  const personas = usePrefsStore(s => s.prefs.personas ?? EMPTY_PERSONAS)
  // The open session carries the freshest binding; every other employee is read
  // from the mapping chatStore wrote when it was hired.
  const livePersonaId = useChatStore(s => s.currentSessionId === session.sessionId ? s.sessionPersonaId : undefined)
  const persona = personas.find(p => p.id === (livePersonaId ?? readSessionPersonaId(session.sessionId)))

  const look = useMemo(() => lookFor(session.sessionId), [session.sessionId])
  const pinKey = `aipa:session-pin:${session.sessionId}`
  const [pinned, setPinned] = useState(() => localStorage.getItem(pinKey) === '1')
  const [confirmingFire, setConfirmingFire] = useState(false)

  const labelColor = colorLabels[session.sessionId] ?? null
  const working = !!isStreaming && !isLoading
  const title = displayTitle(session, t('session.untitled'), 60)

  const status = isLoading
    ? { label: t('dept.empLoading'), color: 'var(--accent-text)' }
    : working
    ? { label: t('dept.empWorking'), color: '#4ade80' }
    : { label: t('dept.empIdle'), color: 'var(--text-faint)' }

  const togglePin = (e: React.MouseEvent) => {
    e.stopPropagation()
    const next = !pinned
    setPinned(next)
    try {
      if (next) localStorage.setItem(pinKey, '1')
      else localStorage.removeItem(pinKey)
    } catch {}
  }

  // Shift-click cycles the color label; the label doubles as the floor glow.
  const handleClick = (e: React.MouseEvent) => {
    if (e.shiftKey) {
      e.preventDefault()
      e.stopPropagation()
      const currentIdx = labelColor ? LABEL_COLORS.indexOf(labelColor) : -1
      const nextIdx = (currentIdx + 1) % (LABEL_COLORS.length + 1)
      const nextColor = nextIdx < LABEL_COLORS.length ? LABEL_COLORS[nextIdx] : null
      const nextLabels = { ...colorLabels }
      if (nextColor) nextLabels[session.sessionId] = nextColor
      else delete nextLabels[session.sessionId]
      setPrefs({ sessionColorLabels: nextLabels })
      window.electronAPI.prefsSet('sessionColorLabels', nextLabels)
      return
    }
    onClick()
  }

  return (
    <div
      className={`emp-tile${working ? ' emp-working' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`${title} — ${status.label}`}
      title={session.title || title}
      onClick={handleClick}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
    >
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', height: 104 }}>
        <Figure look={look} glow={labelColor || 'var(--border)'} />

        {/* Hover chrome — pinned marker, open/dismiss, and the two-step fire confirm */}
        <div
          className="emp-actions"
          style={{
            position: 'absolute',
            top: 0,
            right: -6,
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
          }}
        >
          <button
            onClick={togglePin}
            title={pinned ? t('session.unpinSession') : t('session.pinSession')}
            aria-label={pinned ? t('session.unpinSession') : t('session.pinSession')}
            style={{ ...ACTION_BTN, color: pinned ? '#fbbf24' : 'var(--text-muted)' }}
          >
            <Pin size={11} fill={pinned ? '#fbbf24' : 'none'} />
          </button>
          {onDelete && !confirmingFire && (
            <button
              onClick={e => { e.stopPropagation(); setConfirmingFire(true) }}
              title={t('dept.deleteSession')}
              aria-label={t('dept.deleteSession')}
              style={{ ...ACTION_BTN, color: 'var(--text-muted)' }}
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </div>

      {confirmingFire ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={e => e.stopPropagation()}>
          <button
            onClick={() => { setConfirmingFire(false); onDelete?.() }}
            style={{
              ...ACTION_BTN, width: 'auto', padding: '2px 7px',
              fontSize: 10, fontWeight: 600,
              color: '#f87171', borderColor: 'rgba(248,113,113,0.45)',
            }}
          >
            {t('dept.empFire')}
          </button>
          <button
            onClick={() => setConfirmingFire(false)}
            style={{ ...ACTION_BTN, width: 'auto', padding: '2px 7px', fontSize: 10 }}
          >
            {t('common.cancel')}
          </button>
        </div>
      ) : (
        <>
          <div style={{
            maxWidth: '100%',
            fontSize: 12,
            fontWeight: isActive ? 600 : 500,
            color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            textAlign: 'center',
          }}>
            {title}
          </div>
          {/* The same origin badge the archive shows, on the roster's session
              rows. Tiles are narrow, so it gives up the job/plugin name first. */}
          <SessionOriginBadge origin={session.origin} style={{ maxWidth: '100%' }} />
          {/* Who is on duty: the persona the employee was hired as, and the model
              it runs. Read-only — changing it happens in the chat persona picker. */}
          {persona && (
            <div
              title={`${persona.name} · ${persona.model}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 3,
                maxWidth: '100%', padding: '0 5px', borderRadius: 999,
                border: `1px solid ${persona.color}55`, background: `${persona.color}14`,
                color: persona.color, fontSize: 9, lineHeight: '15px',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              <span aria-hidden="true" style={{ flexShrink: 0 }}>{persona.emoji}</span>
              {/* Name never shrinks; the model gives up its width first. A
                  shrinkable name span collapsed to nothing on narrow tiles,
                  leaving a badge that identified the model but not the person. */}
              <span style={{ flexShrink: 0 }}>{persona.name}</span>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.7 }}>· {persona.model}</span>
            </div>
          )}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{
                width: 5, height: 5, borderRadius: '50%',
                background: status.color,
                boxShadow: working ? '0 0 5px rgba(74,222,128,0.8)' : undefined,
              }} />
              {status.label}
            </span>
            {session.messageCount ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <MessageSquare size={9} />
                {session.messageCount}
              </span>
            ) : null}
            <span>{formatRelativeTime(session.timestamp, t, resolvedLocale)}</span>
          </div>
        </>
      )}
    </div>
  )
}

/** Placeholder worn by a figure whose sessions are still loading. */
export function SkeletonFigure() {
  return (
    <div className="emp-tile emp-skeleton" aria-hidden="true">
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', height: 104 }}>
        <GhostSilhouette />
      </div>
    </div>
  )
}


