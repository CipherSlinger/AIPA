import React, { useEffect, useState, useCallback } from 'react'
import { usePrefsStore } from '../../store'
import { useI18n } from '../../i18n'
import type { CustomPromptTemplate } from '../../types/app.types'
import SettingsGeneral from './SettingsGeneral'
import SettingsTemplates from './SettingsTemplates'
import SettingsMcp from './SettingsMcp'
import SettingsAbout from './SettingsAbout'

type SettingsTab = 'general' | 'templates' | 'mcp' | 'about'

export default function SettingsPanel() {
  const { prefs, setPrefs } = usePrefsStore()
  const { t } = useI18n()
  const [local, setLocal] = useState({ ...prefs })
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general')
  const [customTemplates, setCustomTemplates] = useState<CustomPromptTemplate[]>(prefs.customPromptTemplates || [])

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

  const save = useCallback(async () => {
    setPrefs(local)
    await window.electronAPI.configSetApiKey(local.apiKey)
    for (const [k, v] of Object.entries(local)) {
      if (k !== 'apiKey') await window.electronAPI.prefsSet(k, v)
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [local, setPrefs])

  const handleSetLocal = useCallback((updater: (prev: any) => any) => {
    setLocal(updater)
  }, [])

  const handleResetDefaults = useCallback(async () => {
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
  }, [setPrefs])

  return (
    <div style={{ padding: 14, overflowY: 'auto', height: '100%' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>{t('settings.title')}</div>

      {/* Tab bar */}
      <div role="tablist" style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
        {(['general', 'templates', 'mcp', 'about'] as const).map(tab => (
          <button
            key={tab}
            role="tab"
            aria-selected={settingsTab === tab}
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
        <SettingsGeneral
          local={local}
          setLocal={handleSetLocal}
          showKey={showKey}
          setShowKey={setShowKey}
          saved={saved}
          onSave={save}
          customTemplates={customTemplates}
        />
      ) : settingsTab === 'templates' ? (
        <SettingsTemplates
          customTemplates={customTemplates}
          setCustomTemplates={setCustomTemplates}
        />
      ) : settingsTab === 'mcp' ? (
        <SettingsMcp />
      ) : (
        <SettingsAbout
          onResetDefaults={handleResetDefaults}
          saved={saved}
        />
      )}
    </div>
  )
}
