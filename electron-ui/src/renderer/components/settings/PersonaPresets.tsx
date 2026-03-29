import React from 'react'
import { Download } from 'lucide-react'
import { useI18n } from '../../i18n'
import { PERSONA_PRESETS } from './personaConstants'
import type { Persona } from '../../types/app.types'

interface PersonaPresetsProps {
  personas: Persona[]
  onInstall: (preset: Omit<Persona, 'id' | 'createdAt' | 'updatedAt'>) => void
}

export default function PersonaPresets({ personas, onInstall }: PersonaPresetsProps) {
  const { t } = useI18n()
  const available = PERSONA_PRESETS.filter(preset => !personas.some(p => p.name === preset.name))

  if (personas.length >= 10 || available.length === 0) return null

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>
        {t('persona.presets')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {available.map((preset, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 10px',
              background: 'var(--card-bg)',
              border: '1px solid var(--card-border)',
              borderRadius: 6,
            }}
          >
            <span style={{ fontSize: 16, width: 24, textAlign: 'center' }}>{preset.emoji}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-bright)' }}>{preset.name}</div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {preset.systemPrompt.slice(0, 60)}...
              </div>
            </div>
            <button
              onClick={() => onInstall(preset)}
              title={t('persona.addPersona')}
              style={{
                width: 26,
                height: 26,
                borderRadius: 4,
                border: 'none',
                background: 'none',
                color: 'var(--accent)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <Download size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
