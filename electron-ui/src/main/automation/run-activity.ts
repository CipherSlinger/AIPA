/**
 * Every job's remembered runs, flattened into one newest-first list.
 *
 * Each job keeps its own bounded history, so the app has always been able to
 * answer "what happened on this job" and never "what happened last night".
 * This is that second question: one read, one ordering, with the job each row
 * belongs to attached.
 *
 * Bounded on purpose. The history caps per job (20) and the job count is capped
 * (50), so the whole set is at most 1000 records; the flatten cap is still
 * stated, returned, and enforced *after* the global sort, so the list is never
 * a slice of one job's runs pretending to be all of them. `total` is the count
 * before the cap, which is what lets a surface say "the newest 500 of 1,240"
 * instead of implying it saw everything.
 *
 * Pure and Electron-free: the scheduler passes its live job array, and the
 * harness exercises ordering, the cap arithmetic and empty histories without a
 * store or a window.
 */
import { AUTOMATION_HISTORY_CAP } from './run-history'
import type { AutomationJob, AutomationRunRecord } from './types'

/**
 * The most rows one read returns.
 *
 * Larger than the practical maximum (50 jobs x 20 runs), so the cap only bites
 * on a store that grew past its own limits — a hand-edited file, or a future
 * change to either bound. It is returned with every read rather than left for
 * the renderer to repeat, so the number a surface prints is the number main
 * applied.
 */
export const AUTOMATION_RUN_ACTIVITY_CAP = 500

/** One remembered run, with the job it belongs to. */
export interface AutomationRunActivityRow {
  /** Live job id; the row opens this job in Settings when it left no transcript. */
  jobId: string
  /** The job's name as it stands now, not a snapshot taken at run time. */
  jobName: string
  /** The stored record, unchanged. Nothing is derived or reworded here. */
  run: AutomationRunRecord
}

export interface AutomationRunActivity {
  /** Newest first, at most `cap` rows. */
  rows: AutomationRunActivityRow[]
  /** Remembered runs across every live job, before the cap. */
  total: number
  /** The cap this read applied. */
  cap: number
  /** Runs one job remembers at most; the reason `total` is finite. */
  perJob: number
}

export interface FlattenRunActivityOptions {
  /** Override for tests; production always uses `AUTOMATION_RUN_ACTIVITY_CAP`. */
  cap?: number
}

/**
 * Flatten every job's history into one list.
 *
 * Only jobs in the array contribute — a deleted job's runs are not here,
 * because a deleted job's history left the store with it. A job with an empty
 * history contributes nothing rather than a placeholder: "this job has no runs"
 * is a fact about the job, not a run.
 *
 * Ordering is by start time, newest first. Ties are broken by the order the
 * records were appended within the read (each job's history is oldest-first, so
 * the later record in a tie is the newer write), then by job id — a deterministic
 * answer for two runs that started in the same millisecond, which a chain
 * makes entirely possible.
 */
export function flattenRunActivity(
  jobs: readonly AutomationJob[],
  options: FlattenRunActivityOptions = {},
): AutomationRunActivity {
  const cap = options.cap !== undefined && options.cap > 0
    ? Math.floor(options.cap)
    : AUTOMATION_RUN_ACTIVITY_CAP

  const all: Array<AutomationRunActivityRow & { seq: number }> = []
  let seq = 0
  let total = 0
  for (const job of jobs) {
    const history = Array.isArray(job.history) ? job.history : []
    for (const run of history) {
      // The job whose record this is may be gone from the live list; it is not
      // in `jobs`, so its runs simply never reach this loop.
      all.push({ jobId: job.id, jobName: job.name, run, seq: seq++ })
      total += 1
    }
  }

  all.sort((a, b) =>
    b.run.startedAt - a.run.startedAt
    || b.seq - a.seq
    || (a.jobId < b.jobId ? -1 : a.jobId > b.jobId ? 1 : 0))

  return {
    rows: all.slice(0, cap).map(entry => ({
      jobId: entry.jobId,
      jobName: entry.jobName,
      run: entry.run,
    })),
    total,
    cap,
    perJob: AUTOMATION_HISTORY_CAP,
  }
}
