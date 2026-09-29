// PersonaSidebarComponents.tsx
// Extracted from WorkflowPersonasSection.tsx (Iteration 386) for component decomposition.

import React from 'react'
import { Trash2, X } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useUiStore } from '../../store'
import type { Persona } from '../../types/app.types'
import { PERSONA_COLORS, EMOJI_PRESETS } from '../settings/personaConstants'
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
  const tileTooltip = `${displayName} (${roleBadge?.label || 'Agent'}) · ${modelLabel}\n${promptSnippet}`

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
        padding: '10px 6px 8px',
        borderRadius: 12,
        cursor: 'pointer',
        background: isActive
          ? 'rgba(99,102,241,0.14)'
          : hovered
          ? 'var(--bg-hover)'
          : 'var(--bg-card, rgba(255,255,255,0.03))',
        border: isActive
          ? `1.5px solid ${p.color || '#6366f1'}`
          : hovered
          ? '1.5px solid var(--border)'
          : '1px solid var(--glass-border)',
        boxShadow: isActive
          ? `0 0 14px ${p.color}35, 0 2px 8px rgba(0,0,0,0.15)`
          : hovered
          ? '0 4px 12px rgba(0,0,0,0.18)'
          : '0 1px 3px rgba(0,0,0,0.1)',
        transform: hovered ? 'translateY(-2px)' : 'none',
        transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
        userSelect: 'none',
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
        size={52}
        isActive={isActive}
        showBadge={true}
      />

      {/* Name Label */}
      <div
        style={{
          marginTop: 6,
          fontSize: 11,
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

// ─── Inline persona create/edit form ─────────────────────────────────────────

export interface PersonaInlineFormProps {
  editingId: string | null
  formName: string
  setFormName: (v: string) => void
  formEmoji: string
  setFormEmoji: (v: string) => void
  formModel: string
  setFormModel: (v: string) => void
  formPrompt: string
  setFormPrompt: (v: string) => void
  formColor: string
  setFormColor: (v: string) => void
  onSubmit: () => void
  onCancel: () => void
}

export function PersonaInlineForm({
  editingId, formName, setFormName, formEmoji, setFormEmoji,
  formModel, setFormModel, formPrompt, setFormPrompt,
  formColor, setFormColor, onSubmit, onCancel,
}: PersonaInlineFormProps) {
  const { t } = useI18n()
  const canSubmit = formName.trim() && formPrompt.trim()

  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: 26,
    padding: '0 8px',
    background: 'var(--bg-active)',
    border: '1px solid var(--glass-border-md)',
    borderRadius: 5,
    fontSize: 11,
    color: 'var(--text-primary)',
    outline: 'none',
    boxSizing: 'border-box',
    marginBottom: 6,
    transition: 'all 0.15s ease',
  }

  return (
    <div style={{
      padding: '10px 10px',
      background: 'rgba(99,102,241,0.06)',
      border: '1px solid rgba(99,102,241,0.25)',
      borderRadius: 9,
      marginBottom: 6,
      backdropFilter: 'blur(6px)',
      WebkitBackdropFilter: 'blur(6px)',
      boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
      animation: 'personaCardIn 0.15s ease both',
    }}>
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--text-faint)',
        marginBottom: 8,
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        borderBottom: '1px solid var(--glass-border)',
        paddingBottom: 4,
      }}>
        {editingId ? t('persona.editPersona') : t('persona.addPersona')}
      </div>

      {/* Name */}
      <input
        value={formName}
        onChange={e => setFormName(e.target.value)}
        placeholder={t('persona.namePlaceholder')}
        maxLength={30}
        autoFocus
        style={inputStyle}
      />

      {/* Emoji picker */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 6 }}>
        {EMOJI_PRESETS.map(emoji => (
          <button
            key={emoji}
            onClick={() => setFormEmoji(emoji)}
            style={{
              width: 28,
              height: 28,
              border: formEmoji === emoji ? '2px solid #818cf8' : '1px solid var(--glass-border)',
              borderRadius: 5,
              background: formEmoji === emoji ? 'rgba(99,102,241,0.12)' : 'none',
              cursor: 'pointer',
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Model */}
      <select
        value={formModel}
        onChange={e => setFormModel(e.target.value)}
        style={{ ...inputStyle, cursor: 'pointer' }}
      >
        {MODEL_OPTIONS.map(m => (
          <option key={m.id} value={m.id}>{t(m.labelKey)}</option>
        ))}
      </select>

      {/* System Prompt */}
      <textarea
        value={formPrompt}
        onChange={e => setFormPrompt(e.target.value)}
        placeholder={t('persona.systemPromptPlaceholder')}
        rows={3}
        maxLength={2000}
        style={{
          ...inputStyle,
          height: 'auto',
          resize: 'vertical',
          minHeight: 56,
          fontFamily: 'inherit',
          lineHeight: 1.4,
          paddingTop: 5,
          paddingBottom: 5,
        }}
      />

      {/* Color */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
        {PERSONA_COLORS.map(c => (
          <button
            key={c}
            onClick={() => setFormColor(c)}
            style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: c,
              border: formColor === c ? '2px solid var(--text-primary)' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.2)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
          />
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 5 }}>
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          style={{
            flex: 1,
            background: canSubmit
              ? 'linear-gradient(135deg, #6366f1, #4f46e5)'
              : 'var(--bg-hover)',
            border: canSubmit ? '1px solid rgba(99,102,241,0.4)' : '1px solid var(--glass-border)',
            borderRadius: 6,
            padding: '5px 0',
            color: canSubmit ? 'var(--text-primary)' : 'var(--text-faint)',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.04em',
            transition: 'all 0.15s ease',
            boxShadow: canSubmit ? '0 2px 8px rgba(99,102,241,0.4)' : 'none',
          }}
          onMouseEnter={e => { if (canSubmit) e.currentTarget.style.opacity = '0.88' }}
          onMouseLeave={e => { if (canSubmit) e.currentTarget.style.opacity = '1' }}
        >
          {t('persona.save')}
        </button>
        <button
          onClick={onCancel}
          style={{
            flex: 1,
            background: 'var(--bg-hover)',
            border: '1px solid var(--glass-border-md)',
            borderRadius: 6,
            padding: '5px 0',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 10,
            fontWeight: 600,
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--bg-active)'
            e.currentTarget.style.borderColor = 'var(--glass-border-md)'
            e.currentTarget.style.color = 'var(--text-primary)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'var(--bg-hover)'
            e.currentTarget.style.borderColor = 'var(--glass-border-md)'
            e.currentTarget.style.color = 'var(--text-muted)'
          }}
        >
          {t('persona.cancel')}
        </button>
      </div>
    </div>
  )
}
