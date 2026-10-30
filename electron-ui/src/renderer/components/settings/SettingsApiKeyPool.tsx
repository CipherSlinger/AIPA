// SettingsApiKeyPool — extracted from SettingsGeneral.tsx (Iteration 365)
// Manages the API key pool: list, add, import, toggle, delete, reset exhausted

import React, { useState, useRef } from 'react'
import { Plus, Trash2, RefreshCw, Upload } from 'lucide-react'
import { usePrefsStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import type { ApiKeyEntry } from '../../types/app.types'

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
  const fileInputRef = useRef<HTMLInputElement>(null)

  const savePool = (pool: ApiKeyEntry[]) => {
    setApiKeyPool(pool)
    setPrefs({ apiKeyPool: pool })
    window.electronAPI.prefsSet('apiKeyPool', pool)
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
      // reported — never roll the key back. `modelsFetch` merges the result
      // into the persisted prefs itself; the store update is this window's
      // copy so every model list re-renders without waiting for a reload.
      const models = await window.electronAPI.modelsFetch(entry.apiKey)
      setPrefs({ availableModels: models })
      useUiStore.getState().addToast('success', t('settings.modelsLoaded', { count: models.length }))
    } catch (err) {
      // Error messages from the bridge are safe to show; never fall back to
      // the key or the raw request. Electron prefixes a rejected handler with
      // its channel name, which is noise in a toast.
      const message = (err instanceof Error ? err.message : String(err))
        .replace(/^Error invoking remote method '[^']+':\s*/, '')
        .replace(/^Error:\s*/, '')
      useUiStore.getState().addToast('error', t('settings.modelsLoadFailed', { error: message }))
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
                <div
                  key={entry.id}
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
                  <button
                    onClick={() => savePool(apiKeyPool.map(k => k.id === entry.id ? { ...k, enabled: !k.enabled } : k))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: entry.enabled ? 'var(--accent-text)' : 'var(--text-faint)', fontSize: 10, padding: '1px 4px' }}
                    title={entry.enabled ? t('common.disable') : t('common.enable')}
                  >{entry.enabled ? '✓' : '○'}</button>
                  <button
                    onClick={() => savePool(apiKeyPool.filter(k => k.id !== entry.id))}
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
