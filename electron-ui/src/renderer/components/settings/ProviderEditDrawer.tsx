// ProviderEditDrawer — the right-hand detail panel behind a provider row.
//
// Before this existed the row itself expanded into a full config form, which
// made a list of providers impossible to scan. Now the row stays one line and
// every editable field lives here.
//
// Layout note: the panel is `position: absolute` and is meant to anchor to the
// window edge, so nothing between the drawer and the initial containing block
// may set `position`. Concretely: do NOT give the provider-list root (or any
// wrapper around the drawer) `position: relative`, or the drawer will anchor
// into the scrolling settings column instead and get clipped by it. Do NOT nest
// the model-picker modal inside the sliding panel either: the panel's
// `animation`/`transform` makes it the containing block for `position: fixed`
// descendants, which would clip the modal to the panel's 380px. The picker is
// owned by SettingsProviders, which renders it as a sibling of this drawer.

import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { X, Eye, EyeOff, RefreshCw, ExternalLink, Trash2 } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useUiStore } from '../../store'
import { pushEscapeHandler } from '../ui/escapeStack'
import {
  INPUT_STYLE,
  BUILT_IN_IDS,
  PROVIDER_KEY_LINKS,
  SCENARIO_COLORS,
  type ProviderConfig,
  type ProviderHealthStatus,
  type ProviderScenario,
} from './settingsConstants'

const QRCodeDisplay = lazy(() => import('../ui/QRCodeDisplay'))

interface ProviderEditDrawerProps {
  provider: ProviderConfig
  health?: ProviderHealthStatus
  testing: boolean
  onClose: () => void
  onTest: (providerId: string) => void
  /** Persisted — the parent patches its list and shows the toast. */
  onSaved: (updated: ProviderConfig) => void
  /** Removed — the parent drops it from the list and closes the drawer. */
  onDeleted: (providerId: string) => void
  onOpenModelPicker: (providerId: string, models: string[]) => void
}

interface Draft {
  name: string
  scenario: ProviderScenario
  apiKey: string
  authToken: string
  baseUrl: string
}

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  display: 'block',
  marginBottom: 5,
}

const GHOST_BTN: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '5px 12px',
  borderRadius: 6,
  background: 'var(--bg-hover)',
  border: '1px solid var(--border)',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 500,
  transition: 'all 0.15s ease',
}

const ICON_BTN: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  flexShrink: 0,
  borderRadius: 7,
  background: 'var(--bg-hover)',
  border: '1px solid var(--border)',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
}

export default function ProviderEditDrawer({
  provider,
  health,
  testing,
  onClose,
  onTest,
  onSaved,
  onDeleted,
  onOpenModelPicker,
}: ProviderEditDrawerProps) {
  const { t } = useI18n()

  const isBuiltIn = BUILT_IN_IDS.includes(provider.id)

  const [draft, setDraft] = useState<Draft>({
    name: provider.name,
    scenario: provider.scenario,
    apiKey: provider.apiKey ?? '',
    authToken: provider.authToken ?? '',
    baseUrl: provider.baseUrl ?? '',
  })
  const [showApiKey, setShowApiKey] = useState(false)
  const [showAuthToken, setShowAuthToken] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [fetchingModels, setFetchingModels] = useState(false)

  const closeBtnRef = useRef<HTMLButtonElement>(null)

  // Re-seed whenever the stored config changes (different provider, or the
  // parent patched this one after a save) so `isDirty` stays honest.
  useEffect(() => {
    setDraft({
      name: provider.name,
      scenario: provider.scenario,
      apiKey: provider.apiKey ?? '',
      authToken: provider.authToken ?? '',
      baseUrl: provider.baseUrl ?? '',
    })
    setDeleteConfirm(false)
  }, [
    provider.id,
    provider.name,
    provider.scenario,
    provider.apiKey,
    provider.authToken,
    provider.baseUrl,
  ])

  // Escape closes the drawer, not the whole settings modal.
  useEffect(() => pushEscapeHandler(onClose), [onClose])

  useEffect(() => { closeBtnRef.current?.focus() }, [])

  const update = useCallback((patch: Partial<Draft>) => {
    setDraft(prev => ({ ...prev, ...patch }))
  }, [])

  const isDirty =
    draft.name !== provider.name ||
    draft.scenario !== provider.scenario ||
    draft.apiKey !== (provider.apiKey ?? '') ||
    draft.authToken !== (provider.authToken ?? '') ||
    draft.baseUrl !== (provider.baseUrl ?? '')

  const handleSave = useCallback(async () => {
    const updated: ProviderConfig = { ...provider, ...draft }

    // Entering a credential for the first time turns the provider on.
    const hasCredential = !!draft.apiKey.trim() || !!draft.authToken.trim()
    if (hasCredential && !provider.enabled) updated.enabled = true

    await window.electronAPI.providerUpsert(updated)
    onSaved(updated)
    useUiStore.getState().addToast('success', t('provider.saved'))

    // Preserved from the old card: saving an enabled gateway with a Base URL
    // discovers its models and adopts the first one as the default model.
    const baseUrl = draft.baseUrl.trim()
    if (updated.enabled && baseUrl) {
      try {
        const result = await (window.electronAPI as any).providerFetchRemoteModels({
          baseUrl,
          apiKey: draft.apiKey.trim(),
          authToken: draft.authToken.trim(),
        })
        if (result.success && result.models && result.models.length > 0) {
          await window.electronAPI.prefsSet('model', result.models[0])
          useUiStore.getState().addToast('success', t('provider.modelsLoaded', { count: result.models.length }))
        }
      } catch {
        // Model discovery must never block a save.
      }
    }

    if (updated.enabled && hasCredential) onTest(provider.id)
  }, [provider, draft, onSaved, onTest, t])

  const handleDelete = useCallback(async () => {
    await window.electronAPI.providerRemove(provider.id)
    onDeleted(provider.id)
    useUiStore.getState().addToast('success', t('provider.deleted'))
  }, [provider.id, onDeleted, t])

  const handleFetchRemoteModels = useCallback(async () => {
    const baseUrl = draft.baseUrl.trim()
    if (!baseUrl) {
      useUiStore.getState().addToast('error', t('provider.baseUrlRequired'))
      return
    }
    setFetchingModels(true)
    try {
      const result = await (window.electronAPI as any).providerFetchRemoteModels({
        baseUrl,
        apiKey: draft.apiKey.trim(),
        authToken: draft.authToken.trim(),
      })
      if (result.success && result.models.length > 0) {
        onOpenModelPicker(provider.id, result.models)
      } else if (result.success) {
        useUiStore.getState().addToast('info', t('provider.noModelsReturned'))
      } else {
        useUiStore.getState().addToast('error', t('provider.fetchFailed', { error: result.error }))
      }
    } catch (err) {
      useUiStore.getState().addToast('error', t('provider.fetchError', { error: String(err) }))
    }
    setFetchingModels(false)
  }, [draft.baseUrl, draft.apiKey, draft.authToken, provider.id, onOpenModelPicker, t])

  const scenario = draft.scenario
  const modelCount = provider.models?.length ?? 0

  const healthLabel = !health
    ? t('provider.unchecked')
    : health.status === 'healthy'
      ? t('provider.healthy')
      : health.status === 'degraded'
        ? t('provider.degraded')
        : t('provider.down')
  const healthColor = !health
    ? 'var(--text-muted)'
    : health.status === 'healthy'
      ? '#22c55e'
      : health.status === 'degraded'
        ? '#fbbf24'
        : '#fca5a5'

  return (
    // Untransformed root: it only positions the scrim + panel, so `position:
    // fixed` descendants elsewhere in the tree still resolve to the modal.
    <div style={{ position: 'absolute', inset: 0, zIndex: 350, pointerEvents: 'none' }}>
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.25)',
          pointerEvents: 'auto',
          animation: 'fadeIn 0.15s ease',
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={provider.name}
        style={{
          position: 'absolute', top: 0, right: 0, bottom: 0,
          width: 'min(380px, 62%)',
          pointerEvents: 'auto',
          display: 'flex', flexDirection: 'column',
          background: 'var(--popup-bg)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderLeft: '1px solid var(--border)',
          boxShadow: '-12px 0 32px rgba(0,0,0,0.35)',
          zIndex: 400,
          animation: 'drawerIn 0.22s ease',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '14px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
              textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 3,
            }}>
              {t('provider.editProvider')}
            </div>
            <div style={{
              fontSize: 14, fontWeight: 700, color: 'var(--text-primary)',
              letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {provider.name}
            </div>
          </div>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            aria-label={t('common.close')}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--border)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent' }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26, borderRadius: 6, flexShrink: 0,
              background: 'transparent', border: 'none',
              color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.15s ease',
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div style={{
          flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain',
          padding: 16, display: 'flex', flexDirection: 'column', gap: 14,
        }}>

          {/* Name — custom providers only; built-ins are named by the registry. */}
          {!isBuiltIn && (
            <div>
              <label style={LABEL_STYLE}>{t('provider.name')}</label>
              <input
                type="text"
                value={draft.name}
                onChange={e => update({ name: e.target.value })}
                style={INPUT_STYLE}
              />
            </div>
          )}

          {/* Connection mode — only claude-cli can flip between official and gateway. */}
          {provider.id === 'claude-cli' && (
            <div>
              <label style={LABEL_STYLE}>{t('provider.connectionMode')}</label>
              <div style={{ display: 'flex', gap: 4, background: 'var(--bg-hover)', borderRadius: 8, padding: 3 }}>
                {(['official', 'gateway'] as const).map(sc => {
                  const isActive = scenario === sc
                  return (
                    <button
                      key={sc}
                      onClick={() => update({ scenario: sc })}
                      style={{
                        flex: 1, padding: '5px 8px', borderRadius: 6, border: 'none',
                        background: isActive ? `rgba(${sc === 'official' ? '99,102,241' : '251,191,36'},0.18)` : 'transparent',
                        color: isActive ? SCENARIO_COLORS[sc] : 'var(--text-muted)',
                        fontSize: 11, fontWeight: isActive ? 700 : 400, cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {t(`provider.scenario.${sc}`)}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* API Key — official scenario */}
          {scenario === 'official' && (
            <div>
              <label style={LABEL_STYLE}>{t('provider.apiKey')}</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={draft.apiKey}
                  onChange={e => update({ apiKey: e.target.value })}
                  placeholder="sk-..."
                  style={{ ...INPUT_STYLE, fontFamily: 'monospace' }}
                />
                <button
                  onClick={() => setShowApiKey(v => !v)}
                  aria-label={t('settingsAdvanced.showApiKey')}
                  style={ICON_BTN}
                >
                  {showApiKey ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </div>
          )}

          {/* Auth Token + Base URL + model discovery — gateway scenario */}
          {scenario === 'gateway' && (
            <>
              <div>
                <label style={LABEL_STYLE}>{t('provider.authToken')}</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  <input
                    type={showAuthToken ? 'text' : 'password'}
                    value={draft.authToken}
                    onChange={e => update({ authToken: e.target.value })}
                    placeholder="Bearer ..."
                    style={{ ...INPUT_STYLE, fontFamily: 'monospace' }}
                  />
                  <button
                    onClick={() => setShowAuthToken(v => !v)}
                    aria-label={t('settingsAdvanced.showApiKey')}
                    style={ICON_BTN}
                  >
                    {showAuthToken ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 5, lineHeight: 1.5 }}>
                  {t('provider.authTokenHint')}
                </div>
              </div>

              <div>
                <label style={LABEL_STYLE}>{t('provider.baseUrl')}</label>
                <input
                  type="text"
                  value={draft.baseUrl}
                  onChange={e => update({ baseUrl: e.target.value })}
                  placeholder="https://..."
                  style={INPUT_STYLE}
                />
              </div>

              <div>
                <button
                  onClick={handleFetchRemoteModels}
                  disabled={fetchingModels}
                  onMouseEnter={e => { if (!fetchingModels) { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.35)'; e.currentTarget.style.color = '#a5b4fc' } }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
                  style={{ ...GHOST_BTN, cursor: fetchingModels ? 'wait' : 'pointer', opacity: fetchingModels ? 0.6 : 1 }}
                >
                  <RefreshCw size={11} style={{ animation: fetchingModels ? 'spin 1s linear infinite' : 'none' }} />
                  {fetchingModels ? t('provider.fetchingModels') : t('provider.fetchModels')}
                </button>
              </div>
            </>
          )}

          {/* Qwen quick setup */}
          {provider.id === 'qwen' && (
            <div style={{
              background: 'var(--bg-hover)', border: '1px solid var(--border)',
              borderRadius: 8, padding: 12, display: 'flex', alignItems: 'center', gap: 16,
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

          {/* Get API Key deep link */}
          {isBuiltIn && PROVIDER_KEY_LINKS[provider.id] && (
            <div>
              <button
                onClick={() => window.electronAPI.shellOpenExternal(PROVIDER_KEY_LINKS[provider.id])}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.35)'; e.currentTarget.style.color = '#a5b4fc' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'rgba(99,102,241,0.6)' }}
                style={{
                  ...GHOST_BTN,
                  background: 'rgba(99,102,241,0.08)',
                  color: 'rgba(99,102,241,0.60)',
                }}
              >
                <ExternalLink size={11} />
                {t('provider.getApiKey')}
              </button>
            </div>
          )}

          {/* Status */}
          <div style={{
            borderTop: '1px solid var(--border)', paddingTop: 12,
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <label style={{ ...LABEL_STYLE, marginBottom: 0 }}>{t('provider.status')}</label>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: healthColor, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{healthLabel}</span>
              {modelCount > 0 && (
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>
                  {t('provider.modelCount', { count: modelCount })}
                </span>
              )}
            </div>
            {health?.lastError && (
              <div style={{ fontSize: 10, color: '#fca5a5', lineHeight: 1.5 }}>
                {t('provider.lastError')}: {health.lastError}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '12px 16px', borderTop: '1px solid var(--border)', flexShrink: 0,
        }}>
          {!isBuiltIn && (
            deleteConfirm ? (
              <button
                onClick={handleDelete}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.25)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.45)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.30)' }}
                style={{
                  ...GHOST_BTN,
                  background: 'rgba(239,68,68,0.15)',
                  borderColor: 'rgba(239,68,68,0.30)',
                  color: '#fca5a5',
                  fontWeight: 600,
                }}
              >
                {t('provider.deleteConfirm')}
              </button>
            ) : (
              <button
                onClick={() => setDeleteConfirm(true)}
                aria-label={t('provider.deleteProvider')}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'; e.currentTarget.style.color = '#fca5a5' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
                style={{ ...GHOST_BTN, padding: '6px 10px' }}
              >
                <Trash2 size={11} />
              </button>
            )
          )}

          <button
            onClick={() => onTest(provider.id)}
            disabled={testing}
            onMouseEnter={e => { if (!testing) { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.35)'; e.currentTarget.style.color = '#a5b4fc' } }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
            style={{ ...GHOST_BTN, padding: '6px 12px', cursor: testing ? 'wait' : 'pointer', opacity: testing ? 0.6 : 1 }}
          >
            <RefreshCw size={11} style={{ animation: testing ? 'spin 1s linear infinite' : 'none' }} />
            {t('provider.testConnection')}
          </button>

          {isDirty && (
            <button
              onClick={handleSave}
              onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,0.95), rgba(139,92,246,0.95))'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)' }}
              style={{
                marginLeft: 'auto',
                padding: '6px 14px', borderRadius: 6,
                background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
                border: 'none',
                color: 'var(--text-primary)', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                transition: 'all 0.15s ease',
              }}
            >
              {t('provider.save')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
