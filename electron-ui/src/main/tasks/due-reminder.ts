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
 * covers every newly-pending task; there is never one card per task. The
 * aggregate also carries the first three titles (most overdue first) so the
 * card can answer "which ones?" without opening the Tasks view.
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
 * "Later"
 *   The card's secondary action asks this module to raise it again two hours
 *   later. That is a snooze of the announcement only: the announced memory is
 *   untouched, the aggregate is rebuilt from the live store (a task finished in
 *   the meantime does not come back), and nothing is shown when nothing is
 *   due. One timer exists at most; a second "Later" replaces it, a card raised
 *   for other tasks does not disturb it, and quitting only drops the timer.
 *   The deadline is stored in the same file, so closing the app for an hour
 *   does not lose the wait; a deadline that passed while it was closed is
 *   dropped instead of spoken late. The heartbeat and `powerMonitor` `resume`
 *   also fire an overdue snooze, so a machine that slept through the two hours
 *   still speaks on waking.
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

/**
 * How many tasks one card may name. The sentence above still carries the full
 * count; the rows are a glance, and three titles fit without turning a bubble
 * into a list.
 */
export const DUE_ROWS_SHOWN = 3

/**
 * The due card's secondary action ("Later") puts the same card back two hours
 * from now. This is a snooze of the *announcement*, not of the reminder memory:
 * the `announced` record is untouched, so tomorrow's 08:00 card is exactly what
 * it was before the user chose to wait. Only the deadline itself is stored, so
 * the wait survives a restart.
 */
export const DUE_SNOOZE_MS = 2 * 60 * 60 * 1000

/** One task a `task-due` card can name: its title and how late it is. */
export interface DueRow {
  title: string
  /** 0 means due today; 2 means the due day was two local days ago. */
  daysOverdue: number
}

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
  /**
   * Up to `DUE_ROWS_SHOWN` tasks, in the list's order (most overdue first, then
   * today's, ties by title). The bubble renders these as they are; it never
   * re-sorts them.
   */
  rows: DueRow[]
  /** Tasks the rows could not name: `total - rows.length`. */
  more: number
}

export interface DueCandidate {
  id: string
  title: string
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
  /**
   * Wall-clock ms of a pending "Later". Stored so the wait outlives the app:
   * clicking Later and then closing AIPA for an hour must still bring the card
   * back, and a deadline whose moment passed while the app was closed is not
   * spoken late — it is dropped, because the next 08:00 card covers the same
   * tasks anyway.
   */
  snoozeUntil?: number
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
    due.push({
      id: task.id,
      title: task.title,
      dueOn: task.dueOn,
      daysOverdue: daysBetween(task.dueOn, today),
    })
  }
  return due
}

/**
 * The one order this card uses, matching the Tasks list: dated work soonest
 * first, so the most overdue task leads and today's follow; two tasks on the
 * same day fall back to their titles so a repaint never reshuffles the rows.
 */
export function compareDueCandidates(a: DueCandidate, b: DueCandidate): number {
  if (a.daysOverdue !== b.daysOverdue) return b.daysOverdue - a.daysOverdue
  return a.title.localeCompare(b.title)
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
  // The order is computed here, once: the bubble's rows are already the rows
  // of the Tasks list, capped to what a bubble can show.
  const rows = candidates
    .slice()
    .sort(compareDueCandidates)
    .slice(0, DUE_ROWS_SHOWN)
    .map(candidate => ({ title: candidate.title, daysOverdue: candidate.daysOverdue }))
  return {
    total: candidates.length,
    today,
    overdue,
    oldestOverdueDays,
    rows,
    more: Math.max(0, candidates.length - rows.length),
  }
}

// ── The small main-owned state file ───────────────────────────────────────

function defaultStatePath(): string {
  return path.join(app.getPath('userData'), STATE_FILE)
}

/** The file this reminder reads and writes; a harness may point it elsewhere. */
function statePath(): string {
  return stateFile ?? defaultStatePath()
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
    const snoozeUntil = typeof parsed?.snoozeUntil === 'number' && Number.isFinite(parsed.snoozeUntil) && parsed.snoozeUntil > 0
      ? parsed.snoozeUntil
      : undefined
    return {
      version: STATE_VERSION,
      announced,
      ...(isDay(parsed?.lastAnnouncedDay) ? { lastAnnouncedDay: parsed.lastAnnouncedDay } : {}),
      ...(snoozeUntil ? { snoozeUntil } : {}),
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
 * Persist (or forget, with `null`) the pending "Later" deadline. The announced
 * memory is carried over exactly as it is: a wait is about one card, and must
 * neither re-announce today's tasks nor lose what this morning already said.
 */
function writeSnooze(file: string, deadline: number | null): boolean {
  const state = readState(file)
  return writeState(file, {
    version: STATE_VERSION,
    announced: state.announced,
    ...(state.lastAnnouncedDay ? { lastAnnouncedDay: state.lastAnnouncedDay } : {}),
    ...(deadline ? { snoozeUntil: deadline } : {}),
  })
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

  // A pending "Later" is deliberately *not* cancelled here. This card covers
  // only the tasks that were not announced yet (`pending`), so dropping the
  // snooze would silently lose the user's "wait two hours" for everything it
  // does cover — e.g. a task captured mid-morning raises its own card and the
  // 08:00 agenda would never come back. The snooze re-raises the whole live
  // agenda when it fires, whatever happened in between.

  const announced = { ...state.announced }
  for (const candidate of pending) announced[candidate.id] = day
  const persisted = writeState(stateFile, {
    version: STATE_VERSION,
    announced: pruneAnnounced(announced, tasks),
    lastAnnouncedDay: day,
    // A wait the user asked for survives the card it was not about.
    ...(state.snoozeUntil ? { snoozeUntil: state.snoozeUntil } : {}),
  })
  return { status: 'announced', day, pending: pending.length, aggregate, persisted }
}

// ── "Later" (a two-hour snooze of the announcement) ──────────────────────

/**
 * The card's aggregate for *this* moment, read from the live task store. The
 * morning's snapshot is deliberately not reused: a task the user finished in
 * the meantime must not come back. Null means nothing is due.
 */
function currentDueAggregate(nowMs: number): DueAggregate | null {
  let tasks: TaskRecord[]
  try {
    tasks = readTaskStore().tasks
  } catch (err) {
    log.warn('Could not read the task store for the snoozed due card:', err)
    return null
  }
  const due = collectDue(tasks, localDayKey(nowMs))
  if (due.length === 0) return null
  return buildDueAggregate(due)
}

/**
 * Re-raise the card. It goes through the same attention path as the morning
 * card, so kind, wording, rows and pill are identical; only its position in
 * the queue can be new. Nothing is written: today is already recorded, and a
 * snooze must leave tomorrow's 08:00 card exactly as it was.
 */
function raiseSnoozedCard(): void {
  // The timer may already be in the event loop when quit begins; a card must
  // not be raised for an app that is going away.
  if (!running || getQuitting()) return
  // The wait is over, however it ended: the file must not re-arm it after a
  // restart, or the same card would come back twice.
  forgetSnoozeOnDisk()
  const now = readNow()
  const aggregate = currentDueAggregate(now)
  if (!aggregate) {
    // Everything was finished while the card waited. Nothing is shown and no
    // state is written.
    log.info('Snoozed due card skipped: nothing is due now')
    return
  }
  const delivered = raiseAttention({ kind: 'task-due', due: aggregate })
  snoozeFired += 1
  log.info(
    `Snoozed due card ${delivered ? 'raised' : 'suppressed'} for ` +
    `${aggregate.total} task(s) on ${localDayKey(now)}`,
  )
}

/**
 * Fire a pending snooze whose wall-clock moment has passed. The timer normally
 * does this by itself; the heartbeat and `powerMonitor` `resume` call it too,
 * so a laptop that slept through the two hours still speaks on waking.
 */
function fireSnoozeIfDue(): void {
  if (!snoozeTimer || snoozeDueAt === 0) return
  if (readNow() < snoozeDueAt) return
  clearTimeout(snoozeTimer)
  snoozeTimer = null
  snoozeDueAt = 0
  raiseSnoozedCard()
}

/**
 * Arm the one-shot timer for an absolute deadline. Unref'd like the scheduler's
 * own timers, so a wait can never keep the app alive; a deadline already in the
 * past fires on the next turn of the loop rather than being skipped.
 */
function armSnoozeUntil(deadline: number): void {
  if (snoozeTimer) clearTimeout(snoozeTimer)
  snoozeDueAt = deadline
  snoozeTimer = setTimeout(() => {
    snoozeTimer = null
    snoozeDueAt = 0
    raiseSnoozedCard()
  }, Math.max(0, deadline - readNow()))
  snoozeTimer.unref?.()
}

/** Remove the stored deadline, if one is there at all. */
function forgetSnoozeOnDisk(): void {
  const file = statePath()
  if (!readState(file).snoozeUntil) return
  writeSnooze(file, null)
}

/**
 * The card's secondary action. Replaces any pending snooze, so at most one
 * timer exists no matter how often the user asks to wait. Returns false when
 * the reminder is not running (the app is quitting or the reminder is off).
 */
export function snoozeDueReminder(nowMs?: number): boolean {
  if (!running || getQuitting()) return false
  const now = typeof nowMs === 'number' ? nowMs : readNow()
  armSnoozeUntil(now + DUE_SNOOZE_MS)
  // Written *before* the timer can fire: a crash in between must not lose the
  // wait, and it must not fire it either — the file is read back on launch.
  writeSnooze(statePath(), snoozeDueAt)
  return true
}

/**
 * Drop a pending snooze from memory only. The stored deadline is deliberately
 * left alone: this is called when the app is quitting, and the whole point of
 * the file is that the wait survives a restart.
 */
export function cancelDueSnooze(): void {
  if (snoozeTimer) {
    clearTimeout(snoozeTimer)
    snoozeTimer = null
  }
  snoozeDueAt = 0
}

export interface DueSnoozeStatus {
  pending: boolean
  /** Wall-clock ms the pending snooze fires at; 0 when none. */
  dueAt: number
  /** How many snoozed cards were actually raised since the reminder started. */
  fired: number
  /** How many waits were read back from the state file after a restart. */
  restored: number
}

/** Diagnostics for the harness; no UI reads it. */
export function getDueSnoozeStatus(): DueSnoozeStatus {
  return { pending: snoozeTimer !== null, dueAt: snoozeDueAt, fired: snoozeFired, restored: snoozeRestored }
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

/**
 * At most one "Later" is pending. A second click replaces this timer; a new
 * due card raised by the reminder cancels it; quitting clears it. The timer is
 * unref'd like the scheduler's own, so it can never keep the app alive.
 */
let snoozeTimer: NodeJS.Timeout | null = null
let snoozeDueAt = 0
/** Diagnostics: how many snoozed cards were actually raised. */
let snoozeFired = 0
/** Diagnostics: how many waits were picked back up from the state file. */
let snoozeRestored = 0

function runScheduledCheck(): void {
  if (!running) return
  if (getQuitting()) return
  try {
    const result = checkDueReminder(readNow(), { stateFile, quitting: getQuitting() })
    if (result.status === 'announced') {
      log.info(`Due reminder raised for ${result.pending} task(s) on ${result.day}`)
    }
    // After the normal check: a wait that came due is spoken even when neither
    // timer fired (the heartbeat and post-sleep wake-up land here), and the
    // daily check above cannot re-announce the same agenda — a task it names is
    // already in `announced`, and the snooze re-reads the live store.
    fireSnoozeIfDue()
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
 * Pick up a "Later" that was asked for before the app closed. A deadline still
 * in the future is armed for the time that is left; one whose moment passed
 * while nothing was running is dropped rather than spoken late — the tasks it
 * named are still due, and the next 08:00 card (or the next check that finds
 * them unannounced) is the honest place to say so.
 */
function restoreSnooze(now: number): void {
  const file = statePath()
  const stored = readState(file).snoozeUntil
  if (!stored) return
  if (stored <= now) {
    writeSnooze(file, null)
    log.info('Dropped a "Later" whose two hours passed while the app was closed')
    return
  }
  armSnoozeUntil(stored)
  snoozeRestored += 1
  log.info(`Restored a pending "Later" for ${Math.round((stored - now) / 60000)} more minute(s)`)
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
  snoozeFired = 0
  snoozeRestored = 0

  // Before the first check, so a wait the user asked for in a previous run is
  // back in the timers rather than looking like a deadline nobody remembers.
  restoreSnooze(readNow())
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
  // Quitting drops the timer only; the stored deadline stays, so the wait is
  // still there next launch (see `restoreSnooze`).
  cancelDueSnooze()
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
