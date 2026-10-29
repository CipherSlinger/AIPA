/**
 * The bounded per-run record for an automation job.
 *
 * Until now a job remembered only the shape of its *last* run, so three failed
 * nights looked exactly like one and an older run's transcript could not be
 * traced back to the job that produced it. A history fixes both, but a history
 * that is allowed to grow (or to hold transcripts) would make the job store
 * unbounded, so every record is a handful of scalars and the list is capped.
 *
 * Why the array lives on the job instead of in a separate session-keyed ledger:
 *  - the job already owns the same facts for its latest run (`lastSessionId`,
 *    `lastUsage`, lifetime totals), and two stores could disagree after a crash
 *    between their writes;
 *  - the origin resolver already receives the job list, so older runs become
 *    labelable without a third injected source or a new IPC read;
 *  - one `automations.json` write (atomic rename, whitelist validation) covers
 *    scheduling state and run records together;
 *  - the cap keeps the file bounded at `maxJobs * AUTOMATION_HISTORY_CAP`
 *    records (50 * 20 = 1000 tiny objects), while a deleted job's history
 *    disappears with the job, which matches what "this job's runs" means.
 *
 * Pure and Electron-free so `.scratch/wave15-run-history-harness` can exercise
 * append, eviction, restore and streak rules without a store or a window.
 */
import { normalizeChangedFiles } from './changed-files'
import { normalizeMemoryDigest } from './memory-digest'
import { AUTOMATION_RETRY_POLICY } from './retry-policy'
import { normalizeRunUsage } from './run-usage'
import type {
  AutomationRunRecord,
  AutomationRunRecordStatus,
  AutomationRunSkipReason,
} from './types'

/** Runs remembered per job. Enough to see a nightly streak; small enough to bound the store. */
export const AUTOMATION_HISTORY_CAP = 20

/** An engine error message is diagnostic, not a transcript; clip it at the door. */
export const MAX_RUN_ERROR_CHARS = 500

const MAX_SESSION_ID_CHARS = 256
const RECORD_STATUSES: AutomationRunRecordStatus[] = ['success', 'error', 'skipped']

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Restore one persisted record, or drop it. Every field is re-checked because
 * this is the store's only defence: a hand-edited or half-written file must
 * degrade to fewer honest rows, never to a row that lies about what happened.
 */
export function normalizeRunRecord(raw: unknown): AutomationRunRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>

  const startedAt = finiteNumber(record.startedAt)
  if (startedAt === null || startedAt < 0) return null

  const status = typeof record.status === 'string' && RECORD_STATUSES.includes(record.status as AutomationRunRecordStatus)
    ? record.status as AutomationRunRecordStatus
    : null
  if (!status) return null

  const duration = finiteNumber(record.durationMs)
  const sessionId = typeof record.sessionId === 'string' &&
    record.sessionId.trim().length > 0 &&
    record.sessionId.length <= MAX_SESSION_ID_CHARS
    ? record.sessionId.trim()
    : null
  const errorText = typeof record.error === 'string' ? record.error.trim() : ''
  const error = errorText ? errorText.slice(0, MAX_RUN_ERROR_CHARS) : null
  // Only an attempt the policy could actually have made survives restore. A
  // success may carry it: a retry that works is still marked as a retry.
  const retry = typeof record.retry === 'number' &&
    Number.isInteger(record.retry) &&
    record.retry >= 1 &&
    record.retry <= AUTOMATION_RETRY_POLICY.maxRetries
    ? record.retry
    : undefined
  // A malformed descriptor is dropped, not the record: the run still happened,
  // and a record written before this field existed has no descriptor at all.
  const memory = normalizeMemoryDigest(record.memory)
  // Absent stays absent — "not recorded" must survive restore, never collapse
  // into an empty list. A corrupt summary is dropped for the same reason.
  const changedFiles = normalizeChangedFiles(record.changedFiles)

  // Invariants the scheduler relies on, enforced again on restore so a corrupt
  // row cannot claim spend or a transcript for a run that never happened:
  //  - a skip is not an attempt: no duration, no session, no spend, not late;
  //  - a success has no error.
  if (status === 'skipped') {
    // No memory descriptor: a skipped occurrence never fetched a snapshot, and
    // recording an empty one would claim it saw "no memory".
    //
    // Only the literal reason this build understands survives restore. An
    // unknown string is dropped rather than carried as a label no reader can
    // interpret; the `error` code still says which rail refused the run.
    const skipReason: AutomationRunSkipReason | undefined =
      record.skipReason === 'dept-budget' ? 'dept-budget' : undefined
    return {
      startedAt,
      status,
      durationMs: null,
      sessionId: null,
      error,
      late: false,
      ...(retry !== undefined ? { retry } : {}),
      ...(skipReason !== undefined ? { skipReason } : {}),
    }
  }
  if (status === 'success') {
    const usage = normalizeRunUsage(record.usage)
    return {
      startedAt,
      status,
      durationMs: duration !== null && duration >= 0 ? Math.floor(duration) : null,
      sessionId,
      error: null,
      late: record.late === true,
      ...(retry !== undefined ? { retry } : {}),
      ...(usage ? { usage } : {}),
      ...(memory ? { memory } : {}),
      ...(changedFiles ? { changedFiles } : {}),
    }
  }
  const usage = normalizeRunUsage(record.usage)
  return {
    startedAt,
    status,
    durationMs: duration !== null && duration >= 0 ? Math.floor(duration) : null,
    sessionId,
    error,
    late: record.late === true,
    ...(retry !== undefined ? { retry } : {}),
    ...(usage ? { usage } : {}),
    // A failed run saw a snapshot too; keeping it here is what makes the
    // history explain a failure that happened after the memory read.
    ...(memory ? { memory } : {}),
    // Edits made before a failure are still real; the summary travels with them.
    ...(changedFiles ? { changedFiles } : {}),
  }
}

/**
 * Restore a persisted history. Missing or malformed entries are dropped and the
 * list is capped from the newest end, so a tampered file cannot grow the store
 * or push out the most recent runs with junk.
 */
export function normalizeRunHistory(value: unknown): AutomationRunRecord[] {
  if (!Array.isArray(value)) return []
  return value
    .map(normalizeRunRecord)
    .filter((record): record is AutomationRunRecord => record !== null)
    .slice(-AUTOMATION_HISTORY_CAP)
}

/**
 * The record for an occurrence a safety rail refused to start.
 *
 * One constructor for every rail (the hourly runaway cap, the spend limit) so a
 * skip can never accidentally carry what only a real run earns: no duration, no
 * transcript, no spend, and never "late". `error` names the rail instead.
 *
 * `retry` marks a rail refusal of a pending retry, so the history can still
 * tell that the wait ended in a skip rather than an attempt.
 *
 * `skipReason` names the rail when a surface needs to count refusals rather
 * than read them. Only the department cap passes it; the other rails keep the
 * four-argument shape they had, so their records are byte-identical to before.
 */
export function createSkipRecord(
  startedAt: number,
  error: string,
  retry?: number,
  skipReason?: AutomationRunSkipReason,
): AutomationRunRecord {
  return {
    startedAt,
    status: 'skipped',
    durationMs: null,
    sessionId: null,
    error: clipError(error),
    late: false,
    ...(retry !== undefined ? { retry } : {}),
    ...(skipReason !== undefined ? { skipReason } : {}),
  }
}

function clipError(error: string): string | null {
  const text = error.trim()
  return text ? text.slice(0, MAX_RUN_ERROR_CHARS) : null
}

/** Append one finished run, evicting the oldest once the cap is reached. */
export function appendRunRecord(
  history: readonly AutomationRunRecord[],
  record: AutomationRunRecord,
): AutomationRunRecord[] {
  return [...history, record].slice(-AUTOMATION_HISTORY_CAP)
}

/**
 * "N failures in a row" for the settings row.
 *
 * A skip is not an attempt: the runaway guard fired before any work started,
 * so it neither adds to nor clears a failure streak. A failed retry is an
 * attempt like any other, so it grows the streak; a successful retry ends it.
 * Returns 0 when the history is empty or the latest attempt succeeded, which is
 * also what hides the clause on a job that is fine.
 */
export function countFailureStreak(history: readonly AutomationRunRecord[]): number {
  let streak = 0
  for (let i = history.length - 1; i >= 0; i--) {
    const status = history[i].status
    if (status === 'skipped') continue
    if (status === 'error') {
      streak += 1
      continue
    }
    break
  }
  return streak
}
