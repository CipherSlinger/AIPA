// PersonaSidebarComponents.tsx
// Extracted from WorkflowPersonasSection.tsx (Iteration 386) for component decomposition.

import React from 'react'
import { Trash2, X } from 'lucide-react'
import { useI18n } from '../../i18n'
import { cardStyle, ACCENT } from './EmployeesShared'
import { useUiStore } from '../../store'
import type { Persona } from '../../types/app.types'
import { MODEL_OPTIONS } from '../settings/settingsConstants'
import PersonCharacterIcon from './PersonCharacterIcon'

// ─── Keyframe injection (once per module) ─────────────────────────────────────
const ANIM_ID = 'persona-sidebar-keyframes'
if (typeof document !== 'undefined' && !document.getElementById(ANIM_ID)) {
  const s = document.createElement('style')
  s.id = ANIM_ID
  s.textContent = `
    @keyframes personaCardIn {
      from { opacity: 0; transform: translateY(4px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `
  document.head.appendChild(s)
}

// ─── Color-coded role badges derived from presetKey ───────────────────────────

const ROLE_BADGE_MAP: Record<string, { label: string; color: string; bg: string }> = {
  writingCoach:      { label: 'Writer',   color: '#6366f1', bg: 'rgba(99,102,241,0.15)' },
  researchAnalyst:   { label: 'Analyst',  color: '#22c55e', bg: 'rgba(34,197,94,0.15)'  },
  creativePartner:   { label: 'Creative', color: '#fbbf24', bg: 'rgba(251,191,36,0.15)' },
  studyTutor:        { label: 'Tutor',    color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  productivityCoach: { label: 'Coach',    color: '#67e8f9', bg: 'rgba(103,232,249,0.15)'  },
}

function getRoleBadge(persona: Persona) {
  if (persona.presetKey && ROLE_BADGE_MAP[persona.presetKey]) {
    return ROLE_BADGE_MAP[persona.presetKey]
  }
  return null
}

// ─── Vivid Illustrated Persona Icon Tile ──────────────────────────────────────

export interface PersonaIconTileProps {
  persona: Persona
  isActive: boolean
  isDeleting: boolean
  onDelete: (id: string) => void
}

export function PersonaIconTile({ persona, isActive, isDeleting, onDelete }: PersonaIconTileProps) {
  const { t } = useI18n()
  const p = persona
  const [hovered, setHovered] = React.useState(false)

  const displayName = p.presetKey ? t(`persona.preset.${p.presetKey}`) : p.name

  const modelOption = MODEL_OPTIONS.find(m => m.id === p.model)
  const modelLabel = modelOption?.labelKey ? t(modelOption.labelKey) : p.model

  const roleBadge = getRoleBadge(p)
  const promptSnippet = p.systemPrompt.length > 80 ? p.systemPrompt.slice(0, 80) + '…' : p.systemPrompt
  const tileTooltip = `${displayName} (${roleBadge?.label || t('persona.title')}) · ${modelLabel}\n${promptSnippet}`

  return (
    <div
      onClick={() => useUiStore.getState().openPersonaEditor(p.id, 'workflows')}
      title={tileTooltip}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 118,
        padding: '14px 8px 10px',
        ...cardStyle(hovered, isActive, p.color || ACCENT),
        animation: 'personaCardIn 0.15s ease both',
      }}
    >
      {/* Delete button on hover or when confirming delete */}
      <button
        onClick={e => { e.stopPropagation(); onDelete(p.id) }}
        title={isDeleting ? t('persona.deleteConfirm') : t('persona.deletePersona')}
        style={{
          position: 'absolute',
          top: 4,
          right: 4,
          width: 20,
          height: 20,
          borderRadius: '50%',
          border: isDeleting ? '1px solid #f87171' : '1px solid var(--glass-border)',
          background: isDeleting ? '#f87171' : 'var(--bg-primary)',
          color: isDeleting ? '#ffffff' : 'var(--text-muted)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: hovered || isDeleting ? 1 : 0,
          transition: 'all 0.15s ease',
          zIndex: 5,
        }}
      >
        {isDeleting ? <X size={9} /> : <Trash2 size={9} />}
      </button>

      {/* Illustrated Person/Character Avatar */}
      <PersonCharacterIcon
        persona={p}
        size={56}
        isActive={isActive}
        showBadge={true}
      />

      {/* Name Label */}
      <div
        style={{
          marginTop: 8,
          fontSize: 12,
          fontWeight: isActive ? 700 : 600,
          color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
          textAlign: 'center',
          width: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          letterSpacing: '0.01em',
          lineHeight: 1.25,
        }}
      >
        {displayName}
      </div>

      {/* Role Badge or Active tag */}
      <div style={{ marginTop: 2, height: 14, display: 'flex', alignItems: 'center' }}>
        {isActive ? (
          <span style={{
            fontSize: 8,
            fontWeight: 700,
            color: '#22c55e',
            background: 'rgba(34,197,94,0.12)',
            padding: '0 4px',
            borderRadius: 4,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            {t('persona.active')}
          </span>
        ) : roleBadge ? (
          <span style={{
            fontSize: 8,
            fontWeight: 600,
            color: roleBadge.color,
            background: roleBadge.bg,
            padding: '0 4px',
            borderRadius: 4,
            letterSpacing: '0.03em',
          }}>
            {roleBadge.label}
          </span>
        ) : (
          <span style={{
            fontSize: 8,
            color: 'var(--text-faint)',
          }}>
            {modelLabel.split(' ')[0]}
          </span>
        )}
      </div>
    </div>
  )
}
