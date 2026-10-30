/**
 * due-reminder.ts — the pet's one quiet "these are due" reminder a day.
 *
 * The task store already knows which tasks owe work on a given local day
 * (`dueOn`, a bare `YYYY-MM-DD`). The list, search, dispatch brief and the
 * pet's task brief mark today and overdue, but nothing speaks when the day
 * arrives — the user has to go look. This module adds exactly one aggregated
 * announcement per civilised morning, through `raiseAttention`.
 *
 * When it checks
 *   - once at start (the main process calls `startDueReminder` after the task
 *     store exists and attention is initialised);
 *   - on a daily timer aimed at the next 08:00 local, not "launch time + 24 h";
 *   - every minute while the app runs, so a task edited to be due later in the
 *     same day, a clock/timezone jump, or a day boundary is noticed promptly;
 *   - immediately after system resume (`powerMonitor` `resume`), because a
 *     laptop asleep at 08:00 must still say it when it wakes.
 * All timers are unref'd and cleared by `stopDueReminder` on quit; every check
 * also refuses to run once the app is quitting.
 *
 * What counts
 *   - `dueOn` is today or earlier, status is neither `done` nor `archived`.
 *   - A `needs_you` task still counts: its deadline is real. The brief's
 *     needs-you count is a different surface and is not touched here.
 *   - A task with no due day never counts.
 *
 * Aggregation wording (built in `clawd-attention.ts`, which owns the pet's
 * string table): today-only says "N tasks are due today"; overdue-only names
 * the oldest overdue span; a mix says "N tasks are due — M overdue". One card
 * covers every newly-pending task; there is never one card per task.
 *
 * Once per day, honestly
 *   The state file (`userData/due-reminder.json`, tmp + rename) remembers, for
 *   each task id, the local day on which that task was last included in an
 *   announced card. On a check, candidates are the due tasks whose recorded
 *   day is not today. So:
 *     - restarting the same day repeats nothing;
 *     - a task newly edited to be due, or a genuinely new due task, appears as
 *       the only candidate and is announced (the aggregate speaks again only
 *       because its content changed — any candidate by definition changed it);
 *     - a task due yesterday and still undone is a candidate again today;
 *     - a card that was suppressed by DND / silence / focus does NOT advance
 *       the recorded day. The next check after the user is available again
 *       raises the same card; nothing is silently swallowed.
 *   The record is written only when `raiseAttention` says a surface owns the
 *   raise (the pet queued it, or the OS notification was shown).
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

const log = createLogger('due-reminder')

/**
 * The first hour at which the pet may speak. A deadline is a day, so the
 * announcement waits for the working morning: an app started at 03:00 says
 * nothing until 08:00, and every later day uses the same hour.
 */
export const DUE_REMINDER_CIVILISED_HOUR = 8

/** A safety heartbeat, not the announcement timer: catches same-day edits,
 *  a system clock jump, and a local-day change while the app stays open. */
const TICK_MS = 60_000

const STATE_VERSION = 1
const STATE_FILE = 'due-reminder.json'
/** A cap on a file that would otherwise keep every task id ever seen. */
const MAX_STATE_ENTRIES = 500

/** The shape handed to the attention queue's task-due case. */
export interface DueAggregate {
  /** Every task in this card. */
  total: number
  /** Tasks whose due day is today. */
  today: number
  /** Tasks whose due day is before today. */
  overdue: number
  /** Whole local days between the oldest due day and today; 0 when none. */
  oldestOverdueDays: number
}

export interface DueCandidate {
  id: string
  dueOn: string
  /** 0 means due today; 2 means the due day was two local days ago. */
  daysOverdue: number
}

interface DueReminderState {
  version: number
  /** Task id → the last local day (`YYYY-MM-DD`) it was announced. */
  announced: Record<string, string>
  /** Diagnostics: the last day a card was actually raised. */
  lastAnnouncedDay?: string
}

export type DueCheckStatus =
  | 'quitting'
  | 'before-hour'
  | 'nothing-due'
  | 'already-announced'
  | 'suppressed'
  | 'announced'
  | 'error'

export interface DueCheckResult {
  status: DueCheckStatus
  /** The local day the check was evaluated for; '' when it could not run. */
  day: string
  /** Tasks that were candidates (not yet announced today). */
  pending?: number
  aggregate?: DueAggregate
  /** False when the card was raised but the record could not be written. */
  persisted?: boolean
}

// ── Calendar helpers (local days, never instants on disk) ─────────────────

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/** `YYYY-MM-DD` in the machine's local calendar. */
export function localDayKey(nowMs: number): string {
  const date = new Date(nowMs)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** Whole days from one stored day to another; negative when `toDay` is earlier. */
export function daysBetween(fromDay: string, toDay: string): number {
  const [fy, fm, fd] = fromDay.split('-').map(Number)
  const [ty, tm, td] = toDay.split('-').map(Number)
  // UTC only for the arithmetic: both sides are bare days, so DST cannot make
  // a two-day gap into 1.958 or 2.041 days.
  const from = Date.UTC(fy, fm - 1, fd)
  const to = Date.UTC(ty, tm - 1, td)
  return Math.round((to - from) / 86_400_000)
}

/** The next local 08:00 strictly after `nowMs` (today's when still before it). */
export function nextCivilisedCheckAt(nowMs: number): number {
  const now = new Date(nowMs)
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), DUE_REMINDER_CIVILISED_HOUR, 0, 0, 0)
  if (at.getTime() <= nowMs) at.setDate(at.getDate() + 1)
  return at.getTime()
}

function beforeCivilisedHour(nowMs: number): boolean {
  return new Date(nowMs).getHours() < DUE_REMINDER_CIVILISED_HOUR
}

/**
 * Due tasks for one local day, in store order. Lexicographic comparison is
 * safe because `dueOn` is a fixed-width `YYYY-MM-DD`; `dueOn > today` is a
 * future day and is not yet owed.
 */
export function collectDue(tasks: readonly TaskRecord[], today: string): DueCandidate[] {
  const due: DueCandidate[] = []
  for (const task of tasks) {
    if (!task.dueOn) continue
    if (task.status === 'done' || task.status === 'archived') continue
    if (task.dueOn > today) continue
    due.push({ id: task.id, dueOn: task.dueOn, daysOverdue: daysBetween(task.dueOn, today) })
  }
  return due
}

export function buildDueAggregate(candidates: readonly DueCandidate[]): DueAggregate {
  let today = 0
  let overdue = 0
  let oldestOverdueDays = 0
  for (const candidate of candidates) {
    if (candidate.daysOverdue > 0) {
      overdue += 1
      if (candidate.daysOverdue > oldestOverdueDays) oldestOverdueDays = candidate.daysOverdue
    } else {
      today += 1
    }
  }
  return { total: candidates.length, today, overdue, oldestOverdueDays }
}

// ── The small main-owned state file ───────────────────────────────────────

function defaultStatePath(): string {
  return path.join(app.getPath('userData'), STATE_FILE)
}

function isDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

/** A missing or corrupt file is an empty memory, never a reason to stop. */
function readState(file: string): DueReminderState {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>
    const raw = parsed && typeof parsed.announced === 'object' && parsed.announced
      ? parsed.announced as Record<string, unknown>
      : {}
    const announced: Record<string, string> = {}
    for (const [id, day] of Object.entries(raw)) {
      if (id && isDay(day)) announced[id] = day
    }
    return {
      version: STATE_VERSION,
      announced,
      ...(isDay(parsed?.lastAnnouncedDay) ? { lastAnnouncedDay: parsed.lastAnnouncedDay } : {}),
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      log.warn(`Could not read ${path.basename(file)}; starting with an empty reminder memory:`, err)
    }
    return { version: STATE_VERSION, announced: {} }
  }
}

/** Same tmp + rename discipline as the task store: a crash cannot leave half a file. */
function writeState(file: string, state: DueReminderState): boolean {
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
 * Keep the memory small: task ids that no longer exist are dropped, and a
 * pathological store cannot grow the file past a few hundred rows. Entries are
 * ordered newest day first before the cap, so the ones dropped are the least
 * likely to matter.
 */
function pruneAnnounced(announced: Record<string, string>, tasks: readonly TaskRecord[]): Record<string, string> {
  const live = new Set(tasks.map(task => task.id))
  const entries = Object.entries(announced)
    .filter(([id]) => live.has(id))
    .sort((a, b) => b[1].localeCompare(a[1]))
    .slice(0, MAX_STATE_ENTRIES)
  return Object.fromEntries(entries)
}

// ── One check ─────────────────────────────────────────────────────────────

export interface DueCheckOptions {
  /** Override for harnesses; the app uses `userData/due-reminder.json`. */
  stateFile?: string
  /** True while the app is quitting: never raise a card. */
  quitting?: boolean
}

/**
 * Evaluate one moment. Exported so the timer, the resume listener and a
 * harness all go through exactly the same rules.
 */
export function checkDueReminder(nowMs: number, options: DueCheckOptions = {}): DueCheckResult {
  const day = localDayKey(nowMs)
  if (options.quitting) return { status: 'quitting', day }
  // Even a wake-up at 03:00 waits for the civilised hour.
  if (beforeCivilisedHour(nowMs)) return { status: 'before-hour', day }

  let tasks: TaskRecord[]
  try {
    tasks = readTaskStore().tasks
  } catch (err) {
    log.warn('Could not read the task store for the due reminder:', err)
    return { status: 'error', day }
  }

  const due = collectDue(tasks, day)
  if (due.length === 0) return { status: 'nothing-due', day }

  const stateFile = options.stateFile ?? defaultStatePath()
  const state = readState(stateFile)
  // Only tasks whose own recorded day is not today are new information. A task
  // announced yesterday is owed again today; a task announced this morning is
  // not repeated just because it is still undone.
  const pending = due.filter(candidate => state.announced[candidate.id] !== day)
  if (pending.length === 0) {
    return { status: 'already-announced', day, aggregate: buildDueAggregate(due) }
  }

  const aggregate = buildDueAggregate(pending)
  const delivered = raiseAttention({ kind: 'task-due', due: aggregate })
  if (!delivered) {
    // DND, timed silence, the pet's alert switch with no OS fallback, or the
    // user looking at AIPA right now. Nothing was announced, so the day is not
    // marked: the next check retries while the day is still the same.
    return { status: 'suppressed', day, pending: pending.length, aggregate }
  }

  const announced = { ...state.announced }
  for (const candidate of pending) announced[candidate.id] = day
  const persisted = writeState(stateFile, {
    version: STATE_VERSION,
    announced: pruneAnnounced(announced, tasks),
    lastAnnouncedDay: day,
  })
  return { status: 'announced', day, pending: pending.length, aggregate, persisted }
}

// ── Scheduler ─────────────────────────────────────────────────────────────

export interface DueReminderOptions {
  /** Clock injection for a fake-clock harness; defaults to `Date.now`. */
  now?: () => number
  stateFile?: string
  getQuitting?: () => boolean
}

export interface DueReminderStatus {
  running: boolean
  /** Live timers: the daily check and the safety heartbeat. */
  timers: number
  /** True when every live timer is unref'd (it cannot keep the app alive). */
  unrefed: boolean
}

let running = false
let tickTimer: NodeJS.Timeout | null = null
let dailyTimer: NodeJS.Timeout | null = null
let resumeHandler: (() => void) | null = null
let readNow: () => number = Date.now
let stateFile: string | undefined
let getQuitting: () => boolean = () => false

function runScheduledCheck(): void {
  if (!running) return
  if (getQuitting()) return
  try {
    const result = checkDueReminder(readNow(), { stateFile, quitting: getQuitting() })
    if (result.status === 'announced') {
      log.info(`Due reminder raised for ${result.pending} task(s) on ${result.day}`)
    }
  } catch (err) {
    // A reminder must never take the main process down.
    log.warn('Due reminder check failed:', err)
  }
}

/**
 * Arm the one-shot timer at the next 08:00. Re-armed after every check so a
 * late wake-up (or a clock change) moves the next morning honestly instead of
 * inheriting a 24 h interval from the previous launch.
 */
function armDailyCheck(): void {
  if (!running) return
  if (dailyTimer) {
    clearTimeout(dailyTimer)
    dailyTimer = null
  }
  const now = readNow()
  const delay = Math.max(1000, nextCivilisedCheckAt(now) - now)
  dailyTimer = setTimeout(() => {
    dailyTimer = null
    runScheduledCheck()
    armDailyCheck()
  }, delay)
  dailyTimer.unref?.()
}

/**
 * Start the reminder. Idempotent: a second call only refreshes nothing. The
 * immediate check is the "app just started and it is already past 08:00" case;
 * the attention pipeline still decides whether anything may be shown.
 */
export function startDueReminder(options: DueReminderOptions = {}): void {
  if (running) return
  running = true
  readNow = typeof options.now === 'function' ? options.now : Date.now
  stateFile = options.stateFile
  getQuitting = typeof options.getQuitting === 'function' ? options.getQuitting : () => false

  runScheduledCheck()
  armDailyCheck()

  tickTimer = setInterval(runScheduledCheck, TICK_MS)
  tickTimer.unref?.()

  // A laptop asleep at 08:00 never fired the timer; waking is the moment the
  // user is back, so it is the moment to re-evaluate. `unlock-screen` is not
  // used: unlock without a resume (walking back to a machine that stayed on)
  // is already covered by the minute heartbeat.
  resumeHandler = () => {
    runScheduledCheck()
    armDailyCheck()
  }
  try {
    powerMonitor.on('resume', resumeHandler)
  } catch (err) {
    // A harness or a platform without powerMonitor: the heartbeat still works.
    log.debug('powerMonitor resume hook unavailable:', String(err))
    resumeHandler = null
  }
}

export function stopDueReminder(): void {
  if (!running) return
  running = false
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
  if (dailyTimer) {
    clearTimeout(dailyTimer)
    dailyTimer = null
  }
  if (resumeHandler) {
    try { powerMonitor.removeListener('resume', resumeHandler) } catch { /* shutting down */ }
    resumeHandler = null
  }
}

/** Diagnostics for the harness and for a future status panel; no UI reads it. */
export function getDueReminderStatus(): DueReminderStatus {
  const timers = [tickTimer, dailyTimer].filter((timer): timer is NodeJS.Timeout => timer !== null)
  const unrefed = timers.every(timer => typeof timer.hasRef !== 'function' || timer.hasRef() === false)
  return { running, timers: timers.length, unrefed }
}
