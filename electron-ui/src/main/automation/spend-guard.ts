/**
 * The per-job spend rail for scheduled runs.
 *
 * An unattended job spends money while nobody watches. Earlier waves made that
 * spend visible after the fact; this module is the part that can say "not
 * today". Two facts shape every rule here:
 *
 *   - Only reported money counts. Codex reports tokens but no dollars, and some
 *     Claude routes omit `total_cost_usd`; comparing a limit against an estimate
 *     would invent the very number the rail is meant to police.
 *   - A window with no cost report therefore cannot be evaluated. It is not
 *     "$0 spent": such a run is allowed and the row says the limit could not be
 *     checked, because a limit that silently looks satisfied is the one failure
 *     mode worse than an unprotected job.
 *
 * The window is rolling, not calendar-based: every scheduled run asks how much
 * this job reported in the 24 hours up to now, so a job running at 23:00 does not
 * get a fresh allowance at midnight.
 *
 * Pure and Electron-free so `.scratch/wave17-spend-guard-harness` can pin `now`
 * and exercise the boundaries without a scheduler or a window.
 */

import { AUTOMATION_HISTORY_CAP } from './run-history'
import type { AutomationJob, AutomationRunRecordStatus, AutomationSpendWindow } from './types'

/** A run counts as inside the window when `windowStart < startedAt <= now`. */
export const SPEND_WINDOW_MS = 24 * 60 * 60_000

/**
 * The largest limit worth accepting.
 *
 * A four-figure daily budget is already far beyond a personal automation, while
 * a number above this is much more likely a typo (an extra zero) than an
 * intention — and a typo would silently disable the rail the user asked for.
 */
export const MAX_DAILY_COST_LIMIT_USD = 1_000

/**
 * Validate a spend limit, returning absence for anything unusable.
 *
 * `undefined` is the only "no limit" representation: storing `0` would turn
 * "never set" and "set to nothing" into "every run is over budget", and would
 * also be indistinguishable from an engine's real `$0` report.
 */
export function normalizeDailyCostLimit(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  if (value <= 0 || value > MAX_DAILY_COST_LIMIT_USD) return undefined
  // Costs keep fractional precision; trimming below a millionth of a dollar
  // keeps repeated store rewrites from drifting the float the user typed.
  return Math.round(value * 1e6) / 1e6
}

function addCost(
  reportedCostUsd: number | undefined,
  costUsd: number | undefined,
): number | undefined {
  if (costUsd === undefined) return reportedCostUsd
  return (reportedCostUsd ?? 0) + costUsd
}

/**
 * What the rolling window holds for one job.
 *
 * Only real attempts (success or error) count. A skip never executed, so it
 * carries no spend and must not make the window look "covered" or spent.
 */
export function summarizeSpendWindow(job: AutomationJob, now: number): AutomationSpendWindow {
  const windowStart = now - SPEND_WINDOW_MS
  const inWindow = (startedAt: number): boolean => startedAt > windowStart && startedAt <= now

  // The history is capped. A full list whose oldest record still falls inside
  // the window proves older runs in this window were evicted, so the sum is a
  // lower bound rather than a total.
  const partial =
    job.history.length >= AUTOMATION_HISTORY_CAP &&
    job.history.length > 0 &&
    job.history[0].startedAt > windowStart

  let reportedCostUsd: number | undefined
  let attemptedRuns = 0
  let unreportedRuns = 0

  const fold = (
    startedAt: number,
    status: AutomationRunRecordStatus,
    costUsd: number | undefined,
  ): void => {
    if (!inWindow(startedAt)) return
    // A skip is not an attempt: the guard fired before any work (or any spend).
    if (status === 'skipped') return
    attemptedRuns += 1
    if (costUsd === undefined) unreportedRuns += 1
    else reportedCostUsd = addCost(reportedCostUsd, costUsd)
  }

  for (const record of job.history) {
    fold(record.startedAt, record.status, record.usage?.costUsd)
  }

  // The history postdates the history feature, so a job persisted before it (or
  // a run whose record has not been appended yet) still carries its latest
  // facts on the job. Fold that run in only when its start is absent from the
  // history, which keeps it from being counted twice.
  if (
    job.lastRunAt !== null &&
    (job.lastStatus === 'success' || job.lastStatus === 'error') &&
    !job.history.some(record => record.startedAt === job.lastRunAt)
  ) {
    fold(job.lastRunAt, job.lastStatus, job.lastUsage?.costUsd)
  }

  return {
    windowStart,
    ...(reportedCostUsd !== undefined ? { reportedCostUsd } : {}),
    attemptedRuns,
    unreportedRuns,
    // With a partial window and no report, the missing runs may have spent
    // money the sum never saw, so the limit is equally unevaluable.
    unmeasured: reportedCostUsd === undefined && (attemptedRuns > 0 || partial),
    partial,
  }
}

/**
 * Why a run may or may not start.
 *
 * `not_applicable` means there is nothing to enforce: the job has no limit, or
 * the user asked for this run by hand.
 */
export type SpendGuardDecision =
  | { kind: 'not_applicable' }
  | { kind: 'allowed'; summary: AutomationSpendWindow; unmeasured: boolean }
  | { kind: 'blocked'; summary: AutomationSpendWindow }

/**
 * Decide whether a scheduled run may start.
 *
 * `manual` is the Run now button / command palette: the user asked for this
 * run explicitly, so it is never blocked. Everything else about a manual run is
 * unchanged — it is still subject to the concurrency rail.
 *
 * At or above the limit blocks. The tiny epsilon only absorbs float dust from
 * summing fractional costs, so a sum that is mathematically exactly at the
 * limit is still treated as at the limit.
 */
export function checkSpendLimit(
  job: AutomationJob,
  now: number,
  source: 'scheduled' | 'manual',
): SpendGuardDecision {
  if (source === 'manual') return { kind: 'not_applicable' }
  const limit = normalizeDailyCostLimit(job.dailyCostLimitUsd)
  if (limit === undefined) return { kind: 'not_applicable' }

  const summary = summarizeSpendWindow(job, now)
  if (summary.reportedCostUsd !== undefined && summary.reportedCostUsd + 1e-9 >= limit) {
    return { kind: 'blocked', summary }
  }
  return { kind: 'allowed', summary, unmeasured: summary.unmeasured }
}
