import React, { useState, useRef, useCallback } from 'react'
import { ChevronDown } from 'lucide-react'
import { usePrefsStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import { useClickOutside } from '../../hooks/useClickOutside'
import { MODEL_OPTIONS } from '../settings/settingsConstants'

interface ModelPickerProps {
  model: string | undefined
}

/** Get short model display name: "claude-sonnet-4-6" -> "Sonnet 4.6" */
function getModelShortName(modelId: string | undefined): string {
  if (!modelId) return 'Claude'
  const opt = MODEL_OPTIONS.find(m => m.id === modelId)
  if (opt) {
    const parts = modelId.replace('claude-', '').split('-')
    if (parts.length >= 2) {
      const family = parts[0].charAt(0).toUpperCase() + parts[0].slice(1)
      const version = parts.slice(1).filter(p => /^\d/.test(p)).join('.')
      return version ? `${family} ${version}` : family
    }
  }
  return modelId.split('-').slice(0, 3).join('-')
}

export default function ModelPicker({ model }: ModelPickerProps) {
  const t = useT()
  const [showPicker, setShowPicker] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  useClickOutside(pickerRef, showPicker, useCallback(() => setShowPicker(false), []))

  const handleModelSwitch = useCallback((modelId: string) => {
    usePrefsStore.getState().setPrefs({ model: modelId })
    window.electronAPI.prefsSet('model', modelId)
    setShowPicker(false)
    const shortName = getModelShortName(modelId)
    useUiStore.getState().addToast('success', t('chat.modelSwitched', { model: shortName }))
  }, [t])

  return (
    <div style={{ position: 'relative' }} ref={pickerRef}>
      <button
        onClick={() => setShowPicker(!showPicker)}
        title={t('chat.switchModel')}
        style={{
          background: showPicker ? 'rgba(255,255,255,0.08)' : 'none',
          border: '1px solid transparent',
          borderRadius: 4,
          padding: '2px 8px',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          fontSize: 11,
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          flexShrink: 0,
          transition: 'color 150ms, background 150ms, border-color 150ms',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--accent)'
          e.currentTarget.style.borderColor = 'var(--border)'
        }}
        onMouseLeave={(e) => {
          if (!showPicker) {
            e.currentTarget.style.color = 'var(--text-muted)'
            e.currentTarget.style.borderColor = 'transparent'
          }
        }}
      >
        <span>{getModelShortName(model)}</span>
        <ChevronDown size={10} style={{ opacity: 0.6 }} />
      </button>
      {showPicker && (
        <div
          role="listbox"
          aria-label={t('chat.switchModel')}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 60,
            width: 220,
            background: 'var(--popup-bg)',
            border: '1px solid var(--popup-border)',
            borderRadius: 8,
            boxShadow: 'var(--popup-shadow)',
            padding: '4px 0',
            marginTop: 4,
            animation: 'popup-in 120ms ease-out',
          }}
        >
          <div style={{ padding: '6px 12px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)', marginBottom: 2 }}>
            {t('chat.switchModel')}
          </div>
          {MODEL_OPTIONS.map(opt => {
            const isActive = opt.id === model
            return (
              <button
                key={opt.id}
                role="option"
                aria-selected={isActive}
                onClick={() => handleModelSwitch(opt.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  textAlign: 'left',
                  background: isActive ? 'rgba(var(--accent-rgb, 0, 122, 204), 0.12)' : 'none',
                  border: 'none',
                  padding: '7px 12px',
                  cursor: 'pointer',
                  color: isActive ? 'var(--accent)' : 'var(--text-primary)',
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 400,
                  transition: 'background 100ms',
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--popup-item-hover)' }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'none' }}
              >
                <span>{t(opt.labelKey)}</span>
                {isActive && <span style={{ fontSize: 14 }}>&#10003;</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export { getModelShortName }
