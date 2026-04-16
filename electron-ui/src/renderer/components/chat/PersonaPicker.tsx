import React, { useState, useRef, useCallback, useEffect } from 'react'
import { ChevronDown, Sparkles, Workflow as WorkflowIcon } from 'lucide-react'
import { usePrefsStore, useChatStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import { useClickOutside } from '../../hooks/useClickOutside'
import type { Persona, Workflow } from '../../types/app.types'

const EMPTY_PERSONAS: Persona[] = []
const EMPTY_WORKFLOWS: Workflow[] = []

export default function PersonaPicker() {
  const t = useT()
  const [showPicker, setShowPicker] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  const personas = usePrefsStore(s => s.prefs.personas ?? EMPTY_PERSONAS)
  const workflows = usePrefsStore(s => (s.prefs.workflows as Workflow[] | undefined) ?? EMPTY_WORKFLOWS)
  const sessionPersonaId = useChatStore(s => s.sessionPersonaId)
  const sessionPersona = personas.find(p => p.id === sessionPersonaId)

  useClickOutside(pickerRef, showPicker, useCallback(() => setShowPicker(false), []))

  // Allow external badge click to open the picker
  useEffect(() => {
    const handler = () => setShowPicker(true)
    window.addEventListener('aipa:openPersonaPicker', handler)
    return () => window.removeEventListener('aipa:openPersonaPicker', handler)
  }, [])

  const handlePersonaSwitch = useCallback((persona: Persona | null) => {
    setShowPicker(false)
    if (!persona) {
      // Clear session persona
      useChatStore.getState().setSessionPersonaId(undefined)
      usePrefsStore.getState().setPrefs({ systemPrompt: '', outputStyle: 'default' })
      window.electronAPI.prefsSet('systemPrompt', '')
      window.electronAPI.prefsSet('outputStyle', 'default')
      useUiStore.getState().addToast('info', t('persona.deactivated'))
    } else {
      // Set session persona
      const resolvedPrompt = persona.presetKey ? t(`persona.presetPrompt.${persona.presetKey}`) : persona.systemPrompt
      useChatStore.getState().setSessionPersonaId(persona.id)
      usePrefsStore.getState().setPrefs({
        model: persona.model,
        systemPrompt: resolvedPrompt,
        outputStyle: persona.outputStyle || 'default',
      })
      window.electronAPI.prefsSet('model', persona.model)
      window.electronAPI.prefsSet('systemPrompt', resolvedPrompt)
      window.electronAPI.prefsSet('outputStyle', persona.outputStyle || 'default')
      useUiStore.getState().addToast('success', t('persona.switchedTo', { name: persona.presetKey ? t(`persona.preset.${persona.presetKey}`) : persona.name }))
    }
  }, [t])

  const handleRunWorkflow = useCallback((workflowId: string) => {
    setShowPicker(false)
    window.dispatchEvent(new CustomEvent('aipa:runWorkflow', { detail: workflowId }))
  }, [])

  if (personas.length === 0 && workflows.length === 0) return null

  return (
    <div style={{ position: 'relative' }} ref={pickerRef}>
      <button
        onClick={() => setShowPicker(!showPicker)}
        title={sessionPersona ? t('persona.personaActive', { name: sessionPersona.name }) : t('persona.selectPersona')}
        style={{
          background: showPicker ? 'var(--border)' : sessionPersona ? `${sessionPersona.color}18` : 'none',
          border: `1px solid ${sessionPersona ? sessionPersona.color : 'transparent'}`,
          borderRadius: 8,
          padding: '2px 8px',
          cursor: 'pointer',
          color: sessionPersona ? sessionPersona.color : 'var(--text-muted)',
          fontSize: 11,
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          flexShrink: 0,
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = sessionPersona ? sessionPersona.color : '#818cf8'
          if (!sessionPersona) e.currentTarget.style.borderColor = 'var(--border)'
        }}
        onMouseLeave={(e) => {
          if (!showPicker) {
            e.currentTarget.style.color = sessionPersona ? sessionPersona.color : 'var(--text-muted)'
            if (!sessionPersona) e.currentTarget.style.borderColor = 'transparent'
          }
        }}
      >
        {sessionPersona ? (
          <>
            <span style={{ fontSize: 13 }}>{sessionPersona.emoji}</span>
            <span>{sessionPersona.name}</span>
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
            zIndex: 200,
            width: 260,
            background: 'var(--popup-bg)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
            padding: '4px 0',
            marginTop: 4,
            animation: 'slideUp 0.15s ease',
          }}
        >
          {/* Section header */}
          <div style={{
            padding: '6px 12px 6px',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            borderBottom: '1px solid var(--border)',
            marginBottom: 2,
          }}>
            {t('persona.selectPersona')}
          </div>
          {/* No persona option */}
          <button
            role="option"
            aria-selected={!sessionPersonaId}
            onClick={() => handlePersonaSwitch(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              textAlign: 'left',
              background: !sessionPersonaId ? 'rgba(99,102,241,0.15)' : 'none',
              border: 'none',
              borderLeft: !sessionPersonaId ? '3px solid rgba(99,102,241,0.7)' : '3px solid transparent',
              padding: '7px 12px',
              cursor: 'pointer',
              color: !sessionPersonaId ? '#818cf8' : 'var(--text-secondary)',
              fontSize: 12,
              fontStyle: 'italic',
              fontWeight: !sessionPersonaId ? 600 : 400,
              borderRadius: !sessionPersonaId ? 0 : 6,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (sessionPersonaId) {
                e.currentTarget.style.background = 'rgba(99,102,241,0.07)'
                e.currentTarget.style.borderLeft = '3px solid rgba(99,102,241,0.25)'
                e.currentTarget.style.borderRadius = '0'
              }
            }}
            onMouseLeave={(e) => {
              if (sessionPersonaId) {
                e.currentTarget.style.background = 'none'
                e.currentTarget.style.borderLeft = '3px solid transparent'
                e.currentTarget.style.borderRadius = '6px'
              }
            }}
          >
            <span style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              background: 'var(--bg-hover)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14,
            }}>–</span>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{t('persona.noPersona')}</span>
            {!sessionPersonaId && <span style={{ marginLeft: 'auto', fontSize: 12, color: '#818cf8' }}>&#10003;</span>}
          </button>
          {/* Persona options */}
          {personas.map(p => {
            const isActive = p.id === sessionPersonaId
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
                  background: isActive ? 'rgba(99,102,241,0.15)' : 'none',
                  border: 'none',
                  borderLeft: isActive ? '3px solid rgba(99,102,241,0.7)' : '3px solid transparent',
                  padding: '7px 12px',
                  cursor: 'pointer',
                  color: isActive ? '#818cf8' : 'var(--text-primary)',
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 400,
                  borderRadius: isActive ? 0 : 6,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'rgba(99,102,241,0.07)'
                    e.currentTarget.style.borderLeft = '3px solid rgba(99,102,241,0.25)'
                    e.currentTarget.style.borderRadius = '0'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'none'
                    e.currentTarget.style.borderLeft = '3px solid transparent'
                    e.currentTarget.style.borderRadius = '6px'
                  }
                }}
              >
                <span style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: isActive
                    ? 'linear-gradient(135deg, rgba(99,102,241,0.30), rgba(139,92,246,0.25))'
                    : `${p.color}26`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16,
                }}>{p.emoji}</span>
                <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>
                  {p.presetKey ? t(`persona.preset.${p.presetKey}`) : p.name}
                </span>
                {isActive && <span style={{ fontSize: 12, color: '#818cf8' }}>&#10003;</span>}
              </button>
            )
          })}
          {/* Workflows section */}
          {workflows.length > 0 && (
            <>
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
              <div style={{
                padding: '4px 12px 2px',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
              }}>
                {t('nav.workflows')}
              </div>
              {workflows.map(wf => (
                <button
                  key={wf.id}
                  onClick={() => handleRunWorkflow(wf.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    borderLeft: '3px solid transparent',
                    borderRadius: 6,
                    padding: '7px 12px',
                    cursor: 'pointer',
                    color: 'var(--text-primary)',
                    fontSize: 12,
                    fontWeight: 400,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
                >
                  <span style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: 'rgba(99,102,241,0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <WorkflowIcon size={14} style={{ color: '#818cf8' }} />
                  </span>
                  <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{wf.name}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
