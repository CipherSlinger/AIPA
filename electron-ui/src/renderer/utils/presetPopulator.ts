/**
 * Auto-populate default personas and workflows on first launch.
 * Created in Iteration 405 — ensures new users see pre-built presets
 * immediately instead of an empty panel.
 */
import { PERSONA_PRESETS } from '../components/settings/personaConstants'
import { PRESET_WORKFLOWS, PRESET_TEAMWORK_WORKFLOWS } from '../components/workflows/workflowConstants'
import { usePrefsStore } from '../store'
import type { Persona, Workflow } from '../types/app.types'

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/**
 * If personas and/or workflows arrays are empty (first launch), populate
 * them with the built-in presets so users have something to start with.
 */
export function populateDefaultPresetsIfEmpty(prefs: Record<string, any>) {
  const existingPersonas = prefs.personas as Persona[] | undefined
  const existingWorkflows = prefs.workflows as Workflow[] | undefined

  let updated = false

  // Populate personas if empty
  if (!existingPersonas || existingPersonas.length === 0) {
    const now = Date.now()
    const defaultPersonas: Persona[] = PERSONA_PRESETS.map((preset, i) => ({
      ...preset,
      id: generateId() + i,
      createdAt: now,
      updatedAt: now,
    }))
    usePrefsStore.getState().setPrefs({ personas: defaultPersonas })
    window.electronAPI.prefsSet('personas', defaultPersonas)
    updated = true
  }

  // Populate workflows if empty
  if (!existingWorkflows || existingWorkflows.length === 0) {
    const now = Date.now()
    const allPresets = [...PRESET_WORKFLOWS, ...PRESET_TEAMWORK_WORKFLOWS]
    const defaultWorkflows: Workflow[] = allPresets.map((preset, i) => ({
      ...preset,
      id: generateId() + i,
      createdAt: now,
      updatedAt: now,
      runCount: 0,
    }))
    usePrefsStore.getState().setPrefs({ workflows: defaultWorkflows })
    window.electronAPI.prefsSet('workflows', defaultWorkflows)
    updated = true
  }

  return updated
}
