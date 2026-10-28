// What a department's scheduled work costs, reduced to something a surface can
// say without doing arithmetic of its own.
//
// Main owns the figure — the same helper behind the per-job and global spend
// rails decides whether a run reported money and whether the stored history can
// reach back to the window start. This module only turns that summary into a
// display fact, so the honesty rules below are testable without a DOM:
//
//   * `null` (or any shape that cannot be read) is an unknown, never "$0". The
//     request may have been refused by main or rejected by IPC;
//   * an absent `reportedCostUsd` is not zero — no run reported money;
//   * `unreportedRuns > 0` or `partial` makes a reported figure a lower bound;
//   * `unmeasured` means no figure could be read at all, so "nothing was spent"
//     is not a conclusion it supports;
//   * `jobsCounted === 0` is a real answer: nothing is filed under these nodes.
//
// The only calendar arithmetic lives in `deptSpendWindowStart`, which delegates
// the brief boundaries to `deptBrief.data.ts` so a spend fetch covers exactly
// the window the counts above it use (local midnights, DST-safe).

import type { AutomationDeptSpendData } from '../../../preload'
import { briefWindowBounds, type BriefWindow } from './deptBrief.data'

/** The three windows the department surfaces ask about. */
export type DeptSpendWindowKind = 'brief-today' | 'brief-week' | 'rolling-24h'

export const ROLLING_24H_MS = 24 * 60 * 60 * 1000

/**
 * Inclusive start for a spend request. `brief-today` and `brief-week` are the
 * same local-midnight boundaries `briefWindowBounds` gives the counts panel;
 * `rolling-24h` is a fixed span, not a calendar day, because the schedules strip
 * asks "the last 24 hours" regardless of what time it is.
 */
export function deptSpendWindowStart(
  kind: DeptSpendWindowKind,
  now: number,
): number {
  const safeNow = Number.isFinite(now) ? now : 0
  if (kind === 'rolling-24h') return safeNow - ROLLING_24H_MS
  const window: BriefWindow = kind === 'brief-week' ? 'week' : 'today'
  return briefWindowBounds(window, safeNow).start
}

export type DeptSpendKind =
  /** The request failed, was refused, or the payload was unreadable. */
  | 'unreadable'
  /** Nothing is filed under these nodes — a real answer, not an error. */
  | 'no-jobs'
  /** Jobs are filed here, but none started a run in the window. */
  | 'no-runs'
  /** A reported figure exists. `lowerBound` says whether it is a total. */
  | 'reported'
  /** Runs or capped history exist, but no cost could be read. */
  | 'unmeasured'

export interface DeptSpendFacts {
  kind: DeptSpendKind
  /**
   * Present only for `kind === 'reported'`. Never synthesised from an absent
   * `reportedCostUsd`; a reported zero stays zero.
   */
  usd?: number
  /**
   * Run counts for the "N runs" line. Present whenever runs were attempted;
   * `unreported` is already clamped to `attempted` so the surface prints one
   * honest sentence rather than two contradictory numbers.
   */
  runsText?: { attempted: number; unreported: number }
  /** The stored history may not reach back to the window start. */
  partial: boolean
  /**
   * True when `usd` is a floor, not a total. A partial history can hide older
   * runs even when every visible run reported money.
   */
  lowerBound: boolean
}

/** A finite non-negative count, or null when the field cannot be trusted. */
function readCount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  return Math.floor(value)
}

/**
 * Turn a main-process summary into a display fact.
 *
 * A `null` summary is deliberately *not* the same as an empty one: it means the
 * request itself did not answer, and callers must show the "could not be read"
 * state rather than "$0" or "no jobs".
 */
export function describeDeptSpend(summary: AutomationDeptSpendData | null): DeptSpendFacts {
  if (!summary || typeof summary !== 'object') {
    return { kind: 'unreadable', partial: false, lowerBound: false }
  }

  const raw = summary as unknown as Record<string, unknown>
  const jobsCounted = readCount(raw.jobsCounted)
  const attempted = readCount(raw.attemptedRuns)
  const unreportedRaw = readCount(raw.unreportedRuns)
  // A payload that cannot even name how many jobs/runs it looked at cannot
  // support any of the affirmative states below.
  if (jobsCounted === null || attempted === null || unreportedRaw === null) {
    return { kind: 'unreadable', partial: false, lowerBound: false }
  }

  const unreported = Math.min(unreportedRaw, attempted)
  const partial = raw.partial === true
  const unmeasured = raw.unmeasured === true
  const runsText = attempted > 0 ? { attempted, unreported } : undefined

  // Nothing filed under these nodes. Even a contradictory payload that also
  // carries runs says `no-jobs`: `jobsCounted` is the source's own definition
  // of the subtree, and it is empty.
  if (jobsCounted === 0) {
    return { kind: 'no-jobs', partial, lowerBound: false }
  }

  // Only a finite, non-negative number is a reported figure. An absent field,
  // a NaN or a negative one is missing information, not zero.
  const reported = typeof raw.reportedCostUsd === 'number'
    && Number.isFinite(raw.reportedCostUsd)
    && raw.reportedCostUsd >= 0
    ? raw.reportedCostUsd
    : undefined

  if (reported !== undefined) {
    return {
      kind: 'reported',
      usd: reported,
      runsText,
      partial,
      // `unmeasured` alongside a figure is contradictory, but if it is set the
      // number still cannot be called a total. Treat it as a floor.
      lowerBound: unreported > 0 || partial || unmeasured,
    }
  }

  // No money was reported. If main already marked the window unmeasured (runs
  // happened, or the capped history cannot prove none did), there is no figure
  // to show. The flag wins over "no runs" for exactly that reason.
  if (unmeasured) {
    return { kind: 'unmeasured', runsText, partial, lowerBound: true }
  }

  if (attempted === 0) {
    return { kind: 'no-runs', partial, lowerBound: false }
  }

  // Defensive: runs happened and no cost was reported even though the summary
  // did not set `unmeasured`. Absent is still not zero, so the only honest
  // state is "unmeasured" rather than a fabricated total.
  return { kind: 'unmeasured', runsText, partial, lowerBound: true }
}
