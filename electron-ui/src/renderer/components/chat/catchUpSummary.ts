// What ran while the app was closed (wave 29).
//
// The status bar answers "is anything running right now?" and Settings ->
// Automations keeps every run, but neither answers the question a returning
// user actually asks first: what happened while I was gone? This module is the
// pure half of that answer — the "last opened" stamp, the gap it describes, and
// the runs that completed inside the gap.
//
// Apart from the storage helpers and the once-per-launch claim, everything here
// is pure and takes its clock, so a harness can drive the stamp rules with a
// fake storage and no DOM. The claim is memoised per module instance (the same
// trick the failures watermark uses for its session fallback) because it has to
// survive a ChatPanel remount without either repeating the card or resetting
// the stamp.

import type { AutomationJobData, AutomationRunRecordData } from '../../../preload'

/**
 * The one app-scoped key holding when the app was last opened. One key, not one
 * per feature: the whole point is a single boundary between "previous session"
 * and "this session".
 */
export const LAST_OPENED_KEY = 'aipa.lastOpenedAt'

/** How many runs the card lists before it says "and N more". */
export const CATCH_UP_ROWS_VISIBLE = 3

/** The slice of `Storage` this module needs; `null` means "not available". */
export interface StampStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** localStorage, or null where the profile forbids access. */
export function appStampStorage(): StampStorage | null {
  try {
    return window.localStorage ?? null
  } catch {
    return null
  }
}

/**
 * The previous launch stamp, or null when there is nothing trustworthy to
 * measure a gap from.
 *
 * A stamp is trusted only when it is a positive, finite number no later than
 * `now`. A non-numeric or missing value is simply the first launch. A value in
 * the future means the system clock moved backwards (or the store was edited);
 * measuring a gap against it would produce a negative window and a card that
 * claims the impossible, so it reads as "no previous launch" instead.
 */
export function readLastOpened(
  storage: StampStorage | null,
  now: number = Date.now(),
): number | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(LAST_OPENED_KEY)
    if (raw === null) return null
    // Number('') and Number('  ') are 0, which would sneak through a bare
    // finite check as an epoch-long gap.
    if (raw.trim() === '') return null
    const value = Number(raw)
    if (!Number.isFinite(value) || value <= 0 || value > now) return null
    return value
  } catch {
    // A throwing profile (privacy mode, locked store) has no history to speak
    // of; the card must not crash over it.
    return null
  }
}

function writeLastOpened(at: number, storage: StampStorage | null): void {
  if (!storage) return
  try {
    storage.setItem(LAST_OPENED_KEY, String(at))
  } catch {
    // The stamp is an optimisation for the next launch, not state this run
    // needs: a write that fails costs one honest card next time, nothing now.
  }
}

/** Memoised per process: the stamp read once at launch, never re-read. */
let launchStamp: { previous: number | null } | null = null
/** True once this launch has already had its chance to show the card. */
let consumed = false

/**
 * Read the previous stamp and immediately advance it to `now`, exactly once.
 *
 * The card is built from the value returned here — the *previous* launch — so
 * it describes the gap rather than the session the user is now in. Advancing
 * the stamp in the same breath means a reload or a ChatPanel remount can never
 * turn this session's own runs into "while you were away" news. Idempotent:
 * later calls return the same previous value instead of reading the stamp they
 * just wrote.
 */
export function claimLaunch(
  storage: StampStorage | null,
  now: number = Date.now(),
): number | null {
  if (launchStamp === null) {
    const previous = readLastOpened(storage, now)
    writeLastOpened(now, storage)
    launchStamp = { previous }
  }
  return launchStamp.previous
}

/**
 * The card gets one appearance per launch, and leaving the chat view (or
 * dismissing it) spends it. ChatPanel unmounts on the way to Settings or the
 * archive; without this, coming back would raise the same summary over a
 * conversation the user is in the middle of.
 */
export function consumeCatchUp(): void {
  consumed = true
}

export function isCatchUpConsumed(): boolean {
  return consumed
}

export type CatchUpOutcome = 'success' | 'error' | 'skipped'

export interface CatchUpRun {
  jobId: string
  jobName: string
  /** When the run started; this is what orders the card and ages its row. */
  startedAt: number
  /** When the run became knowable — the boundary the gap is measured on. */
  completedAt: number
  outcome: CatchUpOutcome
  /** Failure code or clipped message; the caller translates it. */
  error: string | null
  /** Set when the run left a transcript the user can open. */
  sessionId: string | null
}

export interface CatchUpSummary {
  /** Every run that completed in the gap, newest first. */
  runs: CatchUpRun[]
  /** The newest `CATCH_UP_ROWS_VISIBLE` of `runs` — what the card lists. */
  rows: CatchUpRun[]
  /** The rest, summarised as one "and N more" line. */
  hiddenCount: number
  succeeded: number
  failed: number
  skipped: number
  /** All runs in the gap — what "nothing ran" is tested against. */
  total: number
}

const EMPTY: CatchUpSummary = Object.freeze({
  runs: [], rows: [], hiddenCount: 0, succeeded: 0, failed: 0, skipped: 0, total: 0,
})

/**
 * When a run became knowable: its start plus how long it ran.
 *
 * The gap boundary has to be read against completion, not `startedAt`. A run
 * that begins ten minutes before the app was closed and finishes twenty
 * minutes after it is exactly the news the user came back for; comparing start
 * times would drop it. `durationMs` is null only for runs that never executed
 * (skips, a missing workflow), whose outcome was known at the start instant, so
 * there the two times coincide.
 */
export function runCompletedAt(record: AutomationRunRecordData): number {
  return record.startedAt + (record.durationMs ?? 0)
}

/**
 * The runs that completed after `previous` (the last launch), newest first.
 *
 * A `null` previous stamp means "first launch ever": nothing to report. Every
 * outcome counts toward the totals — a skip is a run the scheduler declined,
 * not a failure, and it keeps its own column. A run still in flight is not
 * reported at all: it has not completed, so it is not news, and `running`
 * never appears in `history` anyway (the cast below keeps that true if it
 * ever does).
 *
 * The dedupe key includes the job id: two jobs can start the same millisecond,
 * and one record must not be counted twice if the same history is derived from
 * twice in a row.
 */
export function deriveCatchUpRuns(
  jobs: AutomationJobData[],
  previous: number | null,
  limit: number = CATCH_UP_ROWS_VISIBLE,
): CatchUpSummary {
  if (previous === null) return EMPTY

  const seen = new Set<string>()
  const runs: CatchUpRun[] = []
  for (const job of jobs) {
    for (const record of job.history) {
      // `AutomationRunRecordData.status` excludes 'running'; widening it here
      // is the only way to state the exclusion and keep it true if a record
      // with an in-flight status ever reaches the renderer.
      const status: string = record.status
      // 'running' has not completed, and an unknown status cannot be honestly
      // filed under any of the three outcomes this card names.
      if (status !== 'success' && status !== 'error' && status !== 'skipped') continue
      const completedAt = runCompletedAt(record)
      // Strictly after the stamp: a run that became knowable exactly at the
      // moment the app was last opened was part of that session.
      if (!(completedAt > previous)) continue
      const key = `${job.id}:${record.startedAt}`
      if (seen.has(key)) continue
      seen.add(key)
      runs.push({
        jobId: job.id,
        jobName: job.name,
        startedAt: record.startedAt,
        completedAt,
        outcome: status as CatchUpOutcome,
        error: record.error,
        sessionId: record.sessionId,
      })
    }
  }

  if (runs.length === 0) return EMPTY

  // Newest first by start, because that is how a reader scans the list. Job id
  // breaks a tie so two renders of the same records cannot shuffle the order.
  runs.sort((a, b) => (b.startedAt - a.startedAt) || a.jobId.localeCompare(b.jobId))

  let succeeded = 0
  let failed = 0
  let skipped = 0
  for (const run of runs) {
    if (run.outcome === 'success') succeeded += 1
    else if (run.outcome === 'error') failed += 1
    else skipped += 1
  }

  const cap = Math.max(1, limit)
  return {
    runs,
    rows: runs.slice(0, cap),
    hiddenCount: Math.max(0, runs.length - cap),
    succeeded,
    failed,
    skipped,
    total: runs.length,
  }
}

/**
 * The width of the gap, at the precision that matters: "12m", "3h 20m",
 * "2d 3h". A gap under a minute is the app restarting, not a period away, and
 * saying "0m" there would invite the reader to distrust the rest of the card.
 */
export function gapText(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000))
  if (totalMinutes < 1) return '<1m'
  if (totalMinutes < 60) return `${totalMinutes}m`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours < 24) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  const rest = hours % 24
  return rest > 0 ? `${days}d ${rest}h` : `${days}d`
}
