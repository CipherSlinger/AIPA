// The lookups one job row makes against data it does not own: the workflow,
// persona, skill, plugin and chain-target names behind its chips and clauses.
//
// They were `useCallback`s in the page component. Each is a pure function of
// the stores' lists plus the job, so the page's search context and the row
// itself can share one implementation and word the same fact identically.

import { ASSISTANT_PERSONA_ID, type WorkflowOption } from '../../automation/AutomationDialog'
import { getPluginDisplayName } from '../../plugins/pluginIcons'
import type { AutomationJobData, NavPlugin, SkillInfoData } from '../../../../preload'
import type { Persona } from '../../../types/app.types'
import type { AppLocale } from '../../../utils/formatDate'
import type { Translate } from './automationStatusText'

/** The expert a row should name: a person, the plain assistant, or a broken binding. */
export type JobExpert =
  | { kind: 'persona'; persona: Persona; override: boolean }
  | { kind: 'assistant'; override: boolean }
  | { kind: 'missing'; override: boolean }

/** The display name of a workflow, or undefined when the id no longer resolves. */
export function workflowNameOf(
  workflows: WorkflowOption[] | undefined,
  id: string,
): string | undefined {
  return (workflows || []).find(w => w.id === id)?.name
}

/**
 * The display name of the skill a job runs, or null when the scan has not
 * returned or no longer lists it. Null is not "missing": only the pair not
 * being in a *read* list means the folder is gone, and the row says that
 * through `actionMissing`.
 */
export function skillNameOf(
  skills: SkillInfoData[] | null,
  source: 'personal' | 'project',
  dir: string,
): string | null {
  if (!skills) return null
  return skills.find(skill => skill.source === source && skill.skillDir === dir)?.name ?? null
}

/**
 * A job's origin plugin, as a badge label. An uninstalled plugin is not an
 * error: the job outlives it, so the raw id stands in and the tooltip says
 * the name is gone. The lookup never affects the row's controls — a
 * plugin-made job is edited and deleted like any other.
 */
export function pluginOriginFor(
  plugins: NavPlugin[],
  id: string,
  locale: AppLocale,
): { name: string; installed: boolean } {
  const plugin = plugins.find(p => p.manifest.id === id)
  return plugin
    ? { name: getPluginDisplayName(plugin.manifest, locale), installed: true }
    : { name: id, installed: false }
}

/**
 * The expert that will actually run this job: its own override first, then
 * the workflow's binding. `missing` stays truthful for a deleted persona in
 * either place, and `override` lets the row say which of the two it is.
 * Null means no chip: nothing is bound, so the plain assistant runs.
 */
export function jobExpertFor(
  job: AutomationJobData,
  workflows: WorkflowOption[] | undefined,
  personas: Persona[] | undefined,
): JobExpert | null {
  const overrideId = typeof job.personaId === 'string' ? job.personaId.trim() : ''
  if (overrideId) {
    if (overrideId === ASSISTANT_PERSONA_ID) return { kind: 'assistant', override: true }
    const persona = (personas || []).find(p => p.id === overrideId)
    return persona
      ? { kind: 'persona', persona, override: true }
      : { kind: 'missing', override: true }
  }
  const action = job.action
  if (action.kind !== 'workflow') return null
  const workflow = (workflows || []).find(w => w.id === action.workflowId)
  if (!workflow?.personaId) return null
  const persona = (personas || []).find(p => p.id === workflow.personaId)
  return persona
    ? { kind: 'persona', persona, override: false }
    : { kind: 'missing', override: false }
}

/**
 * The row's "then run" clauses: one per side of the chain.
 *
 * A target id is resolved against the live list at render time, so a job that
 * was renamed shows its new name and one that was deleted shows as gone.
 * A missing target is kept visible rather than hidden: the chain really does
 * point at nothing, and the user is the only one who may drop the edge.
 */
export function chainClausesFor(
  t: Translate,
  job: AutomationJobData,
  jobs: AutomationJobData[],
): Array<{ text: string; missing: boolean; title?: string }> {
  const chain = job.chain
  if (!chain) return []
  const nameOf = (id: string) => jobs.find(other => other.id === id)?.name
  const clauses: Array<{ text: string; missing: boolean; title?: string }> = []
  if (chain.onSuccess) {
    const name = nameOf(chain.onSuccess)
    clauses.push(name
      ? { text: t('automation.chain.rowSuccess', { name }), missing: false }
      : { text: t('automation.chain.rowMissingSuccess'), missing: true, title: chain.onSuccess })
  }
  if (chain.onFailure) {
    const name = nameOf(chain.onFailure)
    clauses.push(name
      ? { text: t('automation.chain.rowFailure', { name }), missing: false }
      : { text: t('automation.chain.rowMissingFailure'), missing: true, title: chain.onFailure })
  }
  return clauses
}
