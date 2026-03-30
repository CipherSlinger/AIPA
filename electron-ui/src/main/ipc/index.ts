import { ipcMain, BrowserWindow, dialog, shell, app } from 'electron'
import { ptyManager } from '../pty/pty-manager'
import { fallbackShellManager } from '../pty/fallback-shell'
import { streamBridgeManager } from '../pty/stream-bridge'
import { readSettings, writeSettings, listSessions, loadSession, deleteSession, forkSession, renameSession, getMcpServers, setMcpServerEnabled, generateSessionTitle, rewindSession, searchSessions } from '../sessions/session-reader'
import { getApiKey, setApiKey, getPref, setPref, getAllPrefs } from '../config/config-manager'
import { getCliPath } from '../utils/cli-path'
import { safePath, validateApiKey, validateModelName, validateStringLength, validateFlags, validateDirectoryExists, getAllowedFsRoots } from '../utils/validate'
import { providerRegistry } from '../providers'
import type { ModelProviderConfig, StreamEvent } from '../providers'
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
// Skills handlers
// ────────────────────────────────────────────
interface SkillInfo {
  name: string
  description: string
  source: 'personal' | 'project'
  dirPath: string
  fileName: string
}

function parseSkillMd(content: string): { name?: string; description?: string; body: string } {
  // Parse YAML frontmatter from SKILL.md
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/)
  if (!fmMatch) {
    const firstLine = content.split('\n').find(l => l.trim()) || ''
    return { body: content, description: firstLine.replace(/^#+\s*/, '').slice(0, 120) }
  }
  const frontmatter = fmMatch[1]
  const body = fmMatch[2]
  let name: string | undefined
  let description: string | undefined
  for (const line of frontmatter.split('\n')) {
    const nameMatch = line.match(/^name:\s*(.+)/)
    if (nameMatch) name = nameMatch[1].trim().replace(/^["']|["']$/g, '')
    const descMatch = line.match(/^description:\s*(.+)/)
    if (descMatch) description = descMatch[1].trim().replace(/^["']|["']$/g, '')
  }
  if (!description) {
    const firstLine = body.split('\n').find(l => l.trim()) || ''
    description = firstLine.replace(/^#+\s*/, '').slice(0, 120)
  }
  return { name, description, body }
}

function scanSkillsDir(dir: string, source: 'personal' | 'project'): SkillInfo[] {
  const skills: SkillInfo[] = []
  if (!fs.existsSync(dir)) return skills
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Look for SKILL.md inside directory
        const skillPath = path.join(dir, entry.name, 'SKILL.md')
        if (fs.existsSync(skillPath)) {
          try {
            const content = fs.readFileSync(skillPath, 'utf-8')
            const parsed = parseSkillMd(content)
            skills.push({
              name: parsed.name || entry.name,
              description: parsed.description || '',
              source,
              dirPath: path.join(dir, entry.name),
              fileName: entry.name,
            })
          } catch {
            // Skip unreadable files
          }
        }
      } else if (entry.isFile() && entry.name === 'SKILL.md') {
        // Top-level SKILL.md
        try {
          const content = fs.readFileSync(path.join(dir, entry.name), 'utf-8')
          const parsed = parseSkillMd(content)
          skills.push({
            name: parsed.name || path.basename(dir),
            description: parsed.description || '',
            source,
            dirPath: dir,
            fileName: entry.name,
          })
        } catch {
          // Skip unreadable files
        }
      }
    }
  } catch (err) {
    log.debug('scanSkillsDir error:', String(err))
  }
  return skills
}

function registerSkillsHandlers(): void {
  ipcMain.handle('skills:list', (_e, workingDir?: string) => {
    const personalDir = path.join(os.homedir(), '.claude', 'skills')
    const projectDirs: string[] = []
    if (workingDir && workingDir.trim()) {
      projectDirs.push(path.join(workingDir, '.claude', 'skills'))
    }
    const skills: SkillInfo[] = [
      ...scanSkillsDir(personalDir, 'personal'),
      ...projectDirs.flatMap(d => scanSkillsDir(d, 'project')),
    ]
    return skills
  })

  ipcMain.handle('skills:read', (_e, dirPath: string) => {
    try {
      const skillPath = path.join(dirPath, 'SKILL.md')
      if (!fs.existsSync(skillPath)) {
        // Maybe SKILL.md is in the dirPath itself (top-level)
        if (fs.existsSync(dirPath) && dirPath.endsWith('SKILL.md')) {
          return { content: fs.readFileSync(dirPath, 'utf-8') }
        }
        return { error: 'SKILL.md not found' }
      }
      return { content: fs.readFileSync(skillPath, 'utf-8') }
    } catch (err) {
      return { error: String(err) }
    }
  })

  ipcMain.handle('skills:install', (_e, { name, content }: { name: string; content: string }) => {
    try {
      // Sanitize name for filesystem use
      const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()
      const skillDir = path.join(os.homedir(), '.claude', 'skills', safeName)
      fs.mkdirSync(skillDir, { recursive: true })
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content, 'utf-8')
      return { success: true, dirPath: skillDir }
    } catch (err) {
      log.warn('skills:install error:', String(err))
      return { error: String(err) }
    }
  })

  ipcMain.handle('skills:fetchClawhub', async () => {
    try {
      const { net } = require('electron')
      const response = await net.fetch('https://clawhub.ai/api/v1/skills?sort=downloads&limit=50', {
        headers: { 'Accept': 'application/json', 'User-Agent': 'AIPA/1.0' },
      })
      if (!response.ok) {
        return { error: `HTTP ${response.status}`, skills: [] }
      }
      const data = await response.json()
      if (data && Array.isArray(data.items) && data.items.length > 0) {
        return { skills: data.items, source: 'api' }
      }
      // API returned empty -- try alternate endpoint
      const altResponse = await net.fetch('https://clawhub.ai/api/v1/skills', {
        headers: { 'Accept': 'application/json', 'User-Agent': 'AIPA/1.0' },
      })
      if (altResponse.ok) {
        const altData = await altResponse.json()
        if (altData && Array.isArray(altData.items) && altData.items.length > 0) {
          return { skills: altData.items, source: 'api' }
        }
      }
      return { skills: [], source: 'empty', message: 'ClawhHub API returned no results' }
    } catch (err) {
      log.warn('skills:fetchClawhub error:', String(err))
      return { error: String(err), skills: [] }
    }
  })

  ipcMain.handle('skills:delete', (_e, dirPath: string) => {
    try {
      // Only allow deleting from personal skills directory
      const personalDir = path.join(os.homedir(), '.claude', 'skills')
      const resolved = path.resolve(dirPath)
      if (!resolved.startsWith(personalDir)) {
        return { error: 'Can only delete personal skills' }
      }
      if (fs.existsSync(resolved)) {
        fs.rmSync(resolved, { recursive: true, force: true })
      }
      return { success: true }
    } catch (err) {
      log.warn('skills:delete error:', String(err))
      return { error: String(err) }
    }
  })
}

// ────────────────────────────────────────────
// Provider handlers (multi-model support)
// ────────────────────────────────────────────
function registerProviderHandlers(win: BrowserWindow, send: (ch: string, ...a: unknown[]) => void): void {
  // Initialize provider registry on startup
  const savedConfigs = getPref('modelProviders') as unknown as ModelProviderConfig[] | undefined
  providerRegistry.initialize(savedConfigs).catch(err => {
    log.warn('Failed to initialize provider registry:', String(err))
  })

  // Get all provider configs
  ipcMain.handle('provider:listConfigs', () => {
    return providerRegistry.getAllConfigs()
  })

  // Get all available models across all providers
  ipcMain.handle('provider:listModels', async () => {
    return providerRegistry.getAllModels()
  })

  // Update a provider config
  ipcMain.handle('provider:upsert', async (_e, config: ModelProviderConfig) => {
    try {
      await providerRegistry.upsertProvider(config)
      // Persist all configs
      const allConfigs = providerRegistry.serializeConfigs()
      setPref('modelProviders', allConfigs)
      return { success: true }
    } catch (err) {
      return { error: String(err) }
    }
  })

  // Remove a provider
  ipcMain.handle('provider:remove', (_e, providerId: string) => {
    providerRegistry.removeProvider(providerId)
    const allConfigs = providerRegistry.serializeConfigs()
    setPref('modelProviders', allConfigs)
    return { success: true }
  })

  // Health check all providers
  ipcMain.handle('provider:healthCheck', async () => {
    return providerRegistry.checkAllHealth()
  })

  // Get health statuses
  ipcMain.handle('provider:healthStatuses', () => {
    return providerRegistry.getHealthStatuses()
  })

  // Set active provider
  ipcMain.handle('provider:setActive', (_e, providerId: string) => {
    providerRegistry.setActiveProvider(providerId)
    setPref('activeProviderId', providerId)
    return { success: true }
  })

  // Get active provider ID
  ipcMain.handle('provider:getActive', () => {
    return providerRegistry.getActiveProviderId()
  })

  // Send message to a non-Claude provider (OpenAI, Ollama, etc.)
  ipcMain.handle('provider:sendMessage', async (_e, args: {
    prompt: string
    model: string
    systemPrompt?: string
    messages?: Array<{ role: string; content: string }>
    images?: string[]
    maxTokens?: number
    temperature?: number
  }) => {
    const sessionId = `provider-${Date.now()}`

    try {
      const handledBy = await providerRegistry.sendMessageWithFailover(
        {
          prompt: args.prompt,
          model: args.model,
          systemPrompt: args.systemPrompt,
          messages: args.messages,
          images: args.images,
          maxTokens: args.maxTokens,
          temperature: args.temperature,
        },
        (event: StreamEvent) => {
          switch (event.type) {
            case 'textDelta':
              send('cli:assistantText', { sessionId, text: event.data.text })
              break
            case 'thinkingDelta':
              send('cli:thinkingDelta', { sessionId, thinking: event.data.thinking })
              break
            case 'toolUse':
              send('cli:toolUse', { sessionId, event: event.data })
              break
            case 'toolResult':
              send('cli:toolResult', { sessionId, event: event.data })
              break
            case 'messageStop':
              send('cli:messageEnd', { sessionId })
              break
            case 'result':
              send('cli:result', { sessionId, event: event.data.event })
              break
            case 'error':
              send('cli:error', { sessionId, error: event.data.error })
              break
          }
        },
        (fromProvider, toProvider, reason) => {
          send('provider:failover', { fromProvider, toProvider, reason })
        },
      )

      return { success: true, sessionId, handledBy }
    } catch (err) {
      return { success: false, sessionId, error: String(err) }
    }
  })

  // Abort a provider request
  ipcMain.handle('provider:abort', (_e, providerId: string) => {
    const provider = providerRegistry.getProvider(providerId)
    if (provider) {
      provider.abort()
    }
    return { success: true }
  })
}
