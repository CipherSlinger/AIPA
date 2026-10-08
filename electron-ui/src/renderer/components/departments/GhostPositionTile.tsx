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
import { Trash2, UserPlus } from 'lucide-react'
import type { Position } from '../../store'
import { GhostSilhouette } from './employeeFigureArt'
import { useT } from '../../i18n'

interface GhostPositionTileProps {
  position: Position
  /** Hiring writes a session in the owning node's directory. */
  onHire: () => void
  onDismiss: () => void
}

export default function GhostPositionTile({ position, onHire, onDismiss }: GhostPositionTileProps) {
  const t = useT()
  const [confirmingDismiss, setConfirmingDismiss] = useState(false)
  const color = position.color || '#6366f1'

  return (
    <div
      className="emp-tile emp-ghost"
      role="button"
      tabIndex={0}
      aria-label={`${t('dept.positionOpen')} — ${position.title}`}
      title={position.brief}
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
            {position.title}
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
