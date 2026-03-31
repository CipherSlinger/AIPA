// SettingsApiKeyPool — extracted from SettingsGeneral.tsx (Iteration 365)
// Manages the API key pool: list, add, import, toggle, delete, reset exhausted

import React, { useState, useRef } from 'react'
import { Plus, Trash2, RefreshCw, Upload } from 'lucide-react'
import { usePrefsStore } from '../../store'
import { useT } from '../../i18n'
import type { ApiKeyEntry } from '../../types/app.types'
import { INPUT_STYLE } from './settingsConstants'

interface SettingsApiKeyPoolProps {
  field: (label: string, content: React.ReactNode, hint?: React.ReactNode) => React.ReactNode
}

export default function SettingsApiKeyPool({ field }: SettingsApiKeyPoolProps) {
  const t = useT()
  const { setPrefs } = usePrefsStore()
  const prefs = usePrefsStore(s => s.prefs)
  const [apiKeyPool, setApiKeyPool] = useState<ApiKeyEntry[]>(prefs.apiKeyPool || [])
  const [newKeyLabel, setNewKeyLabel] = useState('')
  const [newKeyValue, setNewKeyValue] = useState('')
  const [newKeyBaseUrl, setNewKeyBaseUrl] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const savePool = (pool: ApiKeyEntry[]) => {
    setApiKeyPool(pool)
    setPrefs({ apiKeyPool: pool })
    window.electronAPI.prefsSet('apiKeyPool', pool)
  }

  const handleAddKey = () => {
    if (!newKeyValue.trim()) return
    const entry: ApiKeyEntry = {
      id: `key-${Date.now()}`,
      label: newKeyLabel.trim() || `Key ${apiKeyPool.length + 1}`,
      apiKey: newKeyValue.trim(),
      baseUrl: newKeyBaseUrl.trim() || undefined,
      enabled: true,
      exhausted: false,
      addedAt: Date.now(),
    }
    savePool([...apiKeyPool, entry])
    setNewKeyLabel('')
    setNewKeyValue('')
    setNewKeyBaseUrl('')
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    e.target.value = ''
    try {
      // Try JSON array: [{label, apiKey, baseUrl}] or [{key}] or ["key1","key2"]
      const parsed = JSON.parse(text)
      const arr = Array.isArray(parsed) ? parsed : [parsed]
      const entries: ApiKeyEntry[] = arr.map((item: any, i: number) => ({
        id: `key-${Date.now()}-${i}`,
        label: item.label || item.name || `Imported ${i + 1}`,
        apiKey: item.apiKey || item.key || item.api_key || (typeof item === 'string' ? item : ''),
        baseUrl: item.baseUrl || item.base_url || undefined,
        enabled: true,
        exhausted: false,
        addedAt: Date.now(),
      })).filter((e: ApiKeyEntry) => e.apiKey)
      savePool([...apiKeyPool, ...entries])
    } catch {
      // Try plain text: one key per line, optionally "label=key" or "key,label,baseUrl"
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
      const entries: ApiKeyEntry[] = lines.map((line, i) => {
        const parts = line.split(',')
        return {
          id: `key-${Date.now()}-${i}`,
          label: parts[1]?.trim() || `Key ${apiKeyPool.length + i + 1}`,
          apiKey: parts[0].trim(),
          baseUrl: parts[2]?.trim() || undefined,
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
            <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 0' }}>{t('settings.noKeysInPool')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
              {apiKeyPool.map((entry) => (
                <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: 'var(--bg-active)', borderRadius: 4, border: '1px solid var(--border)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: entry.exhausted ? '#ef4444' : entry.enabled ? '#22c55e' : '#6b7280' }} />
                  <span style={{ fontSize: 11, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>{entry.label}</span>
                  {entry.exhausted && <span style={{ fontSize: 9, color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '1px 4px', borderRadius: 3 }}>{t('settings.keyExhausted')}</span>}
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{'···' + entry.apiKey.slice(-6)}</span>
                  <button
                    onClick={() => savePool(apiKeyPool.map(k => k.id === entry.id ? { ...k, enabled: !k.enabled } : k))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: entry.enabled ? 'var(--accent)' : 'var(--text-muted)', fontSize: 10, padding: '1px 4px' }}
                    title={entry.enabled ? 'Disable' : 'Enable'}
                  >{entry.enabled ? '\u2713' : '\u25CB'}</button>
                  <button
                    onClick={() => savePool(apiKeyPool.filter(k => k.id !== entry.id))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: 2 }}
                    aria-label="Delete key"
                  ><Trash2 size={11} /></button>
                </div>
              ))}
            </div>
          )}
          {/* Add key form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
            <input
              value={newKeyLabel}
              onChange={(e) => setNewKeyLabel(e.target.value)}
              placeholder={t('settings.keyLabel')}
              style={{ ...INPUT_STYLE, fontSize: 11 }}
            />
            <input
              value={newKeyValue}
              onChange={(e) => setNewKeyValue(e.target.value)}
              placeholder={t('settings.keyValue')}
              type="password"
              style={{ ...INPUT_STYLE, fontSize: 11 }}
            />
            <input
              value={newKeyBaseUrl}
              onChange={(e) => setNewKeyBaseUrl(e.target.value)}
              placeholder={t('settings.keyBaseUrl')}
              style={{ ...INPUT_STYLE, fontSize: 11 }}
            />
            <button
              onClick={handleAddKey}
              disabled={!newKeyValue.trim()}
              style={{ background: 'var(--accent)', border: 'none', borderRadius: 4, padding: '5px 10px', color: '#fff', cursor: newKeyValue.trim() ? 'pointer' : 'not-allowed', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, opacity: newKeyValue.trim() ? 1 : 0.5 }}
            ><Plus size={11} />{t('settings.addKey')}</button>
          </div>
          {/* Actions */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{ flex: 1, background: 'var(--bg-active)', border: '1px solid var(--border)', borderRadius: 4, padding: '5px 8px', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}
            ><Upload size={11} />{t('settings.importKeys')}</button>
            {apiKeyPool.some(k => k.exhausted) && (
              <button
                onClick={handleResetExhausted}
                style={{ flex: 1, background: 'var(--bg-active)', border: '1px solid var(--border)', borderRadius: 4, padding: '5px 8px', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}
              ><RefreshCw size={11} />{t('settings.resetExhausted')}</button>
            )}
          </div>
        </div>,
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('settings.apiKeyPoolHint')}</span>
      )}
    </>
  )
}
