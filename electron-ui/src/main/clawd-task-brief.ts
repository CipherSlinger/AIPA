/**
 * clawd-task-brief.ts — the pet's "what is on my desk?" card.
 *
 * The task store already knows the answer; the pet is the surface that can say
 * it without the user opening AIPA. This module owns the one window that turns
 * `listTasks()` into a HUD brief, opened from a global shortcut or from the
 * radial menu's BRIEF petal.
 *
 * Shape of the thing (deliberately the same as `clawd-notice-center.ts`):
 *   - one window, created on demand and destroyed on close, because a hidden
 *     window would keep a GPU surface alive and keep answering IPC after the
 *     pet went away;
 *   - the renderer asks for `task-brief:load`, paints, reports its measured
 *     height, and only then is the window revealed — no empty transparent
 *     rectangle ever sits over the desktop;
 *   - blur is click-away, but blurs during the reveal and during an in-flight
 *     row action are ignored;
 *   - a row opens the task's latest conversation, or the Tasks view when the
 *     task has no conversation yet;
 *   - a row's Start button dispatches the task instead: a chat tab in the task
 *     folder with the brief in the composer, and nothing sent;
 *   - a row's due marker moves the task to tomorrow in place, offering the old
 *     day back through the same quiet Undo line a finish uses;
 *   - a row's Done on a repeating task completes the occurrence rather than the
 *     task: the row stays under its new day, and the same line offers the old
 *     day back.
 *
 * Everything is fail-open: a missing store, a display query that throws while
 * Electron is still starting, or a window that never paints must never take the
 * app down. The worst outcome is that the brief does not open.
 */
import { BrowserWindow, ipcMain, screen } from 'electron'
import * as path from 'path'
import { getPref } from './config/config-manager'
import { getClawdLanguage, withClawdMainWindow } from './clawd-integration'
import { readDeptHandbookSnapshot } from './automation/dept-handbook-store'
import { listTasks, updateTask, type TaskRecord, type TaskStatus, type TaskView } from './tasks/task-store'
import { refreshClawdTaskBadge } from './clawd-task-badge'
import { safeHandle } from './ipc/register/safe-handle'
import { createLogger } from './utils/logger'

const log = createLogger('clawd-task-brief')

type ClawdBriefTheme = 'sao' | 'clawd'

/** The pet's string table; the card speaks the pet's language. */
const { createTranslator } = require('./clawd/src/i18n') as {
  createTranslator: (getLang: () => string) => (key: string) => string
}
const petT = createTranslator(() => {
  try { return getClawdLanguage() || 'en' } catch { return 'en' }
})

/** The pet's screen rectangle, in Electron's DIP screen coordinates. */
export interface ClawdTaskBriefAnchor {
  x: number
  y: number
  width: number
  height: number
}

/** One row as the renderer sees it. */
export interface ClawdTaskBriefItem {
  id: string
  title: string
  status: TaskStatus
  /** Resolved department display name, or '' when the task is unfiled. */
  department: string
  materials: number
  /** Epoch ms of the last change, for the row's relative age. */
  updatedAt: number
  /**
   * Why a `needs_you` task is waiting, when the engine reported a reason.
   * Read from the note on its latest `status_changed` event; absent otherwise.
   */
  reason?: string
  /**
   * The local calendar day (`YYYY-MM-DD`) work is owed, straight from the
   * record. Absent means no due day — the two states are never conflated.
   */
  dueOn?: string
  /** Latest conversation on this task, when one has run. */
  sessionId?: string
}

/**
 * The short-lived offer to put back what the most recent row action changed.
 *
 * It travels with the payload that action returns, so the card can draw one
 * quiet line without asking a second question. `kind` says which change is on
 * offer — a finish restores the old status, a defer restores the old due day,
 * and a repeat finish (a repeating task's occurrence completed) restores the
 * day the row was on before it rolled forward — and the page picks the matching
 * line for it. `previous` is the status the task had immediately before Done,
 * captured by the main process; `nextDueOn` is the repeat offer's new day, which
 * the page names in its line but never writes with. `expiresAt` is the moment
 * main will refuse to restore it any more; the page uses that same instant to
 * hide the line, so a delayed paint cannot extend a window main has already
 * closed.
 *
 * An offer is a claim about one row that is still exactly where the offer's own
 * write put it. Before restoring a due day, main requires the task to be on the
 * desk and still carrying that written day; a change made by another surface
 * since then is newer intent, and Undo refuses rather than overwriting it.
 */
export interface ClawdTaskBriefUndo {
  id: string
  title: string
  kind: 'done' | 'defer' | 'repeat'
  previous?: TaskStatus
  nextDueOn?: string
  expiresAt: number
}

/** Everything the renderer needs for one paint. */
export interface ClawdTaskBriefPayload {
  /**
   * Every active task on the desk, in card order. The page paints all of them
   * and scrolls the list inside the card's height cap; nothing is truncated
   * here, so `total` and `tasks.length` are always the same number.
   */
  tasks: ClawdTaskBriefItem[]
  /** Active tasks on the desk. Always `tasks.length`; see above. */
  total: number
  /** Pet language: "en" | "zh" | "ko". */
  lang: string
  theme: ClawdBriefTheme
  labels: Record<string, string>
  /** The summon chord actually claimed, or '' when every candidate was taken. */
  shortcut: string
  /**
   * Id of a task the page just finished. The fresh `tasks` list already omits
   * it; this only tells the page which row to collapse before repainting.
   */
  finished?: string
  /**
   * One honest line about a row action that did not land. Absent on every
   * ordinary refresh, so the page clears any previous note.
   */
  error?: string
  /**
   * The offer to undo the most recent reversible row action, present only on
   * the payload that answers it and only until it expires or another action
   * intervenes.
   */
  undo?: ClawdTaskBriefUndo
}

type BriefActionType = 'open' | 'start' | 'done' | 'defer' | 'undo' | 'open-tasks' | 'close'

interface BriefAction {
  type?: unknown
  id?: unknown
}

// Width is fixed; height follows the content between these bounds. The page
// reports the height its whole list wants; the window grows to meet it until
// this cap, and past the cap the list scrolls inside the card. The cap is the
// same ceiling the notice centre uses, so no pet surface becomes a slab.
const WIDTH = 372
const MIN_HEIGHT = 168
const MAX_HEIGHT = 420
const EDGE_MARGIN = 10
/** Gap between the pet and the panel, so the panel never covers the sprite. */
const PET_GAP = 12

// A local file either loads or it does not; this only guards the reveal so a
// renderer that never reports back cannot leave an invisible, focused window
// sitting over the desktop.
const REVEAL_TIMEOUT_MS = 900
// The window is revealed after it painted. A blur in that first moment is the
// pet or another window losing activation, not the user clicking away.
const BLUR_ARM_MS = 250

// A finish is reversible for a few seconds: long enough for a slip of the
// mouse to be noticed, short enough that the card never looks like a second
// task list. Main owns the deadline; the page only draws it.
const UNDO_WINDOW_MS = 8000

const isMac = process.platform === 'darwin'
const isWin = process.platform === 'win32'
const isLinux = process.platform === 'linux'
const WIN_TOPMOST_LEVEL = 'pop-up-menu'
const LINUX_WINDOW_TYPE = 'toolbar'

/**
 * The order the desk answers in: something that needs the user first, then
 * work already moving, then work that is ready, then the inbox. `assigned` is
 * routed but not started yet, so it shares the in-progress tier rather than
 * falling behind ready work. `done`/`archived` are not on the desk.
 */
const STATUS_ORDER: Partial<Record<TaskStatus, number>> = {
  needs_you: 0,
  in_progress: 1,
  assigned: 1,
  ready: 2,
  inbox: 3,
}

let briefWin: BrowserWindow | null = null
let revealTimer: NodeJS.Timeout | null = null
let blurArmedAt = 0
let ipcRegistered = false
let lastAnchor: ClawdTaskBriefAnchor | null = null
/** Window to hand focus back to on an explicit close (not a click-away). */
let previousFocus: BrowserWindow | null = null
/**
 * True from the moment a row action arrives until the window is gone. The
 * action focuses AIPA, which blurs this window; without the guard the blur
 * handler could destroy the window before the click-through is delivered.
 */
let actionInFlight = false
/** The summon chord the factory actually claimed, for the footer hint. */
let claimedShortcut = ''

/**
 * The single live offer from the most recent reversible row action — a finish,
 * a repeating finish, or a due-day move. Any one replaces whatever was there
 * before, any other action drops it, and the timer drops it on its own. Keeping
 * it in one module-level slot is what makes "only the most recent action" true:
 * there is nowhere for an older offer to hide, and the card never stacks two
 * Undo lines.
 */
interface UndoOfferBase {
  taskId: string
  title: string
  expiresAt: number
}

interface DoneUndoOffer extends UndoOfferBase {
  kind: 'done'
  previous: TaskStatus
  /**
   * Why a `needs_you` task was waiting, captured before Done overwrote that
   * status event. The reason lives only on the latest `status_changed` detail,
   * so restoring the status without it would bring the row back unable to say
   * what it is waiting for.
   */
  reason?: string
}

interface DeferUndoOffer extends UndoOfferBase {
  kind: 'defer'
  /**
   * The exact day the task carried before the move. Absent means the task had
   * no due day at all, and Undo must restore that state rather than inventing
   * one from today's date.
   */
  previousDueOn?: string
  /**
   * The day this offer's own write applied (tomorrow at the moment of the
   * press). Undo only puts `previousDueOn` back while the task still carries
   * this day: a day set by another surface since then is newer intent, and
   * replacing it with the old one would silently undo an edit the user made
   * after this action.
   */
  appliedDueOn: string
}

interface RepeatUndoOffer extends UndoOfferBase {
  kind: 'repeat'
  /**
   * The exact day the finished occurrence was owed on. Absent means the task
   * had no due day, so the series started from tomorrow; Undo must put that
   * absence back rather than inventing a day.
   */
  previousDueOn?: string
  /**
   * The day the occurrence rolled forward to, for the line's `{when}` — and,
   * like `DeferUndoOffer.appliedDueOn`, the day the row must still carry for
   * Undo to be allowed to put the old one back.
   */
  nextDueOn: string
}

type UndoOffer = DoneUndoOffer | DeferUndoOffer | RepeatUndoOffer
let undoOffer: UndoOffer | null = null
let undoTimer: NodeJS.Timeout | null = null

// ── Payload ──────────────────────────────────────────────────────────────────

function petLanguage(): string {
  try {
    return getClawdLanguage() || 'en'
  } catch {
    return 'en'
  }
}

function petTheme(): ClawdBriefTheme {
  try {
    return getPref('petBubbleTheme') === 'clawd' ? 'clawd' : 'sao'
  } catch {
    return 'sao'
  }
}

/**
 * Forget the current offer. Safe to call any number of times: the timer is the
 * only side effect, and a stale timer firing later must not clear a newer
 * offer, so the timer callback also checks that it still owns the slot.
 */
function clearUndoOffer(): void {
  if (undoTimer) {
    clearTimeout(undoTimer)
    undoTimer = null
  }
  undoOffer = null
}

/** Arm the one offer and close the window when it runs out. */
function armUndoOffer(offer: UndoOffer): void {
  clearUndoOffer()
  undoOffer = offer
  const remaining = Math.max(0, offer.expiresAt - Date.now())
  undoTimer = setTimeout(() => {
    // A newer finish replaces the timer along with the offer; this guard only
    // matters if the timer callback was already queued when that happened.
    if (undoOffer === offer) undoOffer = null
    undoTimer = null
  }, remaining)
  undoTimer.unref?.()
}

/**
 * The offer, but only while it is really live. The renderer hides the line on
 * its own timer; this is the authority for whether an Undo may still write.
 */
function liveUndoOffer(): UndoOffer | null {
  if (!undoOffer) return null
  if (Date.now() >= undoOffer.expiresAt) {
    clearUndoOffer()
    return null
  }
  return undoOffer
}

function briefLabels(): Record<string, string> {
  return {
    eyebrow: petT('taskBriefEyebrow'),
    openTasks: petT('taskBriefOpenTasks'),
    empty: petT('taskBriefEmpty'),
    unassigned: petT('taskBriefUnassigned'),
    materials: petT('taskBriefMaterials'),
    materialOne: petT('taskBriefMaterialOne'),
    close: petT('taskBriefClose'),
    needsYou: petT('taskBriefStatusNeedsYou'),
    inProgress: petT('taskBriefStatusInProgress'),
    assigned: petT('taskBriefStatusAssigned'),
    ready: petT('taskBriefStatusReady'),
    inbox: petT('taskBriefStatusInbox'),
    shortcutHint: petT('taskBriefShortcutHint'),
    untitled: petT('taskBriefUntitled'),
    justNow: petT('taskBriefJustNow'),
    // The quiet range line beside the count: which of the desk's tasks the
    // number chords name ("1–4 of 9"), and the word appended when the card is
    // too short to show them all. {start}/{end}/{total} are filled by the page.
    range: petT('taskBriefRange'),
    scroll: petT('taskBriefScroll'),
    // The due marker's words. A short future date is formatted by the page
    // from the stored day, so only the named states live in the table.
    dueToday: petT('taskBriefDueToday'),
    dueTomorrow: petT('taskBriefDueTomorrow'),
    dueLate: petT('taskBriefDueLate'),
    start: petT('taskBriefStart'),
    startHint: petT('taskBriefStartHint'),
    done: petT('taskBriefDone'),
    doneHint: petT('taskBriefDoneHint'),
    doneFailed: petT('taskBriefDoneFailed'),
    doneUndelivered: petT('taskBriefDoneUndelivered'),
    // Pushing a due day is the second reversible row action. Its marker turns
    // into a button, so the label and hint name the action; the line names the
    // task it was moved for, exactly like the Done line does.
    deferLabel: petT('taskBriefDeferLabel'),
    deferHint: petT('taskBriefDeferHint'),
    deferFailed: petT('taskBriefDeferFailed'),
    deferLine: petT('taskBriefDeferLine'),
    deferUndoFailed: petT('taskBriefDeferUndoFailed'),
    // The repeating finish keeps its row, so its line names the day it moved
    // to. {when} is that day in the page's marker words, filled by the page
    // because only it owns the date formatter.
    repeatLine: petT('taskBriefRepeatLine'),
    repeatUndoFailed: petT('taskBriefRepeatUndoFailed'),
    undoLine: petT('taskBriefUndoLine'),
    undo: petT('taskBriefUndo'),
    undoFailed: petT('taskBriefUndoFailed'),
    undoUndelivered: petT('taskBriefUndoUndelivered'),
  }
}

/**
 * Department names are renderer-owned; main keeps a snapshot of the tree for
 * scheduled runs. Reading that same snapshot here is what lets the card name a
 * task's department without a second copy of the org tree.
 */
function departmentNames(): Map<string, string> {
  const names = new Map<string, string>()
  try {
    const snapshot = readDeptHandbookSnapshot()
    for (const entry of snapshot?.departments ?? []) names.set(entry.id, entry.name)
  } catch (err) {
    log.warn('Could not read the department snapshot:', err)
  }
  return names
}

/** The conversation a row should open: the last one that ran on the task. */
function latestSessionId(task: TaskRecord): string | undefined {
  let latest: { sessionId: string; startedAt: number } | null = null
  for (const session of task.sessions) {
    if (!latest || session.startedAt >= latest.startedAt) latest = session
  }
  return latest?.sessionId
}

/**
 * The reason a status carries, as recorded by `updateTask`.
 *
 * A status reason is stored on the event as `<from> -> <to> | <note>`; the
 * prefix is the store's, not the card's. Only the *latest* status change may
 * speak: a task that was waiting on an error, ran again and came back with no
 * reason must not keep showing the old error, because that would explain a
 * state it is no longer in. So a note from an older transition — or on a
 * transition that did not land on `needs_you` — yields nothing.
 */
function statusNote(task: TaskRecord): string | undefined {
  for (let i = task.history.length - 1; i >= 0; i--) {
    const event = task.history[i]
    if (event.kind !== 'status_changed' || !event.detail) continue
    const separator = event.detail.indexOf(' | ')
    const transition = separator === -1 ? event.detail : event.detail.slice(0, separator)
    if (!transition.endsWith(' -> needs_you')) return undefined
    if (separator === -1) return undefined
    const note = event.detail.slice(separator + ' | '.length).trim()
    return note || undefined
  }
  return undefined
}

/**
 * On-desk order. The status sections are unchanged; *inside* one section dated
 * work comes first, soonest first, and undated work follows in the order it
 * already had (newest activity). Two rows due the same day keep that same
 * newest-activity order, so a tie never reshuffles itself between paints.
 */
function activeTasks(tasks: TaskView[]): TaskView[] {
  return tasks
    .filter(task => STATUS_ORDER[task.status] !== undefined)
    .sort((a, b) => {
      const rank = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99)
      if (rank !== 0) return rank
      if (a.dueOn && b.dueOn) {
        if (a.dueOn !== b.dueOn) return a.dueOn < b.dueOn ? -1 : 1
        return b.updatedAt - a.updatedAt
      }
      if (a.dueOn) return -1
      if (b.dueOn) return 1
      return b.updatedAt - a.updatedAt
    })
}

function toItem(task: TaskView, departments: Map<string, string>): ClawdTaskBriefItem {
  const sessionId = latestSessionId(task)
  // Only a waiting task can have a reason: the note exists to explain the
  // needs-you state, not to annotate history on rows that have moved on.
  const reason = task.status === 'needs_you' ? statusNote(task) : undefined
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    // A routed task whose node is missing from the snapshot shows no department
    // at all: the id is an internal key, and printing it next to a title reads
    // as noise rather than as a fact about the work.
    department: task.departmentId ? (departments.get(task.departmentId) ?? '') : '',
    materials: task.materials.length,
    updatedAt: task.updatedAt,
    ...(reason ? { reason } : {}),
    // Passed through untouched: the page decides how a day should read, and
    // an absent field stays absent rather than becoming an empty string.
    ...(task.dueOn ? { dueOn: task.dueOn } : {}),
    ...(sessionId ? { sessionId } : {}),
  }
}

function buildPayload(): ClawdTaskBriefPayload {
  let tasks: TaskView[] = []
  try {
    tasks = listTasks()
  } catch (err) {
    log.warn('Could not list tasks:', err)
  }
  const departments = departmentNames()
  const active = activeTasks(tasks)
  const offer = liveUndoOffer()
  // The whole desk travels. The window's cap and the list's scroll are the
  // only reasons a row is out of view, so the count and the rows it describes
  // can never disagree.
  const items = active.map(task => toItem(task, departments))
  return {
    tasks: items,
    total: items.length,
    lang: petLanguage(),
    theme: petTheme(),
    labels: briefLabels(),
    shortcut: claimedShortcut,
    ...(offer
      ? {
          undo: {
            id: offer.taskId,
            title: offer.title,
            kind: offer.kind,
            ...(offer.kind === 'done' ? { previous: offer.previous } : {}),
            // Only the repeat offer has a forward day: the page names it in
            // the line, while Undo itself restores `previousDueOn` in main.
            ...(offer.kind === 'repeat' ? { nextDueOn: offer.nextDueOn } : {}),
            expiresAt: offer.expiresAt,
          },
        }
      : {}),
  }
}

function emptyPayload(): ClawdTaskBriefPayload {
  return {
    tasks: [],
    total: 0,
    lang: 'en',
    theme: 'sao',
    labels: briefLabels(),
    shortcut: claimedShortcut,
  }
}

// ── Geometry ────────────────────────────────────────────────────────────────

function isSender(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): boolean {
  if (!briefWin || briefWin.isDestroyed()) return false
  return BrowserWindow.fromWebContents(event.sender) === briefWin
}

function toRect(anchor: ClawdTaskBriefAnchor): Electron.Rectangle {
  return {
    x: Math.round(anchor.x),
    y: Math.round(anchor.y),
    width: Math.round(anchor.width),
    height: Math.round(anchor.height),
  }
}

/** Validate an anchor coming from IPC/JS: finite numbers, real size. */
function normalizeAnchor(anchor?: ClawdTaskBriefAnchor | null): ClawdTaskBriefAnchor | null {
  if (!anchor || typeof anchor !== 'object') return null
  const { x, y, width, height } = anchor
  if (![x, y, width, height].every(value => typeof value === 'number' && Number.isFinite(value))) return null
  if (width <= 0 || height <= 0) return null
  return { x, y, width, height }
}

function workAreaFor(anchor: ClawdTaskBriefAnchor | null): Electron.Rectangle {
  try {
    const display = anchor
      ? screen.getDisplayMatching(toRect(anchor))
      : screen.getPrimaryDisplay()
    return display.workArea
  } catch {
    // Electron's screen module is unavailable in harnesses; a sane fallback
    // keeps positioning deterministic instead of throwing out of open().
    return { x: 0, y: 0, width: 1280, height: 800 }
  }
}

/**
 * Clamp one axis inside the work area. A work area smaller than the panel pins
 * to the top-left edge rather than producing a negative range.
 */
function clampAxis(value: number, areaStart: number, areaSize: number, size: number): number {
  const min = areaStart + EDGE_MARGIN
  const max = areaStart + areaSize - size - EDGE_MARGIN
  if (max < min) return areaStart + Math.round(Math.min(EDGE_MARGIN, Math.max(0, areaSize - size) / 2))
  return Math.round(Math.max(min, Math.min(max, value)))
}

/**
 * The tallest the card may get on this display. The content ceiling is the
 * maximum; the work area (which already excludes the taskbar) only lowers it,
 * so the card can never extend under the taskbar or off the screen. A very
 * short display therefore scrolls sooner instead of being cut off.
 */
function maxHeightFor(area: Electron.Rectangle): number {
  const room = Math.max(MIN_HEIGHT, area.height - EDGE_MARGIN * 2)
  return Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, room))
}

/**
 * Place the panel beside the pet: left first (the pet usually sits at the
 * bottom-right), then right, then above/below when both sides are too narrow.
 * Clamping is per-axis against the work area nearest the anchor, so a pet on a
 * secondary monitor is never answered by a panel on the primary one.
 * Without an anchor the panel opens centre-right of the primary display.
 */
function computeBounds(
  anchor: ClawdTaskBriefAnchor | null,
  height: number,
): Electron.Rectangle {
  const area = workAreaFor(anchor)
  const h = Math.max(MIN_HEIGHT, Math.min(maxHeightFor(area), Math.round(height)))

  if (!anchor) {
    return {
      x: clampAxis(area.x + area.width - WIDTH - 24, area.x, area.width, WIDTH),
      y: clampAxis(area.y + Math.round((area.height - h) / 2), area.y, area.height, h),
      width: WIDTH,
      height: h,
    }
  }

  const petLeft = Math.round(anchor.x)
  const petRight = Math.round(anchor.x + anchor.width)
  const petTop = Math.round(anchor.y)
  const petBottom = Math.round(anchor.y + anchor.height)
  const petCenterY = Math.round(anchor.y + anchor.height / 2)
  const areaRight = area.x + area.width
  const areaBottom = area.y + area.height

  let x: number
  let y: number

  const fitsLeft = petLeft - PET_GAP - WIDTH >= area.x + EDGE_MARGIN
  const fitsRight = petRight + PET_GAP + WIDTH <= areaRight - EDGE_MARGIN

  if (fitsLeft) {
    x = petLeft - PET_GAP - WIDTH
    y = petCenterY - Math.round(h / 2)
  } else if (fitsRight) {
    x = petRight + PET_GAP
    y = petCenterY - Math.round(h / 2)
  } else {
    // No horizontal room: try above, then below, then centre over the pet.
    x = Math.round(petLeft + anchor.width / 2 - WIDTH / 2)
    if (petTop - PET_GAP - h >= area.y + EDGE_MARGIN) {
      y = petTop - PET_GAP - h
    } else if (petBottom + PET_GAP + h <= areaBottom - EDGE_MARGIN) {
      y = petBottom + PET_GAP
    } else {
      y = petCenterY - Math.round(h / 2)
    }
  }

  return {
    x: clampAxis(x, area.x, area.width, WIDTH),
    y: clampAxis(y, area.y, area.height, h),
    width: WIDTH,
    height: h,
  }
}

// ── Window lifecycle ─────────────────────────────────────────────────────────

function isOpen(): boolean {
  return !!(briefWin && !briefWin.isDestroyed() && briefWin.isVisible())
}

/** The assets live next to the compiled factory: dist/main/clawd/src/. */
function assetPath(file: string): string {
  return path.join(__dirname, 'clawd', 'src', file)
}

function clearRevealTimer(): void {
  if (!revealTimer) return
  clearTimeout(revealTimer)
  revealTimer = null
}

function reveal(): void {
  if (!briefWin || briefWin.isDestroyed() || briefWin.isVisible()) return
  clearRevealTimer()

  const focused = BrowserWindow.getFocusedWindow()
  previousFocus = focused && focused !== briefWin ? focused : null

  try {
    briefWin.show()
    briefWin.focus()
  } catch (err) {
    log.warn('Could not reveal task brief:', err)
    destroyWindow(false)
    return
  }
  blurArmedAt = Date.now() + BLUR_ARM_MS
  if (isWin) {
    try { briefWin.setAlwaysOnTop(true, WIN_TOPMOST_LEVEL) } catch { /* not fatal */ }
  }
}

/**
 * Destroy the window. Destroy rather than hide: the next open starts from a
 * clean renderer, so a stale payload or a stuck selection cannot survive a
 * cycle.
 *
 * `restoreFocus` is false on click-away and on an action that already chose
 * where focus belongs (a conversation, or the Tasks view).
 */
function destroyWindow(restoreFocus: boolean): void {
  clearRevealTimer()
  // The offer lives exactly as long as the card that shows it. A fresh window
  // must never open carrying an Undo the user has not seen offered.
  clearUndoOffer()
  blurArmedAt = 0
  actionInFlight = false

  const win = briefWin
  briefWin = null
  lastAnchor = null
  if (win && !win.isDestroyed()) {
    try { win.destroy() } catch (err) {
      log.warn('Could not destroy task brief:', err)
    }
  }

  const restore = previousFocus
  previousFocus = null
  if (restoreFocus && restore && !restore.isDestroyed() && restore.isVisible()) {
    try { restore.focus() } catch { /* window may be on its way out */ }
  }
}

function applyReportedHeight(rawHeight: unknown): void {
  if (!briefWin || briefWin.isDestroyed()) return
  if (typeof rawHeight !== 'number' || !Number.isFinite(rawHeight)) return

  const current = briefWin.getBounds()
  const area = workAreaFor(lastAnchor)
  // The page reports what the whole list wants; the cap (content ceiling and
  // this display's work area) decides what it gets. The page scrolls the rest.
  const height = Math.max(MIN_HEIGHT, Math.min(maxHeightFor(area), Math.round(rawHeight)))
  const x = clampAxis(current.x, area.x, area.width, WIDTH)
  // Keep the top edge stable while the panel grows; only pull it up when the
  // bottom would leave the work area.
  const y = clampAxis(current.y, area.y, area.height, height)

  if (current.x !== x || current.y !== y || current.height !== height || current.width !== WIDTH) {
    try { briefWin.setBounds({ x, y, width: WIDTH, height }) } catch { /* closing */ }
  }
  reveal()
}

function createWindow(anchor: ClawdTaskBriefAnchor | null): boolean {
  const bounds = computeBounds(anchor, MIN_HEIGHT)
  let win: BrowserWindow
  try {
    win = new BrowserWindow({
      ...bounds,
      show: false,
      frame: false,
      transparent: true,
      alwaysOnTop: !isMac,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      focusable: true,
      title: 'AIPA Task Brief',
      ...(isLinux ? { type: LINUX_WINDOW_TYPE } : {}),
      ...(isMac ? { type: 'panel', roundedCorners: false } : {}),
      webPreferences: {
        preload: assetPath('preload-task-brief.js'),
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false,
      },
    })
  } catch (err) {
    log.warn('Task brief window creation failed:', err)
    briefWin = null
    return false
  }

  briefWin = win
  try { win.setMenuBarVisibility(false) } catch { /* mac panels have no menu bar */ }
  if (isWin) {
    try { win.setAlwaysOnTop(true, WIN_TOPMOST_LEVEL) } catch { /* not fatal */ }
  }
  if (isLinux) {
    try { win.setSkipTaskbar(true) } catch { /* not fatal */ }
  }

  win.on('blur', () => {
    // Click-away. An early blur belongs to the reveal, and a row action is
    // already focusing what the user picked — neither should close the card
    // before that click-through is delivered.
    if (actionInFlight) return
    if (Date.now() < blurArmedAt) return
    destroyWindow(false)
  })
  win.on('closed', () => {
    clearRevealTimer()
    if (briefWin === win) briefWin = null
    previousFocus = null
  })

  win.webContents.on('did-fail-load', (_event, _code, _desc, _url, isMainFrame) => {
    if (isMainFrame === false) return
    log.warn('Task brief failed to load')
    destroyWindow(false)
  })
  win.webContents.on('render-process-gone', () => destroyWindow(false))

  void win.loadFile(assetPath('task-brief.html')).catch((err: unknown) => {
    log.warn('Task brief loadFile rejected:', err)
    destroyWindow(false)
  })

  // If the renderer never reports its height, still show at the initial size
  // rather than leaving an invisible focused window over the desktop.
  revealTimer = setTimeout(() => {
    revealTimer = null
    reveal()
  }, REVEAL_TIMEOUT_MS)
  revealTimer.unref?.()

  return true
}

// ── Actions ─────────────────────────────────────────────────────────────────

/** What AIPA should show once it has focus. At most one is sent. */
interface AipaTarget {
  /** Open this conversation. */
  sessionId?: string
  /** Open this task's work; the renderer resolves the record itself. */
  taskId?: string
  /**
   * Start this task's work: the renderer opens a chat tab in the task folder
   * with the brief pre-filled in the composer. Nothing is sent, exactly like
   * pressing Dispatch in AIPA.
   */
  startTaskId?: string
  /** Land on the Tasks view (used when there is nothing specific to open). */
  openTasks?: boolean
}

function sendAipaTarget(webContents: Electron.WebContents, target: AipaTarget): void {
  if (target.sessionId) webContents.send('menu:openSession', target.sessionId)
  else if (target.taskId) webContents.send('menu:openTask', target.taskId)
  else if (target.startTaskId) webContents.send('menu:startTask', target.startTaskId)
  else if (target.openTasks) webContents.send('menu:openTasks')
}

/**
 * Focus AIPA and hand it one navigation event. Returns false when the main
 * window is gone, so the caller can keep the brief up instead of closing onto
 * an unchanged desktop.
 */
function focusAipa(target: AipaTarget): boolean {
  let handled = false
  try {
    withClawdMainWindow(win => {
      handled = true
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
      sendAipaTarget(win.webContents, target)
    })
  } catch { /* fall through to the window scan */ }

  if (handled) return true

  try {
    const windows = BrowserWindow.getAllWindows().filter(candidate =>
      candidate !== briefWin && !candidate.isDestroyed())
    const found =
      windows.find(candidate => candidate.getTitle() === 'AIPA') ??
      windows.find(candidate => candidate.isVisible())
    if (!found) return false
    if (found.isMinimized()) found.restore()
    found.show()
    found.focus()
    sendAipaTarget(found.webContents, target)
    return true
  } catch (err) {
    log.warn('Could not focus AIPA for the task brief:', err)
    return false
  }
}

/**
 * Tell AIPA's renderer the store changed, the same way the capture bar and
 * notice centre do after mutating it. Guarded by `withClawdMainWindow`: a pet
 * running with AIPA closed simply has nowhere to send, and the card reports
 * that rather than pretending the app's list is current.
 */
function notifyTasksChanged(): boolean {
  let sent = false
  withClawdMainWindow(win => {
    if (win.webContents.isDestroyed()) return
    win.webContents.send('tasks:changed')
    sent = true
  })
  return sent
}

function withError(payload: ClawdTaskBriefPayload, message: string): ClawdTaskBriefPayload {
  return message ? { ...payload, error: message } : payload
}

/**
 * Tomorrow as a local `YYYY-MM-DD` day.
 *
 * The date is built from local calendar fields — `new Date(y, m, d + 1)` —
 * rather than by adding 24 hours to tonight's instant. The constructor carries
 * month and year rollover, and on a DST change day an instant plus 86400000
 * can still land on the same calendar day (or skip the next one), which would
 * silently write yesterday's or the wrong tomorrow into the store.
 */
function tomorrowLocalDay(): string {
  const today = new Date()
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  const month = String(tomorrow.getMonth() + 1).padStart(2, '0')
  const day = String(tomorrow.getDate()).padStart(2, '0')
  return `${tomorrow.getFullYear()}-${month}-${day}`
}

/**
 * Put back what the most recent reversible action changed.
 *
 * The offer itself is the permission slip: it is consumed before the first
 * store read, so a double press or a replay of the same action can only find
 * nothing and return the current card. A task that has moved on since the
 * action (archived elsewhere, restored by another surface, or given a
 * different due day in AIPA) is not silently overwritten — the row is a
 * different row by now, and restoring would erase an edit made after the
 * action — so the card states that the restore did not land instead.
 */
function handleUndo(): ClawdTaskBriefPayload {
  const offer = liveUndoOffer()
  if (!offer) {
    // Expired, already used, or never offered: the line is gone, so there is
    // nothing to say. In particular this keeps a second Undo from writing.
    return buildPayload()
  }
  clearUndoOffer()

  let task: TaskView | undefined
  try {
    task = listTasks().find(item => item.id === offer.taskId)
  } catch (err) {
    log.warn('Could not look up a task to restore:', err)
  }
  if (!task) {
    // Gone between the action and Undo: restoring would claim a return the
    // store no longer agrees with. The line names which action it was
    // offering, so the failure can too.
    const failed = offer.kind === 'defer'
      ? 'taskBriefDeferUndoFailed'
      : offer.kind === 'repeat'
        ? 'taskBriefRepeatUndoFailed'
        : 'taskBriefUndoFailed'
    return withError(buildPayload(), petT(failed))
  }

  if (offer.kind === 'defer' || offer.kind === 'repeat') {
    // Undo may only claim the row its own write produced. A different day set
    // by another surface since the action is newer intent: restoring the old
    // one would silently replace an edit the user just made. A row that left
    // the desk is likewise no longer the row the offer describes.
    const appliedDueOn = offer.kind === 'defer' ? offer.appliedDueOn : offer.nextDueOn
    if (STATUS_ORDER[task.status] === undefined || task.dueOn !== appliedDueOn) {
      return withError(
        buildPayload(),
        petT(offer.kind === 'repeat' ? 'taskBriefRepeatUndoFailed' : 'taskBriefDeferUndoFailed'),
      )
    }

    // A due day is a stored calendar day, not a status. Both offers carry the
    // exact prior value, and "no due day" must go back as an absent field, not
    // as today's date: the store clears on `null`, while omitting the patch
    // field would mean "leave it alone" and make Undo a silent no-op.
    let mutation: ReturnType<typeof updateTask> | null = null
    try {
      mutation = updateTask(offer.taskId, { dueOn: offer.previousDueOn ?? null })
    } catch (err) {
      log.warn('Could not restore a task due day:', err)
    }
    if (!mutation || !mutation.ok) {
      return withError(
        buildPayload(),
        petT(offer.kind === 'repeat' ? 'taskBriefRepeatUndoFailed' : 'taskBriefDeferUndoFailed'),
      )
    }

    const notified = notifyTasksChanged()
    // The store changed here too, so the pet's badge must re-count it.
    try { refreshClawdTaskBadge() } catch { /* pet gone */ }
    return notified ? buildPayload() : withError(buildPayload(), petT('taskBriefUndoUndelivered'))
  }

  if (task.status !== 'done') {
    // Gone, archived, or changed by another surface between Done and Undo:
    // restoring would claim a return that the store no longer agrees with.
    return withError(buildPayload(), petT('taskBriefUndoFailed'))
  }

  let mutation: ReturnType<typeof updateTask> | null = null
  try {
    // Restoring `needs_you` restores its reason too, or the row comes back
    // saying it waits on the user but no longer saying why. The store only
    // records a note alongside an actual status change, which this is.
    mutation = updateTask(offer.taskId, {
      status: offer.previous,
      ...(offer.previous === 'needs_you' && offer.reason ? { note: offer.reason } : {}),
    })
  } catch (err) {
    log.warn('Could not restore a finished task:', err)
  }
  if (!mutation || !mutation.ok) {
    return withError(buildPayload(), petT('taskBriefUndoFailed'))
  }

  const notified = notifyTasksChanged()
  // Same companion refresh the Done path performs; the store changed here too.
  try { refreshClawdTaskBadge() } catch { /* pet gone */ }

  const payload = buildPayload()
  if (!notified) payload.error = petT('taskBriefUndoUndelivered')
  return payload
}

function handleAction(action: unknown): ClawdTaskBriefPayload {
  const input = (action && typeof action === 'object' ? action : {}) as BriefAction
  const type = typeof input.type === 'string' ? input.type as BriefActionType : null
  const id = typeof input.id === 'string' ? input.id : ''

  // Only a finish may create an offer, and only Undo may consume one. Every
  // other gesture is a different intent, so the previous offer stops being the
  // most recent thing the user did. Done clears here too and re-arms only if
  // the write really landed. A defer is guarded inside its own case instead:
  // a press on a row already due tomorrow writes nothing, so it must not cost
  // the user the offer an earlier action is still standing behind.
  if (type !== 'done' && type !== 'undo' && type !== 'defer') clearUndoOffer()

  switch (type) {
    case 'open': {
      actionInFlight = true
      let task: TaskView | undefined
      try {
        task = id ? listTasks().find(item => item.id === id) : undefined
      } catch (err) {
        log.warn('Could not look up a task to open:', err)
      }
      if (!task) {
        // The row's task disappeared between paint and click. Keep the card up
        // with a fresh payload instead of closing onto nothing.
        actionInFlight = false
        return emitUpdate()
      }
      // A row with a conversation opens that task's work (the renderer also
      // selects the record); one still waiting for its first turn has nothing
      // to open, so the Tasks list is the honest destination. Opening a draft
      // from here would turn a glance at the card into an unsent message.
      const focused = latestSessionId(task)
        ? focusAipa({ taskId: task.id })
        : focusAipa({ openTasks: true })
      if (focused) destroyWindow(false)
      else { actionInFlight = false; emitUpdate() }
      return buildPayload()
    }
    case 'start': {
      actionInFlight = true
      let task: TaskView | undefined
      try {
        task = id ? listTasks().find(item => item.id === id) : undefined
      } catch (err) {
        log.warn('Could not look up a task to start:', err)
      }
      if (!task) {
        // Same race as 'open': the row's task vanished between paint and click.
        // Keep the card up with a fresh payload instead of closing onto nothing.
        actionInFlight = false
        return emitUpdate()
      }
      // Starting work is Dispatch from the card: the renderer opens a task chat
      // tab with the brief in the composer and sends nothing. The card closes
      // only once AIPA actually accepted the hand-off.
      if (focusAipa({ startTaskId: task.id })) destroyWindow(false)
      else { actionInFlight = false; emitUpdate() }
      return buildPayload()
    }
    case 'done': {
      // Finishing is the one row action that does not leave this card: the
      // user may want to clear several rows in a row. Store first, then tell
      // AIPA, then rebuild the payload the page will paint. The previous offer
      // — if any — is dropped here: this finish replaces it whether or not the
      // write lands.
      clearUndoOffer()
      let task: TaskView | undefined
      try {
        task = id ? listTasks().find(item => item.id === id) : undefined
      } catch (err) {
        log.warn('Could not look up a task to finish:', err)
      }
      if (!task) {
        // Gone between paint and click. Nothing in the store changed, so the
        // row must not look finished and no Undo is offered.
        return withError(buildPayload(), petT('taskBriefDoneFailed'))
      }

      // Already finished elsewhere, or this is the second click of a double
      // click that landed before the row collapsed. There is nothing to
      // finish and — crucially — nothing to undo, so no offer is armed; a
      // `done -> done` write is a no-op in the store, and an Undo built on it
      // would visibly do nothing while claiming the row had just finished.
      if (task.status === 'done' || task.status === 'archived') {
        return buildPayload()
      }

      // Captured before the write: this is the exact status the task had when
      // the user pressed Done, including `needs_you`, which no history lookup
      // would have to reconstruct.
      const previous = task.status
      // A waiting task's reason lives only on its latest `status_changed`
      // event; a real Done replaces that event, so it has to be carried into
      // the offer or Undo cannot put the row back as it was. A repeating task
      // keeps its status, so there is no replaced event and nothing to read.
      const reason = !task.repeat && previous === 'needs_you' ? statusNote(task) : undefined

      let mutation: ReturnType<typeof updateTask> | null = null
      try {
        mutation = updateTask(task.id, { status: 'done' })
      } catch (err) {
        log.warn('Could not finish a task:', err)
      }
      if (!mutation || !mutation.ok) {
        // A refused write leaves the row exactly as it was, and offered nothing.
        return withError(buildPayload(), petT('taskBriefDoneFailed'))
      }

      // A repeating task answers Done by rolling the occurrence forward, not
      // by finishing: the store kept the status and moved the day. The row
      // stays on the card, so the offer puts the old day back and the page
      // must not collapse it — hence no `finished` below.
      if (mutation.repeated) {
        armUndoOffer({
          kind: 'repeat',
          taskId: task.id,
          title: task.title,
          ...(mutation.repeated.previousDueOn ? { previousDueOn: mutation.repeated.previousDueOn } : {}),
          nextDueOn: mutation.repeated.nextDueOn,
          expiresAt: Date.now() + UNDO_WINDOW_MS,
        })
      } else {
        armUndoOffer({
          kind: 'done',
          taskId: task.id,
          title: task.title,
          previous,
          ...(reason ? { reason } : {}),
          expiresAt: Date.now() + UNDO_WINDOW_MS,
        })
      }

      const notified = notifyTasksChanged()
      // This path writes the store directly, so it never passes through the
      // IPC broadcast closure that normally refreshes the pet's badge.
      try { refreshClawdTaskBadge() } catch { /* pet gone */ }

      const payload = buildPayload()
      // Only a real finish removes the row. A repeat finish leaves it under
      // its new day, so the page repaints in place and keeps focus there.
      if (!mutation.repeated) payload.finished = task.id
      if (!notified) payload.error = petT('taskBriefDoneUndelivered')
      return payload
    }
    case 'defer': {
      // Moving a due day is reversible but, unlike Done, the row stays on the
      // card: the fresh payload re-sorts it under its new day and the quiet
      // line offers the old day back.
      let task: TaskView | undefined
      try {
        task = id ? listTasks().find(item => item.id === id) : undefined
      } catch (err) {
        log.warn('Could not look up a task to defer:', err)
      }
      if (!task) {
        // Gone between paint and click. Nothing changed, so nothing is offered.
        return withError(buildPayload(), petT('taskBriefDeferFailed'))
      }
      // The brief only shows on-desk work. A task finished or archived while the
      // card was up has already left the desk; moving its day would be a write
      // the user cannot see, so fail quietly rather than resurrect a row.
      if (STATUS_ORDER[task.status] === undefined) {
        return withError(buildPayload(), petT('taskBriefDeferFailed'))
      }

      // Captured before the write: `undefined` means the task had no due day,
      // and Undo must be able to restore that exact absence.
      const previousDueOn = task.dueOn
      const tomorrow = tomorrowLocalDay()
      // Already tomorrow: the store would record no change and an Undo built on
      // it would visibly do nothing while claiming the day had moved. Same rule
      // as pressing Done on a task that is already done. This is checked before
      // the previous offer is dropped, because a stale page (or a keyboard-driven
      // press racing the repaint) may still send this gesture; writing nothing
      // must not also take away the Undo line an earlier action earned.
      if (previousDueOn === tomorrow) return buildPayload()

      // The gesture really moves the row, replacing whatever offer came before;
      // a stale offer must not outlive the action that replaced it.
      clearUndoOffer()

      let mutation: ReturnType<typeof updateTask> | null = null
      try {
        mutation = updateTask(task.id, { dueOn: tomorrow })
      } catch (err) {
        log.warn('Could not move a task due day:', err)
      }
      if (!mutation || !mutation.ok) {
        // A refused write leaves the row exactly as it was, and offers nothing.
        return withError(buildPayload(), petT('taskBriefDeferFailed'))
      }

      armUndoOffer({
        kind: 'defer',
        taskId: task.id,
        title: task.title,
        ...(previousDueOn ? { previousDueOn } : {}),
        // The day this write landed on, so Undo can tell whether the row is
        // still the one this offer describes.
        appliedDueOn: tomorrow,
        expiresAt: Date.now() + UNDO_WINDOW_MS,
      })

      notifyTasksChanged()
      // This path writes the store directly, so it never passes through the
      // IPC broadcast closure that normally refreshes the pet's badge.
      try { refreshClawdTaskBadge() } catch { /* pet gone */ }

      return buildPayload()
    }
    case 'undo':
      return handleUndo()
    case 'open-tasks': {
      actionInFlight = true
      if (focusAipa({ openTasks: true })) destroyWindow(false)
      else { actionInFlight = false; emitUpdate() }
      return buildPayload()
    }
    case 'close':
      destroyWindow(true)
      return buildPayload()
    default:
      return buildPayload()
  }
}

function emitUpdate(payload: ClawdTaskBriefPayload = buildPayload()): ClawdTaskBriefPayload {
  if (briefWin && !briefWin.isDestroyed()) {
    try { briefWin.webContents.send('task-brief:update', payload) } catch { /* closing */ }
  }
  return payload
}

// ── IPC ──────────────────────────────────────────────────────────────────────

/**
 * Register the channels exactly once. A second call is a no-op: the
 * listener-based channels (height, close) would otherwise accumulate.
 */
function ensureIpc(): void {
  if (ipcRegistered) return
  ipcRegistered = true

  safeHandle('task-brief:load', (event: Electron.IpcMainInvokeEvent) => {
    if (!isSender(event)) return emptyPayload()
    // A (re)load is a fresh paint, not the answer to the finish; an offer from
    // before it is no longer the most recent action.
    clearUndoOffer()
    return buildPayload()
  })

  safeHandle('task-brief:action', (event: Electron.IpcMainInvokeEvent, action: unknown) => {
    if (!isSender(event)) return emptyPayload()
    return handleAction(action)
  })

  ipcMain.on('task-brief:report-height', (event: Electron.IpcMainEvent, height: unknown) => {
    if (!isSender(event)) return
    applyReportedHeight(height)
  })

  ipcMain.on('task-brief:close', (event: Electron.IpcMainEvent) => {
    if (!isSender(event)) return
    destroyWindow(true)
  })
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Set the summon chord the pet factory actually claimed. An empty string means
 * no chord was available; the footer hint then stays hidden rather than naming
 * a shortcut that does nothing. The chord is stored display-ready.
 */
export function setClawdTaskBriefShortcut(chord: string): void {
  claimedShortcut = typeof chord === 'string' && chord
    // `CommandOrControl` is the accelerator spelling; the hint names the key
    // the user actually presses. On macOS that is Cmd, everywhere else Ctrl.
    ? chord.replace(/^CommandOrControl/, isMac ? 'Cmd' : 'Ctrl').replace(/^Control/, 'Ctrl')
    : ''
}

/**
 * Open the task brief beside the pet, or refresh and focus the existing
 * instance. `anchor` is the pet's screen rectangle; omit it to open
 * centre-right of the primary display.
 *
 * Returns false only when a window could not be created at all. A page that
 * later fails to load closes itself.
 */
export function openClawdTaskBrief(anchor?: ClawdTaskBriefAnchor): boolean {
  ensureIpc()
  const normalized = normalizeAnchor(anchor ?? null)
  if (normalized) lastAnchor = normalized

  try {
    if (briefWin && !briefWin.isDestroyed()) {
      // One instance only. Refresh the payload, then focus; re-creating would
      // reset the row order under the user's cursor. A summon is a fresh
      // intent that has nothing to do with the previous finish, so it drops
      // an offer still waiting in the card.
      clearUndoOffer()
      const bounds = computeBounds(lastAnchor, briefWin.getBounds().height)
      try { briefWin.setBounds(bounds) } catch { /* closing */ }
      emitUpdate()
      if (briefWin.isVisible()) {
        try { briefWin.focus() } catch { /* not fatal */ }
      } else {
        reveal()
      }
      return true
    }
    return createWindow(lastAnchor)
  } catch (err) {
    log.warn('openClawdTaskBrief failed:', err)
    destroyWindow(false)
    return false
  }
}

/** Close (and destroy) the brief. Safe to call when it is not open. */
export function closeClawdTaskBrief(): void {
  destroyWindow(true)
}

export function isClawdTaskBriefOpen(): boolean {
  return isOpen()
}
