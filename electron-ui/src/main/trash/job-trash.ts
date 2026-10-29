/**
 * A holding area for deleted scheduled jobs.
 *
 * Workflows, skills and conversations all stopped being destroyed the moment
 * the user deleted them; a scheduled job was the last one that still vanished
 * on the spot, together with its run history. A job is a record rather than a
 * file, so there is nothing to move: the whole record goes into a manifest under
 * userData and is kept for the same window as everything else.
 *
 * The manifest is the only copy while the job is deleted. That is why restoring
 * refuses instead of improvising when it cannot put the record back as it was:
 * a job limit it would overflow, an id that has since been taken.
 *
 * Restoring does not rewind time. A schedule is a promise about the future, so
 * an enabled job is re-armed from the moment of the restore — keeping the old
 * `nextRunAt` would either fire at once (it is long past) or quietly skip a
 * week. A retry that was waiting when the job was deleted is dropped for the
 * same reason: it belonged to an occurrence nobody is waiting for any more.
 */
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { createLogger } from '../utils/logger'
import { normalizeJob } from '../automation/job-store'
import { nextRunAfter } from '../automation/next-run'
import { appendRunRecord } from '../automation/run-history'
import { MAX_AUTOMATION_JOBS } from '../automation/types'
import type { AutomationJob } from '../automation/types'

const log = createLogger('job-trash')

/**
 * How long a deleted job can be restored. Exported so the UI states the same
 * number instead of inventing one; `automation:trash:list` also sends it to the
 * renderer for the section's copy.
 */
export const JOB_TRASH_RETENTION_DAYS = 30
export const JOB_TRASH_RETENTION_MS = JOB_TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000

const MANIFEST_VERSION = 1

export interface TrashedJobEntry {
  /** The trash row's own id; the job's id stays inside `job`. */
  id: string
  /** The whole job record, exactly as it will be put back (schedule aside). */
  job: AutomationJob
  deletedAt: number
}

export interface TrashedJobListEntry extends TrashedJobEntry {
  /** When the entry leaves for good (epoch ms). */
  purgeAt: number
}

export type JobTrashErrorCode =
  | 'not_found'
  /** The record could not be read as a job at all; nothing was moved. */
  | 'move_failed'
  | 'write_failed'
  /** Restoring would overflow the store's own cap. */
  | 'job_limit'
  /** A live job already uses this id; a restore never overwrites or renumbers. */
  | 'id_taken'

export type JobTrashFailure = { ok: false; code: JobTrashErrorCode; error: string }
export type JobTrashSuccess<T> = { ok: true } & T

function trashRoot(): string {
  return path.join(app.getPath('userData'), 'trash')
}

function manifestPath(): string {
  return path.join(trashRoot(), 'jobs.json')
}

/**
 * One row survives on its own: a hand-edited manifest must not hide every other
 * trashed job behind one unreadable line. The job itself is validated by the
 * same whitelist the live store uses, so a tampered row cannot smuggle in a
 * field the scheduler never wrote.
 */
function normalizeEntry(raw: unknown): TrashedJobEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const entry = raw as Record<string, unknown>
  const id = typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : ''
  const deletedAt = typeof entry.deletedAt === 'number' && Number.isFinite(entry.deletedAt)
    ? entry.deletedAt
    : null
  const job = normalizeJob(entry.job)
  if (!id || deletedAt === null || !job) return null
  return { id, job, deletedAt }
}

function readManifest(): TrashedJobEntry[] {
  const file = manifestPath()
  if (!fs.existsSync(file)) return []
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as unknown
    // Accept both the wrapped shape and a bare array written by an older build
    // or by hand; either way each row is validated individually.
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).entries)
        ? (parsed as Record<string, unknown>).entries as unknown[]
        : []
    const entries = list
      .map(normalizeEntry)
      .filter((entry): entry is TrashedJobEntry => entry !== null)
    if (entries.length !== list.length) {
      log.warn(`job trash: dropped ${list.length - entries.length} malformed manifest row(s)`)
    }
    return entries
  } catch (err) {
    // Keep the corrupt file on disk for inspection; the next save rewrites it.
    log.warn('Could not read job trash manifest:', err)
    return []
  }
}

function writeManifest(entries: TrashedJobEntry[]): void {
  const file = manifestPath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({
    version: MANIFEST_VERSION,
    entries,
  }, null, 2), 'utf-8')
  fs.renameSync(tmp, file)
}

function uniqueId(entries: TrashedJobEntry[], now: number): string {
  const taken = new Set(entries.map(entry => entry.id))
  let id = ''
  do {
    id = `trash-job-${now}-${Math.random().toString(36).slice(2, 8)}`
  } while (taken.has(id))
  return id
}

function failure(code: JobTrashErrorCode, error: string): JobTrashFailure {
  return { ok: false, code, error }
}

/**
 * The record as it should leave this process.
 *
 * A job deleted while it was running still carries `lastStatus: 'running'`,
 * which belongs to a run that will never finish (the delete aborts it, and its
 * completion has nothing left to write back into). The launch repair turns that
 * marker into the same named failure a restart would, so a restored job does not
 * claim forever that it is in the middle of something. The in-flight attempt is
 * recovered from `recentRuns` for the same reason the launch repair does it: the
 * failure streak and the history should not lose an attempt that really started.
 *
 * Everything is copied and re-validated through the store's whitelist: the
 * manifest must not be able to hold a field the scheduler would never persist,
 * and the running object keeps mutating after the delete.
 */
function snapshotForTrash(job: AutomationJob): AutomationJob | null {
  const copy: AutomationJob = {
    ...job,
    history: [...job.history],
    recentRuns: [...job.recentRuns],
    ...(job.pendingRetry ? { pendingRetry: { ...job.pendingRetry } } : {}),
  }
  if (copy.lastStatus === 'running') {
    copy.lastStatus = 'error'
    copy.lastError = 'interrupted'
    // The interrupted run never wrote a usage figure; an older run's would be
    // read as this failed run's spend.
    copy.lastUsage = undefined
    const interruptedAt = copy.recentRuns[copy.recentRuns.length - 1]
    const newest = copy.history[copy.history.length - 1]
    if (interruptedAt !== undefined && interruptedAt !== newest?.startedAt) {
      copy.history = appendRunRecord(copy.history, {
        startedAt: interruptedAt,
        status: 'error',
        durationMs: null,
        sessionId: null,
        error: 'interrupted',
        late: false,
      })
    }
  }
  // `normalizeJob` also strips `pendingRetry` when the job is disabled or no
  // longer opted in — the same rule the store applies on load.
  return normalizeJob(copy)
}

/**
 * Put a job record into the trash and return the row it became.
 *
 * The caller removes the job from the live list only after this succeeds: a
 * record that could not be written is still the user's job, and deleting it
 * anyway would be exactly the irreversible delete this module exists to
 * prevent.
 */
export function moveJobToTrash(
  job: AutomationJob,
  now: number = Date.now(),
): JobTrashSuccess<{ entry: TrashedJobEntry }> | JobTrashFailure {
  const snapshot = snapshotForTrash(job)
  if (!snapshot) return failure('move_failed', 'The job record could not be read')

  const entries = readManifest()
  const entry: TrashedJobEntry = {
    id: uniqueId(entries, now),
    job: snapshot,
    deletedAt: now,
  }
  try {
    writeManifest([...entries, entry])
  } catch (err) {
    log.warn('Could not write job trash manifest:', err)
    return failure('write_failed', 'The job could not be recorded in the trash; it was left in place')
  }

  return { ok: true, entry }
}

/**
 * The trash contents, newest first, with the instant each leaves for good.
 * Each row's purge instant comes from its own `deletedAt`, not from "now".
 */
export function listTrashedJobs(_now: number = Date.now()): JobTrashSuccess<{
  entries: TrashedJobListEntry[]
  retentionDays: number
}> {
  const entries = readManifest()
    .map(entry => ({
      ...entry,
      purgeAt: entry.deletedAt + JOB_TRASH_RETENTION_MS,
    }))
    .sort((a, b) => b.deletedAt - a.deletedAt)
  return { ok: true, entries, retentionDays: JOB_TRASH_RETENTION_DAYS }
}

export interface RestoreJobOptions {
  /** Ids already used by live jobs. The caller owns the list. */
  existingIds: readonly string[]
  /** The store's own cap; defaults to the shared constant for direct callers. */
  maxJobs?: number
  now?: number
}

/**
 * Put a trashed job back into the live list.
 *
 * The manifest is rewritten before the caller inserts the job: if the write
 * fails, nothing has changed and the job is still safely in the trash, whereas
 * inserting first and failing to write would leave a live copy and a stale
 * trash row pointing at the same id.
 *
 * Restoring never overwrites and never renumbers. A live job that already uses
 * the id wins — it may be a job the user made after deleting this one — and the
 * trashed row stays where it is, so the user can decide which to keep.
 */
export function restoreTrashedJob(
  id: string,
  options: RestoreJobOptions,
): JobTrashSuccess<{ entry: TrashedJobEntry }> | JobTrashFailure {
  const now = options.now ?? Date.now()
  const entries = readManifest()
  const entry = entries.find(item => item.id === id)
  if (!entry) return failure('not_found', 'This item is no longer in Recently deleted')

  if (options.existingIds.includes(entry.job.id)) {
    return failure('id_taken', `A job with the id ${entry.job.id} already exists`)
  }
  // The same cap a create is checked against, not a number of this module's
  // own: two copies could refuse at 50 while create still accepts at 50.
  const maxJobs = options.maxJobs ?? MAX_AUTOMATION_JOBS
  if (options.existingIds.length >= maxJobs) {
    return failure('job_limit', `The list already holds ${maxJobs} jobs`)
  }

  const restored: AutomationJob = {
    ...entry.job,
    // From now, never from the delete: an old `nextRunAt` is either long past
    // (it would fire the moment it is put back) or would silently skip the
    // occurrences that came due while the job was deleted.
    nextRunAt: entry.job.enabled ? nextRunAfter(entry.job.trigger, now) : null,
  }
  // A retry waited for an occurrence that is not waiting any more. Removed
  // rather than set to undefined, so a restored record is byte-identical to a
  // job the scheduler made without one.
  delete restored.pendingRetry

  try {
    writeManifest(entries.filter(item => item.id !== id))
  } catch (err) {
    log.warn('Could not write job trash manifest before restore:', err)
    return failure('write_failed', 'The job could not be taken out of the trash; nothing was restored')
  }

  return { ok: true, entry: { ...entry, job: restored } }
}

/**
 * Drop entries whose retention window has passed. There is no payload to
 * delete — the record lived in this manifest — so one write settles all of them.
 */
export function purgeTrashedJobs(now: number = Date.now()): JobTrashSuccess<{ removed: number }> {
  const entries = readManifest()
  // Exactly at the window is not yet "older than" it, so it stays for one more
  // pass; only an entry past the window leaves.
  const kept = entries.filter(entry => entry.deletedAt + JOB_TRASH_RETENTION_MS >= now)
  const removed = entries.length - kept.length
  if (removed > 0) {
    try {
      writeManifest(kept)
    } catch (err) {
      log.warn('Could not write job trash manifest after purge:', err)
      // Nothing was actually removed: reporting a count against a manifest that
      // still holds those rows would claim a cleanup that did not happen.
      return { ok: true, removed: 0 }
    }
  }
  return { ok: true, removed }
}

/** Remove one entry for good. */
export function removeTrashedJob(id: string): JobTrashSuccess<{ entry: TrashedJobEntry }> | JobTrashFailure {
  const entries = readManifest()
  const entry = entries.find(item => item.id === id)
  if (!entry) return failure('not_found', 'This item is no longer in Recently deleted')

  try {
    writeManifest(entries.filter(item => item.id !== id))
  } catch (err) {
    log.warn('Could not write job trash manifest after removal:', err)
    return failure('write_failed', 'The item was not removed from Recently deleted')
  }

  return { ok: true, entry }
}
