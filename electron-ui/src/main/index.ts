import { app, BrowserWindow, Menu, Tray, globalShortcut, nativeImage, shell, session, clipboard, Notification, screen, protocol } from 'electron'
import path from 'path'
import fs from 'fs'
import { initClawdIntegration, shutdownClawdIntegration, getClawdSubmenu } from './clawd-integration'
import { initClawdAttention, shutdownClawdAttention } from './clawd-attention'
import { abortAllPluginAi } from './plugins/plugin-services'
import { listNavPlugins } from './plugins/nav-plugin-manager'
import { decodePluginPath, pluginHost } from './plugins/plugin-url'
import { endAllPluginEdits } from './plugins/plugin-edit-session'
import { registerAllHandlers } from './ipc/index'
import { buildAutomationsSubmenu } from './automation-menu'
import { listAutomationJobs, runAutomationNow, setAutomationPausedAll } from './automation/scheduler'
import type { AutomationJobView } from './automation/types'
import { ptyManager } from './pty/pty-manager'
import { listSessions } from './sessions/session-reader'
import { saveNow as saveSessionIndexNow } from './sessions/session-index-cache'
import { getPref, setPref } from './config/config-manager'
import { claimSummonChord, summonWindowActions, type SummonChord } from './window/summon'
import {
  CLIPBOARD_QUICK_ACTION_CHORD,
  recordClipboardRegistration,
  recordSummonRegistration,
  showAipaMenuLabel,
} from './window/shortcut-status'
import { createLogger } from './utils/logger'

const log = createLogger('main')
const isDev = process.env.NODE_ENV === 'development'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

/**
 * The session rows last handed to `rebuildAppMenu`. Automation changes force a
 * rebuild, and the session list is unrelated to them (and expensive to read),
 * so reuse the rows already computed instead of rescanning every transcript.
 */
let appMenuRecentSessions: Electron.MenuItemConstructorOptions[] | null = null
let appMenuBuilt = false
/** Same rows for the tray, reused when only the automations changed. */
let trayRecentSessions: Electron.MenuItemConstructorOptions[] | null = null
/** Coalesces a burst of `automation:changed` broadcasts into one menu rebuild. */
let automationMenuRefreshQueued = false

// Expose quit state for embedded clawd (avoids passing closures through factory)
Object.defineProperty(global, '__aipaIsQuitting', {
  get: () => isQuitting,
  configurable: true,
})

/**
 * Resolve a file from `build/` in both layouts: unpackaged runs read it from the
 * repo, packaged runs from `resources/build` (see extraResources in
 * electron-builder.yml).
 */
function resolveBuildAsset(name: string): string | null {
  const buildDir = app.isPackaged ? path.join(process.resourcesPath, 'build') : path.join(__dirname, '../../build')
  const asset = path.join(buildDir, name)
  return fs.existsSync(asset) ? asset : null
}

/** Window / taskbar icon: the multi-resolution .ico on Windows, PNG elsewhere. */
function resolveAppIcon(): string | null {
  const order = process.platform === 'win32' ? ['icon.ico', 'icon.png'] : ['icon.png', 'icon.ico']
  for (const name of order) {
    const asset = resolveBuildAsset(name)
    if (asset) return asset
  }
  return null
}

function createWindow(): void {
  // Restore saved window bounds, or use defaults
  const savedBounds = getPref('windowBounds' as any) as { x: number; y: number; width: number; height: number; isMaximized: boolean } | null

  // Theme-aware startup: read saved theme to set correct initial colors
  const savedTheme = (getPref as any)('theme') || 'light'
  const isLightTheme = savedTheme === 'light' || (savedTheme === 'system' && false) // system theme resolved in renderer
  const bgColor = isLightTheme ? '#f5f5f7' : '#1e1e1e'
  const overlayColor = isLightTheme ? '#f8f8f8' : '#2c2c2c'
  const overlaySymbol = isLightTheme ? '#1a1a1a' : '#cccccc'

  const iconFile = resolveAppIcon()

  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: savedBounds?.width || 1400,
    height: savedBounds?.height || 900,
    minWidth: 800,
    minHeight: 600,
    title: 'AIPA',
    backgroundColor: bgColor,
    ...(iconFile ? { icon: iconFile } : {}),
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
  registerAllHandlers(mainWindow, { onAutomationsChanged: scheduleAutomationMenuRefresh })

  // Load renderer first — defer heavy clawd init until after renderer is ready.
  // Calling initClawdIntegration synchronously here would block the event loop
  // for seconds (window creation, theme loading, HTTP server, tick loop, etc.),
  // preventing loadFile/loadURL from rendering and causing a black screen.
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

  // Initialize embedded clawd desktop pet AFTER renderer has started loading.
  // setImmediate yields to the event loop so loadFile can begin rendering.
  setImmediate(() => {
    if (!mainWindow) return
    try {
      // Attention first: it only registers focus listeners and a window
      // getter, and events must be routable as soon as a bridge can raise one.
      initClawdAttention(() => mainWindow)
      initClawdIntegration(mainWindow)
      rebuildTrayMenu()
    } catch (err) {
      log.warn('initClawdIntegration failed (non-fatal):', String(err))
    }
  })

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
    openExternalSafely(url)
    return { action: 'deny' }
  })

  // A renderer that can navigate itself can also hand off a file:// URL to an
  // OS handler; keep the window on the app's own document.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault()
      openExternalSafely(url)
    }
  })
  mainWindow.webContents.on('will-redirect', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault()
  })
  // Deny every web permission by default: no device, location, or notification
  // capability is needed (desktop notifications go through
  // `windowShowNotification`). The one exception is clipboard *writes* — the copy
  // buttons in Chat, the source preview and the plugins break without it, and a
  // write only puts user-selected text on the clipboard. Clipboard reads and all
  // other permissions stay denied on both the request and the check path;
  // Chromium consults the check handler for same-origin writes.
  const CLIPBOARD_WRITE = 'clipboard-sanitized-write'
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === CLIPBOARD_WRITE)
  })
  mainWindow.webContents.session.setPermissionCheckHandler((_wc, permission) => permission === CLIPBOARD_WRITE)

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
    // Nav plugins are served by the app's own `aipa-plugin:` scheme.
    "frame-src 'self' aipa-plugin:",
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
    "frame-src 'self' aipa-plugin:",
  ].join('; ')

  const csp = isDev ? devCSP : prodCSP

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    // Plugin frames are served by our own protocol handler, which sets this
    // header explicitly — and that header is the plugin's only CSP (the frame
    // has its own document, so the app page's policy does not apply there).
    // Overwriting it here stripped the plugin's policy *and* injected
    // `frame-src 'self' aipa-plugin:` into the plugin itself, which made the
    // app refuse to load the frame at all.
    if (details.url.startsWith(`${PLUGIN_SCHEME}://`)) {
      callback({ responseHeaders: details.responseHeaders })
      return
    }
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

/**
 * Menu labels are inline bilingual (`isZh`), matching the tray; the main
 * process does not load the renderer's i18n catalogs.
 */
function isZhMenu(): boolean {
  const prefLang = (getPref as any)('language')
  return prefLang === 'zh-CN' || (prefLang !== 'en' && app.getLocale().toLowerCase().startsWith('zh'))
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function openAutomationsSettings(): void {
  showMainWindow()
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('menu:openAutomations')
}

function runAutomationNowFromMenu(id: string): void {
  const result = runAutomationNow(id)
  if (result.ok) return
  // The menu snapshot can be stale: the job may have started or been deleted
  // between the last rebuild and the click. A native menu has nowhere to show
  // an error, so surface the refusal by bringing the window forward instead of
  // swallowing it.
  log.warn(`Run-now refused for automation ${id}: ${result.error}`)
  showMainWindow()
}

/**
 * Flip the global pause from a menu row. The success path needs no menu work
 * here: `setAutomationPausedAll` persists and broadcasts `automation:changed`,
 * and that broadcast is what rebuilds both menus from the new state.
 */
function toggleAutomationPause(pausedNow: boolean): void {
  let result: ReturnType<typeof setAutomationPausedAll>
  try {
    result = setAutomationPausedAll(!pausedNow)
  } catch (err) {
    log.warn('Pause-all toggle failed:', String(err))
    return
  }
  if (result.ok) return
  // Same surface as a refused run-now: a native menu cannot show an error, and
  // nothing changed, so the rows on screen still describe the real state.
  log.warn(`Pause-all refused: ${result.error}`)
  showMainWindow()
}

/** The Automations row, with the job list read fresh at rebuild time. */
function automationsMenuItem(isZh: boolean): Electron.MenuItemConstructorOptions {
  let jobs: AutomationJobView[] = []
  let pausedAll = false
  try {
    // Jobs and the pause come from one read so the toggle row and every job
    // row describe the same snapshot.
    const listed = listAutomationJobs()
    jobs = listed.jobs
    pausedAll = listed.limits.pausedAll
    noteAutomationPause(pausedAll)
  } catch (err) {
    // A broken automation store must not take the whole menu down. The pause
    // is unknown here; with no jobs listed the toggle row is disabled, so the
    // submenu makes no claim about a schedule it could not read.
    log.warn('Could not list automations for the menu:', String(err))
  }
  return {
    label: isZh ? '定时任务' : 'Automations',
    submenu: buildAutomationsSubmenu(jobs, {
      isZh,
      pausedAll,
      runNow: runAutomationNowFromMenu,
      onTogglePauseAll: () => toggleAutomationPause(pausedAll),
      openSettings: openAutomationsSettings,
    }),
  }
}

/**
 * The scheduler broadcasts `automation:changed` for create/edit/delete,
 * enable/disable and the start/end of a run. That is the only refresh signal:
 * rebuilding on every tick would burn main-process time for a menu that cannot
 * have changed. Bursts (a run start and finish, or one workflow deletion
 * disabling several jobs) coalesce into a single rebuild.
 */
function scheduleAutomationMenuRefresh(): void {
  if (!appMenuBuilt && !tray) return
  if (automationMenuRefreshQueued) return
  automationMenuRefreshQueued = true
  setImmediate(() => {
    automationMenuRefreshQueued = false
    if (isQuitting) return
    if (appMenuBuilt && appMenuRecentSessions) rebuildAppMenu(appMenuRecentSessions)
    // Sessions did not change, and rescanning them synchronously here would
    // turn a background run's start/finish into main-process work.
    if (tray) rebuildTrayMenu({ reuseSessionCache: true })
  })
}

function rebuildAppMenu(recentSessionItems: Electron.MenuItemConstructorOptions[]): void {
  const isZh = isZhMenu()
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
        automationsMenuItem(isZh),
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
        // Deliberately no accelerator: the summon chord is registered globally,
        // and a menu accelerator only fires while AIPA itself is focused — it
        // would double-fire with the global registration whenever the app is in
        // front. This row is the fallback when another app owns every chord.
        { label: showAipaMenuLabel(isZh), click: () => showMainWindow() },
        { type: 'separator' },
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
  appMenuRecentSessions = recentSessionItems
  appMenuBuilt = true
}

function createTray(): void {
  // build/tray.png is a 32x32 glyph — Windows scales it to the 16/20/24px the
  // taskbar asks for at the current DPI. It must be a raster file:
  // nativeImage.createFromDataURL cannot decode SVG, and an undecodable source
  // leaves an invisible tray icon (a blank slot in the notification area).
  const trayAsset = resolveBuildAsset('tray.png') ?? resolveAppIcon()
  const trayIcon = trayAsset ? nativeImage.createFromPath(trayAsset) : nativeImage.createEmpty()
  if (trayIcon.isEmpty()) {
    log.warn('createTray: no usable icon found in build/ — skipping tray')
    return
  }

  // Hand Windows 32px and let it scale down for the tray (16px at 100% DPI, 24px
  // at 150%) — upscaling a 16px source would be visibly soft.
  tray = new Tray(trayIcon.resize({ width: 32, height: 32 }))
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

/**
 * The global automation pause last read by `automationsMenuItem`. The tray
 * tooltip repeats it because the tray icon is the one automation surface that
 * stays visible with the window closed, and "why did nothing run overnight?"
 * should be answerable by hovering it.
 */
let automationPausedAll = false
/** Session count for the tooltip, cached so a pause change need not rescan. */
let traySessionCount: number | null = null

function trayTooltipText(): string {
  let text = 'AIPA - AI Personal Assistant'
  if (traySessionCount !== null) text += ` (${traySessionCount} sessions)`
  if (automationPausedAll) text += ' — Automations paused'
  return text
}

/**
 * Record the pause read from the scheduler and refresh the tooltip when it
 * changed. `rebuildTrayMenu({ reuseSessionCache: true })` — the path a pause
 * broadcast takes — deliberately skips the session scan, so the tooltip has to
 * be caught up from the count already on screen.
 */
function noteAutomationPause(pausedAll: boolean): void {
  if (pausedAll === automationPausedAll) return
  automationPausedAll = pausedAll
  if (tray && !tray.isDestroyed()) tray.setToolTip(trayTooltipText())
}

/** Update tray tooltip with session count */
function updateTrayTooltip(): void {
  if (!tray) return
  try {
    traySessionCount = listSessions().length
  } catch {
    traySessionCount = null
  }
  tray.setToolTip(trayTooltipText())
}

/**
 * Rebuild the tray context menu with current state (recent sessions, theme).
 *
 * `reuseSessionCache` is for rebuilds caused by something other than the
 * session list (automations): re-reading every transcript synchronously would
 * block the main process for a menu section that cannot have changed.
 */
function rebuildTrayMenu(options: { reuseSessionCache?: boolean } = {}): void {
  if (!tray) return

  // Detect current locale
  const isZh = isZhMenu()

  // Fetch recent sessions (last 5, sorted by timestamp desc)
  let recentSessionItems: Electron.MenuItemConstructorOptions[]
  if (options.reuseSessionCache && trayRecentSessions) {
    recentSessionItems = trayRecentSessions
  } else {
    recentSessionItems = []
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
        recentSessionItems = [{ label: isZh ? '暂无最近会话' : 'No recent sessions', enabled: false }]
      }
    } catch {
      recentSessionItems = [{ label: isZh ? '暂无最近会话' : 'No recent sessions', enabled: false }]
    }
    trayRecentSessions = recentSessionItems
  }

  // Detect current theme
  const currentTheme = (getPref as any)('theme') || 'light'
  const themeLabel = isZh
    ? (currentTheme === 'light' ? '切换为深色主题' : '切换为浅色主题')
    : (currentTheme === 'light' ? 'Switch to Dark Theme' : 'Switch to Light Theme')

  // Get working directory
  const workingDir = (getPref as any)('workingDir') || require('os').homedir()

  // Desktop Pet (Clawd) menu integration
  const clawdSubmenu = getClawdSubmenu(isZh, () => rebuildTrayMenu())

  const contextMenu = Menu.buildFromTemplate([
    {
      label: showAipaMenuLabel(isZh),
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      },
    },
    { type: 'separator' },
    {
      label: isZh ? '新建会话' : 'New Chat',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
        mainWindow?.webContents.send('menu:newSession')
      },
    },
    // Automations sit next to New Chat because both are ways to start work;
    // everything after this point is navigation or app-level settings.
    automationsMenuItem(isZh),
    {
      label: isZh ? '询问剪贴板内容' : 'Ask about Clipboard',
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
      label: isZh ? '最近会话' : 'Recent Sessions',
      submenu: recentSessionItems,
    },
    { type: 'separator' },
    clawdSubmenu,
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
      label: isZh ? '打开工作目录' : 'Open Working Directory',
      click: () => {
        shell.openPath(workingDir)
      },
    },
    { type: 'separator' },
    {
      label: isZh ? '退出 AIPA' : 'Quit AIPA',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])
  tray.setContextMenu(contextMenu)
  // The tooltip carries the session count, so it needs the same scan the
  // cached rebuild just skipped.
  if (!options.reuseSessionCache) updateTrayTooltip()
}

/**
 * The chord actually claimed for "summon AIPA", or null when every candidate
 * was refused. The value is the truth: nothing in the app may advertise a
 * chord that is not in this variable.
 */
let summonShortcutChord: SummonChord | null = null
/** Registration runs from `whenReady`; a re-evaluated module must not re-claim. */
let summonShortcutAttempted = false
/** The unavailable notice is a once-per-launch message, not a per-window one. */
let summonUnavailableNoticeSent = false

/**
 * Bring the main window forward without toggling it. A hidden window has to be
 * shown, a minimized one restored, and only then focused — `focus()` on a
 * hidden or minimized window does not put it in front on Windows.
 */
function bringMainWindowForward(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const actions = summonWindowActions({
    visible: mainWindow.isVisible(),
    minimized: mainWindow.isMinimized(),
  })
  for (const action of actions) {
    if (action === 'show') mainWindow.show()
    else if (action === 'restore') mainWindow.restore()
    else mainWindow.focus()
  }
}

/**
 * Tell the renderer, once, that no global chord could be claimed. Deferred to
 * `did-finish-load` when the page is still loading: `App` attaches its
 * `menu:*` listener during the first React commit, which is before the load
 * event, so sending earlier would drop the notice on the floor.
 */
function notifySummonUnavailable(): void {
  if (summonUnavailableNoticeSent) return
  if (!mainWindow || mainWindow.isDestroyed()) return
  summonUnavailableNoticeSent = true
  const send = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('menu:globalShortcutUnavailable')
  }
  if (mainWindow.webContents.isLoading()) mainWindow.webContents.once('did-finish-load', send)
  else send()
}

/**
 * Register the global summon hotkey.
 *
 * Each candidate is claimed in priority order; the first the OS answers yes to
 * wins. A chord owned by another application is not silently replaced by
 * "nothing configured": the fallbacks exist precisely so a collision costs a
 * different chord rather than the whole feature. When even the last one is
 * refused, the renderer is told so it can point at View → Show AIPA instead of
 * a hotkey that does nothing.
 */
function registerSummonShortcut(): void {
  if (summonShortcutAttempted) return
  summonShortcutAttempted = true

  const onTrigger = () => {
    bringMainWindowForward()
    // Only after the window is on screen. A capture request reaching a hidden
    // window would focus a composer the user cannot see, and the request would
    // be spent before they ever look at it.
    if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) return
    mainWindow.webContents.send('menu:quickCapture')
  }

  const { chord, attempts } = claimSummonChord(candidate => globalShortcut.register(candidate, onTrigger))
  summonShortcutChord = chord
  // The status snapshot is built from this exact result — not from a second
  // guess at which chord won. Settings may only report what was recorded here.
  recordSummonRegistration({ chord, attempts })

  if (chord) {
    log.info(`Global summon shortcut registered: ${chord}`)
  } else {
    log.warn(
      `No global summon shortcut could be registered; tried ${attempts.map(a => a.chord).join(', ')}. ` +
      'globalShortcut.register refused each one — another application almost certainly owns it. ' +
      `View > ${showAipaMenuLabel(false)} in the app menu still brings the window forward.`,
    )
    notifySummonUnavailable()
  }
}

function registerGlobalHotkey(): void {
  registerSummonShortcut()

  // Quick clipboard action — reads clipboard, opens AIPA, sends to chat
  const clipboardRegistered = globalShortcut.register(CLIPBOARD_QUICK_ACTION_CHORD, () => {
    const clipboardText = clipboard.readText().trim()
    mainWindow?.show()
    mainWindow?.focus()
    if (clipboardText) {
      mainWindow?.webContents.send('menu:clipboardQuickAction', clipboardText)
    }
  })
  // Same boolean the OS returned; the status snapshot never re-derives it.
  recordClipboardRegistration(clipboardRegistered)
  if (clipboardRegistered) {
    log.info(`Global hotkey registered: ${CLIPBOARD_QUICK_ACTION_CHORD} (clipboard quick action)`)
  } else {
    log.warn(`Failed to register global hotkey: ${CLIPBOARD_QUICK_ACTION_CHORD}`)
  }
}

/**
 * Open a URL outside the app, but only for schemes that are safe to hand to the
 * OS. Without this allowlist, renderer content (or a prompt-injected plugin)
 * can pass `file:` / `ms-msdt:` / `search-ms:` and get the shell to execute or
 * open something other than a web page.
 */
function openExternalSafely(rawUrl: string): void {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    log.warn('Refused to open malformed URL:', rawUrl)
    return
  }
  if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
    log.warn('Refused to open non-web URL:', parsed.protocol)
    return
  }
  shell.openExternal(rawUrl).catch(err => log.warn('openExternal failed:', String(err)))
}

/** Is `url` a document the app itself loaded (renderer bundle or Vite server)? */
function isAppUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    if (isDev) return url.origin === 'http://localhost:5173'
    if (url.protocol !== 'file:') return false
    const rendererDir = path.resolve(__dirname, '../renderer')
    const target = path.resolve(decodeURIComponent(url.pathname).replace(/^\/([A-Za-z]:)/, '$1'))
    const rel = path.relative(rendererDir, target)
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
  } catch {
    return false
  }
}

/**
 * Dedicated scheme for plugin iframes
 * (`aipa-plugin://p-<slug>-<hash>/C:/…/plugin/index.html`).
 *
 * Why not `file://`: a file-backed frame with `allow-same-origin` inherits the
 * renderer's origin, so a plugin could reach `window.parent`'s document and the
 * app's own `localStorage`. A custom scheme gives each plugin a real, distinct
 * origin (one host per plugin, see `plugin-url.ts`), so it can keep
 * `allow-same-origin` — which `localStorage` requires — while `parent.document`
 * and sibling plugins stay out of reach. The `aipa:invoke` postMessage bridge is
 * the only host channel, and `postMessage` needs no shared origin.
 *
 * Only files inside a plugin directory discovered by the scanner are served.
 */
const PLUGIN_SCHEME = 'aipa-plugin'

const PLUGIN_MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
}

function registerPluginScheme(): void {
  protocol.registerSchemesAsPrivileged([{
    scheme: PLUGIN_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  }])
}

function servePluginProtocol(): void {
  protocol.handle(PLUGIN_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      const plugins = listNavPlugins()
      // The host names the plugin: resolving the file against that plugin's own
      // directory is what isolates one plugin's assets from another's.
      const plugin = plugins.find(p => pluginHost(p.manifest.id) === url.host)
      if (!plugin) {
        log.warn(`Blocked aipa-plugin request for unknown host: ${url.host}`)
        return new Response('Forbidden', { status: 403 })
      }
      const filePath = path.resolve(decodePluginPath(url.pathname))
      const rel = path.relative(path.resolve(plugin.dirPath), filePath)
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
        log.warn(`Blocked plugin asset escaping ${plugin.dirPath}: ${filePath}`)
        return new Response('Forbidden', { status: 403 })
      }
      const data = await fs.promises.readFile(filePath)
      const ext = path.extname(filePath).toLowerCase()
      const mime = PLUGIN_MIME[ext] || 'application/octet-stream'
      return new Response(data, {
        headers: {
          'content-type': mime,
          // A plugin editing its own files must see the change on reload.
          'cache-control': 'no-store',
          // The frame's own document needs its own policy: scripts and styles
          // only from the plugin's origin, no network egress at all (plugins
          // reach the host through the postMessage bridge, not fetch), and
          // inline script allowed because plugin authors ship single-file HTML.
          ...(ext === '.html'
            ? {
                'content-security-policy': [
                  "default-src 'self'",
                  "script-src 'self' 'unsafe-inline'",
                  "style-src 'self' 'unsafe-inline'",
                  "img-src 'self' data: blob:",
                  "font-src 'self' data:",
                  "connect-src 'none'",
                  "object-src 'none'",
                  "base-uri 'none'",
                  "frame-src 'none'",
                ].join('; '),
              }
            : {}),
        },
      })
    } catch (err) {
      log.warn('aipa-plugin request failed:', String(err))
      return new Response('Not found', { status: 404 })
    }
  })
}

registerPluginScheme()

app.whenReady().then(() => {
  // Ensure Windows groups all windows from this process under one taskbar button.
  // Must match the appId used in electron-builder.yml and be set before any
  // BrowserWindow is created.
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.anthropic.claude-code-ui')
  }

  try {
    servePluginProtocol()
  } catch (err) {
    log.warn('registerPluginProtocol failed (non-fatal):', String(err))
  }

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
  try { shutdownClawdAttention() } catch { /* best-effort */ }
  try { shutdownClawdIntegration() } catch { /* best-effort */ }
  // The session list no longer flushes its summary index inline (that was
  // ~400ms of blocking work on the first list of a launch); the debounced
  // writer does it, but a quit before the debounce fires would lose the
  // whole cold scan and pay for it again next launch.
  try { saveSessionIndexNow() } catch { /* best-effort */ }
  ptyManager.destroyAll()
  abortAllPluginAi()
  endAllPluginEdits()
  globalShortcut.unregisterAll()
})

// `before-quit` covers a normal quit; `will-quit` is the last point at which
// the OS still lets us release accelerators, and catches quit paths that do not
// go through `before-quit`. Releasing twice is harmless — unregistering a chord
// that is not held is a no-op.
app.on('will-quit', () => {
  log.debug(`Releasing global shortcuts (summon chord: ${summonShortcutChord ?? 'none'})`)
  globalShortcut.unregisterAll()
})
