// PersonaSidebarComponents.tsx
// Extracted from WorkflowPersonasSection.tsx (Iteration 386) for component decomposition.

import React from 'react'
import { Check, Pencil, Trash2, X } from 'lucide-react'
import { useI18n } from '../../i18n'
import type { Persona } from '../../types/app.types'
import { PERSONA_COLORS, EMOJI_PRESETS } from '../settings/personaConstants'
import { MODEL_OPTIONS } from '../settings/settingsConstants'

// ─── Compact persona card for the sidebar ─────────────────────────────────────

export interface PersonaSidebarCardProps {
  persona: Persona
  isActive: boolean
  isDeleting: boolean
  onActivate: (p: Persona) => void
  onEdit: (p: Persona) => void
  onDelete: (id: string) => void
}

export function PersonaSidebarCard({ persona, isActive, isDeleting, onActivate, onEdit, onDelete }: PersonaSidebarCardProps) {
  const { t } = useI18n()
  const p = persona

  // Use localized name for installed presets
  const displayName = p.presetKey ? t(`persona.preset.${p.presetKey}`) : p.name

  const modelLabel = MODEL_OPTIONS.find(m => m.id === p.model)?.labelKey
    ? t(MODEL_OPTIONS.find(m => m.id === p.model)!.labelKey)
    : p.model

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        background: isActive ? `${p.color}18` : 'transparent',
        border: `1px solid ${isActive ? p.color : 'var(--border)'}`,
        borderRadius: 7,
        transition: 'border-color 150ms, background 150ms',
      }}
    >
      {/* Emoji avatar */}
      <div style={{
        width: 30,
        height: 30,
        borderRadius: 6,
        background: `${p.color}22`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 16,
        flexShrink: 0,
      }}>
        {p.emoji}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-bright)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayName}
          </span>
          {isActive && (
            <span style={{
              fontSize: 8,
              background: p.color,
              color: '#fff',
              padding: '1px 5px',
              borderRadius: 7,
              fontWeight: 700,
              flexShrink: 0,
            }}>
              {t('persona.active')}
            </span>
          )}
        </div>
        <div style={{
          fontSize: 9,
          color: 'var(--text-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {modelLabel}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
        <button
          onClick={() => onActivate(p)}
          title={isActive ? t('persona.deactivate') : t('persona.activate')}
          style={{
            width: 24,
            height: 24,
            borderRadius: 4,
            border: 'none',
            background: isActive ? p.color : 'none',
            color: isActive ? '#fff' : 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 150ms',
          }}
          onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
          onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'none' }}
        >
          <Check size={11} />
        </button>
        <button
          onClick={() => onEdit(p)}
          title={t('persona.editPersona')}
          style={{
            width: 24,
            height: 24,
            borderRadius: 4,
            border: 'none',
            background: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          <Pencil size={10} />
        </button>
        <button
          onClick={() => onDelete(p.id)}
          title={isDeleting ? t('persona.deleteConfirm') : t('persona.deletePersona')}
          style={{
            width: 24,
            height: 24,
            borderRadius: 4,
            border: 'none',
            background: isDeleting ? 'var(--error)' : 'none',
            color: isDeleting ? '#fff' : 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseEnter={e => { if (!isDeleting) e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
          onMouseLeave={e => { if (!isDeleting) e.currentTarget.style.background = 'none' }}
        >
          {isDeleting ? <X size={10} /> : <Trash2 size={10} />}
        </button>
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
    background: 'var(--input-field-bg)',
    border: '1px solid var(--input-field-border)',
    borderRadius: 5,
    fontSize: 11,
    color: 'var(--text-primary)',
    outline: 'none',
    boxSizing: 'border-box',
    marginBottom: 6,
  }

  return (
    <div style={{
      padding: '8px 10px',
      background: 'rgba(var(--accent-rgb, 59, 130, 246), 0.04)',
      border: '1px solid var(--accent)',
      borderRadius: 7,
      marginBottom: 6,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 8 }}>
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
              border: formEmoji === emoji ? '2px solid var(--accent)' : '1px solid var(--border)',
              borderRadius: 5,
              background: formEmoji === emoji ? 'rgba(var(--accent-rgb, 59, 130, 246), 0.12)' : 'none',
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
              border: formColor === c ? '2px solid var(--text-bright)' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'transform 100ms',
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
            background: canSubmit ? 'var(--accent)' : 'var(--input-field-bg)',
            border: 'none',
            borderRadius: 4,
            padding: '4px 0',
            color: canSubmit ? '#fff' : 'var(--text-muted)',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            fontSize: 10,
            fontWeight: 600,
          }}
        >
          {t('persona.save')}
        </button>
        <button
          onClick={onCancel}
          style={{
            flex: 1,
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '4px 0',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 10,
          }}
        >
          {t('persona.cancel')}
        </button>
      </div>
    </div>
  )
}
