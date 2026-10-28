/**
 * The per-job rule for a scheduled occurrence that came due while AIPA was not
 * running.
 *
 * Every job used to catch up once on the first tick after launch and flag that
 * run late. That is the right answer for an unattended job whose work is still
 * useful, and the wrong one for a 07:00 briefing the user opens the laptop to
 * read at 18:00. This module owns the single decision: skip only what was
 * genuinely missed by a closed app.
 *
 * Pure and Electron-free so `.scratch/wave31-missed-policy-harness` can pin
 * `now` and exercise the predicate without a scheduler or a window.
 */
import type { AutomationMissedRunPolicy } from './types'

/**
 * The grace period a due occurrence gets after launch.
 *
 * This is the same threshold the scheduler uses to call a run late
 * (`LATE_THRESHOLD_MS` is assigned from it), so the two answers cannot drift:
 * a run that is due and starts a few seconds after launch is the ticker's
 * normal delay, not a schedule that was swallowed by a closed app. Without a
 * grace, opening AIPA at 07:00:05 would silently skip the 07:00 run the user
 * was sitting there waiting for.
 */
export const MISSED_RUN_GRACE_MS = 60_000

/**
 * Restore a persisted policy.
 *
 * Only a deliberate `'skip'` survives. Absent, `'run'` and any corrupt value
 * all normalise to `undefined`, which reads as the default catch-up behaviour.
 * The asymmetry is intentional: a bad byte may make a job run when the user
 * wanted it skipped, but it must never make a job drop a scheduled run the
 * user expected.
 */
export function normalizeMissedRunPolicy(value: unknown): AutomationMissedRunPolicy | undefined {
  return value === 'skip' ? 'skip' : undefined
}

export interface MissedRunDecisionInput {
  /** The job's stored choice; absent means `'run'`. */
  policy: AutomationMissedRunPolicy | undefined
  /** Epoch ms of the occurrence the scheduler is looking at. */
  nextRunAt: number
  /** Epoch ms when this process started its scheduler. */
  appStartedAt: number
  /** Epoch ms of the tick evaluating the occurrence. */
  now: number
  /** How late an occurrence may be and still count as the normal tick delay. */
  graceMs: number
}

/**
 * True only when the policy is `'skip'` and the occurrence predates this
 * process by more than the grace period.
 *
 * The `nextRunAt < appStartedAt` test is what separates a closed-app miss from
 * a busy-app delay: an occurrence that came due while AIPA was open always has
 * a `nextRunAt` at or after the process start, even if a full run slot kept it
 * waiting on the ticker for ten minutes. That occurrence is still due, and
 * still runs late exactly as before. The final comparison is strict, matching
 * the scheduler's late flag: an occurrence exactly `graceMs` old is the tick
 * delay and runs, not a miss.
 */
export function shouldSkipMissedRun(input: MissedRunDecisionInput): boolean {
  return (
    input.policy === 'skip' &&
    input.nextRunAt < input.appStartedAt &&
    input.now - input.nextRunAt > input.graceMs
  )
}
