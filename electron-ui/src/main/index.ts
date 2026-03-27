import { app, BrowserWindow, Menu, Tray, globalShortcut, nativeImage, shell, session } from 'electron'
import path from 'path'
import { registerAllHandlers } from './ipc/index'
import { ptyManager } from './pty/pty-manager'
import { createLogger } from './utils/logger'

const log = createLogger('main')
const isDev = process.env.NODE_ENV === 'development'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'AIPA',
    backgroundColor: '#1e1e1e',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#2c2c2c',
      symbolColor: '#cccccc',
      height: 32,
    },
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Register IPC handlers, passing the window for push events
  registerAllHandlers(mainWindow)

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
    "script-src 'self'",
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
  const template = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { label: 'New Session', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('menu:newSession') },
        { label: 'Open Folder...', accelerator: 'CmdOrCtrl+O', click: () => mainWindow?.webContents.send('menu:openFolder') },
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
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+B', click: () => mainWindow?.webContents.send('menu:toggleSidebar') },
        { label: 'Toggle Terminal', accelerator: 'CmdOrCtrl+`', click: () => mainWindow?.webContents.send('menu:toggleTerminal') },
        { label: 'Command Palette', accelerator: 'CmdOrCtrl+Shift+P', click: () => mainWindow?.webContents.send('menu:commandPalette') },
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
  const icon = nativeImage.createEmpty()
  // Use a built-in icon approach: create from data URL
  const canvas = `<svg xmlns="http://www.w3.org/2000/svg" width="${iconSize}" height="${iconSize}" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#2563eb"/><text x="8" y="12" text-anchor="middle" font-size="10" font-weight="bold" fill="white" font-family="sans-serif">A</text></svg>`
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(canvas).toString('base64')}`
  const trayIcon = nativeImage.createFromDataURL(dataUrl)

  tray = new Tray(trayIcon.resize({ width: 16, height: 16 }))
  tray.setToolTip('AIPA - AI Personal Assistant')

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
}

app.whenReady().then(() => {
  setupCSP()
  createAppMenu()
  createWindow()
  createTray()
  registerGlobalHotkey()
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
  ptyManager.destroyAll()
  globalShortcut.unregisterAll()
})
