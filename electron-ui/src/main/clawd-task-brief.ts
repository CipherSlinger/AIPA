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
 *     task has no conversation yet.
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
import { listTasks, type TaskRecord, type TaskStatus, type TaskView } from './tasks/task-store'
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
  /** Latest conversation on this task, when one has run. */
  sessionId?: string
}

/** Everything the renderer needs for one paint. */
export interface ClawdTaskBriefPayload {
  tasks: ClawdTaskBriefItem[]
  /** Active tasks on the desk, including rows the four-row card cannot show. */
  total: number
  /** Pet language: "en" | "zh" | "ko". */
  lang: string
  theme: ClawdBriefTheme
  labels: Record<string, string>
  /** The summon chord actually claimed, or '' when every candidate was taken. */
  shortcut: string
}

type BriefActionType = 'open' | 'open-tasks' | 'close'

interface BriefAction {
  type?: unknown
  id?: unknown
}

// Width is fixed; height follows the content between these bounds. Four rows
// plus the header and footer stay well under the cap, and the cap keeps a
// future row expansion from becoming a full-screen slab.
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

/** How many rows fit under the cap without scrolling. */
const ROW_LIMIT = 4

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

function activeTasks(tasks: TaskView[]): TaskView[] {
  return tasks
    .filter(task => STATUS_ORDER[task.status] !== undefined)
    .sort((a, b) => {
      const rank = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99)
      return rank !== 0 ? rank : b.updatedAt - a.updatedAt
    })
}

function toItem(task: TaskView, departments: Map<string, string>): ClawdTaskBriefItem {
  const sessionId = latestSessionId(task)
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    // A routed task whose node is missing from the snapshot keeps its id
    // rather than masquerading as unassigned.
    department: task.departmentId
      ? (departments.get(task.departmentId) || task.departmentId)
      : '',
    materials: task.materials.length,
    updatedAt: task.updatedAt,
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
  return {
    tasks: active.slice(0, ROW_LIMIT).map(task => toItem(task, departments)),
    total: active.length,
    lang: petLanguage(),
    theme: petTheme(),
    labels: briefLabels(),
    shortcut: claimedShortcut,
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
  const height = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(rawHeight)))
  const area = workAreaFor(lastAnchor)
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

/**
 * Focus AIPA and hand it one navigation event. Returns false when the main
 * window is gone, so the caller can keep the brief up instead of closing onto
 * an unchanged desktop.
 */
function focusAipa(event: 'menu:openSession' | 'menu:openTasks', sessionId?: string): boolean {
  let handled = false
  try {
    withClawdMainWindow(win => {
      handled = true
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
      if (event === 'menu:openSession' && sessionId) win.webContents.send(event, sessionId)
      else if (event === 'menu:openTasks') win.webContents.send(event)
    })
  } catch { /* fall through to the window scan */ }

  if (handled) return true

  try {
    const windows = BrowserWindow.getAllWindows().filter(candidate =>
      candidate !== briefWin && !candidate.isDestroyed())
    const target =
      windows.find(candidate => candidate.getTitle() === 'AIPA') ??
      windows.find(candidate => candidate.isVisible())
    if (!target) return false
    if (target.isMinimized()) target.restore()
    target.show()
    target.focus()
    if (event === 'menu:openSession' && sessionId) target.webContents.send(event, sessionId)
    else if (event === 'menu:openTasks') target.webContents.send(event)
    return true
  } catch (err) {
    log.warn('Could not focus AIPA for the task brief:', err)
    return false
  }
}

function handleAction(action: unknown): ClawdTaskBriefPayload {
  const input = (action && typeof action === 'object' ? action : {}) as BriefAction
  const type = typeof input.type === 'string' ? input.type as BriefActionType : null
  const id = typeof input.id === 'string' ? input.id : ''

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
      const sessionId = latestSessionId(task)
      const focused = sessionId
        ? focusAipa('menu:openSession', sessionId)
        : focusAipa('menu:openTasks')
      if (focused) destroyWindow(false)
      else { actionInFlight = false; emitUpdate() }
      return buildPayload()
    }
    case 'open-tasks': {
      actionInFlight = true
      if (focusAipa('menu:openTasks')) destroyWindow(false)
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
    return isSender(event) ? buildPayload() : emptyPayload()
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
    ? chord.replace(/^CommandOrControl/, 'Ctrl').replace(/^Control/, 'Ctrl')
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
      // reset the row order under the user's cursor.
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
