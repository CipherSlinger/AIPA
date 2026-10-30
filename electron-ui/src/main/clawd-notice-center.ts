/**
 * clawd-notice-center.ts — the pet's notice-history window.
 *
 * The pet only keeps a transient bubble on screen for a few seconds; anything
 * the user missed lives in `clawd-notifications.json`. This module owns the
 * one window that turns that history into something browsable: a frameless,
 * transparent HUD panel that opens beside the pet, lists what it said, and can
 * open the conversation a notice came from.
 *
 * Shape of the thing (deliberately the same as `pet-menu.js`):
 *   - one window, created on demand and destroyed on close, because a hidden
 *     window would keep a GPU surface alive and keep answering IPC after the
 *     pet went away;
 *   - renderer asks for `notice-center:load`, renders, reports its measured
 *     height, and only then is the window revealed — no empty transparent
 *     rectangle ever sits over the desktop;
 *   - blur is click-away, but blurs during the reveal are ignored;
 *   - Escape / close destroys from the renderer's side; a failed load also
 *     closes instead of leaving an invisible focus trap.
 *
 * Everything is fail-open: a missing store, a display query that throws while
 * Electron is still starting, or a window that never paints must never take the
 * app down. The worst outcome is that the notice centre does not open.
 */
import { BrowserWindow, clipboard, ipcMain, screen, type WebContents } from 'electron'
import * as path from 'path'
import {
  getClawdLanguage,
  withClawdMainWindow,
  type ClawdBubbleMetaRow,
} from './clawd-integration'
import { refreshClawdTaskBadge } from './clawd-task-badge'
import {
  clearClawdNotices,
  getUnreadClawdNoticeCount as countUnreadClawdNotices,
  listClawdNotices,
  markClawdNoticesRead,
  removeClawdNotice,
  type ClawdNoticeRecord,
} from './clawd-notifications'
import {
  addTextMaterial,
  appendTaskEvent,
  createTask,
  deleteTask,
  findTaskBySessionId,
  getTask,
  listTasks,
} from './tasks/task-store'
import { safeHandle } from './ipc/register/safe-handle'
import { createLogger } from './utils/logger'

const log = createLogger('clawd-notice-center')

/** The pet's screen rectangle, in Electron's DIP screen coordinates. */
export interface ClawdNoticeCenterAnchor {
  x: number
  y: number
  width: number
  height: number
}

/** One row as the renderer sees it. `read` is derived from `readAt`. */
export interface ClawdNoticeCenterItem {
  id: string
  kind: string
  title: string
  message: string
  /** Epoch ms the notice was announced. */
  at: number
  /** True once the centre has shown it. */
  read: boolean
  /** AIPA session to open, when the notice is about a conversation. */
  sessionId?: string
  /** Meta rows recorded with the bubble (session, tools, elapsed time). */
  meta?: ClawdBubbleMetaRow[]
  /** The message is worth turning into a task; see SAVEABLE_NOTICE_KINDS. */
  canSaveTask: boolean
  /**
   * The live task this notice was saved into, when one is recorded on it. Read
   * from the task's own `from_notice` history, so the way back survives a
   * restart and a reopened log.
   */
  taskId?: string
}

/** Why a rendered action, if any, should change its row's transient status. */
export interface ClawdNoticeActionResult {
  id: string
  action: 'save-task'
  ok: boolean
  taskId?: string
  taskTitle?: string
  code?: string
  error?: string
  /** A second save of the same notice reuses its task instead of duplicating. */
  reused?: boolean
}

/** Everything the renderer needs for one paint. */
export interface ClawdNoticeCenterPayload {
  notices: ClawdNoticeCenterItem[]
  /** Pet language: "en" | "zh" | "ko". */
  lang: string
  /** Number of unread records, for the title-bar badge. */
  unread: number
  /** Present only on the reply to a row action, never on load/update. */
  outcome?: ClawdNoticeActionResult
}

type NoticeActionType = 'open' | 'dismiss' | 'clear-all' | 'close' | 'save-task' | 'open-task'

interface NoticeCenterAction {
  type?: unknown
  id?: unknown
  taskId?: unknown
}

// Width is fixed; height follows the content between these bounds. The list
// itself caps at ~420px including chrome and scrolls internally, so the window
// never grows into a full-screen slab.
const WIDTH = 372
const MIN_HEIGHT = 168
const MAX_HEIGHT = 520
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

let noticeWin: BrowserWindow | null = null
let revealTimer: NodeJS.Timeout | null = null
let blurArmedAt = 0
let ipcRegistered = false
let lastAnchor: ClawdNoticeCenterAnchor | null = null
/** Window to hand focus back to on an explicit close (not a click-away). */
let previousFocus: BrowserWindow | null = null

function clearRevealTimer(): void {
  if (!revealTimer) return
  clearTimeout(revealTimer)
  revealTimer = null
}

/** The assets live next to the compiled factory: dist/main/clawd/src/. */
function assetPath(file: string): string {
  return path.join(__dirname, 'clawd', 'src', file)
}

function petLanguage(): string {
  try {
    return getClawdLanguage() || 'en'
  } catch {
    return 'en'
  }
}

/**
 * Kinds whose text is a record of something that happened rather than a
 * transient prompt. An approval or a clarification is answered and then gone;
 * saving one would only archive the question. The message must also carry
 * something, because an empty material is not a material.
 */
const SAVEABLE_NOTICE_KINDS = new Set(['system', 'info', 'success', 'warning', 'error', 'quest'])

function canSaveNotice(record: ClawdNoticeRecord): boolean {
  return SAVEABLE_NOTICE_KINDS.has(record.kind) && !!record.message.trim()
}

/** `detail` is stored as `LABEL: value` lines by the bubble's meta strip. */
function parseMeta(detail?: string): ClawdBubbleMetaRow[] {
  if (!detail) return []
  const rows: ClawdBubbleMetaRow[] = []
  for (const line of detail.split(/\r?\n/)) {
    const at = line.indexOf(':')
    if (at <= 0) continue
    const label = line.slice(0, at).trim()
    const value = line.slice(at + 1).trim()
    if (!label || !value) continue
    rows.push({ label, value })
    if (rows.length >= 6) break
  }
  return rows
}

function toItem(
  record: ClawdNoticeRecord,
  saved: Map<string, { id: string; title: string }>,
): ClawdNoticeCenterItem {
  const meta = parseMeta(record.detail)
  const savedTask = saved.get(record.id)
  return {
    id: record.id,
    kind: record.kind,
    title: record.title,
    message: record.message,
    at: record.at,
    read: !!record.readAt,
    ...(record.sessionId ? { sessionId: record.sessionId } : {}),
    ...(meta.length ? { meta } : {}),
    canSaveTask: canSaveNotice(record),
    ...(savedTask ? { taskId: savedTask.id } : {}),
  }
}

/**
 * Build the renderer payload from the store. The store is newest-first and
 * already capped, so no ordering or slicing happens here — one definition of
 * the history, two readers (the tray menu and this window).
 */
function buildPayload(): ClawdNoticeCenterPayload {
  let records: ClawdNoticeRecord[] = []
  try {
    records = listClawdNotices()
  } catch (err) {
    log.warn('Could not list clawd notices:', err)
  }
  const saved = savedNoticeTasksById()
  return {
    notices: records.map(record => toItem(record, saved)),
    lang: petLanguage(),
    unread: records.reduce((count, record) => count + (record.readAt ? 0 : 1), 0),
  }
}

function emptyPayload(): ClawdNoticeCenterPayload {
  return { notices: [], lang: petLanguage(), unread: 0 }
}

function isSender(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): boolean {
  if (!noticeWin || noticeWin.isDestroyed()) return false
  return BrowserWindow.fromWebContents(event.sender) === noticeWin
}

/** Push a fresh payload to the open window. No-op when it is gone. */
function emitUpdate(payload: ClawdNoticeCenterPayload = buildPayload()): ClawdNoticeCenterPayload {
  if (noticeWin && !noticeWin.isDestroyed()) {
    try { noticeWin.webContents.send('notice-center:update', payload) } catch { /* closing */ }
  }
  return payload
}

// ── Geometry ────────────────────────────────────────────────────────────────

function toRect(anchor: ClawdNoticeCenterAnchor): Electron.Rectangle {
  return {
    x: Math.round(anchor.x),
    y: Math.round(anchor.y),
    width: Math.round(anchor.width),
    height: Math.round(anchor.height),
  }
}

/** Validate an anchor coming from IPC/JS: finite numbers, real size. */
function normalizeAnchor(anchor?: ClawdNoticeCenterAnchor | null): ClawdNoticeCenterAnchor | null {
  if (!anchor || typeof anchor !== 'object') return null
  const { x, y, width, height } = anchor
  if (![x, y, width, height].every(value => typeof value === 'number' && Number.isFinite(value))) return null
  if (width <= 0 || height <= 0) return null
  return { x, y, width, height }
}

function workAreaFor(anchor: ClawdNoticeCenterAnchor | null): Electron.Rectangle {
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

function clampAxis(value: number, areaStart: number, areaSize: number, size: number): number {
  const min = areaStart + EDGE_MARGIN
  const max = areaStart + areaSize - size - EDGE_MARGIN
  // A work area smaller than the panel: pin to the top-left edge rather than
  // producing a negative range (Math.min/max would otherwise pin the wrong end).
  if (max < min) return areaStart + Math.round(Math.min(EDGE_MARGIN, Math.max(0, areaSize - size) / 2))
  return Math.round(Math.max(min, Math.min(max, value)))
}

/**
 * Place the panel beside the pet: left first (the pet usually sits at the
 * bottom-right), then right, then above/below when both sides are too narrow.
 * Clamping is per-axis against the work area nearest the anchor, so a pet on a
 * secondary monitor is never answered by a panel on the primary one.
 * Without an anchor the panel opens centre-right of the primary display.
 */
function computeBounds(
  anchor: ClawdNoticeCenterAnchor | null,
  height: number,
): Electron.Rectangle {
  const area = workAreaFor(anchor)
  const h = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(height)))

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
  return !!(noticeWin && !noticeWin.isDestroyed() && noticeWin.isVisible())
}

function reveal(): void {
  if (!noticeWin || noticeWin.isDestroyed() || noticeWin.isVisible()) return
  clearRevealTimer()

  const focused = BrowserWindow.getFocusedWindow()
  previousFocus = focused && focused !== noticeWin ? focused : null

  try {
    noticeWin.show()
    noticeWin.focus()
  } catch (err) {
    log.warn('Could not reveal notice centre:', err)
    destroyWindow(false)
    return
  }
  blurArmedAt = Date.now() + BLUR_ARM_MS
  if (isWin) {
    try { noticeWin.setAlwaysOnTop(true, WIN_TOPMOST_LEVEL) } catch { /* not fatal */ }
  }
}

/**
 * Destroy the window. Destroy rather than hide: the next open starts from a
 * clean renderer, so a stuck filter or a stale payload cannot survive a cycle.
 *
 * `restoreFocus` is false on click-away and on "open a session": in both cases
 * the user has already chosen where focus belongs.
 *
 * `markRead` is set only on the two closes the user asked for. The visit is the
 * read: leaving by the close button or Escape means every row has been on
 * screen, so the unread badge and the UNREAD filter should both clear. It is
 * deliberately not set on click-away (the user may have only glanced), on
 * shutdown, on a failed load, or on replacement — none of those mean "seen".
 * Marking here rather than on load keeps the unread dots meaningful *during*
 * the visit, so the UNREAD filter the user just clicked still filters.
 */
function destroyWindow(restoreFocus: boolean, markRead = false): void {
  if (markRead) {
    try { markClawdNoticesRead() } catch (err) { log.warn('Could not mark notices read:', err) }
  }
  clearRevealTimer()
  blurArmedAt = 0

  const win = noticeWin
  noticeWin = null
  lastAnchor = null
  if (win && !win.isDestroyed()) {
    try { win.destroy() } catch (err) {
      log.warn('Could not destroy notice centre:', err)
    }
  }

  const restore = previousFocus
  previousFocus = null
  if (restoreFocus && restore && !restore.isDestroyed() && restore.isVisible()) {
    try { restore.focus() } catch { /* window may be on its way out */ }
  }
}

/**
 * When the panel sits over the pet's column (only possible when neither side
 * fits) and an expanded row makes it grow into the pet, keep the bottom edge
 * above the pet instead of painting over it. Growth downward from below the
 * pet is already clear, so only a panel that started above the pet moves.
 */
function keepClearOfPet(
  x: number,
  y: number,
  width: number,
  height: number,
  area: Electron.Rectangle,
): number {
  if (!lastAnchor) return y
  const pet = toRect(lastAnchor)
  const overlapsX = x < pet.x + pet.width && x + width > pet.x
  if (!overlapsX) return y
  const overlapsY = y < pet.y + pet.height && y + height > pet.y
  if (!overlapsY || y >= pet.y) return y
  const above = Math.round(pet.y - PET_GAP - height)
  // A work area too short to hold the open row above the pet has no clear
  // answer; pinning to the top edge is still better than moving the panel
  // further under the pet.
  return Math.max(area.y + EDGE_MARGIN, above)
}

function applyReportedHeight(rawHeight: unknown): void {
  if (!noticeWin || noticeWin.isDestroyed()) return
  if (typeof rawHeight !== 'number' || !Number.isFinite(rawHeight)) return

  const current = noticeWin.getBounds()
  const height = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(rawHeight)))
  const area = workAreaFor(lastAnchor)
  const x = clampAxis(current.x, area.x, area.width, WIDTH)
  // Keep the top edge stable while the panel grows; only pull it up when the
  // bottom would leave the work area. Recomputing the centred y on every
  // report made the panel visibly jump when a second row arrived.
  const y = clampAxis(
    keepClearOfPet(x, current.y, WIDTH, height, area),
    area.y, area.height, height,
  )

  if (current.x !== x || current.y !== y || current.height !== height || current.width !== WIDTH) {
    try { noticeWin.setBounds({ x, y, width: WIDTH, height }) } catch { /* closing */ }
  }
  reveal()
}

function createWindow(anchor: ClawdNoticeCenterAnchor | null): boolean {
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
      title: 'AIPA Notices',
      ...(isLinux ? { type: LINUX_WINDOW_TYPE } : {}),
      ...(isMac ? { type: 'panel', roundedCorners: false } : {}),
      webPreferences: {
        preload: assetPath('preload-notice-center.js'),
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false,
      },
    })
  } catch (err) {
    log.warn('Notice centre window creation failed:', err)
    noticeWin = null
    return false
  }

  noticeWin = win
  try { win.setMenuBarVisibility(false) } catch { /* mac panels have no menu bar */ }
  if (isWin) {
    try { win.setAlwaysOnTop(true, WIN_TOPMOST_LEVEL) } catch { /* not fatal */ }
  }
  if (isLinux) {
    try { win.setSkipTaskbar(true) } catch { /* not fatal */ }
  }

  win.on('blur', () => {
    // Click-away. An early blur belongs to the reveal, not the user.
    if (Date.now() < blurArmedAt) return
    destroyWindow(false)
  })
  win.on('closed', () => {
    clearRevealTimer()
    if (noticeWin === win) noticeWin = null
    previousFocus = null
  })

  win.webContents.on('did-fail-load', (_event, _code, _desc, _url, isMainFrame) => {
    if (isMainFrame === false) return
    log.warn('Notice centre failed to load')
    destroyWindow(false)
  })
  win.webContents.on('render-process-gone', () => destroyWindow(false))

  void win.loadFile(assetPath('notice-center.html')).catch((err: unknown) => {
    log.warn('Notice centre loadFile rejected:', err)
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

/** What AIPA should show once it has focus. At most one of these is sent. */
interface AipaTarget {
  /** Open this conversation. */
  sessionId?: string
  /** Land on the Tasks view (the task has no conversation to open). */
  openTasks?: boolean
  /** Open one task's work; the renderer resolves the record itself. */
  taskId?: string
}

function sendAipaTarget(webContents: WebContents, target: AipaTarget): void {
  if (target.sessionId) webContents.send('menu:openSession', target.sessionId)
  else if (target.taskId) webContents.send('menu:openTask', target.taskId)
  else if (target.openTasks) webContents.send('menu:openTasks')
}

/**
 * Focus AIPA, optionally opening a session, a task or the Tasks view. Returns
 * false when no window exists.
 */
function focusAipaMainWindow(target: AipaTarget = {}): boolean {
  let handled = false
  // The integration owns the real main window; getAllWindows is the fallback
  // for harnesses and for the window between app start and integration init.
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
      candidate !== noticeWin && !candidate.isDestroyed())
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
    log.warn('Could not focus AIPA for a notice:', err)
    return false
  }
}

/** The task created from a notice this run; the store holds the durable copy. */
const savedNoticeTasks = new Map<string, string>()

/**
 * Every notice that already became a live task, in one pass.
 *
 * The `from_notice` event is the durable half of the link: an in-memory map is
 * enough within one run, but after a restart both the dedupe and the row's way
 * back to its task must still find what the notice became. An archived task no
 * longer counts — the user retired that work, and saving the notice again is a
 * new request. Scanning once keeps one payload from parsing tasks.json per row.
 */
function savedNoticeTasksById(): Map<string, { id: string; title: string }> {
  const saved = new Map<string, { id: string; title: string }>()
  try {
    for (const task of listTasks()) {
      if (task.status === 'archived') continue
      for (const event of task.history) {
        if (event.kind !== 'from_notice' || !event.detail) continue
        if (!saved.has(event.detail)) saved.set(event.detail, { id: task.id, title: task.title })
      }
    }
  } catch (err) {
    log.warn('Could not scan tasks for saved notices:', err)
  }
  return saved
}

/** The live task a notice already became, if any. */
function findTaskForNotice(noticeId: string): { id: string; title: string } | null {
  if (!noticeId) return null
  return savedNoticeTasksById().get(noticeId) ?? null
}

type SaveNoticeResult =
  | { ok: true; taskId: string; taskTitle: string; reused: boolean }
  | { ok: false; code: string; error: string }

function findNotice(id: string): ClawdNoticeRecord | undefined {
  if (!id) return undefined
  try {
    return listClawdNotices().find(item => item.id === id)
  } catch (err) {
    log.warn('Could not look up notice:', err)
    return undefined
  }
}

/**
 * Save a notice's text as a task. The task store's own text-material path does
 * the writing: it owns the size cap, the sanitized single-segment name, the
 * folder-ownership check and the `material_added` history event. That event's
 * detail is the title-derived file name, so it names the notice without a new
 * schema version. If the material cannot be written, the half-made task is
 * trashed rather than left claiming work that is not there.
 */
function saveNoticeAsTask(record: ClawdNoticeRecord): SaveNoticeResult {
  const cachedId = savedNoticeTasks.get(record.id)
  if (cachedId) {
    const existing = getTask(cachedId)
    if (existing && !existing.missing) {
      return { ok: true, taskId: existing.id, taskTitle: existing.title, reused: true }
    }
    savedNoticeTasks.delete(record.id)
  }
  const remembered = findTaskForNotice(record.id)
  if (remembered) {
    savedNoticeTasks.set(record.id, remembered.id)
    return { ok: true, taskId: remembered.id, taskTitle: remembered.title, reused: true }
  }

  if (!canSaveNotice(record)) {
    return record.message.trim()
      ? { ok: false, code: 'not_saveable', error: 'This notice cannot be saved as a task' }
      : { ok: false, code: 'empty_text', error: 'This notice has no text to save' }
  }

  const created = createTask({ title: record.title })
  if (!created.ok) return created

  const added = addTextMaterial(created.task.id, {
    name: `${record.title}.md`,
    text: `${record.title}\n\n${record.message}`,
    source: 'import',
  })
  if (!added.ok) {
    try { deleteTask(created.task.id, { deleteFiles: true }) } catch { /* best effort */ }
    return added
  }

  // The material proves the text was kept; this event proves *which notice*
  // produced it, which is what makes a second save after a restart reuse the
  // task. Failing to write it loses only that dedupe, so the save still stands.
  const linked = appendTaskEvent(added.task.id, 'from_notice', record.id)
  if (!linked.ok) log.warn('Could not record the notice on the task:', linked.error)

  savedNoticeTasks.set(record.id, added.task.id)
  return { ok: true, taskId: added.task.id, taskTitle: added.task.title, reused: false }
}

/**
 * Show the Tasks view without yanking focus out of the notice log. A blur here
 * destroys this window, which would also destroy the row status that confirms
 * the save; `showInactive` opens a hidden AIPA window without acting like the
 * user clicked away. A minimized window has to be restored, which does focus.
 */
function handOffToTasks(): boolean {
  let handled = false
  withClawdMainWindow(win => {
    handled = true
    if (win.isMinimized()) win.restore()
    if (!win.isVisible()) win.showInactive()
    // Main owns the task store; the renderer only mirrors it. Send the change
    // before the view so the new task is already in the list when it appears.
    win.webContents.send('tasks:changed')
    // This path writes the task store directly, so it never passes through the
    // IPC broadcast closure that normally refreshes the pet's badge.
    refreshClawdTaskBadge()
    win.webContents.send('menu:openTasks')
  })
  return handled
}

function handleAction(action: unknown): ClawdNoticeCenterPayload {
  const input = (action && typeof action === 'object' ? action : {}) as NoticeCenterAction
  const type = typeof input.type === 'string' ? input.type as NoticeActionType : null
  const id = typeof input.id === 'string' ? input.id : ''

  switch (type) {
    case 'open': {
      // Read the record before marking it, because marking read rewrites the
      // store and we still need the session id for the click-through.
      let record: ClawdNoticeRecord | undefined
      try {
        record = id ? listClawdNotices().find(item => item.id === id) : undefined
      } catch (err) {
        log.warn('Could not look up notice to open:', err)
      }
      if (id) {
        try { markClawdNoticesRead([id]) } catch (err) { log.warn('Could not mark notice read:', err) }
      }
      // A conversation that belongs to a task opens that task: the log row is
      // the work, not the thread. An unattributed session keeps the plain
      // session hand-off.
      let task: { id: string; title: string } | null = null
      try {
        task = findTaskBySessionId(record?.sessionId)
      } catch (err) {
        log.warn('Could not look up the task behind a notice:', err)
      }
      const focused = focusAipaMainWindow(task ? { taskId: task.id } : { sessionId: record?.sessionId })
      if (focused) {
        destroyWindow(false)
      } else {
        // Nothing to focus: keep the log up and reflect the read state instead
        // of closing onto an unchanged desktop.
        emitUpdate()
      }
      return buildPayload()
    }
    case 'save-task': {
      const record = findNotice(id)
      if (!record) {
        return {
          ...buildPayload(),
          outcome: {
            id, action: 'save-task', ok: false,
            code: 'not_found', error: 'That notice no longer exists',
          },
        }
      }
      const saved = saveNoticeAsTask(record)
      if (!saved.ok) {
        return {
          ...buildPayload(),
          outcome: { id, action: 'save-task', ok: false, code: saved.code, error: saved.error },
        }
      }
      handOffToTasks()
      return {
        ...buildPayload(),
        outcome: {
          id, action: 'save-task', ok: true,
          taskId: saved.taskId, taskTitle: saved.taskTitle, reused: saved.reused,
        },
      }
    }
    case 'open-task': {
      // Open the task the notice became, not just the Tasks list: the action
      // exists so the user can get back to that work. Without an id (an older
      // row) the list itself is still the honest destination.
      const taskId = typeof input.taskId === 'string' && input.taskId ? input.taskId : ''
      const focused = focusAipaMainWindow(taskId ? { taskId } : { openTasks: true })
      if (focused) destroyWindow(false)
      else emitUpdate()
      return buildPayload()
    }
    case 'dismiss': {
      if (id) {
        try { removeClawdNotice(id) } catch (err) { log.warn('Could not remove notice:', err) }
      }
      return emitUpdate()
    }
    case 'clear-all': {
      try { clearClawdNotices() } catch (err) { log.warn('Could not clear notices:', err) }
      return emitUpdate()
    }
    case 'close': {
      destroyWindow(true, true)
      return buildPayload()
    }
    default:
      return buildPayload()
  }
}

// ── IPC ──────────────────────────────────────────────────────────────────────

/**
 * Register the channels exactly once. A second call is a no-op: `safeHandle`
 * would survive a duplicate registration, but the listener-based channels
 * (height, close) would accumulate, so the guard is the real protection.
 */
function ensureIpc(): void {
  if (ipcRegistered) return
  ipcRegistered = true

  safeHandle('notice-center:load', (event: Electron.IpcMainInvokeEvent) => {
    return isSender(event) ? buildPayload() : emptyPayload()
  })

  safeHandle('notice-center:action', (event: Electron.IpcMainInvokeEvent, action: unknown) => {
    if (!isSender(event)) return emptyPayload()
    return handleAction(action)
  })

  // Copy is its own channel because it touches the OS clipboard and nothing
  // else: no store write, no read state, no window lifecycle.
  safeHandle('notice-center:copy', (event: Electron.IpcMainInvokeEvent, id: unknown) => {
    if (!isSender(event)) return { ok: false, code: 'denied' }
    const record = typeof id === 'string' ? findNotice(id) : undefined
    if (!record) return { ok: false, code: 'not_found' }
    if (!record.message.trim()) return { ok: false, code: 'empty_text' }
    try {
      clipboard.writeText(`${record.title}\n\n${record.message}`)
      return { ok: true }
    } catch (err) {
      log.warn('Could not copy notice:', err)
      return { ok: false, code: 'clipboard' }
    }
  })

  ipcMain.on('notice-center:report-height', (event: Electron.IpcMainEvent, height: unknown) => {
    if (!isSender(event)) return
    applyReportedHeight(height)
  })

  ipcMain.on('notice-center:close', (event: Electron.IpcMainEvent, options: unknown) => {
    if (!isSender(event)) return
    // The renderer says whether this close means "seen": the × and Escape do,
    // the transparent margin around the panel does not — that is a click-away,
    // and a click just outside the window blurs without marking anything.
    const opts = (options && typeof options === 'object' ? options : {}) as { markRead?: unknown }
    destroyWindow(true, opts.markRead !== false)
  })
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Open the notice centre beside the pet, or refresh and focus the existing
 * instance. `anchor` is the pet's screen rectangle; omit it to open
 * centre-right of the primary display.
 *
 * Returns false only when a window could not be created at all. A page that
 * later fails to load closes itself.
 */
export function openClawdNoticeCenter(anchor?: ClawdNoticeCenterAnchor): boolean {
  ensureIpc()
  const normalized = normalizeAnchor(anchor ?? null)
  if (normalized) lastAnchor = normalized

  try {
    if (noticeWin && !noticeWin.isDestroyed()) {
      // One instance only. Refresh the payload, then focus; re-creating would
      // reset scroll and filter state under the user's cursor.
      const bounds = computeBounds(lastAnchor, noticeWin.getBounds().height)
      try { noticeWin.setBounds(bounds) } catch { /* closing */ }
      emitUpdate()
      if (noticeWin.isVisible()) {
        try { noticeWin.focus() } catch { /* not fatal */ }
      } else {
        reveal()
      }
      return true
    }
    return createWindow(lastAnchor)
  } catch (err) {
    log.warn('openClawdNoticeCenter failed:', err)
    destroyWindow(false)
    return false
  }
}

/**
 * Close (and destroy) the notice centre. Safe to call when it is not open.
 * This is the programmatic close — shutdown, or the pet going away — so it
 * leaves the unread state alone; only the user's own close marks the log read.
 */
export function closeClawdNoticeCenter(): void {
  destroyWindow(true)
}

export function isClawdNoticeCenterOpen(): boolean {
  return isOpen()
}

/**
 * Re-render an open notice centre after the history changed underneath it — a
 * bubble that announced something while the log was already on screen. A
 * closed window pays nothing, so callers need no "is it open" check.
 */
export function refreshClawdNoticeCenter(): void {
  if (!isOpen()) return
  emitUpdate()
}

/**
 * Unread count for the pet menu badge. Re-exported here so the menu imports
 * one window-related module instead of reaching into the store directly.
 */
export function getUnreadClawdNoticeCount(): number {
  try {
    return countUnreadClawdNotices()
  } catch {
    return 0
  }
}
