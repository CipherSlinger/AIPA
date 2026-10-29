// The vocabulary of a scheduled run's held permission requests.
//
// Three surfaces say the same facts in different sizes: the status bar segment
// ("Waiting 1 for your answer"), the panel behind it (the verbatim ask and two
// buttons), and Settings -> Automations (a status line while waiting, a clause
// in the run history afterwards). Keeping the wording in one module is what
// stops the three from describing the same wait in three different ways.
//
// Nothing here writes state. The queue lives in the main process, and the only
// way to answer it is `automationApprovalRespond` naming one request id — there
// is deliberately no helper in this file that could pretend otherwise.

import type {
  AutomationJobData,
  AutomationRunApprovalData,
  AutomationRunApprovalOutcomeData,
  AutomationWaitingApprovalData,
} from '../../../preload'
import type { Translate } from './scheduleText'

/**
 * The wait after which a held request is denied by the engine side.
 *
 * Mirrors `RUN_APPROVAL_TIMEOUT_MS` in `src/main/automation/run-approvals.ts`.
 * It is repeated here only to word the panel's note; the deadline itself is
 * enforced by the queue's own timer, never by the renderer.
 */
export const RUN_APPROVAL_TIMEOUT_MINUTES = 15

export interface WaitingApprovalRow {
  job: AutomationJobData
  wait: AutomationWaitingApprovalData
}

/**
 * The jobs whose live run is holding a request for the user, oldest first.
 *
 * `running` is required as well as the wait: the main process derives the view
 * from live runs, and a stale wait on a job that is no longer running is not
 * something anyone could answer. Ordering by `since` means the longest wait is
 * the one the reader meets first.
 */
export function deriveWaitingApprovals(jobs: AutomationJobData[]): WaitingApprovalRow[] {
  const rows: WaitingApprovalRow[] = []
  for (const job of jobs) {
    if (!job.running || !job.waitingApproval) continue
    rows.push({ job, wait: job.waitingApproval })
  }
  return rows.sort((a, b) => a.wait.since - b.wait.since)
}

/** Stable identity of one held request, for per-request busy state. */
export function waitingApprovalKey(jobId: string, requestId: string): string {
  return `${jobId}\u0000${requestId}`
}

/**
 * How one request ended, in words. Every path is named: a denial is never left
 * to read as a timeout, and a structural refusal says which limit refused it.
 */
export function approvalOutcomeText(
  outcome: AutomationRunApprovalOutcomeData,
  t: Translate,
): string {
  switch (outcome) {
    case 'approved': return t('automation.runApproval.outcome.approved')
    case 'denied': return t('automation.runApproval.outcome.denied')
    case 'timeout': return t('automation.runApproval.outcome.timeout')
    case 'queue-full': return t('automation.runApproval.outcome.queueFull')
    case 'run-busy': return t('automation.runApproval.outcome.runBusy')
    case 'run-ended': return t('automation.runApproval.outcome.runEnded')
    case 'interrupted': return t('automation.runApproval.outcome.interrupted')
  }
}

/**
 * The history clause for one held request: who answered, how, after how long.
 *
 * The clause is short because a run history row already carries time, status,
 * duration and spend; the verbatim ask travels in the tooltip instead of
 * inflating every row. A structural refusal waited 0 ms and says nothing about
 * a wait — the outcome words already explain it.
 */
export function approvalClause(
  approval: AutomationRunApprovalData,
  t: Translate,
  durationText: (ms: number | null) => string | null,
): string {
  const outcome = approvalOutcomeText(approval.outcome, t)
  const waited = approval.waitedMs > 0 ? durationText(approval.waitedMs) : null
  return waited
    ? t('automation.runApproval.clause', { outcome, waited })
    : t('automation.runApproval.clauseNoWait', { outcome })
}
