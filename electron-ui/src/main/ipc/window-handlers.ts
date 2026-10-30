import { ipcMain, BrowserWindow, desktopCapturer, powerSaveBlocker, dialog, app } from 'electron'
import { createLogger } from '../utils/logger'
import { getPref } from '../config/config-manager'
import { shouldSuppressNativeNotification } from '../clawd-attention'
import { getClawdLanguage, showClawdNotice } from '../clawd-integration'
import { shortcutStatusSnapshot } from '../window/shortcut-status'

const { createTranslator } = require('../clawd/src/i18n') as {
  createTranslator: (getLang: () => string) => (key: string) => string
}
const petT = createTranslator(() => getClawdLanguage())

const log = createLogger('ipc:window')

/** The UI language, for labels the renderer shows verbatim (menu items). */
function isZhLocale(): boolean {
  const lang = (getPref as any)('language') || app.getLocale()
  return typeof lang === 'string' && lang.toLowerCase().startsWith('zh')
}

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
  const isZh = isZhLocale()
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
  // What the OS actually accepted at launch. Registration runs once and is not
  // retried here: calling this channel reports the recorded result, so Settings
  // can never turn a refused chord into an "available" row.
  ipcMain.handle('window:shortcutStatus', () => shortcutStatusSnapshot({ isZh: isZhLocale() }))

  ipcMain.handle('window:setTitleBarOverlay', (_e, opts: { color: string; symbolColor: string }) => {
    win.setTitleBarOverlay(opts)
  })

  // Flash the taskbar icon to attract attention (when window is not focused)
  ipcMain.handle('window:flashFrame', (_e, flash: boolean) => {
    if (!win.isDestroyed()) {
      win.flashFrame(flash)
    }
  })

  // Show a native OS notification with click-to-focus behavior.
  // `sessionId` identifies the conversation the notification is about, so the
  // pet only swallows the notice for the turn it already reported as failed.
  // Older renderers omit it; such a notification is not suppressed because it
  // cannot be attributed to any particular failure.
  ipcMain.handle('window:showNotification', (_e, opts: { title: string; body: string; sessionId?: string }) => {
    const sessionId = typeof opts?.sessionId === 'string' ? opts.sessionId : null
    // The pet is the notification for a failed background task; the renderer
    // sends its generic completion notice from the same result event.
    if (shouldSuppressNativeNotification(sessionId)) {
      log.debug('native notification suppressed — pet attention bubble is showing')
      return
    }
    // A finished turn while the user is elsewhere is the pet's best moment:
    // a HUD card says what finished, and clicking it reopens the conversation.
    // The native notification remains the fallback when the pet cannot speak.
    if (getPref('petTurnNotices' as any) !== false && !win.isDestroyed() && !win.isFocused()) {
      const shown = showClawdNotice({
        kind: 'success',
        title: opts.title,
        message: opts.body,
        pill: petT('noticeDonePill'),
        mode: 'done',
        lang: getClawdLanguage(),
        clickAction: 'open',
        typed: true,
      }, 7000, () => {
        if (win.isDestroyed()) return
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
        if (sessionId) win.webContents.send('menu:openSession', sessionId)
      })
      if (shown) return
    }
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
