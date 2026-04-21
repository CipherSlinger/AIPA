/**
 * clawd-integration.ts — AIPA adapter for the embedded Clawd desktop pet.
 *
 * Instead of spawning a separate Electron process and communicating via HTTP,
 * clawd runs inside AIPA's main process.  This module bridges the gap between
 * AIPA's preference system and the clawd factory's public API.
 */

import { BrowserWindow, app } from 'electron'
import * as path from 'path'
import { getPref } from './config/config-manager'
import { createLogger } from './utils/logger'

// Type declarations for global properties shared with clawd-factory.js
declare global {
  var __aipaIsQuitting: boolean | undefined
  var __clawdOnQuitHooks: Array<() => void> | undefined
}

// Clawd factory return type (CommonJS module, no TS declarations)
interface ClawdInstance {
  notifyState: (state: string, sessionId: string) => void
  isRunning: () => boolean
  getState: () => unknown
  getSessions: () => Map<string, unknown>
  getWindows: () => { win: BrowserWindow | null; hitWin: BrowserWindow | null }
}

const log = createLogger('clawd-integration')

let clawdInstance: ClawdInstance | null = null
let clawdInitError: string | null = null

/**
 * Initialize the embedded clawd desktop pet.
 * Called once from createWindow() after the main BrowserWindow is created.
 * Only initializes if the user has clawd enabled in preferences.
 */
export function initClawdIntegration(mainWindow: BrowserWindow): void {
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
    const rootModules = path.resolve(__dirname, '..', 'node_modules')
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
