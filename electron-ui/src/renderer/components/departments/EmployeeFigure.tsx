// EmployeeFigure — one employee (a session) standing in a department roster.
//
// Replaces the generic SessionCard inside a department drill-down: instead of a
// text card, each employee is a small standing figurine. The look is derived
// deterministically from the session id, so the same employee always comes back
// as the same person, and every animation lives in globals.css (.emp-*) rather
// than in per-tile React state — a roster of 50 costs no re-renders on hover.

import React, { useMemo, useState } from 'react'
import { MessageSquare, Pin, Trash2 } from 'lucide-react'
import { SessionListItem } from '../../types/app.types'
import { formatRelativeTime } from './deptUtils'
import { useT } from '../../i18n'
import { usePrefsStore } from '../../store'

// Stable fallback — avoids a new {} on every Zustand selector call
const EMPTY_COLOR_LABELS: Record<string, string> = {}
const LABEL_COLORS = ['#f87171', '#f97316', '#fbbf24', '#22c55e', '#6366f1', '#a78bfa', '#ec4899']

// Palettes sampled by the id hash — enough variety that a roster reads as a
// group of different people, few enough that everyone still looks on-model.
const SKIN = ['#f7dfc8', '#f2d3b4', '#e8bd97', '#d9a273', '#c08552', '#8d5a3b']
const HAIR = ['#2f2a26', '#4a3423', '#6b4423', '#8b5e34', '#1f1f24', '#7b7b85', '#a8632a']
const SHIRT = ['#6366f1', '#8b5cf6', '#0ea5e9', '#14b8a6', '#f59e0b', '#ef4444', '#ec4899', '#22c55e', '#64748b']
const PANTS = ['#334155', '#3f3f46', '#1e293b', '#4c1d95', '#0f766e']

/** FNV-1a — same session id always yields the same person. */
function hashId(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

interface Look {
  skin: string
  hair: string
  shirt: string
  pants: string
  hairStyle: number
  glasses: boolean
  beard: boolean
  tie: boolean
  smile: number
}

function lookFor(sessionId: string): Look {
  const h = hashId(sessionId)
  const pick = <T,>(arr: readonly T[], shift: number): T => arr[(h >>> shift) % arr.length]
  return {
    skin: pick(SKIN, 0),
    hair: pick(HAIR, 3),
    shirt: pick(SHIRT, 6),
    pants: pick(PANTS, 9),
    hairStyle: (h >>> 12) % 4,
    glasses: (h >>> 14) % 5 === 0,
    beard: (h >>> 16) % 7 === 0,
    tie: (h >>> 18) % 3 === 0,
    smile: (h >>> 20) % 3,
  }
}

/** The figurine itself. Feet sit at y=89 so several tiles line up on a floor. */
function Figure({ look, glow }: { look: Look; glow: string }) {
  const mouth = '#8a5a44'
  return (
    <svg width={76} height={104} viewBox="0 0 64 108" style={{ display: 'block', overflow: 'visible' }}>
      {/* Rotating halo — faint on hover, always spinning while working. */}
      <circle
        className="emp-halo"
        cx="32" cy="48" r="29"
        fill="none" stroke="#818cf8" strokeWidth="1.3" strokeDasharray="7 9"
      />
      {/* Floor glow: the session's color label, when it has one. */}
      <ellipse cx="32" cy="90.5" rx="16" ry="3.2" fill={glow} opacity="0.55" />

      <g className="emp-figure">
        {/* Legs and shoes */}
        <rect x="25.4" y="60" width="5.4" height="26" rx="2.7" fill={look.pants} />
        <rect x="33.2" y="60" width="5.4" height="26" rx="2.7" fill={look.pants} />
        <rect x="23.2" y="84" width="9.6" height="5" rx="2.5" fill="#1f2430" />
        <rect x="31.2" y="84" width="9.6" height="5" rx="2.5" fill="#1f2430" />

        {/* Arms — the right one types while the employee is working */}
        <rect className="emp-arm-l" x="16.4" y="40.5" width="5" height="19.5" rx="2.5" fill={look.shirt} />
        <rect className="emp-arm-r" x="42.6" y="40.5" width="5" height="19.5" rx="2.5" fill={look.shirt} />
        <circle cx="18.9" cy="61" r="2.9" fill={look.skin} />
        <circle cx="45.1" cy="61" r="2.9" fill={look.skin} />

        {/* Torso */}
        <rect x="21.4" y="39" width="21.2" height="23" rx="6.5" fill={look.shirt} />
        <path d="M27.2 39.7q4.8 3.8 9.6 0" fill="none" stroke="rgba(255,255,255,0.38)" strokeWidth="1.2" />
        {look.tie && <path d="M32 43l2.5 2.3-2.5 11.6-2.5-11.6z" fill="rgba(255,255,255,0.6)" />}
        <circle cx="32" cy="50.5" r="0.9" fill="rgba(255,255,255,0.45)" />
        <circle cx="32" cy="56.5" r="0.9" fill="rgba(255,255,255,0.45)" />

        {/* Neck and head. The hair circle sits higher and the face circle covers
            most of it, which leaves a hairline cap without any path work. */}
        <rect x="29.4" y="33.6" width="5.2" height="6.4" rx="2" fill={look.skin} />
        <circle cx={look.hairStyle === 3 ? 29.4 : 32} cy={look.hairStyle === 3 ? 25.6 : 27} r="10.7" fill={look.hair} />
        <circle cx="32" cy="29.6" r="9.4" fill={look.skin} />
        {look.hairStyle === 1 && (
          <>
            <rect x="21.8" y="26" width="3.8" height="14" rx="1.9" fill={look.hair} />
            <rect x="38.4" y="26" width="3.8" height="14" rx="1.9" fill={look.hair} />
          </>
        )}
        {look.hairStyle === 2 && <circle cx="32" cy="15.8" r="3.5" fill={look.hair} />}
        <circle cx="22.1" cy="30.2" r="1.7" fill={look.skin} />
        <circle cx="41.9" cy="30.2" r="1.7" fill={look.skin} />

        {/* Face */}
        <ellipse className="emp-eye" cx="28.4" cy="29.8" rx="1.5" ry="1.8" fill="#20202a" />
        <ellipse className="emp-eye" cx="35.6" cy="29.8" rx="1.5" ry="1.8" fill="#20202a" />
        {look.glasses && (
          <g stroke="#3b3f52" strokeWidth="1" fill="none">
            <circle cx="28.4" cy="29.8" r="3.5" />
            <circle cx="35.6" cy="29.8" r="3.5" />
            <line x1="31.9" y1="29.8" x2="32.1" y2="29.8" />
          </g>
        )}
        {look.beard && (
          <path
            d="M26.6 33.4a5.8 5.8 0 0 0 10.8 0c0 4.6-2.5 7.4-5.4 7.4s-5.4-2.8-5.4-7.4z"
            fill={look.hair}
            opacity="0.9"
          />
        )}
        {look.smile === 0 && (
          <path d="M29 34.4q3 2.3 6 0" fill="none" stroke={mouth} strokeWidth="1.1" strokeLinecap="round" />
        )}
        {look.smile === 1 && (
          <line x1="29.6" y1="34.9" x2="34.4" y2="34.9" stroke={mouth} strokeWidth="1.1" strokeLinecap="round" />
        )}
        {look.smile === 2 && <path d="M28.8 34.2q3.2 3.4 6.4 0z" fill={mouth} />}
      </g>
    </svg>
  )
}

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
  const t = useT()
  const colorLabels = usePrefsStore(s => s.prefs?.sessionColorLabels ?? EMPTY_COLOR_LABELS)
  const setPrefs = usePrefsStore(s => s.setPrefs)

  const look = useMemo(() => lookFor(session.sessionId), [session.sessionId])
  const pinKey = `aipa:session-pin:${session.sessionId}`
  const [pinned, setPinned] = useState(() => localStorage.getItem(pinKey) === '1')
  const [confirmingFire, setConfirmingFire] = useState(false)

  const labelColor = colorLabels[session.sessionId] ?? null
  const working = !!isStreaming && !isLoading
  const title = session.title || session.lastPrompt?.slice(0, 60) || t('session.untitled')

  const status = isLoading
    ? { label: t('dept.empLoading'), color: '#818cf8' }
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
      title={session.lastPrompt?.slice(0, 200) || title}
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
            <span>{formatRelativeTime(session.timestamp, t)}</span>
          </div>
        </>
      )}
    </div>
  )
}

/** The headless silhouette shared by the recruiting slot and the loading ghosts. */
function GhostSilhouette() {
  return (
    <svg width={76} height={104} viewBox="0 0 64 108" style={{ display: 'block' }}>
      <ellipse className="emp-ghost-body" cx="32" cy="90.5" rx="11" ry="3.2" />
      <g className="emp-figure">
        <circle className="emp-ghost-body" cx="32" cy="27" r="10.4" />
        <rect className="emp-ghost-body" x="21.4" y="40" width="21.2" height="22" rx="6.5" />
        <rect className="emp-ghost-body" x="16.6" y="41.5" width="4.6" height="18" rx="2.3" />
        <rect className="emp-ghost-body" x="42.8" y="41.5" width="4.6" height="18" rx="2.3" />
        <rect className="emp-ghost-body" x="25.4" y="62" width="5.2" height="24" rx="2.6" />
        <rect className="emp-ghost-body" x="33.4" y="62" width="5.2" height="24" rx="2.6" />
      </g>
    </svg>
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

/** The recruiting slot — a dashed outline where the next employee will stand. */
export function PendingFigure({ onEnter, onCancel }: { onEnter: () => void; onCancel: () => void }) {
  const t = useT()
  return (
    <div
      className="emp-tile emp-ghost"
      role="button"
      tabIndex={0}
      title={t('dept.pendingSessionHint')}
      onClick={onEnter}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onEnter()
        }
      }}
    >
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', height: 104 }}>
        <GhostSilhouette />
        <button
          onClick={e => { e.stopPropagation(); onCancel() }}
          title={t('common.cancel')}
          aria-label={t('common.cancel')}
          className="emp-actions"
          style={{ ...ACTION_BTN, position: 'absolute', top: 0, right: -6 }}
        >
          <Trash2 size={11} />
        </button>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#818cf8' }}>{t('dept.newSession')}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.4 }}>
        {t('dept.pendingSessionHint')}
      </div>
    </div>
  )
}
