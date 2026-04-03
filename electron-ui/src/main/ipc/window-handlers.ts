import { ipcMain, BrowserWindow, desktopCapturer, powerSaveBlocker } from 'electron'
import { createLogger } from '../utils/logger'

const log = createLogger('ipc:window')

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

  // Capture a screenshot of the entire screen and return as base64 PNG data URL
  ipcMain.handle('window:captureScreen', async () => {
    try {
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
