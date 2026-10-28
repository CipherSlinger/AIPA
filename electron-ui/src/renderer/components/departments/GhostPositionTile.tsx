// GhostPositionTile — an unfilled position, shown in the roster as a dimmed
// figure with no face.
//
// A position is only a title plus a brief: no session, no directory of its own,
// no cost. It sits in the roster exactly where the employee will stand, wearing
// the same silhouette as a not-yet-loaded figure, so "the seat is here, it is
// just empty" reads without explanation. Hiring it writes a real session (the
// brief becomes that employee's first message) and removes the position.
//
// It deliberately does not render as a real figure: no status dot, no message
// count, no pin, no fire button. There is nothing to fire yet.

import React, { useState } from 'react'
import { Pencil, Trash2, UserPlus } from 'lucide-react'
import type { Position } from '../../store'
import type { Persona } from '../../types/app.types'
import { GhostSilhouette } from './employeeFigureArt'
import { useI18n } from '../../i18n'
import { positionDisplayBrief, positionDisplayTitle } from './deptUtils'

interface GhostPositionTileProps {
  position: Position
  /** The persona this seat is bound to (position binding or department default). */
  persona?: Persona
  /** Hiring writes a session in the owning node's directory. */
  onHire: () => void
  onEdit: () => void
  onDismiss: () => void
}

export default function GhostPositionTile({ position, persona, onHire, onEdit, onDismiss }: GhostPositionTileProps) {
  const { t, resolvedLocale } = useI18n()
  const [confirmingDismiss, setConfirmingDismiss] = useState(false)
  const color = position.color || '#6366f1'
  const title = positionDisplayTitle(position, resolvedLocale)

  return (
    <div
      className="emp-tile emp-ghost"
      role="button"
      tabIndex={0}
      aria-label={`${t('dept.positionOpen')} — ${title}`}
      title={positionDisplayBrief(position, resolvedLocale)}
      onClick={onHire}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onHire()
        }
      }}
    >
      {/* Figure area — same 104px box as a real employee, so the roster rows line
          up and a hire swaps one figure for another without shifting the grid.
          The vacant look comes from .emp-ghost in globals.css. */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', height: 104 }}>
        <GhostSilhouette />
        {/* Vacancy marker, replacing the status dot a real figure carries */}
        <span style={{
          position: 'absolute', top: 2, left: 2,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 16, height: 16, borderRadius: '50%',
          border: `1px dashed ${color}88`, background: 'var(--bg-primary)',
        }}>
          <UserPlus size={9} style={{ color }} />
        </span>

        <div
          className="emp-actions"
          style={{ position: 'absolute', top: 0, right: -6, display: 'flex', flexDirection: 'column', gap: 3 }}
        >
          <button
            onClick={e => { e.stopPropagation(); onHire() }}
            title={t('dept.positionHire')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 24, height: 22, borderRadius: 6, padding: 0, cursor: 'pointer',
              border: `1px solid ${color}66`, background: `${color}1f`, color,
            }}
          >
            <UserPlus size={11} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onEdit() }}
            title={t('dept.positionEdit')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 24, height: 22, borderRadius: 6, padding: 0, cursor: 'pointer',
              border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-muted)',
            }}
          >
            <Pencil size={11} />
          </button>
          {!confirmingDismiss && (
            <button
              onClick={e => { e.stopPropagation(); setConfirmingDismiss(true) }}
              title={t('dept.positionDismiss')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 24, height: 22, borderRadius: 6, padding: 0, cursor: 'pointer',
                border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-muted)',
              }}
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </div>

      {confirmingDismiss ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={e => e.stopPropagation()}>
          <button
            onClick={() => { setConfirmingDismiss(false); onDismiss() }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '2px 7px', height: 22, borderRadius: 6, cursor: 'pointer',
              fontSize: 10, fontWeight: 600, color: '#f87171',
              border: '1px solid rgba(248,113,113,0.45)', background: 'var(--bg-primary)',
            }}
          >
            {t('dept.positionDismiss')}
          </button>
          <button
            onClick={() => setConfirmingDismiss(false)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '2px 7px', height: 22, borderRadius: 6, cursor: 'pointer',
              fontSize: 10, color: 'var(--text-muted)',
              border: '1px solid var(--border)', background: 'var(--bg-primary)',
            }}
          >
            {t('common.cancel')}
          </button>
        </div>
      ) : (
        <>
          <div style={{
            maxWidth: '100%', fontSize: 12, fontWeight: 500,
            color: 'var(--text-muted)', fontStyle: 'italic',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            textAlign: 'center',
          }}>
            {title}
          </div>
          {/* The role the seat will be hired as. No persona means the seat
              inherits the department default at hire time. */}
          <div
            title={persona ? `${persona.name} · ${persona.model}` : t('dept.personaNone')}
            style={{
              display: 'flex', alignItems: 'center', gap: 3,
              maxWidth: '100%', padding: '0 5px', borderRadius: 999,
              border: `1px solid ${persona ? `${persona.color}55` : 'var(--border)'}`,
              background: persona ? `${persona.color}14` : 'transparent',
              color: persona ? persona.color : 'var(--text-faint)',
              fontSize: 9, lineHeight: '15px', whiteSpace: 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            {persona ? (
              <>
                <span aria-hidden="true" style={{ flexShrink: 0 }}>{persona.emoji}</span>
                {/* The name is the identity, so it never shrinks. The model is
                    the first thing to go: when both spans were shrinkable the
                    flex row collapsed the name to zero width and left a chip
                    reading only "· claude-sonnet-4-6". */}
                <span style={{ flexShrink: 0 }}>{persona.name}</span>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.7 }}>· {persona.model}</span>
              </>
            ) : t('dept.personaNone')}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 10, color: 'var(--text-faint)', whiteSpace: 'nowrap',
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', border: `1px dashed ${color}aa` }} />
            {t('dept.positionOpen')}
          </div>
        </>
      )}
    </div>
  )
}
