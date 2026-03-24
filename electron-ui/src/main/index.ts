import { app, BrowserWindow, Menu, shell } from 'electron'
import path from 'path'
import { registerAllHandlers } from './ipc/index'
import { ptyManager } from './pty/pty-manager'

const isDev = process.env.NODE_ENV === 'development'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
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
      sandbox: false,
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
        { label: 'About Claude Code UI', click: () => mainWindow?.webContents.send('menu:about') },
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

app.whenReady().then(() => {
  createAppMenu()
  createWindow()

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
  ptyManager.destroyAll()
})
