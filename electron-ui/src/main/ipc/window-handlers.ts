import { ipcMain, BrowserWindow, desktopCapturer, powerSaveBlocker, dialog, app } from 'electron'
import { createLogger } from '../utils/logger'
import { getPref } from '../config/config-manager'

const log = createLogger('ipc:window')

// ── Screen-capture consent ──
//
// `window:captureScreen` returns a full-screen bitmap, so it needs the user's
// permission, not just the renderer's. A renderer-side signal proves nothing
// (an injected script or a malformed prompt could call the IPC), and a stored
// preference is not a boundary either — `prefs:set` lets the renderer write
// any key, so it could flip its own permission on. The only trustworthy
// gesture available to the main process is a native dialog, so the first
// request in each app session shows one. "Allow" is cached in this module for
// the rest of the session; the next launch asks again.
//
// This keeps the preload/renderer contract unchanged: the existing toolbar
// button still calls `window:captureScreen`, and a denial simply resolves to
// `null` (the renderer already reports "screenshot failed").
let captureAllowed = false
let pendingConsent: Promise<boolean> | null = null

async function requestCaptureConsent(win: BrowserWindow): Promise<boolean> {
  if (pendingConsent) return pendingConsent
  const lang = (getPref as any)('language') || app.getLocale()
  const isZh = typeof lang === 'string' && lang.toLowerCase().startsWith('zh')
  const options: Electron.MessageBoxOptions = {
    type: 'question',
    buttons: isZh ? ['允许截图', '取消'] : ['Allow screenshot', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
    title: isZh ? '屏幕截图权限' : 'Screen capture permission',
    message: isZh ? '允许 AIPA 截取整个屏幕？' : 'Allow AIPA to capture your screen?',
    detail: isZh
      ? '截图会附加到当前对话并发送给 AI 模型。本次运行期间将不再询问。'
      : 'The screenshot is attached to the current conversation and sent to the AI model. AIPA will not ask again until it restarts.',
  }
  pendingConsent = (async () => {
    try {
      const result = win && !win.isDestroyed()
        ? await dialog.showMessageBox(win, options)
        : await dialog.showMessageBox(options)
      const allowed = result.response === 0
      captureAllowed = allowed
      log.info(`Screen capture ${allowed ? 'allowed' : 'denied'} by user`)
      return allowed
    } catch (err) {
      log.warn('Screen capture consent dialog failed:', String(err))
      return false
    } finally {
      pendingConsent = null
    }
  })()
  return pendingConsent
}

export function registerWindowHandlers(win: BrowserWindow): void {
  ipcMain.handle('window:setTitleBarOverlay', (_e, opts: { color: string; symbolColor: string }) => {
    win.setTitleBarOverlay(opts)
  })

  // Flash the taskbar icon to attract attention (when window is not focused)
  ipcMain.handle('window:flashFrame', (_e, flash: boolean) => {
    if (!win.isDestroyed()) {
      win.flashFrame(flash)
    }
  })

  // Show a native OS notification with click-to-focus behavior
  ipcMain.handle('window:showNotification', (_e, opts: { title: string; body: string }) => {
    const { Notification } = require('electron')
    if (!Notification.isSupported()) return
    const notif = new Notification({
      title: opts.title,
      body: opts.body,
      silent: true, // We handle our own completion sound
    })
    notif.on('click', () => {
      if (!win.isDestroyed()) {
        win.show()
        win.focus()
      }
    })
    notif.show()
  })

  ipcMain.handle('window:toggleMaximize', () => {
    if (win.isDestroyed()) return
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  })

  // Always-on-top (pin window above all others)
  ipcMain.handle('window:setAlwaysOnTop', (_e, onTop: boolean) => {
    if (!win.isDestroyed()) {
      win.setAlwaysOnTop(onTop, 'floating')
    }
  })

  ipcMain.handle('window:isAlwaysOnTop', () => {
    if (win.isDestroyed()) return false
    return win.isAlwaysOnTop()
  })

  // Capture a screenshot of the entire screen and return as base64 PNG data URL.
  // Requires prior consent — see `requestCaptureConsent()` above.
  ipcMain.handle('window:captureScreen', async (event) => {
    try {
      // Only the app's own top-level document may ask; a frame that ended up
      // somewhere unexpected (or a future sub-frame preload) is refused.
      const senderUrl = event.senderFrame?.url ?? ''
      if (senderUrl.startsWith('http') && !senderUrl.startsWith('http://localhost:5173')) {
        log.warn('window:captureScreen rejected for non-app origin:', senderUrl)
        return null
      }
      if (!captureAllowed) {
        const owner = BrowserWindow.fromWebContents(event.sender) ?? win
        if (!(await requestCaptureConsent(owner))) {
          log.warn('window:captureScreen denied — no user consent')
          return null
        }
      }
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1920, height: 1080 },
      })
      if (sources.length === 0) return null
      // Use the primary screen (first source)
      const primary = sources[0]
      const thumbnail = primary.thumbnail
      if (thumbnail.isEmpty()) return null
      const pngBuffer = thumbnail.toPNG()
      const base64 = pngBuffer.toString('base64')
      return `data:image/png;base64,${base64}`
    } catch (err) {
      log.error('Screenshot capture failed:', err)
      return null
    }
  })

  // Prevent system idle sleep while AI is streaming (uses Electron powerSaveBlocker)
  let preventSleepId: number | null = null
  ipcMain.handle('window:preventSleep', (_e, prevent: boolean) => {
    if (prevent) {
      if (preventSleepId === null || !powerSaveBlocker.isStarted(preventSleepId)) {
        preventSleepId = powerSaveBlocker.start('prevent-display-sleep')
        log.info('Prevent sleep started, id:', preventSleepId)
      }
    } else {
      if (preventSleepId !== null && powerSaveBlocker.isStarted(preventSleepId)) {
        powerSaveBlocker.stop(preventSleepId)
        log.info('Prevent sleep stopped, id:', preventSleepId)
        preventSleepId = null
      }
    }
  })
}
