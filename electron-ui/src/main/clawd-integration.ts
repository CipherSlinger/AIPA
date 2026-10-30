/**
 * clawd-integration.ts — AIPA adapter for the embedded Clawd desktop pet.
 *
 * Instead of spawning a separate Electron process and communicating via HTTP,
 * clawd runs inside AIPA's main process.  This module bridges the gap between
 * AIPA's preference system and the clawd factory's public API.
 */

import { BrowserWindow, app, MenuItemConstructorOptions } from 'electron'
import * as path from 'path'
import { getPref, setPref } from './config/config-manager'
import { clearClawdNotices, listClawdNotices, recordClawdNotice } from './clawd-notifications'
import { createLogger } from './utils/logger'

// Type declarations for global properties shared with clawd-factory.js
declare global {
  var __aipaIsQuitting: boolean | undefined
  var __clawdOnQuitHooks: Array<() => void> | undefined
}

/**
 * The bubble's vocabulary. `approval`/`clarification` are actionable and come
 * from the attention queue; `system`/`info`/`success`/`warning`/`error`/`quest`
 * are the transient notices and the newer attention kinds. The bubble only
 * uses this to choose an accent, an icon and an eyebrow label — it never
 * decides whether an action is required.
 */
export type ClawdBubbleKind =
  | 'system'
  | 'info'
  | 'success'
  | 'warning'
  | 'error'
  | 'quest'
  | 'approval'
  | 'clarification'

export type ClawdBubbleTheme = 'sao' | 'clawd'

export interface ClawdBubbleMetaRow {
  label: string
  value: string
}

export interface ClawdBubbleProgress {
  value: number
  max?: number
  label?: string
}

export interface ClawdBubbleAction {
  id: string
  label: string
  variant?: string
  /** Optional tooltip, e.g. the keyboard shortcut the action mirrors. */
  hint?: string
}

/**
 * Payload for a background attention bubble. `lang` is the pet UI language,
 * `clickAction` is the action id resolved when the user clicks the card, and
 * `pill` is a short label for the coloured badge.
 *
 * The fields after `actions` are the HUD additions from the SAO-inspired wave.
 * They are all optional: a payload that omits them renders exactly the card
 * it always did, which is what the updater bubble and older callers do.
 */
export interface ClawdAttentionBubblePayload {
  title: string
  message: string
  pill: string
  mode: 'attention' | 'done' | 'error' | 'checking' | 'available' | 'downloading' | 'ready' | 'up-to-date'
  lang: string
  /** Action id resolved when the card (or the pet) is clicked. */
  clickAction: string
  /** Optional explicit buttons; the whole card is clickable regardless. */
  actions?: ClawdBubbleAction[]
  /** Accent/icon/eyebrow vocabulary. Absent = the original plain card. */
  kind?: ClawdBubbleKind
  /** Overrides the kind-derived eyebrow ("SYSTEM", "ALERT", …). */
  eyebrow?: string
  /** Small label/value rows under the body (session id, job, elapsed time). */
  meta?: ClawdBubbleMetaRow[]
  progress?: ClawdBubbleProgress
  /** Display-only countdown; the main process owns the actual dismissal. */
  countdownMs?: number
  /** Position in the attention queue, shown as "1/3" when there are more. */
  queue?: { index: number; total: number }
  /** `sao` opts into the HUD skin; anything else keeps the plain card. */
  theme?: ClawdBubbleTheme
  /** Synthesized cue; silence when audio is unavailable or muted. */
  sound?: 'system' | 'notify' | 'success' | 'warning' | 'error' | 'none'
  /** Set false to render the message at once (actionable cards do this). */
  typed?: boolean
}

// Clawd factory return type (CommonJS module, no TS declarations)
interface ClawdInstance {
  notifyState: (state: string, sessionId: string) => void
  isRunning: () => boolean
  getState: () => unknown
  getSessions: () => Map<string, unknown>
  getWindows: () => { win: BrowserWindow | null; hitWin: BrowserWindow | null }
  toggleVisibility: () => void
  isPetHidden: () => boolean
  isDoNotDisturb: () => boolean
  toggleDoNotDisturb: () => void
  getSize: () => string
  setSize: (s: string) => void
  getBubbleFollow: () => boolean
  setBubbleFollow: (v: boolean) => void
  getSoundMuted: () => boolean
  setSoundMuted: (v: boolean) => void
  openSettings: () => void
  resetPosition: () => void
  showAttentionBubble: (payload: ClawdAttentionBubblePayload) => Promise<string | null>
  hideAttentionBubble: () => void
  isAttentionBubbleVisible: () => boolean
  getLanguage: () => string
  getBubblesHidden: () => boolean
  setBubblesHidden: (v: boolean) => void
  setLanguage: (lang: string) => void
}

const log = createLogger('clawd-integration')

// The pet's own string table, so a preview says the same thing the live
// bubbles do in the pet's language.
const { createTranslator } = require('./clawd/src/i18n') as {
  createTranslator: (getLang: () => string) => (key: string) => string
}
const petT = createTranslator(() => getClawdLanguage())

let clawdInstance: ClawdInstance | null = null
let clawdInitError: string | null = null
let mainWindowRef: BrowserWindow | null = null

/**
 * Called when the user clicks the pet or its attention bubble. The attention
 * module sets this; kept here (rather than as a factory argument per call) so
 * the factory can be created before the attention module exists.
 */
let attentionActivateHandler: (() => void) | null = null

/** Register the handler that runs when the pet is clicked while attention is up. */
export function setClawdAttentionActivateHandler(fn: (() => void) | null): void {
  attentionActivateHandler = fn
}

/**
 * Initialize the embedded clawd desktop pet.
 * Called once from createWindow() after the main BrowserWindow is created.
 * Only initializes if the user has clawd enabled in preferences.
 */
export function initClawdIntegration(mainWindow: BrowserWindow): void {
  mainWindowRef = mainWindow
  const clawdEnabled = getPref('clawdEnabled' as any) as boolean | undefined
  log.info('initClawdIntegration called, clawdEnabled =', clawdEnabled)
  if (!clawdEnabled) {
    log.debug('clawd is disabled in preferences, skipping initialization')
    return
  }

  try {
    log.info('Attempting to load clawd factory...')

    // Patch module resolution so clawd can find htmlparser2/koffi from
    // the root node_modules/ (dist/main/ has no node_modules of its own).
    const rootModules = app.isPackaged
      ? path.join(app.getAppPath(), 'node_modules')
      : path.resolve(__dirname, '..', '..', 'node_modules')
    if (!module.paths.includes(rootModules)) {
      module.paths.unshift(rootModules)
    }

    const factoryPath = require.resolve('./clawd/src/clawd-factory')
    log.info('Factory resolved to:', factoryPath)

    const createClawd = require('./clawd/src/clawd-factory')
    log.info('Factory loaded, calling createClawd...')

    clawdInstance = createClawd({
      mainWindow,
      isQuitting: () => globalThis.__aipaIsQuitting ?? false,
      onQuit: (fn: () => void) => {
        if (!globalThis.__clawdOnQuitHooks) globalThis.__clawdOnQuitHooks = []
        globalThis.__clawdOnQuitHooks.push(fn)
      },
      // The factory sends `attention-open` from the pet's hit window; forward
      // it to whoever owns the current attention item.
      onAttentionActivate: () => {
        try {
          attentionActivateHandler?.()
        } catch (err) {
          log.warn('attention activate handler threw:', String(err))
        }
      },
    })

    log.info('clawd desktop pet initialized (embedded mode)')
    clawdInitError = null
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.stack || err.message : String(err)
    clawdInitError = errMsg
    log.error('Failed to initialize clawd integration:', errMsg)
  }
}

/**
 * Notify the embedded clawd instance of AIPA session state changes.
 * Replaces the old HTTP POST to 127.0.0.1:23333/state.
 *
 * If clawd is not running or not initialized, this is a silent no-op.
 */
export function notifyClawdState(state: string, sessionId: string): void {
  if (!clawdInstance) return
  try {
    clawdInstance.notifyState(state, sessionId)
  } catch {
    // Silent no-op — clawd may have crashed or been destroyed
  }
}

/**
 * Check whether the embedded clawd instance is running.
 * Replaces the old GET /health HTTP check.
 */
export function isClawdRunning(): Promise<boolean> {
  if (!clawdInstance) {
    log.debug('isClawdRunning: no instance, initError =', clawdInitError ? 'YES' : 'none')
    return Promise.resolve(false)
  }
  try {
    return Promise.resolve(clawdInstance.isRunning())
  } catch {
    return Promise.resolve(false)
  }
}

/**
 * Request the embedded clawd instance to show/launch.
 * In embedded mode this focuses the existing clawd windows rather than
 * spawning a new process.
 */
export function launchClawd(): void {
  if (!clawdInstance) {
    log.warn('launchClawd called but clawd is not initialized, initError =', clawdInitError ? 'YES' : 'none')
    if (clawdInitError) {
      log.warn('  Init error was:', clawdInitError.slice(0, 500))
    }
    return
  }
  try {
    const wins = clawdInstance.getWindows()
    if (wins?.win && !wins.win.isDestroyed()) {
      wins.win.showInactive()
    }
  } catch (err) {
    log.warn('launchClawd failed:', String(err))
  }
}

/**
 * Whether the pet can display an attention bubble at all. The attention module
 * uses this to decide whether it should fall back to a native notification.
 */
export function isClawdAttentionAvailable(): boolean {
  if (!clawdInstance) return false
  try {
    return clawdInstance.isRunning()
  } catch {
    return false
  }
}

/**
 * The pet's own "Hide Bubbles" setting. Honouring it keeps the background
 * alert from becoming a second, unwanted notification surface.
 */
export function isClawdBubblesHidden(): boolean {
  if (!clawdInstance) return false
  try {
    return clawdInstance.getBubblesHidden()
  } catch {
    return false
  }
}

/**
 * Whether the user armed a timed silence from the tray ("Quiet for 30 min").
 * Unlike the pet's sleep toggle this needs no timer: it is a stored deadline,
 * so it survives a restart and expires on its own.
 */
export function isClawdQuietActive(): boolean {
  const until = getPref('petQuietUntil' as any)
  return typeof until === 'number' && until > Date.now()
}

/** Arm (or with 0, cancel) the timed silence. */
export function setClawdQuietMinutes(minutes: number): void {
  setPref('petQuietUntil' as any, minutes > 0 ? Date.now() + minutes * 60_000 : 0)
}

/** Whether the user put the pet to sleep (its own "Do Not Disturb"). */
export function isClawdDoNotDisturb(): boolean {
  if (!clawdInstance) return false
  try {
    return clawdInstance.isDoNotDisturb()
  } catch {
    return false
  }
}

/** Whether the user hid the pet ("Show Clawd" toggle in its tray menu). */
export function isClawdPetHidden(): boolean {
  if (!clawdInstance) return true
  try {
    return clawdInstance.isPetHidden()
  } catch {
    return true
  }
}

/** The pet's UI language ("en" | "zh" | "ko"), or "en" when the pet is off. */
export function getClawdLanguage(): string {
  if (!clawdInstance) return 'en'
  try {
    return clawdInstance.getLanguage() || 'en'
  } catch {
    return 'en'
  }
}

/**
 * Run `fn` against the AIPA main window when it still exists. Used by notice
 * click-throughs, which must focus/open something without owning the window.
 */
export function withClawdMainWindow(fn: (win: BrowserWindow) => void): void {
  const win = mainWindowRef
  if (!win || win.isDestroyed()) return
  try {
    fn(win)
  } catch (err) {
    log.warn('withClawdMainWindow callback threw:', String(err))
  }
}

/**
 * Apply a pet preference written from AIPA Settings to the running pet.
 * `clawd:setPrefs` writes the file, but the live instance kept reading its
 * in-memory copy — a size or DND change only took effect after a restart.
 * Keys without a setter (position, theme) still need a restart.
 */
export function applyClawdPetPref(key: string, value: unknown): void {
  if (!clawdInstance) return
  try {
    switch (key) {
      case 'size':
        if (typeof value === 'string' && value) clawdInstance.setSize(value)
        break
      case 'lang':
        if (value === 'en' || value === 'zh' || value === 'ko') clawdInstance.setLanguage(value)
        break
      case 'soundMuted':
        clawdInstance.setSoundMuted(value === true)
        break
      case 'bubbleFollowPet':
        clawdInstance.setBubbleFollow(value === true)
        break
      case 'hideBubbles':
        clawdInstance.setBubblesHidden(value === true)
        break
      case 'doNotDisturb': {
        const wanted = value === true
        if (clawdInstance.isDoNotDisturb() !== wanted) clawdInstance.toggleDoNotDisturb()
        break
      }
      default:
        break
    }
  } catch (err) {
    log.warn('applyClawdPetPref failed:', String(err))
  }
}

/** The pet's own sound switch ("Sound Effects" in its menu). */
export function isClawdSoundMuted(): boolean {
  if (!clawdInstance) return false
  try {
    return clawdInstance.getSoundMuted()
  } catch {
    return false
  }
}

const KIND_SOUND: Record<ClawdBubbleKind, 'system' | 'notify' | 'success' | 'warning' | 'error'> = {
  approval: 'system',
  clarification: 'system',
  success: 'success',
  warning: 'warning',
  error: 'error',
  quest: 'notify',
  info: 'notify',
  system: 'notify',
}

/**
 * Fill in the HUD vocabulary a caller did not specify: the skin from the app
 * preference and a cue from the bubble kind, silenced when the pet is muted.
 * Callers may still override either field; nothing here invents a kind, so a
 * plain payload stays a plain card if the caller never set one.
 */
function applyHudDefaults(payload: ClawdAttentionBubblePayload): ClawdAttentionBubblePayload {
  const theme: ClawdBubbleTheme =
    payload.theme ?? ((getPref('petBubbleTheme' as any) as string) === 'clawd' ? 'clawd' : 'sao')
  const kind = payload.kind
  const sound = payload.sound ?? (isClawdSoundMuted() ? 'none' : kind ? KIND_SOUND[kind] : 'notify')
  return { ...payload, theme, sound }
}

/**
 * Show an attention bubble and resolve with the chosen action id ("open" or
 * "dismiss"), or null when the item was superseded or the bubble was hidden.
 * Resolves null immediately when the pet is not available.
 */
export function showClawdAttentionBubble(payload: ClawdAttentionBubblePayload): Promise<string | null> {
  // A real attention item outranks any transient notice on the same window.
  // Clear the notice's dismissal timer first, or it would hide the attention
  // card a few seconds later as if the user had dismissed it.
  cancelClawdNotice()
  if (!clawdInstance) return Promise.resolve(null)
  try {
    return clawdInstance.showAttentionBubble(applyHudDefaults(payload)).catch((err: unknown) => {
      log.warn('showAttentionBubble failed:', String(err))
      return null
    })
  } catch (err) {
    log.warn('showAttentionBubble threw:', String(err))
    return Promise.resolve(null)
  }
}

/** Remove the attention bubble. Safe to call when nothing is shown. */
export function hideClawdAttentionBubble(): void {
  cancelClawdNotice()
  if (!clawdInstance) return
  try {
    clawdInstance.hideAttentionBubble()
  } catch {
    // Silent — the pet may already be gone.
  }
}

/**
 * The auto-dismiss timer for the transient notice on screen. Kept here rather
 * than in the attention queue because a notice is not an attention item: it
 * has no request to answer and nothing to retract.
 */
let noticeTimer: NodeJS.Timeout | null = null

/** Stop the pending dismissal, if any. Idempotent. */
export function cancelClawdNotice(): void {
  if (!noticeTimer) return
  clearTimeout(noticeTimer)
  noticeTimer = null
}

/**
 * Show a passive notice (boot greeting, finished turn, context warning).
 * Returns false when the pet cannot speak or an actionable bubble is already
 * on screen — a notice must never replace something the user still has to
 * answer. The card disappears on its own after `ttlMs`; clicking it still
 * resolves `clickAction`, so "Open" remains available while it is visible.
 */
export function showClawdNotice(
  payload: ClawdAttentionBubblePayload,
  ttlMs = 7000,
  onClick?: (action: string | null) => void,
): boolean {
  if (!clawdInstance) return false
  if (isClawdBubblesHidden() || isClawdPetHidden()) return false
  if (isClawdAttentionBubbleVisible()) return false
  // A notice arriving while the pet is asleep would wake it for something the
  // user does not have to act on. Sleep and a timed silence are both explicit
  // "leave me alone".
  if (isClawdDoNotDisturb() || isClawdQuietActive()) return false
  try {
    cancelClawdNotice()
    void Promise.resolve(clawdInstance.showAttentionBubble({
      ...applyHudDefaults(payload),
      requireAction: false,
    } as ClawdAttentionBubblePayload & { requireAction: false }))
      .then(action => {
        // A notice needs no answer, but a click on it is still a shortcut: the
        // caller decides what "open" means (focus the window, open a session).
        if (action) onClick?.(action)
      })
      .catch(() => { /* pet gone */ })
    const ttl = Math.max(2000, Math.min(20_000, Math.round(ttlMs)))
    noticeTimer = setTimeout(() => {
      noticeTimer = null
      try { clawdInstance?.hideAttentionBubble() } catch { /* pet gone */ }
    }, ttl)
    recordClawdNotice({
      kind: payload.kind || 'system',
      title: payload.title,
      message: payload.message,
      detail: payload.meta?.map(row => `${row.label}: ${row.value}`).join('\n'),
    })
    return true
  } catch (err) {
    log.warn('showClawdNotice failed:', String(err))
    return false
  }
}

/**
 * Preview the HUD card: a quest-complete notice with meta rows, a finished
 * progress bar and the countdown strip. Used by the pet's tray menu and by
 * Settings so the skin can be seen without waiting for a background event.
 * Returns false when the pet cannot speak right now.
 */
export function showClawdTestNotice(): boolean {
  const ttl = 9000
  return showClawdNotice(
    {
      kind: 'quest',
      title: petT('noticeTestTitle'),
      message: petT('noticeTestBody'),
      pill: petT('noticeTestPill'),
      mode: 'done',
      lang: getClawdLanguage(),
      clickAction: 'open',
      typed: true,
      meta: [
        { label: 'SYSTEM', value: 'AIPA' },
        { label: 'HUD', value: 'v1' },
      ],
      progress: { value: 3, max: 3, label: 'LINK' },
      countdownMs: ttl,
    },
    ttl,
  )
}

/** Whether an attention bubble is currently on screen. */
export function isClawdAttentionBubbleVisible(): boolean {
  if (!clawdInstance) return false
  try {
    return clawdInstance.isAttentionBubbleVisible()
  } catch {
    return false
  }
}

/**
 * Shut down the embedded clawd instance and clean up.
 * Called when the user disables clawd in settings or on app quit.
 */
export function shutdownClawdIntegration(): void {
  if (!clawdInstance) return
  try {
    if (globalThis.__clawdOnQuitHooks) {
      for (const hook of globalThis.__clawdOnQuitHooks) {
        try { hook() } catch { /* ignore */ }
      }
      globalThis.__clawdOnQuitHooks = []
    }
    const wins = clawdInstance.getWindows()
    if (wins?.hitWin && !wins.hitWin.isDestroyed()) wins.hitWin.destroy()
    if (wins?.win && !wins.win.isDestroyed()) wins.win.destroy()
    clawdInstance = null
    log.info('clawd integration shut down')
  } catch (err) {
    log.warn('shutdownClawdIntegration failed:', String(err))
  }
}

/**
 * Get the last initialization error (for debugging).
 */
export function getClawdInitError(): string | null {
  return clawdInitError
}

/**
 * Generate desktop pet submenu items for AIPA's main system tray menu.
 */
export function getClawdSubmenu(
  isZh: boolean,
  onMenuAction?: () => void
): MenuItemConstructorOptions {
  if (!clawdInstance || !clawdInstance.isRunning()) {
    return {
      label: isZh ? '桌面宠物 (Clawd)' : 'Desktop Pet (Clawd)',
      submenu: [
        {
          label: isZh ? '启动桌面宠物' : 'Launch Desktop Pet',
          click: () => {
            setPref('clawdEnabled' as any, true)
            const mainWin = mainWindowRef
            if (mainWin && !mainWin.isDestroyed()) {
              initClawdIntegration(mainWin)
            }
            onMenuAction?.()
          },
        },
      ],
    }
  }

  const isHidden = clawdInstance.isPetHidden()
  const isDnd = clawdInstance.isDoNotDisturb()
  const quietUntil = isClawdQuietActive() ? (getPref('petQuietUntil' as any) as number) : 0
  const currentSize = clawdInstance.getSize()
  const bubbleFollow = clawdInstance.getBubbleFollow()
  const soundMuted = clawdInstance.getSoundMuted()

  // The last few things the pet said, so a notice the user missed is still
  // reachable without a separate window. Clicking one reopens its session.
  const notices = listClawdNotices().slice(0, 6)
  const recentItems: MenuItemConstructorOptions[] = notices.map(notice => ({
    label: `${new Date(notice.at).toLocaleTimeString()} · ${notice.title}`,
    click: () => {
      withClawdMainWindow(win => {
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
        if (notice.sessionId) win.webContents.send('menu:openSession', notice.sessionId)
      })
    },
  }))
  if (!recentItems.length) {
    recentItems.push({
      label: isZh ? '（暂无通知）' : '(no announcements yet)',
      enabled: false,
    })
  }

  const sizeOptions = [
    { label: isZh ? '微型 (5%)' : 'Tiny (5%)', size: 'P:5' },
    { label: isZh ? '小型 (8%)' : 'Small (8%)', size: 'P:8' },
    { label: isZh ? '中型 (10%)' : 'Medium (10%)', size: 'P:10' },
    { label: isZh ? '大型 (15%)' : 'Large (15%)', size: 'P:15' },
  ]

  return {
    label: isZh ? '桌面宠物 (Clawd)' : 'Desktop Pet (Clawd)',
    submenu: [
      {
        label: isHidden ? (isZh ? '显示桌宠' : 'Show Pet') : (isZh ? '隐藏桌宠' : 'Hide Pet'),
        click: () => {
          clawdInstance?.toggleVisibility()
          onMenuAction?.()
        },
      },
      {
        label: isDnd ? (isZh ? '唤醒桌宠' : 'Wake Up Pet') : (isZh ? '让桌宠休眠 (免打扰)' : 'Sleep (Do Not Disturb)'),
        click: () => {
          clawdInstance?.toggleDoNotDisturb()
          onMenuAction?.()
        },
      },
      {
        label: quietUntil > 0
          ? (isZh
              ? `静默中 · 至 ${new Date(quietUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : `Silenced · until ${new Date(quietUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`)
          : (isZh ? '临时静默…' : 'Silence For…'),
        submenu: [
          {
            label: isZh ? '30 分钟' : '30 minutes',
            click: () => { setClawdQuietMinutes(30); onMenuAction?.() },
          },
          {
            label: isZh ? '1 小时' : '1 hour',
            click: () => { setClawdQuietMinutes(60); onMenuAction?.() },
          },
          {
            label: isZh ? '3 小时' : '3 hours',
            click: () => { setClawdQuietMinutes(180); onMenuAction?.() },
          },
          {
            label: isZh ? '恢复提醒' : 'Resume alerts',
            enabled: quietUntil > 0,
            click: () => { setClawdQuietMinutes(0); onMenuAction?.() },
          },
        ],
      },
      { type: 'separator' },
      {
        label: isZh ? '宠物大小' : 'Pet Size',
        submenu: sizeOptions.map(opt => ({
          label: opt.label,
          type: 'radio' as const,
          checked: currentSize === opt.size,
          click: () => {
            clawdInstance?.setSize(opt.size)
            onMenuAction?.()
          },
        })),
      },
      {
        label: isZh ? '气泡提示跟随' : 'Bubble Follows Pet',
        type: 'checkbox' as const,
        checked: bubbleFollow,
        click: (item) => {
          clawdInstance?.setBubbleFollow(item.checked)
          onMenuAction?.()
        },
      },
      {
        label: isZh ? '静音音效' : 'Mute Sound Effects',
        type: 'checkbox' as const,
        checked: soundMuted,
        click: (item) => {
          clawdInstance?.setSoundMuted(item.checked)
          onMenuAction?.()
        },
      },
      {
        label: isZh ? '测试提示气泡' : 'Test Announcement',
        click: () => {
          showClawdTestNotice()
        },
      },
      {
        label: isZh ? '最近的通知' : 'Recent Announcements',
        submenu: [
          ...recentItems,
          { type: 'separator' as const },
          {
            label: isZh ? '清空通知记录' : 'Clear Announcement History',
            enabled: notices.length > 0,
            click: () => {
              clearClawdNotices()
              onMenuAction?.()
            },
          },
        ],
      },
      { type: 'separator' },
      {
        label: isZh ? '重置位置 (回到右下角)' : 'Reset Position to Bottom Right',
        click: () => {
          clawdInstance?.resetPosition()
        },
      },
      {
        label: isZh ? '桌宠详细设置...' : 'Pet Settings...',
        click: () => {
          clawdInstance?.openSettings()
        },
      },
      { type: 'separator' },
      {
        label: isZh ? '关闭桌宠' : 'Close Desktop Pet',
        click: () => {
          setPref('clawdEnabled' as any, false)
          shutdownClawdIntegration()
          onMenuAction?.()
        },
      },
    ],
  }
}
