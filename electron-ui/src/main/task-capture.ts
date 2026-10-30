/**
 * task-capture — the pet's one-line "get this out of my head" bar.
 *
 * It is deliberately a separate window and page from the ASK bar: asking runs
 * a turn, capturing files a task, and the two jobs must not grow into each
 * other. Shape follows `quick-command.ts` for the same reasons: the window is
 * created on demand and destroyed on close (a hidden window would keep a GPU
 * surface and keep answering IPC), it anchors beside the pet and is clamped to
 * that display's work area, and blur is click-away after a short arm.
 *
 * Saving goes straight to the main-side task store. The renderer never sees a
 * task id or a path; it sends one line, and this module decides what a task is.
 * The store's own validation is the only gate, so the bar can report the real
 * failure instead of a generic "something went wrong".
 */
import { app, BrowserWindow, ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import { createTask, type TaskRepeat, type TaskView } from './tasks/task-store'
import { refreshClawdTaskBadge } from './clawd-task-badge'
import { showClawdNotice, withClawdMainWindow } from './clawd-integration'
import type { IpcMainEvent, Rectangle } from 'electron'

const WIDTH = 368
/** Head, one field, a two-line reason and the footer, plus shadow padding. */
const HEIGHT = 146
/**
 * Ceiling on how much taller the remembered-titles strip may make the bar.
 * Five rows plus the gap above them come to ~147 px; the slack covers the
 * rounded skin. The page measures the real block, this is only the backstop.
 */
const MAX_EXTRA_HEIGHT = 200
const EDGE_MARGIN = 8
const PET_GAP = 10
// A local page either loads or it does not; this only guards the ready
// handshake so a renderer that never reports back cannot leave an invisible,
// focused window over the desktop.
const REVEAL_TIMEOUT_MS = 900
// The bar is revealed after it painted. A blur in the first moment is the owner
// window losing activation, not the user clicking away.
const BLUR_ARM_MS = 250
// The same ceiling the store enforces. A longer line is kept up to here rather
// than refused: the point of the bar is not to make the user edit a title.
const TASK_TITLE_MAX = 200
// Recall is a convenience, not a log: twenty lines is enough to bring back the
// thought you filed yesterday without turning the bar into a task list.
const HISTORY_LIMIT = 20
/** Private to the pet; never leaves the machine. */
const HISTORY_FILE = 'task-capture-history.json'
/** The notice is a confirmation, not the task list; it clips a long title. */
const NOTICE_TITLE_MAX = 120
const NOTICE_TTL_MS = 6000
// Let the bar's focus hand-back settle before the notice window is first shown.
const NOTICE_REVEAL_DELAY_MS = 120
const isMac = process.platform === 'darwin'
const isWin = process.platform === 'win32'
const isLinux = process.platform === 'linux'
const WIN_TOPMOST_LEVEL = 'pop-up-menu'
const LINUX_WINDOW_TYPE = 'toolbar'

export interface TaskCaptureLabels {
  eyebrow: string
  placeholder: string
  save: string
  cancel: string
  empty: string
  failed: string
  /** Footer hint for Shift+Enter, which files the line and keeps the bar up. */
  stayHint: string
  /** The in-bar confirmation a stay-save leaves where the chips were. */
  savedInline: string
  savedTitle: string
  savedPill: string
  dueLabel: string
  dueClear: string
  /** The chip's date is a guess: it opens a strip of these three days. */
  duePresets: string
  dueToday: string
  dueTomorrow: string
  dueNextWeek: string
  /** The cadence chip and its four-row strip. */
  repeatLabel: string
  repeatNone: string
  repeatDaily: string
  repeatWeekly: string
  repeatMonthly: string
  repeatPresets: string
}

export interface TaskCaptureContext {
  /** The pet's BrowserWindow, used as the anchor and the focus fallback. */
  win: BrowserWindow | null
  getNearestWorkArea: (cx: number, cy: number) => Rectangle
  getHitRectScreen: (bounds: Rectangle) => { left: number; top: number; right: number; bottom: number } | null
  getLang: () => string
  getLabels: () => TaskCaptureLabels
  getTheme: () => string
  guardAlwaysOnTop?: (w: BrowserWindow) => void
  reapplyMacVisibility?: () => void
  hideFromTaskbar?: (w: BrowserWindow) => void
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function cleanErrorText(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  return raw.replace(/^[A-Za-z]*Error:\s*/, '').trim()
}

/**
 * One line, no control whitespace, bounded by the store's title cap. Trimming
 * here is what makes a whitespace-only submit empty; the store would otherwise
 * keep the spaces as a title.
 */
function normalizeTitle(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const collapsed = raw.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= TASK_TITLE_MAX) return collapsed
  return collapsed.slice(0, TASK_TITLE_MAX).trimEnd()
}

/**
 * The page resolves the due day itself; this boundary only refuses shapes it
 * cannot represent. A malformed day is dropped rather than failing the save:
 * the typed line is what the user came for, the day is the bonus.
 */
const DUE_ON_SHAPE = /^\d{4}-\d{2}-\d{2}$/

function normalizeDueOn(raw: unknown): string | undefined {
  return typeof raw === 'string' && DUE_ON_SHAPE.test(raw) ? raw : undefined
}

const REPEAT_VALUES: readonly TaskRepeat[] = ['daily', 'weekly', 'monthly']

/**
 * The page offers only the store's three cadences, but a bad sender still
 * reaches this boundary. An unknown value is dropped like a malformed day:
 * the capture is the point, the cadence is the bonus. Absent stays absent —
 * on create the store reads that as a one-off, while null would be a clear.
 */
function normalizeRepeatArg(raw: unknown): TaskRepeat | undefined {
  return typeof raw === 'string' && (REPEAT_VALUES as readonly string[]).includes(raw)
    ? raw as TaskRepeat
    : undefined
}

function clipText(text: string, max: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max).trimEnd()}…`
}

export default function initTaskCapture(ctx: TaskCaptureContext) {
  let barWin: BrowserWindow | null = null
  let previousFocus: BrowserWindow | null = null
  let revealTimer: NodeJS.Timeout | null = null
  let blurArmedAt = 0
  /** Current window height: the no-list height unless the strip asked for room. */
  let barHeight = HEIGHT
  /**
   * What the OS actually made of `HEIGHT` on creation. Windows has been seen
   * to hand back two pixels more for a transparent frameless window; shrinking
   * must return to that exact size, not to the requested constant.
   */
  let baseHeight = HEIGHT
  /** Saved capture titles, newest first. Reloaded at every open. */
  let history: string[] = []

  function historyPath(): string {
    return path.join(app.getPath('userData'), HISTORY_FILE)
  }

  /**
   * Any I/O or parse failure is "no history": a corrupt file must never keep
   * the bar from opening, and the next saved capture rewrites it.
   */
  function loadHistory(): string[] {
    let raw: string
    try {
      raw = fs.readFileSync(historyPath(), 'utf-8')
    } catch {
      return []
    }
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      const entries: string[] = []
      const seen = new Set<string>()
      for (const item of parsed) {
        if (typeof item !== 'string') continue
        // Stored titles were normalized on the way in; normalize again so a
        // hand-edited or older file cannot put control whitespace in the bar.
        const title = normalizeTitle(item)
        if (!title || seen.has(title)) continue
        seen.add(title)
        entries.push(title)
        if (entries.length >= HISTORY_LIMIT) break
      }
      return entries
    } catch {
      return []
    }
  }

  /**
   * Newest-first on disk. tmp+rename means a crash mid-write cannot truncate
   * the file; a failed write loses this line but never throws into the save
   * the user just made.
   */
  function persistHistory(entries: string[]): void {
    let tmp = ''
    try {
      const file = historyPath()
      tmp = `${file}.${process.pid}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(entries), 'utf-8')
      fs.renameSync(tmp, file)
    } catch (err) {
      if (tmp) {
        try { fs.unlinkSync(tmp) } catch { /* never created */ }
      }
      console.warn('Clawd: task capture history write failed:', cleanErrorText(err))
    }
  }

  function rememberCapture(title: string): void {
    const text = normalizeTitle(title)
    if (!text) return
    const next: string[] = [text]
    for (const entry of history) {
      if (entry === text) continue
      next.push(entry)
      if (next.length >= HISTORY_LIMIT) break
    }
    history = next
    persistHistory(next)
  }

  function isOpen(): boolean {
    return !!(barWin && !barWin.isDestroyed() && barWin.isVisible())
  }

  function sendToBar(channel: string, data: Record<string, unknown>): void {
    if (!barWin || barWin.isDestroyed()) return
    try {
      barWin.webContents.send(channel, data)
    } catch {
      // The window went away between the guard and the send.
    }
  }

  /**
   * Above the pet's visible sprite when there is room, below it when there is
   * not, and beside it only when the vertical band cannot fit at all. The
   * result is always clamped to the work area of the pet's display: a pet near
   * a monitor edge must not get half a text field.
   */
  function computeBounds(height = HEIGHT): Rectangle | null {
    if (!ctx.win || ctx.win.isDestroyed()) return null
    const boxHeight = Math.max(HEIGHT, Math.round(height))
    const bounds = ctx.win.getBounds()
    const hit = typeof ctx.getHitRectScreen === 'function' ? ctx.getHitRectScreen(bounds) : null
    const left = hit ? hit.left : bounds.x
    const top = hit ? hit.top : bounds.y
    const right = hit ? hit.right : bounds.x + bounds.width
    const bottom = hit ? hit.bottom : bounds.y + bounds.height
    const cx = Math.round((left + right) / 2)
    const cy = Math.round((top + bottom) / 2)
    const wa = ctx.getNearestWorkArea(cx, cy)
    const minX = wa.x + EDGE_MARGIN
    const maxX = wa.x + wa.width - WIDTH - EDGE_MARGIN
    const minY = wa.y + EDGE_MARGIN
    const maxY = wa.y + wa.height - boxHeight - EDGE_MARGIN
    let x = clamp(Math.round(cx - WIDTH / 2), minX, maxX)
    let y: number | null = null

    const above = top - boxHeight - PET_GAP
    if (above >= minY) {
      y = above
    } else {
      const below = bottom + PET_GAP
      if (below <= maxY) y = below
    }
    if (y === null) {
      // No vertical room: place the bar beside the pet, right first.
      const rightX = right + PET_GAP
      if (rightX <= maxX) {
        x = rightX
        y = clamp(Math.round(cy - boxHeight / 2), minY, maxY)
      } else {
        x = clamp(left - WIDTH - PET_GAP, minX, maxX)
        y = clamp(Math.round(cy - boxHeight / 2), minY, maxY)
      }
    }
    // Electron centers a window whose x/y are fractional instead of honoring
    // the position, and the pet's hit rect is measured in fractional pixels.
    // Round both axes before they cross into BrowserWindow.
    return {
      x: Math.round(x),
      y: Math.round(clamp(y, minY, maxY)),
      width: WIDTH,
      height: boxHeight,
    }
  }

  /** The work area of the display under the pet, and how tall a bar may get. */
  function maxBarHeight(): number {
    if (!ctx.win || ctx.win.isDestroyed()) return HEIGHT
    const bounds = ctx.win.getBounds()
    const hit = typeof ctx.getHitRectScreen === 'function' ? ctx.getHitRectScreen(bounds) : null
    const cx = Math.round(hit ? (hit.left + hit.right) / 2 : bounds.x + bounds.width / 2)
    const cy = Math.round(hit ? (hit.top + hit.bottom) / 2 : bounds.y + bounds.height / 2)
    const wa = ctx.getNearestWorkArea(cx, cy)
    return Math.max(HEIGHT, wa.height - EDGE_MARGIN * 2)
  }

  function reveal(): void {
    if (!barWin || barWin.isDestroyed() || barWin.isVisible()) return
    clearRevealTimer()
    const focused = BrowserWindow.getFocusedWindow()
    previousFocus = focused && focused !== barWin ? focused : null
    // Applied before the first show: on Windows a transparent, focusable window
    // otherwise gets a taskbar button for the fraction of a second it is up.
    if (typeof ctx.hideFromTaskbar === 'function') ctx.hideFromTaskbar(barWin)
    barWin.show()
    barWin.focus()
    blurArmedAt = Date.now() + BLUR_ARM_MS
    if (isWin) barWin.setAlwaysOnTop(true, WIN_TOPMOST_LEVEL)
    if (typeof ctx.reapplyMacVisibility === 'function') ctx.reapplyMacVisibility()
  }

  /**
   * Destroy the bar. `restoreFocus` is what keeps dismissing the bar from
   * handing the keyboard to AIPA: the window that owned focus when the bar
   * opened gets it back, and only when there was none does the pet take it.
   */
  function close(restoreFocus = true): void {
    clearRevealTimer()
    blurArmedAt = 0
    barHeight = HEIGHT
    baseHeight = HEIGHT
    const win = barWin
    barWin = null
    if (win && !win.isDestroyed()) {
      try { win.destroy() } catch (err) {
        console.warn('Clawd: task capture destroy failed:', cleanErrorText(err))
      }
    }
    const restore = previousFocus
    previousFocus = null
    if (!restoreFocus) return
    const restoreTarget = restore && !restore.isDestroyed() && restore.isVisible()
      ? restore
      : (ctx.win && !ctx.win.isDestroyed() && ctx.win.isVisible() ? ctx.win : null)
    if (restoreTarget) {
      try { restoreTarget.focus() } catch { /* window may be on its way out */ }
    }
  }

  /**
   * Open the bar. Already open means "bring it back", not "close it": the
   * shortcut is a way to capture, not a toggle that can silently swallow a
   * half-typed task.
   */
  function open(): boolean {
    if (barWin && !barWin.isDestroyed()) {
      if (!barWin.isVisible()) {
        reveal()
      } else {
        barWin.focus()
      }
      sendToBar('task-capture-focus', {})
      return true
    }
    if (!ctx.win || ctx.win.isDestroyed()) return false

    history = loadHistory()
    // Every open starts at the no-list geometry. The page asks for more only
    // when it has titles to show, and it asks before the reveal handshake.
    barHeight = HEIGHT
    const bounds = computeBounds()
    if (!bounds) return false
    let labels: TaskCaptureLabels
    try {
      labels = ctx.getLabels()
    } catch (err) {
      console.warn('Clawd: task capture labels failed:', cleanErrorText(err))
      return false
    }

    try {
      barWin = new BrowserWindow({
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
        ...(isLinux ? { type: LINUX_WINDOW_TYPE } : {}),
        ...(isMac ? { type: 'panel', roundedCorners: false } : {}),
        webPreferences: {
          preload: path.join(__dirname, 'clawd', 'src', 'preload-task-capture.js'),
          nodeIntegration: false,
          contextIsolation: true,
          backgroundThrottling: false,
        },
      })
    } catch (err) {
      barWin = null
      console.warn('Clawd: task capture window creation failed:', cleanErrorText(err))
      return false
    }

    baseHeight = barWin.getBounds().height
    barHeight = baseHeight
    if (isWin) barWin.setAlwaysOnTop(true, WIN_TOPMOST_LEVEL)
    if (isLinux) barWin.setSkipTaskbar(true)
    if (typeof ctx.guardAlwaysOnTop === 'function') ctx.guardAlwaysOnTop(barWin)

    barWin.on('blur', () => {
      // Click-away dismisses the bar. There is no in-flight save to protect:
      // the store write is synchronous and closes the bar itself.
      if (Date.now() < blurArmedAt) return
      close(false)
    })
    barWin.on('closed', () => {
      clearRevealTimer()
      barWin = null
      previousFocus = null
    })

    barWin.webContents.once('did-finish-load', () => {
      if (!barWin || barWin.isDestroyed()) return
      sendToBar('task-capture-show', {
        lang: ctx.getLang(),
        theme: ctx.getTheme() === 'clawd' ? 'clawd' : 'sao',
        labels,
        // Newest first. The page walks it locally; a stale copy dies with the
        // window, and a fresh save is only ever read back on the next open.
        history: history.slice(),
      })
    })
    barWin.webContents.on('did-fail-load', (_event, _code, _desc, _url, isMainFrame) => {
      if (isMainFrame === false) return
      close()
    })
    barWin.webContents.on('render-process-gone', () => close())

    barWin.loadFile(path.join(__dirname, 'clawd', 'src', 'task-capture.html'))

    // If the page never reports that it painted, showing it would leave an
    // invisible window that still swallows clicks and the keyboard.
    revealTimer = setTimeout(() => close(false), REVEAL_TIMEOUT_MS)
    revealTimer.unref?.()
    return true
  }

  function clearRevealTimer(): void {
    if (!revealTimer) return
    clearTimeout(revealTimer)
    revealTimer = null
  }

  function isSender(event: IpcMainEvent): boolean {
    if (!barWin || barWin.isDestroyed()) return false
    return BrowserWindow.fromWebContents(event.sender) === barWin
  }

  function showBarError(message: string, kind: 'error' | 'empty'): void {
    sendToBar('task-capture-error', { message, kind })
  }

  /**
   * Tell an open AIPA that the store changed, without taking focus. The store
   * was written here, in main, so no IPC mutation broadcasted it; the list, the
   * counts and the pet's badge would otherwise keep the copy they read before
   * the capture. The stay path needs this most: the bar keeps the keyboard, so
   * nothing else in the app is going to notice the new tasks until the user
   * switches to AIPA by hand.
   */
  function notifyTasksChanged(): void {
    withClawdMainWindow(win => {
      if (!win.isDestroyed()) win.webContents.send('tasks:changed')
    })
  }

  /**
   * Focus AIPA and open the Tasks view. The store was written from main, not
   * through the IPC broadcast, so the open list is told before the view
   * switches; otherwise the task the notice just announced could be missing
   * from the list it opens.
   */
  function focusTasks(): void {
    withClawdMainWindow(win => {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
      win.webContents.send('tasks:changed')
      win.webContents.send('menu:openTasks')
    })
  }

  /**
   * Focus AIPA and hand it the task just filed. This is the same hand-off the
   * pet's brief uses for a row: `menu:openTask` carries only the id, and the
   * renderer resolves the record itself (its latest conversation, or the
   * record on the Tasks view when no turn has run yet). Returns false when the
   * hand-off could not be delivered, which is the one case that falls through
   * to the list.
   */
  function focusTask(taskId: string): boolean {
    let handedOff = false
    withClawdMainWindow(win => {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
      try {
        // The store was written from main, not through the IPC broadcast, so
        // the open list hears about the new task before the record opens.
        win.webContents.send('tasks:changed')
        win.webContents.send('menu:openTask', taskId)
        handedOff = true
      } catch {
        // The window went away between the guard and the send; the caller's
        // fallback makes one fresh attempt at the Tasks view.
      }
    })
    return handedOff
  }

  function openSavedTask(taskId: string): void {
    if (!focusTask(taskId)) focusTasks()
    try { refreshClawdTaskBadge() } catch { /* pet gone */ }
  }

  function announceSaved(task: TaskView): void {
    let labels: TaskCaptureLabels
    try {
      labels = ctx.getLabels()
    } catch {
      // The save happened; a missing translation cannot undo it. The task is
      // in the store and the notice simply does not speak.
      return
    }
    // The bar hands the keyboard back before this runs. That focus change is
    // an OS round-trip: creating and showing a second top-level window in the
    // same tick can leave it created but never painted. One beat later the
    // owner window is settled and the notice's first show sticks.
    const timer = setTimeout(() => {
      showClawdNotice(
        {
          kind: 'success',
          title: labels.savedTitle,
          message: clipText(task.title, NOTICE_TITLE_MAX),
          pill: labels.savedPill,
          mode: 'done',
          lang: ctx.getLang(),
          clickAction: 'open',
          typed: true,
        },
        NOTICE_TTL_MS,
        action => {
          // The confirmation points at the task it just made, not merely at
          // the list it will appear in.
          if (action) openSavedTask(task.id)
        },
        // The user just pressed Enter on this bar. A confirmation may speak
        // while the pet is silenced or asleep; the gate exists to mute
        // background noise, not to swallow the answer to a click.
        { userInitiated: true },
      )
    }, NOTICE_REVEAL_DELAY_MS)
    timer.unref?.()
  }

  function handleSave(
    event: IpcMainEvent,
    raw: unknown,
    rawDue: unknown,
    rawRepeat: unknown,
    rawStay: unknown,
  ): void {
    if (!isSender(event)) return
    let labels: TaskCaptureLabels
    try {
      labels = ctx.getLabels()
    } catch {
      return
    }
    const title = normalizeTitle(raw)
    if (!title) {
      showBarError(labels.empty, 'empty')
      return
    }

    const repeat = normalizeRepeatArg(rawRepeat)
    let result: ReturnType<typeof createTask>
    try {
      // The store is the calendar gate: a day this boundary lets through but
      // the store refuses surfaces as the bar's normal failed-save reason.
      // `repeat` is spread in only when set, so a one-off is an absent field.
      result = createTask({
        title,
        dueOn: normalizeDueOn(rawDue),
        ...(repeat ? { repeat } : {}),
      })
    } catch (err) {
      const detail = cleanErrorText(err)
      showBarError(detail ? `${labels.failed}: ${detail}` : labels.failed, 'error')
      return
    }
    if (!result.ok) {
      // Lead with what happened in the user's language; the store's message
      // ("The task folder could not be created") is the detail, not the whole
      // sentence. The bar stays up so the typed title is not lost.
      const detail = result.error.trim()
      showBarError(detail ? `${labels.failed}: ${detail}` : labels.failed, 'error')
      return
    }

    // Remember the line before the window goes away. Every refusal above
    // (empty, whitespace-only, store failure) returned before this point, so a
    // line that did not become a task is never offered as a recall.
    rememberCapture(title)

    // Shift+Enter: the line is filed, but the bar stays for the next one. The
    // page clears itself only on this answer, so a refused write kept the text;
    // and no pet notice is shown, because the confirmation lives in the bar.
    if (rawStay === true) {
      // The page's walk is local. Hand it the list main now holds so ↑ recalls
      // the line filed a moment ago instead of the copy from the open.
      sendToBar('task-capture-saved', { history: history.slice() })
      // The bar stays in front; an open Tasks view would otherwise not learn
      // about this entry until some other mutation broadcasted a change.
      notifyTasksChanged()
      return
    }

    // Saved. The bar has done its job; the notice carries the confirmation and
    // the way into the task it just created.
    close(true)
    announceSaved(result.task)
  }

  const handleReady = (event: IpcMainEvent) => {
    if (!isSender(event)) return
    reveal()
  }
  const handleSaveEvent = (
    event: IpcMainEvent,
    raw: unknown,
    rawDue: unknown,
    rawRepeat: unknown,
    rawStay: unknown,
  ) => {
    if (!isSender(event)) return
    handleSave(event, raw, rawDue, rawRepeat, rawStay)
  }
  const handleClose = (event: IpcMainEvent) => {
    if (!isSender(event)) return
    close()
  }
  const handleFocus = (event: IpcMainEvent) => {
    if (!isSender(event)) return
    if (barWin && !barWin.isDestroyed()) barWin.focus()
  }
  /**
   * The remembered-titles strip asks for extra height and gives it back when
   * it hides. The payload is a hint, not a size: main owns the ceiling and the
   * work-area clamp, and re-anchors the bar to the pet so a grown window still
   * stays beside it instead of drifting to another corner. A send from a
   * window on its way out, or a refused setBounds, leaves the bar usable at
   * whatever size it already had.
   */
  const handleResize = (event: IpcMainEvent, raw: unknown) => {
    if (!isSender(event) || !barWin || barWin.isDestroyed()) return
    const payload = raw && typeof raw === 'object' ? raw as Record<string, unknown> : null
    const requested = payload && typeof payload.extra === 'number' ? payload.extra : 0
    const extra = Number.isFinite(requested)
      ? clamp(Math.round(requested), 0, MAX_EXTRA_HEIGHT)
      : 0
    // Zero means "give the room back", which must be the exact no-list size;
    // with a list, add the strip to that same base so nothing clips.
    const wanted = extra > 0 ? baseHeight + extra : baseHeight
    const height = Math.min(wanted, Math.max(baseHeight, maxBarHeight()))
    if (height === barHeight) return
    const bounds = computeBounds(height)
    if (!bounds) return
    barHeight = height
    try {
      barWin.setBounds(bounds)
    } catch (err) {
      console.warn('Clawd: task capture resize failed:', cleanErrorText(err))
    }
  }

  ipcMain.on('task-capture-ready', handleReady)
  ipcMain.on('task-capture-save', handleSaveEvent)
  ipcMain.on('task-capture-close', handleClose)
  ipcMain.on('task-capture-focus', handleFocus)
  ipcMain.on('task-capture-resize', handleResize)

  function cleanup(): void {
    close(false)
    ipcMain.removeListener('task-capture-ready', handleReady)
    ipcMain.removeListener('task-capture-save', handleSaveEvent)
    ipcMain.removeListener('task-capture-close', handleClose)
    ipcMain.removeListener('task-capture-focus', handleFocus)
    ipcMain.removeListener('task-capture-resize', handleResize)
  }

  return {
    open,
    close,
    isOpen,
    cleanup,
    getWindow: () => barWin,
  }
}
