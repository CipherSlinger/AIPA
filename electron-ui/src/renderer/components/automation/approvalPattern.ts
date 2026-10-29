// When a scheduled job keeps asking and keeps being refused.
//
// Wave 77C: a held request is answerable, but a job that asks every night and
// is denied (or times out) every night is not a job to keep approving — it is
// a job whose folder, sandbox or instruction does not fit what it does. This
// module decides when that pattern is real enough to say so on the job's row.
//
// A refusal is a decision, not a failure. Nothing here looks at `lastStatus`,
// `failureStreak` or errors, and nothing here may word itself as breakage.
//
// Pure and React-free so the harness can exercise the boundary directly.

import type { AutomationJobData, AutomationRunRecordData } from '../../../preload'

/**
 * How many of the newest runs *that asked anything* are looked at.
 *
 * Runs that held no request say nothing about whether the asks fit the job, so
 * they are skipped rather than counted as quiet runs — otherwise a job that
 * asks every third night would never reach the window.
 */
export const ASKING_WINDOW_RUNS = 5

/** Fewer refusals than this is bad luck, not a pattern. */
export const ASKING_MIN_REFUSALS = 2

export interface RepeatedAsking {
  /** Requests in the window that the user denied or that timed out. */
  refusals: number
  /** Requests in the window the user approved. */
  approved: number
  /** The verbatim ask of the newest refused request — what to change the job around. */
  latestSubject: string
  latestAskedAt: number
}

/**
 * The exact rule, stated once:
 *
 *   Take the newest `ASKING_WINDOW_RUNS` run records whose `approvals` is a
 *   non-empty list. Count every request in them whose outcome is `denied` or
 *   `timeout` — the two endings where the job did not get permission — and
 *   every `approved` one. Report a pattern when there are at least
 *   `ASKING_MIN_REFUSALS` refusals *and* refusals outnumber approvals.
 *
 * Structural refusals (`queue-full`, `run-busy`, `run-ended`, `interrupted`)
 * are excluded from both sides. They are not the user's answer and not the
 * engine's deadline, so they would muddy a claim about the user's choices.
 */
export function deriveRepeatedAsking(
  job: Pick<AutomationJobData, 'history'>,
): RepeatedAsking | null {
  const asked = (job.history ?? []).filter(
    (run): run is AutomationRunRecordData & { approvals: NonNullable<AutomationRunRecordData['approvals']> } =>
      Array.isArray(run.approvals) && run.approvals.length > 0,
  )
  const window = asked.slice(-ASKING_WINDOW_RUNS)

  let refusals = 0
  let approved = 0
  let latestSubject = ''
  let latestAskedAt = -1
  for (const run of window) {
    for (const approval of run.approvals) {
      if (approval.outcome === 'denied' || approval.outcome === 'timeout') {
        refusals += 1
        if (approval.askedAt >= latestAskedAt) {
          latestAskedAt = approval.askedAt
          latestSubject = approval.subject
        }
      } else if (approval.outcome === 'approved') {
        approved += 1
      }
    }
  }

  if (refusals < ASKING_MIN_REFUSALS) return null
  if (refusals <= approved) return null
  return { refusals, approved, latestSubject, latestAskedAt }
}
