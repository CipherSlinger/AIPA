import React, { useEffect, useState, useCallback } from 'react'
import { usePrefsStore, useUiStore } from '../../store'
import { useI18n } from '../../i18n'
import type { CustomPromptTemplate, Persona } from '../../types/app.types'
import SettingsGeneral from './SettingsGeneral'
import SettingsAbout from './SettingsAbout'
import SettingsStats from './SettingsStats'
import PermissionsSettingsPanel from './PermissionsSettingsPanel'
import SettingsAdvanced from './SettingsAdvanced'
import HooksSettingsPanel from './HooksSettingsPanel'
import SettingsPlugins from './SettingsPlugins'
import SettingsSandbox from './SettingsSandbox'
import SettingsProjectMcp from './SettingsProjectMcp'
// Personas tab has been moved to the Workflows sidebar panel (Iteration 376)
// MCP tab (global) has been moved to the Channels sidebar panel (Iteration 536)
// Memory tab has been moved to the sidebar Memory panel (duplicate removed)
type SettingsTab = 'general' | 'permissions' | 'stats' | 'hooks' | 'plugins' | 'mcp' | 'advanced' | 'sandbox' | 'about'

// Default emojis for migrated templates (Iteration 309: merge Templates into Personas)
const MIGRATION_EMOJIS = ['\u{1F4DD}', '\u{1F4CB}', '\u{1F4CC}', '\u{1F4D6}', '\u{1F4DA}', '\u{1F3AF}', '\u{1F4A1}', '\u{2B50}', '\u{1F680}', '\u{1F3C6}']
const MIGRATION_COLORS = ['#6366f1', '#4ade80', '#fbbf24', '#a78bfa', '#f87171', '#67e8f9', '#ec4899', '#f97316', '#14b8a6', '#818cf8']

export default function SettingsPanel() {
  const { prefs, setPrefs } = usePrefsStore()
  const { t } = useI18n()
  const [local, setLocal] = useState({ ...prefs })
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general')
  const [hoveredTab, setHoveredTab] = useState<string | null>(null)

  // Consume pendingSettingsTab from store to allow external navigation (e.g. slash commands)
  const pendingSettingsTab = useUiStore(s => s.pendingSettingsTab)
  const clearPendingSettingsTab = useUiStore(s => s.clearPendingSettingsTab)
  useEffect(() => {
    if (pendingSettingsTab) {
      const valid: SettingsTab[] = ['general', 'permissions', 'stats', 'hooks', 'plugins', 'mcp', 'advanced', 'sandbox', 'about']
      if (valid.includes(pendingSettingsTab as SettingsTab)) {
        setSettingsTab(pendingSettingsTab as SettingsTab)
      }
      clearPendingSettingsTab()
    }
  }, [pendingSettingsTab, clearPendingSettingsTab])

  useEffect(() => {
    const load = async () => {
      const all = await window.electronAPI.prefsGetAll()
      const env = await window.electronAPI.configGetEnv()
      setLocal({ ...all, apiKey: all.apiKey || env.apiKey || '' })

      // Iteration 309: Migrate custom templates to personas (one-time).
      // Migration still runs from SettingsPanel so it happens automatically on
      // first open, even though the Personas UI now lives in WorkflowPanel.
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
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--bg-chat)' }}>
      {/* Left sidebar nav */}
      <div style={{
        width: 140,
        flexShrink: 0,
        borderRight: '1px solid var(--border)',
        padding: '14px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        overflowY: 'auto',
        background: 'var(--bg-sidebar)',
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
          textTransform: 'uppercase', color: 'var(--text-muted)',
          padding: '0 12px', marginBottom: 6,
        }}>
          {t('settings.title')}
        </div>
        {(['general', 'permissions', 'stats', 'hooks', 'plugins', 'mcp', 'advanced', 'sandbox', 'about'] as const).map(tab => {
          const isActive = settingsTab === tab
          const isHovered = hoveredTab === tab && !isActive
          return (
            <button
              key={tab}
              role="tab"
              aria-selected={isActive}
              onClick={() => setSettingsTab(tab)}
              onMouseEnter={() => setHoveredTab(tab)}
              onMouseLeave={() => setHoveredTab(null)}
              style={{
                background: isActive
                  ? 'rgba(99,102,241,0.10)'
                  : isHovered ? 'var(--bg-hover)' : 'none',
                border: 'none',
                borderLeft: isActive ? '2px solid rgba(99,102,241,0.6)' : '2px solid transparent',
                borderRadius: '0 6px 6px 0',
                padding: '7px 12px',
                color: isActive ? '#818cf8' : isHovered ? 'var(--text-secondary)' : 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: isActive ? 600 : 400,
                textAlign: 'left',
                transition: 'all 0.15s ease',
                width: '100%',
              }}
            >
              {t(`settings.tabs.${tab}`)}
            </button>
          )
        })}
      </div>

      {/* Content area */}
      <div style={{ flex: 1, padding: '20px 24px', overflowY: 'auto' }}>
        {settingsTab === 'general' ? (
          <SettingsGeneral
            local={local}
            setLocal={handleSetLocal}
            showKey={showKey}
            setShowKey={setShowKey}
            saved={saved}
            onSave={save}
          />
        ) : settingsTab === 'permissions' ? (
          <PermissionsSettingsPanel />
        ) : settingsTab === 'stats' ? (
          <SettingsStats />
        ) : settingsTab === 'hooks' ? (
          <HooksSettingsPanel />
        ) : settingsTab === 'plugins' ? (
          <SettingsPlugins />
        ) : settingsTab === 'mcp' ? (
          <SettingsProjectMcp />
        ) : settingsTab === 'advanced' ? (
          <SettingsAdvanced />
        ) : settingsTab === 'sandbox' ? (
          <SettingsSandbox />
        ) : (
          <SettingsAbout
            onResetDefaults={handleResetDefaults}
            saved={saved}
            onShowShortcuts={() => {
              // Close settings modal and open the shortcut cheatsheet
              const ui = useUiStore.getState()
              ui.closeSettingsModal()
              window.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, key: '/' }))
            }}
          />
        )}
      </div>
    </div>
  )
}
