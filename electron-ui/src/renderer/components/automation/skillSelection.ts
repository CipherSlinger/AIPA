// The pure half of choosing a skill as a scheduled action.
//
// Three decisions used to sit inline in `AutomationDialog`, where a harness
// could only grep for them: which action the form starts on, which skill pair
// it starts with, and whether the chosen SKILL.md has anything to run. They are
// values, not UI, so they live here and the dialog only renders their result.
//
// `parseSkillMd` is the same reader `skills:list` and the scheduler use, so the
// warning cannot disagree with what a run would send: main builds the prompt
// from `parsed.body`, and "empty" here means exactly "main would send nothing".

import { parseSkillMd } from '../../../main/skills/skillMd'
import type { AutomationJobData } from '../../../preload'

/** The action select's three choices, in the order the dialog offers them. */
export type ActionKind = 'workflow' | 'prompt' | 'skill'

/** The identity a job stores for a skill: one segment under a root, `''` for the root's own file. */
export interface SkillChoice {
  source: 'personal' | 'project'
  dir: string
}

/** A create-mode prefill from a page that already knows which skill it is showing. */
export type InitialSkill = SkillChoice

/** What a hand-picked skill produces. The prefill goes through this same builder. */
export function skillAction(choice: SkillChoice): {
  kind: 'skill'
  skillSource: 'personal' | 'project'
  skillDir: string
} {
  return { kind: 'skill', skillSource: choice.source, skillDir: choice.dir }
}

/**
 * The action the form opens on.
 *
 * Editing keeps the stored action: an edit must not silently turn a prompt job
 * into a workflow one. A skill prefill is as explicit as a prompt prefill and
 * outranks the "workflows exist" default, because the caller already decided
 * this job runs a skill. `presetWorkflowId` is the already-validated workflow
 * prefill (the caller passes it only when the id is really in the list).
 */
export function defaultActionKindFor(args: {
  job: AutomationJobData | null
  initialSkill?: InitialSkill | null
  presetWorkflowId?: string
  initialPrompt?: string
  workflowCount: number
}): ActionKind {
  if (args.job?.action.kind) return args.job.action.kind
  if (args.initialSkill) return 'skill'
  const wantsWorkflow =
    Boolean(args.presetWorkflowId) ||
    (args.initialPrompt === undefined && args.workflowCount > 0)
  return wantsWorkflow ? 'workflow' : 'prompt'
}

/**
 * The skill pair the form starts with.
 *
 * `''` is not a wildcard: it is the root-level SKILL.md, which is a real
 * identity. The empty pair means "nothing chosen yet", and Save stays off
 * until the user picks one.
 */
export function initialSkillChoice(
  job: AutomationJobData | null,
  initialSkill?: InitialSkill | null,
): { source: '' | 'personal' | 'project'; dir: string } {
  if (job?.action.kind === 'skill') {
    return { source: job.action.skillSource, dir: job.action.skillDir }
  }
  if (initialSkill) return { source: initialSkill.source, dir: initialSkill.dir }
  return { source: '', dir: '' }
}

/**
 * Whether a SKILL.md has anything for a run to send.
 *
 * `unknown` is its own answer on purpose: a failed read is not an empty file,
 * and telling the user to write instructions into a file the app could not
 * even open would send them looking in the wrong place.
 */
export type SkillBodyState = 'empty' | 'ok' | 'unknown'

export function skillBodyState(content: string | null | undefined): SkillBodyState {
  if (typeof content !== 'string') return 'unknown'
  return parseSkillMd(content).body.trim() === '' ? 'empty' : 'ok'
}
