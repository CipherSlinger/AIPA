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
// strings through `JobSearchContext`, which keeps this module pure and free of
// the i18n layer. Missing context fields simply contribute no searchable text.

import type { AutomationJobData } from '../../../preload'

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
  ]
  // Fields stay separate so a term cannot match across a boundary ("foo" + "bar"
  // must not produce a hit for "oob"). A term must occur inside one field.
  return fields.map(fold).filter(field => field.length > 0)
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
