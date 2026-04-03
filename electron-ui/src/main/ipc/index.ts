import { ipcMain, BrowserWindow, dialog, shell, app, desktopCapturer, powerSaveBlocker } from 'electron'
import { ptyManager } from '../pty/pty-manager'
import { fallbackShellManager } from '../pty/fallback-shell'
import { streamBridgeManager } from '../pty/stream-bridge'
import { readSettings, writeSettings, listSessions, loadSession, deleteSession, forkSession, renameSession, getMcpServers, setMcpServerEnabled, generateSessionTitle, generatePromptSuggestion, generateAwaySummary, rewindSession, searchSessions } from '../sessions/session-reader'
import { getApiKey, setApiKey, getPref, setPref, getAllPrefs, resetAllPrefs } from '../config/config-manager'
import { getCliPath } from '../utils/cli-path'
import { safePath, validateApiKey, validateModelName, validateStringLength, validateFlags, validateDirectoryExists, getAllowedFsRoots } from '../utils/validate'
import { registerSkillsHandlers } from './skills-handlers'
import { registerProviderHandlers } from './provider-handlers'
import { createLogger } from '../utils/logger'
import fs from 'fs'
import path from 'path'
import os from 'os'

const log = createLogger('ipc')

export function registerAllHandlers(win: BrowserWindow): void {
  const send = (channel: string, ...args: unknown[]) => {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args)
  }
  registerPtyHandlers(win, send)
  registerCliHandlers(win, send)
  registerSessionHandlers()
  registerConfigHandlers()
  registerFsHandlers()
  registerShellHandlers()
  registerWindowHandlers(win)
  registerSkillsHandlers()
  registerProviderHandlers(win, send)
  registerDiagnosticsHandlers()
  registerBackupHandlers()
}

// ────────────────────────────────────────────
// PTY handlers
// ────────────────────────────────────────────
// Track which sessions are using the fallback shell (not real PTY)
const fallbackSessions = new Set<string>()

function registerPtyHandlers(win: BrowserWindow, send: (ch: string, ...a: unknown[]) => void): void {
  ipcMain.handle('pty:create', (_e, args) => {
    // If node-pty is available, use real PTY; otherwise fall back to child_process shell
    const useFallback = !ptyManager.isAvailable()

    if (!useFallback) {
      // Normal PTY path -- try real PTY first, fall back to shell on failure
      try {
        const sessionId = ptyManager.create(args)

        const dataHandler = (data: string) => {
          send('pty:data', sessionId, data)
        }
        const exitHandler = (info: { exitCode: number; signal: string }) => {
          send('pty:exit', sessionId, info)
          ptyManager.removeListener(`data:${sessionId}`, dataHandler)
          ptyManager.removeListener(`exit:${sessionId}`, exitHandler)
        }

        ptyManager.on(`data:${sessionId}`, dataHandler)
        ptyManager.on(`exit:${sessionId}`, exitHandler)

        return { sessionId, fallback: false }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log.debug(`pty:create failed, falling back to basic shell: ${msg}`)
        // Fall through to fallback shell below
      }
    } else {
      log.debug(`pty:create using fallback shell (node-pty unavailable: ${ptyManager.getLoadError()})`)
    }

    // Fallback shell path (either node-pty unavailable or pty.spawn failed)
    try {
      const sessionId = fallbackShellManager.create(args)
      fallbackSessions.add(sessionId)

      const dataHandler = (data: string) => {
        send('pty:data', sessionId, data)
      }
      const exitHandler = (info: { exitCode: number; signal?: string }) => {
        send('pty:exit', sessionId, info)
        fallbackShellManager.removeListener(`data:${sessionId}`, dataHandler)
        fallbackShellManager.removeListener(`exit:${sessionId}`, exitHandler)
        fallbackSessions.delete(sessionId)
      }

      fallbackShellManager.on(`data:${sessionId}`, dataHandler)
      fallbackShellManager.on(`exit:${sessionId}`, exitHandler)

      // Send a notice to the renderer that this is fallback mode
      send('pty:data', sessionId,
        '\x1b[33m[Basic Mode] ' +
        'Terminal is running in basic mode (node-pty native module not available).\x1b[0m\r\n' +
        '\x1b[90mClaude Code CLI and other interactive programs will not work in this mode.\r\n' +
        'Use the Chat panel instead for AI conversations.\r\n' +
        'To enable full terminal: run "npm run rebuild-pty" (requires C++ Build Tools on Windows).\x1b[0m\r\n\r\n'
      )

      return { sessionId, fallback: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.debug(`pty:create fallback failed: ${msg}`)
      throw err
    }
  })

  ipcMain.handle('pty:write', (_e, { sessionId, data }) => {
    if (fallbackSessions.has(sessionId)) {
      fallbackShellManager.write(sessionId, data)
    } else {
      ptyManager.write(sessionId, data)
    }
  })

  ipcMain.handle('pty:resize', (_e, { sessionId, cols, rows }) => {
    if (fallbackSessions.has(sessionId)) {
      fallbackShellManager.resize(sessionId, cols, rows)
    } else {
      ptyManager.resize(sessionId, cols, rows)
    }
  })

  ipcMain.handle('pty:destroy', (_e, sessionId) => {
    if (fallbackSessions.has(sessionId)) {
      fallbackShellManager.removeAllListeners(`data:${sessionId}`)
      fallbackShellManager.removeAllListeners(`exit:${sessionId}`)
      fallbackShellManager.destroy(sessionId)
      fallbackSessions.delete(sessionId)
    } else {
      ptyManager.removeAllListeners(`data:${sessionId}`)
      ptyManager.removeAllListeners(`exit:${sessionId}`)
      ptyManager.destroy(sessionId)
    }
  })
}

// ────────────────────────────────────────────
// CLI stream-json handlers
// ────────────────────────────────────────────
function registerCliHandlers(win: BrowserWindow, send: (ch: string, ...a: unknown[]) => void): void {
  ipcMain.handle('cli:sendMessage', async (_e, args) => {
    // Validate and sanitize renderer-supplied flags and model (defence-in-depth)
    if (args.flags) args.flags = validateFlags(args.flags)
    if (args.model) validateModelName(args.model)

    const skipPermissions: boolean = !!(args.flags || []).includes('--dangerously-skip-permissions')

    // Reuse existing bridge if one is active for this conversation
    const existingBridgeId: string | undefined = args.activeBridgeId
    if (existingBridgeId && streamBridgeManager.get(existingBridgeId)) {
      const bridge = streamBridgeManager.get(existingBridgeId)!
      bridge.sendFollowUp(args.prompt, args.sessionId)
      return { success: true, sessionId: existingBridgeId }
    }

    // Spawn new bridge
    const bridgeId = `bridge-${Date.now()}`
    const bridge = streamBridgeManager.create(bridgeId)

    // Forward all events to renderer
    bridge.on('textDelta', (d) => send('cli:assistantText', d))
    bridge.on('thinkingDelta', (d) => send('cli:thinkingDelta', d))
    bridge.on('toolUse', (d) => send('cli:toolUse', d))
    bridge.on('toolResult', (d) => send('cli:toolResult', d))
    bridge.on('messageStop', (d) => send('cli:messageEnd', d))
    bridge.on('result', (d) => send('cli:result', d))
    bridge.on('processExit', (d) => {
      send('cli:processExit', d)
      // StreamBridgeManager cleans itself up via its own processExit listener (already wired in .create())
    })
    bridge.on('stderr', (d) => send('cli:error', { sessionId: bridgeId, error: d }))
    bridge.on('permissionRequest', (d) => send('cli:permissionRequest', d))

    // Inject API key from prefs if not in env
    if (!args.env?.ANTHROPIC_API_KEY) {
      args.env = { ...(args.env || {}), ANTHROPIC_API_KEY: getApiKey() }
    }

    // Strip CLAUDECODE to allow nesting
    args.env = { ...args.env, CLAUDECODE: '' }

    try {
      await bridge.sendMessage({
        ...args,
        skipPermissions,
        resumeSessionId: args.sessionId || undefined, // real Claude session ID
        sessionId: bridgeId,                          // internal bridge ID
      })
      return { success: true, sessionId: bridgeId }
    } catch (err) {
      send('cli:error', { sessionId: bridgeId, error: String(err) })
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('cli:abort', (_e, sessionId) => {
    streamBridgeManager.abort(sessionId)
  })

  ipcMain.handle('cli:respondPermission', (_e, { sessionId, requestId, allowed }) => {
    const bridge = streamBridgeManager.get(sessionId)
    if (bridge) bridge.respondPermission(requestId, allowed)
  })

  ipcMain.handle('cli:endSession', (_e, sessionId) => {
    const bridge = streamBridgeManager.get(sessionId)
    if (bridge) {
      bridge.endSession()
      // don't delete from manager yet — processExit event will fire and clean up
    }
  })
}

// ────────────────────────────────────────────
// Session handlers
// ────────────────────────────────────────────
function registerSessionHandlers(): void {
  ipcMain.handle('session:list', () => listSessions())
  ipcMain.handle('session:load', (_e, id) => loadSession(id))
  ipcMain.handle('session:delete', (_e, id) => deleteSession(id))
  ipcMain.handle('session:fork', (_e, { sessionId, upToMessageIndex }) => forkSession(sessionId, upToMessageIndex))
  ipcMain.handle('session:rename', (_e, { sessionId, title }) => renameSession(sessionId, title))
  ipcMain.handle('session:generateTitle', async (_e: Electron.IpcMainInvokeEvent, { description }: { description: string }) => {
    const cliPath = getCliPath()
    return generateSessionTitle(description, cliPath)
  })

  ipcMain.handle('session:rewind', async (_e: Electron.IpcMainInvokeEvent, { sessionId, beforeTimestamp }: { sessionId: string; beforeTimestamp: string }) => {
    const cliPath = getCliPath()
    return rewindSession(sessionId, beforeTimestamp, cliPath)
  })

  ipcMain.handle('session:search', (_e: Electron.IpcMainInvokeEvent, { query, limit }: { query: string; limit?: number }) => {
    return searchSessions(query, limit)
  })

  ipcMain.handle('cli:generateSuggestion', async (_e: Electron.IpcMainInvokeEvent, { context }: { context: string }) => {
    const cliPath = getCliPath()
    return generatePromptSuggestion(context, cliPath)
  })

  ipcMain.handle('cli:generateAwaySummary', async (_e: Electron.IpcMainInvokeEvent, { context }: { context: string }) => {
    const cliPath = getCliPath()
    return generateAwaySummary(context, cliPath)
  })
}

// ────────────────────────────────────────────
// Config handlers
// ────────────────────────────────────────────
function registerConfigHandlers(): void {
  ipcMain.handle('config:read', () => readSettings())
  ipcMain.handle('config:write', (_e, patch) => writeSettings(patch))
  ipcMain.handle('config:getEnv', () => ({
    apiKey: getApiKey(),
    hasApiKey: Boolean(getApiKey()),
  }))
  ipcMain.handle('config:setApiKey', (_e, key) => {
    try {
      const validated = validateApiKey(key)
      setApiKey(validated)
    } catch (err) {
      log.warn('Invalid API key format rejected:', String(err))
      return { error: String(err) }
    }
  })

  ipcMain.handle('prefs:get', (_e, key) => getPref(key))
  ipcMain.handle('prefs:set', (_e, key, value) => setPref(key, value))
  ipcMain.handle('prefs:getAll', () => getAllPrefs())
  ipcMain.handle('prefs:resetAll', () => {
    resetAllPrefs()
    return true
  })

  // Locale detection for i18n
  ipcMain.handle('config:getLocale', () => app.getLocale())

  ipcMain.handle('mcp:list', () => getMcpServers())
  ipcMain.handle('mcp:setEnabled', (_e: Electron.IpcMainInvokeEvent, { serverName, enabled }: { serverName: string; enabled: boolean }) => setMcpServerEnabled(serverName, enabled))

  ipcMain.handle('feedback:rate', (_e: Electron.IpcMainInvokeEvent, { messageId, rating }: { messageId: string; rating: 'up' | 'down' | null }) => {
    const key = `feedback.${messageId}`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(setPref as any)(key, rating)
  })
}

// ────────────────────────────────────────────
// File system handlers
// ────────────────────────────────────────────
function registerFsHandlers(): void {
  ipcMain.handle('fs:listDir', (_e, dirPath: string) => {
    try {
      const workingDir = getPref('workingDir')
      const allowedRoots = getAllowedFsRoots(workingDir)
      const safe = safePath(dirPath, allowedRoots)
      const entries = fs.readdirSync(safe, { withFileTypes: true })
      return entries.map((e) => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        isFile: e.isFile(),
        path: path.join(safe, e.name),
      })).sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        return a.name.localeCompare(b.name)
      })
    } catch (err) {
      log.debug('fs:listDir error:', String(err))
      return []
    }
  })

  ipcMain.handle('fs:showSaveDialog', async (e, { defaultName, filters }: { defaultName: string; filters: { name: string; extensions: string[] }[] }) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return null
    const result = await dialog.showSaveDialog(win, { defaultPath: defaultName, filters })
    return result.canceled ? null : result.filePath
  })

  ipcMain.handle('fs:writeFile', (_e, { filePath, content }: { filePath: string; content: string }) => {
    try {
      const workingDir = getPref('workingDir')
      const allowedRoots = getAllowedFsRoots(workingDir)
      // For save dialog results, allow anywhere within home dir
      const safe = safePath(filePath, allowedRoots)
      fs.writeFileSync(safe, content, 'utf-8')
      return { success: true }
    } catch (err) {
      log.warn('fs:writeFile error:', String(err))
      return { error: String(err) }
    }
  })

  ipcMain.handle('fs:showOpenDialog', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
      title: 'Select Working Directory',
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('fs:showOpenFileDialog', async (e, { filters, multiSelections }: { filters?: { name: string; extensions: string[] }[]; multiSelections?: boolean }) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return null
    const properties: ('openFile' | 'multiSelections')[] = ['openFile']
    if (multiSelections) properties.push('multiSelections')
    const result = await dialog.showOpenDialog(win, {
      properties,
      filters: filters || [{ name: 'All Files', extensions: ['*'] }],
      title: 'Select Files',
    })
    return result.canceled ? null : result.filePaths
  })

  ipcMain.handle('fs:readFile', (_e, filePath: string) => {
    try {
      const workingDir = getPref('workingDir')
      const allowedRoots = getAllowedFsRoots(workingDir)
      const safe = safePath(filePath, allowedRoots)
      const content = fs.readFileSync(safe, 'utf-8')
      return { content }
    } catch (err) {
      log.warn('fs:readFile error:', String(err))
      return { error: String(err) }
    }
  })

  ipcMain.handle('fs:getHome', () => os.homedir())
  ipcMain.handle('fs:ensureDir', (_e, dirPath: string) => {
    try {
      const workingDir = getPref('workingDir')
      // ensureDir is limited to workingDir and ~/.claude only
      const allowedRoots = getAllowedFsRoots(workingDir)
      const safe = safePath(dirPath, allowedRoots)
      fs.mkdirSync(safe, { recursive: true })
      return safe
    } catch (err) {
      log.warn('fs:ensureDir error:', String(err))
      return { error: String(err) }
    }
  })

  ipcMain.handle('fs:listCommands', (_e, workingDir: string) => {
    // Validate workingDir is within allowed roots before using it to build paths
    if (workingDir) {
      try {
        const allowedRoots = getAllowedFsRoots(getPref('workingDir'))
        safePath(workingDir, allowedRoots)
      } catch (err) {
        log.warn('fs:listCommands rejected unsafe workingDir:', String(err))
        // Ignore project-level commands from untrusted workingDir; fall through with empty list
        workingDir = ''
      }
    }
    const commandDirs = [
      path.join(os.homedir(), '.claude', 'commands'),
      ...(workingDir ? [path.join(workingDir, '.claude', 'commands')] : []),
    ]
    const commands: { name: string; description: string; source: 'user' | 'project' }[] = []
    for (const [i, dir] of commandDirs.entries()) {
      if (!fs.existsSync(dir)) continue
      try {
        const files = fs.readdirSync(dir).filter((f: string) => f.endsWith('.md'))
        for (const file of files) {
          const name = '/' + file.replace('.md', '')
          const content = fs.readFileSync(path.join(dir, file), 'utf-8')
          const firstLine = content.split('\n').find((l: string) => l.trim()) || ''
          const description = firstLine.replace(/^#+\s*/, '').slice(0, 80)
          commands.push({ name, description, source: i === 0 ? 'user' : 'project' })
        }
      } catch (err) {
        log.debug('fs:listCommands could not read directory:', String(err))
      }
    }
    return commands
  })
}

// ────────────────────────────────────────────
// Window handlers
// ────────────────────────────────────────────
function registerWindowHandlers(win: BrowserWindow): void {
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

// ────────────────────────────────────────────
// Shell handlers
// ────────────────────────────────────────────
function registerShellHandlers(): void {
  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    // Only allow http/https URLs to prevent shell command injection
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(url)
      }
    } catch {
      log.warn('shell:openExternal rejected invalid URL:', url)
    }
  })
}

// ────────────────────────────────────────────
// Diagnostics handlers (Iteration 377)
// ────────────────────────────────────────────
function registerDiagnosticsHandlers(): void {
  ipcMain.handle('system:runDiagnostics', async () => {
    const results: {
      id: string
      label: string
      status: 'ok' | 'warning' | 'error'
      detail: string
      subDetail?: string
    }[] = []

    // 1. CLI Engine check
    try {
      const cliPath = getCliPath()
      if (cliPath && fs.existsSync(cliPath)) {
        results.push({ id: 'cli', label: 'CLI Engine', status: 'ok', detail: 'cli.js found', subDetail: `Path: ${cliPath}` })
      } else {
        results.push({ id: 'cli', label: 'CLI Engine', status: 'error', detail: 'cli.js not found', subDetail: 'Check CLAUDE_CLI_PATH env var' })
      }
    } catch (err) {
      results.push({ id: 'cli', label: 'CLI Engine', status: 'error', detail: String(err) })
    }

    // 2. PTY check
    try {
      const ptyAvailable = ptyManager.isAvailable()
      if (ptyAvailable) {
        results.push({ id: 'pty', label: 'Terminal (PTY)', status: 'ok', detail: 'node-pty OK' })
      } else {
        const loadErr = ptyManager.getLoadError()
        results.push({ id: 'pty', label: 'Terminal (PTY)', status: 'warning', detail: 'node-pty unavailable', subDetail: loadErr || 'Fallback shell mode active' })
      }
    } catch (err) {
      results.push({ id: 'pty', label: 'Terminal (PTY)', status: 'warning', detail: String(err) })
    }

    // 3. API Key check
    try {
      const apiKey = getApiKey()
      if (apiKey) {
        const masked = apiKey.slice(0, 7) + '...' + apiKey.slice(-4)
        results.push({ id: 'apikey', label: 'API Key', status: 'ok', detail: 'Configured', subDetail: masked })
      } else {
        results.push({ id: 'apikey', label: 'API Key', status: 'error', detail: 'Not configured', subDetail: 'Set your API key in Settings' })
      }
    } catch (err) {
      results.push({ id: 'apikey', label: 'API Key', status: 'error', detail: String(err) })
    }

    // 4. System info
    try {
      const memMB = Math.round(process.memoryUsage().rss / 1024 / 1024)
      results.push({
        id: 'system',
        label: 'System',
        status: 'ok',
        detail: `${os.type()} ${os.release()}`,
        subDetail: `Electron ${process.versions.electron} | Node ${process.versions.node} | Memory: ${memMB} MB`,
      })
    } catch (err) {
      results.push({ id: 'system', label: 'System', status: 'warning', detail: String(err) })
    }

    // 5. Sessions stats
    try {
      const sessions = await listSessions()
      const claudeDir = path.join(os.homedir(), '.claude', 'projects')
      let diskSizeMB = 0
      if (fs.existsSync(claudeDir)) {
        const getDirSize = (dir: string): number => {
          let total = 0
          try {
            const entries = fs.readdirSync(dir, { withFileTypes: true })
            for (const entry of entries) {
              const entryPath = path.join(dir, entry.name)
              if (entry.isFile()) {
                try { total += fs.statSync(entryPath).size } catch { /* skip */ }
              } else if (entry.isDirectory()) {
                total += getDirSize(entryPath)
              }
            }
          } catch { /* skip */ }
          return total
        }
        diskSizeMB = Math.round(getDirSize(claudeDir) / 1024 / 1024 * 10) / 10
      }
      results.push({
        id: 'sessions',
        label: 'Sessions',
        status: 'ok',
        detail: `${sessions.length} sessions`,
        subDetail: `Disk: ${diskSizeMB} MB in ~/.claude/projects/`,
      })
    } catch (err) {
      results.push({ id: 'sessions', label: 'Sessions', status: 'warning', detail: String(err) })
    }

    return results
  })
}

// ────────────────────────────────────────────
// Backup & Restore handlers (Iteration 426)
// ────────────────────────────────────────────
function registerBackupHandlers(): void {
  // Export all user data as JSON
  ipcMain.handle('backup:export', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return { error: 'No window' }

    // Collect all data from electron-store (excluding API keys for security)
    const allPrefs = getAllPrefs() as unknown as Record<string, unknown>
    const exportData: Record<string, unknown> = {
      _meta: {
        version: 1,
        exportDate: new Date().toISOString(),
        appVersion: app.getVersion(),
      },
      settings: {
        model: allPrefs.model,
        workingDir: allPrefs.workingDir,
        fontSize: allPrefs.fontSize,
        fontFamily: allPrefs.fontFamily,
        skipPermissions: allPrefs.skipPermissions,
        verbose: allPrefs.verbose,
        theme: allPrefs.theme,
        effortLevel: allPrefs.effortLevel,
        outputStyle: allPrefs.outputStyle,
        compactMode: allPrefs.compactMode,
        desktopNotifications: allPrefs.desktopNotifications,
        resumeLastSession: allPrefs.resumeLastSession,
        systemPrompt: allPrefs.systemPrompt,
        promptTemplate: allPrefs.promptTemplate,
        thinkingLevel: allPrefs.thinkingLevel,
        maxTurns: allPrefs.maxTurns,
        maxBudgetUsd: allPrefs.maxBudgetUsd,
        notifySound: allPrefs.notifySound,
        preventSleep: allPrefs.preventSleep,
        displayName: allPrefs.displayName,
        language: allPrefs.language,
      },
      personas: allPrefs.personas || [],
      workflows: allPrefs.workflows || [],
      notes: allPrefs.notes || [],
      memories: allPrefs.memories || [],
      textSnippets: allPrefs.textSnippets || [],
      quickReplies: allPrefs.quickReplies || [],
      customConvTemplates: allPrefs.customConvTemplates || [],
      tagNames: allPrefs.tagNames || [],
    }

    const result = await dialog.showSaveDialog(win, {
      defaultPath: `aipa-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'AIPA Backup', extensions: ['json'] }],
    })

    if (result.canceled || !result.filePath) return { canceled: true }

    try {
      const json = JSON.stringify(exportData, null, 2)
      fs.writeFileSync(result.filePath, json, 'utf-8')
      const sizeKB = Math.round(json.length / 1024)
      ;(setPref as any)('lastBackupDate', Date.now())

      return {
        success: true,
        filePath: result.filePath,
        sizeKB,
        counts: {
          personas: ((exportData.personas as unknown[]) || []).length,
          workflows: ((exportData.workflows as unknown[]) || []).length,
          notes: ((exportData.notes as unknown[]) || []).length,
          memories: ((exportData.memories as unknown[]) || []).length,
          snippets: ((exportData.textSnippets as unknown[]) || []).length,
        },
      }
    } catch (err) {
      log.error('backup:export error:', String(err))
      return { error: String(err) }
    }
  })

  // Import user data from backup JSON
  ipcMain.handle('backup:import', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return { error: 'No window' }

    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'AIPA Backup', extensions: ['json'] }],
      title: 'Select AIPA Backup File',
    })

    if (result.canceled || !result.filePaths[0]) return { canceled: true }

    try {
      const content = fs.readFileSync(result.filePaths[0], 'utf-8')
      const data = JSON.parse(content)

      if (!data._meta || !data._meta.version) {
        return { error: 'Invalid backup file format' }
      }

      const imported: Record<string, number> = {}

      const mergeArrays = (key: string, items: unknown[]) => {
        if (!Array.isArray(items) || items.length === 0) return
        const existing = ((getPref as any)(key) || []) as { id?: string }[]
        const existingIds = new Set(existing.map((e: { id?: string }) => e.id).filter(Boolean))
        const newItems = (items as { id?: string }[]).filter(item => !item.id || !existingIds.has(item.id))
        if (newItems.length > 0) {
          ;(setPref as any)(key, [...existing, ...newItems])
          imported[key] = newItems.length
        }
      }

      if (data.settings && typeof data.settings === 'object') {
        for (const [key, value] of Object.entries(data.settings)) {
          if (value !== undefined && value !== null && key !== 'apiKey' && key !== 'apiKeyEncrypted') {
            ;(setPref as any)(key, value)
          }
        }
        imported.settings = 1
      }

      mergeArrays('personas', data.personas)
      mergeArrays('workflows', data.workflows)
      mergeArrays('notes', data.notes)
      mergeArrays('memories', data.memories)
      mergeArrays('textSnippets', data.textSnippets)
      mergeArrays('quickReplies', data.quickReplies)
      mergeArrays('customConvTemplates', data.customConvTemplates)

      return {
        success: true,
        imported,
        backupDate: data._meta.exportDate,
      }
    } catch (err) {
      log.error('backup:import error:', String(err))
      return { error: String(err) }
    }
  })
}


