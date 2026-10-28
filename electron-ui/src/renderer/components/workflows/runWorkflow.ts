// Queue a workflow's prompts as chat tasks.
//
// Shared by the workflow page's Run button and the chat header's persona
// picker: the picker starts a workflow without visiting the editor, so the
// queueing rules and the run counter must not live in either view.

import { getT } from '../../i18n'
import { useChatStore, usePrefsStore, useUiStore } from '../../store'
import type { Workflow } from '../../types/app.types'
import { getWorkflowQueuePlan } from './workflowConstants'

type Translate = (key: string, params?: Record<string, string | number>) => string

export function runWorkflowIntoQueue(workflow: Workflow, t: Translate = getT()): void {
  const { entries, skippedSteps } = getWorkflowQueuePlan(workflow, t)
  if (entries.length === 0) {
    useUiStore.getState().addToast('info', t('workflow.nothingToRun'))
    return
  }

  const chat = useChatStore.getState()
  for (const entry of entries) {
    chat.addToQueue(entry.prompt, { workflowId: workflow.id, stepIndex: entry.stepIndex })
  }
  if (skippedSteps.length > 0) {
    useUiStore.getState().addToast('info', t('workflow.stepsSkipped', { count: String(skippedSteps.length) }))
  }

  const prefs = usePrefsStore.getState()
  const updated = (prefs.prefs.workflows ?? []).map(w =>
    w.id === workflow.id ? { ...w, runCount: w.runCount + 1, updatedAt: Date.now() } : w
  )
  prefs.setPrefs({ workflows: updated })
  window.electronAPI.prefsSet('workflows', updated)

  const name = workflow.presetKey ? t(`workflow.preset.${workflow.presetKey}`) : workflow.name
  useUiStore.getState().addToast('success', t('workflow.running', { name, count: String(entries.length) }))
}
