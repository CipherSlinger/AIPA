import React, { useState, useRef, useCallback, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { useChatStore, usePrefsStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import { resolveWorkingDir } from '../../lib/workingDir'
import FloatingPortal from '../ui/FloatingPortal'
import { useClickOutside } from '../../hooks/useClickOutside'
import { MODEL_OPTIONS } from '../settings/settingsConstants'
import type { CodexModelInfoData } from '../../../preload/index'

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
  // For non-Claude models, just return the name
  return modelId.split('/').pop()?.split('-').slice(0, 3).join('-') || modelId
}

type ModelTier = 'haiku' | 'sonnet' | 'opus'

const TIER_STYLES: Record<ModelTier, React.CSSProperties> = {
  haiku:  { background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 8, padding: '1px 5px', fontSize: 9, fontWeight: 700 },
  sonnet: { background: 'rgba(99,102,241,0.14)',  color: 'var(--accent-text)', border: '1px solid rgba(99,102,241,0.25)',  borderRadius: 8, padding: '1px 5px', fontSize: 9, fontWeight: 700 },
  opus:   { background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8, padding: '1px 5px', fontSize: 9, fontWeight: 700 },
}

function getModelTier(modelId: string): ModelTier | null {
  const lower = modelId.toLowerCase()
  if (lower.includes('haiku'))  return 'haiku'
  if (lower.includes('sonnet')) return 'sonnet'
  if (lower.includes('opus'))   return 'opus'
  return null
}

export default function ModelPicker({ model }: ModelPickerProps) {
  const t = useT()
  const [showPicker, setShowPicker] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  // What the open menu is allowed to offer. `probing` means the engine has not
  // answered yet — deliberately render no list rather than the built-in Claude
  // fallback, which would be a lie on a Codex profile. `codexLoading` is the
  // Codex catalogue call, which can take seconds on a cold app-server.
  const [pickMode, setPickMode] = useState<'probing' | 'codexLoading' | 'codex' | 'builtin'>('probing')
  const [codexModels, setCodexModels] = useState<CodexModelInfoData[]>([])

  // A persona-bound conversation runs on the persona's model unless the user
  // explicitly overrides it here. `model` is already the effective model.
  const sessionPersonaId = useChatStore(s => s.sessionPersonaId)
  const sessionModelOverride = useChatStore(s => s.sessionModelOverride)
  const sessionPersona = usePrefsStore(s => (s.prefs.personas || []).find(p => p.id === sessionPersonaId))

  const menuRef = useRef<HTMLDivElement>(null)
  useClickOutside(pickerRef, showPicker, useCallback(() => setShowPicker(false), []), [menuRef])

  // Load the list the active engine can actually run when the dropdown opens.
  // Codex profiles get Codex's own catalogue; every other profile gets the
  // built-in Claude list, because that is what the default bridge runs.
  useEffect(() => {
    if (!showPicker) return
    let cancelled = false

    const loadModels = async () => {
      setPickMode('probing')
      setCodexModels([])

      let engineKind: 'codex' | 'claude' | 'none' = 'claude'
      try {
        const active = await window.electronAPI.engineGetActive()
        if (active?.kind === 'codex' || active?.kind === 'none') engineKind = active.kind
      } catch {
        // No engine probe available: the built-in Claude list is the honest
        // fallback, since that is what the default send path uses.
      }
      if (cancelled) return

      if (engineKind === 'codex') {
        setPickMode('codexLoading')
        // Snapshot the active conversation here so the probe runs where the
        // next turn will run, and reuses a live app-server when one exists.
        const chat = useChatStore.getState()
        // The send path's own precedence, not a copy of it: the probe has to
        // run in the folder the next turn runs in, tab override included.
        const cwd = resolveWorkingDir({
          tabCwd: chat.tabs.find(tab => tab.id === chat.activeTabId)?.cwd,
          globalDir: usePrefsStore.getState().prefs.workingDir,
        }).dir
        try {
          const result = await window.electronAPI.codexModelList({
            cwd: cwd || undefined,
            sessionId: chat.streamSessionId || undefined,
          })
          const models = result?.success
            ? (result.models ?? []).filter(m => m.hidden !== true)
            : []
          if (!cancelled && models.length > 0) {
            setPickMode('codex')
            setCodexModels(models)
            return
          }
        } catch {
          // A read-only probe must never block picking a model — fall through.
        }
        if (cancelled) return
      }

      setPickMode('builtin')
    }

    loadModels()
    return () => { cancelled = true }
  }, [showPicker])

  // `label` lets a Codex row carry its own display name into the toast; the
  // persisted value stays `modelId`, so persona/override/prefs routing is
  // identical to a built-in row.
  const handleModelSwitch = useCallback((modelId: string, label?: string) => {
    setShowPicker(false)
    const shortName = label || getModelShortName(modelId)
    if (sessionPersona) {
      // The conversation is bound to a persona, whose model prompt assembly
      // reads at send time. Writing `prefs.model` here used to change the
      // global default while this conversation kept running on the persona —
      // so record an explicit per-session override instead.
      if (modelId === sessionPersona.model) {
        useChatStore.getState().setSessionModelOverride(undefined)
        useUiStore.getState().addToast('info', t('chat.modelReturnsToPersona', {
          model: shortName,
          persona: sessionPersona.name,
        }))
      } else {
        useChatStore.getState().setSessionModelOverride(modelId)
        useUiStore.getState().addToast('success', t('chat.modelOverridesPersona', {
          model: shortName,
          persona: sessionPersona.name,
        }))
      }
      return
    }
    // No persona (or its catalogue entry was deleted): the global default is
    // what this conversation follows. Drop any stale per-session override so
    // it cannot keep winning at send time.
    useChatStore.getState().setSessionModelOverride(undefined)
    usePrefsStore.getState().setPrefs({ model: modelId })
    window.electronAPI.prefsSet('model', modelId)
    useUiStore.getState().addToast('success', t('chat.modelSwitched', { model: shortName }))
  }, [sessionPersona, t])

  const handleClearOverride = useCallback(() => {
    setShowPicker(false)
    useChatStore.getState().setSessionModelOverride(undefined)
    const personaName = sessionPersona?.name || ''
    useUiStore.getState().addToast('info', t('chat.modelReturnsToPersona', {
      model: getModelShortName(sessionPersona?.model),
      persona: personaName,
    }))
  }, [sessionPersona, t])

  return (
    <div style={{ position: 'relative' }} ref={pickerRef}>
      <button
        onClick={() => setShowPicker(!showPicker)}
        title={t('chat.switchModel')}
        style={{
          background: showPicker ? 'rgba(99,102,241,0.12)' : 'var(--bg-hover)',
          border: `1px solid ${showPicker ? 'rgba(99,102,241,0.40)' : 'var(--border)'}`,
          borderRadius: 8,
          padding: '2px 8px',
          cursor: 'pointer',
          color: showPicker ? 'var(--accent-text)' : 'var(--text-secondary)',
          fontSize: 11,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          flexShrink: 0,
          transition: 'all 0.15s ease',
          boxShadow: showPicker ? '0 0 0 3px rgba(99,102,241,0.10)' : 'none',
        }}
        onMouseEnter={(e) => {
          if (!showPicker) {
            e.currentTarget.style.background = 'var(--border)'
            e.currentTarget.style.borderColor = 'var(--bg-active)'
          }
        }}
        onMouseLeave={(e) => {
          if (!showPicker) {
            e.currentTarget.style.background = 'var(--bg-hover)'
            e.currentTarget.style.borderColor = 'var(--border)'
          }
        }}
      >
        <span>{getModelShortName(model)}</span>
        {sessionPersona && sessionModelOverride && (
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.02em', opacity: 0.75 }}>
            {t('chat.modelOverrideTag')}
          </span>
        )}
        <ChevronDown size={10} style={{ opacity: 0.6 }} />
      </button>
      {showPicker && (
        <FloatingPortal ref={menuRef} anchorRef={pickerRef} placement="below-start">
        <div
          role="listbox"
          aria-label={t('chat.switchModel')}
          style={{
            width: 260,
            maxHeight: 400,
            overflowY: 'auto',
            background: 'var(--popup-bg)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
            padding: '4px 0',
            animation: 'slideUp 0.15s ease-out',
          }}
        >
          <div style={{ padding: '8px 12px 2px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid var(--border)', paddingBottom: 6, marginBottom: 2 }}>
            {t('chat.switchModel')}
          </div>

          {/* Say which mechanism a pick uses: in a persona conversation it is a
              per-session override, not the global default. */}
          {sessionPersona && (
            <div style={{ padding: '6px 12px 4px', fontSize: 10, lineHeight: 1.45, color: 'var(--text-muted)' }}>
              {sessionModelOverride
                ? t('chat.modelOverrideActive', {
                    persona: sessionPersona.name,
                    model: getModelShortName(sessionPersona.model),
                  })
                : t('chat.modelPersonaHint', {
                    persona: sessionPersona.name,
                    model: getModelShortName(sessionPersona.model),
                  })}
            </div>
          )}

          {sessionPersona && sessionModelOverride && (
            <button
              onClick={handleClearOverride}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                width: '100%', textAlign: 'left',
                padding: '6px 12px', margin: '0 0 2px',
                background: 'transparent', border: 'none',
                color: 'var(--accent-text)', cursor: 'pointer', fontSize: 11,
                borderRadius: 7,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.12)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              &#8634; {t('chat.modelClearOverride', { model: getModelShortName(sessionPersona.model) })}
            </button>
          )}

          {/* The catalogue call spawns (or attaches to) the app-server, so on a
              cold start it outlives the menu opening. Say so instead of
              showing an empty panel. */}
          {pickMode === 'codexLoading' && (
            <div style={{ padding: '10px 12px 8px 22px', fontSize: 11, color: 'var(--text-muted)' }}>
              {t('codex.models.loading')}
            </div>
          )}

          {/* Codex's own catalogue: what this installation will actually run.
              Read-only information — reasoning efforts are shown, not chosen. */}
          {pickMode === 'codex' && (
            <div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 12px 2px', fontSize: 10, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.07em',
                color: 'var(--text-muted)',
              }}>
                <span>{t('codex.models.title')}</span>
              </div>

              {codexModels.map(m => {
                // `model` is the slug Codex accepts on the wire; `id` is the
                // catalogue key. They are usually equal, so match either.
                const modelId = m.model || m.id
                const isActive = m.id === model || m.model === model
                const efforts = m.supportedReasoningEfforts
                  .map(option => option.reasoningEffort)
                  .filter(Boolean)
                  .join(' · ')
                return (
                  <button
                    key={m.id}
                    role="option"
                    aria-selected={isActive}
                    onClick={() => handleModelSwitch(modelId, m.displayName)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      width: '100%',
                      textAlign: 'left',
                      background: isActive ? 'rgba(99,102,241,0.12)' : 'transparent',
                      border: 'none',
                      borderLeft: isActive ? '2px solid rgba(99,102,241,0.60)' : '2px solid transparent',
                      padding: '8px 12px 8px 22px',
                      cursor: 'pointer',
                      color: isActive ? 'var(--accent-text)' : 'var(--text-primary)',
                      borderRadius: 7,
                      transition: 'all 0.15s ease',
                      gap: 6,
                    }}
                    onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.borderLeftColor = 'rgba(99,102,241,0.40)' } }}
                    onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderLeftColor = 'transparent' } }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                          fontSize: 13, fontWeight: 600,
                          color: isActive ? 'var(--accent-text)' : 'var(--text-primary)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {m.displayName || m.id}
                        </span>
                        {m.isDefault && (
                          <span style={{
                            fontSize: 9, padding: '1px 5px', borderRadius: 8,
                            background: 'rgba(99,102,241,0.14)', color: 'var(--accent-text)',
                            fontWeight: 700, flexShrink: 0,
                          }}>
                            {t('codex.models.default')}
                          </span>
                        )}
                      </span>
                      {m.description && (
                        <span style={{
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                          overflow: 'hidden', fontSize: 10, lineHeight: 1.45,
                          color: 'var(--text-muted)', marginTop: 2,
                        }}>
                          {m.description}
                        </span>
                      )}
                      {efforts && (
                        <span style={{
                          display: 'block', marginTop: 2, fontSize: 9,
                          color: 'var(--text-muted)', letterSpacing: '0.02em',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {efforts}
                        </span>
                      )}
                    </span>
                    {isActive && <span style={{ fontSize: 14, color: 'var(--accent-text)' }}>&#10003;</span>}
                  </button>
                )
              })}
            </div>
          )}

          {/* Non-Codex profiles run on the built-in Claude list shown in
              Settings → AI Engine. No probe is needed: these are the ids the
              default bridge accepts. */}
          {pickMode === 'builtin' && MODEL_OPTIONS.map(opt => {
            const isActive = opt.id === model
            const tier = getModelTier(opt.id)
            return (
              <button
                key={opt.id}
                role="option"
                aria-selected={isActive}
                onClick={() => handleModelSwitch(opt.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  textAlign: 'left',
                  background: isActive ? 'rgba(99,102,241,0.12)' : 'transparent',
                  border: 'none',
                  borderLeft: isActive ? '2px solid rgba(99,102,241,0.60)' : '2px solid transparent',
                  padding: '8px 12px 8px 22px',
                  cursor: 'pointer',
                  color: isActive ? 'var(--accent-text)' : 'var(--text-primary)',
                  borderRadius: 7,
                  transition: 'all 0.15s ease',
                  gap: 6,
                }}
                onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.borderLeftColor = 'rgba(99,102,241,0.40)' } }}
                onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderLeftColor = 'transparent' } }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{
                    display: 'block', fontWeight: 600, fontSize: 13,
                    color: isActive ? 'var(--accent-text)' : 'var(--text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {t(opt.labelKey)}
                  </span>
                  <span style={{
                    display: 'block', marginTop: 1, fontSize: 9,
                    color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {opt.id}
                  </span>
                </span>

                {tier && <span style={TIER_STYLES[tier]}>{tier.charAt(0).toUpperCase() + tier.slice(1)}</span>}
                {isActive && <span style={{ fontSize: 14, color: 'var(--accent-text)' }}>&#10003;</span>}
              </button>
            )
          })}
        </div>
        </FloatingPortal>
      )}
    </div>
  )
}

export { getModelShortName }
