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
import { BrowserWindow, ipcMain, screen } from 'electron'
import * as path from 'path'
import { getClawdLanguage, withClawdMainWindow } from './clawd-integration'
import {
  clearClawdNotices,
  getUnreadClawdNoticeCount as countUnreadClawdNotices,
  listClawdNotices,
  markClawdNoticesRead,
  removeClawdNotice,
  type ClawdNoticeRecord,
} from './clawd-notifications'
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
}

/** Everything the renderer needs for one paint. */
export interface ClawdNoticeCenterPayload {
  notices: ClawdNoticeCenterItem[]
  /** Pet language: "en" | "zh" | "ko". */
  lang: string
  /** Number of unread records, for the title-bar badge. */
  unread: number
}

type NoticeActionType = 'open' | 'dismiss' | 'clear-all' | 'close'

interface NoticeCenterAction {
  type?: unknown
  id?: unknown
}

// Width is fixed; height follows the content between these bounds. The list
// itself caps at ~420px including chrome and scrolls internally, so the window
// never grows into a full-screen slab.
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

function toItem(record: ClawdNoticeRecord): ClawdNoticeCenterItem {
  return {
    id: record.id,
    kind: record.kind,
    title: record.title,
    message: record.message,
    at: record.at,
    read: !!record.readAt,
    ...(record.sessionId ? { sessionId: record.sessionId } : {}),
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
  return {
    notices: records.map(toItem),
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
 */
function destroyWindow(restoreFocus: boolean): void {
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
  const y = clampAxis(current.y, area.y, area.height, height)

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

/** Focus AIPA, optionally opening a session. Returns false when it is gone. */
function focusAipaMainWindow(sessionId?: string): boolean {
  let handled = false
  // The integration owns the real main window; getAllWindows is the fallback
  // for harnesses and for the window between app start and integration init.
  try {
    withClawdMainWindow(win => {
      handled = true
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
      if (sessionId) win.webContents.send('menu:openSession', sessionId)
    })
  } catch { /* fall through to the window scan */ }

  if (handled) return true

  try {
    const windows = BrowserWindow.getAllWindows().filter(candidate =>
      candidate !== noticeWin && !candidate.isDestroyed())
    const target =
      windows.find(candidate => candidate.getTitle() === 'AIPA') ??
      windows.find(candidate => candidate.isVisible())
    if (!target) return false
    if (target.isMinimized()) target.restore()
    target.show()
    target.focus()
    if (sessionId) target.webContents.send('menu:openSession', sessionId)
    return true
  } catch (err) {
    log.warn('Could not focus AIPA for a notice:', err)
    return false
  }
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
      const focused = focusAipaMainWindow(record?.sessionId)
      if (focused) {
        destroyWindow(false)
      } else {
        // Nothing to focus: keep the log up and reflect the read state instead
        // of closing onto an unchanged desktop.
        emitUpdate()
      }
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
      destroyWindow(true)
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

  ipcMain.on('notice-center:report-height', (event: Electron.IpcMainEvent, height: unknown) => {
    if (!isSender(event)) return
    applyReportedHeight(height)
  })

  ipcMain.on('notice-center:close', (event: Electron.IpcMainEvent) => {
    if (!isSender(event)) return
    destroyWindow(true)
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

/** Close (and destroy) the notice centre. Safe to call when it is not open. */
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
