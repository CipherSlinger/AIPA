import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { useI18n } from '../../i18n'
import { useUiStore } from '../../store'
import Toggle from '../ui/Toggle'
import { Trash2, RefreshCw, ChevronDown, ChevronRight, Eye, EyeOff, ExternalLink, Plus } from 'lucide-react'

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
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 7,
  padding: '7px 10px',
  color: 'rgba(255,255,255,0.82)',
  fontSize: 12,
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
}

const SCENARIO_COLORS: Record<ProviderScenario, string> = {
  official: '#818cf8',
  gateway: '#fbbf24',
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
  const [fetchingModels, setFetchingModels] = useState<string | null>(null)
  const [modelModal, setModelModal] = useState<{ providerId: string; models: string[] } | null>(null)

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

  const handleAddCustomProvider = useCallback(async () => {
    const newId = `custom-${Date.now()}`
    const newProvider: ProviderConfig = {
      id: newId,
      name: t('provider.newProviderName'),
      scenario: 'gateway',
      baseUrl: '',
      authToken: '',
      apiKey: '',
      models: [],
      enabled: false,
    }
    await window.electronAPI.providerUpsert(newProvider)
    setProviders(prev => [...prev, newProvider])
    setExpandedId(newId)
    useUiStore.getState().addToast('success', t('provider.saved'))
  }, [t])

  const handleFetchRemoteModels = useCallback(async (provider: ProviderConfig) => {
    const baseUrl = (editDraft[provider.id]?.baseUrl ?? provider.baseUrl ?? '').trim()
    if (!baseUrl) {
      useUiStore.getState().addToast('error', 'Please enter a Base URL first')
      return
    }
    setFetchingModels(provider.id)
    try {
      const apiKey = (editDraft[provider.id]?.apiKey ?? provider.apiKey ?? '').trim()
      const authToken = (editDraft[provider.id]?.authToken ?? provider.authToken ?? '').trim()
      const result = await (window.electronAPI as any).providerFetchRemoteModels({ baseUrl, apiKey, authToken })
      if (result.success && result.models.length > 0) {
        setModelModal({ providerId: provider.id, models: result.models })
      } else if (result.success) {
        useUiStore.getState().addToast('info', 'No models returned from endpoint')
      } else {
        useUiStore.getState().addToast('error', `Failed: ${result.error}`)
      }
    } catch (err) {
      useUiStore.getState().addToast('error', `Error: ${String(err)}`)
    }
    setFetchingModels(null)
  }, [editDraft])

  const updateDraft = useCallback((providerId: string, field: string, value: unknown) => {
    setEditDraft(prev => ({
      ...prev,
      [providerId]: { ...(prev[providerId] || {}), [field]: value },
    }))
  }, [])

  const getHealthDot = (providerId: string): { color: string; label: string } => {
    const health = healthMap[providerId]
    if (!health) return { color: 'rgba(255,255,255,0.3)', label: t('provider.unchecked') }
    switch (health.status) {
      case 'healthy': return { color: '#22c55e', label: t('provider.healthy') }
      case 'degraded': return { color: '#fbbf24', label: t('provider.degraded') }
      case 'down': return { color: '#fca5a5', label: t('provider.down') }
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
    const modelCount = provider.models?.length ?? 0

    // Health status chip style
    const statusStyle: React.CSSProperties = healthMap[provider.id]
      ? healthMap[provider.id].status === 'healthy'
        ? { background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', color: '#4ade80', borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 600 }
        : healthMap[provider.id].status === 'down'
          ? { background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5', borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 600 }
          : { background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.25)', color: '#fbbf24', borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 600 }
      : { color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: 600 }

    return (
      <div
        key={provider.id}
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid ' + (isExpanded ? 'rgba(99,102,241,0.30)' : 'rgba(255,255,255,0.07)'),
          borderRadius: 12,
          marginBottom: 12,
          overflow: 'hidden',
          transition: 'border-color 0.15s ease',
          boxShadow: isExpanded ? '0 4px 16px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.2)',
        }}
      >
        {/* Header row */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', cursor: 'pointer' }}
          onClick={() => setExpandedId(isExpanded ? null : provider.id)}
        >
          {isExpanded
            ? <ChevronDown size={13} style={{ color: 'rgba(255,255,255,0.38)', flexShrink: 0 }} />
            : <ChevronRight size={13} style={{ color: 'rgba(255,255,255,0.38)', flexShrink: 0 }} />
          }
          <span title={healthDot.label} style={{
            width: 7, height: 7, borderRadius: '50%',
            background: healthDot.color, flexShrink: 0, display: 'inline-block',
          }} />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.88)', lineHeight: 1.3, letterSpacing: '-0.01em' }}>
            {provider.name}
          </span>
          {modelCount > 0 && (
            <span style={{
              background: 'rgba(99,102,241,0.12)', color: '#a5b4fc',
              borderRadius: 10, padding: '2px 7px', fontSize: 10, fontWeight: 600,
            }}>
              {modelCount} models
            </span>
          )}
          {healthMap[provider.id] && (
            <span style={statusStyle}>
              {healthMap[provider.id].status}
            </span>
          )}
          {!isBuiltIn && (
            <span style={{
              fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 6,
              background: 'rgba(99,102,241,0.12)', color: '#a5b4fc',
              border: '1px solid rgba(99,102,241,0.2)',
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
          <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ height: 10 }} />

            {/* Name — editable for custom providers */}
            {!isBuiltIn && (
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)', display: 'block', marginBottom: 5 }}>
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
                <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)', display: 'block', marginBottom: 5 }}>
                  {t('provider.apiKey')}
                </label>
                <div style={{ display: 'flex', gap: 4 }}>
                  <input
                    type={showKeyMap[provider.id] ? 'text' : 'password'}
                    value={currentApiKey}
                    onChange={e => updateDraft(provider.id, 'apiKey', e.target.value)}
                    style={{ ...inputStyle, flex: 1, fontFamily: 'monospace' }}
                    placeholder="sk-..."
                  />
                  <button
                    onClick={() => setShowKeyMap(prev => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                    style={{
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 6, padding: '0 10px', cursor: 'pointer',
                      color: 'rgba(255,255,255,0.45)', display: 'flex', alignItems: 'center',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = 'rgba(255,255,255,0.75)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
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
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)', display: 'block', marginBottom: 5 }}>
                    {t('provider.authToken')}
                  </label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input
                      type={showKeyMap[`${provider.id}-token`] ? 'text' : 'password'}
                      value={currentAuthToken}
                      onChange={e => updateDraft(provider.id, 'authToken', e.target.value)}
                      style={{ ...inputStyle, flex: 1, fontFamily: 'monospace' }}
                      placeholder="Bearer ..."
                    />
                    <button
                      onClick={() => setShowKeyMap(prev => ({ ...prev, [`${provider.id}-token`]: !prev[`${provider.id}-token`] }))}
                      style={{
                        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 6, padding: '0 10px', cursor: 'pointer',
                        color: 'rgba(255,255,255,0.45)', display: 'flex', alignItems: 'center',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = 'rgba(255,255,255,0.75)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
                    >
                      {showKeyMap[`${provider.id}-token`] ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', marginTop: 4 }}>
                    {t('provider.authTokenHint')}
                  </div>
                </div>
              </>
            )}

            {/* Base URL — gateway scenario */}
            {provider.scenario === 'gateway' && (
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)', display: 'block', marginBottom: 5 }}>
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

            {/* Fetch models button — gateway scenario */}
            {provider.scenario === 'gateway' && (
              <div>
                <button
                  onClick={() => handleFetchRemoteModels(provider)}
                  disabled={fetchingModels === provider.id}
                  onMouseEnter={e => { if (fetchingModels !== provider.id) { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.35)'; e.currentTarget.style.color = '#a5b4fc' } }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '5px 12px', borderRadius: 6,
                    background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)',
                    color: 'rgba(255,255,255,0.45)', cursor: fetchingModels === provider.id ? 'wait' : 'pointer',
                    fontSize: 11, fontWeight: 500,
                    opacity: fetchingModels === provider.id ? 0.6 : 1,
                    transition: 'border-color 0.15s, color 0.15s',
                  }}
                >
                  <RefreshCw size={11} style={{ animation: fetchingModels === provider.id ? 'spin 1s linear infinite' : 'none' }} />
                  {fetchingModels === provider.id ? '获取模型中...' : '获取可用模型'}
                </button>
              </div>
            )}

            {/* Qwen QR Code quick setup */}
            {provider.id === 'qwen' && (
              <div style={{
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 8, padding: 12,
                display: 'flex', alignItems: 'center', gap: 16,
              }}>
                <Suspense fallback={<div style={{ width: 110, height: 110 }} />}>
                  <QRCodeDisplay url="https://dashscope.console.aliyun.com/apiKey" size={110} label={t('provider.qrScanLabel')} />
                </Suspense>
                <div style={{ flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.38)', lineHeight: 1.6 }}>
                  <div style={{ fontWeight: 600, color: 'rgba(255,255,255,0.75)', marginBottom: 4, fontSize: 12 }}>
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
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.35)'; e.currentTarget.style.color = '#a5b4fc' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = 'rgba(99,102,241,0.6)' }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '5px 12px', borderRadius: 6,
                    background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(255,255,255,0.10)',
                    color: 'rgba(99,102,241,0.6)', cursor: 'pointer', fontSize: 11, fontWeight: 500,
                    transition: 'border-color 0.15s, color 0.15s',
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
                onMouseEnter={e => { if (testing !== provider.id) { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.35)'; e.currentTarget.style.color = '#a5b4fc' } }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '6px 12px', borderRadius: 6,
                  background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)',
                  color: 'rgba(255,255,255,0.45)',
                  cursor: testing === provider.id ? 'wait' : 'pointer',
                  fontSize: 11, fontWeight: 500,
                  opacity: testing === provider.id ? 0.6 : 1,
                  transition: 'border-color 0.15s, color 0.15s',
                }}
              >
                <RefreshCw size={11} style={{ animation: testing === provider.id ? 'spin 1s linear infinite' : 'none' }} />
                {t('provider.testConnection')}
              </button>

              {hasDraftChanges && (
                <button
                  onClick={() => handleSaveProvider(provider.id)}
                  onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,0.95), rgba(139,92,246,0.95))'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,0.85), rgba(139,92,246,0.85))'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)' }}
                  style={{
                    padding: '6px 14px', borderRadius: 6,
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.85), rgba(139,92,246,0.85))',
                    border: 'none',
                    color: 'rgba(255,255,255,0.95)', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                    transition: 'all 0.15s ease',
                  }}
                >
                  {t('provider.save')}
                </button>
              )}

              {!isBuiltIn && (
                deleteConfirm === provider.id ? (
                  <button
                    onClick={() => handleDeleteProvider(provider.id)}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.25)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.45)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(239,68,68,0.20)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.30)'; e.currentTarget.style.boxShadow = 'none' }}
                    style={{
                      padding: '6px 12px', borderRadius: 6,
                      background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.30)',
                      color: '#fca5a5', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {t('provider.deleteConfirm')}
                  </button>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(provider.id)}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'; e.currentTarget.style.color = '#fca5a5' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = 'rgba(255,255,255,0.38)' }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '6px 10px', borderRadius: 6,
                      background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)',
                      color: 'rgba(255,255,255,0.38)', cursor: 'pointer', fontSize: 11,
                      transition: 'border-color 0.15s, color 0.15s',
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{
          width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
          background: SCENARIO_COLORS[scenario], display: 'inline-block',
        }} />
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
          textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)',
        }}>
          {t(`provider.scenario.${scenario}`)}
        </span>
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
      </div>

      {/* Scenario description */}
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', marginBottom: 10, lineHeight: 1.5, paddingLeft: 18 }}>
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
      <button
        onClick={handleAddCustomProvider}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 12px',
          marginTop: 4,
          borderRadius: 8,
          border: '1px dashed rgba(255,255,255,0.12)',
          background: 'transparent',
          color: 'rgba(255,255,255,0.38)',
          fontSize: 12,
          cursor: 'pointer',
          width: '100%',
          justifyContent: 'center',
          transition: 'border-color 0.15s, color 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)'; e.currentTarget.style.color = '#a5b4fc' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = 'rgba(255,255,255,0.38)' }}
      >
        <Plus size={13} />
        {t('provider.addCustom')}
      </button>

      {/* Model picker modal */}
      {modelModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setModelModal(null)}>
          <div style={{
            background: 'rgba(15,15,25,0.95)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 12, padding: 20, width: 400, maxHeight: '70vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.88)', marginBottom: 12 }}>
              发现 {modelModal.models.length} 个模型
            </div>
            <div style={{ flex: 1, overflow: 'auto', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {modelModal.models.map(m => (
                <div key={m} style={{
                  padding: '6px 10px', borderRadius: 6, fontSize: 12,
                  color: 'rgba(165,180,252,0.85)',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  fontFamily: 'monospace',
                }}>{m}</div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setModelModal(null)}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = 'rgba(255,255,255,0.75)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
                style={{
                  padding: '6px 14px', borderRadius: 6,
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.45)',
                  cursor: 'pointer', fontSize: 12, transition: 'all 0.15s ease',
                }}
              >
                取消
              </button>
              <button
                onClick={() => {
                  // Load models into the provider
                  const provider = providers.find(p => p.id === modelModal.providerId)
                  if (!provider) return
                  const updatedModels = modelModal.models.map(id => ({ id, name: id, provider: provider.id }))
                  const updated = { ...provider, models: updatedModels }
                  window.electronAPI.providerUpsert(updated)
                  setProviders(prev => prev.map(p => p.id === provider.id ? updated : p))
                  useUiStore.getState().addToast('success', `已加载 ${modelModal.models.length} 个模型`)
                  setModelModal(null)
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,0.95), rgba(139,92,246,0.95))'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,0.85), rgba(139,92,246,0.85))'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)' }}
                style={{
                  padding: '6px 14px', borderRadius: 6,
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.85), rgba(139,92,246,0.85))',
                  border: 'none',
                  color: 'rgba(255,255,255,0.95)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  transition: 'all 0.15s ease',
                }}
              >
                加载全部模型
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
