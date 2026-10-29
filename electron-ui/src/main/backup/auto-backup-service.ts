/**
 * The timer that turns the policy into backups.
 *
 * It never runs during startup: the first attempt is scheduled well after the
 * window has been created (the caller starts it while the renderer is still
 * loading), and the work itself is the same synchronous collector the Export
 * button already runs on demand. A launch that is quit before the first timer
 * simply backs up next time — the stamp file means that is not a duplicate, it
 * is the backup that never happened.
 *
 * Every attempt that actually did something (wrote a file, or failed trying)
 * calls `onChange`, so an open Settings panel hears about it without polling.
 */
import {
  readAutoBackupState,
  runAutoBackup,
  type AutoBackupRunResult,
  type AutoBackupState,
  type BackupBuildResult,
} from './auto-backup-writer'

export interface AutoBackupServiceOptions {
  userDataDir: string
  build: () => BackupBuildResult
  /** Called after an attempt that wrote a file or failed; never for a window skip. */
  onChange?: () => void
  /** Initial delay before the first attempt. Defaults to 20 s. */
  initialDelayMs?: number
  /** How often to ask "is it due?". Defaults to 15 min. */
  tickMs?: number
  /** Injectable clock, for the harness; defaults to Date.now. */
  now?: () => number
}

export interface AutoBackupService {
  start(): void
  stop(): void
  /** Force a backup now (the "Back up now" button), pruning included. */
  runNow(): AutoBackupRunResult
  /** One gated attempt; used by the timer and after enabling the feature. */
  tick(): AutoBackupRunResult
  getState(): AutoBackupState
}

export function createAutoBackupService(options: AutoBackupServiceOptions): AutoBackupService {
  const now = options.now ?? (() => Date.now())
  const initialDelayMs = options.initialDelayMs ?? 20_000
  const tickMs = options.tickMs ?? 15 * 60_000
  let firstTimer: ReturnType<typeof setTimeout> | null = null
  let intervalTimer: ReturnType<typeof setInterval> | null = null

  const notify = (result: AutoBackupRunResult) => {
    if (result.skipped) return
    try { options.onChange?.() } catch { /* a renderer listener must not break the timer */ }
  }

  const tick = (): AutoBackupRunResult => {
    const result = runAutoBackup({
      userDataDir: options.userDataDir,
      build: options.build,
      now: now(),
      force: false,
    })
    notify(result)
    return result
  }

  return {
    start() {
      if (firstTimer || intervalTimer) return
      firstTimer = setTimeout(() => {
        firstTimer = null
        tick()
      }, initialDelayMs)
      // unref: an idle app with no window must still be able to quit.
      ;(firstTimer as unknown as { unref?: () => void }).unref?.()
      intervalTimer = setInterval(tick, tickMs)
      ;(intervalTimer as unknown as { unref?: () => void }).unref?.()
    },
    stop() {
      if (firstTimer) clearTimeout(firstTimer)
      if (intervalTimer) clearInterval(intervalTimer)
      firstTimer = null
      intervalTimer = null
    },
    runNow() {
      const result = runAutoBackup({
        userDataDir: options.userDataDir,
        build: options.build,
        now: now(),
        force: true,
      })
      notify(result)
      return result
    },
    tick,
    getState() {
      return readAutoBackupState(options.userDataDir)
    },
  }
}
