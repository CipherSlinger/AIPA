/**
 * clawd-week-review.ts — the pet's "how did last week go?" card.
 *
 * The weekly review already exists as an attention bubble: one line on Monday
 * morning saying the week ended. This module is the surface behind it — the
 * card the bubble's `task-review` click opens, and the tray item that opens it
 * on demand. It reads the same aggregate the bubble speaks from
 * (`collectWeekReview`), rendered in full: the week's counts, a seven-day bar
 * strip, every finished task and the desk as it stands now.
 *
 * Shape of the thing (deliberately the same as `clawd-task-brief.ts`):
 *   - one window, created on demand and destroyed on close, because a hidden
 *     window would keep a GPU surface alive and keep answering IPC after the
 *     pet went away;
 *   - the renderer asks for `week-review:load`, paints, reports its measured
 *     height, and only then is the window revealed — no empty transparent
 *     rectangle ever sits over the desktop;
 *   - blur is click-away, but blurs during the reveal and during an in-flight
 *     action are ignored;
 *   - a finished row opens that task's latest conversation, or the task's own
 *     record on the Tasks view when it has no conversation yet;
 *   - the footer hands AIPA the Tasks view.
 *
 * The card is read-only: it never writes a task, a due day or a status. Its
 * only destination is an existing one — a conversation, a task record, or the
 * Tasks page.
 *
 * Everything is fail-open: a missing store, a display query that throws while
 * Electron is still starting, or a window that never paints must never take the
 * app down. The worst outcome is that the card does not open.
 */
import { BrowserWindow, ipcMain, screen } from 'electron'
import * as path from 'path'
import { getPref } from './config/config-manager'
import { getClawdLanguage, getClawdPetRect, withClawdMainWindow } from './clawd-integration'
import { readTaskStore } from './tasks/task-store'
import {
  collectWeekReview,
  weekStartOf,
  type WeekReviewAggregate,
} from './tasks/weekly-review'
import { safeHandle } from './ipc/register/safe-handle'
import { createLogger } from './utils/logger'

const log = createLogger('clawd-week-review')

export type ClawdWeekReviewTheme = 'sao' | 'clawd'

/** One finished task as the renderer sees it. */
export interface ClawdWeekReviewRow {
  id: string
  title: string
  /** Local `YYYY-MM-DD` of the task's last in-window completion. */
  day: string
  /** That day pre-formatted in the pet's language, weekday short, e.g. "Tue". */
  dayLabel: string
  /** Completions of this task inside the reviewed week (>= 1). */
  count: number
  /** Latest conversation on the task, when one has run. */
  sessionId?: string
}

/** One task still on the desk, with its due chip already written. */
export interface ClawdWeekReviewOpenRow {
  id: string
  title: string
  /** Local `YYYY-MM-DD` due day; absent when the task has none. */
  dueOn?: string
  /** Pre-formatted due label in the pet's language, e.g. "Fri" or "Oct 30". */
  dueLabel?: string
  /** True when `dueOn` is earlier than today. */
  overdue: boolean
  /** Whole days past due; 0 when not overdue. */
  overdueDays: number
}

/** Everything the renderer needs for one paint. */
export interface ClawdWeekReviewPayload {
  /** Pet language: "en" | "zh" | "ko". */
  lang: string
  theme: ClawdWeekReviewTheme
  /** Monday of the reviewed week, `YYYY-MM-DD`. */
  weekStart: string
  /** Sunday of the reviewed week, `YYYY-MM-DD`. */
  weekEnd: string
  /** Pre-formatted range in the pet's language, e.g. "Oct 19 – Oct 25". */
  range: string
  /** Completions (occurrences) inside the reviewed week. */
  finished: number
  /** Distinct tasks with at least one completion inside the week. */
  finishedTasks: number
  /** Completions in the week before; used for the comparison line. */
  previousFinished: number
  /** Tasks open right now (not done, not archived). */
  open: number
  /** Of those, how many are past due. */
  overdue: number
  /** Exactly 7 entries, Monday → Sunday, local calendar. */
  days: { day: string; count: number }[]
  /** All distinct finished tasks, newest completion first, ties by title. */
  rows: ClawdWeekReviewRow[]
  /** Tasks still open: past due first, then nearest due, then title. */
  openRows: ClawdWeekReviewOpenRow[]
  /** Pre-built strings; the page renders them verbatim. */
  labels: Record<string, string>
}

/** The pet's screen rectangle, in Electron's DIP screen coordinates. */
export interface ClawdWeekReviewAnchor {
  x: number
  y: number
  width: number
  height: number
}

type WeekReviewActionType = 'open' | 'open-tasks' | 'close'

interface WeekReviewAction {
  type?: unknown
  id?: unknown
}

/** The pet's string table; the card speaks the pet's language. */
const { createTranslator } = require('./clawd/src/i18n') as {
  createTranslator: (getLang: () => string) => (key: string) => string
}
const petT = createTranslator(() => {
  try { return getClawdLanguage() || 'en' } catch { return 'en' }
})

// Width is fixed; height follows the content between these bounds. The page
// reports the height its whole content wants; the window grows to meet it
// until this cap, and past the cap the page scrolls inside the card. 420 is
// wide enough for a title and a due chip, 560 tall enough for the strip, both
// lists and the footer before anything has to scroll.
const WIDTH = 420
const MIN_HEIGHT = 300
const MAX_HEIGHT = 560
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

const isMac = process.platform === 'darwin'
const isWin = process.platform === 'win32'
const isLinux = process.platform === 'linux'
const WIN_TOPMOST_LEVEL = 'pop-up-menu'
const LINUX_WINDOW_TYPE = 'toolbar'

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const LOCALES: Record<string, string> = { en: 'en-US', zh: 'zh-CN', ko: 'ko-KR' }

let weekReviewWin: BrowserWindow | null = null
let revealTimer: NodeJS.Timeout | null = null
let blurArmedAt = 0
let ipcRegistered = false
let lastAnchor: ClawdWeekReviewAnchor | null = null
/** Window to hand focus back to on an explicit close (not a click-away). */
let previousFocus: BrowserWindow | null = null
/**
 * True from the moment a row action arrives until the window is gone. The
 * action focuses AIPA, which blurs this window; without the guard the blur
 * handler could destroy the window before the click-through is delivered.
 */
let actionInFlight = false

// ── Payload ──────────────────────────────────────────────────────────────────

function petLanguage(): string {
  try {
    return getClawdLanguage() || 'en'
  } catch {
    return 'en'
  }
}

function petTheme(): ClawdWeekReviewTheme {
  try {
    return getPref('petBubbleTheme') === 'clawd' ? 'clawd' : 'sao'
  } catch {
    return 'sao'
  }
}

/** The pet translator returns raw templates; main fills their one variable. */
function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  )
}

interface CalendarDay {
  year: number
  month: number
  day: number
}

function parseDayKey(day: string): CalendarDay | null {
  const match = DAY_RE.exec(day)
  if (!match) return null
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/** Local `YYYY-MM-DD` for a moment. */
function localDayKey(nowMs: number): string {
  const date = new Date(nowMs)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** `day` moved by whole calendar days; built from fields, never milliseconds. */
function addDays(day: string, offset: number): string {
  const parsed = parseDayKey(day)
  if (!parsed) return day
  const moved = new Date(parsed.year, parsed.month - 1, parsed.day + offset)
  return `${moved.getFullYear()}-${pad2(moved.getMonth() + 1)}-${pad2(moved.getDate())}`
}

function localeFor(lang: string): string {
  return LOCALES[lang] ?? LOCALES.en
}

/**
 * A local day as a weekday short ("Tue", "周四", "화"). Intl owns the words;
 * a malformed day or a missing locale falls back to the stored day string, so
 * a paint can never throw over a date.
 */
function weekdayShort(day: string, lang: string): string {
  try {
    const parsed = parseDayKey(day)
    if (!parsed) return day
    return new Intl.DateTimeFormat(localeFor(lang), { weekday: 'short' })
      .format(new Date(parsed.year, parsed.month - 1, parsed.day))
  } catch {
    return day
  }
}

/** A local day as a short month + day ("Oct 30", "10月30日"). */
function monthDayShort(day: string, lang: string): string {
  try {
    const parsed = parseDayKey(day)
    if (!parsed) return day
    return new Intl.DateTimeFormat(localeFor(lang), { month: 'short', day: 'numeric' })
      .format(new Date(parsed.year, parsed.month - 1, parsed.day))
  } catch {
    return day
  }
}

/** "Oct 19 – Oct 25": both ends in the pet's language. */
function rangeLabel(weekStart: string, weekEnd: string, lang: string): string {
  return `${monthDayShort(weekStart, lang)} – ${monthDayShort(weekEnd, lang)}`
}

/**
 * The due chip's word for one stored day. The named near days come from the
 * label table; anything else in the current local week reads as a weekday, and
 * a day beyond it as a month + day. The page never formats a date itself.
 */
function dueLabelFor(
  day: string,
  today: string,
  labels: Record<string, string>,
  lang: string,
): string {
  if (day === today) return labels.today
  if (day === addDays(today, 1)) return labels.tomorrow
  if (day === addDays(today, -1)) return labels.yesterday

  const weekEnd = addDays(weekStartOf(today), 6)
  if (day >= weekStartOf(today) && day <= weekEnd) return weekdayShort(day, lang)
  return monthDayShort(day, lang)
}

/**
 * The label table the page renders verbatim.
 *
 * `difference` is `finished - previousFinished`; both comparison templates are
 * filled with its absolute value here, and the page picks the one that matches
 * its sign. `daysLate` is the one template left with `{n}`: a single label
 * cannot carry a different number for every row, so the page fills it from
 * that row's `overdueDays` (the row already travels with the count).
 */
function weekReviewLabels(difference: number): Record<string, string> {
  const n = Math.abs(difference)
  return {
    title: petT('weekReviewTitle'),
    finished: petT('weekReviewFinished'),
    tasks: petT('weekReviewTasks'),
    open: petT('weekReviewOpen'),
    overdue: petT('weekReviewOverdue'),
    vsMore: fmt(petT('weekReviewVsMore'), { n }),
    vsFewer: fmt(petT('weekReviewVsFewer'), { n }),
    vsSame: petT('weekReviewVsSame'),
    vsNone: petT('weekReviewVsNone'),
    finishedTitle: petT('weekReviewFinishedTitle'),
    openTitle: petT('weekReviewOpenTitle'),
    emptyFinished: petT('weekReviewEmptyFinished'),
    emptyOpen: petT('weekReviewEmptyOpen'),
    close: petT('weekReviewClose'),
    openTasks: petT('weekReviewOpenTasks'),
    today: petT('weekReviewToday'),
    tomorrow: petT('weekReviewTomorrow'),
    yesterday: petT('weekReviewYesterday'),
    daysLate: petT('weekReviewDaysLate'),
  }
}

function readAggregate(nowMs: number): WeekReviewAggregate {
  try {
    return collectWeekReview(readTaskStore().tasks, nowMs)
  } catch (err) {
    // A store that cannot be read is an empty desk, not a failed card: the
    // week still has its dates and its empty states.
    log.warn('Could not read tasks for the week review:', err)
    return collectWeekReview([], nowMs)
  }
}

function buildPayload(): ClawdWeekReviewPayload {
  const lang = petLanguage()
  const nowMs = Date.now()
  const aggregate = readAggregate(nowMs)
  const labels = weekReviewLabels(aggregate.finished - aggregate.previousFinished)
  const today = localDayKey(nowMs)

  return {
    lang,
    theme: petTheme(),
    weekStart: aggregate.weekStart,
    weekEnd: aggregate.weekEnd,
    range: rangeLabel(aggregate.weekStart, aggregate.weekEnd, lang),
    finished: aggregate.finished,
    finishedTasks: aggregate.finishedTasks,
    previousFinished: aggregate.previousFinished,
    open: aggregate.open,
    overdue: aggregate.overdue,
    days: aggregate.days,
    rows: aggregate.rows.map(row => ({
      id: row.id,
      title: row.title,
      day: row.day,
      dayLabel: weekdayShort(row.day, lang),
      count: row.count,
      // Passed through untouched: an absent conversation stays absent rather
      // than becoming an empty string the page would have to interpret.
      ...(row.sessionId ? { sessionId: row.sessionId } : {}),
    })),
    openRows: aggregate.openRows.map(row => ({
      id: row.id,
      title: row.title,
      ...(row.dueOn ? { dueOn: row.dueOn } : {}),
      ...(row.dueOn ? { dueLabel: dueLabelFor(row.dueOn, today, labels, lang) } : {}),
      overdue: row.overdue,
      overdueDays: row.overdueDays,
    })),
    labels,
  }
}

function emptyPayload(): ClawdWeekReviewPayload {
  const nowMs = Date.now()
  const aggregate = collectWeekReview([], nowMs)
  return {
    lang: 'en',
    theme: 'sao',
    weekStart: aggregate.weekStart,
    weekEnd: aggregate.weekEnd,
    range: rangeLabel(aggregate.weekStart, aggregate.weekEnd, 'en'),
    finished: 0,
    finishedTasks: 0,
    previousFinished: 0,
    open: 0,
    overdue: 0,
    days: aggregate.days,
    rows: [],
    openRows: [],
    labels: weekReviewLabels(0),
  }
}

// ── Geometry ────────────────────────────────────────────────────────────────

function isSender(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): boolean {
  if (!weekReviewWin || weekReviewWin.isDestroyed()) return false
  return BrowserWindow.fromWebContents(event.sender) === weekReviewWin
}

function toRect(anchor: ClawdWeekReviewAnchor): Electron.Rectangle {
  return {
    x: Math.round(anchor.x),
    y: Math.round(anchor.y),
    width: Math.round(anchor.width),
    height: Math.round(anchor.height),
  }
}

/** Validate an anchor coming from JS: finite numbers, real size. */
function normalizeAnchor(anchor?: ClawdWeekReviewAnchor | null): ClawdWeekReviewAnchor | null {
  if (!anchor || typeof anchor !== 'object') return null
  const { x, y, width, height } = anchor
  if (![x, y, width, height].every(value => typeof value === 'number' && Number.isFinite(value))) return null
  if (width <= 0 || height <= 0) return null
  return { x, y, width, height }
}

/** The pet's rectangle for an open-from-tray click, or null when it is gone. */
function petAnchor(): ClawdWeekReviewAnchor | null {
  try {
    return normalizeAnchor(getClawdPetRect() ?? null)
  } catch {
    return null
  }
}

function workAreaFor(anchor: ClawdWeekReviewAnchor | null): Electron.Rectangle {
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
 * so the card can never extend under the taskbar or off the screen.
 */
function maxHeightFor(area: Electron.Rectangle): number {
  const room = Math.max(MIN_HEIGHT, area.height - EDGE_MARGIN * 2)
  return Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, room))
}

/**
 * Place the card beside the pet: left first (the pet usually sits at the
 * bottom-right), then right, then above/below when both sides are too narrow.
 * Clamping is per-axis against the work area nearest the anchor, so a pet on a
 * secondary monitor is never answered by a card on the primary one. Without an
 * anchor the card opens centre-right of the primary display.
 */
function computeBounds(
  anchor: ClawdWeekReviewAnchor | null,
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
  return !!(weekReviewWin && !weekReviewWin.isDestroyed() && weekReviewWin.isVisible())
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
  if (!weekReviewWin || weekReviewWin.isDestroyed() || weekReviewWin.isVisible()) return
  clearRevealTimer()

  const focused = BrowserWindow.getFocusedWindow()
  previousFocus = focused && focused !== weekReviewWin ? focused : null

  try {
    weekReviewWin.show()
    weekReviewWin.focus()
  } catch (err) {
    log.warn('Could not reveal the week review:', err)
    destroyWindow(false)
    return
  }
  blurArmedAt = Date.now() + BLUR_ARM_MS
  if (isWin) {
    try { weekReviewWin.setAlwaysOnTop(true, WIN_TOPMOST_LEVEL) } catch { /* not fatal */ }
  }
}

/**
 * Destroy the window. Destroy rather than hide: the next open starts from a
 * clean renderer, so a stale payload or a stuck focus cannot survive a cycle.
 *
 * `restoreFocus` is false on click-away and on an action that already chose
 * where focus belongs (a conversation, or the Tasks view).
 */
function destroyWindow(restoreFocus: boolean): void {
  clearRevealTimer()
  blurArmedAt = 0
  actionInFlight = false

  const win = weekReviewWin
  weekReviewWin = null
  lastAnchor = null
  if (win && !win.isDestroyed()) {
    try { win.destroy() } catch (err) {
      log.warn('Could not destroy the week review:', err)
    }
  }

  const restore = previousFocus
  previousFocus = null
  if (restoreFocus && restore && !restore.isDestroyed() && restore.isVisible()) {
    try { restore.focus() } catch { /* window may be on its way out */ }
  }
}

function applyReportedHeight(rawHeight: unknown): void {
  if (!weekReviewWin || weekReviewWin.isDestroyed()) return
  if (typeof rawHeight !== 'number' || !Number.isFinite(rawHeight)) return

  const current = weekReviewWin.getBounds()
  const area = workAreaFor(lastAnchor)
  // The page reports what the whole content wants; the cap (content ceiling
  // and this display's work area) decides what it gets. The page scrolls the
  // rest.
  const height = Math.max(MIN_HEIGHT, Math.min(maxHeightFor(area), Math.round(rawHeight)))
  const x = clampAxis(current.x, area.x, area.width, WIDTH)
  // Keep the top edge stable while the card grows; only pull it up when the
  // bottom would leave the work area.
  const y = clampAxis(current.y, area.y, area.height, height)

  if (current.x !== x || current.y !== y || current.height !== height || current.width !== WIDTH) {
    try { weekReviewWin.setBounds({ x, y, width: WIDTH, height }) } catch { /* closing */ }
  }
  reveal()
}

function createWindow(anchor: ClawdWeekReviewAnchor | null): boolean {
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
      title: 'AIPA Week in Review',
      ...(isLinux ? { type: LINUX_WINDOW_TYPE } : {}),
      ...(isMac ? { type: 'panel', roundedCorners: false } : {}),
      webPreferences: {
        preload: assetPath('preload-week-review.js'),
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false,
      },
    })
  } catch (err) {
    log.warn('Week review window creation failed:', err)
    weekReviewWin = null
    return false
  }

  weekReviewWin = win
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
    if (weekReviewWin === win) weekReviewWin = null
    previousFocus = null
  })

  win.webContents.on('did-fail-load', (_event, _code, _desc, _url, isMainFrame) => {
    if (isMainFrame === false) return
    log.warn('Week review failed to load')
    destroyWindow(false)
  })
  win.webContents.on('render-process-gone', () => destroyWindow(false))

  void win.loadFile(assetPath('week-review.html')).catch((err: unknown) => {
    log.warn('Week review loadFile rejected:', err)
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
  /** Land on the Tasks view. */
  openTasks?: boolean
}

function sendAipaTarget(webContents: Electron.WebContents, target: AipaTarget): void {
  if (target.sessionId) webContents.send('menu:openSession', target.sessionId)
  else if (target.taskId) webContents.send('menu:openTask', target.taskId)
  else if (target.openTasks) webContents.send('menu:openTasks')
}

/**
 * Focus AIPA and hand it one navigation event. Returns false when the main
 * window is gone, so the caller can keep the card up instead of closing onto
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
      candidate !== weekReviewWin && !candidate.isDestroyed())
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
    log.warn('Could not focus AIPA for the week review:', err)
    return false
  }
}

function handleAction(action: unknown): ClawdWeekReviewPayload {
  const input = (action && typeof action === 'object' ? action : {}) as WeekReviewAction
  const type = typeof input.type === 'string' ? input.type as WeekReviewActionType : null
  const id = typeof input.id === 'string' ? input.id : ''

  switch (type) {
    case 'open': {
      actionInFlight = true
      let taskId = ''
      try {
        taskId = id ? (readTaskStore().tasks.find(task => task.id === id)?.id ?? '') : ''
      } catch (err) {
        log.warn('Could not look up a task to open:', err)
      }
      if (!taskId) {
        // The row's task disappeared between paint and click. Keep the card up
        // with a fresh payload instead of closing onto nothing.
        actionInFlight = false
        return buildPayload()
      }
      // Hand off the task record itself, never the bare Tasks view: the
      // renderer's `openTaskById` opens the latest conversation when one exists
      // and otherwise selects this record on the Tasks page. That is exactly
      // the contract's "latest conversation, or the Tasks view", and it still
      // opens no draft — a glance at the card must not become an unsent
      // message.
      if (focusAipa({ taskId })) destroyWindow(false)
      else actionInFlight = false
      return buildPayload()
    }
    case 'open-tasks':
      actionInFlight = true
      if (focusAipa({ openTasks: true })) destroyWindow(false)
      else actionInFlight = false
      return buildPayload()
    case 'close':
      destroyWindow(true)
      return buildPayload()
    default:
      return buildPayload()
  }
}

// ── IPC ──────────────────────────────────────────────────────────────────────

/**
 * Register the channels exactly once. A second call is a no-op: the
 * listener-based channels (height, close) would otherwise accumulate.
 */
function ensureIpc(): void {
  if (ipcRegistered) return
  ipcRegistered = true

  safeHandle('week-review:load', (event: Electron.IpcMainInvokeEvent) => {
    if (!isSender(event)) return emptyPayload()
    return buildPayload()
  })

  safeHandle('week-review:action', (event: Electron.IpcMainInvokeEvent, action: unknown) => {
    if (!isSender(event)) return emptyPayload()
    return handleAction(action)
  })

  ipcMain.on('week-review:report-height', (event: Electron.IpcMainEvent, height: unknown) => {
    if (!isSender(event)) return
    applyReportedHeight(height)
  })

  ipcMain.on('week-review:close', (event: Electron.IpcMainEvent) => {
    if (!isSender(event)) return
    destroyWindow(true)
  })
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Open the week review beside the pet, or focus the existing instance.
 * `anchor` is the pet's screen rectangle; omitted on a tray click, where the
 * pet's own rectangle is looked up instead, and centre-right of the primary
 * display is the last resort.
 *
 * Returns false only when a window could not be created at all. A page that
 * later fails to load closes itself.
 */
export function openClawdWeekReview(anchor?: ClawdWeekReviewAnchor): boolean {
  ensureIpc()
  const normalized = normalizeAnchor(anchor ?? petAnchor())
  if (normalized) lastAnchor = normalized

  try {
    if (weekReviewWin && !weekReviewWin.isDestroyed()) {
      // One instance only. Re-creating would reset the card's scroll position
      // and focus under the user's cursor.
      const bounds = computeBounds(lastAnchor, weekReviewWin.getBounds().height)
      try { weekReviewWin.setBounds(bounds) } catch { /* closing */ }
      if (weekReviewWin.isVisible()) {
        try { weekReviewWin.focus() } catch { /* not fatal */ }
      } else {
        reveal()
      }
      return true
    }
    return createWindow(lastAnchor)
  } catch (err) {
    log.warn('openClawdWeekReview failed:', err)
    destroyWindow(false)
    return false
  }
}

/** Close (and destroy) the week review. Safe to call when it is not open. */
export function closeClawdWeekReview(): void {
  destroyWindow(true)
}

export function isClawdWeekReviewOpen(): boolean {
  return isOpen()
}
