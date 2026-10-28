import React, { useState, useRef, useCallback, useEffect } from 'react'
import { AlertTriangle, ChevronDown, Sparkles, Workflow as WorkflowIcon } from 'lucide-react'
import { usePrefsStore, useChatStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import FloatingPortal from '../ui/FloatingPortal'
import { useClickOutside } from '../../hooks/useClickOutside'
import { runWorkflowIntoQueue } from '../workflows/runWorkflow'
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
  // The session remembers the persona id even after the catalogue entry is
  // deleted. Surfacing that is what turns a silent fallback to the default
  // settings into something the user can act on.
  const sessionPersonaMissing = Boolean(sessionPersonaId && !sessionPersona)

  const menuRef = useRef<HTMLDivElement>(null)
  useClickOutside(pickerRef, showPicker, useCallback(() => setShowPicker(false), []), [menuRef])

  // Allow external badge click to open the picker
  useEffect(() => {
    const handler = () => setShowPicker(true)
    window.addEventListener('aipa:openPersonaPicker', handler)
    return () => window.removeEventListener('aipa:openPersonaPicker', handler)
  }, [])

  const handlePersonaSwitch = useCallback((persona: Persona | null) => {
    setShowPicker(false)
    // Scope the choice to this conversation. The persona's prompt, model and
    // output style are resolved at send time from this id, so switching here
    // cannot change what another open conversation sends.
    useChatStore.getState().setSessionPersonaId(persona?.id)
    if (!persona) {
      useUiStore.getState().addToast('info', t('persona.deactivated'))
    } else {
      useUiStore.getState().addToast('success', t('persona.switchedTo', { name: persona.presetKey ? t(`persona.preset.${persona.presetKey}`) : persona.name }))
    }
  }, [t])

  const handleRunWorkflow = useCallback((workflowId: string) => {
    setShowPicker(false)
    const workflow = workflows.find(w => w.id === workflowId)
    if (workflow) runWorkflowIntoQueue(workflow, t)
  }, [workflows, t])

  if (personas.length === 0 && workflows.length === 0) return null

  return (
    <div style={{ position: 'relative' }} ref={pickerRef}>
      <button
        onClick={() => setShowPicker(!showPicker)}
        title={sessionPersona
          ? t('persona.personaActive', { name: sessionPersona.name })
          : sessionPersonaMissing
            ? t('persona.missingHint')
            : t('persona.selectPersona')}
        style={{
          background: showPicker
            ? 'var(--border)'
            : sessionPersonaMissing
              ? 'rgba(245,158,11,0.12)'
              : sessionPersona ? `${sessionPersona.color}18` : 'none',
          border: `1px solid ${sessionPersona ? sessionPersona.color : sessionPersonaMissing ? 'rgba(245,158,11,0.45)' : 'transparent'}`,
          borderRadius: 8,
          padding: '2px 8px',
          cursor: 'pointer',
          color: sessionPersona ? sessionPersona.color : sessionPersonaMissing ? '#fbbf24' : 'var(--text-muted)',
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
            e.currentTarget.style.color = sessionPersona
              ? sessionPersona.color
              : sessionPersonaMissing ? '#fbbf24' : 'var(--text-muted)'
            if (!sessionPersona) {
              e.currentTarget.style.borderColor = sessionPersonaMissing
                ? 'rgba(245,158,11,0.45)'
                : 'transparent'
            }
          }
        }}
      >
        {sessionPersona ? (
          <>
            <span style={{ fontSize: 13 }}>{sessionPersona.emoji}</span>
            <span>{sessionPersona.name}</span>
          </>
        ) : sessionPersonaMissing ? (
          <>
            <AlertTriangle size={11} />
            <span>{t('persona.missing')}</span>
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
        <FloatingPortal ref={menuRef} anchorRef={pickerRef} placement="below-start">
        <div
          role="listbox"
          aria-label={t('persona.selectPersona')}
          style={{
            width: 260,
            background: 'var(--popup-bg)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
            padding: '4px 0',
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
          {sessionPersonaMissing && (
            <div style={{
              padding: '6px 12px',
              fontSize: 11,
              lineHeight: 1.45,
              color: '#fbbf24',
              background: 'rgba(245,158,11,0.08)',
              borderBottom: '1px solid var(--border)',
            }}>
              {t('persona.missingHint')}
            </div>
          )}
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
        </FloatingPortal>
      )}
    </div>
  )
}
