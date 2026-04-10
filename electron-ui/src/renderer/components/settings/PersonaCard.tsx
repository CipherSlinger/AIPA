import React from 'react'
import { Check, Pencil, Trash2, X } from 'lucide-react'
import { useI18n } from '../../i18n'
import { MODEL_OPTIONS } from './settingsConstants'
import type { Persona } from '../../types/app.types'

interface PersonaCardProps {
  persona: Persona
  isActive: boolean
  isDefault: boolean
  isDeleting: boolean
  onActivate: (p: Persona) => void
  onEdit: (p: Persona) => void
  onDelete: (id: string) => void
}

export default function PersonaCard({ persona, isActive, isDefault, isDeleting, onActivate, onEdit, onDelete }: PersonaCardProps) {
  const { t } = useI18n()
  const p = persona

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        background: isActive ? `${p.color}15` : isDefault ? `${p.color}0a` : 'var(--card-bg)',
        border: `1px solid ${isActive ? p.color : isDefault ? `${p.color}66` : 'var(--card-border)'}`,
        borderRadius: 8,
        transition: 'border-color 150ms, background 150ms',
      }}
    >
      {/* Emoji avatar */}
      <div style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        background: `${p.color}20`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 20,
        flexShrink: 0,
      }}>
        {p.emoji}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-bright)' }}>{p.presetKey ? t(`persona.preset.${p.presetKey}`) : p.name}</span>
          {isDefault && (
            <span style={{
              fontSize: 9,
              background: p.color,
              color: '#fff',
              padding: '1px 6px',
              borderRadius: 8,
              fontWeight: 600,
            }}>
              {t('persona.defaultBadge')}
            </span>
          )}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {MODEL_OPTIONS.find(m => m.id === p.model)?.labelKey ? t(MODEL_OPTIONS.find(m => m.id === p.model)!.labelKey) : p.model}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <button
          onClick={() => onActivate(p)}
          title={isDefault ? t('persona.removeDefault') : t('persona.setAsDefault')}
          style={{
            width: 26,
            height: 26,
            borderRadius: 4,
            border: 'none',
            background: isDefault ? p.color : 'none',
            color: isDefault ? '#fff' : 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 150ms',
          }}
          onMouseEnter={e => { if (!isDefault) e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
          onMouseLeave={e => { if (!isDefault) e.currentTarget.style.background = 'none' }}
        >
          <Check size={13} />
        </button>
        <button
          onClick={() => onEdit(p)}
          title={t('persona.editPersona')}
          style={{
            width: 26,
            height: 26,
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
          <Pencil size={12} />
        </button>
        <button
          onClick={() => onDelete(p.id)}
          title={isDeleting ? t('persona.deleteConfirm') : t('persona.deletePersona')}
          style={{
            width: 26,
            height: 26,
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
          {isDeleting ? <X size={12} /> : <Trash2 size={12} />}
        </button>
      </div>
    </div>
  )
}
