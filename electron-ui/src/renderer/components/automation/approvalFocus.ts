// Where a held request is reached from outside the background-work panel.
//
// Wave 76A gave an unattended run a held permission request and three surfaces
// that show it. This module is the one vocabulary those surfaces share for
// *jumping to* one request: the attention click and the command palette both
// name a job + request, and the panel decides whether that request is still
// there. Nothing here answers anything — the answer stays the panel's two
// buttons, and each names exactly one request id.
//
// There is deliberately no "always allow", no per-job auto-approve and no
// stored rule in this file, because wave 77C refuses to add one. A request that
// keeps being refused is a question about the job's configuration, not a
// permission the app may remember on the user's behalf.

import type { AutomationJobData } from '../../../preload'
import {
  deriveWaitingApprovals,
  waitingApprovalKey,
  type WaitingApprovalRow,
} from './runApproval'

/** The window event that asks the background-work panel to show one request. */
export const APPROVAL_FOCUS_EVENT = 'aipa:focusBackgroundApproval'

export interface ApprovalFocusTarget {
  jobId: string
  requestId: string
}

/**
 * `idle`  — nobody asked to focus a request.
 * `pending` — asked, but no list read has landed since, so nothing is claimed.
 * `focused` — that request is in the current list.
 * `gone`   — the current list proves it settled already.
 */
export type ApprovalFocusState = 'idle' | 'pending' | 'focused' | 'gone'

/**
 * The rows the command palette offers for live waits.
 *
 * `null` is a probe that could not answer; an empty list is a probe that
 * answered "nothing is waiting". Both yield no rows, so the builder returns no
 * commands and the palette prints no heading instead of an empty group.
 */
export function approvalPaletteRows(jobs: AutomationJobData[] | null): WaitingApprovalRow[] {
  if (!jobs) return []
  return deriveWaitingApprovals(jobs)
}

/** The payload of an attention click or a palette row, or null when malformed. */
export function parseApprovalFocus(detail: unknown): ApprovalFocusTarget | null {
  if (!detail || typeof detail !== 'object') return null
  const { jobId, requestId } = detail as Record<string, unknown>
  if (typeof jobId !== 'string' || jobId === '') return null
  if (typeof requestId !== 'string' || requestId === '') return null
  return { jobId, requestId }
}

/** The live wait the click pointed at, matched by both ids. */
export function findFocusedWait(
  rows: readonly WaitingApprovalRow[],
  target: ApprovalFocusTarget | null,
): WaitingApprovalRow | null {
  if (!target) return null
  return rows.find(row => waitingApprovalKey(row.job.id, row.wait.requestId)
    === waitingApprovalKey(target.jobId, target.requestId)) ?? null
}

/**
 * Whether the request a click pointed at can still be answered.
 *
 * `pending` until a list read that started after the click has landed: an old
 * snapshot cannot prove a request is gone, and saying "gone" while the list is
 * still on its way would be a false claim about the user's own request.
 */
export function approvalFocusState(
  target: ApprovalFocusTarget | null,
  rows: readonly WaitingApprovalRow[],
  checked: boolean,
): ApprovalFocusState {
  if (!target) return 'idle'
  if (findFocusedWait(rows, target)) return 'focused'
  return checked ? 'gone' : 'pending'
}

/**
 * Ask the background-work panel to open on one request.
 *
 * A window event rather than a store field: the panel owns its own open state
 * and is mounted by the status bar, so the two callers (the main-process
 * attention click and the command palette) need only one agreed name.
 */
export function dispatchApprovalFocus(target: ApprovalFocusTarget): void {
  window.dispatchEvent(new CustomEvent(APPROVAL_FOCUS_EVENT, { detail: target }))
}
