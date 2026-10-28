// One department in the org chart.
//
// The card is built around a portrait rather than a coloured box: a department
// is a desk of people, and the figure that stands for it is the fastest way to
// tell one card from another. The face is chosen by `deptFaces`, so the same
// department keeps the same person across reloads and renames only re-cast it
// when the new name describes a different job.
//
// Two layouts share one component, because the two densities want different
// things from the same data:
//
//   full  — portrait centred at the top, name and folder underneath. Reads as a
//           portrait card and gives the face room to carry the identity.
//   dense — portrait to the left of the text. Density exists to keep 9+ cards on
//           screen, so the dense card must not grow taller than the old one;
//           a centred portrait would add ~30px to every row of a tall chart.
//
// In both, the stats/delete buttons are absolutely positioned in the top-right
// corner instead of sitting in the text flow. A flex row would push a centred
// portrait off-centre by the width of whichever buttons are visible.
//
// Split out of OrgChart.tsx (which had passed 1300 lines) — the card has no
// dependency on the chart's connector geometry, so it stands alone.

import React, { useState } from 'react'
import { BarChart3, ChevronRight, FolderOpen, MessageSquare, Plus, Trash2, UserPlus, Users } from 'lucide-react'
import type { Department } from '../../store'
import type { SessionListItem } from '../../types/app.types'
import { useI18n } from '../../i18n'
import { cardStyle } from '../workflows/EmployeesShared'
import { baseName, deptDisplayName, formatRelativeTime } from './deptUtils'
import DeptPortrait from './DeptPortrait'

const ACCENT = '#6366f1'

const ELLIPSIS: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

// The name is the card's whole identity, so it wraps instead of losing its tail
// to an ellipsis — "Department of State Affairs" was reading as "Department of
// State Af…". Two lines is the ceiling; `title` still carries the full name for
// the rare one that runs past it. The line height is named because the block's
// reserved height is derived from it.
const NAME_LINE_HEIGHT = 1.25
const NAME_CLAMP: React.CSSProperties = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  lineHeight: NAME_LINE_HEIGHT,
}

export interface DeptCardProps {
  dept: Department
  sessions: SessionListItem[]
  sessionsLoading: boolean
  hasActiveSession: boolean
  /** Compact card for the many-department layout. */
  dense: boolean
  // The handlers take the department id instead of arriving pre-bound. A bound
  // closure is a new function on every parent render, which would defeat the
  // memo export at the bottom of this file for all hundred cards at once — the
  // exact cost the memo exists to avoid. With the id as a prop, the only things
  // this card compares are primitives and references the chart already memoised.
  onEnter: (deptId: string) => void
  onRecruit: (deptId: string) => void
  onStats: (deptId: string, e: React.MouseEvent) => void
  onDelete: (deptId: string, e: React.MouseEvent) => void
}

function DeptCard({
  dept, sessions, sessionsLoading, hasActiveSession, dense,
  onEnter, onRecruit, onStats, onDelete,
}: DeptCardProps) {
  const { t, resolvedLocale } = useI18n()
  const [hovered, setHovered] = useState(false)
  const color = dept.color || ACCENT
  const name = deptDisplayName(dept, resolvedLocale)
  const messageCount = sessions.reduce((sum, s) => sum + (s.messageCount ?? 0), 0)
  const openPositions = dept.positions?.length ?? 0
  // Sized against the narrowest card each density allows (216px / 180px): the
  // centred portrait must never crowd the folder name off the card.
  const portraitSize = dense ? 38 : 56
  // Every name reserves two clamped lines, even a one-line one: rows are equal
  // height, and reserving only when a name happens to be long would leave the
  // folder lines of a row at visibly different heights.
  const nameBlockHeight = Math.round((dense ? 12 : 13) * NAME_LINE_HEIGHT * 2)

  const portrait = (
    <span style={{
      display: 'flex',
      transform: hovered ? 'scale(1.06)' : 'scale(1)',
      transition: 'transform 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
    }}>
      {/* Raw `name`, not the display translation: the face should not change
          when the interface language does. */}
      <DeptPortrait name={dept.name} seed={dept.id} color={color} size={portraitSize} />
    </span>
  )

  const titleLine = (
    <span style={{
      display: 'flex', alignItems: 'flex-start', gap: 6, minWidth: 0, maxWidth: '100%',
      // Dense puts the name beside the portrait, i.e. on the same line as the
      // corner buttons — and those float over the card, so nothing in the flow
      // reserves their width. Without this inset "Court of Judicial Review"
      // ran under the stats icon. Only the name pays: the folder line below sits
      // clear of the buttons and keeps the full width.
      paddingRight: dense ? 40 : 0,
    }}>
      <span
        title={name}
        style={{
          fontSize: dense ? 12 : 13, fontWeight: 700, color: 'var(--text-primary)',
          // The clamp box takes the full reserved width, so a wrapped name must
          // be centred explicitly in the full layout.
          textAlign: dense ? 'left' : 'center',
          minWidth: 0, minHeight: nameBlockHeight,
          ...NAME_CLAMP,
        }}
      >
        {name}
      </span>
      {hasActiveSession && (
        <span style={{
          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
          // Level with the first line: centring in the two-line reservation
          // would drop the dot into the gap under a one-line name.
          marginTop: dense ? 4 : 5,
          background: '#22c55e', boxShadow: '0 0 0 2px rgba(34,197,94,0.25)',
          animation: 'dept-active-pulse 2s ease-in-out infinite',
        }} />
      )}
    </span>
  )

  const dirLine = (
    <span
      title={dept.directory}
      style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', marginTop: 3, minWidth: 0, maxWidth: '100%' }}
    >
      <FolderOpen size={10} style={{ flexShrink: 0, opacity: 0.7 }} />
      <span style={ELLIPSIS}>{baseName(dept.directory)}</span>
    </span>
  )

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onEnter(dept.id)}
      onKeyDown={e => { if (e.key === 'Enter') onEnter(dept.id) }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...cardStyle(hovered),
        display: 'flex',
        flexDirection: 'column',
        // Dense keeps its old floor: the horizontal layout absorbs a wrapped
        // name without adding a row of height. Full's floor is what a two-line
        // name plus the folder line under it actually needs — the card clips its
        // own overflow, so a row that sizes cards below this would cut the footer.
        minHeight: dense ? 108 : 178,
        overflow: 'hidden',
        borderColor: hovered ? `${color}88` : undefined,
      }}
    >
      {/* Department colour accent */}
      <div style={{ height: 3, flexShrink: 0, background: `linear-gradient(90deg, ${color}, ${color}33)` }} />

      <div style={{
        position: 'relative',
        display: 'flex',
        flex: 1,
        ...(dense
          ? { alignItems: 'center', gap: 9, padding: '10px 11px 9px 11px' }
          : { flexDirection: 'column' as const, alignItems: 'center', padding: '14px 12px 9px' }),
      }}>
        {portrait}

        <span style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: dense ? 'flex-start' : 'center',
          minWidth: 0,
          ...(dense ? { flex: 1 } : { marginTop: 9, maxWidth: '100%' }),
        }}>
          {titleLine}
          {dirLine}
        </span>

        {/* Corner actions. Stats is always visible; delete appears on hover only.
            Both stop propagation so neither ever drills into the department —
            and delete, the one destructive action, is deliberately far from the
            footer's recruit/enter pair. Its confirmation lives in a popover
            outside the card, because the card clips its own overflow. */}
        <span style={{ position: 'absolute', top: dense ? 2 : 5, right: dense ? 0 : 4, display: 'flex', gap: 1 }}>
          <button
            onClick={e => { e.stopPropagation(); onStats(dept.id, e) }}
            onMouseDown={e => e.stopPropagation()}
            title={t('dept.stats')}
            style={{
              flexShrink: 0, padding: 4, borderRadius: 6, border: 'none',
              background: hovered ? 'rgba(99,102,241,0.12)' : 'transparent',
              color: hovered ? '#818cf8' : 'var(--text-muted)',
              cursor: 'pointer', display: 'flex', transition: 'all 0.15s ease',
            }}
          >
            <BarChart3 size={13} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(dept.id, e) }}
            onMouseDown={e => e.stopPropagation()}
            title={t('dept.delete')}
            style={{
              flexShrink: 0, padding: 4, borderRadius: 6, border: 'none',
              background: 'transparent', color: 'var(--text-muted)',
              cursor: 'pointer', display: 'flex', transition: 'all 0.15s ease',
              opacity: hovered ? 1 : 0, pointerEvents: hovered ? 'auto' : 'none',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.background = 'rgba(248,113,113,0.12)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent' }}
          >
            <Trash2 size={13} />
          </button>
        </span>
      </div>

      {/* Footer: headcount, messages, and on hover the drill-in / recruit actions.
          Open positions are counted separately and never folded into the staff
          number — a ghost position is not an employee yet. */}
      <div style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: dense ? 9 : 12,
        padding: dense ? '6px 11px' : '8px 13px',
        borderTop: '1px solid var(--glass-border)',
        fontSize: 11, color: 'var(--text-muted)',
        minHeight: 33,
      }}>
        <span title={t('dept.staff')} style={{ display: 'flex', alignItems: 'center', gap: 4, fontVariantNumeric: 'tabular-nums' }}>
          <Users size={11} />{sessionsLoading ? '·' : sessions.length}
        </span>
        <span title={t('dept.msgCount')} style={{ display: 'flex', alignItems: 'center', gap: 4, fontVariantNumeric: 'tabular-nums' }}>
          <MessageSquare size={11} />{sessionsLoading ? '·' : messageCount}
        </span>
        {openPositions > 0 && (
          <span title={t('dept.positions')} style={{ display: 'flex', alignItems: 'center', gap: 4, fontVariantNumeric: 'tabular-nums', color }}>
            <UserPlus size={11} />{openPositions}
          </span>
        )}

        {hovered ? (
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={e => { e.stopPropagation(); onRecruit(dept.id) }}
              title={t('dept.newSession')}
              style={{
                display: 'flex', alignItems: 'center', gap: 3,
                padding: '2px 7px', borderRadius: 20, cursor: 'pointer',
                fontSize: 10, fontWeight: 700, lineHeight: 1.5,
                border: `1px solid ${color}55`, background: `${color}18`, color,
              }}
            >
              <Plus size={9} />{t('dept.recruit')}
            </button>
            <span style={{ display: 'flex', alignItems: 'center', gap: 1, color, fontSize: 10, fontWeight: 700 }}>
              {t('dept.enter')}<ChevronRight size={10} />
            </span>
          </span>
        ) : (
          <span style={{ marginLeft: 'auto', ...ELLIPSIS }}>
            {sessions[0] ? formatRelativeTime(sessions[0].timestamp, t) : '—'}
          </span>
        )}
      </div>
    </div>
  )
}

export default React.memo(DeptCard)