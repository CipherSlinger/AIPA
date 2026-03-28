import React, { useEffect, useState } from 'react'
import { Save, Eye, EyeOff, ExternalLink, Plus, Pencil, Trash2 } from 'lucide-react'
import { usePrefsStore } from '../../store'
import { useI18n } from '../../i18n'
import { PROMPT_TEMPLATES } from '../../utils/promptTemplates'
import type { CustomPromptTemplate } from '../../types/app.types'

const TAG_PRESETS_SETTINGS = [
  { id: 'tag-1', color: '#3b82f6', defaultKey: 'tags.work' },
  { id: 'tag-2', color: '#22c55e', defaultKey: 'tags.personal' },
  { id: 'tag-3', color: '#f59e0b', defaultKey: 'tags.research' },
  { id: 'tag-4', color: '#ef4444', defaultKey: 'tags.debug' },
  { id: 'tag-5', color: '#8b5cf6', defaultKey: 'tags.docs' },
  { id: 'tag-6', color: '#6b7280', defaultKey: 'tags.archive' },
]

const MODEL_OPTIONS: { id: string; labelKey: string }[] = [
  { id: 'claude-opus-4-6',            labelKey: 'settings.models.opus46' },
  { id: 'claude-sonnet-4-6',          labelKey: 'settings.models.sonnet46' },
  { id: 'claude-haiku-4-5',           labelKey: 'settings.models.haiku45' },
  { id: 'claude-opus-4',              labelKey: 'settings.models.opus4' },
  { id: 'claude-sonnet-4-5',          labelKey: 'settings.models.sonnet45' },
  { id: 'claude-3-7-sonnet-20250219', labelKey: 'settings.models.sonnet37' },
  { id: 'claude-3-5-sonnet-20241022', labelKey: 'settings.models.sonnet35' },
  { id: 'claude-3-5-haiku-20241022',  labelKey: 'settings.models.haiku35' },
]

const FONT_FAMILIES: { id: string; label: string }[] = [
  { id: "'Cascadia Code', 'Fira Code', Consolas, monospace", label: 'Cascadia Code' },
  { id: "'Fira Code', Consolas, monospace",                  label: 'Fira Code' },
  { id: "'JetBrains Mono', Consolas, monospace",             label: 'JetBrains Mono' },
  { id: "Consolas, 'Courier New', monospace",                label: 'Consolas' },
  { id: 'system-ui, sans-serif',                             label: 'System Default' },
]

const THEMES: { id: 'vscode' | 'light'; label: string; labelKey: string; colors: string[] }[] = [
  { id: 'vscode',   label: 'Dark',   labelKey: 'settings.themeDark',  colors: ['#1e1e1e', '#007acc', '#264f78', '#2d2d2d'] },
  { id: 'light',    label: 'Light',  labelKey: 'settings.themeLight', colors: ['#ffffff', '#2563eb', '#f3f4f6', '#f5f5f5'] },
]

// PROMPT_TEMPLATES is imported from ../../utils/promptTemplates as PROMPT_TEMPLATES

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 36, height: 20, borderRadius: 10,
        background: value ? 'var(--accent)' : 'var(--border)',
        border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0,
        transition: 'background 0.2s',
      }}
    >
      <span style={{
        position: 'absolute', top: 2,
        left: value ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%',
        background: '#fff', transition: 'left 0.2s',
        display: 'block',
      }} />
    </button>
  )
}

export default function SettingsPanel() {
  const { prefs, setPrefs } = usePrefsStore()
  const { t, locale, setLocale } = useI18n()
  const [local, setLocal] = useState({ ...prefs })
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'general' | 'templates' | 'mcp' | 'about'>('general')
  const [mcpServers, setMcpServers] = useState<{ name: string; command?: string; disabled?: boolean }[]>([])
  const defaultTagNames = TAG_PRESETS_SETTINGS.map(tp => t(tp.defaultKey))
  const [localTagNames, setLocalTagNames] = useState<string[]>(prefs.tagNames || defaultTagNames)

  // Custom prompt templates state
  const [customTemplates, setCustomTemplates] = useState<CustomPromptTemplate[]>(prefs.customPromptTemplates || [])
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [templateFormName, setTemplateFormName] = useState('')
  const [templateFormPrompt, setTemplateFormPrompt] = useState('')
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const all = await window.electronAPI.prefsGetAll()
      const env = await window.electronAPI.configGetEnv()
      setLocal({ ...all, apiKey: all.apiKey || env.apiKey || '' })
      if (all.customPromptTemplates) {
        setCustomTemplates(all.customPromptTemplates)
      }
    }
    load()
  }, [])

  useEffect(() => {
    if (settingsTab === 'mcp') {
      window.electronAPI.mcpList().then(setMcpServers)
    }
  }, [settingsTab])

  const save = async () => {
    setPrefs(local)
    await window.electronAPI.configSetApiKey(local.apiKey)
    for (const [k, v] of Object.entries(local)) {
      if (k !== 'apiKey') await window.electronAPI.prefsSet(k, v)
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
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
    <div style={{ padding: 14, overflowY: 'auto', height: '100%' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>{t('settings.title')}</div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
        {(['general', 'templates', 'mcp', 'about'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setSettingsTab(tab)}
            style={{
              background: settingsTab === tab ? 'var(--accent)' : 'none',
              border: '1px solid ' + (settingsTab === tab ? 'var(--accent)' : 'var(--border)'),
              borderRadius: 4,
              padding: '3px 10px',
              color: settingsTab === tab ? '#fff' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            {t(`settings.tabs.${tab}`)}
          </button>
        ))}
      </div>

      {settingsTab === 'general' ? (
        <>
          {/* Language selector */}
          {field(
            t('settings.language'),
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value as 'en' | 'zh-CN' | 'system')}
              style={{ ...inputStyle }}
            >
              <option value="system">{t('settings.languageSystem')}</option>
              <option value="en">{t('settings.languageEn')}</option>
              <option value="zh-CN">{t('settings.languageZhCN')}</option>
            </select>
          )}

          {/* API Key */}
          {field(
            t('settings.apiKey'),
            <div style={{ position: 'relative' }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={local.apiKey}
                onChange={(e) => setLocal({ ...local, apiKey: e.target.value })}
                placeholder="sk-ant-..."
                style={{ ...inputStyle, paddingRight: 36 }}
              />
              <button
                onClick={() => setShowKey(!showKey)}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}
              >
                {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          )}

          {/* Model */}
          {field(t('settings.model'), (
            <select value={local.model} onChange={(e) => setLocal({ ...local, model: e.target.value })} style={{ ...inputStyle }}>
              {MODEL_OPTIONS.map((m) => <option key={m.id} value={m.id}>{t(m.labelKey)}</option>)}
            </select>
          ))}

          {/* System prompt template selector */}
          {field(
            t('settings.promptTemplate'),
            <select
              value={
                PROMPT_TEMPLATES.find(tpl => tpl.prompt === (local.systemPrompt ?? ''))?.id
                || customTemplates.find(ct => ct.prompt === (local.systemPrompt ?? ''))?.id
                || (local.systemPrompt?.trim() ? 'custom' : 'none')
              }
              onChange={(e) => {
                const tpl = PROMPT_TEMPLATES.find(t => t.id === e.target.value)
                if (tpl) {
                  setLocal({ ...local, systemPrompt: tpl.prompt })
                } else {
                  const customTpl = customTemplates.find(ct => ct.id === e.target.value)
                  if (customTpl) {
                    setLocal({ ...local, systemPrompt: customTpl.prompt })
                  }
                }
              }}
              style={{ ...inputStyle }}
            >
              {PROMPT_TEMPLATES.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>{t(tpl.labelKey)}</option>
              ))}
              {customTemplates.length > 0 && (
                <option disabled>{'---'}</option>
              )}
              {customTemplates.map((ct) => (
                <option key={ct.id} value={ct.id}>{ct.name} {t('settings.templates.customSuffix')}</option>
              ))}
              {!PROMPT_TEMPLATES.find(tpl => tpl.prompt === (local.systemPrompt ?? '')) && !customTemplates.find(ct => ct.prompt === (local.systemPrompt ?? '')) && local.systemPrompt?.trim() && (
                <option value="custom">{t('settings.promptTemplateCustom')}</option>
              )}
            </select>,
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {t('settings.promptTemplateHint')}
            </span>
          )}

          {/* System prompt */}
          {field(
            t('settings.systemPrompt'),
            <textarea
              value={local.systemPrompt ?? ''}
              onChange={(e) => setLocal({ ...local, systemPrompt: e.target.value })}
              placeholder={t('settings.systemPromptPlaceholder')}
              rows={4}
              style={{
                ...inputStyle,
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

          {/* Thinking level */}
          {field(t('settings.thinkingMode'), (
            <select
              value={local.thinkingLevel ?? 'off'}
              onChange={(e) => setLocal({ ...local, thinkingLevel: e.target.value as 'off' | 'adaptive' })}
              style={{ ...inputStyle }}
            >
              <option value="off">{t('settings.thinkingOff')}</option>
              <option value="adaptive">{t('settings.thinkingAdaptive')}</option>
            </select>
          ),
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('settings.thinkingHint')}</span>
          )}

          {/* Max turns */}
          {field(
            t('settings.maxTurns'),
            <input
              type="number"
              min={1}
              max={200}
              value={local.maxTurns ?? ''}
              onChange={(e) => setLocal({ ...local, maxTurns: e.target.value ? Number(e.target.value) : undefined })}
              placeholder={t('settings.unlimited')}
              style={{ ...inputStyle, width: 120 }}
            />,
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {t('settings.maxTurnsHint')}
            </span>
          )}

          {/* Max budget */}
          {field(
            t('settings.budgetLimit'),
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={local.maxBudgetUsd ?? ''}
              onChange={(e) => setLocal({ ...local, maxBudgetUsd: e.target.value ? Number(e.target.value) : undefined })}
              placeholder={t('settings.unlimited')}
              style={{ ...inputStyle, width: 120 }}
            />,
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {t('settings.budgetHint')}
            </span>
          )}

          {/* Working dir */}
          {field(
            t('settings.workingFolder'),
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={local.workingDir}
                onChange={(e) => setLocal({ ...local, workingDir: e.target.value })}
                placeholder={t('settings.workingFolderPlaceholder')}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={async () => {
                  const p = await window.electronAPI.fsShowOpenDialog()
                  if (p) setLocal({ ...local, workingDir: p })
                }}
                style={{ background: 'var(--bg-active)', border: '1px solid var(--border)', borderRadius: 4, padding: '0 10px', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12 }}
              >
                {t('settings.browse')}
              </button>
            </div>,
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('settings.workingFolderHint')}</span>
          )}

          {/* Font size */}
          {field(
            `${t('settings.fontSize')}: ${local.fontSize ?? 14}px`,
            <input
              type="range" min={12} max={20} step={1}
              value={local.fontSize ?? 14}
              onChange={(e) => setLocal({ ...local, fontSize: Number(e.target.value) })}
              style={{ width: '100%', accentColor: 'var(--accent)' }}
            />
          )}

          {/* Font family */}
          {field(t('settings.fontFamily'), (
            <select value={local.fontFamily} onChange={(e) => setLocal({ ...local, fontFamily: e.target.value })} style={{ ...inputStyle }}>
              {FONT_FAMILIES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          ))}

          {/* Theme */}
          {field(t('settings.theme'), (
            <div style={{ display: 'flex', gap: 8 }}>
              {THEMES.map((t) => {
                const isActive = (local.theme || 'vscode') === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setLocal({ ...local, theme: t.id })
                      setPrefs({ theme: t.id })
                      window.electronAPI.prefsSet('theme', t.id)
                    }}
                    title={t.label}
                    style={{
                      flex: 1, border: `2px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 6, padding: '6px 4px', background: t.colors[0],
                      cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    }}
                  >
                    <div style={{ display: 'flex', gap: 2 }}>
                      {t.colors.map((c, i) => <div key={i} style={{ width: 10, height: 10, borderRadius: 2, background: c }} />)}
                    </div>
                    <span style={{ fontSize: 9, color: t.id === 'light' ? '#666' : '#aaa', whiteSpace: 'nowrap' }}>{t.label}</span>
                  </button>
                )
              })}
            </div>
          ))}

          {/* Tags */}
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
                      // Auto-save tag names
                      setPrefs({ tagNames: updated })
                      window.electronAPI.prefsSet('tagNames', updated)
                    }}
                    placeholder={t('tags.tagNamePlaceholder')}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                </div>
              ))}
            </div>
          ))}

          {/* Divider */}
          <div style={{ borderTop: '1px solid var(--border)', marginBottom: 14 }} />

          {/* skipPermissions */}
          {row(
            t('settings.skipPermissions'),
            <Toggle value={local.skipPermissions ?? true} onChange={(v) => setLocal({ ...local, skipPermissions: v })} />,
            t('settings.skipPermissionsHint')
          )}

          {/* verbose */}
          {row(
            t('settings.verbose'),
            <Toggle value={local.verbose ?? false} onChange={(v) => setLocal({ ...local, verbose: v })} />,
            t('settings.verboseHint')
          )}

          {/* notifySound */}
          {row(
            t('settings.completionSound'),
            <Toggle value={local.notifySound !== false} onChange={(v) => setLocal({ ...local, notifySound: v })} />,
            t('settings.completionSoundHint')
          )}

          {/* compactMode */}
          {row(
            t('settings.compactMode'),
            <Toggle value={local.compactMode ?? false} onChange={(v) => setLocal({ ...local, compactMode: v })} />,
            t('settings.compactModeHint')
          )}

          {/* desktopNotifications */}
          {row(
            t('settings.desktopNotifications'),
            <Toggle value={local.desktopNotifications !== false} onChange={(v) => setLocal({ ...local, desktopNotifications: v })} />,
            t('settings.desktopNotificationsHint')
          )}

          {/* Save button */}
          <button
            onClick={save}
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
      ) : settingsTab === 'templates' ? (
        /* Templates tab */
        <div>
          {/* Built-in templates (read-only) */}
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>{t('settings.templates.builtIn')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
            {PROMPT_TEMPLATES.filter(tpl => tpl.id !== 'none').map(tpl => (
              <div
                key={tpl.id}
                style={{
                  padding: '8px 12px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  opacity: 0.7,
                }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{t(tpl.labelKey)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tpl.prompt.slice(0, 80)}{tpl.prompt.length > 80 ? '...' : ''}
                  </div>
                </div>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', background: 'var(--border)', padding: '1px 6px', borderRadius: 3, flexShrink: 0 }}>
                  {t('settings.templates.builtInBadge')}
                </span>
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid var(--border)', marginBottom: 14 }} />

          {/* Custom templates */}
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>
            {t('settings.templates.myTemplates')} ({customTemplates.length}/20)
          </div>

          {customTemplates.length === 0 && !showAddForm && (
            <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>
              {t('settings.templates.emptyState')}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            {customTemplates.map(ct => (
              <div key={ct.id}>
                {editingTemplateId === ct.id ? (
                  /* Inline edit mode */
                  <div style={{ padding: '10px 12px', background: 'var(--bg-input)', border: '1px solid var(--accent)', borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>{t('settings.templates.templateName')}</div>
                    <input
                      value={templateFormName}
                      onChange={(e) => setTemplateFormName(e.target.value)}
                      placeholder={t('settings.templates.templateNamePlaceholder')}
                      maxLength={50}
                      style={{ ...inputStyle, marginBottom: 8 }}
                      autoFocus
                    />
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>{t('settings.templates.templatePrompt')}</div>
                    <textarea
                      value={templateFormPrompt}
                      onChange={(e) => setTemplateFormPrompt(e.target.value)}
                      placeholder={t('settings.templates.templatePromptPlaceholder')}
                      maxLength={5000}
                      rows={4}
                      style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, minHeight: 80, marginBottom: 8 }}
                    />
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => { setEditingTemplateId(null); setTemplateFormName(''); setTemplateFormPrompt('') }}
                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 12px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11 }}
                      >{t('settings.templates.cancel')}</button>
                      <button
                        onClick={() => {
                          if (!templateFormName.trim() || !templateFormPrompt.trim()) return
                          const updated = customTemplates.map(c =>
                            c.id === ct.id ? { ...c, name: templateFormName.trim(), prompt: templateFormPrompt.trim(), updatedAt: Date.now() } : c
                          )
                          setCustomTemplates(updated)
                          setPrefs({ customPromptTemplates: updated })
                          window.electronAPI.prefsSet('customPromptTemplates', updated)
                          setEditingTemplateId(null)
                          setTemplateFormName('')
                          setTemplateFormPrompt('')
                        }}
                        disabled={!templateFormName.trim() || !templateFormPrompt.trim()}
                        style={{ background: 'var(--accent)', border: 'none', borderRadius: 4, padding: '4px 12px', color: '#fff', cursor: templateFormName.trim() && templateFormPrompt.trim() ? 'pointer' : 'not-allowed', fontSize: 11, opacity: templateFormName.trim() && templateFormPrompt.trim() ? 1 : 0.5 }}
                      >{t('settings.templates.save')}</button>
                    </div>
                  </div>
                ) : (
                  /* Display mode */
                  <div
                    style={{
                      padding: '10px 12px',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{ct.name}</div>
                      <div style={{
                        fontSize: 11, color: 'var(--text-muted)', marginTop: 2,
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      }}>
                        {ct.prompt}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button
                        onClick={() => {
                          setEditingTemplateId(ct.id)
                          setTemplateFormName(ct.name)
                          setTemplateFormPrompt(ct.prompt)
                          setShowAddForm(false)
                        }}
                        aria-label={t('settings.templates.editTemplate')}
                        title={t('settings.templates.editTemplate')}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 4, borderRadius: 4 }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => {
                          if (deletingTemplateId === ct.id) {
                            // Second click: confirm delete
                            const updated = customTemplates.filter(c => c.id !== ct.id)
                            setCustomTemplates(updated)
                            setPrefs({ customPromptTemplates: updated })
                            window.electronAPI.prefsSet('customPromptTemplates', updated)
                            setDeletingTemplateId(null)
                          } else {
                            setDeletingTemplateId(ct.id)
                            setTimeout(() => setDeletingTemplateId(prev => prev === ct.id ? null : prev), 2000)
                          }
                        }}
                        aria-label={deletingTemplateId === ct.id ? t('settings.templates.confirmDelete') : t('settings.templates.deleteTemplate')}
                        title={deletingTemplateId === ct.id ? t('settings.templates.confirmDelete') : t('settings.templates.deleteTemplate')}
                        style={{
                          background: 'none', border: 'none',
                          color: deletingTemplateId === ct.id ? 'var(--error)' : 'var(--text-muted)',
                          cursor: 'pointer', display: 'flex', padding: 4, borderRadius: 4,
                          fontWeight: deletingTemplateId === ct.id ? 600 : 400,
                          fontSize: deletingTemplateId === ct.id ? 10 : 'inherit',
                        }}
                        onMouseEnter={(e) => { if (deletingTemplateId !== ct.id) e.currentTarget.style.color = 'var(--error)' }}
                        onMouseLeave={(e) => { if (deletingTemplateId !== ct.id) e.currentTarget.style.color = 'var(--text-muted)' }}
                      >
                        {deletingTemplateId === ct.id ? t('settings.templates.confirmDelete') : <Trash2 size={13} />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add template form */}
          {showAddForm && (
            <div style={{ padding: '10px 12px', background: 'var(--bg-input)', border: '1px solid var(--accent)', borderRadius: 6, marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>{t('settings.templates.templateName')}</div>
              <input
                value={templateFormName}
                onChange={(e) => setTemplateFormName(e.target.value)}
                placeholder={t('settings.templates.templateNamePlaceholder')}
                maxLength={50}
                style={{ ...inputStyle, marginBottom: 8 }}
                autoFocus
              />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>{t('settings.templates.templatePrompt')}</div>
              <textarea
                value={templateFormPrompt}
                onChange={(e) => setTemplateFormPrompt(e.target.value)}
                placeholder={t('settings.templates.templatePromptPlaceholder')}
                maxLength={5000}
                rows={4}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, minHeight: 80, marginBottom: 8 }}
              />
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => { setShowAddForm(false); setTemplateFormName(''); setTemplateFormPrompt('') }}
                  style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 12px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11 }}
                >{t('settings.templates.cancel')}</button>
                <button
                  onClick={() => {
                    if (!templateFormName.trim() || !templateFormPrompt.trim()) return
                    const newTemplate: CustomPromptTemplate = {
                      id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                      name: templateFormName.trim(),
                      prompt: templateFormPrompt.trim(),
                      createdAt: Date.now(),
                      updatedAt: Date.now(),
                    }
                    const updated = [...customTemplates, newTemplate]
                    setCustomTemplates(updated)
                    setPrefs({ customPromptTemplates: updated })
                    window.electronAPI.prefsSet('customPromptTemplates', updated)
                    setShowAddForm(false)
                    setTemplateFormName('')
                    setTemplateFormPrompt('')
                  }}
                  disabled={!templateFormName.trim() || !templateFormPrompt.trim()}
                  style={{ background: 'var(--accent)', border: 'none', borderRadius: 4, padding: '4px 12px', color: '#fff', cursor: templateFormName.trim() && templateFormPrompt.trim() ? 'pointer' : 'not-allowed', fontSize: 11, opacity: templateFormName.trim() && templateFormPrompt.trim() ? 1 : 0.5 }}
                >{t('settings.templates.save')}</button>
              </div>
            </div>
          )}

          {/* Add template button */}
          {!showAddForm && customTemplates.length < 20 && (
            <button
              onClick={() => {
                setShowAddForm(true)
                setEditingTemplateId(null)
                setTemplateFormName('')
                setTemplateFormPrompt('')
              }}
              style={{
                background: 'none', border: '1px dashed var(--border)', borderRadius: 6,
                padding: '8px 16px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12,
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              <Plus size={14} />
              {t('settings.templates.addTemplate')}
            </button>
          )}
          {customTemplates.length >= 20 && !showAddForm && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: 8 }}>
              {t('settings.templates.limitReached')}
            </div>
          )}
        </div>
      ) : settingsTab === 'mcp' ? (
        /* MCP tab */
        <div>
          {mcpServers.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: 24 }}>
              {t('settings.noMcpServers')}<br />
              <span style={{ fontSize: 11, marginTop: 4, display: 'block' }}>{t('settings.mcpHint')}</span>
            </div>
          ) : (
            mcpServers.map(srv => (
              <div key={srv.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{srv.name}</div>
                  {srv.command && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'monospace' }}>{srv.command}</div>}
                </div>
                <Toggle
                  value={!srv.disabled}
                  onChange={async (v) => {
                    await window.electronAPI.mcpSetEnabled(srv.name, v)
                    setMcpServers(prev => prev.map(s => s.name === srv.name ? { ...s, disabled: !v } : s))
                  }}
                />
              </div>
            ))
          )}
        </div>
      ) : (
        /* About tab */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* App identity */}
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-bright)', letterSpacing: 1 }}>AIPA</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{t('settings.about.aiPersonalAssistant')}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{t('settings.about.version')}</div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)' }} />

          {/* Links */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>{t('settings.about.links')}</div>
            {[
              { label: t('settings.about.githubRepo'), url: 'https://github.com/anthropics/claude-code' },
              { label: t('settings.about.anthropicConsole'), url: 'https://console.anthropic.com/' },
              { label: t('settings.about.apiDocs'), url: 'https://docs.anthropic.com/' },
              { label: t('settings.about.getApiKey'), url: 'https://console.anthropic.com/settings/keys' },
            ].map(link => (
              <button
                key={link.url}
                onClick={() => window.electronAPI.shellOpenExternal(link.url)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '7px 10px', marginBottom: 4, background: 'none',
                  border: '1px solid var(--border)', borderRadius: 4,
                  color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12,
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                <ExternalLink size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                {link.label}
              </button>
            ))}
          </div>

          <div style={{ borderTop: '1px solid var(--border)' }} />

          {/* Keyboard shortcuts */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>{t('settings.about.keyboardShortcuts')}</div>
            {[
              { keys: 'Ctrl + B', action: t('settings.about.toggleSidebar') },
              { keys: 'Ctrl + `', action: t('settings.about.toggleTerminal') },
              { keys: 'Ctrl + N', action: t('settings.about.newConversation') },
              { keys: 'Ctrl + F', action: t('settings.about.searchInConversation') },
              { keys: 'Enter', action: t('settings.about.sendMessage') },
              { keys: 'Shift + Enter', action: t('settings.about.newLine') },
              { keys: '@', action: t('settings.about.mentionFile') },
              { keys: '/', action: t('settings.about.slashCommands') },
            ].map(shortcut => (
              <div
                key={shortcut.keys}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}
              >
                <span style={{ fontSize: 11, color: 'var(--text-primary)' }}>{shortcut.action}</span>
                <kbd style={{
                  fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-input)',
                  border: '1px solid var(--border)', borderRadius: 3, padding: '1px 6px',
                  fontFamily: 'inherit',
                }}>{shortcut.keys}</kbd>
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid var(--border)' }} />

          {/* Runtime info */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>{t('settings.about.runtime')}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.8 }}>
              Electron {window.electronAPI.versions?.electron || 'N/A'}<br />
              Node.js {window.electronAPI.versions?.node || 'N/A'}<br />
              Chromium {window.electronAPI.versions?.chrome || 'N/A'}
            </div>
          </div>

          {/* Reset defaults */}
          <button
            onClick={async () => {
              const defaults = {
                model: 'claude-sonnet-4-6',
                fontSize: 14,
                fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
                theme: 'vscode' as const,
                skipPermissions: true,
                verbose: false,
                workingDir: '',
                systemPrompt: '',
                thinkingLevel: 'off' as const,
                maxTurns: undefined,
                maxBudgetUsd: undefined,
                notifySound: true,
                compactMode: false,
                desktopNotifications: true,
              }
              setLocal(prev => ({ ...prev, ...defaults }))
              for (const [k, v] of Object.entries(defaults)) {
                await window.electronAPI.prefsSet(k, v)
              }
              setPrefs(defaults)
              setSaved(true)
              setTimeout(() => setSaved(false), 2000)
            }}
            style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: 4,
              padding: '8px 16px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12,
              width: '100%', textAlign: 'center', marginTop: 4,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--error)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            {t('settings.about.resetDefaults')}
          </button>
        </div>
      )}
    </div>
  )
}
