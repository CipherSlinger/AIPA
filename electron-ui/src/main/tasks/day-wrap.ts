/**
 * day-wrap.ts — the pet's one-a-day look back over the day that is ending.
 *
 * Every other task surface is about now or about the week: the due reminder
 * names what has arrived, the board shows what is open, the weekly review
 * looks back over seven days. Nothing closes the working day. At 18:30 local,
 * this module raises exactly one card: what got finished today, what is still
 * on the desk, and what is due tomorrow. The card does not just count
 * tomorrow's work: it names the first two of those tasks, so the evening ends
 * with something the user can start on in the morning. It is off by default
 * (`petEveningWrap`) and it never writes a task — it only reads the store and
 * speaks through the attention queue.
 *
 * When it checks
 *   - once at start (the main process calls `startDayWrap` after the task store
 *     exists and attention is initialised);
 *   - on a one-shot timer aimed at the next 18:30 local, not "launch time plus
 *     24 hours";
 *   - every minute while the app runs, so a laptop that slept through 18:30,
 *     a clock/timezone jump or a late-evening wake is noticed promptly;
 *   - immediately after system resume (`powerMonitor` `resume`), because a
 *     machine asleep at 18:30 must still wrap when it wakes the same evening;
 *   - on a "Later" deadline the user asked for, without waiting for the next
 *     heartbeat to notice it.
 * All timers are unref'd and cleared by `stopDayWrap` on quit; every check also
 * refuses to run once the app is quitting.
 *
 * Tomorrow's work, by name
 *   The third sentence says how many tasks are due tomorrow; the rows below
 *   it name the first two of them, sorted by title so a repaint cannot
 *   reshuffle them. Naming them is the difference between a count and
 *   something the user can pick up in the morning. The count stays whole — it
 *   covers every open task due tomorrow, not just the two that are named —
 *   and titles are read exactly as the task stores them.
 *
 * What the day is
 *   Today's window is `[local midnight, local midnight tomorrow)`, built with
 *   `new Date(y, m-1, d)` and `new Date(y, m-1, d + 1)` — never by adding
 *   86_400_000 ms, which drifts across DST. A day is a bare `YYYY-MM-DD`, so
 *   the next morning the window has already moved on: a wrap that was missed
 *   on Tuesday evening is not spoken on Wednesday morning, while a wake at
 *   23:00 on Tuesday still wraps Tuesday.
 *
 * When it may speak
 *   From 18:30 local until local midnight. Before 18:30 the day is not over
 *   yet, so the check is silent and cheap. After midnight a new day starts
 *   afresh with its own 18:30; yesterday is never announced.
 *
 * Once per day, honestly
 *   The state file (`userData/day-wrap.json`, tmp + rename) remembers the last
 *   local day that was actually wrapped. The day is written ONLY when
 *   `raiseAttention` says a surface owns the raise. A card suppressed by DND,
 *   timed silence, focus or the pet's alert switch writes nothing, so the next
 *   tick — a minute later, or after the machine wakes — raises the same wrap.
 *
 * Nothing to say
 *   If nothing was finished today and nothing is open now, there is no card:
 *   a clear day and a clear desk do not deserve a call. That verdict is not
 *   remembered — the file only ever records a wrap that was actually spoken —
 *   so a task captured later the same evening is still counted on the next
 *   tick.
 *
 * "Later"
 *   The card's secondary action asks this module to raise the same wrap two
 *   hours later. That is a deferral of the announcement, not a second day: the
 *   day is still the day until local midnight, so a promise made at 18:30 for
 *   20:30 is still meaningful at 21:00, unlike the due reminder's morning card.
 *   The deadline is stored in the same file, so closing the app for an hour
 *   does not lose the wait. While it is live the check is silent and does not
 *   read the store. When it comes due the card is re-raise-eligible even though
 *   `lastWrapDay` already names today — the user explicitly asked to see it
 *   again — and a successful announce clears the deadline. The day record is
 *   kept when it already named today; a preview deferred into the evening
 *   instead spends that evening's card, so it does not speak twice. A deadline
 *   that crossed midnight is dropped rather than spoken late: yesterday's wrap
 *   is never announced. A clock that steps backwards can only lengthen the
 *   wait, because the deadline is an absolute instant.
 *
 * This module never changes a task: no status writes, no due-date edits, no
 * moves. It only reads the store and talks to the attention queue.
 */
import { app, powerMonitor } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { raiseAttention } from '../clawd-attention'
import { createLogger } from '../utils/logger'
import { readTaskStore, type TaskRecord } from './task-store'

const log = createLogger('day-wrap')

/**
 * How many finished tasks one wrap may name. The counts above the rows still
 * carry the whole day; three titles fit a bubble.
 */
export const DAY_WRAP_ROWS_SHOWN = 3

/**
 * How many of tomorrow's open tasks one wrap may name. The sentence above the
 * rows still counts all of them; these rows answer "which ones?" for the next
 * two things the user will have to do.
 */
export const DAY_WRAP_UPCOMING_SHOWN = 2

/** The evening hour at which the day is treated as over. */
export const WRAP_HOUR = 18
export const WRAP_MINUTE = 30

/**
 * The card's secondary action ("Later") puts the same wrap back two hours from
 * now. The day's record is not spent again — the 18:30 announce already wrote
 * it — so this is only a deferral of the announcement, and only the deadline is
 * stored, so the wait survives a restart.
 */
export const DAY_WRAP_SNOOZE_MS = 2 * 60 * 60 * 1000

/** A safety heartbeat, not the announcement timer: catches a missed 18:30,
 *  a system clock jump and a resume the power hook did not see. */
const TICK_MS = 60_000

const STATE_VERSION = 1
const STATE_FILE = 'day-wrap.json'
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** One finished task the card may name. */
export interface DayWrapRow {
  /** Task title, as stored. */
  title: string
  /** Today's completion occurrences of this task (>= 1). */
  count: number
}

/** The shape handed to the attention queue's day-wrap case. */
export interface DayWrapAggregate {
  /** Today, local `YYYY-MM-DD`. */
  day: string
  /** Completion events (occurrences) recorded today. */
  finished: number
  /** Distinct tasks with at least one completion today. */
  finishedTasks: number
  /** Up to DAY_WRAP_ROWS_SHOWN distinct finished tasks, newest completion first. */
  rows: DayWrapRow[]
  /** finishedTasks - rows.length (>= 0). */
  more: number
  /** Tasks still open right now (status not 'done' and not 'archived'). */
  open: number
  /** Of those open tasks, how many have a dueOn earlier than today. */
  overdue: number
  /** Of those open tasks, how many have a dueOn of tomorrow. */
  dueTomorrow: number
  /** Up to DAY_WRAP_UPCOMING_SHOWN open tasks due tomorrow, by title. */
  tomorrowRows: string[]
}

interface CalendarDay {
  year: number
  month: number
  day: number
}

// ── Calendar helpers (local days, never instants on disk) ─────────────────

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

function parseDay(day: string): CalendarDay {
  const match = DAY_RE.exec(day)
  if (!match) throw new RangeError(`Not a calendar day: ${day}`)
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

function formatDay(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** `YYYY-MM-DD` in the machine's local calendar. */
function localDayKey(nowMs: number): string {
  return formatDay(new Date(nowMs))
}

/** Today's local midnight, tomorrow's local midnight, and today's 18:30. */
function dayWindow(nowMs: number): {
  day: string
  tomorrow: string
  startMs: number
  endMs: number
  openAtMs: number
} {
  const day = localDayKey(nowMs)
  const { year, month, day: dateOfMonth } = parseDay(day)
  return {
    day,
    tomorrow: formatDay(new Date(year, month - 1, dateOfMonth + 1)),
    startMs: new Date(year, month - 1, dateOfMonth).getTime(),
    endMs: new Date(year, month - 1, dateOfMonth + 1).getTime(),
    openAtMs: new Date(year, month - 1, dateOfMonth, WRAP_HOUR, WRAP_MINUTE, 0, 0).getTime(),
  }
}

// ── Aggregation ───────────────────────────────────────────────────────────

/**
 * The day as the evening card tells it: the completion occurrences and
 * distinct tasks finished today, the first few titles, the first couple of
 * tomorrow's open tasks by title, and the desk as it stands at `nowMs` (a task
 * finished today and still open counts as open too, because the desk is read
 * as it is now).
 *
 * Never throws on an odd record: a task without a history array, an event
 * without a finite instant and a malformed due day are skipped, not fatal.
 */
export function collectDayWrap(tasks: readonly TaskRecord[], nowMs: number): DayWrapAggregate {
  const { day, tomorrow, startMs, endMs } = dayWindow(nowMs)

  let finished = 0
  let open = 0
  let overdue = 0
  let dueTomorrow = 0
  const completed: Array<{ title: string; latestAt: number; count: number }> = []
  const upcoming: string[] = []

  for (const task of tasks) {
    const history = Array.isArray(task.history) ? task.history : []
    let latestAt = -1
    let count = 0

    for (const event of history) {
      if (!event || event.kind !== 'completed') continue
      if (typeof event.at !== 'number' || !Number.isFinite(event.at)) continue
      if (event.at >= startMs && event.at < endMs) {
        finished += 1
        count += 1
        if (event.at > latestAt) latestAt = event.at
      }
    }

    if (count > 0) completed.push({ title: task.title, latestAt, count })

    if (task.status === 'done' || task.status === 'archived') continue
    open += 1
    // A due day is a stored `YYYY-MM-DD`. A malformed one cannot be compared
    // or counted, so the task stays open without being overdue or due
    // tomorrow.
    if (typeof task.dueOn === 'string' && DAY_RE.test(task.dueOn)) {
      if (task.dueOn < day) overdue += 1
      else if (task.dueOn === tomorrow) {
        dueTomorrow += 1
        upcoming.push(task.title)
      }
    }
  }

  // Newest completion first; ties fall back to the title so a repaint never
  // reshuffles the rows. `completed` is already per task — the latest
  // completion is the only one kept — so a repeated task is named once.
  const rows: DayWrapRow[] = completed
    .sort((a, b) => (b.latestAt - a.latestAt) || a.title.localeCompare(b.title))
    .slice(0, DAY_WRAP_ROWS_SHOWN)
    .map(row => ({ title: row.title, count: row.count }))

  // Tomorrow's first two tasks, by title, so a repaint never reshuffles them.
  // Titles are kept exactly as stored — the card names the task, it does not
  // tidy it. The count above them still covers every task due tomorrow.
  const tomorrowRows = upcoming
    .sort((a, b) => a.localeCompare(b))
    .slice(0, DAY_WRAP_UPCOMING_SHOWN)

  return {
    day,
    finished,
    finishedTasks: completed.length,
    rows,
    more: Math.max(0, completed.length - rows.length),
    open,
    overdue,
    dueTomorrow,
    tomorrowRows,
  }
}

// ── The small main-owned state file ───────────────────────────────────────

interface DayWrapState {
  version: number
  /** Local day of the last evening a wrap was actually spoken for. */
  lastWrapDay?: string
  /** Diagnostics: the wall-clock ms of the last raise. */
  lastWrapAt?: number
  /**
   * Wall-clock ms of a pending "Later". Stored so the wait outlives the app: the
   * evening it speaks for is still the same evening until local midnight, so a
   * promise made at 18:30 for 20:30 is still meaningful at 21:00 — but a
   * deadline that crossed midnight is dropped, because yesterday's wrap is
   * never spoken late.
   */
  snoozeUntil?: number
}

function defaultStatePath(): string {
  return path.join(app.getPath('userData'), STATE_FILE)
}

function isDay(value: unknown): value is string {
  return typeof value === 'string' && DAY_RE.test(value)
}

/** A missing or corrupt file is an empty memory, never a reason to stop. */
function readState(file: string): DayWrapState {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>
    return {
      version: STATE_VERSION,
      ...(isDay(parsed?.lastWrapDay) ? { lastWrapDay: parsed.lastWrapDay } : {}),
      ...(typeof parsed?.lastWrapAt === 'number' && Number.isFinite(parsed.lastWrapAt)
        ? { lastWrapAt: parsed.lastWrapAt }
        : {}),
      // A corrupt or nonsensical deadline is no wait at all, never a reason to
      // stop reading the rest of the memory.
      ...(typeof parsed?.snoozeUntil === 'number' && Number.isFinite(parsed.snoozeUntil) && parsed.snoozeUntil > 0
        ? { snoozeUntil: parsed.snoozeUntil }
        : {}),
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      log.warn(`Could not read ${path.basename(file)}; starting with an empty wrap memory:`, err)
    }
    return { version: STATE_VERSION }
  }
}

/** Same tmp + rename discipline as the task store: a crash cannot leave half a file. */
function writeState(file: string, state: DayWrapState): boolean {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf-8')
    fs.renameSync(tmp, file)
    return true
  } catch (err) {
    log.warn(`Could not write ${path.basename(file)}:`, err)
    return false
  }
}

/**
 * Write the memory back without a pending "Later", carrying the day record over
 * exactly as it stands. Used when a wait is honoured or when the day it was made
 * for has moved on.
 */
function forgetSnooze(file: string, state: DayWrapState): boolean {
  return writeState(file, {
    version: STATE_VERSION,
    ...(state.lastWrapDay ? { lastWrapDay: state.lastWrapDay } : {}),
    ...(state.lastWrapAt !== undefined ? { lastWrapAt: state.lastWrapAt } : {}),
  })
}

// ── One check ─────────────────────────────────────────────────────────────

export type DayWrapStatus =
  | 'quitting' | 'disabled' | 'before-due' | 'already-wrapped'
  | 'snoozed' | 'nothing-to-say' | 'suppressed' | 'announced' | 'error'

export interface DayWrapResult {
  status: DayWrapStatus
  /** The day that would be (or was) wrapped, `YYYY-MM-DD`; '' when it could not run. */
  day: string
  aggregate?: DayWrapAggregate
  persisted?: boolean
}

export interface DayWrapOptions {
  /** Clock injection for the scheduler and a fake-clock harness; defaults to `Date.now`. */
  now?: () => number
  /** Override for harnesses; the app uses `userData/day-wrap.json`. */
  stateFile?: string
  /** True while the app is quitting: never raise a card. */
  getQuitting?: () => boolean
  /** The user's `petEveningWrap` preference; default false. */
  getEnabled?: () => boolean
}

/**
 * Evaluate one moment. Exported so the timer, the resume listener and a
 * harness all go through exactly the same rules. Never throws: a store that
 * cannot be read is a logged warning and an `'error'` result.
 */
export function checkDayWrap(nowMs: number, options: DayWrapOptions = {}): DayWrapResult {
  if (options.getQuitting?.()) return { status: 'quitting', day: '' }

  // Off by default: the preference is the only thing that turns the card on,
  // and a disabled feature must not even read the store.
  const enabled = typeof options.getEnabled === 'function' ? options.getEnabled() : false
  const window = dayWindow(nowMs)
  if (!enabled) return { status: 'disabled', day: window.day }

  // The state file is read before the store and before the 18:30 gate: a
  // deferral is a promise the user asked for, so it outranks both the evening
  // hour (a preview deferred in the afternoon comes back in the afternoon) and
  // the once-a-day record below.
  const file = options.stateFile ?? defaultStatePath()
  const state = readState(file)
  let snoozeReady = false
  if (state.snoozeUntil !== undefined) {
    if (nowMs < state.snoozeUntil) {
      // The wait is still on. This check runs every minute; there is no reason
      // to rescan the task store for a card that is deliberately not due yet.
      return { status: 'snoozed', day: window.day }
    }
    if (state.lastWrapDay !== undefined && state.lastWrapDay !== window.day) {
      // The promised moment is past and the local day has moved on — the app was
      // closed overnight. Yesterday's wrap is never spoken late, so forget the
      // wait and let today's normal rules run.
      forgetSnooze(file, state)
      state.snoozeUntil = undefined
    } else {
      // Same evening (or a preview that never spent the day): the explicit wait
      // is the permission to speak again, even though `lastWrapDay` already
      // names today. Lateness measured in minutes is not staleness — the card
      // speaks for a day that ends at local midnight.
      snoozeReady = true
    }
  }

  // The 18:30 gate is skipped for a card the user already asked to see again.
  if (!snoozeReady && nowMs < window.openAtMs) return { status: 'before-due', day: window.day }

  // The state file is consulted before the store. This check runs every minute
  // all evening; after the wrap has been spoken there is no reason to rescan
  // every task's history just to discover that again.
  if (!snoozeReady && state.lastWrapDay === window.day) {
    return { status: 'already-wrapped', day: window.day }
  }

  let tasks: TaskRecord[]
  try {
    tasks = readTaskStore().tasks
  } catch (err) {
    log.warn('Could not read the task store for the evening wrap:', err)
    return { status: 'error', day: '' }
  }

  const aggregate = collectDayWrap(tasks, nowMs)
  if (aggregate.finished === 0 && aggregate.open === 0) {
    return { status: 'nothing-to-say', day: window.day, aggregate }
  }

  const delivered = raiseAttention({ kind: 'day-wrap', wrap: aggregate })
  if (!delivered) {
    // DND, timed silence, the pet's alert switch with no OS fallback, or the
    // user looking at AIPA right now. Nothing was announced, so the day is not
    // marked and a pending wait is not cleared: the next check retries both.
    return { status: 'suppressed', day: window.day, aggregate }
  }

  // A due wait is over once the card is actually spoken. A wait made for an
  // already-spoken day keeps that day; a deferred preview stays a preview — its
  // afternoon card must not spend the evening's own — unless the check lands at
  // or after 18:30, where the card *is* the evening's card and marking the day
  // stops the next minute's tick from saying the same thing twice. An ordinary
  // announce had no wait, so it marks the day now.
  let nextDay: string | undefined
  if (!snoozeReady) nextDay = window.day
  else if (state.lastWrapDay !== undefined) nextDay = state.lastWrapDay
  else if (nowMs >= window.openAtMs) nextDay = window.day
  else nextDay = undefined
  const persisted = writeState(file, {
    version: STATE_VERSION,
    ...(nextDay ? { lastWrapDay: nextDay } : {}),
    lastWrapAt: nowMs,
  })
  return { status: 'announced', day: window.day, aggregate, persisted }
}

// ── On demand ─────────────────────────────────────────────────────────────

/**
 * Raise the same evening card right now, on the user's explicit request.
 * Ignores the 18:30 gate and the `petEveningWrap` preference, and never writes
 * the day-wrap state file: a preview the user asked for must not spend the
 * evening's own card. Returns the aggregate that was raised, or null when the
 * store could not be read. Silence rules inside `raiseAttention` (DND, timed
 * silence, focus, the pet's alert switch) still apply.
 *
 * A day with nothing finished and nothing open is still the aggregate and not
 * null, but no card is raised — there is nothing to say. Null is reserved for
 * "the store could not be read", so the caller can tell a quiet day apart from
 * a failure.
 */
export function raiseDayWrapNow(nowMs?: number): DayWrapAggregate | null {
  const at = typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : Date.now()

  let tasks: TaskRecord[]
  try {
    tasks = readTaskStore().tasks
  } catch (err) {
    log.warn('Could not read the task store for an on-demand evening wrap:', err)
    return null
  }

  const aggregate = collectDayWrap(tasks, at)
  if (aggregate.finished === 0 && aggregate.open === 0) return aggregate

  // Nothing is persisted either way, so a suppressed preview leaves no trace
  // and the evening's scheduled wrap still speaks once 18:30 arrives.
  const delivered = raiseAttention({ kind: 'day-wrap', wrap: aggregate })
  if (delivered) log.info(`Evening wrap raised on request for ${aggregate.day}`)
  return aggregate
}

// ── Scheduler ─────────────────────────────────────────────────────────────

export interface DayWrapStatusReport {
  running: boolean
  /** Live timers: the evening check, the safety heartbeat and any pending "Later". */
  timers: number
  /** True when every live timer is unref'd (it cannot keep the app alive). */
  unrefed: boolean
}

let running = false
let tickTimer: NodeJS.Timeout | null = null
let wrapTimer: NodeJS.Timeout | null = null
let resumeHandler: (() => void) | null = null
let readNow: () => number = Date.now
let stateFile: string | undefined
let getQuitting: () => boolean = () => false
let getEnabled: () => boolean = () => false

/**
 * At most one "Later" is pending. A second click replaces this deadline; the
 * check that actually speaks the card clears the stored one. Unref'd like the
 * scheduler's own timers, so a wait can never keep the app alive.
 */
let snoozeTimer: NodeJS.Timeout | null = null
let snoozeDueAt = 0
/** Diagnostics: how many waits were picked back up from the state file. */
let snoozeRestored = 0

function statePath(): string {
  return stateFile ?? defaultStatePath()
}

/** Cancel the timer only; the stored deadline is deliberately left alone. */
function cancelSnooze(): void {
  if (snoozeTimer) {
    clearTimeout(snoozeTimer)
    snoozeTimer = null
  }
  snoozeDueAt = 0
}

/**
 * Arm the one-shot timer for an absolute deadline. A timer that wakes before
 * the wall clock has reached the deadline (an NTP correction stepping the clock
 * back) must not speak early: it re-arms for the time that is left, so exactly
 * one timer still exists and the wait is never shortened.
 */
function armSnoozeUntil(deadline: number): void {
  if (snoozeTimer) clearTimeout(snoozeTimer)
  snoozeDueAt = deadline
  snoozeTimer = setTimeout(() => {
    snoozeTimer = null
    if (readNow() < deadline) {
      armSnoozeUntil(deadline)
      return
    }
    snoozeDueAt = 0
    // The check reads the stored deadline and re-raises; a successful announce
    // clears it. The heartbeat would do the same within a minute, but the timer
    // keeps the promise on time.
    runScheduledCheck()
  }, Math.max(0, deadline - readNow()))
  snoozeTimer.unref?.()
}

function runScheduledCheck(): void {
  if (!running) return
  if (getQuitting()) return
  try {
    const result = checkDayWrap(readNow(), { stateFile, getQuitting, getEnabled })
    if (result.status === 'announced') {
      log.info(`Evening wrap raised for ${result.day}`)
    }
    // The check may have honoured or dropped a stored wait (and cleared it on
    // disk); the timer must go with it, or it would wake to a promise that is
    // already kept.
    if (snoozeTimer && readState(statePath()).snoozeUntil === undefined) cancelSnooze()
  } catch (err) {
    // A wrap must never take the main process down.
    log.warn('Evening wrap check failed:', err)
  }
}

/** The next local 18:30 strictly after `nowMs` (today's when still before it). */
export function nextDayWrapCheckAt(nowMs: number): number {
  const { day, openAtMs } = dayWindow(nowMs)
  if (openAtMs > nowMs) return openAtMs
  const { year, month, day: dateOfMonth } = parseDay(day)
  return new Date(year, month - 1, dateOfMonth + 1, WRAP_HOUR, WRAP_MINUTE, 0, 0).getTime()
}

/**
 * Arm the one-shot timer at the next 18:30. Re-armed after every check so a
 * late wake-up (or a clock change) moves the next evening honestly instead of
 * inheriting a 24-hour interval from the previous launch.
 */
function armWrapCheck(): void {
  if (!running) return
  if (wrapTimer) {
    clearTimeout(wrapTimer)
    wrapTimer = null
  }
  const now = readNow()
  const delay = Math.max(1000, nextDayWrapCheckAt(now) - now)
  wrapTimer = setTimeout(() => {
    wrapTimer = null
    runScheduledCheck()
    armWrapCheck()
  }, delay)
  wrapTimer.unref?.()
}

// ── "Later" (a two-hour deferral of the card) ─────────────────────────────

/**
 * The card's secondary action: come back in two hours. Writes the deadline to
 * disk before returning, so a restart mid-wait still brings the wrap back.
 * Never touches `lastWrapDay`: a preview raised from the tray and deferred must
 * not spend the evening's own card. Returns false while the scheduler is not
 * running or the app is quitting.
 */
export function snoozeDayWrap(nowMs?: number): boolean {
  if (!running || getQuitting()) return false
  const now = typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : readNow()
  const deadline = now + DAY_WRAP_SNOOZE_MS
  armSnoozeUntil(deadline)
  // Written *before* the timer can fire: a crash in between must not lose the
  // wait, and it must not fire it either — the file is read back on launch.
  const file = statePath()
  const state = readState(file)
  writeState(file, {
    version: STATE_VERSION,
    ...(state.lastWrapDay ? { lastWrapDay: state.lastWrapDay } : {}),
    ...(state.lastWrapAt !== undefined ? { lastWrapAt: state.lastWrapAt } : {}),
    snoozeUntil: deadline,
  })
  return true
}

/**
 * Pick up a "Later" that was asked for before the app closed. A live deadline is
 * armed for the time that is left. A deadline whose moment passed while nothing
 * was running is left to the immediate check: on the same evening it is late,
 * not stale, and still speaks; once midnight has moved the day on it is dropped
 * rather than spoken late.
 */
function restoreSnooze(now: number): void {
  const stored = readState(statePath()).snoozeUntil
  if (!stored || stored <= now) return
  armSnoozeUntil(stored)
  snoozeRestored += 1
  log.info(`Restored a pending "Later" for ${Math.round((stored - now) / 60000)} more minute(s)`)
}

/**
 * Start the evening wrap. Idempotent: a second call does nothing. The immediate
 * check covers "the app started after 18:30"; the attention pipeline still
 * decides whether anything may be shown.
 */
export function startDayWrap(options: DayWrapOptions = {}): void {
  if (running) return
  running = true
  readNow = typeof options.now === 'function' ? options.now : Date.now
  stateFile = options.stateFile
  getQuitting = typeof options.getQuitting === 'function' ? options.getQuitting : () => false
  getEnabled = typeof options.getEnabled === 'function' ? options.getEnabled : () => false
  snoozeRestored = 0

  // Before the first check: a wait the user asked for in a previous run is back
  // in the timers rather than looking like a deadline nobody remembers.
  restoreSnooze(readNow())
  runScheduledCheck()
  armWrapCheck()

  tickTimer = setInterval(runScheduledCheck, TICK_MS)
  tickTimer.unref?.()

  // A laptop asleep at 18:30 never fired the timer; waking is the moment the
  // user is back, so it is the moment to re-evaluate — still the same evening.
  resumeHandler = () => {
    runScheduledCheck()
    armWrapCheck()
  }
  try {
    powerMonitor.on('resume', resumeHandler)
  } catch (err) {
    // A harness or a platform without powerMonitor: the heartbeat still works.
    log.debug('powerMonitor resume hook unavailable:', String(err))
    resumeHandler = null
  }
}

export function stopDayWrap(): void {
  if (!running) return
  running = false
  // Quitting drops the timer only; the stored deadline stays, so the wait is
  // still there next launch (see `restoreSnooze`).
  cancelSnooze()
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
  if (wrapTimer) {
    clearTimeout(wrapTimer)
    wrapTimer = null
  }
  if (resumeHandler) {
    try { powerMonitor.removeListener('resume', resumeHandler) } catch { /* shutting down */ }
    resumeHandler = null
  }
}

/** Diagnostics for the harness and for a future status panel; no UI reads it. */
export function getDayWrapStatus(): DayWrapStatusReport {
  const timers = [tickTimer, wrapTimer, snoozeTimer]
    .filter((timer): timer is NodeJS.Timeout => timer !== null)
  const unrefed = timers.every(timer => typeof timer.hasRef !== 'function' || timer.hasRef() === false)
  return { running, timers: timers.length, unrefed }
}

export interface DayWrapSnoozeStatus {
  pending: boolean
  /** Wall-clock ms the pending wait fires at; 0 when none. */
  dueAt: number
  /** How many waits were read back from the state file after a restart. */
  restored: number
}

/** Diagnostics for the harness; no UI reads it. */
export function getDayWrapSnoozeStatus(): DayWrapSnoozeStatus {
  return { pending: snoozeTimer !== null, dueAt: snoozeDueAt, restored: snoozeRestored }
}
