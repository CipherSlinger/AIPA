// Ordering for Settings → Automations.
//
// The filter row decides *which* jobs are on screen; this module decides the
// order they are read in. It is deliberately React-free, and the two inputs
// that would otherwise be ambient — the clock and the app locale — are passed
// in, so a harness can pin `now` and compare both collations without a browser.
//
// Every mode is one sentence and no mode invents a hidden "priority" score.
// A composite score (weighted next-run + failures + recency) would put an
// unexpected job first with no way for the user to explain why; each ordering
// below can be checked by eye against the rows it produced.

import type { AutomationJobData } from '../../../preload'

/**
 * The four orderings the control offers. `nextRun` is the default because
 * "what happens next?" is the question a schedule list answers.
 */
export type JobSortMode = 'nextRun' | 'lastRun' | 'name' | 'status'

/** Render order of the control's options; the first is the page's default. */
export const JOB_SORT_MODES: readonly JobSortMode[] = ['nextRun', 'lastRun', 'name', 'status']

export interface JobSortOptions {
  /**
   * Reference instant for deciding whether a next occurrence is already due.
   * Required (not `Date.now()` inside) so the harness can pin the clock and so
   * a render is a pure function of its inputs.
   */
  now: number
  /** Resolved app locale (`en` / `zh-CN`), used only by the name collation. */
  locale: string
}

/** The broadest input shape the ordering accepts; real callers pass full jobs. */
export type SortableJob = Partial<AutomationJobData>

/** A timestamp is a number or nothing; NaN/Infinity are treated as missing. */
function finiteTime(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Same meaning as the filter's "running" chip, so the two controls agree. */
function isRunning(job: SortableJob): boolean {
  return job.running === true || job.lastStatus === 'running'
}

/**
 * Same meaning as the filter's "failing" chip: the last outcome failed, or an
 * unresolved streak remains (a skip does not clear it). Reusing the predicate's
 * wording keeps Status sort and the chip row from disagreeing about a job.
 */
function isFailing(job: SortableJob): boolean {
  return job.lastStatus === 'error'
    || (typeof job.failureStreak === 'number' && job.failureStreak > 0)
}

/** Strict false: a missing `enabled` is not evidence of being switched off. */
function isDisabled(job: SortableJob): boolean {
  return job.enabled === false
}

/**
 * Next-run groups, in display order:
 *   0 — enabled jobs with a real next occurrence (soonest first)
 *   1 — enabled watch jobs and jobs with no next occurrence (scheduler order)
 *   2 — switched-off jobs (scheduler order)
 *
 * A watch job is checked before `nextRunAt` on purpose: it fires on a path
 * change, not a clock, so even a stale `nextRunAt` must not let it pose as a
 * timed job. Switched-off jobs go last even if their stored timestamp is
 * sooner, because that timestamp will not happen while the job is off.
 */
function nextRunGroup(job: SortableJob): 0 | 1 | 2 {
  if (isDisabled(job)) return 2
  if (job.trigger?.kind === 'watch') return 1
  return finiteTime(job.nextRunAt) === null ? 1 : 0
}

/**
 * One mode's ordering. A zero return means "equal"; `sortJobs` then preserves
 * the scheduler's order for that pair. No comparator looks at a field it does
 * not need, so switching mode cannot silently drag another rule along.
 */
function compareForMode(
  a: SortableJob,
  b: SortableJob,
  mode: JobSortMode,
  now: number,
  locale: string,
): number {
  switch (mode) {
    case 'nextRun': {
      const aGroup = nextRunGroup(a)
      const bGroup = nextRunGroup(b)
      if (aGroup !== bGroup) return aGroup - bGroup
      if (aGroup !== 0) return 0
      const aTime = finiteTime(a.nextRunAt)
      const bTime = finiteTime(b.nextRunAt)
      // Both are group 0, so both timestamps are real.
      if (aTime === null || bTime === null) return 0
      // An occurrence at or before `now` is already due. Due jobs come first;
      // because every due timestamp is earlier than every future one, this
      // split agrees with plain ascending order rather than replacing it.
      const aDue = aTime <= now ? 0 : 1
      const bDue = bTime <= now ? 0 : 1
      if (aDue !== bDue) return aDue - bDue
      return aTime - bTime
    }

    case 'lastRun': {
      // Most recent first; a job that has never run has no place in a recency
      // ranking, so it sits after every job that has, in scheduler order.
      const aTime = finiteTime(a.lastRunAt)
      const bTime = finiteTime(b.lastRunAt)
      if (aTime === null && bTime === null) return 0
      if (aTime === null) return 1
      if (bTime === null) return -1
      return bTime - aTime
    }

    case 'name': {
      // `sensitivity: 'base'` makes case/punctuation-only differences a tie, so
      // those pairs fall back to the scheduler's order instead of an arbitrary
      // uppercase-first rule. The locale decides Han order (pinyin for zh-CN).
      const aName = typeof a.name === 'string' ? a.name : ''
      const bName = typeof b.name === 'string' ? b.name : ''
      return aName.localeCompare(bName, locale, { sensitivity: 'base' })
    }

    case 'status': {
      // Running outranks failing on purpose: a retry can be both, and the row
      // that is moving right now is the one the user is waiting on.
      const rank = (job: SortableJob): number => {
        if (isRunning(job)) return 0
        if (isFailing(job)) return 1
        if (isDisabled(job)) return 2
        return 3
      }
      return rank(a) - rank(b)
    }

    default:
      return 0
  }
}

/**
 * Order a copy of `jobs`; the input array and its objects are never mutated.
 *
 * Ties are broken by the original index rather than left to the engine's sort
 * implementation, making stability part of the contract even if the runtime
 * changes. That is what lets equal next-run times, equal names, and equal
 * statuses keep the order the scheduler returned.
 */
export function sortJobs<J extends SortableJob>(
  jobs: readonly J[] | null | undefined,
  mode: JobSortMode,
  options: JobSortOptions,
): J[] {
  const input = Array.isArray(jobs) ? jobs : []
  // Malformed options must not produce NaN comparisons. `0` keeps every
  // timestamp in the future, which is the same order as a valid clock here.
  const now = Number.isFinite(options?.now) ? options.now : 0
  const locale = typeof options?.locale === 'string' && options.locale !== '' ? options.locale : 'en'

  const decorated = input.map((job, index) => ({ job, index }))
  decorated.sort((a, b) => {
    const byMode = compareForMode(a.job, b.job, mode, now, locale)
    return byMode !== 0 ? byMode : a.index - b.index
  })
  return decorated.map(entry => entry.job)
}
