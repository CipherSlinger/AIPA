import React, { useState, useEffect, useCallback } from 'react'
import { useI18n } from '../../i18n'
import { useUiStore } from '../../store'
import Toggle from '../ui/Toggle'
import { Plus, Trash2, RefreshCw, ChevronDown, ChevronRight, Eye, EyeOff } from 'lucide-react'

/** Mirrors ModelProviderConfig from main/providers/types.ts */
interface ProviderConfig {
  id: string
  name: string
  type: 'claude-cli' | 'openai-compat' | 'ollama'
  baseUrl?: string
  apiKey?: string
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

const BUILT_IN_IDS = ['claude-cli', 'openai', 'ollama', 'deepseek']

export default function SettingsProviders() {
  const { t } = useI18n()
  const [providers, setProviders] = useState<ProviderConfig[]>([])
  const [healthMap, setHealthMap] = useState<Record<string, HealthStatus>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showKeyMap, setShowKeyMap] = useState<Record<string, boolean>>({})
  const [testing, setTesting] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Record<string, Partial<ProviderConfig>>>({})
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Load providers on mount
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
    } catch (err) {
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
    await window.electronAPI.providerUpsert(updated)
    setProviders(prev => prev.map(p => p.id === providerId ? updated : p))
    setEditDraft(prev => {
      const next = { ...prev }
      delete next[providerId]
      return next
    })
    useUiStore.getState().addToast('success', t('provider.saved'))
  }, [editDraft, providers, t])

  const handleDeleteProvider = useCallback(async (providerId: string) => {
    await window.electronAPI.providerRemove(providerId)
    setProviders(prev => prev.filter(p => p.id !== providerId))
    setDeleteConfirm(null)
    useUiStore.getState().addToast('success', t('provider.deleted'))
  }, [t])

  const handleAddCustom = useCallback(async () => {
    const id = `custom-${Date.now()}`
    const config: ProviderConfig = {
      id,
      name: 'New Provider',
      type: 'openai-compat',
      baseUrl: '',
      apiKey: '',
      models: [],
      enabled: false,
      failoverPriority: 10,
    }
    await window.electronAPI.providerUpsert(config)
    setProviders(prev => [...prev, config])
    setExpandedId(id)
  }, [])

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

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        {t('provider.title')}
      </div>

      {providers.map(provider => {
        const isExpanded = expandedId === provider.id
        const isBuiltIn = BUILT_IN_IDS.includes(provider.id)
        const healthDot = getHealthDot(provider.id)
        const draft = editDraft[provider.id] || {}
        const currentName = (draft.name ?? provider.name)
        const currentBaseUrl = (draft.baseUrl ?? provider.baseUrl ?? '')
        const currentApiKey = (draft.apiKey ?? provider.apiKey ?? '')
        const currentPriority = (draft.failoverPriority ?? provider.failoverPriority ?? 99)
        const hasDraftChanges = Object.keys(draft).length > 0

        return (
          <div
            key={provider.id}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 8,
              marginBottom: 8,
              overflow: 'hidden',
              background: isExpanded ? 'var(--card-bg)' : 'transparent',
              transition: 'background 0.15s',
            }}
          >
            {/* Header row */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                cursor: 'pointer',
              }}
              onClick={() => setExpandedId(isExpanded ? null : provider.id)}
            >
              {isExpanded
                ? <ChevronDown size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                : <ChevronRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              }

              {/* Health dot */}
              <span
                title={healthDot.label}
                style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: healthDot.color, flexShrink: 0,
                  display: 'inline-block',
                }}
              />

              {/* Name */}
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                {provider.name}
              </span>

              {/* Type badge */}
              <span style={{
                fontSize: 9, fontWeight: 500,
                padding: '1px 6px', borderRadius: 4,
                background: 'rgba(var(--accent-rgb, 0,122,204), 0.12)',
                color: 'var(--accent)',
              }}>
                {isBuiltIn ? t('provider.builtIn') : t('provider.custom')}
              </span>

              {/* Toggle */}
              <div onClick={e => e.stopPropagation()}>
                <Toggle
                  value={provider.enabled}
                  onChange={() => handleToggleEnabled(provider)}
                  aria-label={t('provider.enabled')}
                />
              </div>
            </div>

            {/* Expanded config */}
            {isExpanded && (
              <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Name */}
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>
                    {t('provider.title')}
                  </label>
                  <input
                    type="text"
                    value={currentName}
                    onChange={e => updateDraft(provider.id, 'name', e.target.value)}
                    style={inputStyle}
                    disabled={provider.id === 'claude-cli'}
                  />
                </div>

                {/* Base URL (not for claude-cli) */}
                {provider.type !== 'claude-cli' && (
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>
                      {t('provider.baseUrl')}
                    </label>
                    <input
                      type="text"
                      value={currentBaseUrl}
                      onChange={e => updateDraft(provider.id, 'baseUrl', e.target.value)}
                      style={inputStyle}
                      placeholder="https://api.openai.com/v1"
                    />
                  </div>
                )}

                {/* API Key (not for claude-cli or ollama) */}
                {provider.type !== 'claude-cli' && provider.type !== 'ollama' && (
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
                          background: 'var(--card-bg)',
                          border: '1px solid var(--border)',
                          borderRadius: 4,
                          padding: '0 8px',
                          cursor: 'pointer',
                          color: 'var(--text-muted)',
                          display: 'flex', alignItems: 'center',
                        }}
                        title={showKeyMap[provider.id] ? 'Hide' : 'Show'}
                      >
                        {showKeyMap[provider.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                )}

                {/* Failover Priority */}
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>
                    {t('provider.failoverPriority')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={currentPriority}
                    onChange={e => updateDraft(provider.id, 'failoverPriority', parseInt(e.target.value) || 0)}
                    style={{ ...inputStyle, width: 80 }}
                  />
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 8 }}>
                    (0 = highest)
                  </span>
                </div>

                {/* Models list */}
                {provider.models.length > 0 && (
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>
                      Models ({provider.models.length})
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {provider.models.map(m => (
                        <span key={m.id} style={{
                          fontSize: 10, padding: '2px 6px', borderRadius: 4,
                          background: 'var(--bg-hover)', color: 'var(--text-primary)',
                        }}>
                          {m.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  {/* Test Connection */}
                  {provider.type !== 'claude-cli' && (
                    <button
                      onClick={() => handleTestConnection(provider.id)}
                      disabled={testing === provider.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '5px 10px', borderRadius: 6,
                        background: 'var(--card-bg)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-primary)',
                        cursor: testing === provider.id ? 'wait' : 'pointer',
                        fontSize: 11, opacity: testing === provider.id ? 0.6 : 1,
                      }}
                    >
                      <RefreshCw size={12} style={{ animation: testing === provider.id ? 'spin 1s linear infinite' : 'none' }} />
                      {t('provider.testConnection')}
                    </button>
                  )}

                  {/* Save (if draft has changes) */}
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

                  {/* Delete (only for custom providers) */}
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
                          background: 'var(--card-bg)',
                          border: '1px solid var(--border)',
                          color: 'var(--error, #ef4444)',
                          cursor: 'pointer', fontSize: 11,
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Add Custom Provider */}
      <button
        onClick={handleAddCustom}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          width: '100%', padding: '10px 12px',
          background: 'none',
          border: '1px dashed var(--border)',
          borderRadius: 8,
          color: 'var(--text-muted)',
          cursor: 'pointer',
          fontSize: 12,
          transition: 'border-color 0.15s, color 0.15s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = 'var(--accent)'
          e.currentTarget.style.color = 'var(--accent)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = 'var(--border)'
          e.currentTarget.style.color = 'var(--text-muted)'
        }}
      >
        <Plus size={14} />
        {t('provider.addCustom')}
      </button>
    </div>
  )
}
