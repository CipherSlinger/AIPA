// EmployeeFigure — one employee (a session) standing in a department roster.
//
// Replaces the generic SessionCard inside a department drill-down: instead of a
// text card, each employee is a little yellow helper — one pill-shaped body
// carrying both head and torso, goggles, denim overalls, black gloves. The look
// is derived deterministically from the session id (one eye or two, height,
// hair, denim shade, mouth), so the same employee always comes back as the same
// character, and every animation lives in globals.css (.emp-*) rather than in
// per-tile React state — a roster of 50 costs no re-renders on hover.

import React, { useMemo, useState } from 'react'
import { MessageSquare, Pin, Trash2 } from 'lucide-react'
import { SessionListItem } from '../../types/app.types'
import { formatRelativeTime } from './deptUtils'
import { useT } from '../../i18n'
import { usePrefsStore } from '../../store'

// Stable fallback — avoids a new {} on every Zustand selector call
const EMPTY_COLOR_LABELS: Record<string, string> = {}
const LABEL_COLORS = ['#f87171', '#f97316', '#fbbf24', '#22c55e', '#6366f1', '#a78bfa', '#ec4899']

// Palette sampled by the id hash — enough variety that a roster reads as a
// crowd of distinct helpers, few enough that everyone still looks on-model.
const BODY = ['#f7d64a', '#f4cf3c', '#f9df66']
const DENIM = ['#4a76c4', '#3d63ad', '#5680cc', '#41659f']
const STRAP = ['#4b5563', '#334155', '#5b6472']
const TUFT = ['#2a2118', '#1f1f24', '#3a2a1c']
const HEIGHTS = [1, 0.93, 0.86]
const GLOVE = '#2b303b'

/** FNV-1a — same session id always yields the same character. */
function hashId(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

interface Look {
  body: string
  denim: string
  strap: string
  tuft: string
  /** Vertical scale — the roster is more fun when they are not all the same height. */
  height: number
  eyes: 1 | 2
  hair: number
  mouth: number
}

function lookFor(sessionId: string): Look {
  const h = hashId(sessionId)
  const pick = <T,>(arr: readonly T[], shift: number): T => arr[(h >>> shift) % arr.length]
  return {
    body: pick(BODY, 0),
    denim: pick(DENIM, 3),
    strap: pick(STRAP, 6),
    tuft: pick(TUFT, 9),
    height: pick(HEIGHTS, 11),
    eyes: (h >>> 13) % 2 === 0 ? 1 : 2,
    hair: (h >>> 15) % 4,
    mouth: (h >>> 17) % 3,
  }
}

/**
 * The character itself. Feet sit at y=89 so several tiles line up on one floor;
 * the whole body is scaled about that line so a short helper keeps its feet down.
 */
function Figure({ look, glow }: { look: Look; glow: string }) {
  return (
    <svg width={76} height={104} viewBox="0 0 64 108" style={{ display: 'block', overflow: 'visible' }}>
      <g transform={`translate(32 89) scale(1 ${look.height}) translate(-32 -89)`}>
        {/* Rotating halo — faint on hover, always spinning while working. */}
        <circle
          className="emp-halo"
          cx="32" cy="42" r="29"
          fill="none" stroke="#818cf8" strokeWidth="1.3" strokeDasharray="7 9"
        />
        {/* Floor glow: the session's color label, when it has one. */}
        <ellipse cx="32" cy="90.5" rx="15" ry="3.2" fill={glow} opacity="0.55" />

        <g className="emp-figure">
          {/* Legs and boots */}
          <rect x="23.6" y="64" width="7.4" height="20" rx="3.4" fill={look.denim} />
          <rect x="33" y="64" width="7.4" height="20" rx="3.4" fill={look.denim} />
          <rect x="20.6" y="82.4" width="11.4" height="6.6" rx="3.3" fill={GLOVE} />
          <rect x="32" y="82.4" width="11.4" height="6.6" rx="3.3" fill={GLOVE} />

          {/* Body — one pill carrying head and torso, like the classic shape */}
          <rect x="18" y="12" width="28" height="58" rx="14" fill={look.body} />

          {/* Denim overalls: trouser block, shoulder straps, bib and its buttons */}
          <path d="M18,54 H46 V56 A14,14 0 0 1 18,56 Z" fill={look.denim} />
          <path d="M26,43 L22,33" stroke={look.denim} strokeWidth="3.6" strokeLinecap="round" />
          <path d="M38,43 L42,33" stroke={look.denim} strokeWidth="3.6" strokeLinecap="round" />
          <rect x="25.4" y="40" width="13.2" height="15" rx="3" fill={look.denim} />
          <circle cx="27.6" cy="42.8" r="1.2" fill="#eef2fa" opacity="0.85" />
          <circle cx="36.4" cy="42.8" r="1.2" fill="#eef2fa" opacity="0.85" />

          {/* Arms — short, ending in black gloves. The right one types while working. */}
          <rect x="12.8" y="36" width="5.4" height="18" rx="2.7" fill={look.body} />
          <rect className="emp-arm-r" x="45.8" y="36" width="5.4" height="18" rx="2.7" fill={look.body} />
          <circle cx="15.5" cy="55.4" r="3.3" fill={GLOVE} />
          <circle cx="48.5" cy="55.4" r="3.3" fill={GLOVE} />

          {/* Mouth */}
          {look.mouth === 0 && (
            <>
              <path d="M27.2,34.6 Q32,38.8 36.8,34.6 Q32,41.2 27.2,34.6 Z" fill="#fdfdfd" />
              <path d="M26.4,33.8 Q32,40.4 37.6,33.8" fill="none" stroke="#3f3125" strokeWidth="1.5" strokeLinecap="round" />
            </>
          )}
          {look.mouth === 1 && (
            <path d="M28.4,33.8 Q32,37.8 35.6,33.8" fill="none" stroke="#3f3125" strokeWidth="1.5" strokeLinecap="round" />
          )}
          {look.mouth === 2 && <ellipse cx="32" cy="35.8" rx="3.2" ry="2.5" fill="#5a3f2f" />}

          {/* Goggles — band first so the lenses sit on top of it */}
          <rect x="16" y="20" width="32" height="8" rx="4" fill={look.strap} />
          {look.eyes === 1 ? (
            <>
              <circle cx="32" cy="24" r="8.4" fill="#c8d2e0" />
              <g className="emp-eye">
                <circle cx="32" cy="24" r="7" fill="#fbfdff" />
                <circle cx="32" cy="24.2" r="3.3" fill="#7a4a24" />
                <circle cx="32" cy="24.4" r="1.6" fill="#1a1a20" />
                <circle cx="30.6" cy="22.8" r="0.9" fill="#ffffff" />
              </g>
            </>
          ) : (
            [25.6, 38.4].map(cx => (
              <g key={cx}>
                <circle cx={cx} cy="24" r="6.4" fill="#c8d2e0" />
                <g className="emp-eye">
                  <circle cx={cx} cy="24" r="5.2" fill="#fbfdff" />
                  <circle cx={cx} cy="24.2" r="2.5" fill="#7a4a24" />
                  <circle cx={cx} cy="24.4" r="1.2" fill="#1a1a20" />
                  <circle cx={cx - 1.1} cy="22.9" r="0.7" fill="#ffffff" />
                </g>
              </g>
            ))
          )}

          {/* Hair — a few strands from the crown, or none at all */}
          {look.hair === 1 && (
            <g stroke={look.tuft} strokeWidth="1.7" strokeLinecap="round" fill="none">
              <path d="M29.6,13.2 L28.4,6.8" />
              <path d="M32,12.4 L32,5.4" />
              <path d="M34.4,13.2 L35.6,6.8" />
            </g>
          )}
          {look.hair === 2 && (
            <path d="M32,12.6 C31.4,8.8 32.6,5.8 34.6,4.6" fill="none" stroke={look.tuft} strokeWidth="1.8" strokeLinecap="round" />
          )}
          {look.hair === 3 && (
            <path d="M27,13.6 C25,9.4 27,6.4 30.6,5.4" fill="none" stroke={look.tuft} strokeWidth="1.8" strokeLinecap="round" />
          )}
        </g>
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

/** The outline shared by the recruiting slot and the loading ghosts. */
function GhostSilhouette() {
  return (
    <svg width={76} height={104} viewBox="0 0 64 108" style={{ display: 'block' }}>
      <g transform="translate(32 89) scale(1 0.94) translate(-32 -89)">
        <ellipse className="emp-ghost-body" cx="32" cy="90.5" rx="11" ry="3.2" />
        <g className="emp-figure">
          <rect className="emp-ghost-body" x="23.6" y="64" width="7.4" height="20" rx="3.4" />
          <rect className="emp-ghost-body" x="33" y="64" width="7.4" height="20" rx="3.4" />
          <rect className="emp-ghost-body" x="18" y="12" width="28" height="58" rx="14" />
          <rect className="emp-ghost-body" x="12.8" y="36" width="5.4" height="18" rx="2.7" />
          <rect className="emp-ghost-body" x="45.8" y="36" width="5.4" height="18" rx="2.7" />
          <circle className="emp-ghost-body" cx="32" cy="24" r="7.6" />
        </g>
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
