/**
 * WorkflowPersonasSection
 *
 * Agents section of the Employees page (WorkflowPanel): persona card grid,
 * presets and import/export. Create/edit happens on PersonaEditorPage.
 * Sub-components extracted to PersonaSidebarComponents.tsx (Iteration 386).
 */

import React, { useState, useEffect } from 'react'
import { Download, Upload, Bot } from 'lucide-react'
import { usePrefsStore, useUiStore, useChatStore } from '../../store'
import { useI18n } from '../../i18n'
import type { Persona } from '../../types/app.types'
import { PERSONA_PRESETS } from '../settings/personaConstants'
import { PersonaIconTile } from './PersonaSidebarComponents'
import { SectionHeader, ToolbarButton, AddCard, PresetCard, SubLabel } from './EmployeesShared'
import PersonCharacterIcon from './PersonCharacterIcon'

// ─── Main exported section ─────────────────────────────────────────────────────

export default function WorkflowPersonasSection() {
  const { prefs, setPrefs } = usePrefsStore()
  const { t } = useI18n()
  const addToast = useUiStore(s => s.addToast)

  // Load personas from prefs — keep in sync with SettingsPanel
  const [personas, setPersonas] = useState<Persona[]>(prefs.personas || [])
  const activePersonaId = prefs.activePersonaId
  const sessionPersonaId = useChatStore(s => s.sessionPersonaId)
  const effectivePersonaId = sessionPersonaId || activePersonaId

  // Keep local personas in sync when prefs change externally (e.g. SettingsPanel still open)
  useEffect(() => {
    setPersonas(prefs.personas || [])
  }, [prefs.personas])

  const [deletingId, setDeletingId] = useState<string | null>(null)

  const savePersonas = (updated: Persona[]) => {
    setPersonas(updated)
    setPrefs({ personas: updated })
    window.electronAPI.prefsSet('personas', updated)
  }

  const handleDelete = (id: string) => {
    if (deletingId === id) {
      const updated = personas.filter(p => p.id !== id)
      savePersonas(updated)
      if (activePersonaId === id) {
        setPrefs({ activePersonaId: undefined })
        window.electronAPI.prefsSet('activePersonaId', undefined)
      }
      if (sessionPersonaId === id) {
        useChatStore.getState().setSessionPersonaId(undefined)
        setPrefs({ systemPrompt: '' })
        window.electronAPI.prefsSet('systemPrompt', '')
      }
      setDeletingId(null)
      addToast('success', t('persona.deleted'))
    } else {
      setDeletingId(id)
      setTimeout(() => setDeletingId(null), 3000)
    }
  }

  const handleActivate = (persona: Persona) => {
    if (effectivePersonaId === persona.id) {
      // Deactivate session persona
      useChatStore.getState().setSessionPersonaId(undefined)
      setPrefs({ systemPrompt: '' })
      window.electronAPI.prefsSet('systemPrompt', '')
      addToast('info', t('persona.deactivated'))
    } else {
      const resolvedPrompt = persona.presetKey ? t(`persona.presetPrompt.${persona.presetKey}`) : persona.systemPrompt
      useChatStore.getState().setSessionPersonaId(persona.id)
      setPrefs({ model: persona.model, systemPrompt: resolvedPrompt })
      window.electronAPI.prefsSet('model', persona.model)
      window.electronAPI.prefsSet('systemPrompt', resolvedPrompt)
      addToast('success', t('persona.switchedTo', { name: persona.presetKey ? t(`persona.preset.${persona.presetKey}`) : persona.name }))
    }
  }

  const handleInstallPreset = (preset: Omit<Persona, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (personas.length >= 10) return
    const newPersona: Persona = {
      ...preset,
      id: `persona-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    savePersonas([...personas, newPersona])
    addToast('success', t('persona.created'))
  }

  const handleExport = () => {
    const data = JSON.stringify(personas, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `aipa-personas-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    addToast('success', t('persona.exportSuccess'))
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const imported = JSON.parse(text)
        if (!Array.isArray(imported)) throw new Error('Invalid format')
        const valid = imported.filter((p: any) => p.name && p.emoji && p.model && p.systemPrompt)
        if (valid.length === 0) throw new Error('No valid personas')
        const merged = [...personas]
        let added = 0
        for (const p of valid) {
          if (merged.length >= 10) break
          if (merged.some(existing => existing.name === p.name)) continue
          merged.push({
            ...p,
            id: `persona-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          })
          added++
        }
        if (added > 0) {
          savePersonas(merged)
          addToast('success', t('persona.importSuccess', { count: String(added) }))
        } else {
          addToast('info', t('persona.importNoDuplicates'))
        }
      } catch {
        addToast('error', t('persona.importFailed'))
      }
    }
    input.click()
  }

  // Available presets not yet installed
  const availablePresets = PERSONA_PRESETS.filter(
    preset => !personas.some(p => p.presetKey === preset.presetKey || p.name === preset.name)
  )

  const atLimit = personas.length >= 10

  return (
    <section>
      <SectionHeader
        icon={<Bot size={14} />}
        title={t('employees.agents')}
        subtitle={t('employees.agentsSub')}
        count={personas.length}
        actions={
          <>
            <ToolbarButton onClick={handleImport} disabled={atLimit}>
              <Upload size={13} />
              {t('persona.importPersonas')}
            </ToolbarButton>
            {personas.length > 0 && (
              <ToolbarButton onClick={handleExport}>
                <Download size={13} />
                {t('persona.exportPersonas')}
              </ToolbarButton>
            )}
          </>
        }
      />

      {personas.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
          {t('persona.noPersonasHint')}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))', gap: 12 }}>
        {personas.map(p => (
          <PersonaIconTile
            key={p.id}
            persona={p}
            isActive={effectivePersonaId === p.id}
            isDeleting={deletingId === p.id}
            onDelete={handleDelete}
          />
        ))}
        <AddCard
          label={atLimit ? t('persona.maxReached') : t('employees.addAgent')}
          onClick={() => useUiStore.getState().openPersonaEditor(null, 'workflows')}
          disabled={atLimit}
          minHeight={118}
        />
      </div>

      {availablePresets.length > 0 && !atLimit && (
        <>
          <SubLabel>{t('employees.presetsAgents')}</SubLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
            {availablePresets.map((preset, i) => (
              <PresetCard
                key={preset.presetKey || i}
                icon={
                  <PersonCharacterIcon
                    persona={{ ...preset, id: `preset-preview-${i}`, createdAt: 0, updatedAt: 0 }}
                    size={30}
                    showBadge={false}
                  />
                }
                title={preset.presetKey ? t(`persona.preset.${preset.presetKey}`) : preset.name}
                onClick={() => handleInstallPreset(preset)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  )
}
