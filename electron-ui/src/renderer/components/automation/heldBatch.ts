// Run all held — the pure half of the background panel's batch action.
//
// Wave 61 gave every held job its own Run now. When several are held at once,
// starting them one by one is the common case, so the panel offers one action.
// The action is only honest if the set is re-read at the moment of the
// confirming click: a manual run that finished, a raised cap, or a newer record
// can clear a hold while the panel is open, and starting that job would be
// starting something the limit no longer holds.
//
// The arming phase is a small state machine rather than a boolean, so every way
// out of arming — pointer leave, Escape, closing the panel, the count moving,
// the timer — is the same transition, and a confirming click is impossible
// unless the action was armed first. Pure and React-free: the harness drives
// both halves without a DOM.

import type { AutomationJobData } from '../../../preload'
import { deriveHeldJobs } from './jobHold'
import type { Translate } from './scheduleText'

/** How long the confirming label waits before it lets go of the click. */
export const HELD_BATCH_ARM_MS = 5000

/**
 * The ids a confirming click would start, from the list it has just read.
 *
 * `deriveHeldJobs` already excludes a job whose newest record is no longer a
 * department refusal, which is the whole point of re-deriving here. Its cap is
 * lifted to the list length because this is the batch action, not a panel that
 * lists five; a job beyond the visible rows is still a held job. Duplicates are
 * dropped so one click can never start the same job twice.
 */
export function selectHeldRunBatch(jobs: ReadonlyArray<AutomationJobData>): string[] {
  const list = Array.isArray(jobs) ? jobs : []
  const seen = new Set<string>()
  const ids: string[] = []
  for (const row of deriveHeldJobs(list, list.length).rows) {
    if (seen.has(row.job.id)) continue
    seen.add(row.job.id)
    ids.push(row.job.id)
  }
  return ids
}

export interface HeldBatchResult {
  /** Jobs the confirming click set out to start. */
  total: number
  /** Jobs whose start call was accepted and left the job running. */
  started: number
}

/**
 * Summarise a finished batch. A call that was refused, threw, or was accepted
 * without the job actually running counts as not started, so the panel never
 * claims more runs than are visibly going.
 */
export function summarizeHeldBatch(total: number, started: number): HeldBatchResult {
  const safeTotal = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0
  const safeStarted = Number.isFinite(started)
    ? Math.min(Math.max(0, Math.floor(started)), safeTotal)
    : 0
  return { total: safeTotal, started: safeStarted }
}

export type HeldBatchOutcome =
  /** The re-derived set was empty: every hold cleared before the click landed. */
  | { kind: 'none' }
  /** The job list could not be read, so nothing was attempted. */
  | { kind: 'unreadable' }
  | { kind: 'all'; total: number }
  | { kind: 'partial'; total: number; started: number; failed: number }

export function heldBatchOutcome(result: HeldBatchResult): HeldBatchOutcome {
  if (result.total <= 0) return { kind: 'none' }
  if (result.started >= result.total) return { kind: 'all', total: result.total }
  return {
    kind: 'partial',
    total: result.total,
    started: result.started,
    failed: result.total - result.started,
  }
}

/**
 * The one line that replaces the hint after a click.
 *
 * "Started N runs" is used only when every call started. A partial batch names
 * how many did not; the empty and unreadable cases never borrow that sentence.
 */
export function heldBatchResultText(outcome: HeldBatchOutcome, t: Translate): string {
  switch (outcome.kind) {
    case 'none':
      return t('statusBar.background.runAllHeldNone')
    case 'unreadable':
      return t('statusBar.background.runAllHeldUnreadable')
    case 'all':
      return t('statusBar.background.runAllHeldAllStarted', { count: outcome.total })
    case 'partial':
      return t('statusBar.background.runAllHeldPartial', {
        started: outcome.started,
        total: outcome.total,
        failed: outcome.failed,
      })
  }
}

export type HeldBatchPhase =
  | { kind: 'idle' }
  | { kind: 'armed'; count: number }
  /** The count is the one the label named, kept while the set is re-read. */
  | { kind: 'running'; count: number }
  | { kind: 'done'; outcome: HeldBatchOutcome }

export type HeldBatchEvent =
  | { type: 'click'; heldCount: number }
  | { type: 'disarm' }
  | { type: 'countChanged'; heldCount: number }
  | { type: 'finish'; outcome: HeldBatchOutcome }

/**
 * The button's label for each phase. Every one of them names a number: the
 * action is never a bare "Run all", because the number is what tells the user
 * how much a manual run is about to spend.
 */
export function heldBatchLabel(
  phase: HeldBatchPhase,
  heldCount: number,
  t: Translate,
): string {
  if (phase.kind === 'armed') {
    return t('statusBar.background.runAllHeldConfirm', { count: phase.count })
  }
  if (phase.kind === 'running') {
    return t('statusBar.background.runAllHeldPending', { count: phase.count })
  }
  return t('statusBar.background.runAllHeld', { count: heldCount })
}

/** The line under the button while it is not reporting a result. */
export function heldBatchHint(t: Translate): string {
  return t('statusBar.background.runAllHeldHint')
}

/** What the action does, on hover. */
export function heldBatchTitle(t: Translate): string {
  return t('statusBar.background.runAllHeldTitle')
}

/**
 * The batch action's arming rules.
 *
 * A click arms when at least two jobs are held; with one held job the row's own
 * Run now is the whole action and a second step would only add friction.
 * Another click confirms. Once the batch is running, clicks are inert so the
 * pending lock covers the whole batch. Every way out of arming goes through
 * `disarm`; a changed held count disarms because the number in the label no
 * longer matches the set behind it.
 */
export function nextHeldBatchPhase(
  phase: HeldBatchPhase,
  event: HeldBatchEvent,
): HeldBatchPhase {
  if (event.type === 'finish') {
    return phase.kind === 'running' ? { kind: 'done', outcome: event.outcome } : phase
  }
  if (event.type === 'disarm') {
    return phase.kind === 'armed' ? { kind: 'idle' } : phase
  }
  if (event.type === 'countChanged') {
    if (phase.kind === 'armed' && phase.count !== event.heldCount) return { kind: 'idle' }
    return phase
  }
  if (phase.kind === 'running') return phase
  if (event.heldCount < 2) return { kind: 'idle' }
  if (phase.kind === 'armed') {
    // The label named a number; if that number no longer matches, this click
    // is not the confirmation the user saw.
    return phase.count === event.heldCount
      ? { kind: 'running', count: phase.count }
      : { kind: 'idle' }
  }
  return { kind: 'armed', count: event.heldCount }
}
