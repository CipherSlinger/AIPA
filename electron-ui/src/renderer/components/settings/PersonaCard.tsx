import React, { useState } from 'react'
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
  const [hovered, setHovered] = useState(false)
  const [editHovered, setEditHovered] = useState(false)
  const [deleteHovered, setDeleteHovered] = useState(false)
  const [checkHovered, setCheckHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        background: 'rgba(15,15,25,0.85)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: hovered
          ? '1px solid rgba(255,255,255,0.14)'
          : `1px solid rgba(255,255,255,0.09)`,
        borderLeft: `3px solid ${p.color}`,
        borderRadius: 10,
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
        boxShadow: hovered ? '0 6px 20px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.25)' : 'none',
        transition: 'all 0.15s ease',
      }}
    >
      {/* Avatar */}
      <div style={{
        width: 40,
        height: 40,
        borderRadius: 10,
        background: `${p.color}26`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 20,
        flexShrink: 0,
        border: hovered ? '2px solid rgba(99,102,241,0.5)' : '2px solid transparent',
        transition: 'border-color 0.15s ease',
      }}>
        {p.emoji}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.82)' }}>
            {p.presetKey ? t(`persona.preset.${p.presetKey}`) : p.name}
          </span>
          {isDefault && (
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              background: 'rgba(34,197,94,0.15)',
              border: '1px solid rgba(34,197,94,0.3)',
              color: '#4ade80',
              padding: '1px 6px',
              borderRadius: 10,
            }}>
              {t('persona.defaultBadge')}
            </span>
          )}
        </div>
        <div style={{
          fontSize: 11,
          color: 'rgba(255,255,255,0.45)',
          marginTop: 2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          lineHeight: 1.5,
        }}>
          {MODEL_OPTIONS.find(m => m.id === p.model)?.labelKey ? t(MODEL_OPTIONS.find(m => m.id === p.model)!.labelKey) : p.model}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {/* Activate / Set Default button */}
        <button
          onClick={() => onActivate(p)}
          title={isDefault ? t('persona.removeDefault') : t('persona.setAsDefault')}
          onMouseEnter={() => setCheckHovered(true)}
          onMouseLeave={() => setCheckHovered(false)}
          style={{
            width: 26,
            height: 26,
            borderRadius: 8,
            border: 'none',
            background: isDefault ? p.color : checkHovered ? 'rgba(255,255,255,0.08)' : 'transparent',
            color: isDefault ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.45)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
        >
          <Check size={13} />
        </button>

        {/* Edit button */}
        <button
          onClick={() => onEdit(p)}
          title={t('persona.editPersona')}
          onMouseEnter={() => setEditHovered(true)}
          onMouseLeave={() => setEditHovered(false)}
          style={{
            width: 26,
            height: 26,
            borderRadius: 8,
            border: 'none',
            background: editHovered ? 'rgba(99,102,241,0.15)' : 'transparent',
            color: editHovered ? '#818cf8' : 'rgba(255,255,255,0.45)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
        >
          <Pencil size={12} />
        </button>

        {/* Delete button */}
        <button
          onClick={() => onDelete(p.id)}
          title={isDeleting ? t('persona.deleteConfirm') : t('persona.deletePersona')}
          onMouseEnter={() => setDeleteHovered(true)}
          onMouseLeave={() => setDeleteHovered(false)}
          style={{
            width: 26,
            height: 26,
            borderRadius: 8,
            border: 'none',
            background: isDeleting
              ? 'rgba(239,68,68,0.12)'
              : deleteHovered ? 'rgba(239,68,68,0.12)' : 'transparent',
            color: isDeleting
              ? '#fca5a5'
              : deleteHovered ? '#fca5a5' : 'rgba(255,255,255,0.45)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
        >
          {isDeleting ? <X size={12} /> : <Trash2 size={12} />}
        </button>
      </div>
    </div>
  )
}
