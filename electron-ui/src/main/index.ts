import { app, BrowserWindow, Menu, Tray, globalShortcut, nativeImage, shell, session, clipboard, Notification, screen } from 'electron'
import path from 'path'
import { initClawdIntegration, shutdownClawdIntegration } from './clawd-integration'
import { registerAllHandlers } from './ipc/index'
import { ptyManager } from './pty/pty-manager'
import { listSessions } from './sessions/session-reader'
import { getPref, setPref } from './config/config-manager'
import { createLogger } from './utils/logger'

const log = createLogger('main')
const isDev = process.env.NODE_ENV === 'development'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

// Expose quit state for embedded clawd (avoids passing closures through factory)
Object.defineProperty(global, '__aipaIsQuitting', {
  get: () => isQuitting,
  configurable: true,
})

function createWindow(): void {
  // Restore saved window bounds, or use defaults
  const savedBounds = getPref('windowBounds' as any) as { x: number; y: number; width: number; height: number; isMaximized: boolean } | null

  // Theme-aware startup: read saved theme to set correct initial colors
  const savedTheme = (getPref as any)('theme') || 'vscode'
  const isLightTheme = savedTheme === 'light' || (savedTheme === 'system' && false) // system theme resolved in renderer
  const bgColor = isLightTheme ? '#f5f5f7' : '#1e1e1e'
  const overlayColor = isLightTheme ? '#f8f8f8' : '#2c2c2c'
  const overlaySymbol = isLightTheme ? '#1a1a1a' : '#cccccc'

  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: savedBounds?.width || 1400,
    height: savedBounds?.height || 900,
    minWidth: 800,
    minHeight: 600,
    title: 'AIPA',
    backgroundColor: bgColor,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: overlayColor,
      symbolColor: overlaySymbol,
      height: 32,
    },
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  }
  // Only set x/y if we have saved position and it's still on a visible display
  if (savedBounds && savedBounds.x !== undefined && savedBounds.y !== undefined) {
    // Validate that at least part of the window is on a visible display
    try {
      const displays = screen.getAllDisplays()
      const centerX = savedBounds.x + (savedBounds.width || 1400) / 2
      const centerY = savedBounds.y + (savedBounds.height || 900) / 2
      const isOnScreen = displays.some(d => {
        const { x, y, width, height } = d.workArea
        return centerX >= x && centerX <= x + width && centerY >= y && centerY <= y + height
      })
      if (isOnScreen) {
        windowOptions.x = savedBounds.x
        windowOptions.y = savedBounds.y
      }
    } catch {
      // If screen API fails, skip position restore — OS will center the window
    }
  }

  mainWindow = new BrowserWindow(windowOptions)

  // Restore maximized state after window is created
  if (savedBounds?.isMaximized) {
    mainWindow.maximize()
  }

  // Debounced save of window bounds
  let boundsTimeout: ReturnType<typeof setTimeout> | null = null
  const saveBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (boundsTimeout) clearTimeout(boundsTimeout)
    boundsTimeout = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      const isMaximized = mainWindow.isMaximized()
      // Save normal (non-maximized) bounds so restore position is correct
      const bounds = isMaximized ? (mainWindow.getNormalBounds?.() || mainWindow.getBounds()) : mainWindow.getBounds()
      ;(setPref as any)('windowBounds', {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        isMaximized,
      })
    }, 500)
  }
  mainWindow.on('resize', saveBounds)
  mainWindow.on('move', saveBounds)
  mainWindow.on('maximize', saveBounds)
  mainWindow.on('unmaximize', saveBounds)

  // Register IPC handlers BEFORE loading the renderer to eliminate race conditions.
  // Previously, handlers were registered AFTER loadFile(), which could cause
  // ipcRenderer.invoke() to hang indefinitely if the renderer loaded from cache
  // faster than the main process could register handlers.
  registerAllHandlers(mainWindow)

  // Initialize embedded clawd desktop pet (if enabled in preferences)
  try { initClawdIntegration(mainWindow) } catch (err) {
    log.warn('initClawdIntegration failed (non-fatal):', String(err))
  }

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.webContents.on('console-message', (e) => {
      const level = (e as any).level ?? 1
      const message = (e as any).message ?? ''
      const line = (e as any).line ?? 0
      const sourceId = (e as any).sourceId ?? ''
      const prefix = ['verbose', 'info', 'warning', 'error'][level] || 'log'
      console.log(`[RENDERER:${prefix}] ${message}  (${sourceId}:${line})`)
    })
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  // Detect renderer load failure and attempt recovery
  let loadResolved = false
  mainWindow.webContents.once('did-finish-load', () => {
    loadResolved = true
    log.debug('Renderer did-finish-load fired successfully')
  })
  mainWindow.webContents.once('did-fail-load', (_e: any, errorCode: number, errorDescription: string) => {
    loadResolved = true
    log.warn(`Renderer did-fail-load: ${errorCode} ${errorDescription}`)
    // Attempt a single reload
    if (mainWindow && !mainWindow.isDestroyed()) {
      log.debug('Attempting renderer reload after did-fail-load...')
      mainWindow.webContents.reload()
    }
  })
  // Timeout: if renderer hasn't loaded in 10 seconds, attempt reload
  setTimeout(() => {
    if (!loadResolved && mainWindow && !mainWindow.isDestroyed()) {
      log.warn('Renderer load timeout (10s), attempting reload...')
      mainWindow.webContents.reload()
    }
  }, 10000)

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Minimize to tray instead of closing
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })
}

function setupCSP(): void {
  // Content Security Policy prevents XSS and unauthorized resource loading
  const prodCSP = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-src 'none'",
  ].join('; ')

  const devCSP = [
    "default-src 'self' http://localhost:5173 ws://localhost:5173",
    "script-src 'self' 'unsafe-eval' http://localhost:5173",
    "style-src 'self' 'unsafe-inline' http://localhost:5173",
    "img-src 'self' data: blob: http://localhost:5173",
    "connect-src 'self' http://localhost:5173 ws://localhost:5173",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ')

  const csp = isDev ? devCSP : prodCSP

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    })
  })
}

function createAppMenu(): void {
  // Build recent sessions submenu -- deferred to avoid blocking startup.
  // listSessions() reads ALL .jsonl files synchronously, which can take seconds
  // with hundreds of sessions. We start with a placeholder and rebuild async.
  let recentSessionItems: Electron.MenuItemConstructorOptions[] = [{ label: 'Loading...', enabled: false }]

  // Defer session loading to avoid blocking the main process event loop during startup
  setImmediate(() => {
    try {
      const sessions = listSessions()
      const sorted = sessions.sort((a, b) => b.timestamp - a.timestamp).slice(0, 10)
      if (sorted.length > 0) {
        recentSessionItems = sorted.map(s => ({
          label: (s.title || s.lastPrompt || 'Untitled').slice(0, 60),
          click: () => {
            mainWindow?.show()
            mainWindow?.focus()
            mainWindow?.webContents.send('menu:openSession', s.sessionId)
          },
        }))
      } else {
        recentSessionItems = [{ label: 'No recent sessions', enabled: false }]
      }
    } catch {
      recentSessionItems = [{ label: 'No recent sessions', enabled: false }]
    }
    // Rebuild the menu with actual session data
    rebuildAppMenu(recentSessionItems)
  })

  // Build initial menu with placeholder sessions (deferred load will rebuild)
  rebuildAppMenu(recentSessionItems)
}

function rebuildAppMenu(recentSessionItems: Electron.MenuItemConstructorOptions[]): void {
  const template = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { label: 'New Session', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('menu:newSession') },
        { label: 'Open Folder...', accelerator: 'CmdOrCtrl+O', click: () => mainWindow?.webContents.send('menu:openFolder') },
        {
          label: 'Recent Sessions',
          submenu: recentSessionItems,
        },
        { type: 'separator' },
        { label: 'Export Conversation', accelerator: 'CmdOrCtrl+Shift+E', click: () => mainWindow?.webContents.send('menu:exportConversation') },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: () => mainWindow?.webContents.send('menu:openSettings') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+B', click: () => mainWindow?.webContents.send('menu:toggleSidebar') },
        { label: 'Toggle Terminal', accelerator: 'CmdOrCtrl+`', click: () => mainWindow?.webContents.send('menu:toggleTerminal') },
        { label: 'Command Palette', accelerator: 'CmdOrCtrl+Shift+P', click: () => mainWindow?.webContents.send('menu:commandPalette') },
        { type: 'separator' },
        { label: 'Focus Mode', accelerator: 'CmdOrCtrl+Shift+O', click: () => mainWindow?.webContents.send('menu:toggleFocusMode') },
        { label: 'Always on Top', accelerator: 'CmdOrCtrl+Shift+T', click: () => mainWindow?.webContents.send('menu:toggleAlwaysOnTop') },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' as const },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Keyboard Shortcuts', accelerator: 'CmdOrCtrl+/', click: () => mainWindow?.webContents.send('menu:keyboardShortcuts') },
        { type: 'separator' },
        { label: 'About AIPA', click: () => mainWindow?.webContents.send('menu:about') },
        {
          label: 'Open Config Folder',
          click: () => {
            const configDir = path.join(require('os').homedir(), '.claude')
            shell.openPath(configDir)
          },
        },
      ],
    },
  ])
  Menu.setApplicationMenu(template)
}

function createTray(): void {
  // Create a 16x16 tray icon using nativeImage
  // Simple blue circle icon generated programmatically
  const iconSize = 16
  const canvas = `<svg xmlns="http://www.w3.org/2000/svg" width="${iconSize}" height="${iconSize}" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#2563eb"/><text x="8" y="12" text-anchor="middle" font-size="10" font-weight="bold" fill="white" font-family="sans-serif">A</text></svg>`
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(canvas).toString('base64')}`
  const trayIcon = nativeImage.createFromDataURL(dataUrl)

  tray = new Tray(trayIcon.resize({ width: 16, height: 16 }))
  tray.setToolTip('AIPA - AI Personal Assistant')

  // Build tray menu with placeholder, then rebuild async with real session data
  rebuildTrayMenu()

  // Rebuild tray menu dynamically on right-click so recent sessions stay current
  tray.on('right-click', () => {
    rebuildTrayMenu()
  })

  // Single click on tray icon toggles window visibility
  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow?.show()
      mainWindow?.focus()
    }
  })
}

/** Update tray tooltip with session count */
function updateTrayTooltip(): void {
  if (!tray) return
  try {
    const sessions = listSessions()
    tray.setToolTip(`AIPA - AI Personal Assistant (${sessions.length} sessions)`)
  } catch {
    tray.setToolTip('AIPA - AI Personal Assistant')
  }
}

/** Rebuild the tray context menu with current state (recent sessions, theme) */
function rebuildTrayMenu(): void {
  if (!tray) return

  // Fetch recent sessions (last 5, sorted by timestamp desc)
  let recentSessionItems: Electron.MenuItemConstructorOptions[] = []
  try {
    const sessions = listSessions()
    const sorted = sessions.sort((a, b) => b.timestamp - a.timestamp).slice(0, 5)
    if (sorted.length > 0) {
      recentSessionItems = sorted.map(s => ({
        label: (s.title || s.lastPrompt || 'Untitled').slice(0, 50),
        click: () => {
          mainWindow?.show()
          mainWindow?.focus()
          mainWindow?.webContents.send('menu:openSession', s.sessionId)
        },
      }))
    } else {
      recentSessionItems = [{ label: 'No recent sessions', enabled: false }]
    }
  } catch {
    recentSessionItems = [{ label: 'No recent sessions', enabled: false }]
  }

  // Detect current theme
  const currentTheme = (getPref as any)('theme') || 'vscode'
  const themeLabel = currentTheme === 'light' ? 'Switch to Dark Theme' : 'Switch to Light Theme'

  // Get working directory
  const workingDir = (getPref as any)('workingDir') || require('os').homedir()

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show AIPA',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      },
    },
    { type: 'separator' },
    {
      label: 'New Chat',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
        mainWindow?.webContents.send('menu:newSession')
      },
    },
    {
      label: 'Ask about Clipboard',
      click: () => {
        const clipboardText = clipboard.readText().trim()
        mainWindow?.show()
        mainWindow?.focus()
        if (clipboardText) {
          mainWindow?.webContents.send('menu:clipboardQuickAction', clipboardText)
        }
      },
    },
    {
      label: 'Recent Sessions',
      submenu: recentSessionItems,
    },
    { type: 'separator' },
    {
      label: themeLabel,
      click: () => {
        const newTheme = currentTheme === 'light' ? 'vscode' : 'light'
        ;(setPref as any)('theme', newTheme)
        mainWindow?.webContents.send('menu:themeChanged', newTheme)
        // Rebuild tray menu to update the theme label
        rebuildTrayMenu()
      },
    },
    {
      label: 'Open Working Directory',
      click: () => {
        shell.openPath(workingDir)
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])
  tray.setContextMenu(contextMenu)
  updateTrayTooltip()
}

function registerGlobalHotkey(): void {
  // Ctrl+Shift+Space to toggle AIPA window from anywhere
  const registered = globalShortcut.register('Ctrl+Shift+Space', () => {
    if (mainWindow?.isVisible() && mainWindow.isFocused()) {
      mainWindow.hide()
    } else {
      mainWindow?.show()
      mainWindow?.focus()
    }
  })
  if (registered) {
    log.info('Global hotkey registered: Ctrl+Shift+Space')
  } else {
    log.warn('Failed to register global hotkey: Ctrl+Shift+Space')
  }

  // Ctrl+Shift+G: Quick clipboard action — reads clipboard, opens AIPA, sends to chat
  const clipboardRegistered = globalShortcut.register('Ctrl+Shift+G', () => {
    const clipboardText = clipboard.readText().trim()
    mainWindow?.show()
    mainWindow?.focus()
    if (clipboardText) {
      mainWindow?.webContents.send('menu:clipboardQuickAction', clipboardText)
    }
  })
  if (clipboardRegistered) {
    log.info('Global hotkey registered: Ctrl+Shift+G (clipboard quick action)')
  } else {
    log.warn('Failed to register global hotkey: Ctrl+Shift+G')
  }
}

app.whenReady().then(() => {
  try {
    setupCSP()
  } catch (err) {
    log.warn('setupCSP failed (non-fatal):', String(err))
  }
  try {
    createAppMenu()
  } catch (err) {
    log.warn('createAppMenu failed (non-fatal):', String(err))
  }
  // createWindow is critical -- if this fails, the app is unusable
  createWindow()
  try {
    createTray()
  } catch (err) {
    log.warn('createTray failed (non-fatal):', String(err))
  }
  try {
    registerGlobalHotkey()
  } catch (err) {
    log.warn('registerGlobalHotkey failed (non-fatal):', String(err))
  }
  log.info('AIPA started')

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // Clean up all PTY sessions
  ptyManager.destroyAll()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  isQuitting = true
  // Run clawd cleanup hooks (registered during initClawdIntegration)
  try { shutdownClawdIntegration() } catch { /* best-effort */ }
  ptyManager.destroyAll()
  globalShortcut.unregisterAll()
})
