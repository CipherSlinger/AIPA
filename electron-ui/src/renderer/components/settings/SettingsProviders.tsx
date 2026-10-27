// Settings → AI Engine → Providers.
//
// A scannable list, one row per provider, grouped by scenario. Every editable
// field lives in ProviderEditDrawer, which opens when a row is clicked — the
// row itself never expands, so the list stays readable no matter how many
// providers are configured.

import React, { useState, useEffect, useCallback } from 'react'
import { useI18n } from '../../i18n'
import { useUiStore } from '../../store'
import Toggle from '../ui/Toggle'
import { pushEscapeHandler } from '../ui/escapeStack'
import ProviderEditDrawer from './ProviderEditDrawer'
import { Plus, RefreshCw, ChevronRight } from 'lucide-react'
import {
  BUILT_IN_IDS,
  SCENARIO_COLORS,
  type ProviderConfig,
  type ProviderHealthStatus,
  type ProviderScenario,
} from './settingsConstants'

export default function SettingsProviders() {
  const { t } = useI18n()
  const [providers, setProviders] = useState<ProviderConfig[]>([])
  const [healthMap, setHealthMap] = useState<Record<string, ProviderHealthStatus>>({})
  const [activeId, setActiveId] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [modelModal, setModelModal] = useState<{ providerId: string; models: string[] } | null>(null)

  const loadConfigs = useCallback(() => {
    window.electronAPI.providerListConfigs().then((configs: ProviderConfig[]) => {
      setProviders(configs)
    })
    window.electronAPI.providerHealthStatuses().then((statuses: ProviderHealthStatus[]) => {
      const map: Record<string, ProviderHealthStatus> = {}
      for (const s of statuses) map[s.providerId] = s
      setHealthMap(map)
    })
  }, [])

  useEffect(() => {
    loadConfigs()
    // Re-fetch when onboarding completes (in case this component was already mounted)
    const handler = () => loadConfigs()
    window.addEventListener('aipa:providerUpdated', handler)
    return () => window.removeEventListener('aipa:providerUpdated', handler)
  }, [loadConfigs])

  const handleToggleEnabled = useCallback(async (provider: ProviderConfig) => {
    const updated = { ...provider, enabled: !provider.enabled }
    await window.electronAPI.providerUpsert(updated)
    setProviders(prev => prev.map(p => p.id === provider.id ? updated : p))
    useUiStore.getState().addToast('success', t('provider.saved'))
  }, [t])

  const handleTestConnection = useCallback(async (providerId: string) => {
    setTesting(providerId)
    try {
      const results: ProviderHealthStatus[] = await window.electronAPI.providerHealthCheck()
      const map: Record<string, ProviderHealthStatus> = {}
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

  // The drawer owns the toast; the list just takes the new object. Re-read from
  // the main process rather than keeping the drawer's copy: that copy still
  // holds whatever the user just typed (including a credential), while the
  // authoritative version is redacted and carries hasApiKey/hasAuthToken.
  const handleSaved = useCallback((updated: ProviderConfig) => {
    setProviders(prev => prev.map(p => p.id === updated.id ? updated : p))
    loadConfigs()
  }, [loadConfigs])

  const handleDeleted = useCallback((providerId: string) => {
    setProviders(prev => prev.filter(p => p.id !== providerId))
    setActiveId(null)
  }, [])

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
    setActiveId(newId)
    useUiStore.getState().addToast('success', t('provider.saved'))
  }, [t])

  const closeDrawer = useCallback(() => setActiveId(null), [])
  const handleOpenModelPicker = useCallback((providerId: string, models: string[]) => {
    setModelModal({ providerId, models })
  }, [])

  // Escape closes the picker first, then the drawer, then the settings modal.
  useEffect(() => {
    if (!modelModal) return
    return pushEscapeHandler(() => setModelModal(null))
  }, [modelModal])

  const getHealthDot = (providerId: string): { color: string; label: string } => {
    const health = healthMap[providerId]
    if (!health) return { color: 'var(--text-muted)', label: t('provider.unchecked') }
    switch (health.status) {
      case 'healthy': return { color: '#22c55e', label: t('provider.healthy') }
      case 'degraded': return { color: '#fbbf24', label: t('provider.degraded') }
      case 'down': return { color: '#fca5a5', label: t('provider.down') }
    }
  }

  const renderProviderRow = (provider: ProviderConfig) => {
    const isBuiltIn = BUILT_IN_IDS.includes(provider.id)
    const healthDot = getHealthDot(provider.id)
    const modelCount = provider.models?.length ?? 0

    const openDrawer = () => setActiveId(provider.id)

    return (
      <div
        key={provider.id}
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-label={provider.name}
        onClick={openDrawer}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            openDrawer()
          }
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.30)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '9px 12px',
          marginBottom: 6,
          borderRadius: 10,
          border: '1px solid var(--border)',
          background: 'var(--glass-bg-low)',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
      >
        <span title={healthDot.label} style={{
          width: 7, height: 7, borderRadius: '50%',
          background: healthDot.color, flexShrink: 0, display: 'inline-block',
        }} />

        <span style={{
          flex: 1, minWidth: 0,
          fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {provider.name}
        </span>

        {modelCount > 0 && (
          <span style={{
            background: 'rgba(99,102,241,0.12)', color: '#a5b4fc',
            borderRadius: 10, padding: '2px 7px', fontSize: 10, fontWeight: 600, flexShrink: 0,
          }}>
            {t('provider.modelCount', { count: modelCount })}
          </span>
        )}

        {!isBuiltIn && (
          <span style={{
            fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 6, flexShrink: 0,
            background: 'rgba(99,102,241,0.12)', color: '#a5b4fc',
            border: '1px solid rgba(99,102,241,0.2)',
          }}>
            {t('provider.custom')}
          </span>
        )}

        <button
          onClick={e => { e.stopPropagation(); handleTestConnection(provider.id) }}
          disabled={testing === provider.id}
          aria-label={t('provider.testConnection')}
          title={t('provider.testConnection')}
          onMouseEnter={e => { if (testing !== provider.id) { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.35)'; e.currentTarget.style.color = '#a5b4fc' } }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 26, height: 24, borderRadius: 6, flexShrink: 0,
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text-muted)',
            cursor: testing === provider.id ? 'wait' : 'pointer',
            opacity: testing === provider.id ? 0.6 : 1,
            transition: 'all 0.15s ease',
          }}
        >
          <RefreshCw size={11} style={{ animation: testing === provider.id ? 'spin 1s linear infinite' : 'none' }} />
        </button>

        <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}>
          <Toggle value={provider.enabled} onChange={() => handleToggleEnabled(provider)} aria-label={t('provider.enabled')} />
        </div>

        <ChevronRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      </div>
    )
  }

  const renderScenarioSection = (scenario: ProviderScenario, items: ProviderConfig[]) => {
    if (items.length === 0) return null
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            background: SCENARIO_COLORS[scenario], display: 'inline-block',
          }} />
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
            textTransform: 'uppercase', color: 'var(--text-muted)',
          }}>
            {t(`provider.scenario.${scenario}`)}
          </span>
          <div style={{ flex: 1, height: 1, background: 'var(--bg-hover)' }} />
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.5, paddingLeft: 16 }}>
          {t(`provider.scenarioHint.${scenario}`)}
        </div>
        {items.map(renderProviderRow)}
      </div>
    )
  }

  const activeProvider = activeId ? providers.find(p => p.id === activeId) : undefined

  return (
    <div>
      {renderScenarioSection('official', providers.filter(p => p.scenario === 'official'))}
      {renderScenarioSection('gateway', providers.filter(p => p.scenario === 'gateway'))}

      <button
        onClick={handleAddCustomProvider}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 12px',
          marginTop: 4,
          borderRadius: 8,
          border: '1px dashed var(--border)',
          background: 'transparent',
          color: 'var(--text-muted)',
          fontSize: 12,
          cursor: 'pointer',
          width: '100%',
          justifyContent: 'center',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)'; e.currentTarget.style.color = '#a5b4fc' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
      >
        <Plus size={13} />
        {t('provider.addCustom')}
      </button>

      {/* Detail drawer. Rendered as a sibling here — NOT inside a positioned or
          transformed wrapper — so its `position: absolute` still anchors to the
          settings modal. See the layout note in ProviderEditDrawer. */}
      {activeProvider && (
        <ProviderEditDrawer
          key={activeProvider.id}
          provider={activeProvider}
          health={healthMap[activeProvider.id]}
          testing={testing === activeProvider.id}
          onClose={closeDrawer}
          onTest={handleTestConnection}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          onOpenModelPicker={handleOpenModelPicker}
        />
      )}

      {/* Model picker. Deliberately a sibling of the drawer: the drawer panel's
          entry animation makes it a containing block for `position: fixed`, so
          nesting this inside would clip it to the panel's width. */}
      {modelModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'var(--glass-overlay)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setModelModal(null)}>
          <div style={{
            background: 'var(--popup-bg)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid var(--border)',
            borderRadius: 12, padding: 20, width: 400, maxHeight: '70vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 16px 48px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
              {t('provider.foundModels', { count: modelModal.models.length })}
            </div>
            <div style={{ flex: 1, overflow: 'auto', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {modelModal.models.map(m => (
                <div key={m} style={{
                  padding: '6px 10px', borderRadius: 6, fontSize: 12,
                  color: 'rgba(165,180,252,0.85)',
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border)',
                  fontFamily: 'monospace',
                }}>{m}</div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setModelModal(null)}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
                style={{
                  padding: '6px 14px', borderRadius: 6,
                  background: 'var(--border)',
                  border: '1px solid var(--border)', color: 'var(--text-muted)',
                  cursor: 'pointer', fontSize: 12, transition: 'all 0.15s ease',
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => {
                  const provider = providers.find(p => p.id === modelModal.providerId)
                  if (!provider) return
                  const updatedModels = modelModal.models.map(id => ({ id, name: id, provider: provider.id }))
                  const updated = { ...provider, models: updatedModels }
                  window.electronAPI.providerUpsert(updated)
                  setProviders(prev => prev.map(p => p.id === provider.id ? updated : p))
                  useUiStore.getState().addToast('success', t('provider.modelsLoaded', { count: modelModal.models.length }))
                  setModelModal(null)
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,0.95), rgba(139,92,246,0.95))'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)' }}
                style={{
                  padding: '6px 14px', borderRadius: 6,
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
                  border: 'none',
                  color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  transition: 'all 0.15s ease',
                }}
              >
                {t('provider.loadAllModels')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
