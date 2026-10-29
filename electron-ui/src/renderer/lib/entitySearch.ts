// Search over the building blocks the user made, not only the conversations
// they had.
//
// Ctrl+K already finds transcripts. A workflow called "Weekly release
// checklist", a saved skill or a scheduled job is invisible there unless some
// conversation happened to mention it, which is not the same as being findable.
// This module turns those three lists into one row shape so the overlay renders
// them with one component and one set of rules.
//
// Pure by design: no React, no Electron, no IPC. The overlay owns fetching and
// the failure states; everything here can be exercised in plain Node.

import type { AutomationJobData, SkillInfoData } from '../../preload/index'
import type { Workflow } from '../types/app.types'

/**
 * Below two characters a match says nothing: every workflow whose name holds
 * the letter would come back. The overlay hides the entity sections until the
 * query clears this bar, and every derive enforces it again so a direct caller
 * cannot get a list that looks like an unfiltered dump.
 */
export const ENTITY_SEARCH_MIN_CHARS = 2

/**
 * Rows rendered per section. The remainder is counted, never silently dropped:
 * a header saying "12" over six rows would be a lie, so the cap and the total
 * travel together and the section can say how many it left out.
 */
export const ENTITY_HIT_ROWS = 6

/** One renderable row. All three kinds share it so the overlay stays one list. */
export interface EntityHit {
  /** Identity for the row action: workflow id, skill dirPath, job id. */
  id: string
  title: string
  /** The line under the title. Empty when the source has nothing to say. */
  subtitle: string
  /**
   * One extra fact as a stable token, never a sentence: this module does not
   * know the user's language. `'personal' | 'project'` for a skill and
   * `'enabled' | 'disabled'` for a job; absent when there is nothing to add.
   */
  meta?: string
}

export interface EntityHitPage {
  /** At most `limit` rows. */
  rows: EntityHit[]
  /** Every match, including the ones `rows` had no room for. */
  total: number
}

/** Resolves a scheduled job's workflow id to the name the user gave it. */
export interface JobHitContext {
  workflowName?: (workflowId: string) => string | undefined
}

function normalize(query: string): string {
  return (query ?? '').trim().toLowerCase()
}

/**
 * The one definition of "matches", shared by every list.
 *
 * An empty needle matches nothing rather than everything: `''.includes('')` is
 * true, and one accidental call must not turn into "show every workflow".
 */
export function matchesQuery(
  haystacks: readonly (string | null | undefined)[],
  query: string,
): boolean {
  const needle = normalize(query)
  if (needle.length < ENTITY_SEARCH_MIN_CHARS) return false
  return haystacks.some(value => typeof value === 'string' && value.toLowerCase().includes(needle))
}

function cap(limit: number): number {
  if (!Number.isFinite(limit)) return ENTITY_HIT_ROWS
  return Math.max(0, Math.floor(limit))
}

/**
 * Case-insensitive name order that does not depend on the machine's locale: a
 * search list must keep the same order between runs, and `localeCompare`
 * would not.
 */
function byName(a: string, b: string): number {
  const lowerA = a.toLowerCase()
  const lowerB = b.toLowerCase()
  if (lowerA < lowerB) return -1
  if (lowerA > lowerB) return 1
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

/** Ids are how a row opens its target; an entry without one cannot be opened. */
function usableId(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** A fresh page each time: the caller must not be able to corrupt a shared one. */
function emptyPage(): EntityHitPage {
  return { rows: [], total: 0 }
}

/**
 * Workflows, newest edit first.
 *
 * `updatedAt` rather than name order: the thing the user just changed is the
 * one they are most likely to be looking for, and the overlay's transcript
 * groups already lead with the most recently active work.
 */
export function deriveWorkflowHits(
  workflows: readonly Workflow[] | null | undefined,
  query: string,
  limit: number = ENTITY_HIT_ROWS,
): EntityHitPage {
  if (!Array.isArray(workflows) || workflows.length === 0) return emptyPage()
  const matched = workflows
    .filter(workflow => workflow
      && usableId(workflow.id) !== ''
      && matchesQuery([workflow.name, workflow.description], query))
    .sort((a, b) => {
      const recent = (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
      if (recent !== 0) return recent
      return byName(a.name ?? '', b.name ?? '') || byName(a.id, b.id)
    })
  return {
    rows: matched.slice(0, cap(limit)).map(workflow => ({
      id: workflow.id.trim(),
      title: workflow.name ?? '',
      subtitle: workflow.description ?? '',
    })),
    total: matched.length,
  }
}

/**
 * Skills, name order.
 *
 * A row without a usable `dirPath` is dropped instead of listed: the path is
 * the id the overlay hands back to open the skill, and a row that cannot open
 * anything is worse than a row that is not there. Duplicate paths collapse for
 * the same reason the skills section deduplicates them — the main process can
 * report the same skill for two working directories.
 */
export function deriveSkillHits(
  skills: readonly SkillInfoData[] | null | undefined,
  query: string,
  limit: number = ENTITY_HIT_ROWS,
): EntityHitPage {
  if (!Array.isArray(skills) || skills.length === 0) return emptyPage()
  const seen = new Set<string>()
  const matched = skills
    .filter(skill => {
      if (!skill) return false
      const dirPath = usableId(skill.dirPath)
      if (dirPath === '') return false
      const key = dirPath.toLowerCase()
      if (seen.has(key)) return false
      if (!matchesQuery([skill.name, skill.description], query)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => byName(a.name ?? '', b.name ?? '')
      || byName(a.dirPath.trim(), b.dirPath.trim()))
  return {
    rows: matched.slice(0, cap(limit)).map(skill => ({
      id: skill.dirPath.trim(),
      title: (skill.name ?? '').trim() || skill.fileName || skill.dirPath.trim(),
      subtitle: skill.description ?? '',
      meta: skill.source,
    })),
    total: matched.length,
  }
}

/**
 * Scheduled jobs, enabled ones first, then by name.
 *
 * Disabled jobs are not filtered out: "off" is a state of the job, not a reason
 * to hide it, and a user looking for the schedule they switched off last week
 * has exactly this search to find it. The row's meta token says which it is.
 *
 * The workflow action carries only an id, so the name is resolved through the
 * caller's context — that name is the label the user recognises, and it is part
 * of what the row searches. A prompt job's prompt is the work itself, so it is
 * shown and searched too.
 */
export function deriveJobHits(
  jobs: readonly AutomationJobData[] | null | undefined,
  query: string,
  limit: number = ENTITY_HIT_ROWS,
  context: JobHitContext = {},
): EntityHitPage {
  if (!Array.isArray(jobs) || jobs.length === 0) return emptyPage()
  const rows = jobs
    .map(job => {
      if (!job || usableId(job.id) === '') return null
      const action = job.action
      const workflow = action?.kind === 'workflow'
        ? context.workflowName?.(action.workflowId)
        : undefined
      const promptText = action?.kind === 'prompt' ? action.prompt : undefined
      if (!matchesQuery([job.name, workflow, promptText], query)) return null
      const hit: EntityHit = {
        id: job.id.trim(),
        title: job.name ?? '',
        subtitle: action?.kind === 'workflow'
          ? (workflow ?? '')
          : (promptText ?? ''),
        meta: job.enabled ? 'enabled' : 'disabled',
      }
      return hit
    })
    .filter((hit): hit is EntityHit => hit !== null)
    // Enabled first, then name. The two passes are one sort with the state as
    // the primary key, so a disabled job never outranks an enabled one by name.
    .sort((a, b) => {
      const enabledA = a.meta === 'enabled' ? 0 : 1
      const enabledB = b.meta === 'enabled' ? 0 : 1
      if (enabledA !== enabledB) return enabledA - enabledB
      return byName(a.title, b.title) || byName(a.id, b.id)
    })
  return { rows: rows.slice(0, cap(limit)), total: rows.length }
}
