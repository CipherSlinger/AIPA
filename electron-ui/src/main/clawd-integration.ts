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
import { createLogger } from './utils/logger'

// Type declarations for global properties shared with clawd-factory.js
declare global {
  var __aipaIsQuitting: boolean | undefined
  var __clawdOnQuitHooks: Array<() => void> | undefined
}

/**
 * Payload for a background attention bubble. `lang` is the pet UI language,
 * `clickAction` is the action id resolved when the user clicks the card, and
 * `pill` is a short label for the coloured badge.
 */
export interface ClawdAttentionBubblePayload {
  title: string
  message: string
  pill: string
  mode: 'attention' | 'done'
  lang: string
  /** Action id resolved when the card (or the pet) is clicked. */
  clickAction: string
  /** Optional explicit buttons; the whole card is clickable regardless. */
  actions?: Array<{ id: string; label: string; variant?: string }>
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
}

const log = createLogger('clawd-integration')

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
 * Show an attention bubble and resolve with the chosen action id ("open" or
 * "dismiss"), or null when the item was superseded or the bubble was hidden.
 * Resolves null immediately when the pet is not available.
 */
export function showClawdAttentionBubble(payload: ClawdAttentionBubblePayload): Promise<string | null> {
  if (!clawdInstance) return Promise.resolve(null)
  try {
    return clawdInstance.showAttentionBubble(payload).catch((err: unknown) => {
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
  if (!clawdInstance) return
  try {
    clawdInstance.hideAttentionBubble()
  } catch {
    // Silent — the pet may already be gone.
  }
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
  const currentSize = clawdInstance.getSize()
  const bubbleFollow = clawdInstance.getBubbleFollow()
  const soundMuted = clawdInstance.getSoundMuted()

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
