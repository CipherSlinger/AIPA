/**
 * clawd-morning-brief.ts — one opt-in task brief per local day.
 *
 * A few seconds after launch, if the preference is on and anything on the
 * task board is neither done nor archived, the brief opens beside the pet.
 * The "show" is recorded as a local date string in the pet's own preferences,
 * so a second launch on the same day stays quiet even though it is a different
 * process.
 *
 * Every skip is final for this launch: DND, a timed silence, a hidden pet, a
 * brief that is already open, or nothing to show. None of them reschedule
 * themselves — a card that waited for DND to end would arrive hours after the
 * "morning" it announced.
 */

import { createLogger } from './utils/logger'
import { listTasks } from './tasks/task-store'

const log = createLogger('clawd-morning-brief')

/** "A few seconds after launch": long enough for the pet windows to settle. */
const INITIAL_DELAY_MS = 5_000

export interface ClawdMorningBriefOptions {
  enabled: () => boolean
  /** DND, timed silence, or a hidden pet — the brief must not pop up. */
  suppressed: () => boolean
  isBriefOpen: () => boolean
  /** Local day ("YYYY-MM-DD") the brief was last shown; "" = never. */
  getShownDate: () => string
  setShownDate: (day: string) => void
  /** Open the brief beside the pet; true only when a window was created. */
  open: () => boolean
}

let options: ClawdMorningBriefOptions | null = null
let timer: ReturnType<typeof setTimeout> | null = null
/** One attempt per process, whatever the outcome. */
let attempted = false

/** Local calendar day for an epoch-ms instant, as YYYY-MM-DD. */
export function localDay(now: number = Date.now()): string {
  const date = new Date(now)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Whether any task is neither done nor archived. */
function hasUnfinishedTasks(): boolean {
  try {
    for (const task of listTasks()) {
      if (task.status !== 'done' && task.status !== 'archived') return true
    }
    return false
  } catch (err) {
    log.warn('could not read tasks for the morning brief:', String(err))
    return false
  }
}

function clearTimer(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

function attempt(): void {
  const opts = options
  if (!opts) return
  attempted = true
  try {
    if (!opts.enabled()) return
    if (opts.suppressed()) return
    if (opts.isBriefOpen()) return
    const today = localDay()
    if (opts.getShownDate() === today) return
    if (!hasUnfinishedTasks()) return
    if (!opts.open()) return
    // Record only after a window really appeared: a failed open is a skipped
    // day, not a day the user saw a brief.
    opts.setShownDate(today)
    log.info('morning brief shown for', today)
  } catch (err) {
    log.warn('morning brief attempt failed:', String(err))
  }
}

function schedule(): void {
  clearTimer()
  timer = setTimeout(() => {
    timer = null
    attempt()
  }, INITIAL_DELAY_MS)
  ;(timer as { unref?: () => void }).unref?.()
}

export function startClawdMorningBrief(opts: ClawdMorningBriefOptions): void {
  stopClawdMorningBrief()
  options = opts
  attempted = false
  try {
    if (!opts.enabled()) return
  } catch {
    return
  }
  schedule()
}

/**
 * React to a live preference change. Turning it on arms the same one-shot,
 * but only if this launch has not tried yet; turning it off cancels a pending
 * attempt. A shown day is never shown again by either path.
 */
export function refreshClawdMorningBrief(): void {
  if (!options) return
  let enabled = false
  try {
    enabled = options.enabled()
  } catch {
    enabled = false
  }
  if (!enabled) {
    clearTimer()
    return
  }
  if (attempted || timer) return
  schedule()
}

export function stopClawdMorningBrief(): void {
  clearTimer()
  options = null
  attempted = false
}
