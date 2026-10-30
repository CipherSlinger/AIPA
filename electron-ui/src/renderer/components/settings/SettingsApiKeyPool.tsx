// SettingsApiKeyPool — extracted from SettingsGeneral.tsx (Iteration 365)
// Manages the API key pool: list, add, import, toggle, delete, reset exhausted

import React, { useState, useRef } from 'react'
import { Plus, Trash2, RefreshCw, Upload, List } from 'lucide-react'
import { usePrefsStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import KeyModelsPanel from './KeyModelsPanel'
import type { ApiKeyEntry, AvailableModel } from '../../types/app.types'

interface SettingsApiKeyPoolProps {
  field: (label: string, content: React.ReactNode, hint?: React.ReactNode) => React.ReactNode
}

const glassInputStyle: React.CSSProperties = {
  background: 'var(--bg-input)',
  border: '1px solid var(--glass-border-md)',
  borderRadius: 6,
  padding: '5px 10px',
  fontSize: 12,
  color: 'var(--text-primary)',
  width: '100%',
  boxSizing: 'border-box' as const,
}

const POOL_LABEL_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  minWidth: 0,
}

const POOL_LABEL_TEXT_STYLE: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.02em',
  color: 'var(--text-muted)',
}

// Model ids as the /v1/models endpoint reports them. Deliberately permissive:
// the point is to reject whitespace and empty drafts, not to second-guess ids.
const MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/

// The pickers and the main process read one global catalogue, so the pool has
// to hand them the same view a user sees: every key's models, in pool order
// then first-seen order. Disabled keys count too — switching a key off must
// not delete models from the dropdown and break stored plugin settings.
function unionPoolModels(pool: ApiKeyEntry[]): AvailableModel[] {
  const out: AvailableModel[] = []
  const seen = new Set<string>()
  for (const entry of pool) {
    for (const model of entry.models ?? []) {
      if (!model?.id || seen.has(model.id)) continue
      seen.add(model.id)
      out.push({ id: model.id, name: model.name || model.id })
    }
  }
  return out
}

// Electron prefixes a rejected handler with its channel name and Node puts an
// "Error:" in front of the thrown message; neither belongs in a toast.
function errorText(err: unknown): string {
  return (err instanceof Error ? err.message : String(err))
    .replace(/^Error invoking remote method '[^']+':\s*/, '')
    .replace(/^Error:\s*/, '')
}

export default function SettingsApiKeyPool({ field }: SettingsApiKeyPoolProps) {
  const t = useT()
  const setPrefs = usePrefsStore(s => s.setPrefs)
  const prefs = usePrefsStore(s => s.prefs)
  const [apiKeyPool, setApiKeyPool] = useState<ApiKeyEntry[]>(prefs.apiKeyPool || [])
  const [newKeyLabel, setNewKeyLabel] = useState('')
  const [newKeyValue, setNewKeyValue] = useState('')
  // The key is saved before the catalogue call starts; this only prevents a
  // second add (and a duplicate fetch) while the first one is in flight.
  const [addingKey, setAddingKey] = useState(false)
  const [hoveredRemove, setHoveredRemove] = useState<string | null>(null)
  // One panel at a time: the model list is an inline expansion of a row, not a
  // second surface. The draft lives here so opening another key resets it.
  const [openKeyId, setOpenKeyId] = useState<string | null>(null)
  const [panelLoading, setPanelLoading] = useState(false)
  const [modelDraft, setModelDraft] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Async fetches resolve after the user may have edited other rows, so they
  // read the pool through a ref instead of the closure captured on click.
  const poolRef = useRef<ApiKeyEntry[]>(apiKeyPool)

  const savePool = (pool: ApiKeyEntry[]) => {
    poolRef.current = pool
    setApiKeyPool(pool)
    setPrefs({ apiKeyPool: pool })
    window.electronAPI.prefsSet('apiKeyPool', pool)
  }

  // Model changes must also rewrite the global catalogue: the dropdowns read
  // prefs.availableModels, and the main process validates plugin models
  // against the persisted copy, not against this window's store.
  const persistModels = (pool: ApiKeyEntry[]) => {
    savePool(pool)
    const union = unionPoolModels(pool)
    setPrefs({ availableModels: union })
    window.electronAPI.prefsSet('availableModels', union)
  }

  const setEntryModels = (keyId: string, models: AvailableModel[]) => {
    persistModels(poolRef.current.map(k => (k.id === keyId ? { ...k, models } : k)))
  }

  const reloadModels = async (entry: ApiKeyEntry) => {
    if (panelLoading) return
    setPanelLoading(true)
    try {
      const models = await window.electronAPI.modelsFetch(entry.apiKey)
      // The row may have been deleted while the request was in flight; never
      // resurrect it just to attach its models.
      if (poolRef.current.some(k => k.id === entry.id)) setEntryModels(entry.id, models)
    } catch (err) {
      useUiStore.getState().addToast('error', t('settings.modelsLoadFailed', { error: errorText(err) }))
    } finally {
      setPanelLoading(false)
    }
  }

  const toggleModelsPanel = (entry: ApiKeyEntry) => {
    if (openKeyId === entry.id) {
      setOpenKeyId(null)
      return
    }
    setOpenKeyId(entry.id)
    setModelDraft('')
    // A key with a known list opens without a network call; an empty one has
    // nothing to show, so fetching is the only useful thing to do.
    if (!entry.models || entry.models.length === 0) void reloadModels(entry)
  }

  const handleAddModel = (keyId: string) => {
    const id = modelDraft.trim()
    if (!MODEL_ID_RE.test(id) || panelLoading) return
    const entry = poolRef.current.find(k => k.id === keyId)
    if (!entry) return
    const models = entry.models ?? []
    if (models.some(m => m.id === id)) return
    setEntryModels(keyId, [...models, { id, name: id }])
    setModelDraft('')
    useUiStore.getState().addToast('success', t('settings.keyModelsAdded', { model: id }))
  }

  const handleRemoveModel = (keyId: string, model: AvailableModel) => {
    const entry = poolRef.current.find(k => k.id === keyId)
    if (!entry) return
    setEntryModels(keyId, (entry.models ?? []).filter(m => m.id !== model.id))
    useUiStore.getState().addToast('success', t('settings.keyModelsRemoved', { model: model.name || model.id }))
  }

  const handleAddKey = async () => {
    const apiKey = newKeyValue.trim()
    if (!apiKey || addingKey) return
    const entry: ApiKeyEntry = {
      id: `key-${Date.now()}`,
      label: newKeyLabel.trim() || `Key ${apiKeyPool.length + 1}`,
      apiKey,
      enabled: true,
      exhausted: false,
      addedAt: Date.now(),
    }
    savePool([...apiKeyPool, entry])
    setNewKeyLabel('')
    setNewKeyValue('')
    setAddingKey(true)
    try {
      // The key is already saved, so a failed catalogue call must only be
      // reported — never roll the key back. On success the result becomes this
      // key's own list; the global catalogue is then rebuilt as the union so
      // every dropdown sees it without waiting for a reload.
      const models = await window.electronAPI.modelsFetch(entry.apiKey)
      if (poolRef.current.some(k => k.id === entry.id)) setEntryModels(entry.id, models)
      useUiStore.getState().addToast('success', t('settings.modelsLoaded', { count: models.length }))
    } catch (err) {
      // Error messages from the bridge are safe to show; never fall back to
      // the key or the raw request.
      useUiStore.getState().addToast('error', t('settings.modelsLoadFailed', { error: errorText(err) }))
    } finally {
      setAddingKey(false)
    }
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    e.target.value = ''
    try {
      // Try JSON array: [{label, apiKey}] or [{key}] or ["key1","key2"]. A
      // baseUrl an older export carries is ignored — the key is the whole
      // credential now, and there is no endpoint left to point it at.
      const parsed = JSON.parse(text)
      const arr = Array.isArray(parsed) ? parsed : [parsed]
      const entries: ApiKeyEntry[] = arr.map((item: any, i: number) => ({
        id: `key-${Date.now()}-${i}`,
        label: item.label || item.name || `Imported ${i + 1}`,
        apiKey: item.apiKey || item.key || item.api_key || (typeof item === 'string' ? item : ''),
        enabled: true,
        exhausted: false,
        addedAt: Date.now(),
      })).filter((e: ApiKeyEntry) => e.apiKey)
      savePool([...apiKeyPool, ...entries])
    } catch {
      // Try plain text: one key per line, optionally "label=key" or "key,label".
      // A third comma-separated field (the old base URL) is ignored.
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
      const entries: ApiKeyEntry[] = lines.map((line, i) => {
        const parts = line.split(',')
        return {
          id: `key-${Date.now()}-${i}`,
          label: parts[1]?.trim() || `Key ${apiKeyPool.length + i + 1}`,
          apiKey: parts[0].trim(),
          enabled: true,
          exhausted: false,
          addedAt: Date.now(),
        }
      }).filter(e => e.apiKey)
      savePool([...apiKeyPool, ...entries])
    }
  }

  const handleResetExhausted = () => {
    savePool(apiKeyPool.map(k => ({ ...k, exhausted: false })))
    setPrefs({ activeApiKeyId: undefined })
    window.electronAPI.prefsSet('activeApiKeyId', null)
  }

  const canAddKey = Boolean(newKeyValue.trim()) && !addingKey
  const draftModelId = modelDraft.trim()
  const openKey = apiKeyPool.find(k => k.id === openKeyId)
  const canAddModel =
    Boolean(draftModelId) &&
    MODEL_ID_RE.test(draftModelId) &&
    !panelLoading &&
    !(openKey?.models ?? []).some(m => m.id === draftModelId)

  return (
    <>
      {field(
        t('settings.apiKeyPool'),
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.txt,.csv"
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />
          {/* Key list */}
          {apiKeyPool.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-subtle)', textAlign: 'center', padding: 24 }}>{t('settings.noKeysInPool')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
              {apiKeyPool.map((entry) => (
                <React.Fragment key={entry.id}>
                  <div
                    style={{
                      background: 'var(--glass-bg-low)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: 8,
                      padding: '10px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--glass-border)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--glass-bg-low)')}
                  >
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: entry.exhausted ? '#f87171' : entry.enabled ? '#22c55e' : 'var(--text-muted)',
                      boxShadow: entry.enabled && !entry.exhausted ? '0 0 6px #4ade80' : 'none',
                    }} />
                    <span style={{ fontSize: 11, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>{entry.label}</span>
                    {entry.exhausted && (
                      <span style={{
                        fontSize: 10, color: 'var(--danger-text)',
                        background: 'rgba(239,68,68,0.1)', padding: '1px 4px', borderRadius: 6,
                      }}>{t('settings.keyExhausted')}</span>
                    )}
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--accent-text)', flex: 'none' }}>
                      {'···' + entry.apiKey.slice(-6)}
                    </span>
                    {/* Active status badge */}
                    {entry.enabled && !entry.exhausted && (
                      <span style={{
                        background: 'rgba(34,197,94,0.15)',
                        border: '1px solid rgba(34,197,94,0.3)',
                        borderRadius: 20, padding: '2px 8px',
                        fontSize: 10, color: 'var(--success-text)',
                      }}>
                        {t('settings.keyActive')}
                      </span>
                    )}
                    {/* Opens this key's model list inline, so no dialog and no
                        navigation away from the pool. */}
                    <button
                      type="button"
                      onClick={() => toggleModelsPanel(entry)}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent-text)')}
                      onMouseLeave={e => {
                        e.currentTarget.style.color = openKeyId === entry.id ? 'var(--accent-text)' : 'var(--text-muted)'
                      }}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: openKeyId === entry.id ? 'var(--accent-text)' : 'var(--text-muted)',
                        display: 'flex', alignItems: 'center', padding: 2,
                        transition: 'color 0.15s ease',
                      }}
                      aria-label={t('settings.viewModels')}
                      aria-expanded={openKeyId === entry.id}
                      title={t('settings.viewModels')}
                    ><List size={11} /></button>
                    <button
                      onClick={() => savePool(apiKeyPool.map(k => k.id === entry.id ? { ...k, enabled: !k.enabled } : k))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: entry.enabled ? 'var(--accent-text)' : 'var(--text-faint)', fontSize: 10, padding: '1px 4px' }}
                      title={entry.enabled ? t('common.disable') : t('common.enable')}
                    >{entry.enabled ? '✓' : '○'}</button>
                    <button
                      onClick={() => {
                        savePool(apiKeyPool.filter(k => k.id !== entry.id))
                        if (openKeyId === entry.id) setOpenKeyId(null)
                      }}
                      onMouseEnter={() => setHoveredRemove(entry.id)}
                      onMouseLeave={() => setHoveredRemove(null)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--danger-text)',
                        opacity: hoveredRemove === entry.id ? 1 : 0.8,
                        display: 'flex', alignItems: 'center', padding: 2,
                        transition: 'all 0.15s ease',
                      }}
                      aria-label={t('a11y.deleteKey')}
                    ><Trash2 size={11} /></button>
                  </div>
                  {openKeyId === entry.id && (
                    <KeyModelsPanel
                      entry={entry}
                      loading={panelLoading}
                      draft={modelDraft}
                      onDraftChange={setModelDraft}
                      canAdd={canAddModel}
                      onReload={() => void reloadModels(entry)}
                      onAdd={() => handleAddModel(entry.id)}
                      onRemove={model => handleRemoveModel(entry.id, model)}
                      onClose={() => setOpenKeyId(null)}
                    />
                  )}
                </React.Fragment>
              ))}
            </div>
          )}
          {/* Add key form. Each field carries a persistent label: once the key
              is masked there is no other way to tell the three apart. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 6 }}>
            <label style={POOL_LABEL_STYLE}>
              <span style={POOL_LABEL_TEXT_STYLE}>{t('settings.keyLabel')}</span>
              <input
                value={newKeyLabel}
                onChange={(e) => setNewKeyLabel(e.target.value)}
                placeholder={t('settings.keyLabelPlaceholder')}
                aria-label={t('settings.keyLabel')}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                style={{ ...glassInputStyle, fontSize: 11 }}
              />
            </label>
            <label style={POOL_LABEL_STYLE}>
              <span style={POOL_LABEL_TEXT_STYLE}>{t('settings.keyValue')}</span>
              <input
                value={newKeyValue}
                onChange={(e) => setNewKeyValue(e.target.value)}
                placeholder={t('settings.keyValuePlaceholder')}
                aria-label={t('settings.keyValue')}
                type="password"
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                style={{ ...glassInputStyle, fontSize: 11 }}
              />
            </label>
            <button
              onClick={handleAddKey}
              disabled={!canAddKey}
              aria-busy={addingKey}
              style={{
                background: canAddKey ? 'var(--cta-gradient)' : 'var(--bg-hover)',
                border: canAddKey ? 'none' : '1px solid var(--border)',
                borderRadius: 8, padding: '7px 14px',
                color: canAddKey ? '#ffffff' : 'var(--text-muted)',
                cursor: canAddKey ? 'pointer' : 'not-allowed',
                fontSize: 12, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 4,
                opacity: addingKey ? 0.7 : 1,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (canAddKey) {
                  e.currentTarget.style.filter = 'brightness(0.95)'
                  e.currentTarget.style.transform = 'translateY(-1px)'
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = ''
                e.currentTarget.style.transform = ''
                e.currentTarget.style.boxShadow = 'none'
              }}
            ><Plus size={11} />{t('settings.addKey')}</button>
          </div>
          {/* Actions */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                flex: 1,
                background: 'var(--glass-bg-low)',
                border: '1px solid var(--glass-border)',
                borderRadius: 8, padding: '5px 8px',
                color: 'var(--text-primary)', cursor: 'pointer',
                fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center',
              }}
            ><Upload size={11} />{t('settings.importKeys')}</button>
            {apiKeyPool.some(k => k.exhausted) && (
              <button
                onClick={handleResetExhausted}
                style={{
                  flex: 1,
                  background: 'var(--glass-bg-low)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 8, padding: '5px 8px',
                  color: 'var(--text-primary)', cursor: 'pointer',
                  fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center',
                }}
              ><RefreshCw size={11} />{t('settings.resetExhausted')}</button>
            )}
          </div>
        </div>,
        <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{t('settings.apiKeyPoolHint')}</span>
      )}
    </>
  )
}
