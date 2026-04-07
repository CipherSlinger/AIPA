// StatusBar persona picker — extracted from StatusBar.tsx (Iteration 313)
// Updated to per-session persona model (Iteration 407)

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronUp, Check, User } from 'lucide-react'
import { usePrefsStore, useChatStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import type { Persona } from '../../types/app.types'

interface StatusBarPersonaPickerProps {
  personas: Persona[]
  activePersona: Persona | undefined
}

const EMPTY_PERSONAS: Persona[] = []

export default function StatusBarPersonaPicker({ personas, activePersona: _defaultPersona }: StatusBarPersonaPickerProps) {
  const t = useT()
  const sessionPersonaId = useChatStore(s => s.sessionPersonaId)
  const allPersonas = usePrefsStore(s => s.prefs.personas ?? EMPTY_PERSONAS)
  const sessionPersona = allPersonas.find(p => p.id === sessionPersonaId)
  const [show, setShow] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!show) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShow(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [show])

  const handleSelect = useCallback((personaId: string | null) => {
    if (personaId) {
      const persona = (usePrefsStore.getState().prefs.personas || []).find(p => p.id === personaId)
      if (persona) {
        const resolvedPrompt = persona.presetKey ? t(`persona.presetPrompt.${persona.presetKey}`) : persona.systemPrompt
        useChatStore.getState().setSessionPersonaId(personaId)
        usePrefsStore.getState().setPrefs({ model: persona.model, systemPrompt: resolvedPrompt, outputStyle: persona.outputStyle || 'default' })
        window.electronAPI.prefsSet('model', persona.model)
        window.electronAPI.prefsSet('systemPrompt', resolvedPrompt)
        window.electronAPI.prefsSet('outputStyle', persona.outputStyle || 'default')
        useUiStore.getState().addToast('success', t('persona.switchedTo', { name: persona.presetKey ? t(`persona.preset.${persona.presetKey}`) : persona.name }))
      }
    } else {
      useChatStore.getState().setSessionPersonaId(undefined)
      usePrefsStore.getState().setPrefs({ systemPrompt: '', outputStyle: 'default' })
      window.electronAPI.prefsSet('systemPrompt', '')
      window.electronAPI.prefsSet('outputStyle', 'default')
      useUiStore.getState().addToast('info', t('persona.deactivated'))
    }
    setShow(false)
  }, [t])

  if (personas.length === 0) return null

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        onClick={() => setShow(!show)}
        style={{
          padding: '1px 6px',
          borderRadius: 8,
          background: sessionPersona
            ? `${sessionPersona.color}33`
            : show ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.15)',
          fontSize: 10,
          fontWeight: 500,
          whiteSpace: 'nowrap',
          opacity: 0.9,
          border: sessionPersona ? `1px solid ${sessionPersona.color}66` : 'none',
          color: '#fff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          transition: 'background 0.15s',
        }}
        title={sessionPersona ? t('persona.personaActive', { name: sessionPersona.name }) : t('persona.selectPersona')}
      >
        {sessionPersona ? (
          <>
            <span style={{ fontSize: 11 }}>{sessionPersona.emoji}</span>
            {sessionPersona.name}
          </>
        ) : (
          <>
            <User size={10} />
            {t('persona.selectPersona')}
          </>
        )}
        <ChevronUp size={8} style={{ opacity: 0.6, transform: show ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>
      {show && (
        <div
          className="popup-enter"
          style={{
            position: 'absolute',
            bottom: '100%',
            right: 0,
            marginBottom: 4,
            background: 'var(--popup-bg)',
            border: '1px solid var(--popup-border)',
            boxShadow: 'var(--popup-shadow)',
            borderRadius: 8,
            padding: '4px 0',
            minWidth: 160,
            zIndex: 100,
          }}
        >
          <button
            onClick={() => handleSelect(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              width: '100%',
              padding: '5px 12px',
              background: !sessionPersonaId ? 'var(--popup-item-hover)' : 'transparent',
              border: 'none',
              color: !sessionPersonaId ? 'var(--accent)' : 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: 11,
              textAlign: 'left',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => { if (sessionPersonaId) (e.currentTarget as HTMLElement).style.background = 'var(--popup-item-hover)' }}
            onMouseLeave={e => { if (sessionPersonaId) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            {!sessionPersonaId && <Check size={11} />}
            <span style={{ marginLeft: !sessionPersonaId ? 0 : 17 }}>{t('persona.noPersona')}</span>
          </button>
          {personas.map(p => {
            const isActive = p.id === sessionPersonaId
            return (
              <button
                key={p.id}
                onClick={() => handleSelect(p.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  width: '100%',
                  padding: '5px 12px',
                  background: isActive ? 'var(--popup-item-hover)' : 'transparent',
                  border: 'none',
                  color: isActive ? p.color : 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: 11,
                  textAlign: 'left',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--popup-item-hover)' }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                {isActive && <Check size={11} />}
                <span style={{ marginLeft: isActive ? 0 : 17 }}>
                  {p.emoji} {p.presetKey ? t(`persona.preset.${p.presetKey}`) : p.name}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
