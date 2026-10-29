// A scheduled job that a department's daily spending limit refused.
//
// Wave 58 records every refusal on the job's history with `skipReason:
// 'dept-budget'`; wave 60 gave that refusal a face on the department surfaces.
// This module is the one predicate every other surface uses, so the status bar,
// the popover and Settings cannot disagree about which jobs are being held —
// the same reason the run history derivation lives in one place.
//
// Three rules matter for honesty:
//   * "held" is about the *newest* run record. A hold followed by a successful
//     manual run is not a held job any more, and an older hold must not keep a
//     job looking stopped.
//   * a skip without a structured reason (a legacy record, the hourly cap, the
//     app having been closed) is *not* a hold. It says nothing about money.
//   * a malformed record is not evidence of a hold either: an unknown
//     `skipReason` is treated as absent rather than as "probably dept-budget".
//
// Pure and React-free so every surface can share it and a harness can drive it.

import type { AutomationJobData, AutomationRunRecordData } from '../../../preload'

export interface JobHold {
  job: AutomationJobData
  /** When the refused occurrence would have run (epoch ms). */
  at: number
  /** The org node whose cap held it; absent when the job is filed nowhere. */
  departmentId: string | null
}

/** How many held jobs a surface lists before it says "and N more". */
export const HOLD_ROWS_VISIBLE = 5

/**
 * The job's newest run record.
 *
 * Ordered by `startedAt` rather than by array position: the store appends in
 * time order, but a reordered or hand-edited payload must not make a stale hold
 * look like the latest event.
 */
export function latestRunRecord(job: AutomationJobData): AutomationRunRecordData | null {
  const history = Array.isArray(job.history) ? job.history : []
  let latest: AutomationRunRecordData | null = null
  for (const record of history) {
    if (!record || typeof record !== 'object') continue
    if (typeof record.startedAt !== 'number' || !Number.isFinite(record.startedAt)) continue
    if (!latest || record.startedAt >= latest.startedAt) latest = record
  }
  return latest
}

/** True only when the newest record is a department-limit refusal. */
export function isHeldJob(job: AutomationJobData): boolean {
  const record = latestRunRecord(job)
  if (!record) return false
  return record.status === 'skipped' && record.skipReason === 'dept-budget'
}

/** When the held occurrence was due; null when the job is not held. */
export function heldSince(job: AutomationJobData): number | null {
  if (!isHeldJob(job)) return null
  const record = latestRunRecord(job)
  return record ? record.startedAt : null
}

/** The org node whose cap held the job; null when there is no hold. */
export function heldDepartmentId(job: AutomationJobData): string | null {
  if (!isHeldJob(job)) return null
  const id = typeof job.departmentId === 'string' ? job.departmentId.trim() : ''
  return id || null
}

export interface HeldJobs {
  rows: JobHold[]
  /** Held jobs beyond the cap. */
  hidden: number
}

/**
 * Held jobs, newest hold first. A job has at most one row because a job has one
 * newest record; the cap bounds a surface, and `hidden` makes the bound honest
 * rather than silently dropping the rest.
 */
export function deriveHeldJobs(
  jobs: ReadonlyArray<AutomationJobData>,
  limit = HOLD_ROWS_VISIBLE,
): HeldJobs {
  const max = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : HOLD_ROWS_VISIBLE
  const rows: JobHold[] = []
  for (const job of Array.isArray(jobs) ? jobs : []) {
    if (!job || typeof job !== 'object' || typeof job.id !== 'string') continue
    const at = heldSince(job)
    if (at === null) continue
    rows.push({ job, at, departmentId: heldDepartmentId(job) })
  }
  rows.sort((a, b) => (b.at - a.at) || a.job.name.localeCompare(b.job.name))
  return { rows: rows.slice(0, max), hidden: Math.max(0, rows.length - max) }
}
