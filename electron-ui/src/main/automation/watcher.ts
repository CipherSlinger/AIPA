/**
 * The file-system watchers behind `{ kind: 'watch' }` automation triggers.
 *
 * A cron job asks "is it time"; a watch job asks "did it change". The scheduler
 * still owns every decision about whether a run may start (pause, rails,
 * concurrency); this module only turns file-system events into at most one fire
 * per debounce window, and keeps one `fs.watch` per enabled watch job.
 *
 * Watching a *file* is done through its parent directory rather than on the
 * file itself: an editor's usual save is write-temp-then-rename-over, which
 * `fs.watch` on the file handle misses, and on Windows a file watcher can go
 * silent after the first replacement. The parent watch therefore filters on the
 * basename. Directories are watched directly, recursively unless the trigger
 * says otherwise.
 *
 * Coalescing, not queueing: an event inside the debounce window is dropped and
 * never replayed later. A folder that receives fifty files while the assistant
 * is busy starts one run, not fifty, and a burst during a run does not become a
 * burst of runs afterwards.
 *
 * Electron-free (only `fs`, `path`, the logger and types) so
 * `.scratch/wave25-watch-trigger-harness` can pin the clock and inject a stub
 * `fs.watch` to exercise the bookkeeping without touching a real path.
 */
import * as fs from 'fs'
import * as path from 'path'
import { createLogger } from '../utils/logger'
import type { AutomationJob, AutomationWatchTrigger } from './types'

const log = createLogger('automation-watcher')

/** Quiet period when the trigger names none: long enough to coalesce a save burst. */
export const WATCH_DEBOUNCE_DEFAULT_MINUTES = 5
export const WATCH_DEBOUNCE_MIN_MINUTES = 1
export const WATCH_DEBOUNCE_MAX_MINUTES = 24 * 60

/**
 * The one place a `debounceMinutes` becomes a number.
 *
 * Absent or unusable means the default, not zero: a zero-second window would
 * fire on every write an editor makes while saving one file. A real value is
 * rounded and clamped, so neither a hand-edited file nor a renderer bug can
 * turn the watcher into a runaway loop.
 */
export function normalizeWatchDebounceMinutes(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return WATCH_DEBOUNCE_DEFAULT_MINUTES
  const minutes = Math.round(value)
  return Math.min(WATCH_DEBOUNCE_MAX_MINUTES, Math.max(WATCH_DEBOUNCE_MIN_MINUTES, minutes))
}

/** The facts one file-system event is judged against. */
export interface WatchEventFacts {
  /** The global pause suppresses watch fires, exactly like scheduled runs. */
  pausedAll: boolean
  /** A run of this job is already in flight; a second copy would queue a burst. */
  running: boolean
  /** Epoch ms of the last *fire decision* for this job, or null if never. */
  lastFiredAt: number | null
  /** The trigger's quiet window, already converted to milliseconds. */
  debounceMs: number
  now: number
}

export type WatchEventDecision =
  | 'fire'
  | 'ignore-paused'
  | 'ignore-running'
  | 'ignore-debounce'

/**
 * Decide whether one event may start a run.
 *
 * Pure and separately exported so a Node harness can pin `now` and walk every
 * branch without a watcher or a scheduler. The debounce boundary is exclusive:
 * an event exactly one window after the last fire is outside the quiet period.
 */
export function decideWatchEvent(facts: WatchEventFacts): WatchEventDecision {
  if (facts.pausedAll) return 'ignore-paused'
  if (facts.running) return 'ignore-running'
  if (facts.lastFiredAt !== null && facts.now - facts.lastFiredAt < facts.debounceMs) {
    return 'ignore-debounce'
  }
  return 'fire'
}

/**
 * What the scheduler provides to a fire.
 *
 * Accessors, not values: the pause and the in-flight set change between the
 * moment a watcher attaches and the moment an event arrives, and the decision
 * must see the current facts. `notify` lets a watcher that died mid-run tell
 * the renderer (and the menu) that the row is now missing its path.
 */
export interface WatchHandlers {
  /** Start this job now. The scheduler owns rails, records and persistence. */
  fire: (jobId: string) => void
  isRunning: (jobId: string) => boolean
  isPausedAll: () => boolean
  notify?: () => void
}

/**
 * Test seam: the production defaults are the real `fs` calls. Injecting them
 * keeps the harness deterministic on machines where `fs.watch` timing is not.
 */
export interface WatchEngineDeps {
  watch?: (target: string, options: { recursive?: boolean }) => fs.FSWatcher
  stat?: (target: string) => { isDirectory: () => boolean; isFile: () => boolean }
  now?: () => number
}

interface ActiveWatch {
  watcher: fs.FSWatcher
  /** The job's trigger path, kept to detect a path edit without re-reading the store. */
  path: string
  /** The recursive flag the watcher was attached with. */
  recursive: boolean
  /** Quiet window in ms; updated in place when only `debounceMinutes` changed. */
  debounceMs: number
  /** Epoch ms of the last fire decision, or null if nothing has fired yet. */
  lastFiredAt: number | null
  /** Basename filter when a file is watched through its parent, else null. */
  basename: string | null
  now: () => number
}

const active = new Map<string, ActiveWatch>()

/**
 * Job ids whose watcher could not be attached (missing path, EPERM, a path
 * that is neither file nor directory). Kept separate from `active` so the view
 * can say "missing" while a later sync is still free to retry.
 */
const attachFailed = new Set<string>()

/** True when the last attach attempt for this job failed. Read by `toView`. */
export function watchAttachFailed(jobId: string): boolean {
  return attachFailed.has(jobId)
}

/**
 * Re-align the attached watchers with a job list.
 *
 * One watcher per enabled watch job. Jobs that disappeared, were disabled, or
 * whose path/recursive flag changed are closed; a changed debounce only rewrites
 * the stored window, because the window is read when an event arrives rather
 * than captured at attach time. A failed attach is retried on every sync: the
 * folder may have been created since (the editor saved the parent, a drive came
 * back), and `attachFailed` exists to keep the retry from logging every time.
 */
export function syncWatchTriggers(
  jobs: readonly AutomationJob[],
  handlers: WatchHandlers,
  deps: WatchEngineDeps = {},
): void {
  const wanted = new Map<string, { trigger: AutomationWatchTrigger; recursive: boolean; debounceMs: number }>()
  for (const job of jobs) {
    if (!job.enabled) continue
    if (job.trigger.kind !== 'watch') continue
    wanted.set(job.id, {
      trigger: job.trigger,
      recursive: job.trigger.recursive !== false,
      debounceMs: normalizeWatchDebounceMinutes(job.trigger.debounceMinutes) * 60_000,
    })
  }

  for (const [jobId, entry] of [...active]) {
    const want = wanted.get(jobId)
    if (!want) {
      closeWatch(jobId, 'job removed or disabled')
      continue
    }
    if (want.trigger.path !== entry.path || want.recursive !== entry.recursive) {
      closeWatch(jobId, 'watch target changed')
      continue
    }
    entry.debounceMs = want.debounceMs
  }

  for (const [jobId, want] of wanted) {
    // Retried every sync while it fails: the path may reappear, and attaching
    // is the only way to find out. The warning is logged once per failure run.
    if (!active.has(jobId)) attachWatch(jobId, want, handlers, deps)
  }

  for (const jobId of [...attachFailed]) {
    if (!wanted.has(jobId)) attachFailed.delete(jobId)
  }
}

/**
 * Attach one watcher, or record why not.
 *
 * Nothing here may throw into the main process: a path that vanishes between
 * stat and watch, or a drive that is temporarily unavailable, is a normal
 * state for a watcher and is reported through `attachFailed` instead.
 */
function attachWatch(
  jobId: string,
  want: { trigger: AutomationWatchTrigger; recursive: boolean; debounceMs: number },
  handlers: WatchHandlers,
  deps: WatchEngineDeps,
): void {
  const target = want.trigger.path
  const stat = deps.stat ?? ((p: string) => fs.statSync(p))
  const watch = deps.watch ?? ((p: string, options: { recursive?: boolean }) => fs.watch(p, options))
  const now = deps.now ?? Date.now

  let stats: { isDirectory: () => boolean; isFile: () => boolean }
  try {
    stats = stat(target)
  } catch (err) {
    failAttach(jobId, target, err)
    return
  }

  const isDirectory = stats.isDirectory()
  if (!isDirectory && !stats.isFile()) {
    failAttach(jobId, target, new Error('path is neither a file nor a directory'))
    return
  }

  // A file is watched through its parent; see the header comment. The basename
  // filter below is what keeps a sibling write from firing this job.
  const watchTarget = isDirectory ? target : path.dirname(target)
  const basename = isDirectory ? null : path.basename(target)

  let watcher: fs.FSWatcher
  try {
    watcher = watch(watchTarget, { recursive: isDirectory ? want.recursive : false })
  } catch (err) {
    failAttach(jobId, target, err)
    return
  }

  const entry: ActiveWatch = {
    watcher,
    path: target,
    recursive: want.recursive,
    debounceMs: want.debounceMs,
    lastFiredAt: null,
    basename,
    now,
  }
  active.set(jobId, entry)
  if (attachFailed.delete(jobId)) {
    log.info(`Watching ${target} for automation ${jobId} — the path is back`)
  }

  watcher.on('change', (_event, filename) => {
    // A parent-directory watch reports every sibling. Some platforms omit the
    // name; a missed change is worse than a debounced extra run, so fire then.
    if (entry.basename !== null && filename && String(filename) !== entry.basename) return
    handleWatchEvent(jobId, handlers)
  })
  watcher.on('error', (err) => {
    // ENOENT (folder deleted), EPERM (permissions changed), a share going away:
    // all are ordinary. Close this one watcher, say why once, and let a later
    // sync retry; the main process keeps running with the row marked missing.
    log.warn(`Watcher for automation ${jobId} on ${target} failed:`, err)
    if (active.get(jobId) === entry) active.delete(jobId)
    attachFailed.add(jobId)
    try { watcher.close() } catch { /* already closed by the OS */ }
    try { handlers.notify?.() } catch (notifyErr) { log.warn('Could not notify renderer:', notifyErr) }
  })
}

function failAttach(jobId: string, target: string, err: unknown): void {
  if (attachFailed.has(jobId)) return
  log.warn(`Could not watch ${target} for automation ${jobId}:`, err)
  attachFailed.add(jobId)
}

function handleWatchEvent(jobId: string, handlers: WatchHandlers): void {
  const entry = active.get(jobId)
  if (!entry) return
  const now = entry.now()
  const decision = decideWatchEvent({
    pausedAll: handlers.isPausedAll(),
    running: handlers.isRunning(jobId),
    lastFiredAt: entry.lastFiredAt,
    debounceMs: entry.debounceMs,
    now,
  })
  if (decision !== 'fire') return
  // Stamped on the decision, not on completion: a long run must not let the
  // events it provoked start a second run the moment it ends.
  entry.lastFiredAt = now
  try {
    handlers.fire(jobId)
  } catch (err) {
    // The scheduler's `fire` is not supposed to throw; a bug there must still
    // not surface as an unhandled exception from an fs callback.
    log.warn(`Watch fire for automation ${jobId} failed:`, err)
  }
}

function closeWatch(jobId: string, reason: string): void {
  const entry = active.get(jobId)
  if (!entry) return
  active.delete(jobId)
  try { entry.watcher.close() } catch (err) { log.warn(`Could not close watcher for ${jobId}:`, err) }
  log.info(`Stopped watching ${entry.path} for automation ${jobId} — ${reason}`)
}

/** Close every watcher (scheduler shutdown and tests). */
export function stopWatchers(): void {
  for (const jobId of [...active.keys()]) closeWatch(jobId, 'scheduler stopped')
  attachFailed.clear()
}
