import { ipcMain, BrowserWindow, shell, app } from 'electron'
import { ptyManager } from '../pty/pty-manager'
import { fallbackShellManager } from '../pty/fallback-shell'
import { streamBridgeManager } from '../pty/stream-bridge'
import { speculationManager, isSafeToSpeculate } from '../pty/speculation-bridge'
import { readSettings, writeSettings, listSessions, loadSession, deleteSession, forkSession, renameSession, getMcpServers, setMcpServerEnabled, generateSessionTitle, generatePromptSuggestion, generateAwaySummary, rewindSession, searchSessions, detectTurnInterruption } from '../sessions/session-reader'
import { getApiKey, setApiKey, getPref, setPref, getAllPrefs, resetAllPrefs } from '../config/config-manager'
import { getCliPath } from '../utils/cli-path'
import { validateApiKey, validateModelName, validateFlags } from '../utils/validate'
import { registerSkillsHandlers } from './skills-handlers'
import { registerProviderHandlers } from './provider-handlers'
import { registerFsHandlers } from './fs-handlers'
import { registerWindowHandlers } from './window-handlers'
import { registerDiagnosticsHandlers } from './diagnostics-handlers'
import { registerBackupHandlers } from './backup-handlers'
import { createLogger } from '../utils/logger'

const log = createLogger('ipc')

// Guard against double-registration (e.g., when createWindow is called
// from app.on('activate') on macOS). Registering a handler twice on the
// same channel crashes Electron with "Attempted to register a second handler".
let handlersRegistered = false

/**
 * Safely register an IPC handle, removing any previous handler first.
 * This prevents "Attempted to register a second handler" crashes.
 */
function safeHandle(channel: string, handler: (...args: any[]) => any): void {
  try { ipcMain.removeHandler(channel) } catch { /* no previous handler */ }
  ipcMain.handle(channel, handler)
}

export function registerAllHandlers(win: BrowserWindow): void {
  if (handlersRegistered) {
    log.info('IPC handlers already registered, updating window reference only')
    // Update the send function reference for push events
    return
  }
  handlersRegistered = true

  const send = (channel: string, ...args: unknown[]) => {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args)
  }

  try {
    // IPC readiness ping -- renderer can verify IPC is working
    safeHandle('ipc:ping', () => ({ ok: true, timestamp: Date.now() }))

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
    registerSpeculationHandlers()
    log.info('All IPC handlers registered successfully')
  } catch (err) {
    log.error('Failed to register some IPC handlers:', String(err))
    // Even on partial failure, continue -- partial handlers are better than none
  }
}

// ----------------------------------------
// PTY handlers
// ----------------------------------------
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

// ----------------------------------------
// CLI stream-json handlers
// ----------------------------------------
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
      // don't delete from manager yet -- processExit event will fire and clean up
    }
  })
}

// ----------------------------------------
// Session handlers
// ----------------------------------------
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
  ipcMain.handle('session:detectInterruption', (_e: Electron.IpcMainInvokeEvent, { sessionId }: { sessionId: string }) => {
    return detectTurnInterruption(sessionId)
  })
}

// ----------------------------------------
// Config handlers
// ----------------------------------------
function registerConfigHandlers(): void {
  ipcMain.handle('config:read', () => readSettings())
  ipcMain.handle('config:write', (_e, patch) => writeSettings(patch))
  ipcMain.handle('config:getEnv', () => {
    try {
      return {
        apiKey: getApiKey(),
        hasApiKey: Boolean(getApiKey()),
      }
    } catch (err) {
      log.warn('config:getEnv error:', String(err))
      return { apiKey: '', hasApiKey: false }
    }
  })
  ipcMain.handle('config:setApiKey', (_e, key) => {
    try {
      const validated = validateApiKey(key)
      setApiKey(validated)
    } catch (err) {
      log.warn('Invalid API key format rejected:', String(err))
      return { error: String(err) }
    }
  })

  ipcMain.handle('prefs:get', (_e, key) => {
    try { return getPref(key) } catch (err) { log.warn('prefs:get error:', String(err)); return null }
  })
  ipcMain.handle('prefs:set', (_e, key, value) => {
    try { setPref(key, value) } catch (err) { log.warn('prefs:set error:', String(err)) }
  })
  ipcMain.handle('prefs:getAll', () => {
    try { return getAllPrefs() } catch (err) { log.warn('prefs:getAll error:', String(err)); return {} }
  })
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

// ----------------------------------------
// Shell handlers
// ----------------------------------------
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

  // Fetch URL Open Graph metadata for link preview cards (Iteration 462)
  safeHandle('url:fetchMeta', async (_e, url: string) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
      const https = require('https')
      const http = require('http')
      const mod = parsed.protocol === 'https:' ? https : http
      return await new Promise<{ title: string; description: string; favicon: string; domain: string } | null>((resolve) => {
        const timer = setTimeout(() => resolve(null), 3000)
        const req = mod.get(url, { headers: { 'User-Agent': 'AIPA/1.0' } }, (res: any) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            // Follow one redirect
            clearTimeout(timer)
            resolve(null) // Simplified: don't follow redirects, just fail gracefully
            res.resume()
            return
          }
          let body = ''
          res.setEncoding('utf8')
          res.on('data', (chunk: string) => {
            body += chunk
            if (body.length > 50000) { res.destroy(); }
          })
          res.on('end', () => {
            clearTimeout(timer)
            try {
              const titleMatch = body.match(/<meta\s+property="og:title"\s+content="([^"]*)"/) ||
                body.match(/<meta\s+content="([^"]*)"\s+property="og:title"/) ||
                body.match(/<title[^>]*>([^<]*)<\/title>/)
              const descMatch = body.match(/<meta\s+property="og:description"\s+content="([^"]*)"/) ||
                body.match(/<meta\s+content="([^"]*)"\s+property="og:description"/) ||
                body.match(/<meta\s+name="description"\s+content="([^"]*)"/) ||
                body.match(/<meta\s+content="([^"]*)"\s+name="description"/)
              const faviconMatch = body.match(/<link[^>]+rel="(?:shortcut )?icon"[^>]+href="([^"]*)"/) ||
                body.match(/<link[^>]+href="([^"]*)"[^>]+rel="(?:shortcut )?icon"/)
              const domain = parsed.hostname
              let favicon = ''
              if (faviconMatch?.[1]) {
                favicon = faviconMatch[1].startsWith('http') ? faviconMatch[1] : `${parsed.protocol}//${domain}${faviconMatch[1].startsWith('/') ? '' : '/'}${faviconMatch[1]}`
              } else {
                favicon = `${parsed.protocol}//${domain}/favicon.ico`
              }
              resolve({
                title: titleMatch?.[1]?.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"') || domain,
                description: descMatch?.[1]?.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"') || '',
                favicon,
                domain,
              })
            } catch {
              resolve(null)
            }
          })
          res.on('error', () => { clearTimeout(timer); resolve(null) })
        })
        req.on('error', () => { clearTimeout(timer); resolve(null) })
        req.end()
      })
    } catch {
      return null
    }
  })
}

// ----------------------------------------
// Speculation handlers (Iteration 489)
// ----------------------------------------
function registerSpeculationHandlers(): void {
  // Check if a prompt is safe to speculate on
  safeHandle('speculation:isSafe', (_e, { prompt }: { prompt: string }) => {
    return isSafeToSpeculate(prompt)
  })

  // Start a speculation turn — resolves with SpeculationResult when done
  safeHandle('speculation:run', async (
    _e,
    { id, prompt, cwd, model, env }: {
      id: string
      prompt: string
      cwd: string
      model: string
      env: Record<string, string>
    }
  ) => {
    if (!isSafeToSpeculate(prompt)) {
      return { id, error: 'unsafe_prompt' }
    }
    // Abort any previous speculation with the same id
    speculationManager.abort(id)
    const bridge = speculationManager.create(id)
    try {
      const result = await bridge.run(prompt, cwd, model, env || {})
      speculationManager.remove(id)
      return result
    } catch (err) {
      speculationManager.remove(id)
      log.warn('Speculation run error:', String(err))
      return { id, error: String(err) }
    }
  })

  // Accept: merge overlay files back to real cwd
  safeHandle('speculation:accept', (_e, { id, cwd }: { id: string; cwd: string }) => {
    const bridge = speculationManager.get(id)
    if (!bridge) return { merged: [] }
    const merged = bridge.mergeToReal(cwd)
    speculationManager.remove(id)
    return { merged }
  })

  // Reject: discard overlay
  safeHandle('speculation:reject', (_e, { id }: { id: string }) => {
    speculationManager.abort(id)
    return { ok: true }
  })

  // Abort a running speculation
  safeHandle('speculation:abort', (_e, { id }: { id: string }) => {
    speculationManager.abort(id)
    return { ok: true }
  })
}
