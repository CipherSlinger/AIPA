// SettingsAIEngine — AI Engine settings tab (Iteration 652)
// Contains model selector, API key, advisor model, thinking mode, max turns,
// budget limit, AI reply language — moved from SettingsGeneral.
// Also wraps SettingsProviders for provider/API-key config.

import React, { useState, useEffect, Suspense } from 'react'
import { Brain, Eye, EyeOff, Save, Cpu } from 'lucide-react'
import { useI18n } from '../../i18n'
import { MODEL_OPTIONS, INPUT_STYLE } from './settingsConstants'
import SettingsGroup from './SettingsGroup'
import SettingsApiKeyPool from './SettingsApiKeyPool'

const SettingsProviders = React.lazy(() => import('./SettingsProviders'))

interface SettingsAIEngineProps {
  local: any
  setLocal: (updater: (prev: any) => any) => void
  showKey: boolean
  setShowKey: (v: boolean) => void
  saved: boolean
  onSave: () => void
}

export default function SettingsAIEngine({
  local,
  setLocal,
  showKey,
  setShowKey,
  saved,
  onSave,
}: SettingsAIEngineProps) {
  const { t } = useI18n()

  // aiReplyLanguage — reads/writes `language` field in ~/.claude/settings.json via IPC
  const [aiReplyLanguage, setAiReplyLanguage] = useState<string>('')
  // cliOutputStyle — reads/writes `outputStyle` field in ~/.claude/settings.json via IPC
  const [cliOutputStyle, setCliOutputStyle] = useState<string>('auto')

  useEffect(() => {
    window.electronAPI.configReadCLISettings().then((cliSettings: Record<string, unknown>) => {
      const lang = typeof cliSettings.language === 'string' ? cliSettings.language : ''
      setAiReplyLanguage(lang)
      const style = typeof cliSettings.outputStyle === 'string' ? cliSettings.outputStyle : 'auto'
      setCliOutputStyle(style)
    }).catch(() => {})
  }, [])

  const updateLocal = (patch: Record<string, any>) => setLocal((prev: any) => ({ ...prev, ...patch }))

  const field = (label: string, content: React.ReactNode, hint?: React.ReactNode) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>{label}</div>
      {content}
      {hint && <div style={{ marginTop: 5, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{hint}</div>}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* AI Engine core settings group */}
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
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}
              style={{ ...INPUT_STYLE, paddingRight: 36 }}
            />
            <button
              onClick={() => setShowKey(!showKey)}
              aria-label={showKey ? t('settingsAdvanced.hideApiKey') : t('settingsAdvanced.showApiKey')}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--border)' }}
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
          <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{t('settings.advisorModelHint')}</span>
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
          <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{t('settings.thinkingHint')}</span>
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
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}
            style={{ ...INPUT_STYLE, width: 120 }}
          />,
          <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
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
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}
            style={{ ...INPUT_STYLE, width: 120 }}
          />,
          <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
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
              window.electronAPI.configWriteCLISettings({ language: next || '' }).catch(() => {})
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.10)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}
            style={{
              background: 'var(--bg-hover)',
              border: '1px solid var(--border)',
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
          <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {t('settings.aiReplyLanguageHint')}
          </span>
        )}

        {field(
          t('settings.cliOutputStyle'),
          <select
            value={cliOutputStyle}
            onChange={(e) => {
              const next = e.target.value
              setCliOutputStyle(next)
              window.electronAPI.configWriteCLISettings({ outputStyle: next }).catch(() => {})
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.10)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}
            style={{
              background: 'var(--bg-hover)',
              border: '1px solid var(--border)',
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
            <option value="auto">{t('settings.cliOutputStyleAuto')}</option>
            <option value="text">{t('settings.cliOutputStyleText')}</option>
            <option value="json">{t('settings.cliOutputStyleJson')}</option>
          </select>,
          <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {t('settings.cliOutputStyleHint')}
          </span>
        )}
      </SettingsGroup>

      {/* Save button */}
      <button
        onClick={onSave}
        aria-label={saved ? t('settings.saved') : t('settings.save')}
        onMouseEnter={(e) => { e.currentTarget.style.background = saved ? 'linear-gradient(135deg, rgba(34,197,94,0.95), rgba(16,185,129,0.95))' : 'linear-gradient(135deg, rgba(99,102,241,0.95), rgba(139,92,246,0.95))'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = saved ? 'linear-gradient(135deg, rgba(34,197,94,0.85), rgba(16,185,129,0.85))' : 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)' }}
        style={{
          background: saved
            ? 'linear-gradient(135deg, rgba(34,197,94,0.85), rgba(16,185,129,0.85))'
            : 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
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

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

      {/* Provider config section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Cpu size={15} color="#818cf8" />
        <span style={{
          fontSize: 13, fontWeight: 700, color: 'var(--text-primary)',
          letterSpacing: '-0.01em',
        }}>
          AI 引擎 / AI Engine
        </span>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 4 }}>
        Configure AI providers, API keys, base URLs, and connection health. Changes take effect immediately.
      </div>

      <Suspense fallback={
        <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
          Loading provider settings...
        </div>
      }>
        <SettingsProviders />
      </Suspense>
    </div>
  )
}
