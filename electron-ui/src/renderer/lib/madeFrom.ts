/**
 * "What was made from this conversation" — the reverse of `provenance.ts`.
 *
 * A workflow, a skill or a scheduled job records the conversation it was
 * drafted from; this derivation walks the same three lists the other way, so a
 * long conversation can list the artefacts it produced instead of making the
 * user remember their names. `provenance.ts` remains the forward direction —
 * one artefact saying which conversation it came from. Pure, so the matching
 * rules and the ordering are testable without a DOM, and so the chat strip
 * cannot drift from what the detail pages record.
 */

/** How many artefact pills the chat strip shows before it says "+N more". */
export const MADE_FROM_ROWS = 4

export type MadeFromKind = 'workflow' | 'skill' | 'job'

export interface MadeFromRow {
  kind: MadeFromKind
  /** `workflow.id`, `skill.dirPath` or the job id: what the row's action needs. */
  id: string
  /** The artefact's own name, never the conversation title. */
  name: string
  /** Local calendar day the artefact was saved (`YYYY-MM-DD`), when known. */
  date: string | null
}

/** The skill fields this derivation reads; `skills/list` entries satisfy it. */
export interface MadeFromSkill {
  dirPath?: string | null
  name?: string | null
  sourceConversation?: string | null
  createdAt?: string | null
}

/** The workflow fields this derivation reads; `prefs.workflows` satisfy it. */
export interface MadeFromWorkflow {
  id?: string | null
  name?: string | null
  sourceConversation?: string | null
  sourceDraftedAt?: string | null
}

/**
 * The scheduled-job fields this derivation reads; `automationList()` entries
 * satisfy it. A job keeps the same three provenance fields a workflow does.
 */
export interface MadeFromJob {
  id?: string | null
  name?: string | null
  sourceConversation?: string | null
  sourceDraftedAt?: string | null
}

export interface MadeFromInput {
  /**
   * The skills list, or `null` when it has not been read or the read failed.
   * The two are one state on purpose: both mean "this half was not checked",
   * which the strip must say out loud instead of implying that no skill exists.
   */
  skills: readonly MadeFromSkill[] | null | undefined
  workflows: readonly MadeFromWorkflow[] | null | undefined
  /**
   * The scheduled-jobs list (`automationList().jobs`), with the same three
   * states and the same meaning as `skills`. Absent is a third unchecked
   * source, not an empty one: a caller that never looked may not be answered
   * "no jobs".
   */
  jobs?: readonly MadeFromJob[] | null
  sessionId?: string | null
}

export interface MadeFromResult {
  /** The first `MADE_FROM_ROWS` matches, in display order. */
  rows: MadeFromRow[]
  /** Every usable match, not just the capped rows, so "+N more" is honest. */
  total: number
  /** Skills were not checked; the strip may not claim they do not exist. */
  skillsUnknown: boolean
  /** Jobs were not checked; the strip may not claim they do not exist. */
  jobsUnknown: boolean
}

/**
 * Provenance fields cross a JSON boundary (prefs, a parsed SKILL.md), so a
 * hand-edited file can put a number where a string belongs. Reading only
 * strings keeps one malformed field from throwing the chat strip.
 */
function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Date descending, undated last, then name and id ascending.
 *
 * The date is a local `YYYY-MM-DD` stamp, so comparing the strings orders the
 * days without parsing them and without a timezone. Names and ids are compared
 * by code unit rather than `localeCompare` so the same lists always render in
 * the same order regardless of which locale is active.
 */
function compareRows(a: MadeFromRow, b: MadeFromRow): number {
  if (a.date && b.date) {
    if (a.date !== b.date) return a.date > b.date ? -1 : 1
  } else if (a.date) {
    return -1
  } else if (b.date) {
    return 1
  }
  if (a.name !== b.name) return a.name < b.name ? -1 : 1
  if (a.id !== b.id) return a.id < b.id ? -1 : 1
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1
  return 0
}

/**
 * The artefacts drafted from one conversation.
 *
 * The conversation id is matched exactly (after trimming) on all three lists:
 * session ids are opaque tokens, not prose, so two ids that differ only by case
 * are two different conversations and folding the case would attach a
 * stranger's workflow, skill or job to this chat.
 *
 * A row without a usable id is dropped rather than shown disabled — the strip
 * exists to take you somewhere, and there is nowhere to go.
 */
export function deriveMadeFrom(
  input: MadeFromInput,
  limit: number = MADE_FROM_ROWS,
): MadeFromResult {
  const sessionId = asText(input.sessionId)
  const skillsUnknown = input.skills === null || input.skills === undefined
  const jobsUnknown = input.jobs === null || input.jobs === undefined
  if (!sessionId) {
    // No conversation means no claim at all, including no "skills unchecked"
    // note: the chat does not even mount the strip in this state.
    return { rows: [], total: 0, skillsUnknown: false, jobsUnknown: false }
  }

  const matches: MadeFromRow[] = []

  for (const workflow of input.workflows ?? []) {
    const id = asText(workflow.id)
    if (!id) continue
    if (asText(workflow.sourceConversation) !== sessionId) continue
    matches.push({
      kind: 'workflow',
      id,
      // A name is not provenance and its absence is not a reason to hide the
      // row; the id is at least something the user can recognise.
      name: asText(workflow.name) || id,
      date: asText(workflow.sourceDraftedAt) || null,
    })
  }

  for (const skill of input.skills ?? []) {
    const id = asText(skill.dirPath)
    if (!id) continue
    if (asText(skill.sourceConversation) !== sessionId) continue
    matches.push({
      kind: 'skill',
      id,
      name: asText(skill.name) || id,
      date: asText(skill.createdAt) || null,
    })
  }

  for (const job of input.jobs ?? []) {
    const id = asText(job.id)
    if (!id) continue
    if (asText(job.sourceConversation) !== sessionId) continue
    matches.push({
      kind: 'job',
      id,
      name: asText(job.name) || id,
      date: asText(job.sourceDraftedAt) || null,
    })
  }

  matches.sort(compareRows)

  // `skills/list` can return one directory twice when two scanned roots resolve
  // to it (the skills page dedupes the same way). One artefact is one row: a
  // second copy would also hand React a duplicate key. The kind is part of the
  // key, so a job and a workflow that happen to share an id stay two rows.
  const seen = new Set<string>()
  const unique = matches.filter(row => {
    const key = `${row.kind}:${row.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // The cap is a parameter so the strip can expand in place: a "+N more" that
  // leads nowhere would be the same dead end as the rows it hides.
  const max = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : Number.POSITIVE_INFINITY
  return {
    rows: unique.slice(0, max),
    total: unique.length,
    skillsUnknown,
    jobsUnknown,
  }
}
