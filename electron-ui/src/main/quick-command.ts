/**
 * quick-command — the HUD bar behind the pet's ASK petal and the global
 * shortcut. One line in, one real Codex turn out; the answer arrives as a pet
 * notice, so AIPA never has to open or steal focus for a quick question.
 *
 * The window is created on demand and destroyed on close, like the radial pet
 * menu: a hidden BrowserWindow would keep a GPU surface alive for every ask and
 * would still answer IPC after the pet was hidden or the app quit. It is
 * focusable because typing is the whole point, skipped from the taskbar, and
 * clamped to the work area of the display the pet is on.
 *
 * The turn is started as an internal bridge (internal-tagged id). That is the
 * existing "no UI can answer this" path: Codex approvals are pinned to `never`
 * and an elicitation with no listener is declined by the bridge instead of
 * parking the turn for ten minutes on a card no window can resolve. It is
 * persisted (`ephemeral:false`) so the reply's session id is a real
 * conversation the notice can open.
 *
 * By default the ask continues the conversation the user has open in AIPA: the
 * target is resolved once, when the bar opens, from `active-session.ts` (the
 * renderer's "I opened this" signal plus the turns it sent). The chip says
 * which decision Enter will make, and one click flips it for that ask only.
 * With no trustworthy target the bar says NEW CONVERSATION, exactly as before.
 */
import { app, BrowserWindow, ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { getPref } from './config/config-manager'
import { getAllowedFsRoots, isValidSessionId, safePath } from './utils/validate'
import { registerCodexSendMessage } from './ipc/register/cli/send-message'
import { abortCliTurn } from './ipc/register/cli/register-cli-handlers'
import { showClawdNotice, withClawdMainWindow } from './clawd-integration'
import { resolveQuickCommandTarget, type QuickCommandTarget } from './active-session'
import type { BridgeSink } from './ipc/register/types'
import type { IpcMainEvent, Rectangle } from 'electron'

const WIDTH = 408
/** The bar with no suggestion list. The page asks for more when it shows one. */
const HEIGHT = 152
/**
 * Ceiling on how much taller the suggestion list may make the bar. Five rows
 * plus their micro-label come to ~163 px; the slack covers the rounded skin.
 */
const MAX_EXTRA_HEIGHT = 200
const HISTORY_LIMIT = 40
const HISTORY_MAX_CHARS = 2000
const EDGE_MARGIN = 8
const PET_GAP = 10
// A local page either loads or it does not; this only guards the ready
// handshake so a renderer that never reports back cannot leave an invisible,
// focused window over the desktop.
const REVEAL_TIMEOUT_MS = 900
// The bar is revealed after it painted. A blur in the first moment is the owner
// window losing activation, not the user clicking away.
const BLUR_ARM_MS = 250
const isMac = process.platform === 'darwin'
const isWin = process.platform === 'win32'
const isLinux = process.platform === 'linux'
const WIN_TOPMOST_LEVEL = 'pop-up-menu'
const LINUX_WINDOW_TYPE = 'toolbar'
/** The notice card is a summary, not a transcript. */
const REPLY_LIMIT = 700

export interface QuickCommandLabels {
  ask: string
  placeholder: string
  send: string
  cancel: string
  starting: string
  empty: string
  busy: string
  failed: string
  turnFailed: string
  replyTitle: string
  replyPill: string
  noReply: string
  errorTitle: string
  errorPill: string
  metaTime: string
  metaTools: string
  /** `CONTINUE · <name>` chip on the open bar. */
  continueChip: string
  /** `NEW CONVERSATION` chip. */
  newChip: string
  switchToNew: string
  switchToContinue: string
  /** A remembered thread the engine refused on resume. */
  continueFailed: string
  /** CONTINUE was requested after the target had gone. */
  continueUnavailable: string
  /** Fallback name when the store knows the thread but has no title yet. */
  untitledThread: string
}

/** The pet factory's labels plus the two history captions read from i18n. */
interface QuickCommandShowLabels extends QuickCommandLabels {
  historyLabel: string
  historyHint: string
}

/** One accepted ask. `at` is an epoch millisecond stamp for the row's age. */
interface HistoryEntry {
  text: string
  at: number
}

interface QuickCommandI18nModule {
  createTranslator?: (getLang: () => string) => (key: string) => string
  i18n?: Record<string, Record<string, string>>
}

export interface QuickCommandContext {
  /** The pet's BrowserWindow, used as the anchor and the focus fallback. */
  win: BrowserWindow | null
  getNearestWorkArea: (cx: number, cy: number) => Rectangle
  getHitRectScreen: (bounds: Rectangle) => { left: number; top: number; right: number; bottom: number } | null
  getLang: () => string
  getLabels: () => QuickCommandLabels
  getTheme: () => string
  isBusy: () => boolean
  guardAlwaysOnTop?: (w: BrowserWindow) => void
  reapplyMacVisibility?: () => void
  hideFromTaskbar?: (w: BrowserWindow) => void
}

interface PendingStart {
  cancelled: boolean
  bridgeId: string | null
  /** Thread this turn was asked to continue; a last-resort notice target. */
  targetId: string | null
  /** Per Codex item id; the last item with text is the final answer. */
  texts: Map<string, string>
  lastTextItem: string
  toolCount: number
  turnError: string
  done: boolean
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function cleanErrorText(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  return raw.replace(/^[A-Za-z]*Error:\s*/, '').trim()
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return ''
  if (ms < 1000) return `${Math.round(ms)}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`
  const whole = Math.floor(seconds)
  return `${Math.floor(whole / 60)}m ${String(whole % 60).padStart(2, '0')}s`
}

function clipReply(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length <= REPLY_LIMIT) return trimmed
  return `${trimmed.slice(0, REPLY_LIMIT).trimEnd()}…`
}

function sanitizeHistoryText(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  return trimmed.length > HISTORY_MAX_CHARS ? trimmed.slice(0, HISTORY_MAX_CHARS) : trimmed
}

/**
 * The history captions are quickCommand* keys like every other bar string, but
 * getLabels is owned by the pet factory. Read them from the same table here so
 * the new strings still live in i18n.js for all three languages.
 */
function readHistoryLabels(lang: string): { historyLabel: string; historyHint: string } {
  try {
    const table = require('./clawd/src/i18n') as QuickCommandI18nModule
    const translate = typeof table.createTranslator === 'function'
      ? table.createTranslator(() => lang)
      : (key: string) => table.i18n?.en?.[key] || ''
    return {
      historyLabel: translate('quickCommandHistoryLabel'),
      historyHint: translate('quickCommandHistoryHint'),
    }
  } catch {
    // A missing table must not take the bar down; the history surfaces just
    // render without captions.
    return { historyLabel: '', historyHint: '' }
  }
}

export default function initQuickCommand(ctx: QuickCommandContext) {
  let barWin: BrowserWindow | null = null
  let previousFocus: BrowserWindow | null = null
  let revealTimer: NodeJS.Timeout | null = null
  let blurArmedAt = 0
  let starting: PendingStart | null = null
  /** Turns whose bar has closed but whose result has not arrived yet. */
  const running = new Map<string, PendingStart>()
  /**
   * The conversation this bar offered when it opened, or null for NEW. Held
   * here (not trusted from the page) so a submitted target always belongs to
   * the bar the user saw; reset on every open/close, never sticky.
   */
  let target: QuickCommandTarget | null = null
  /** Newest first. Reloaded at every open, updated only by an accepted ask. */
  let history: HistoryEntry[] = []
  /** Window height in device-independent pixels, grown for suggestions. */
  let barHeight = HEIGHT

  function historyPath(): string {
    return path.join(app.getPath('userData'), 'quick-command-history.json')
  }

  /**
   * Any I/O or parse failure is "no history": a corrupt file must never keep
   * the bar from opening, and the next accepted ask rewrites it.
   */
  function loadHistory(): HistoryEntry[] {
    let raw: string
    try {
      raw = fs.readFileSync(historyPath(), 'utf-8')
    } catch {
      return []
    }
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      const entries: HistoryEntry[] = []
      const seen = new Set<string>()
      for (const item of parsed) {
        if (!item || typeof item !== 'object') continue
        const record = item as Record<string, unknown>
        const text = sanitizeHistoryText(record.text)
        if (!text || seen.has(text)) continue
        seen.add(text)
        const at = typeof record.at === 'number' && Number.isFinite(record.at) && record.at > 0
          ? record.at
          : 0
        entries.push({ text, at })
        if (entries.length >= HISTORY_LIMIT) break
      }
      return entries
    } catch {
      return []
    }
  }

  /**
   * Newest-first on disk. tmp+rename means a crash mid-write cannot truncate
   * the file; a failed write loses this prompt but never throws into the turn.
   */
  function persistHistory(entries: HistoryEntry[]): void {
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
      console.warn('Clawd: quick command history write failed:', cleanErrorText(err))
    }
  }

  function rememberPrompt(prompt: string): void {
    const text = sanitizeHistoryText(prompt)
    if (!text) return
    const next: HistoryEntry[] = [{ text, at: Date.now() }]
    for (const entry of history) {
      if (entry.text === text) continue
      next.push(entry)
      if (next.length >= HISTORY_LIMIT) break
    }
    history = next
    persistHistory(next)
  }

  function clearRevealTimer(): void {
    if (!revealTimer) return
    clearTimeout(revealTimer)
    revealTimer = null
  }

  function isOpen(): boolean {
    return !!(barWin && !barWin.isDestroyed() && barWin.isVisible())
  }

  /**
   * Whether asking now would stack a second turn.
   *
   * The app's pet activity strip only follows user-facing bridges; a quick
   * command runs as an internal bridge on purpose (no renderer stream, no
   * approval surface), so its own turn would otherwise be invisible here and
   * a second ask would start alongside it. `running` closes that gap.
   */
  function busyNow(): boolean {
    return ctx.isBusy() === true || running.size > 0
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
   * Destroy the bar. `restoreFocus` is what keeps dismissing the HUD from
   * handing the keyboard to AIPA: the window that owned focus when the bar
   * opened gets it back, and only when there was none does the pet take it.
   */
  function close(restoreFocus = true): void {
    clearRevealTimer()
    blurArmedAt = 0
    // The per-ask choice dies with the bar.
    target = null
    const win = barWin
    barWin = null
    // A start still in flight is cancelled with the bar. The turn may already
    // have been created by the time the send resolves, so the caller aborts it
    // once the bridge id is known (see handleSubmit).
    if (starting) {
      starting.cancelled = true
      starting = null
    }
    if (win && !win.isDestroyed()) {
      try { win.destroy() } catch (err) {
        console.warn('Clawd: quick command destroy failed:', cleanErrorText(err))
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
   * shortcut is a way to ask, not a toggle that can silently swallow a
   * half-typed question.
   */
  function open(): boolean {
    if (barWin && !barWin.isDestroyed()) {
      if (!barWin.isVisible()) {
        reveal()
      } else {
        barWin.focus()
      }
      sendToBar('quick-command-focus', {})
      return true
    }
    if (!ctx.win || ctx.win.isDestroyed()) return false
    barHeight = HEIGHT
    history = loadHistory()
    const bounds = computeBounds(HEIGHT)
    if (!bounds) return false
    // Resolve once, before the window exists: the chip and whatever the submit
    // resolves to must describe the same conversation even if the renderer
    // reports a switch while the bar is up. A lookup failure degrades to NEW,
    // never to a guess.
    try {
      target = resolveQuickCommandTarget()
    } catch (err) {
      target = null
      console.warn('Clawd: quick command target lookup failed:', cleanErrorText(err))
    }
    let labels: QuickCommandShowLabels
    try {
      labels = { ...ctx.getLabels(), ...readHistoryLabels(ctx.getLang()) }
    } catch (err) {
      console.warn('Clawd: quick command labels failed:', cleanErrorText(err))
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
          preload: path.join(__dirname, 'clawd', 'src', 'preload-quick-command.js'),
          nodeIntegration: false,
          contextIsolation: true,
          backgroundThrottling: false,
        },
      })
    } catch (err) {
      barWin = null
      console.warn('Clawd: quick command window creation failed:', cleanErrorText(err))
      return false
    }

    if (isWin) barWin.setAlwaysOnTop(true, WIN_TOPMOST_LEVEL)
    if (isLinux) barWin.setSkipTaskbar(true)
    if (typeof ctx.guardAlwaysOnTop === 'function') ctx.guardAlwaysOnTop(barWin)

    barWin.on('blur', () => {
      // Click-away dismisses an idle bar, but never a start the user already
      // committed to with Enter: the turn is already being accepted.
      if (Date.now() < blurArmedAt) return
      if (starting) return
      close(false)
    })
    barWin.on('closed', () => {
      clearRevealTimer()
      barWin = null
      previousFocus = null
      target = null
      barHeight = HEIGHT
    })

    barWin.webContents.once('did-finish-load', () => {
      if (!barWin || barWin.isDestroyed()) return
      sendToBar('quick-command-show', {
        lang: ctx.getLang(),
        theme: ctx.getTheme() === 'clawd' ? 'clawd' : 'sao',
        labels,
        busy: busyNow(),
        // Newest first, all of them: the page shows five and recalls the rest.
        history: history.map(entry => ({ text: entry.text, at: entry.at })),
        // One word for the decision, one human name for what it will touch.
        // The page never sends an id back; it only says which half of the chip
        // the user chose, and main resolves that against this captured target.
        target: {
          canContinue: !!target,
          mode: target ? 'continue' : 'new',
          label: target ? (target.label || target.id.slice(0, 8)) : '',
        },
      })
    })
    barWin.webContents.on('did-fail-load', (_event, _code, _desc, _url, isMainFrame) => {
      if (isMainFrame === false) return
      close()
    })
    barWin.webContents.on('render-process-gone', () => close())

    barWin.loadFile(path.join(__dirname, 'clawd', 'src', 'quick-command.html'))

    // If the page never reports that it painted, showing it would leave an
    // invisible window that still swallows clicks and the keyboard.
    revealTimer = setTimeout(() => close(false), REVEAL_TIMEOUT_MS)
    revealTimer.unref?.()
    return true
  }

  function isSender(event: IpcMainEvent): boolean {
    if (!barWin || barWin.isDestroyed()) return false
    return BrowserWindow.fromWebContents(event.sender) === barWin
  }

  function showBarError(message: string, kind: 'error' | 'empty' | 'busy'): void {
    sendToBar('quick-command-error', { message, kind })
  }

  /**
   * Collect the answer as it streams. A reply can start arriving before
   * `registerCodexSendMessage` resolves (it resolves after turn/start), so the
   * sink is wired before the await; nothing here depends on the bar still being
   * on screen.
   */
  function makeSink(attempt: PendingStart): BridgeSink {
    return (channel, data) => {
      if (attempt.cancelled || attempt.done) return
      if (channel === 'cli:assistantText') {
        const itemId = typeof data.itemId === 'string' && data.itemId ? data.itemId : '__text'
        const text = typeof data.text === 'string' ? data.text : ''
        if (!text) return
        attempt.texts.set(itemId, (attempt.texts.get(itemId) || '') + text)
        attempt.lastTextItem = itemId
        return
      }
      if (channel === 'cli:toolUse') {
        attempt.toolCount += 1
        return
      }
      if (channel === 'cli:turnError') {
        if (data.willRetry === true) return
        if (typeof data.message === 'string' && data.message) attempt.turnError = data.message
        return
      }
      if (channel === 'cli:result') {
        finishTurn(attempt, data)
      }
    }
  }

  function replyText(attempt: PendingStart): string {
    const last = attempt.lastTextItem ? attempt.texts.get(attempt.lastTextItem) || '' : ''
    if (last.trim()) return last
    // A turn whose last item was not text (a tool-only answer, an interrupted
    // stream) still has earlier assistant text; the longest item is the best
    // available summary of what the model said.
    let best = ''
    for (const value of attempt.texts.values()) {
      if (value.length > best.length) best = value
    }
    return best
  }

  function focusSession(sessionId: string): void {
    if (!isValidSessionId(sessionId)) return
    withClawdMainWindow(win => {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
      win.webContents.send('menu:openSession', sessionId)
    })
  }

  /**
   * A quick turn is single-shot. Keeping its internal app-server alive would
   * leave one idle process per ask, and a later CONTINUE that resumes the same
   * thread would race a server still holding the thread's old in-memory state.
   * Abort is deferred one tick so the bridge's remaining result listeners (the
   * notice, dream bookkeeping) finish before the process goes away.
   */
  function reapBridge(bridgeId: string | null): void {
    if (!bridgeId) return
    setImmediate(() => {
      try { abortCliTurn(bridgeId) } catch { /* already gone */ }
    })
  }

  function finishTurn(attempt: PendingStart, data: Record<string, unknown>): void {
    if (attempt.done) return
    attempt.done = true
    if (attempt.bridgeId) running.delete(attempt.bridgeId)
    reapBridge(attempt.bridgeId)
    const labels = ctx.getLabels()
    // The engine's reported thread wins; a resumed turn's requested id is the
    // honest fallback if an older build omits it, so the notice still opens the
    // conversation that actually ran.
    const sessionRaw = data.claudeSessionId ?? data.codexThreadId ?? attempt.targetId
    const sessionId = typeof sessionRaw === 'string' && isValidSessionId(sessionRaw) ? sessionRaw : ''
    const subtype = typeof data.subtype === 'string' ? data.subtype : 'unknown'

    if (subtype === 'success') {
      const text = replyText(attempt)
      const meta: Array<{ label: string; value: string }> = []
      const duration = typeof data.durationMs === 'number' ? data.durationMs : null
      if (duration !== null) {
        const value = formatDuration(duration)
        if (value) meta.push({ label: labels.metaTime, value })
      }
      if (attempt.toolCount > 0) {
        meta.push({ label: labels.metaTools, value: String(attempt.toolCount) })
      }
      showClawdNotice(
        {
          kind: 'quest',
          title: labels.replyTitle,
          message: clipReply(text) || labels.noReply,
          pill: labels.replyPill,
          mode: 'done',
          lang: ctx.getLang(),
          clickAction: 'open',
          typed: true,
          ...(sessionId ? { sessionId } : {}),
          ...(meta.length ? { meta } : {}),
        },
        8000,
        action => {
          if (action && sessionId) focusSession(sessionId)
        },
      )
      return
    }

    if (subtype === 'error') {
      const raw = attempt.turnError
        || (typeof (data.event as Record<string, unknown> | undefined)?.turn === 'object'
          ? String((((data.event as Record<string, unknown>).turn as Record<string, unknown>).error as Record<string, unknown> | undefined)?.message || '')
          : '')
        || labels.turnFailed
      showClawdNotice(
        {
          kind: 'error',
          title: labels.errorTitle,
          message: clipReply(raw) || labels.turnFailed,
          pill: labels.errorPill,
          mode: 'error',
          lang: ctx.getLang(),
          clickAction: 'open',
          typed: true,
          ...(sessionId ? { sessionId } : {}),
        },
        9000,
        action => {
          if (action && sessionId) focusSession(sessionId)
        },
      )
      return
    }
    // interrupted is the user stopping; unknown is not a statement of failure.
    // Neither earns a card: the pet must not claim a task failed when it did not.
  }

  /**
   * Start the turn. A busy user-facing turn is refused rather than steered:
   * the pet knows the activity owner's bridge id but not the live turn id
   * `cli:steerTurn` requires, and merging a fresh question into a turn this
   * bar cannot name would answer the wrong conversation.
   *
   * The page sends `{ prompt, mode }`; a bare string is the old one-payload
   * contract and means "the target this bar opened with". CONTINUE supplies the
   * thread id captured at open, NEW supplies none. The page never names an id.
   */
  async function handleSubmit(raw: unknown): Promise<void> {
    if (starting) return
    const payload = raw && typeof raw === 'object' ? raw as Record<string, unknown> : null
    const prompt = typeof raw === 'string'
      ? raw.trim()
      : (typeof payload?.prompt === 'string' ? payload.prompt.trim() : '')
    if (!prompt) {
      showBarError(ctx.getLabels().empty, 'empty')
      return
    }
    if (busyNow()) {
      showBarError(ctx.getLabels().busy, 'busy')
      return
    }

    // The page names the choice it displayed. Anything else (a stale page, a
    // malformed payload) falls back to what this bar opened with.
    const rawMode = payload?.mode
    const mode = rawMode === 'continue' || rawMode === 'new'
      ? rawMode
      : (target ? 'continue' : 'new')
    const continueId = mode === 'continue' ? target?.id ?? null : null
    if (mode === 'continue' && !continueId) {
      showBarError(ctx.getLabels().continueUnavailable, 'error')
      return
    }

    let cwd = ''
    try {
      const workingDir = (getPref('workingDir')) || os.homedir()
      cwd = safePath(workingDir, getAllowedFsRoots(workingDir))
    } catch (err) {
      const detail = cleanErrorText(err)
      showBarError(detail ? `${ctx.getLabels().failed}: ${detail}` : ctx.getLabels().failed, 'error')
      return
    }

    const attempt: PendingStart = {
      cancelled: false,
      bridgeId: null,
      targetId: continueId,
      texts: new Map(),
      lastTextItem: '',
      toolCount: 0,
      turnError: '',
      done: false,
    }
    starting = attempt
    sendToBar('quick-command-pending', { label: ctx.getLabels().starting })

    let result: { success: boolean; sessionId?: string; error?: string }
    try {
      result = await registerCodexSendMessage(
        {
          prompt,
          cwd,
          // Only CONTINUE resumes; NEW omits the id exactly as before.
          ...(continueId ? { sessionId: continueId } : {}),
          model: getPref('model'),
          permissionMode: getPref('permissionMode'),
          // Persist the thread: the reply notice opens it afterwards.
          ephemeral: false,
          internalTag: 'quick-command',
        },
        makeSink(attempt),
        // Internal: no renderer-facing event stream, no approval/elicitation
        // surface that cannot be answered. The thread is persisted above.
        true,
        { requireAuth: true },
      )
    } catch (err) {
      result = { success: false, error: cleanErrorText(err) }
    }

    if (starting === attempt) starting = null

    if (attempt.cancelled) {
      // Esc / click-away landed while the app-server was starting. If the turn
      // did start, stop it: nothing the user cancelled may keep running.
      if (result.success && result.sessionId) {
        try { abortCliTurn(result.sessionId) } catch { /* bridge already gone */ }
      }
      return
    }

    if (!result.success) {
      // Lead with what happened in the user's own language; the engine's
      // message ("not signed in", "Process exited with code 1") is detail, not
      // the whole sentence. Keep the bar open so the prompt is not lost.
      //
      // A refused resume is not a generic start failure: say which promise
      // broke and stay on CONTINUE. The engine rejects before any new thread
      // exists, so nothing was silently started under the CONTINUE label; the
      // user can click the chip to NEW and press Enter again.
      const detail = cleanErrorText(result.error)
      const lead = continueId
        ? ctx.getLabels().continueFailed
        : ctx.getLabels().failed
      showBarError(detail ? `${lead}: ${detail}` : lead, 'error')
      return
    }

    // A turn was accepted, so this prompt has earned its place in history.
    // Every refusal above (empty, busy, no key, bad cwd, failed resume) and a
    // cancelled start return before this line and are never remembered.
    rememberPrompt(prompt)

    if (attempt.done) {
      // finishTurn ran before this promise resolved, so the bridge was never
      // registered in `running`; reap it here instead.
      reapBridge(result.sessionId || null)
    }

    attempt.bridgeId = result.sessionId || null
    if (attempt.bridgeId && !attempt.done) running.set(attempt.bridgeId, attempt)
    // Accepted. The turn now owns its own life; the bar has done its job.
    close(true)
  }

  const handleReady = (event: IpcMainEvent) => {
    if (!isSender(event)) return
    reveal()
  }
  const handleSubmitEvent = (event: IpcMainEvent, raw: unknown) => {
    if (!isSender(event)) return
    void handleSubmit(raw)
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
   * The suggestion list asks for extra height and gives it back when it hides.
   * The payload is a hint, not a size: main owns the ceiling and re-anchors the
   * bar to the pet so a grown window still clamps inside the work area.
   */
  const handleResize = (event: IpcMainEvent, raw: unknown) => {
    if (!isSender(event) || !barWin || barWin.isDestroyed()) return
    const payload = raw && typeof raw === 'object' ? raw as Record<string, unknown> : null
    const requested = payload && typeof payload.extra === 'number' ? payload.extra : 0
    const extra = Number.isFinite(requested)
      ? clamp(Math.round(requested), 0, MAX_EXTRA_HEIGHT)
      : 0
    const height = HEIGHT + extra
    if (height === barHeight) return
    const bounds = computeBounds(height)
    if (!bounds) return
    barHeight = height
    try {
      barWin.setBounds(bounds)
    } catch (err) {
      console.warn('Clawd: quick command resize failed:', cleanErrorText(err))
    }
  }

  ipcMain.on('quick-command-ready', handleReady)
  ipcMain.on('quick-command-submit', handleSubmitEvent)
  ipcMain.on('quick-command-close', handleClose)
  ipcMain.on('quick-command-focus', handleFocus)
  ipcMain.on('quick-command-resize', handleResize)

  function cleanup(): void {
    close(false)
    ipcMain.removeListener('quick-command-ready', handleReady)
    ipcMain.removeListener('quick-command-submit', handleSubmitEvent)
    ipcMain.removeListener('quick-command-close', handleClose)
    ipcMain.removeListener('quick-command-focus', handleFocus)
    ipcMain.removeListener('quick-command-resize', handleResize)
    // A quick turn still running at quit has no bar to report to; abort it so
    // the app-server process does not outlive the app.
    for (const attempt of running.values()) {
      attempt.cancelled = true
      if (attempt.bridgeId) {
        try { abortCliTurn(attempt.bridgeId) } catch { /* already gone */ }
      }
    }
    running.clear()
  }

  return {
    open,
    close,
    isOpen,
    cleanup,
    getWindow: () => barWin,
  }
}
