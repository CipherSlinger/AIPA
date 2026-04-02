import React, { useState, useRef, useCallback } from 'react'
import { ChevronDown, Sparkles } from 'lucide-react'
import { usePrefsStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import { useClickOutside } from '../../hooks/useClickOutside'
import type { Persona } from '../../types/app.types'

export default function PersonaPicker() {
  const t = useT()
  const [showPicker, setShowPicker] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  const personas: Persona[] = usePrefsStore(s => s.prefs.personas) || []
  const activePersonaId = usePrefsStore(s => s.prefs.activePersonaId)
  const activePersona = personas.find(p => p.id === activePersonaId)

  useClickOutside(pickerRef, showPicker, useCallback(() => setShowPicker(false), []))

  const handlePersonaSwitch = useCallback((persona: Persona | null) => {
    setShowPicker(false)
    if (!persona) {
      // Deactivate persona
      usePrefsStore.getState().setPrefs({ activePersonaId: undefined, systemPrompt: '', outputStyle: 'default' })
      window.electronAPI.prefsSet('activePersonaId', undefined)
      window.electronAPI.prefsSet('systemPrompt', '')
      window.electronAPI.prefsSet('outputStyle', 'default')
      useUiStore.getState().addToast('info', t('persona.deactivated'))
    } else {
      // Activate persona
      usePrefsStore.getState().setPrefs({
        activePersonaId: persona.id,
        model: persona.model,
        systemPrompt: persona.systemPrompt,
        outputStyle: persona.outputStyle || 'default',
      })
      window.electronAPI.prefsSet('activePersonaId', persona.id)
      window.electronAPI.prefsSet('model', persona.model)
      window.electronAPI.prefsSet('systemPrompt', persona.systemPrompt)
      window.electronAPI.prefsSet('outputStyle', persona.outputStyle || 'default')
      useUiStore.getState().addToast('success', t('persona.switchedTo', { name: persona.presetKey ? t(`persona.preset.${persona.presetKey}`) : persona.name }))
    }
  }, [t])

  if (personas.length === 0) return null

  return (
    <div style={{ position: 'relative' }} ref={pickerRef}>
      <button
        onClick={() => setShowPicker(!showPicker)}
        title={activePersona ? t('persona.personaActive', { name: activePersona.name }) : t('persona.selectPersona')}
        style={{
          background: showPicker ? 'rgba(255,255,255,0.08)' : activePersona ? `${activePersona.color}18` : 'none',
          border: `1px solid ${activePersona ? activePersona.color : 'transparent'}`,
          borderRadius: 4,
          padding: '2px 8px',
          cursor: 'pointer',
          color: activePersona ? activePersona.color : 'var(--text-muted)',
          fontSize: 11,
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          flexShrink: 0,
          transition: 'color 150ms, background 150ms, border-color 150ms',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = activePersona ? activePersona.color : 'var(--accent)'
          if (!activePersona) e.currentTarget.style.borderColor = 'var(--border)'
        }}
        onMouseLeave={(e) => {
          if (!showPicker) {
            e.currentTarget.style.color = activePersona ? activePersona.color : 'var(--text-muted)'
            if (!activePersona) e.currentTarget.style.borderColor = 'transparent'
          }
        }}
      >
        {activePersona ? (
          <>
            <span style={{ fontSize: 13 }}>{activePersona.emoji}</span>
            <span>{activePersona.name}</span>
          </>
        ) : (
          <>
            <Sparkles size={11} />
            <span>{t('persona.selectPersona')}</span>
          </>
        )}
        <ChevronDown size={10} style={{ opacity: 0.6 }} />
      </button>
      {showPicker && (
        <div
          role="listbox"
          aria-label={t('persona.selectPersona')}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 60,
            width: 240,
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
            {t('persona.selectPersona')}
          </div>
          {/* No persona option */}
          <button
            role="option"
            aria-selected={!activePersonaId}
            onClick={() => handlePersonaSwitch(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              textAlign: 'left',
              background: !activePersonaId ? 'rgba(var(--accent-rgb, 0, 122, 204), 0.12)' : 'none',
              border: 'none',
              padding: '7px 12px',
              cursor: 'pointer',
              color: !activePersonaId ? 'var(--accent)' : 'var(--text-primary)',
              fontSize: 12,
              fontWeight: !activePersonaId ? 600 : 400,
              transition: 'background 100ms',
            }}
            onMouseEnter={(e) => { if (activePersonaId) e.currentTarget.style.background = 'var(--popup-item-hover)' }}
            onMouseLeave={(e) => { if (activePersonaId) e.currentTarget.style.background = 'none' }}
          >
            <span style={{ fontSize: 14, width: 20, textAlign: 'center' }}>-</span>
            <span>{t('persona.noPersona')}</span>
            {!activePersonaId && <span style={{ marginLeft: 'auto', fontSize: 14 }}>&#10003;</span>}
          </button>
          {/* Persona options */}
          {personas.map(p => {
            const isActive = p.id === activePersonaId
            return (
              <button
                key={p.id}
                role="option"
                aria-selected={isActive}
                onClick={() => handlePersonaSwitch(p)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  textAlign: 'left',
                  background: isActive ? `${p.color}18` : 'none',
                  border: 'none',
                  padding: '7px 12px',
                  cursor: 'pointer',
                  color: isActive ? p.color : 'var(--text-primary)',
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 400,
                  transition: 'background 100ms',
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--popup-item-hover)' }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'none' }}
              >
                <span style={{ fontSize: 14, width: 20, textAlign: 'center' }}>{p.emoji}</span>
                <span style={{ flex: 1 }}>{p.presetKey ? t(`persona.preset.${p.presetKey}`) : p.name}</span>
                {isActive && <span style={{ fontSize: 14 }}>&#10003;</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
