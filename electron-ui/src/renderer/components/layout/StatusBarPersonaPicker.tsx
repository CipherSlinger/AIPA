// StatusBar persona picker — extracted from StatusBar.tsx (Iteration 313)
// Updated to per-session persona model (Iteration 407)
// Added workflow section (Iteration 533)

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronUp, Check, User, GitBranch } from 'lucide-react'
import { usePrefsStore, useChatStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import type { Persona, Workflow } from '../../types/app.types'

interface StatusBarPersonaPickerProps {
  personas: Persona[]
  activePersona: Persona | undefined
}

const EMPTY_PERSONAS: Persona[] = []
const EMPTY_WORKFLOWS: Workflow[] = []

export default function StatusBarPersonaPicker({ personas, activePersona: _defaultPersona }: StatusBarPersonaPickerProps) {
  const t = useT()
  const sessionPersonaId = useChatStore(s => s.sessionPersonaId)
  const allPersonas = usePrefsStore(s => s.prefs.personas ?? EMPTY_PERSONAS)
  const workflows = usePrefsStore(s => s.prefs.workflows ?? EMPTY_WORKFLOWS)
  const sessionPersona = allPersonas.find(p => p.id === sessionPersonaId)
  const [show, setShow] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [chipHovered, setChipHovered] = useState(false)

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

  const handleWorkflowSelect = useCallback((wf: Workflow) => {
    useUiStore.getState().openWorkflowDetail(wf.id)
    setShow(false)
  }, [])

  if (personas.length === 0 && workflows.length === 0) return null

  const noPersonaKey = '__no_persona__'

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        onClick={() => setShow(!show)}
        onMouseEnter={() => setChipHovered(true)}
        onMouseLeave={() => setChipHovered(false)}
        style={{
          padding: '2px 8px',
          borderRadius: 6,
          background: sessionPersona
            ? `${sessionPersona.color}33`
            : chipHovered || show ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.06)',
          border: sessionPersona
            ? `1px solid ${sessionPersona.color}66`
            : '1px solid rgba(255,255,255,0.09)',
          fontSize: 11,
          fontWeight: 500,
          whiteSpace: 'nowrap',
          color: chipHovered || show ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.55)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          transition: 'all 0.15s ease',
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
        <ChevronUp size={8} style={{ opacity: 0.6, transform: show ? 'rotate(180deg)' : 'none', transition: 'all 0.15s ease' }} />
      </button>
      {show && (
        <div
          className="popup-enter"
          style={{
            position: 'absolute',
            bottom: '100%',
            right: 0,
            marginBottom: 4,
            background: 'rgba(15,15,25,0.96)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 10,
            boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
            padding: '4px 0',
            minWidth: 200,
            zIndex: 100,
          }}
        >
          {/* No Persona option */}
          <button
            onClick={() => handleSelect(null)}
            onMouseEnter={() => setHoveredId(noPersonaKey)}
            onMouseLeave={() => setHoveredId(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '7px 12px',
              background: !sessionPersonaId
                ? 'rgba(99,102,241,0.12)'
                : hoveredId === noPersonaKey ? 'rgba(255,255,255,0.06)' : 'transparent',
              borderLeft: !sessionPersonaId ? '2px solid rgba(99,102,241,0.6)' : '2px solid transparent',
              borderTop: 'none',
              borderRight: 'none',
              borderBottom: 'none',
              borderRadius: !sessionPersonaId ? 0 : 5,
              color: !sessionPersonaId ? '#818cf8' : 'rgba(255,255,255,0.60)',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s ease',
            }}
          >
            {!sessionPersonaId && <Check size={11} style={{ color: '#818cf8', flexShrink: 0 }} />}
            {/* Avatar placeholder for "No Persona" */}
            <span style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: 'rgba(255,255,255,0.07)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              marginLeft: !sessionPersonaId ? 0 : 17,
            }}>
              <User size={13} style={{ opacity: 0.5 }} />
            </span>
            <span style={{
              fontWeight: 600,
              fontSize: 12,
              fontStyle: 'italic',
              opacity: 0.55,
              color: !sessionPersonaId ? '#818cf8' : undefined,
            }}>
              {t('persona.noPersona')}
            </span>
          </button>

          {/* Persona list */}
          {personas.map(p => {
            const isActive = p.id === sessionPersonaId
            const isHovered = hoveredId === p.id
            const displayName = p.presetKey ? t(`persona.preset.${p.presetKey}`) : p.name
            // Derive a safe CSS color for avatar bg — use persona.color with 0.15 alpha
            const avatarBg = p.color ? `${p.color}26` : 'rgba(255,255,255,0.07)'
            return (
              <button
                key={p.id}
                onClick={() => handleSelect(p.id)}
                onMouseEnter={() => setHoveredId(p.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '7px 12px',
                  background: isActive
                    ? 'rgba(99,102,241,0.12)'
                    : isHovered ? 'rgba(255,255,255,0.06)' : 'transparent',
                  borderLeft: isActive ? '2px solid rgba(99,102,241,0.6)' : '2px solid transparent',
                  borderTop: 'none',
                  borderRight: 'none',
                  borderBottom: 'none',
                  borderRadius: isActive ? 0 : 5,
                  color: isActive ? '#818cf8' : 'rgba(255,255,255,0.60)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                {isActive && <Check size={11} style={{ color: '#818cf8', flexShrink: 0 }} />}
                {/* Persona avatar */}
                <span style={{
                  width: 28,
                  height: 28,
                  borderRadius: 7,
                  background: avatarBg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: 15,
                  marginLeft: isActive ? 0 : 17,
                }}>
                  {p.emoji}
                </span>
                <span style={{ fontWeight: 600, fontSize: 12 }}>
                  {displayName}
                </span>
              </button>
            )
          })}

          {workflows.length > 0 && (
            <>
              {/* Separator */}
              <div style={{
                height: 1,
                background: 'rgba(255,255,255,0.06)',
                margin: '4px 0',
              }} />
              {/* Workflows section label */}
              <div style={{
                padding: '8px 12px 3px',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.45)',
              }}>
                {t('workflow.title')}
              </div>
              {workflows.map(wf => {
                const isHovered = hoveredId === `wf-${wf.id}`
                const displayName = wf.presetKey ? t(`workflow.preset.${wf.presetKey}`) : wf.name
                return (
                  <button
                    key={wf.id}
                    onClick={() => handleWorkflowSelect(wf)}
                    onMouseEnter={() => setHoveredId(`wf-${wf.id}`)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      width: '100%',
                      padding: '5px 12px',
                      background: isHovered ? 'rgba(255,255,255,0.06)' : 'transparent',
                      border: 'none',
                      borderRadius: 8,
                      color: 'rgba(255,255,255,0.82)',
                      cursor: 'pointer',
                      fontSize: 11,
                      textAlign: 'left',
                      transition: 'all 0.15s ease',
                    }}
                    title={wf.description || displayName}
                  >
                    <GitBranch size={11} style={{ opacity: 0.6, flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {wf.icon} {displayName}
                    </span>
                  </button>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}
