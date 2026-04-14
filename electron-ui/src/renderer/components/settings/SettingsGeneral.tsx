import React, { useState, useMemo, useEffect, useRef } from 'react'
import { Save, Eye, EyeOff, Brain, MessageSquare, Palette, FolderOpen, Settings2, Search, X } from 'lucide-react'
import { usePrefsStore } from '../../store'
import { useI18n } from '../../i18n'
import { PROMPT_TEMPLATES } from '../../utils/promptTemplates'
import SettingsGroup from './SettingsGroup'
import SettingsApiKeyPool from './SettingsApiKeyPool'
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

  // cleanupPeriodDays — reads/writes directly to ~/.claude/settings.json via IPC
  const [cleanupDays, setCleanupDays] = useState<number>(30)
  const [cleanupDaysInput, setCleanupDaysInput] = useState<string>('30')
  const cleanupDaysLastValid = useRef<number>(30)

  // aiReplyLanguage — reads/writes `language` field in ~/.claude/settings.json via IPC
  const [aiReplyLanguage, setAiReplyLanguage] = useState<string>('')

  useEffect(() => {
    window.electronAPI.configReadCLISettings().then((cliSettings: Record<string, unknown>) => {
      const val = typeof cliSettings.cleanupPeriodDays === 'number' ? cliSettings.cleanupPeriodDays : 30
      setCleanupDays(val)
      setCleanupDaysInput(String(val))
      cleanupDaysLastValid.current = val
      const lang = typeof cliSettings.language === 'string' ? cliSettings.language : ''
      setAiReplyLanguage(lang)
    }).catch(() => {})
  }, [])

  const groupKeywords = useMemo(() => ({
    aiEngine: [t('settings.apiKey'), t('settings.model'), t('settings.advisorModel'), t('settings.thinkingMode'), t('settings.maxTurns'), t('settings.budgetLimit'), t('settings.aiReplyLanguage'), 'API', 'Claude', 'Opus', 'Sonnet', 'Haiku', t('settings.groups.aiEngine'), 'advisor', 'language'].join(' ').toLowerCase(),
    prompts: [t('settings.promptTemplate'), t('settings.systemPrompt'), t('settings.groups.prompts')].join(' ').toLowerCase(),
    appearance: [t('settings.language'), t('settings.displayName'), t('settings.theme'), t('settings.fontSize'), t('settings.fontFamily'), t('settings.compactMode'), t('settings.groups.appearance')].join(' ').toLowerCase(),
    workspace: [t('settings.workingFolder'), t('tags.sectionTitle'), t('settings.groups.workspace')].join(' ').toLowerCase(),
    behavior: [t('settings.skipPermissions'), t('settings.verbose'), t('settings.completionSound'), t('settings.desktopNotifications'), t('settings.resumeLastSession'), t('outputStyle.title'), t('thinking.title'), t('settings.systemPresence'), t('compact.autoCompact'), t('autoMemory.enabled'), t('settings.groups.behavior'), t('settings.cleanupPeriodDays')].join(' ').toLowerCase(),
  }), [t])

  const isGroupVisible = (groupKey: string): boolean => {
    if (!settingsFilter.trim()) return true
    const kw = groupKeywords[groupKey as keyof typeof groupKeywords]
    return kw ? kw.includes(settingsFilter.toLowerCase()) : true
  }

  const field = (label: string, content: React.ReactNode, hint?: React.ReactNode) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 6 }}>{label}</div>
      {content}
      {hint && <div style={{ marginTop: 5, fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.5 }}>{hint}</div>}
    </div>
  )

  const row = (label: string, control: React.ReactNode, hint?: string) => (
    <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2, lineHeight: 1.5 }}>{hint}</div>}
      </div>
      {control}
    </div>
  )

  const updateLocal = (patch: Record<string, any>) => setLocal((prev: any) => ({ ...prev, ...patch }))

  return (
    <>
      {/* Settings search */}
      <div style={{ marginBottom: 12, position: 'relative', display: 'flex', alignItems: 'center' }}>
        <Search size={14} style={{ position: 'absolute', left: 10, color: 'var(--text-faint)', pointerEvents: 'none' }} />
        <input
          value={settingsFilter}
          onChange={(e) => setSettingsFilter(e.target.value)}
          placeholder={t('settings.searchPlaceholder')}
          aria-label={t('settings.searchPlaceholder')}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.10)' }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.boxShadow = 'none' }}
          style={{
            ...INPUT_STYLE,
            paddingLeft: 30,
            paddingRight: settingsFilter ? 28 : 10,
          }}
        />
        {settingsFilter && (
          <button
            onClick={() => setSettingsFilter('')}
            aria-label={t('a11y.clearSearch')}
            style={{ position: 'absolute', right: 8, background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 2, transition: 'all 0.15s ease' }}
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
              onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.10)' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.boxShadow = 'none' }}
              style={{ ...INPUT_STYLE, paddingRight: 36 }}
            />
            <button
              onClick={() => setShowKey(!showKey)}
              aria-label={showKey ? t('settingsAdvanced.hideApiKey') : t('settingsAdvanced.showApiKey')}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3px 4px', borderRadius: 4, transition: 'all 0.15s ease' }}
            >
              {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
        )}

        <SettingsApiKeyPool field={field} />

        {field(t('settings.model'), (
          <select value={local.model} onChange={(e) => updateLocal({ model: e.target.value })} style={{ ...INPUT_STYLE }}>
            {MODEL_OPTIONS.map((m) => <option key={m.id} value={m.id}>{t(m.labelKey)}</option>)}
          </select>
        ))}

        {field(t('settings.advisorModel'), (
          <select
            value={local.advisorModel ?? ''}
            onChange={(e) => updateLocal({ advisorModel: e.target.value || undefined })}
            style={{ ...INPUT_STYLE }}
          >
            <option value="">{t('settings.advisorModelSame')}</option>
            {MODEL_OPTIONS.map((m) => <option key={m.id} value={m.id}>{t(m.labelKey)}</option>)}
          </select>
        ),
          <span style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.5 }}>{t('settings.advisorModelHint')}</span>
        )}

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
          <span style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.5 }}>{t('settings.thinkingHint')}</span>
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
            onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.10)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.boxShadow = 'none' }}
            style={{ ...INPUT_STYLE, width: 120 }}
          />,
          <span style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.5 }}>
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
            onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.10)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.boxShadow = 'none' }}
            style={{ ...INPUT_STYLE, width: 120 }}
          />,
          <span style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.5 }}>
            {t('settings.budgetHint')}
          </span>
        )}

        {field(
          t('settings.aiReplyLanguage'),
          <select
            value={aiReplyLanguage}
            onChange={(e) => {
              const next = e.target.value
              setAiReplyLanguage(next)
              // Empty string = remove the field (follow system)
              window.electronAPI.configWriteCLISettings({ language: next || '' }).catch(() => {})
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.10)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'; e.currentTarget.style.boxShadow = 'none' }}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--glass-border-md)',
              borderRadius: 6,
              color: 'var(--text-primary)',
              padding: '6px 10px',
              fontSize: 13,
              outline: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              appearance: 'none',
              WebkitAppearance: 'none',
              width: '100%',
            }}
          >
            <option value="">{t('settings.aiReplyLanguageSystem')}</option>
            <option value="zh-CN">{t('settings.aiReplyLanguageZhCN')}</option>
            <option value="zh-TW">{t('settings.aiReplyLanguageZhTW')}</option>
            <option value="en">{t('settings.aiReplyLanguageEn')}</option>
            <option value="ja">{t('settings.aiReplyLanguageJa')}</option>
            <option value="ko">{t('settings.aiReplyLanguageKo')}</option>
            <option value="fr">{t('settings.aiReplyLanguageFr')}</option>
            <option value="de">{t('settings.aiReplyLanguageDe')}</option>
            <option value="es">{t('settings.aiReplyLanguageEs')}</option>
          </select>,
          <span style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.5 }}>
            {t('settings.aiReplyLanguageHint')}
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
          <span style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.5 }}>
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
            onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.10)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.boxShadow = 'none' }}
            style={{
              ...INPUT_STYLE,
              resize: 'vertical',
              fontFamily: 'inherit',
              lineHeight: 1.5,
              minHeight: 80,
            }}
          />,
          <span style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.5 }}>
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
            onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.10)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.boxShadow = 'none' }}
            style={{ ...INPUT_STYLE }}
          />,
          <span style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.5 }}>{t('settings.displayNameHint')}</span>
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
                    flex: 1, border: `2px solid ${isActive ? 'rgba(99,102,241,0.8)' : 'rgba(255,255,255,0.09)'}`,
                    borderRadius: 8, padding: '6px 4px', background: theme.id === 'light' ? theme.colors[0] : 'rgba(255,255,255,0.04)',
                    cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', gap: 2 }}>
                    {theme.colors.map((c, i) => <div key={i} style={{ width: 10, height: 10, borderRadius: 2, background: c }} />)}
                  </div>
                  <span style={{ fontSize: 9, color: theme.id === 'light' ? 'rgba(30,30,30,0.60)' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{t(theme.labelKey)}</span>
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
            style={{ width: '100%', accentColor: '#6366f1' }}
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
              onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.10)' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.boxShadow = 'none' }}
              style={{ ...INPUT_STYLE, flex: 1 }}
            />
            <button
              onClick={async () => {
                const p = await window.electronAPI.fsShowOpenDialog()
                if (p) updateLocal({ workingDir: p })
              }}
              aria-label={t('settings.browse')}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: 7, padding: '0 10px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, transition: 'all 0.15s ease', whiteSpace: 'nowrap' }}
            >
              {t('settings.browse')}
            </button>
          </div>,
          <span style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.5 }}>{t('settings.workingFolderHint')}</span>
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
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.10)' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.boxShadow = 'none' }}
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

        {row(
          t('settings.resumeLastSession'),
          <Toggle value={local.resumeLastSession === true} onChange={(v) => updateLocal({ resumeLastSession: v })} />,
          t('settings.resumeLastSessionHint')
        )}

        {field(
          t('outputStyle.title'),
          <select
            value={local.outputStyle || 'default'}
            onChange={(e) => {
              updateLocal({ outputStyle: e.target.value })
              setPrefs({ outputStyle: e.target.value as any })
              window.electronAPI.prefsSet('outputStyle', e.target.value)
            }}
            style={{ ...INPUT_STYLE }}
          >
            <option value="default">{t('outputStyle.default')} — {t('outputStyle.default.desc')}</option>
            <option value="explanatory">{t('outputStyle.explanatory')} — {t('outputStyle.explanatory.desc')}</option>
            <option value="learning">{t('outputStyle.learning')} — {t('outputStyle.learning.desc')}</option>
          </select>,
          <span style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.5 }}>{t('outputStyle.settingsHint')}</span>
        )}

        {field(
          t('effort.settingsLabel'),
          <select
            value={local.effortLevel || 'auto'}
            onChange={(e) => {
              updateLocal({ effortLevel: e.target.value })
              setPrefs({ effortLevel: e.target.value as any })
              window.electronAPI.prefsSet('effortLevel', e.target.value)
            }}
            style={{ ...INPUT_STYLE }}
          >
            <option value="auto">{t('effort.auto')} — {t('effort.autoHint')}</option>
            <option value="low">{t('effort.low')} — {t('effort.lowHint')}</option>
            <option value="medium">{t('effort.medium')} — {t('effort.mediumHint')}</option>
            <option value="high">{t('effort.high')} — {t('effort.highHint')}</option>
            <option value="max">{t('effort.max')} — {t('effort.maxHint')}</option>
          </select>,
          <span style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.5 }}>{t('effort.settingsHint')}</span>
        )}

        {row(
          t('thinking.title'),
          <Toggle value={local.extendedThinking === true} onChange={(v) => updateLocal({ extendedThinking: v })} />,
          t('thinking.description')
        )}

        {row(
          t('settings.systemPresence'),
          <Toggle value={local.systemPresence !== false} onChange={(v) => updateLocal({ systemPresence: v })} />,
          t('settings.systemPresenceHint')
        )}

        {row(
          t('compact.autoCompact'),
          <Toggle value={(local.compactThreshold ?? 80) > 0} onChange={(v) => updateLocal({ compactThreshold: v ? 80 : 0 })} />,
          t('compact.autoCompactHint')
        )}

        {(local.compactThreshold ?? 80) > 0 && field(
          t('compact.threshold', { percent: String(local.compactThreshold ?? 80) }),
          <input
            type="range"
            min={60}
            max={90}
            step={5}
            value={local.compactThreshold ?? 80}
            onChange={(e) => updateLocal({ compactThreshold: Number(e.target.value) })}
            style={{ width: '100%', accentColor: '#6366f1' }}
          />
        )}

        {row(
          t('autoMemory.enabled'),
          <Toggle value={local.autoMemoryEnabled === true} onChange={(v) => updateLocal({ autoMemoryEnabled: v })} />,
          t('autoMemory.enabledHint')
        )}

        {row(
          t('settings.promptSuggestions'),
          <Toggle value={local.promptSuggestionsEnabled !== false} onChange={(v) => updateLocal({ promptSuggestionsEnabled: v })} />,
          t('settings.promptSuggestionsHint')
        )}

        {row(
          t('settings.speculation'),
          <Toggle value={local.speculationEnabled === true} onChange={(v) => updateLocal({ speculationEnabled: v })} />,
          t('settings.speculationHint')
        )}

        {row(
          t('idle.dialogEnabled'),
          <Toggle value={local.idleReturnDialogEnabled !== false} onChange={(v) => updateLocal({ idleReturnDialogEnabled: v })} />,
          t('idle.dialogEnabledHint')
        )}

        {row(
          t('effort.preventSleep'),
          <Toggle value={local.preventSleep !== false} onChange={(v) => updateLocal({ preventSleep: v })} />,
          t('effort.preventSleepHint')
        )}

        {field(
          t('settings.cleanupPeriodDays'),
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number"
              min={0}
              step={1}
              value={cleanupDaysInput}
              onChange={(e) => setCleanupDaysInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.10)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'
                e.currentTarget.style.boxShadow = 'none'
                const parsed = parseInt(cleanupDaysInput, 10)
                if (!isNaN(parsed) && parsed >= 0) {
                  const newVal = parsed
                  setCleanupDays(newVal)
                  setCleanupDaysInput(String(newVal))
                  cleanupDaysLastValid.current = newVal
                  window.electronAPI.configWriteCLISettings({ cleanupPeriodDays: newVal }).catch(() => {})
                } else {
                  setCleanupDaysInput(String(cleanupDaysLastValid.current))
                }
              }}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--glass-border-md)',
                borderRadius: 6,
                color: 'var(--text-primary)',
                padding: '4px 10px',
                fontSize: 13,
                width: 80,
                textAlign: 'center' as const,
                outline: 'none',
                transition: 'all 0.15s ease',
              }}
            />
            <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{t('common.days')}</span>
            {cleanupDays === 0 && (
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t('settings.cleanupPeriodDaysDisabled')}</span>
            )}
          </div>,
          <span style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.5 }}>
            {t('settings.cleanupPeriodDaysHint')}
          </span>
        )}
      </SettingsGroup>
      )}

      {/* Save button */}
      <button
        onClick={onSave}
        aria-label={saved ? t('settings.saved') : t('settings.save')}
        onMouseEnter={(e) => { e.currentTarget.style.background = saved ? 'linear-gradient(135deg, rgba(34,197,94,0.95), rgba(16,185,129,0.95))' : 'linear-gradient(135deg, rgba(99,102,241,0.95), rgba(139,92,246,0.95))'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = saved ? 'linear-gradient(135deg, rgba(34,197,94,0.85), rgba(16,185,129,0.85))' : 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)' }}
        style={{
          background: saved
            ? 'linear-gradient(135deg, rgba(34,197,94,0.85), rgba(16,185,129,0.85))'
            : 'var(--cta-gradient)',
          border: 'none', borderRadius: 8, padding: '9px 16px',
          color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 6,
          width: '100%', justifyContent: 'center', marginTop: 8,
          transition: 'all 0.15s ease',
        }}
      >
        <Save size={13} />
        {saved ? t('settings.saved') : t('settings.save')}
      </button>
    </>
  )
}
