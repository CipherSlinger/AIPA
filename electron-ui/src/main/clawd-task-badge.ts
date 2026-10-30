/**
 * clawd-task-badge.ts — the quiet "needs you" count drawn on the desktop pet.
 *
 * The count is the number of tasks in `needs_you`. It is hidden (not queued)
 * whenever the user asked the pet to be quiet: the badge preference is off, a
 * timed silence is armed, or DND is on. The last gate lives in the hit
 * renderer, which already receives `dndEnabled` with every pointer-state sync;
 * that way waking the pet restores the count without waiting for a poll.
 *
 * Updates arrive two ways:
 *   - `onTasksChanged` from the IPC broadcast closure (every successful task
 *     mutation), and
 *   - one slow poll as a safety net for changes that bypass the IPC handlers
 *     (an automation writing the store, a clock-based transition).
 *
 * The module owns the computation and the gates; the integration supplies the
 * push and the "may show" closure so this file never imports the pet factory.
 */

import { createLogger } from './utils/logger'
import { countTasksByStatus } from './tasks/task-store'

const log = createLogger('clawd-task-badge')

/** Safety-net cadence. Real changes arrive through `tasks:changed`. */
const POLL_MS = 30_000

export interface ClawdTaskBadgeOptions {
  /** Hand the count to the pet (0 hides the badge). */
  push: (count: number) => void
  /** Whether the badge may be shown at all right now (pref + silence). */
  canShow: () => boolean
}

let options: ClawdTaskBadgeOptions | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
/** Last pushed value; -1 forces the first push even when the count is 0. */
let lastPushed = -1

/** Count tasks waiting on the user. `archived` never counts. */
export function countClawdNeedsYouTasks(): number {
  try {
    return countTasksByStatus('needs_you')
  } catch (err) {
    log.warn('could not read tasks for the badge:', String(err))
    return 0
  }
}

function desiredCount(): number {
  if (!options) return 0
  try {
    if (!options.canShow()) return 0
    return countClawdNeedsYouTasks()
  } catch (err) {
    log.warn('badge gate failed:', String(err))
    return 0
  }
}

/**
 * Recompute and push only when the number the user sees would change. Safe to
 * call before the module is started (no-op), which keeps `tasks:changed`
 * wiring unconditional.
 */
export function refreshClawdTaskBadge(): void {
  if (!options) return
  const count = desiredCount()
  if (count === lastPushed) return
  lastPushed = count
  try {
    options.push(count)
  } catch (err) {
    log.warn('badge push failed:', String(err))
  }
}

export function startClawdTaskBadge(opts: ClawdTaskBadgeOptions): void {
  stopClawdTaskBadge()
  options = opts
  lastPushed = -1
  refreshClawdTaskBadge()
  pollTimer = setInterval(refreshClawdTaskBadge, POLL_MS)
  // A poll must never be the reason the process stays alive on quit.
  ;(pollTimer as { unref?: () => void }).unref?.()
}

export function stopClawdTaskBadge(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  options = null
  lastPushed = -1
}
