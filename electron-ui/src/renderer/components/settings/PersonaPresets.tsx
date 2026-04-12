import React, { useState } from 'react'
import { Download } from 'lucide-react'
import { useI18n } from '../../i18n'
import { PERSONA_PRESETS } from './personaConstants'
import type { Persona } from '../../types/app.types'

interface PersonaPresetsProps {
  personas: Persona[]
  onInstall: (preset: Omit<Persona, 'id' | 'createdAt' | 'updatedAt'>) => void
}

interface PresetRowProps {
  preset: typeof PERSONA_PRESETS[number]
  onInstall: (preset: Omit<Persona, 'id' | 'createdAt' | 'updatedAt'>) => void
  label: string
  description: string
  installTitle: string
}

function PresetRow({ preset, onInstall, label, description, installTitle }: PresetRowProps) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '12px 14px',
        background: hovered ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
        border: hovered ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12,
        boxShadow: hovered ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'all 0.15s ease',
      }}
    >
      <div style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        overflow: 'hidden',
        flexShrink: 0,
        background: `${preset.color}20`,
        border: `1px solid ${preset.color}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 16,
      }}>
        {preset.emoji}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3, color: 'rgba(255,255,255,0.82)' }}>
          {label}
        </div>
        <div style={{
          fontSize: 11,
          color: 'rgba(255,255,255,0.55)',
          lineHeight: 1.4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {description.slice(0, 60)}...
        </div>
      </div>
      <button
        onClick={() => onInstall(preset)}
        title={installTitle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 10px',
          fontSize: 11,
          fontWeight: 600,
          background: 'linear-gradient(135deg, rgba(99,102,241,0.85), rgba(139,92,246,0.85))',
          border: 'none',
          borderRadius: 8,
          color: 'rgba(255,255,255,0.95)',
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.filter = 'brightness(0.95)'
          e.currentTarget.style.transform = 'translateY(-1px)'
          e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.filter = ''
          e.currentTarget.style.transform = ''
          e.currentTarget.style.boxShadow = ''
        }}
      >
        <Download size={11} />
      </button>
    </div>
  )
}

export default function PersonaPresets({ personas, onInstall }: PersonaPresetsProps) {
  const { t } = useI18n()
  const available = PERSONA_PRESETS.filter(preset => !personas.some(p => p.presetKey === preset.presetKey || p.name === preset.name))

  if (personas.length >= 10 || available.length === 0) return null

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 12 }}>
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.07em',
        textTransform: 'uppercase' as const,
        color: 'rgba(255,255,255,0.38)',
        marginBottom: 8,
      }}>
        {t('persona.presets')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {available.map((preset, i) => (
          <PresetRow
            key={i}
            preset={preset}
            onInstall={onInstall}
            label={preset.presetKey ? t(`persona.preset.${preset.presetKey}`) : preset.name}
            description={preset.presetKey ? t(`persona.presetPrompt.${preset.presetKey}`) : preset.systemPrompt}
            installTitle={t('persona.addPersona')}
          />
        ))}
      </div>
    </div>
  )
}
