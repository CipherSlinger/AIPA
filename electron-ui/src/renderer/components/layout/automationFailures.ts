// Unseen scheduled-run failures: the watermark and the derivation behind the
// status bar's background-work segment (wave 27).
//
// A run that fails while the window is closed leaves nothing the user can see
// the next morning: the toast has expired and the segment hides as soon as
// nothing is in flight. Settings -> Automations is the only place that still
// remembers, and only for a user who thinks to look. This module answers the
// one question that fixes it: which failed runs has the user not been shown yet?
//
// Apart from the two storage helpers, everything here is pure. The storage
// object is passed in rather than reached for, so a harness can drive the
// seeding and watermark rules with a fake, and the clock is passed wherever it
// matters.

import type { AutomationJobData, AutomationRunRecordData } from '../../../preload'
import type { Translate } from '../automation/scheduleText'

/**
 * The single app-scoped key holding the timestamp up to which failures have
 * already been shown. One key, not one per job: the user is asked to look at a
 * list, not to acknowledge each schedule.
 */
export const FAILURES_SEEN_KEY = 'aipa.automationFailuresSeenAt'

/** How many failed runs the popover lists before it says "and N more". */
export const FAILURE_ROWS_VISIBLE = 5

/** The slice of `Storage` this module needs; `null` means "not available". */
export interface WatermarkStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/**
 * Session-only watermark for profiles where localStorage throws (privacy mode,
 * locked store). The badge keeps working for this run instead of either
 * vanishing or re-announcing every failure on each render.
 */
let memoryFallback: number | null = null

/** localStorage, or null where the profile forbids access. */
export function appWatermarkStorage(): WatermarkStorage | null {
  try {
    return window.localStorage ?? null
  } catch {
    return null
  }
}

function readFailuresSeenAt(storage: WatermarkStorage | null): number | null {
  if (!storage) return memoryFallback
  try {
    const raw = storage.getItem(FAILURES_SEEN_KEY)
    // A real store with no key means "never set", which is what seeds it. Only
    // an unavailable store falls back to memory.
    if (raw === null) return null
    const value = Number(raw)
    // A hand-edited or corrupted value must not silence the badge forever;
    // anything that is not a real timestamp reads as "never set".
    return Number.isFinite(value) && value >= 0 ? value : null
  } catch {
    return memoryFallback
  }
}

function writeFailuresSeenAt(at: number, storage: WatermarkStorage | null): void {
  memoryFallback = at
  if (!storage) return
  try {
    storage.setItem(FAILURES_SEEN_KEY, String(at))
  } catch {
    // The in-memory value still covers this run.
  }
}

/**
 * When a failure became knowable: the run's start plus how long it ran.
 *
 * The watermark has to be read against this, not against `startedAt`. A run can
 * be in flight when the user opens the panel: it started before the watermark
 * that opening writes, but it fails afterwards, and its record will carry that
 * earlier start time. Comparing starts would file that failure as "already
 * shown" the moment the panel closed — exactly the run the user was just
 * watching. `durationMs` is null only for runs that never executed (missing
 * workflow, nothing to run), whose failure was known at the start instant, so
 * there the two times coincide.
 */
export function failureCompletedAt(record: AutomationRunRecordData): number {
  return record.startedAt + (record.durationMs ?? 0)
}

/** The newest failed run in the store, or null when nothing has failed. */
function newestFailureAt(jobs: AutomationJobData[]): number | null {
  let newest: number | null = null
  for (const job of jobs) {
    for (const record of job.history) {
      if (record.status !== 'error') continue
      const at = failureCompletedAt(record)
      if (newest === null || at > newest) newest = at
    }
  }
  return newest
}

/**
 * The watermark to derive against, seeding it the first time this feature runs.
 *
 * Seeding to the newest failure already in the store — rather than to zero — is
 * deliberate: history survives for as long as the job does, so a first render
 * against zero would greet someone upgrading after months of overnight runs
 * with a badge counting every one of them. Nobody is owed a debt for failures
 * they were never shown. When the store holds no failure at all, "now" is the
 * same answer and keeps the first future failure countable.
 */
export function resolveFailuresSeenAt(
  jobs: AutomationJobData[],
  storage: WatermarkStorage | null,
  now: number = Date.now(),
): number {
  const stored = readFailuresSeenAt(storage)
  if (stored !== null) return stored
  const seed = newestFailureAt(jobs) ?? now
  writeFailuresSeenAt(seed, storage)
  return seed
}

/** Everything up to `at` has now been shown; used when the popover opens. */
export function markFailuresSeen(at: number, storage: WatermarkStorage | null): void {
  writeFailuresSeenAt(at, storage)
}

export interface UnseenFailure {
  /** The job that failed, so a row can name it. */
  jobId: string
  jobName: string
  /** When the run started; the row's relative age is measured from here. */
  startedAt: number
  /** Failure code (or clipped message); the caller translates it. */
  error: string | null
  /** Set when the failed run left a transcript the user can open. */
  sessionId: string | null
  /** Consecutive failures on this job, so a repeat can say "3 in a row". */
  failureStreak: number
}

export interface UnseenFailureList {
  /** Every unseen failed run, newest first. */
  all: UnseenFailure[]
  /** The first `FAILURE_ROWS_VISIBLE` of `all` — what the panel lists. */
  rows: UnseenFailure[]
  /** The rest, summarised as one "and N more" line. */
  hiddenCount: number
  /** Failed runs unseen — what the segment's count shows. */
  total: number
}

const EMPTY: UnseenFailureList = Object.freeze({
  all: [], rows: [], hiddenCount: 0, total: 0,
}) as UnseenFailureList

/**
 * Failed runs newer than the watermark, newest first.
 *
 * A record counts only when its status is exactly `error`. Skips are the
 * scheduler declining to run (hourly cap, spend rail) and are never surfaced
 * here, and `running` never appears in history at all — a run in flight is
 * reported on the job, not as a past record. The key deliberately includes the
 * job id: two jobs can fail in the same millisecond, and one record must not be
 * counted twice if the same history is derived from twice in one render.
 *
 * A `null` watermark means "not seeded yet"; nothing is unseen until the
 * seeding path has run, which is what keeps old history from flashing up for
 * the frame before the first list load resolves.
 */
export function deriveUnseenFailures(
  jobs: AutomationJobData[],
  watermark: number | null,
  limit: number = FAILURE_ROWS_VISIBLE,
): UnseenFailureList {
  if (watermark === null) return EMPTY

  const seen = new Set<string>()
  const all: UnseenFailure[] = []
  for (const job of jobs) {
    for (const record of job.history) {
      if (record.status !== 'error') continue
      // Strictly newer: a failure that became knowable exactly at the watermark
      // was the last one shown, so it is not new. Comparing completion rather
      // than start is what keeps a run that was already in flight when the user
      // last looked from going silent when it fails afterwards.
      if (!(failureCompletedAt(record) > watermark)) continue
      const key = `${job.id}:${record.startedAt}`
      if (seen.has(key)) continue
      seen.add(key)
      all.push({
        jobId: job.id,
        jobName: job.name,
        startedAt: record.startedAt,
        error: record.error,
        sessionId: record.sessionId,
        failureStreak: job.failureStreak,
      })
    }
  }

  if (all.length === 0) return EMPTY

  // Newest first. The job id breaks a tie so the order cannot shuffle between
  // two renders that see the same records.
  all.sort((a, b) => (b.startedAt - a.startedAt) || a.jobId.localeCompare(b.jobId))
  const cap = Math.max(1, limit)
  return {
    all,
    rows: all.slice(0, cap),
    hiddenCount: Math.max(0, all.length - cap),
    total: all.length,
  }
}

/**
 * "3 failures in a row" for a job that kept failing, or null for a single
 * failure. Reuses the wording Settings -> Automations already uses, so the two
 * surfaces describe the same streak the same way.
 */
export function failureStreakText(streak: number, t: Translate): string | null {
  return streak >= 2 ? t('automation.failureStreak', { count: streak }) : null
}
