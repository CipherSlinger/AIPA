import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { ChevronDown, Settings } from 'lucide-react'
import { usePrefsStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import { useClickOutside } from '../../hooks/useClickOutside'
import { MODEL_OPTIONS } from '../settings/settingsConstants'

interface ModelPickerProps {
  model: string | undefined
}

interface ModelInfo {
  id: string
  name: string
  provider: string
  capabilities?: {
    vision?: boolean
    code?: boolean
    reasoning?: boolean
  }
}

interface ProviderGroup {
  providerId: string
  providerName: string
  healthStatus?: 'healthy' | 'degraded' | 'down'
  models: ModelInfo[]
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

const HEALTH_DOT_COLORS: Record<string, string> = {
  healthy: '#22c55e',
  degraded: '#f59e0b',
  down: '#ef4444',
}

const CAPABILITY_COLORS: Record<string, string> = {
  vision: '#8b5cf6',
  code: '#3b82f6',
  reasoning: '#f59e0b',
}

export default function ModelPicker({ model }: ModelPickerProps) {
  const t = useT()
  const [showPicker, setShowPicker] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const [providerGroups, setProviderGroups] = useState<ProviderGroup[]>([])
  const [loadFailed, setLoadFailed] = useState(false)

  useClickOutside(pickerRef, showPicker, useCallback(() => setShowPicker(false), []))

  // Load multi-provider models when dropdown opens
  useEffect(() => {
    if (!showPicker) return
    let cancelled = false

    const loadProviderModels = async () => {
      try {
        const [configs, models, healthStatuses] = await Promise.all([
          window.electronAPI.providerListConfigs(),
          window.electronAPI.providerListModels(),
          window.electronAPI.providerHealthStatuses(),
        ])

        if (cancelled) return

        // Build health map
        const healthMap: Record<string, string> = {}
        for (const s of healthStatuses as { providerId: string; status: string }[]) {
          healthMap[s.providerId] = s.status
        }

        // Group models by provider
        const groups: ProviderGroup[] = []
        const configMap = new Map<string, { name: string; id: string }>()
        for (const c of configs as { id: string; name: string; enabled: boolean }[]) {
          if (c.enabled) configMap.set(c.id, c)
        }

        const modelsByProvider = new Map<string, ModelInfo[]>()
        for (const m of models as ModelInfo[]) {
          const providerId = m.provider
          if (!modelsByProvider.has(providerId)) {
            modelsByProvider.set(providerId, [])
          }
          modelsByProvider.get(providerId)!.push(m)
        }

        for (const [providerId, providerModels] of modelsByProvider) {
          const cfg = configMap.get(providerId)
          groups.push({
            providerId,
            providerName: cfg?.name || providerId,
            healthStatus: healthMap[providerId] as ProviderGroup['healthStatus'],
            models: providerModels,
          })
        }

        setProviderGroups(groups)
        setLoadFailed(false)
      } catch {
        setLoadFailed(true)
      }
    }

    loadProviderModels()
    return () => { cancelled = true }
  }, [showPicker])

  const handleModelSwitch = useCallback((modelId: string) => {
    usePrefsStore.getState().setPrefs({ model: modelId })
    window.electronAPI.prefsSet('model', modelId)
    setShowPicker(false)
    const shortName = getModelShortName(modelId)
    useUiStore.getState().addToast('success', t('chat.modelSwitched', { model: shortName }))
  }, [t])

  const handleManageProviders = useCallback(() => {
    setShowPicker(false)
    useUiStore.getState().setActiveNavItem('settings')
  }, [])

  // Fallback: use Claude-only MODEL_OPTIONS if multi-provider load fails
  const fallbackGroups = useMemo<ProviderGroup[]>(() => [{
    providerId: 'claude-cli',
    providerName: 'Claude (CLI)',
    models: MODEL_OPTIONS.map(opt => ({
      id: opt.id,
      name: opt.id,
      provider: 'claude-cli',
      capabilities: { vision: true, code: true, reasoning: true },
    })),
  }], [])

  const displayGroups = loadFailed || providerGroups.length === 0 ? fallbackGroups : providerGroups

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
            width: 260,
            maxHeight: 400,
            overflowY: 'auto',
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

          {displayGroups.map(group => (
            <div key={group.providerId}>
              {/* Provider section header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px 3px', fontSize: 10, fontWeight: 600,
                color: 'var(--text-muted)',
              }}>
                {/* Health dot */}
                {group.healthStatus && (
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: HEALTH_DOT_COLORS[group.healthStatus] || 'var(--text-muted)',
                    flexShrink: 0,
                  }} />
                )}
                <span>{group.providerName}</span>
              </div>

              {/* Models in this provider */}
              {group.models.map(m => {
                const isActive = m.id === model
                return (
                  <button
                    key={m.id}
                    role="option"
                    aria-selected={isActive}
                    onClick={() => handleModelSwitch(m.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      width: '100%',
                      textAlign: 'left',
                      background: isActive ? 'rgba(var(--accent-rgb, 0, 122, 204), 0.12)' : 'none',
                      border: 'none',
                      padding: '6px 12px 6px 24px',
                      cursor: 'pointer',
                      color: isActive ? 'var(--accent)' : 'var(--text-primary)',
                      fontSize: 12,
                      fontWeight: isActive ? 600 : 400,
                      transition: 'background 100ms',
                      gap: 6,
                    }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--popup-item-hover)' }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'none' }}
                  >
                    <span style={{ flex: 1 }}>{m.name}</span>

                    {/* Capability tags */}
                    <span style={{ display: 'flex', gap: 3 }}>
                      {m.capabilities?.vision && (
                        <span style={{ fontSize: 8, padding: '0 4px', borderRadius: 3, background: `${CAPABILITY_COLORS.vision}22`, color: CAPABILITY_COLORS.vision, fontWeight: 600 }}>
                          {t('provider.capabilities.vision')}
                        </span>
                      )}
                      {m.capabilities?.code && (
                        <span style={{ fontSize: 8, padding: '0 4px', borderRadius: 3, background: `${CAPABILITY_COLORS.code}22`, color: CAPABILITY_COLORS.code, fontWeight: 600 }}>
                          {t('provider.capabilities.code')}
                        </span>
                      )}
                      {m.capabilities?.reasoning && (
                        <span style={{ fontSize: 8, padding: '0 4px', borderRadius: 3, background: `${CAPABILITY_COLORS.reasoning}22`, color: CAPABILITY_COLORS.reasoning, fontWeight: 600 }}>
                          {t('provider.capabilities.reasoning')}
                        </span>
                      )}
                    </span>

                    {isActive && <span style={{ fontSize: 14 }}>&#10003;</span>}
                  </button>
                )
              })}
            </div>
          ))}

          {/* Manage Providers link */}
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 2 }}>
            <button
              onClick={handleManageProviders}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                width: '100%', textAlign: 'left',
                padding: '7px 12px',
                background: 'none', border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer', fontSize: 11,
                transition: 'color 100ms, background 100ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--popup-item-hover)'
                e.currentTarget.style.color = 'var(--accent)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none'
                e.currentTarget.style.color = 'var(--text-muted)'
              }}
            >
              <Settings size={12} />
              {t('provider.manageProviders')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export { getModelShortName }
