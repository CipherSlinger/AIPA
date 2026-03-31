import React, { useEffect, useState, useCallback } from 'react'
import { usePrefsStore } from '../../store'
import { useI18n } from '../../i18n'
import type { CustomPromptTemplate, Persona } from '../../types/app.types'
import SettingsGeneral from './SettingsGeneral'
import SettingsProviders from './SettingsProviders'
import SettingsPersonas from './SettingsPersonas'
import SettingsMcp from './SettingsMcp'
import SettingsAbout from './SettingsAbout'

type SettingsTab = 'general' | 'providers' | 'personas' | 'mcp' | 'about'

// Default emojis for migrated templates (Iteration 309: merge Templates into Personas)
const MIGRATION_EMOJIS = ['\u{1F4DD}', '\u{1F4CB}', '\u{1F4CC}', '\u{1F4D6}', '\u{1F4DA}', '\u{1F3AF}', '\u{1F4A1}', '\u{2B50}', '\u{1F680}', '\u{1F3C6}']
const MIGRATION_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#6366f1']

export default function SettingsPanel() {
  const { prefs, setPrefs } = usePrefsStore()
  const { t } = useI18n()
  const [local, setLocal] = useState({ ...prefs })
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general')
  const [personas, setPersonas] = useState<Persona[]>(prefs.personas || [])

  useEffect(() => {
    const load = async () => {
      const all = await window.electronAPI.prefsGetAll()
      const env = await window.electronAPI.configGetEnv()
      setLocal({ ...all, apiKey: all.apiKey || env.apiKey || '' })
      if (all.personas) {
        setPersonas(all.personas)
      }

      // Iteration 309: Migrate custom templates to personas (one-time)
      const templates: CustomPromptTemplate[] = all.customPromptTemplates || []
      if (templates.length > 0) {
        const existingPersonas: Persona[] = all.personas || []
        const existingNames = new Set(existingPersonas.map(p => p.name.toLowerCase()))
        const migratedPersonas: Persona[] = []

        for (let i = 0; i < templates.length; i++) {
          const tpl = templates[i]
          const baseName = tpl.name
          const name = existingNames.has(baseName.toLowerCase()) ? `${baseName} (migrated)` : baseName
          existingNames.add(name.toLowerCase())

          migratedPersonas.push({
            id: `persona-migrated-${Date.now()}-${i}`,
            name,
            emoji: MIGRATION_EMOJIS[i % MIGRATION_EMOJIS.length],
            model: all.model || 'claude-sonnet-4-6',
            systemPrompt: tpl.prompt,
            color: MIGRATION_COLORS[i % MIGRATION_COLORS.length],
            createdAt: tpl.createdAt || Date.now(),
            updatedAt: Date.now(),
          })
        }

        const merged = [...existingPersonas, ...migratedPersonas]
        setPersonas(merged)
        setPrefs({ personas: merged, customPromptTemplates: [] })
        window.electronAPI.prefsSet('personas', merged)
        window.electronAPI.prefsSet('customPromptTemplates', [])
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
      resumeLastSession: false,
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
    <div style={{ padding: '16px 24px', overflowY: 'auto', height: '100%' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>{t('settings.title')}</div>

      {/* Tab bar */}
      <div role="tablist" style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
        {(['general', 'providers', 'personas', 'mcp', 'about'] as const).map(tab => (
          <button
            key={tab}
            role="tab"
            aria-selected={settingsTab === tab}
            onClick={() => setSettingsTab(tab)}
            style={{
              background: settingsTab === tab ? 'var(--accent)' : 'none',
              border: '1px solid ' + (settingsTab === tab ? 'var(--accent)' : 'var(--border)'),
              borderRadius: 6,
              padding: '5px 14px',
              color: settingsTab === tab ? '#fff' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: settingsTab === tab ? 600 : 400,
              transition: 'all 0.15s ease',
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
        />
      ) : settingsTab === 'providers' ? (
        <SettingsProviders />
      ) : settingsTab === 'personas' ? (
        <SettingsPersonas
          personas={personas}
          setPersonas={setPersonas}
          activePersonaId={prefs.activePersonaId}
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
