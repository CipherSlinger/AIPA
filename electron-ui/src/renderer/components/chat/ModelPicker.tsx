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
  degraded: '#fbbf24',
  down: '#f87171',
}

const CAPABILITY_COLORS: Record<string, string> = {
  vision: '#a78bfa',
  code: '#6366f1',
  reasoning: '#fbbf24',
}

type ModelTier = 'haiku' | 'sonnet' | 'opus'

const TIER_STYLES: Record<ModelTier, React.CSSProperties> = {
  haiku:  { background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 8, padding: '1px 5px', fontSize: 9, fontWeight: 700 },
  sonnet: { background: 'rgba(99,102,241,0.14)',  color: '#818cf8', border: '1px solid rgba(99,102,241,0.25)',  borderRadius: 8, padding: '1px 5px', fontSize: 9, fontWeight: 700 },
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
          background: showPicker ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.06)',
          border: `1px solid ${showPicker ? 'rgba(99,102,241,0.40)' : 'var(--glass-border-md)'}`,
          borderRadius: 8,
          padding: '2px 8px',
          cursor: 'pointer',
          color: showPicker ? '#818cf8' : 'var(--text-secondary)',
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
            e.currentTarget.style.background = 'var(--glass-border-md)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
          }
        }}
        onMouseLeave={(e) => {
          if (!showPicker) {
            e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
            e.currentTarget.style.borderColor = 'var(--glass-border-md)'
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
            background: 'var(--glass-bg-high)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid var(--glass-border-md)',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
            padding: '4px 0',
            marginTop: 4,
            animation: 'slideUp 0.15s ease-out',
          }}
        >
          <div style={{ padding: '8px 12px 2px', fontSize: 10, color: 'var(--text-faint)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid var(--glass-border)', paddingBottom: 6, marginBottom: 2 }}>
            {t('chat.switchModel')}
          </div>

          {displayGroups.map((group, groupIdx) => (
            <div key={group.providerId}>
              {/* Provider section header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 12px 2px', fontSize: 10, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.07em',
                color: 'var(--text-faint)',
              }}>
                {/* Health dot */}
                {group.healthStatus && (
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: HEALTH_DOT_COLORS[group.healthStatus] || 'var(--text-faint)',
                    flexShrink: 0,
                  }} />
                )}
                <span>{group.providerName}</span>
              </div>

              {/* Models in this provider */}
              {group.models.map(m => {
                const isActive = m.id === model
                const tier = getModelTier(m.id)
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
                      background: isActive ? 'rgba(99,102,241,0.12)' : 'transparent',
                      border: 'none',
                      borderLeft: isActive ? '2px solid rgba(99,102,241,0.60)' : '2px solid transparent',
                      padding: '8px 12px 8px 22px',
                      cursor: 'pointer',
                      color: isActive ? '#818cf8' : 'var(--text-primary)',
                      fontSize: 13,
                      fontWeight: 600,
                      borderRadius: 7,
                      transition: 'all 0.15s ease',
                      gap: 6,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                    onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderLeftColor = 'rgba(99,102,241,0.40)' } }}
                    onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderLeftColor = 'transparent' } }}
                  >
                    <span style={{ flex: 1, fontWeight: 600, fontSize: 13, color: isActive ? '#818cf8' : 'var(--text-primary)' }}>{m.name}</span>

                    {/* Tier badge */}
                    {tier && <span style={TIER_STYLES[tier]}>{tier.charAt(0).toUpperCase() + tier.slice(1)}</span>}

                    {/* Capability tags */}
                    <span style={{ display: 'flex', gap: 3 }}>
                      {m.capabilities?.vision && (
                        <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 8, background: 'var(--glass-border)', color: 'var(--text-muted)', fontWeight: 600 }}>
                          {t('provider.capabilities.vision')}
                        </span>
                      )}
                      {m.capabilities?.code && (
                        <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 8, background: 'var(--glass-border)', color: 'var(--text-muted)', fontWeight: 600 }}>
                          {t('provider.capabilities.code')}
                        </span>
                      )}
                      {m.capabilities?.reasoning && (
                        <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 8, background: 'rgba(99,102,241,0.14)', color: '#818cf8', fontWeight: 700 }}>
                          {t('provider.capabilities.reasoning')}
                        </span>
                      )}
                    </span>

                    {isActive && <span style={{ fontSize: 14, color: '#818cf8' }}>&#10003;</span>}
                  </button>
                )
              })}

              {/* Separator between provider groups */}
              {groupIdx < displayGroups.length - 1 && (
                <div style={{ height: 1, background: 'var(--glass-border)', margin: '4px 0' }} />
              )}
            </div>
          ))}

          {/* Manage Providers link */}
          <div style={{ borderTop: '1px solid var(--glass-border)', marginTop: 4, paddingTop: 2 }}>
            <button
              onClick={handleManageProviders}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                width: '100%', textAlign: 'left',
                padding: '7px 12px',
                background: 'transparent', border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer', fontSize: 11,
                borderRadius: 7,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                e.currentTarget.style.color = 'rgba(255,255,255,0.80)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
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
