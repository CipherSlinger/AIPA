// Search and status filtering for Settings → Automations.
//
// The list has grown a dozen row-level facts (schedule kinds, watch paths,
// personas, spend guards, failure streaks, clones), so finding one job by eye
// has become a scroll. This module owns every rule behind the filter row so a
// harness can exercise them without React or the DOM; the component only calls
// `matchesJob` / `countJobsByStatus`.
//
// The searchable schedule sentence and workflow/persona names are *not* derived
// here: the schedule is localized by `scheduleText`, and a job stores only ids
// for its workflow and expert. The caller supplies those already-resolved
// strings through `JobSearchContext`, which keeps this module free of the i18n
// layer. Missing context fields simply contribute no searchable text.
//
// Skills are the one exception: a skill job stores no display name either, but
// unlike a workflow id there is no store to resolve it against — it lives on
// disk. `rememberSkills` takes the list the caller already read and keeps the
// names in a session journal, so a skill deleted after its job was scheduled
// stays findable by the name the user remembers, without a probe per keystroke.

import type { AutomationActionData, AutomationJobData } from '../../../preload'

/**
 * Status chips, in the order the filter row renders them. These are not
 * mutually exclusive in practice ("running" and "failing" can both be true for
 * a retry), so a selection is treated as OR — see `matchesJob`.
 */
export type JobFilterStatus = 'running' | 'failing' | 'disabled' | 'waitingPath'

export const JOB_FILTER_STATUSES: readonly JobFilterStatus[] = [
  'running',
  'failing',
  'disabled',
  'waitingPath',
]

const STATUS_SET: ReadonlySet<string> = new Set<string>(JOB_FILTER_STATUSES)

/** Everything the filter row can control. Both members are optional. */
export interface JobFilterQuery {
  /** Free text; whitespace separates independent terms. */
  text?: string
  /** Empty/absent means "any status". A selection matches when any chip does. */
  statuses?: readonly JobFilterStatus[]
}

/**
 * Text the job cannot carry itself because it is localized or resolved from
 * another store. Null/undefined is treated as "no such field", never as a
 * match or a crash.
 */
export interface JobSearchContext {
  /** Resolved name of the job's workflow, when its action is a workflow. */
  workflowName?: string | null
  /** Localized `scheduleText(...)` for the job's trigger. */
  scheduleSentence?: string | null
  /** Display name of the expert that will actually run the job. */
  personaName?: string | null
  /**
   * Display name of the skill a skill-job runs. The job stores no name, so
   * this comes from the installed-skill list — or from the session journal
   * below when the skill has been deleted since it was scheduled.
   */
  skillName?: string | null
  /** The same skill's description. Absent once the skill is gone and forgotten. */
  skillDescription?: string | null
  /**
   * The stored identity (`weekly-report`, or `''` for the root SKILL.md).
   * Unlike the name, it lives in the job itself, so it survives deletion; it
   * is also the fallback label the Settings row prints for a missing skill.
   */
  skillDir?: string | null
}

// ── Skill names for a job that outlived its skill ───────────────────────────
//
// A job stores `{ source, dir }`, never the skill's name. While the skill is
// installed the name comes from the list the caller already read; once the
// folder is deleted, that list cannot answer any more, and the job row can
// only show the folder name. A user who remembers "Weekly report" would then
// find nothing and have no way to reach the broken job.
//
// The journal remembers every name/description seen in this renderer session,
// keyed by the same identity the job stores. It is written only when a skill
// list is read — once per search session, never per keystroke — and it is
// never pruned: a name that disappears from the list is exactly the one worth
// keeping. A live skill overwrites its own entry, so reinstalling a different
// skill into the same folder never leaves the old name attached to it.
//
// Its honest boundary: across an app restart the journal is empty, and a
// permanently deleted skill is then findable by its folder segment (which is
// always searchable) but no longer by its display name. The trash manifest
// stores only the folder name too, so it cannot do better; this is stated
// rather than hidden behind a filesystem probe.

/** The parts of a `skills:list` entry this module needs. */
export interface SkillSearchEntry {
  source: 'personal' | 'project'
  skillDir: string
  name: string
  description?: string | null
}

const rememberedSkills = new Map<string, { name: string; description: string }>()

function skillKey(source: string, dir: string): string {
  // A separator that cannot appear in either half, so "a" + "b:c" and
  // "a:b" + "c" do not collide.
  return `${source}\u0000${dir}`
}

/** Remember the names a read skill list carried. Absence is never an erase. */
export function rememberSkills(skills: readonly SkillSearchEntry[] | null | undefined): void {
  if (!Array.isArray(skills)) return
  for (const skill of skills) {
    if (!skill || typeof skill.skillDir !== 'string') continue
    const name = typeof skill.name === 'string' ? skill.name.trim() : ''
    if (!name) continue
    rememberedSkills.set(skillKey(skill.source, skill.skillDir), {
      name,
      description: typeof skill.description === 'string' ? skill.description : '',
    })
  }
}

/** The last name this session saw for an identity, even after its folder went. */
export function rememberedSkillName(
  source: 'personal' | 'project',
  dir: string,
): string | null {
  return rememberedSkills.get(skillKey(source, dir))?.name ?? null
}

/**
 * The three skill facts a job's search context needs.
 *
 * A live skill answers from the list the caller just read; a deleted one
 * answers from the journal. A non-skill action contributes nothing, so a
 * workflow or prompt job is never matched by an unrelated skill.
 */
export function skillSearchFields(
  action: AutomationActionData | null | undefined,
  live: readonly SkillSearchEntry[] | null | undefined,
): Pick<JobSearchContext, 'skillName' | 'skillDescription' | 'skillDir'> {
  if (!action || action.kind !== 'skill') {
    return { skillName: null, skillDescription: null, skillDir: null }
  }
  const { skillSource, skillDir } = action
  const found = Array.isArray(live)
    ? live.find(skill => skill && skill.source === skillSource && skill.skillDir === skillDir)
    : undefined
  const remembered = rememberedSkills.get(skillKey(skillSource, skillDir))
  return {
    skillName: found?.name?.trim() || remembered?.name || null,
    skillDescription: found?.description ?? remembered?.description ?? null,
    skillDir,
  }
}

/** The broadest input shape the predicates accept; real callers pass full jobs. */
export type FilterableJob = Partial<AutomationJobData>

/**
 * Case- and whitespace-insensitive folding. Removing whitespace entirely means
 * "daily09" finds "Daily 09:00" and "morning   digest" finds "Morning Digest"
 * without each caller having to guess how the user spaces things.
 */
function fold(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase().replace(/\s+/g, '') : ''
}

/** Split the query into independent terms, dropping whitespace-only input. */
export function queryTerms(query: JobFilterQuery | null | undefined): string[] {
  const text = typeof query?.text === 'string' ? query.text : ''
  return text.toLowerCase().split(/\s+/).filter(term => term.length > 0)
}

/** Only known chips count; an unknown string in a hand-written query is ignored. */
function selectedStatuses(query: JobFilterQuery | null | undefined): JobFilterStatus[] {
  const statuses = Array.isArray(query?.statuses) ? query.statuses : []
  return statuses.filter((status): status is JobFilterStatus =>
    typeof status === 'string' && STATUS_SET.has(status))
}

/**
 * Whether the job's *current* state answers to one chip.
 *
 * "Failing" uses the failure streak as well as the last outcome because a skip
 * does not reset a streak (main's documented meaning): a job that failed, then
 * was skipped by the hourly cap, still needs its owner. A success clears the
 * streak, so a recovered job stops matching. A running job is not "disabled"
 * or "waiting" just because its last outcome is still in flight.
 */
export function jobMatchesStatus(
  job: FilterableJob | null | undefined,
  status: JobFilterStatus,
): boolean {
  if (!job) return false
  switch (status) {
    case 'running':
      return job.running === true || job.lastStatus === 'running'
    case 'failing':
      return job.lastStatus === 'error'
        || (typeof job.failureStreak === 'number' && job.failureStreak > 0)
    case 'disabled':
      // Strict false: a missing `enabled` is not an answer, and old snapshots
      // without the field must not surface as "turned off".
      return job.enabled === false
    case 'waitingPath':
      // A watch job has no clock: it waits for its path to change. Whether the
      // path currently exists is a separate warning on the row, not the reason
      // this chip exists.
      return job.trigger?.kind === 'watch'
    default:
      return false
  }
}

/**
 * The stored skill identity with its separators removed, so a user typing the
 * display name without them ("weeklyreport") still finds `weekly-report`.
 * It is still one field: a term must occur inside it, not across two fields.
 */
function foldLoose(value: unknown): string {
  return fold(value).replace(/[-_.]+/g, '')
}

/** The searchable strings for one job, each folded independently. */
function searchableFields(
  job: FilterableJob | null | undefined,
  context: JobSearchContext | null | undefined,
): string[] {
  const fields = [
    job?.name,
    context?.workflowName,
    context?.scheduleSentence,
    context?.personaName,
    context?.skillName,
    context?.skillDescription,
    context?.skillDir,
  ]
  // Fields stay separate so a term cannot match across a boundary ("foo" + "bar"
  // must not produce a hit for "oob"). A term must occur inside one field.
  const folded = fields.map(fold).filter(field => field.length > 0)
  const looseDir = foldLoose(context?.skillDir)
  if (looseDir && !folded.includes(looseDir)) folded.push(looseDir)
  return folded
}

/**
 * The one predicate the component uses.
 *
 * Dimensions combine with AND: free text must match (if present) and the job
 * must answer at least one selected status chip (if any are selected). Chips
 * combine with OR because they describe alternate answers to "what state is
 * this job in" — requiring "Running" and "Failing" together would be a
 * guaranteed dead end.
 *
 * Total over malformed input: a missing job is not a match, and missing or
 * non-string fields never throw. An empty query matches every job, which is
 * what preserves the list's unfiltered order and contents.
 */
export function matchesJob(
  job: FilterableJob | null | undefined,
  query: JobFilterQuery | null | undefined,
  context?: JobSearchContext | null,
): boolean {
  if (!job) return false

  const terms = queryTerms(query)
  if (terms.length > 0) {
    const fields = searchableFields(job, context)
    // Every term must be present; none of them has to be in the same field, so
    // "digest analyst" finds a job named "Digest" run by the Analyst persona.
    if (!terms.every(term => fields.some(field => field.includes(term)))) return false
  }

  const statuses = selectedStatuses(query)
  if (statuses.length > 0 && !statuses.some(status => jobMatchesStatus(job, status))) {
    return false
  }
  return true
}

/**
 * Whether the row should offer "Clear filters". Mirrors `matchesJob`'s two
 * dimensions exactly, so the link never appears when nothing is narrowed.
 */
export function hasActiveFilters(query: JobFilterQuery | null | undefined): boolean {
  return queryTerms(query).length > 0 || selectedStatuses(query).length > 0
}

/**
 * Per-chip counts for the visible list.
 *
 * Text is applied because a count that ignores the search would promise rows
 * the user cannot see. The status selection is deliberately *not* applied:
 * toggling a chip should reveal its own count, not zero itself out.
 */
export function countJobsByStatus<J extends FilterableJob>(
  jobs: readonly J[] | null | undefined,
  query: JobFilterQuery | null | undefined,
  contextFor?: ((job: J) => JobSearchContext | null | undefined) | null,
): Record<JobFilterStatus, number> {
  const counts: Record<JobFilterStatus, number> = {
    running: 0,
    failing: 0,
    disabled: 0,
    waitingPath: 0,
  }
  const textOnly: JobFilterQuery = { text: query?.text ?? '', statuses: [] }
  for (const job of Array.isArray(jobs) ? jobs : []) {
    if (!matchesJob(job, textOnly, contextFor?.(job))) continue
    for (const status of JOB_FILTER_STATUSES) {
      if (jobMatchesStatus(job, status)) counts[status] += 1
    }
  }
  return counts
}
