// A row of persona chips used by every department dialog that binds a role.
//
// One picker for the hire flow, the position editor and the department handbook
// so "which persona" always looks and behaves the same. Selecting nothing is a
// real choice (inherit / no persona), hence the explicit leading chip rather
// than a placeholder that can never be re-selected.

import type { CSSProperties } from 'react'
import type { Persona } from '../../types/app.types'

interface PersonaChoiceProps {
  personas: Persona[]
  /** Undefined = the caller's fallback (inherit, department default, or none). */
  value?: string
  onChange: (personaId: string | undefined) => void
  /** Copy for the leading "no explicit persona" chip. */
  noneLabel: string
  accent?: string
}

export default function PersonaChoice({ personas, value, onChange, noneLabel, accent = '#6366f1' }: PersonaChoiceProps) {
  const chip = (selected: boolean, color: string): CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '4px 9px', borderRadius: 999, cursor: 'pointer',
    fontSize: 11, lineHeight: 1.4,
    border: `1px solid ${selected ? `${color}99` : 'var(--border)'}`,
    background: selected ? `${color}1f` : 'var(--bg-hover)',
    // The accent stays in the border/tint; per-department colours are arbitrary
    // data and several fail AA as 11px text on a light surface.
    color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
    fontWeight: selected ? 600 : 500,
    transition: 'all 0.15s ease',
  })

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      <button type="button" onClick={() => onChange(undefined)} style={chip(!value, accent)}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', border: `1px dashed ${value ? 'var(--text-faint)' : accent}` }} />
        {noneLabel}
      </button>
      {personas.map(p => {
        const selected = p.id === value
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            title={`${p.name} · ${p.model}`}
            style={chip(selected, p.color || accent)}
          >
            <span aria-hidden="true">{p.emoji}</span>
            <span>{p.name}</span>
            <span style={{ fontSize: 9, opacity: 0.65, fontVariantNumeric: 'tabular-nums' }}>{p.model}</span>
          </button>
        )
      })}
    </div>
  )
}
