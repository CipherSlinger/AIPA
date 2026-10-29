import { app, BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { isClawdRunning, launchClawd } from '../../clawd-bridge'
import { getClawdInitError } from '../../clawd-integration'
import { safeHandle } from './safe-handle'

// ----------------------------------------
// Clawd desktop pet handlers (Iteration 615)
// ----------------------------------------
export function registerClawdHandlers(): void {
  safeHandle('clawd:launch', async () => {
    try {
      const running = await isClawdRunning()
      if (!running) {
        launchClawd()
      }
      return { success: true, alreadyRunning: running }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  safeHandle('clawd:isRunning', async () => {
    try {
      return { running: await isClawdRunning() }
    } catch {
      return { running: false }
    }
  })

  safeHandle('clawd:getInitError', async () => {
    return { error: getClawdInitError() }
  })

  // Read/write clawd prefs from the embedded pet's prefs file
  safeHandle('clawd:getPrefs', async () => {
    try {
      const prefsPath = path.join(app.getPath('userData'), 'clawd-prefs.json')
      const raw = JSON.parse(fs.readFileSync(prefsPath, 'utf8'))
      return { prefs: raw }
    } catch {
      return { prefs: {} }
    }
  })

  safeHandle('clawd:setPrefs', async (_e, key: string, value: unknown) => {
    try {
      const prefsPath = path.join(app.getPath('userData'), 'clawd-prefs.json')
      let prefs: Record<string, unknown> = {}
      try { prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8')) } catch {}
      prefs[key] = value
      fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2))

      // Notify the running clawd instance to apply the change immediately
      // via its settings controller IPC handler
      try {
        const mainWindow = BrowserWindow.getAllWindows()[0]
        if (mainWindow) {
          mainWindow.webContents.send('clawd:prefsChanged', key, value)
        }
      } catch { /* best-effort */ }

      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })
}
