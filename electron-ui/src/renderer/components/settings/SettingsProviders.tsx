import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { useI18n } from '../../i18n'
import { useUiStore } from '../../store'
import Toggle from '../ui/Toggle'
import { Trash2, RefreshCw, ChevronDown, ChevronRight, Eye, EyeOff, ExternalLink } from 'lucide-react'

const QRCodeDisplay = lazy(() => import('../ui/QRCodeDisplay'))

type ProviderScenario = 'official' | 'gateway'

interface ProviderConfig {
  id: string
  name: string
  scenario: ProviderScenario
  baseUrl?: string
  apiKey?: string
  authToken?: string
  model?: string
  models: { id: string; name: string; provider: string }[]
  enabled: boolean
  isDefault?: boolean
  failoverPriority?: number
}

interface HealthStatus {
  providerId: string
  status: 'healthy' | 'degraded' | 'down'
  lastCheck: number
  lastError?: string
}

const BUILT_IN_IDS = ['claude-cli', 'gateway', 'openai', 'ollama', 'deepseek', 'qwen']

const PROVIDER_KEY_LINKS: Record<string, string> = {
  'claude-cli': 'https://console.anthropic.com/settings/keys',
  'openai': 'https://platform.openai.com/api-keys',
  'deepseek': 'https://platform.deepseek.com/api_keys',
  'qwen': 'https://dashscope.console.aliyun.com/apiKey',
  'ollama': 'https://ollama.ai/download',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '6px 10px',
  color: 'var(--text-primary)',
  fontSize: 12,
  outline: 'none',
  boxSizing: 'border-box',
}

const SCENARIO_COLORS: Record<ProviderScenario, string> = {
  official: '#3b82f6',
  gateway: '#f59e0b',
}

export default function SettingsProviders() {
  const { t } = useI18n()
  const [providers, setProviders] = useState<ProviderConfig[]>([])
  const [healthMap, setHealthMap] = useState<Record<string, HealthStatus>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showKeyMap, setShowKeyMap] = useState<Record<string, boolean>>({})
  const [testing, setTesting] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Record<string, Partial<ProviderConfig>>>({})
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  useEffect(() => {
    window.electronAPI.providerListConfigs().then((configs: ProviderConfig[]) => {
      setProviders(configs)
    })
    window.electronAPI.providerHealthStatuses().then((statuses: HealthStatus[]) => {
      const map: Record<string, HealthStatus> = {}
      for (const s of statuses) map[s.providerId] = s
      setHealthMap(map)
    })
  }, [])

  const handleToggleEnabled = useCallback(async (provider: ProviderConfig) => {
    const updated = { ...provider, enabled: !provider.enabled }
    await window.electronAPI.providerUpsert(updated)
    setProviders(prev => prev.map(p => p.id === provider.id ? updated : p))
    useUiStore.getState().addToast('success', t('provider.saved'))
  }, [t])

  const handleTestConnection = useCallback(async (providerId: string) => {
    setTesting(providerId)
    try {
      const results: HealthStatus[] = await window.electronAPI.providerHealthCheck()
      const map: Record<string, HealthStatus> = {}
      for (const s of results) map[s.providerId] = s
      setHealthMap(map)
      const result = map[providerId]
      if (result?.status === 'healthy') {
        useUiStore.getState().addToast('success', t('provider.connectionOk'))
      } else {
        useUiStore.getState().addToast('error', `${t('provider.connectionFailed')}: ${result?.lastError || 'Unknown'}`)
      }
    } catch {
      useUiStore.getState().addToast('error', t('provider.connectionFailed'))
    }
    setTesting(null)
  }, [t])

  const handleSaveProvider = useCallback(async (providerId: string) => {
    const draft = editDraft[providerId]
    if (!draft) return
    const current = providers.find(p => p.id === providerId)
    if (!current) return
    const updated = { ...current, ...draft }
    // Auto-enable when credential is set for the first time
    const hasCredential = (draft.apiKey && draft.apiKey.trim()) || (draft.authToken && draft.authToken.trim())
    if (hasCredential && !current.enabled) {
      updated.enabled = true
    }
    await window.electronAPI.providerUpsert(updated)
    setProviders(prev => prev.map(p => p.id === providerId ? updated : p))
    setEditDraft(prev => {
      const next = { ...prev }
      delete next[providerId]
      return next
    })
    useUiStore.getState().addToast('success', t('provider.saved'))
    if (updated.enabled && hasCredential) {
      handleTestConnection(providerId)
    }
  }, [editDraft, providers, t, handleTestConnection])

  const handleDeleteProvider = useCallback(async (providerId: string) => {
    await window.electronAPI.providerRemove(providerId)
    setProviders(prev => prev.filter(p => p.id !== providerId))
    setDeleteConfirm(null)
    useUiStore.getState().addToast('success', t('provider.deleted'))
  }, [t])

  const updateDraft = useCallback((providerId: string, field: string, value: unknown) => {
    setEditDraft(prev => ({
      ...prev,
      [providerId]: { ...(prev[providerId] || {}), [field]: value },
    }))
  }, [])

  const getHealthDot = (providerId: string): { color: string; label: string } => {
    const health = healthMap[providerId]
    if (!health) return { color: 'var(--text-muted)', label: t('provider.unchecked') }
    switch (health.status) {
      case 'healthy': return { color: '#22c55e', label: t('provider.healthy') }
      case 'degraded': return { color: '#f59e0b', label: t('provider.degraded') }
      case 'down': return { color: '#ef4444', label: t('provider.down') }
    }
  }

  // Provider card — shared between all scenarios
  const renderProviderCard = (provider: ProviderConfig) => {
    const isExpanded = expandedId === provider.id
    const isBuiltIn = BUILT_IN_IDS.includes(provider.id)
    const healthDot = getHealthDot(provider.id)
    const draft = editDraft[provider.id] || {}
    const currentName = draft.name ?? provider.name
    const currentBaseUrl = draft.baseUrl ?? provider.baseUrl ?? ''
    const currentApiKey = draft.apiKey ?? provider.apiKey ?? ''
    const currentAuthToken = draft.authToken ?? provider.authToken ?? ''
    const hasDraftChanges = Object.keys(draft).length > 0

    return (
      <div
        key={provider.id}
        style={{
          border: '1px solid var(--border)',
          borderRadius: 8,
          marginBottom: 6,
          overflow: 'hidden',
          background: isExpanded ? 'var(--card-bg)' : 'transparent',
          transition: 'background 0.15s',
        }}
      >
        {/* Header row */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', cursor: 'pointer' }}
          onClick={() => setExpandedId(isExpanded ? null : provider.id)}
        >
          {isExpanded
            ? <ChevronDown size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            : <ChevronRight size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          }
          <span title={healthDot.label} style={{
            width: 7, height: 7, borderRadius: '50%',
            background: healthDot.color, flexShrink: 0, display: 'inline-block',
          }} />
          <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
            {provider.name}
          </span>
          {!isBuiltIn && (
            <span style={{
              fontSize: 9, fontWeight: 500, padding: '1px 5px', borderRadius: 4,
              background: 'rgba(var(--accent-rgb, 0,122,204), 0.12)', color: 'var(--accent)',
            }}>
              {t('provider.custom')}
            </span>
          )}
          <div onClick={e => e.stopPropagation()}>
            <Toggle value={provider.enabled} onChange={() => handleToggleEnabled(provider)} aria-label={t('provider.enabled')} />
          </div>
        </div>

        {/* Expanded config */}
        {isExpanded && (
          <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Name — editable for custom providers */}
            {!isBuiltIn && (
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>
                  {t('provider.title')}
                </label>
                <input
                  type="text"
                  value={currentName}
                  onChange={e => updateDraft(provider.id, 'name', e.target.value)}
                  style={inputStyle}
                />
              </div>
            )}

            {/* API Key — official scenario */}
            {provider.scenario === 'official' && (
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>
                  {t('provider.apiKey')}
                </label>
                <div style={{ display: 'flex', gap: 4 }}>
                  <input
                    type={showKeyMap[provider.id] ? 'text' : 'password'}
                    value={currentApiKey}
                    onChange={e => updateDraft(provider.id, 'apiKey', e.target.value)}
                    style={{ ...inputStyle, flex: 1 }}
                    placeholder="sk-..."
                  />
                  <button
                    onClick={() => setShowKeyMap(prev => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                    style={{
                      background: 'var(--card-bg)', border: '1px solid var(--border)',
                      borderRadius: 4, padding: '0 8px', cursor: 'pointer',
                      color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
                    }}
                    title={showKeyMap[provider.id] ? 'Hide' : 'Show'}
                  >
                    {showKeyMap[provider.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>
            )}

            {/* Auth Token — gateway scenario */}
            {provider.scenario === 'gateway' && (
              <>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>
                    {t('provider.authToken')}
                  </label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input
                      type={showKeyMap[`${provider.id}-token`] ? 'text' : 'password'}
                      value={currentAuthToken}
                      onChange={e => updateDraft(provider.id, 'authToken', e.target.value)}
                      style={{ ...inputStyle, flex: 1 }}
                      placeholder="Bearer ..."
                    />
                    <button
                      onClick={() => setShowKeyMap(prev => ({ ...prev, [`${provider.id}-token`]: !prev[`${provider.id}-token`] }))}
                      style={{
                        background: 'var(--card-bg)', border: '1px solid var(--border)',
                        borderRadius: 4, padding: '0 8px', cursor: 'pointer',
                        color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
                      }}
                    >
                      {showKeyMap[`${provider.id}-token`] ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                    {t('provider.authTokenHint')}
                  </div>
                </div>
              </>
            )}

            {/* Base URL — gateway scenario */}
            {provider.scenario === 'gateway' && (
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>
                  {t('provider.baseUrl')}
                </label>
                <input
                  type="text"
                  value={currentBaseUrl}
                  onChange={e => updateDraft(provider.id, 'baseUrl', e.target.value)}
                  style={inputStyle}
                  placeholder="https://..."
                />
              </div>
            )}

            {/* Qwen QR Code quick setup */}
            {provider.id === 'qwen' && (
              <div style={{
                background: 'var(--bg-hover)', borderRadius: 8, padding: 12,
                display: 'flex', alignItems: 'center', gap: 16,
              }}>
                <Suspense fallback={<div style={{ width: 110, height: 110 }} />}>
                  <QRCodeDisplay url="https://dashscope.console.aliyun.com/apiKey" size={110} label={t('provider.qrScanLabel')} />
                </Suspense>
                <div style={{ flex: 1, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4, fontSize: 12 }}>
                    {t('provider.qwenQuickSetup')}
                  </div>
                  {t('provider.qwenQuickSetupDesc')}
                </div>
              </div>
            )}

            {/* Get API Key link */}
            {isBuiltIn && PROVIDER_KEY_LINKS[provider.id] && (
              <div>
                <button
                  onClick={() => window.electronAPI.shellOpenExternal(PROVIDER_KEY_LINKS[provider.id])}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '4px 10px', borderRadius: 6,
                    background: 'none', border: '1px solid var(--border)',
                    color: 'var(--accent)', cursor: 'pointer', fontSize: 11,
                  }}
                >
                  <ExternalLink size={11} />
                  {t('provider.getApiKey')}
                </button>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
              <button
                onClick={() => handleTestConnection(provider.id)}
                disabled={testing === provider.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '5px 10px', borderRadius: 6,
                  background: 'var(--card-bg)', border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  cursor: testing === provider.id ? 'wait' : 'pointer',
                  fontSize: 11, opacity: testing === provider.id ? 0.6 : 1,
                }}
              >
                <RefreshCw size={11} style={{ animation: testing === provider.id ? 'spin 1s linear infinite' : 'none' }} />
                {t('provider.testConnection')}
              </button>

              {hasDraftChanges && (
                <button
                  onClick={() => handleSaveProvider(provider.id)}
                  style={{
                    padding: '5px 10px', borderRadius: 6,
                    background: 'var(--accent)', border: 'none',
                    color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 500,
                  }}
                >
                  {t('provider.save')}
                </button>
              )}

              {!isBuiltIn && (
                deleteConfirm === provider.id ? (
                  <button
                    onClick={() => handleDeleteProvider(provider.id)}
                    style={{
                      padding: '5px 10px', borderRadius: 6,
                      background: 'var(--error, #ef4444)', border: 'none',
                      color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 500,
                    }}
                  >
                    {t('provider.deleteConfirm')}
                  </button>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(provider.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '5px 10px', borderRadius: 6,
                      background: 'var(--card-bg)', border: '1px solid var(--border)',
                      color: 'var(--error, #ef4444)', cursor: 'pointer', fontSize: 11,
                    }}
                  >
                    <Trash2 size={11} />
                  </button>
                )
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  const officialProviders = providers.filter(p => p.scenario === 'official')
  const gatewayProviders = providers.filter(p => p.scenario === 'gateway')

  const renderScenarioSection = (
    scenario: ProviderScenario,
    items: ProviderConfig[],
  ) => (
    <div style={{ marginBottom: 16 }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{
          width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
          background: SCENARIO_COLORS[scenario], display: 'inline-block',
        }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
          {t(`provider.scenario.${scenario}`)}
        </span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>

      {/* Scenario description */}
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.5, paddingLeft: 18 }}>
        {t(`provider.scenarioHint.${scenario}`)}
      </div>

      {/* Provider cards */}
      {items.map(renderProviderCard)}
    </div>
  )

  return (
    <div>
      {renderScenarioSection('official', officialProviders)}
      {renderScenarioSection('gateway', gatewayProviders)}
    </div>
  )
}
