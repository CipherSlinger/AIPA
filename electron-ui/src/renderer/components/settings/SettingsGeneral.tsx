import React, { useState, useMemo, useRef } from 'react'
import { Save, Eye, EyeOff, Brain, MessageSquare, Palette, FolderOpen, Settings2, Search, X, Plus, Trash2, RefreshCw, Upload } from 'lucide-react'
import { usePrefsStore } from '../../store'
import { useI18n } from '../../i18n'
import { PROMPT_TEMPLATES } from '../../utils/promptTemplates'
import type { ApiKeyEntry } from '../../types/app.types'
import SettingsGroup from './SettingsGroup'
import Toggle from '../ui/Toggle'
import {
  TAG_PRESETS_SETTINGS,
  MODEL_OPTIONS,
  FONT_FAMILIES,
  THEMES,
  INPUT_STYLE,
} from './settingsConstants'

interface SettingsGeneralProps {
  local: any
  setLocal: (updater: (prev: any) => any) => void
  showKey: boolean
  setShowKey: (v: boolean) => void
  saved: boolean
  onSave: () => void
}

export default function SettingsGeneral({
  local,
  setLocal,
  showKey,
  setShowKey,
  saved,
  onSave,
}: SettingsGeneralProps) {
  const { setPrefs } = usePrefsStore()
  const { t, locale, setLocale } = useI18n()
  const defaultTagNames = TAG_PRESETS_SETTINGS.map(tp => t(tp.defaultKey))
  const [localTagNames, setLocalTagNames] = useState<string[]>(local.tagNames || defaultTagNames)
  const [settingsFilter, setSettingsFilter] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const prefs = usePrefsStore(s => s.prefs)
  const [apiKeyPool, setApiKeyPool] = useState<ApiKeyEntry[]>(prefs.apiKeyPool || [])
  const [newKeyLabel, setNewKeyLabel] = useState('')
  const [newKeyValue, setNewKeyValue] = useState('')
  const [newKeyBaseUrl, setNewKeyBaseUrl] = useState('')

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

  const groupKeywords = useMemo(() => ({
    aiEngine: [t('settings.apiKey'), t('settings.model'), t('settings.thinkingMode'), t('settings.maxTurns'), t('settings.budgetLimit'), 'API', 'Claude', 'Opus', 'Sonnet', 'Haiku', t('settings.groups.aiEngine')].join(' ').toLowerCase(),
    prompts: [t('settings.promptTemplate'), t('settings.systemPrompt'), t('settings.groups.prompts')].join(' ').toLowerCase(),
    appearance: [t('settings.language'), t('settings.displayName'), t('settings.theme'), t('settings.fontSize'), t('settings.fontFamily'), t('settings.compactMode'), t('settings.groups.appearance')].join(' ').toLowerCase(),
    workspace: [t('settings.workingFolder'), t('tags.sectionTitle'), t('settings.groups.workspace')].join(' ').toLowerCase(),
    behavior: [t('settings.skipPermissions'), t('settings.verbose'), t('settings.completionSound'), t('settings.desktopNotifications'), t('settings.responseTone'), t('tone.title'), t('settings.systemPresence'), t('settings.groups.behavior')].join(' ').toLowerCase(),
  }), [t])

  const isGroupVisible = (groupKey: string): boolean => {
    if (!settingsFilter.trim()) return true
    const kw = groupKeywords[groupKey as keyof typeof groupKeywords]
    return kw ? kw.includes(settingsFilter.toLowerCase()) : true
  }

  const field = (label: string, content: React.ReactNode, hint?: React.ReactNode) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>{label}</div>
      {content}
      {hint && <div style={{ marginTop: 4 }}>{hint}</div>}
    </div>
  )

  const row = (label: string, control: React.ReactNode, hint?: string) => (
    <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div>
        <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{label}</div>
        {hint && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{hint}</div>}
      </div>
      {control}
    </div>
  )

  const updateLocal = (patch: Record<string, any>) => setLocal((prev: any) => ({ ...prev, ...patch }))

  return (
    <>
      {/* Settings search */}
      <div style={{ marginBottom: 8, position: 'relative', display: 'flex', alignItems: 'center' }}>
        <Search size={14} style={{ position: 'absolute', left: 10, color: 'var(--text-muted)', pointerEvents: 'none' }} />
        <input
          value={settingsFilter}
          onChange={(e) => setSettingsFilter(e.target.value)}
          placeholder={t('settings.searchPlaceholder')}
          aria-label={t('settings.searchPlaceholder')}
          style={{
            ...INPUT_STYLE,
            paddingLeft: 30,
            paddingRight: settingsFilter ? 28 : 10,
          }}
        />
        {settingsFilter && (
          <button
            onClick={() => setSettingsFilter('')}
            aria-label="Clear search"
            style={{ position: 'absolute', right: 8, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 2 }}
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Group 1: AI Engine */}
      {isGroupVisible('aiEngine') && (
      <SettingsGroup title={t('settings.groups.aiEngine')} icon={<Brain size={14} />} groupKey="aiEngine">
        {field(
          t('settings.apiKey'),
          <div style={{ position: 'relative' }}>
            <input
              type={showKey ? 'text' : 'password'}
              value={local.apiKey}
              onChange={(e) => updateLocal({ apiKey: e.target.value })}
              placeholder="sk-ant-..."
              style={{ ...INPUT_STYLE, paddingRight: 36 }}
            />
            <button
              onClick={() => setShowKey(!showKey)}
              aria-label={showKey ? 'Hide API key' : 'Show API key'}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}
            >
              {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
        )}

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

        {field(t('settings.model'), (
          <select value={local.model} onChange={(e) => updateLocal({ model: e.target.value })} style={{ ...INPUT_STYLE }}>
            {MODEL_OPTIONS.map((m) => <option key={m.id} value={m.id}>{t(m.labelKey)}</option>)}
          </select>
        ))}

        {field(t('settings.thinkingMode'), (
          <select
            value={local.thinkingLevel ?? 'off'}
            onChange={(e) => updateLocal({ thinkingLevel: e.target.value as 'off' | 'adaptive' })}
            style={{ ...INPUT_STYLE }}
          >
            <option value="off">{t('settings.thinkingOff')}</option>
            <option value="adaptive">{t('settings.thinkingAdaptive')}</option>
          </select>
        ),
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('settings.thinkingHint')}</span>
        )}

        {field(
          t('settings.maxTurns'),
          <input
            type="number"
            min={1}
            max={200}
            value={local.maxTurns ?? ''}
            onChange={(e) => updateLocal({ maxTurns: e.target.value ? Number(e.target.value) : undefined })}
            placeholder={t('settings.unlimited')}
            style={{ ...INPUT_STYLE, width: 120 }}
          />,
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {t('settings.maxTurnsHint')}
          </span>
        )}

        {field(
          t('settings.budgetLimit'),
          <input
            type="number"
            min={0.01}
            step={0.01}
            value={local.maxBudgetUsd ?? ''}
            onChange={(e) => updateLocal({ maxBudgetUsd: e.target.value ? Number(e.target.value) : undefined })}
            placeholder={t('settings.unlimited')}
            style={{ ...INPUT_STYLE, width: 120 }}
          />,
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {t('settings.budgetHint')}
          </span>
        )}
      </SettingsGroup>
      )}

      {/* Group 2: Prompts */}
      {isGroupVisible('prompts') && (
      <SettingsGroup title={t('settings.groups.prompts')} icon={<MessageSquare size={14} />} groupKey="prompts">
        {field(
          t('settings.promptTemplate'),
          <select
            value={
              PROMPT_TEMPLATES.find(tpl => tpl.prompt === (local.systemPrompt ?? ''))?.id
              || (local.systemPrompt?.trim() ? 'custom' : 'none')
            }
            onChange={(e) => {
              const tpl = PROMPT_TEMPLATES.find(t => t.id === e.target.value)
              if (tpl) {
                updateLocal({ systemPrompt: tpl.prompt })
              }
            }}
            style={{ ...INPUT_STYLE }}
          >
            {PROMPT_TEMPLATES.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>{t(tpl.labelKey)}</option>
            ))}
            {!PROMPT_TEMPLATES.find(tpl => tpl.prompt === (local.systemPrompt ?? '')) && local.systemPrompt?.trim() && (
              <option value="custom">{t('settings.promptTemplateCustom')}</option>
            )}
          </select>,
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {t('settings.promptTemplateHint')}
          </span>
        )}

        {field(
          t('settings.systemPrompt'),
          <textarea
            value={local.systemPrompt ?? ''}
            onChange={(e) => updateLocal({ systemPrompt: e.target.value })}
            placeholder={t('settings.systemPromptPlaceholder')}
            rows={4}
            style={{
              ...INPUT_STYLE,
              resize: 'vertical',
              fontFamily: 'inherit',
              lineHeight: 1.5,
              minHeight: 80,
            }}
          />,
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {t('settings.systemPromptHint')}
          </span>
        )}
      </SettingsGroup>
      )}

      {/* Group 3: Appearance */}
      {isGroupVisible('appearance') && (
      <SettingsGroup title={t('settings.groups.appearance')} icon={<Palette size={14} />} groupKey="appearance">
        {field(
          t('settings.language'),
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as 'en' | 'zh-CN' | 'system')}
            style={{ ...INPUT_STYLE }}
          >
            <option value="system">{t('settings.languageSystem')}</option>
            <option value="en">{t('settings.languageEn')}</option>
            <option value="zh-CN">{t('settings.languageZhCN')}</option>
          </select>
        )}

        {field(
          t('settings.displayName'),
          <input
            value={local.displayName || ''}
            onChange={(e) => updateLocal({ displayName: e.target.value.slice(0, 30) })}
            placeholder={t('settings.displayNamePlaceholder')}
            maxLength={30}
            style={{ ...INPUT_STYLE }}
          />,
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('settings.displayNameHint')}</span>
        )}

        {field(t('settings.theme'), (
          <div style={{ display: 'flex', gap: 8 }}>
            {THEMES.map((theme) => {
              const isActive = (local.theme || 'vscode') === theme.id
              return (
                <button
                  key={theme.id}
                  onClick={() => {
                    updateLocal({ theme: theme.id })
                    setPrefs({ theme: theme.id })
                    window.electronAPI.prefsSet('theme', theme.id)
                  }}
                  title={theme.label}
                  aria-label={t(theme.labelKey)}
                  aria-pressed={isActive}
                  style={{
                    flex: 1, border: `2px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 6, padding: '6px 4px', background: theme.colors[0],
                    cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', gap: 2 }}>
                    {theme.colors.map((c, i) => <div key={i} style={{ width: 10, height: 10, borderRadius: 2, background: c }} />)}
                  </div>
                  <span style={{ fontSize: 9, color: theme.id === 'light' ? '#666' : '#aaa', whiteSpace: 'nowrap' }}>{t(theme.labelKey)}</span>
                </button>
              )
            })}
          </div>
        ))}

        {field(
          `${t('settings.fontSize')}: ${local.fontSize ?? 14}px`,
          <input
            type="range" min={12} max={20} step={1}
            value={local.fontSize ?? 14}
            onChange={(e) => updateLocal({ fontSize: Number(e.target.value) })}
            style={{ width: '100%', accentColor: 'var(--accent)' }}
          />
        )}

        {field(t('settings.fontFamily'), (
          <select value={local.fontFamily} onChange={(e) => updateLocal({ fontFamily: e.target.value })} style={{ ...INPUT_STYLE }}>
            {FONT_FAMILIES.map((f) => <option key={f.id} value={f.id}>{f.labelKey ? t(f.labelKey) : f.label}</option>)}
          </select>
        ))}

        {row(
          t('settings.compactMode'),
          <Toggle value={local.compactMode ?? false} onChange={(v) => updateLocal({ compactMode: v })} />,
          t('settings.compactModeHint')
        )}
      </SettingsGroup>
      )}

      {/* Group 4: Workspace */}
      {isGroupVisible('workspace') && (
      <SettingsGroup title={t('settings.groups.workspace')} icon={<FolderOpen size={14} />} groupKey="workspace">
        {field(
          t('settings.workingFolder'),
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={local.workingDir}
              onChange={(e) => updateLocal({ workingDir: e.target.value })}
              placeholder={t('settings.workingFolderPlaceholder')}
              style={{ ...INPUT_STYLE, flex: 1 }}
            />
            <button
              onClick={async () => {
                const p = await window.electronAPI.fsShowOpenDialog()
                if (p) updateLocal({ workingDir: p })
              }}
              aria-label={t('settings.browse')}
              style={{ background: 'var(--bg-active)', border: '1px solid var(--border)', borderRadius: 4, padding: '0 10px', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12 }}
            >
              {t('settings.browse')}
            </button>
          </div>,
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('settings.workingFolderHint')}</span>
        )}

        {field(t('tags.sectionTitle'), (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {TAG_PRESETS_SETTINGS.map((tag, idx) => (
              <div key={tag.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: tag.color, flexShrink: 0 }} />
                <input
                  value={localTagNames[idx]}
                  onChange={(e) => {
                    const updated = [...localTagNames]
                    updated[idx] = e.target.value
                    setLocalTagNames(updated)
                    setPrefs({ tagNames: updated })
                    window.electronAPI.prefsSet('tagNames', updated)
                  }}
                  placeholder={t('tags.tagNamePlaceholder')}
                  style={{ ...INPUT_STYLE, flex: 1 }}
                />
              </div>
            ))}
          </div>
        ))}
      </SettingsGroup>
      )}

      {/* Group 5: Behavior */}
      {isGroupVisible('behavior') && (
      <SettingsGroup title={t('settings.groups.behavior')} icon={<Settings2 size={14} />} groupKey="behavior">
        {row(
          t('settings.skipPermissions'),
          <Toggle value={local.skipPermissions ?? true} onChange={(v) => updateLocal({ skipPermissions: v })} />,
          t('settings.skipPermissionsHint')
        )}

        {row(
          t('settings.verbose'),
          <Toggle value={local.verbose ?? false} onChange={(v) => updateLocal({ verbose: v })} />,
          t('settings.verboseHint')
        )}

        {row(
          t('settings.completionSound'),
          <Toggle value={local.notifySound !== false} onChange={(v) => updateLocal({ notifySound: v })} />,
          t('settings.completionSoundHint')
        )}

        {row(
          t('settings.desktopNotifications'),
          <Toggle value={local.desktopNotifications !== false} onChange={(v) => updateLocal({ desktopNotifications: v })} />,
          t('settings.desktopNotificationsHint')
        )}

        {field(
          t('settings.responseTone'),
          <select
            value={local.responseTone || 'default'}
            onChange={(e) => {
              updateLocal({ responseTone: e.target.value })
              setPrefs({ responseTone: e.target.value as any })
              window.electronAPI.prefsSet('responseTone', e.target.value)
            }}
            style={{ ...INPUT_STYLE }}
          >
            <option value="default">{t('tone.default')}</option>
            <option value="concise">{t('tone.concise')}</option>
            <option value="detailed">{t('tone.detailed')}</option>
            <option value="professional">{t('tone.professional')}</option>
            <option value="casual">{t('tone.casual')}</option>
            <option value="creative">{t('tone.creative')}</option>
          </select>,
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('settings.responseToneHint')}</span>
        )}

        {row(
          t('settings.systemPresence'),
          <Toggle value={local.systemPresence !== false} onChange={(v) => updateLocal({ systemPresence: v })} />,
          t('settings.systemPresenceHint')
        )}
      </SettingsGroup>
      )}

      {/* Save button */}
      <button
        onClick={onSave}
        aria-label={saved ? t('settings.saved') : t('settings.save')}
        style={{
          background: saved ? 'var(--success)' : 'var(--accent)',
          border: 'none', borderRadius: 4, padding: '8px 16px',
          color: '#fff', cursor: 'pointer', fontSize: 12,
          display: 'flex', alignItems: 'center', gap: 6,
          width: '100%', justifyContent: 'center', marginTop: 4,
        }}
      >
        <Save size={13} />
        {saved ? t('settings.saved') : t('settings.save')}
      </button>
    </>
  )
}
