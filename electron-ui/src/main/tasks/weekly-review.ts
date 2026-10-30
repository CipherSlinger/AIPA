/**
 * weekly-review.ts — the pet's once-a-week look back at the week that ended.
 *
 * Every other task surface is about *now*: the brief names what is due, the
 * board shows what is open, the due reminder speaks on the morning a deadline
 * arrives. Nothing ever says how the week went, so work that got finished
 * simply disappears from view the moment it is marked done. This module adds
 * exactly one card a week — a small review of the calendar week that just
 * ended: how many things were finished, what is still on the desk, and which
 * finished tasks to name — raised through `raiseAttention`.
 *
 * When it checks
 *   - once at start (the main process calls `startWeeklyReview` after the task
 *     store exists and attention is initialised);
 *   - on a one-shot timer aimed at the next Monday 08:00 local, not "launch
 *     time + 7 days";
 *   - every minute while the app runs, so a laptop that slept through Monday
 *     morning, a clock/timezone jump or a wake-up on Tuesday is noticed
 *     promptly;
 *   - immediately after system resume (`powerMonitor` `resume`), because a
 *     machine asleep at 08:00 must still say it when it wakes.
 * All timers are unref'd and cleared by `stopWeeklyReview` on quit; every check
 * also refuses to run once the app is quitting.
 *
 * What the week is
 *   Weeks are local calendars, Monday to Sunday. The reviewed window is the
 *   previous Monday 00:00 local through this week's Monday 00:00 local
 *   (exclusive). Both bounds are local midnights built with `new Date(y, m-1,
 *   d)` — adding `86_400_000` ms would drift across DST and cut an hour out of
 *   the window twice a year. A day is a bare `YYYY-MM-DD`, so comparisons are
 *   plain string comparisons.
 *
 * When it may speak
 *   Monday 08:00 local is the earliest, and Thursday 08:00 local is the last
 *   chance: a review that arrives three days late is still worth one line, a
 *   review a week late is not. Before Monday 08:00 the week has not been handed
 *   over yet (and the user has not started their Monday); from Thursday 08:00
 *   the moment is gone for that week, silently.
 *
 * Once per week, honestly
 *   The state file (`userData/weekly-review.json`, tmp + rename) remembers the
 *   Monday of the last reviewed week. The week is written ONLY when
 *   `raiseAttention` says a surface owns the raise. A card suppressed by DND,
 *   timed silence, focus or the pet's alert switch writes nothing, so the next
 *   tick — a minute later, or after the machine wakes — raises the same review.
 *   A restart on the same day is covered by the same field: the week that was
 *   reviewed is not reviewed twice.
 *
 * Nothing to say
 *   If nothing was finished in the window and nothing is open now, there is no
 *   review: an empty week and an empty desk do not deserve a card. That verdict
 *   is not remembered — the file only ever records a review that was actually
 *   spoken — so a task captured later the same morning is still counted when
 *   the next tick runs.
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

const log = createLogger('weekly-review')

/**
 * How many finished tasks one review may name. The counts above the rows still
 * carry the whole week; the rows are a glance, and three titles fit a bubble.
 */
export const REVIEW_ROWS_SHOWN = 3

/**
 * The earliest hour of Monday morning at which the review may speak. Monday
 * midnight would catch the user asleep and bury the card under the boot
 * greeting; 08:00 is the same civilised hour the due reminder uses.
 */
export const REVIEW_CIVILISED_HOUR = 8

/**
 * Whole days after Monday 08:00 during which a missed review may still be
 * spoken. A laptop that slept through Monday still gets it on Tuesday or
 * Wednesday; from Thursday the week is too old to be a review.
 */
export const REVIEW_GRACE_DAYS = 3

/** A safety heartbeat, not the announcement timer: catches a missed Monday,
 *  a system clock jump and a resume the power hook did not see. */
const TICK_MS = 60_000

const STATE_VERSION = 1
const STATE_FILE = 'weekly-review.json'
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** One finished task the card may name. */
export interface ReviewRow {
  /** Task title, as stored. */
  title: string
  /** Local `YYYY-MM-DD` of that task's LAST completion inside the reviewed week. */
  day: string
}

/** The shape handed to the attention queue's task-review case. */
export interface ReviewAggregate {
  /** Completion events (occurrences) recorded inside the reviewed week. */
  finished: number
  /** Distinct tasks with at least one completion in the reviewed week. */
  finishedTasks: number
  /** Tasks still open right now (status not 'done' and not 'archived'). */
  open: number
  /** Of those open tasks, how many have a dueOn earlier than today. */
  overdue: number
  /** Up to REVIEW_ROWS_SHOWN distinct finished tasks, newest completion first. */
  rows: ReviewRow[]
  /** finishedTasks - rows.length (>= 0). */
  more: number
  /** Monday of the reviewed week, `YYYY-MM-DD`. */
  weekStart: string
}

interface CalendarDay {
  year: number
  month: number
  day: number
}

/** One local calendar day of the reviewed week, with that day's completion count. */
export interface WeekReviewDay {
  /** Local `YYYY-MM-DD`. */
  day: string
  count: number
}

/** One distinct finished task, as the week-review card names it. */
export interface WeekReviewRow {
  id: string
  title: string
  /** Local `YYYY-MM-DD` of the task's last in-window completion. */
  day: string
  /** Completions of this task inside the reviewed week (>= 1). */
  count: number
  /** Latest conversation on the task, when one has run. */
  sessionId?: string
}

/** One task still on the desk, read at `nowMs` rather than at the week's end. */
export interface WeekReviewOpenRow {
  id: string
  title: string
  /** Local `YYYY-MM-DD` due day; absent when the task has none. */
  dueOn?: string
  /** True when `dueOn` is earlier than today. */
  overdue: boolean
  /** Whole calendar days past due; 0 when not overdue. */
  overdueDays: number
}

/**
 * Everything the week-review card needs about the week that just ended.
 *
 * `finished` counts occurrences, so a daily task finished three times is
 * three; `finishedTasks` counts the task once, because the list is about work,
 * not repetitions. `previousFinished` is the same occurrence count for the
 * seven days immediately before the reviewed week, which is what makes the
 * "more / fewer than the week before" line honest.
 */
export interface WeekReviewAggregate {
  /** Monday of the reviewed week, `YYYY-MM-DD`. */
  weekStart: string
  /** Sunday of the reviewed week, `YYYY-MM-DD`. */
  weekEnd: string
  /** Completion events (occurrences) recorded inside the reviewed week. */
  finished: number
  /** Distinct tasks with at least one completion in the reviewed week. */
  finishedTasks: number
  /** Completions in the seven days before the reviewed week. */
  previousFinished: number
  /** Tasks still open right now (status not 'done' and not 'archived'). */
  open: number
  /** Of those open tasks, how many have a dueOn earlier than today. */
  overdue: number
  /** Exactly seven entries, Monday → Sunday. */
  days: WeekReviewDay[]
  /** Every distinct finished task, newest completion first, ties by title. */
  rows: WeekReviewRow[]
  /** Tasks still open: past due first, then nearest due, then title. */
  openRows: WeekReviewOpenRow[]
}

interface ReviewWindow {
  /** Monday of the reviewed week, `YYYY-MM-DD`. */
  weekStart: string
  /** Local midnight opening the reviewed week (inclusive). */
  startMs: number
  /** Local midnight ending it — this week's Monday (exclusive). */
  endMs: number
  /** This week's Monday 08:00: the earliest moment the review may speak. */
  openAtMs: number
  /** Thursday 08:00: from here the review is stale for that week. */
  closeAtMs: number
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

/**
 * The Monday of the local week containing `day`. `getDay()` is Sunday-first,
 * so `(getDay() + 6) % 7` makes Monday 0; the step is a calendar-day offset
 * (`new Date(y, m-1, d - offset)`), never milliseconds.
 */
export function weekStartOf(day: string): string {
  const { year, month, day: dateOfMonth } = parseDay(day)
  const offset = (new Date(year, month - 1, dateOfMonth).getDay() + 6) % 7
  return formatDay(new Date(year, month - 1, dateOfMonth - offset))
}

/** The Monday of the week that just ended: this local week's Monday minus 7 days. */
export function reviewWeekStart(nowMs: number): string {
  const { year, month, day } = parseDay(weekStartOf(localDayKey(nowMs)))
  return formatDay(new Date(year, month - 1, day - 7))
}

/** The next local Monday 08:00 strictly after `nowMs` (today's when still before it). */
export function nextReviewCheckAt(nowMs: number): number {
  const { year, month, day } = parseDay(weekStartOf(localDayKey(nowMs)))
  const at = new Date(year, month - 1, day, REVIEW_CIVILISED_HOUR, 0, 0, 0)
  if (at.getTime() <= nowMs) at.setDate(at.getDate() + 7)
  return at.getTime()
}

/**
 * The reviewed window for one moment, plus the two edges of when a card may
 * speak. All four instants are local midnights/hours built from calendar
 * fields, so a DST change inside the week cannot stretch it by an hour.
 */
function reviewWindow(nowMs: number): ReviewWindow {
  const monday = weekStartOf(localDayKey(nowMs))
  const thisMonday = parseDay(monday)
  const lastMonday = parseDay(formatDay(new Date(thisMonday.year, thisMonday.month - 1, thisMonday.day - 7)))
  return {
    weekStart: formatDay(new Date(lastMonday.year, lastMonday.month - 1, lastMonday.day)),
    startMs: new Date(lastMonday.year, lastMonday.month - 1, lastMonday.day).getTime(),
    endMs: new Date(thisMonday.year, thisMonday.month - 1, thisMonday.day).getTime(),
    openAtMs: new Date(thisMonday.year, thisMonday.month - 1, thisMonday.day, REVIEW_CIVILISED_HOUR, 0, 0, 0).getTime(),
    closeAtMs: new Date(
      thisMonday.year,
      thisMonday.month - 1,
      thisMonday.day + REVIEW_GRACE_DAYS,
      REVIEW_CIVILISED_HOUR,
      0,
      0,
      0,
    ).getTime(),
  }
}

// ── Aggregation ───────────────────────────────────────────────────────────

interface WeekReviewWindow {
  /** Monday of the reviewed week, `YYYY-MM-DD`. */
  weekStart: string
  /** Sunday of the reviewed week, `YYYY-MM-DD`. */
  weekEnd: string
  /** Local midnight opening the reviewed week (inclusive). */
  startMs: number
  /** Local midnight ending it — this week's Monday (exclusive). */
  endMs: number
  /** Local midnight seven calendar days before `startMs` (inclusive). */
  previousStartMs: number
}

/**
 * The displayed week plus the seven days before it. `weekOffset` walks back
 * whole weeks: 0 is the week that just ended, -1 the one before it. The whole
 * span moves by `weekOffset * 7` calendar days built from date fields
 * (`new Date(y, m-1, d + delta)`), never by adding milliseconds: on a DST
 * change day an instant plus a fixed span can land on the same or the wrong
 * calendar day. At offset 0 this is byte-for-byte the week the card has
 * always shown.
 */
function weekReviewWindow(nowMs: number, weekOffset = 0): WeekReviewWindow {
  const monday = parseDay(reviewWindow(nowMs).weekStart)
  const delta = weekOffset * 7
  const start = new Date(monday.year, monday.month - 1, monday.day + delta)
  return {
    weekStart: formatDay(start),
    weekEnd: formatDay(new Date(monday.year, monday.month - 1, monday.day + delta + 6)),
    startMs: start.getTime(),
    endMs: new Date(monday.year, monday.month - 1, monday.day + delta + 7).getTime(),
    previousStartMs: new Date(monday.year, monday.month - 1, monday.day + delta - 7).getTime(),
  }
}

/**
 * Fold a caller's week offset into the range this card may show: whole weeks
 * only, never into the future, and no further back than a year. Anything that
 * is not a finite number reads as the week that just ended.
 */
function normalizeWeekOffset(weekOffset: number): number {
  if (typeof weekOffset !== 'number' || !Number.isFinite(weekOffset)) return 0
  return Math.max(-52, Math.min(0, Math.floor(weekOffset)))
}

/** Monday..Sunday of one local week, as day keys. */
function weekDays(weekStart: string): string[] {
  const monday = parseDay(weekStart)
  const days: string[] = []
  for (let offset = 0; offset < 7; offset += 1) {
    days.push(formatDay(new Date(monday.year, monday.month - 1, monday.day + offset)))
  }
  return days
}

/**
 * Whole calendar days from `from` to `to`, both local `YYYY-MM-DD` days.
 *
 * The two days are normalised to UTC midnights first: that is purely civil
 * arithmetic on calendar fields, so no DST transition can stretch or shrink
 * the result. It never converts a local instant plus a fixed millisecond
 * span, which is the thing that breaks twice a year.
 */
function calendarDaysBetween(from: string, to: string): number {
  const a = parseDay(from)
  const b = parseDay(to)
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000,
  )
}

/** The conversation a task should open: the last one that ran on it. */
function latestTaskSession(task: TaskRecord): string | undefined {
  const sessions = Array.isArray(task.sessions) ? task.sessions : []
  let latest: { sessionId: string; startedAt: number } | null = null
  for (const session of sessions) {
    if (!session || typeof session.sessionId !== 'string' || !session.sessionId) continue
    const startedAt =
      typeof session.startedAt === 'number' && Number.isFinite(session.startedAt) ? session.startedAt : 0
    if (!latest || startedAt >= latest.startedAt) latest = { sessionId: session.sessionId, startedAt }
  }
  return latest?.sessionId
}

/**
 * The week that just ended — or, with `weekOffset`, an earlier one — in full:
 * counts, the seven-day strip, every distinct finished task and the desk as it
 * stands now.
 *
 * `weekOffset` is whole weeks back from the week that just ended: 0 (the
 * default) is the week the attention bubble speaks about, -1 the week before
 * it, down to -52. The value is floored and clamped here, so a caller cannot
 * walk past the floor or into the future. Only the seven finished days and
 * their counts move; `open`, `overdue` and `openRows` describe the desk at
 * `nowMs` whatever week is on show.
 *
 * The reviewed window is the same half-open local-midnight span the attention
 * bubble uses — a completion at Sunday 23:59:59 belongs to the displayed week,
 * the one at Monday 00:00:00 to the next. `open` and `overdue` are read at
 * `nowMs`, not at the window's end, because the card says what is on the desk
 * now and a task finished since Sunday is not.
 *
 * Never throws on an odd record: a task without a history array, an event
 * without a finite instant and a malformed due day are skipped, not fatal.
 */
export function collectWeekReview(
  tasks: readonly TaskRecord[],
  nowMs: number,
  weekOffset = 0,
): WeekReviewAggregate {
  const { weekStart, weekEnd, startMs, endMs, previousStartMs } =
    weekReviewWindow(nowMs, normalizeWeekOffset(weekOffset))
  const dayKeys = weekDays(weekStart)
  const dayCounts = new Map<string, number>(dayKeys.map(day => [day, 0]))
  const today = localDayKey(nowMs)

  let finished = 0
  let previousFinished = 0
  const completed: Array<{
    id: string
    title: string
    /** The last in-window completion instant of this task. */
    latestAt: number
    day: string
    count: number
    sessionId?: string
  }> = []
  const openRows: WeekReviewOpenRow[] = []

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
        const day = localDayKey(event.at)
        dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1)
        if (event.at > latestAt) latestAt = event.at
      } else if (event.at >= previousStartMs && event.at < startMs) {
        previousFinished += 1
      }
    }

    if (count > 0) {
      const sessionId = latestTaskSession(task)
      completed.push({
        id: task.id,
        title: task.title,
        latestAt,
        day: localDayKey(latestAt),
        count,
        ...(sessionId ? { sessionId } : {}),
      })
    }

    if (task.status === 'done' || task.status === 'archived') continue

    const row: WeekReviewOpenRow = {
      id: task.id,
      title: task.title,
      overdue: false,
      overdueDays: 0,
    }
    // A due day is a stored `YYYY-MM-DD`. A malformed one cannot be compared
    // or counted, so the row stays open without a day rather than acquiring a
    // date it never had.
    if (typeof task.dueOn === 'string' && DAY_RE.test(task.dueOn)) {
      row.dueOn = task.dueOn
      if (task.dueOn < today) {
        row.overdue = true
        row.overdueDays = Math.max(0, calendarDaysBetween(task.dueOn, today))
      }
    }
    openRows.push(row)
  }

  // Newest completion first; ties fall back to the title so a repaint never
  // reshuffles the rows. `completed` is already per task — the latest
  // completion is the only one kept — so a repeated task is named once.
  const rows: WeekReviewRow[] = completed
    .sort((a, b) => (b.latestAt - a.latestAt) || a.title.localeCompare(b.title))
    .map(row => ({
      id: row.id,
      title: row.title,
      day: row.day,
      count: row.count,
      ...(row.sessionId ? { sessionId: row.sessionId } : {}),
    }))

  // Oldest due first, then the nearest due, tasks with no due day last. A
  // past-due day is simply an earlier day, so this also puts every overdue
  // row above every row that is still on time; ties fall back to the title.
  openRows.sort((a, b) => {
    if (a.dueOn && b.dueOn) {
      if (a.dueOn !== b.dueOn) return a.dueOn < b.dueOn ? -1 : 1
      return a.title.localeCompare(b.title)
    }
    if (a.dueOn) return -1
    if (b.dueOn) return 1
    return a.title.localeCompare(b.title)
  })

  return {
    weekStart,
    weekEnd,
    finished,
    finishedTasks: rows.length,
    previousFinished,
    open: openRows.length,
    overdue: openRows.filter(row => row.overdue).length,
    days: dayKeys.map(day => ({ day, count: dayCounts.get(day) ?? 0 })),
    rows,
    openRows,
  }
}

/**
 * The week as the attention bubble tells it. `finished` counts occurrences,
 * so a daily task finished three times is three; `finishedTasks` counts the
 * task once, because the rows are about work, not about repetitions. `open`
 * and `overdue` are read at check time, not at the window's end — the card
 * says what is on the desk now, and a task finished since Sunday is not.
 *
 * This is the first three rows of `collectWeekReview`, unchanged in shape:
 * the bubble names at most REVIEW_ROWS_SHOWN tasks and says how many more
 * there are. Keeping it built on the full aggregate means the bubble and the
 * week-review card can never disagree about the week's counts.
 */
export function collectReview(tasks: readonly TaskRecord[], nowMs: number): ReviewAggregate {
  const aggregate = collectWeekReview(tasks, nowMs)
  const shown: ReviewRow[] = aggregate.rows
    .slice(0, REVIEW_ROWS_SHOWN)
    .map(row => ({ title: row.title, day: row.day }))

  return {
    finished: aggregate.finished,
    finishedTasks: aggregate.finishedTasks,
    open: aggregate.open,
    overdue: aggregate.overdue,
    rows: shown,
    more: Math.max(0, aggregate.finishedTasks - shown.length),
    weekStart: aggregate.weekStart,
  }
}

// ── The small main-owned state file ───────────────────────────────────────

interface WeeklyReviewState {
  version: number
  /** Monday of the last week a review was actually spoken for. */
  lastReviewedWeek?: string
  /** Diagnostics: the wall-clock ms of the last raise. */
  lastReviewedAt?: number
}

function defaultStatePath(): string {
  return path.join(app.getPath('userData'), STATE_FILE)
}

function isDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

/** A missing or corrupt file is an empty memory, never a reason to stop. */
function readState(file: string): WeeklyReviewState {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>
    return {
      version: STATE_VERSION,
      ...(isDay(parsed?.lastReviewedWeek) ? { lastReviewedWeek: parsed.lastReviewedWeek } : {}),
      ...(typeof parsed?.lastReviewedAt === 'number' && Number.isFinite(parsed.lastReviewedAt)
        ? { lastReviewedAt: parsed.lastReviewedAt }
        : {}),
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      log.warn(`Could not read ${path.basename(file)}; starting with an empty review memory:`, err)
    }
    return { version: STATE_VERSION }
  }
}

/** Same tmp + rename discipline as the task store: a crash cannot leave half a file. */
function writeState(file: string, state: WeeklyReviewState): boolean {
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

// ── One check ─────────────────────────────────────────────────────────────

export type WeeklyReviewStatus =
  | 'quitting' | 'before-due' | 'expired' | 'already-reviewed'
  | 'nothing-to-say' | 'suppressed' | 'announced' | 'error'

export interface WeeklyReviewResult {
  status: WeeklyReviewStatus
  /** The week that would be (or was) reviewed, `YYYY-MM-DD`; '' when it could not run. */
  weekStart: string
  aggregate?: ReviewAggregate
  persisted?: boolean
}

export interface WeeklyReviewOptions {
  /** Clock injection for the scheduler and a fake-clock harness; defaults to `Date.now`. */
  now?: () => number
  /** Override for harnesses; the app uses `userData/weekly-review.json`. */
  stateFile?: string
  /** True while the app is quitting: never raise a card. */
  getQuitting?: () => boolean
}

/**
 * Evaluate one moment. Exported so the timer, the resume listener and a
 * harness all go through exactly the same rules. Never throws: a store that
 * cannot be read is a logged warning and an `'error'` result.
 */
export function checkWeeklyReview(nowMs: number, options: WeeklyReviewOptions = {}): WeeklyReviewResult {
  if (options.getQuitting?.()) return { status: 'quitting', weekStart: '' }

  const window = reviewWindow(nowMs)
  if (nowMs < window.openAtMs) return { status: 'before-due', weekStart: window.weekStart }
  if (nowMs >= window.closeAtMs) return { status: 'expired', weekStart: window.weekStart }

  // The state file is consulted before the store. This check runs every minute
  // for three days; after the review has been spoken there is no reason to
  // rescan every task's history just to discover that again.
  const file = options.stateFile ?? defaultStatePath()
  if (readState(file).lastReviewedWeek === window.weekStart) {
    return { status: 'already-reviewed', weekStart: window.weekStart }
  }

  let tasks: TaskRecord[]
  try {
    tasks = readTaskStore().tasks
  } catch (err) {
    log.warn('Could not read the task store for the weekly review:', err)
    return { status: 'error', weekStart: '' }
  }

  const aggregate = collectReview(tasks, nowMs)
  if (aggregate.finished === 0 && aggregate.open === 0) {
    return { status: 'nothing-to-say', weekStart: window.weekStart, aggregate }
  }

  const delivered = raiseAttention({ kind: 'task-review', review: aggregate })
  if (!delivered) {
    // DND, timed silence, the pet's alert switch with no OS fallback, or the
    // user looking at AIPA right now. Nothing was announced, so the week is
    // not marked: the next check retries while the grace window is open.
    return { status: 'suppressed', weekStart: window.weekStart, aggregate }
  }

  const persisted = writeState(file, {
    version: STATE_VERSION,
    lastReviewedWeek: window.weekStart,
    lastReviewedAt: nowMs,
  })
  return { status: 'announced', weekStart: window.weekStart, aggregate, persisted }
}

// ── Scheduler ─────────────────────────────────────────────────────────────

export interface WeeklyReviewStatusReport {
  running: boolean
  /** Live timers: the Monday check and the safety heartbeat. */
  timers: number
  /** True when every live timer is unref'd (it cannot keep the app alive). */
  unrefed: boolean
}

let running = false
let tickTimer: NodeJS.Timeout | null = null
let weeklyTimer: NodeJS.Timeout | null = null
let resumeHandler: (() => void) | null = null
let readNow: () => number = Date.now
let stateFile: string | undefined
let getQuitting: () => boolean = () => false

function runScheduledCheck(): void {
  if (!running) return
  if (getQuitting()) return
  try {
    const result = checkWeeklyReview(readNow(), { stateFile, getQuitting })
    if (result.status === 'announced') {
      log.info(`Weekly review raised for the week of ${result.weekStart}`)
    }
  } catch (err) {
    // A review must never take the main process down.
    log.warn('Weekly review check failed:', err)
  }
}

/**
 * Arm the one-shot timer at the next Monday 08:00. Re-armed after every check
 * so a late wake-up (or a clock change) moves the next Monday honestly instead
 * of inheriting a 7-day interval from the previous launch.
 */
function armWeeklyCheck(): void {
  if (!running) return
  if (weeklyTimer) {
    clearTimeout(weeklyTimer)
    weeklyTimer = null
  }
  const now = readNow()
  const delay = Math.max(1000, nextReviewCheckAt(now) - now)
  weeklyTimer = setTimeout(() => {
    weeklyTimer = null
    runScheduledCheck()
    armWeeklyCheck()
  }, delay)
  weeklyTimer.unref?.()
}

/**
 * Start the review. Idempotent: a second call does nothing. The immediate
 * check is the "app started on Monday morning after 08:00" case; the attention
 * pipeline still decides whether anything may be shown.
 */
export function startWeeklyReview(options: WeeklyReviewOptions = {}): void {
  if (running) return
  running = true
  readNow = typeof options.now === 'function' ? options.now : Date.now
  stateFile = options.stateFile
  getQuitting = typeof options.getQuitting === 'function' ? options.getQuitting : () => false

  runScheduledCheck()
  armWeeklyCheck()

  tickTimer = setInterval(runScheduledCheck, TICK_MS)
  tickTimer.unref?.()

  // A laptop asleep at Monday 08:00 never fired the timer; waking is the
  // moment the user is back, so it is the moment to re-evaluate. A wake on
  // Tuesday is exactly the grace window this module exists to use.
  resumeHandler = () => {
    runScheduledCheck()
    armWeeklyCheck()
  }
  try {
    powerMonitor.on('resume', resumeHandler)
  } catch (err) {
    // A harness or a platform without powerMonitor: the heartbeat still works.
    log.debug('powerMonitor resume hook unavailable:', String(err))
    resumeHandler = null
  }
}

export function stopWeeklyReview(): void {
  if (!running) return
  running = false
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
  if (weeklyTimer) {
    clearTimeout(weeklyTimer)
    weeklyTimer = null
  }
  if (resumeHandler) {
    try { powerMonitor.removeListener('resume', resumeHandler) } catch { /* shutting down */ }
    resumeHandler = null
  }
}

/** Diagnostics for the harness and for a future status panel; no UI reads it. */
export function getWeeklyReviewStatus(): WeeklyReviewStatusReport {
  const timers = [tickTimer, weeklyTimer].filter((timer): timer is NodeJS.Timeout => timer !== null)
  const unrefed = timers.every(timer => typeof timer.hasRef !== 'function' || timer.hasRef() === false)
  return { running, timers: timers.length, unrefed }
}
