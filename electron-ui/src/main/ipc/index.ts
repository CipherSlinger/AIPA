import { ipcMain, BrowserWindow, shell, app, dialog } from 'electron'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { ptyManager } from '../pty/pty-manager'
import { fallbackShellManager } from '../pty/fallback-shell'
import { codexBridgeManager } from '../codex/codex-bridge'
import { streamBridgeManager } from '../pty/stream-bridge'
import { speculationManager, isSafeToSpeculate } from '../pty/speculation-bridge'
import { readSettings, writeSettings, listSessions as listClaudeSessions, loadSession as loadClaudeSession, deleteSession as deleteClaudeSession, forkSession as forkClaudeSession, renameSession, generateSessionTitle, generatePromptSuggestion, generateAwaySummary, rewindSession, searchSessions as searchClaudeSessions, detectTurnInterruption, getDreamConsolidationMtime } from '../sessions/session-reader'
import { listSessions as listCodexSessions, loadSession as loadCodexSession, deleteSession as deleteCodexSession, forkSession as forkCodexSession, searchSessions as searchCodexSessions, readCodexConfig } from '../codex/codex-session-reader'
import { addMcpServer, getMcpConfigInfo, readMcpServers, removeMcpServer, setMcpServerEnabledRouted } from '../config/mcp-config'
import { getSessionStats } from '../sessions/session-stats'
import { getApiKey, setApiKey, getPref, setPref, getAllPrefs, resetAllPrefs } from '../config/config-manager'
import { readCLISettings, writeCLISettings } from '../config/cli-settings-manager'
import { listMemoryFiles, readMemoryFile, writeMemoryFile, createMemoryFile, deleteMemoryFile } from '../sessions/memory-manager'
import { checkIsGitRepo, listWorktrees, createWorktree, removeWorktree } from '../sessions/worktree-manager'
import { listPlugins, setPluginEnabled, uninstallPlugin, registerLocalPlugin } from '../plugins/plugin-manager'
import { initNavPluginManager, listNavPlugins, reloadNavPlugins, openPluginFolder } from '../plugins/nav-plugin-manager'
import { migrateLegacyTasks, startWorkCalendarReminders } from '../plugins/work-calendar-reminders'
import { readPluginData, writePluginData, fetchGithubCommits, scanFolderChanges, startPluginAi, abortPluginAi, type GithubCommitsArgs, type ScanFolderArgs } from '../plugins/plugin-services'
import { startPluginEdit, sendPluginEdit, abortPluginEdit, endPluginEdit } from '../plugins/plugin-edit-session'
import { getCliPath } from '../utils/cli-path'
import { validateApiKey, validateModelName, validateFlags } from '../utils/validate'
import { registerSkillsHandlers } from './skills-handlers'
import { registerProviderHandlers } from './provider-handlers'
import { registerFsHandlers } from './fs-handlers'
import { registerWindowHandlers } from './window-handlers'
import { registerDiagnosticsHandlers } from './diagnostics-handlers'
import { registerBackupHandlers } from './backup-handlers'
import { createLogger } from '../utils/logger'
import { notifyClawdState, isClawdRunning, launchClawd } from '../clawd-bridge'
import { getClawdInitError } from '../clawd-integration'

const log = createLogger('ipc')

// Cache for MCP server tools populated from system.init events
// Maps serverName -> list of tool names (e.g. "mcp__myserver__tool1")
const mcpServerToolsCache: Record<string, string[]> = {}

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

/** Remember the tools each MCP server reported, for the `mcp:getTools` lookups. */
function cacheMcpTools(initData: unknown): void {
  const servers = (initData as { mcpServers?: Array<{ name: string; tools?: string[] }> })?.mcpServers
  if (!servers) return
  for (const srv of servers) {
    if (srv.tools && srv.tools.length > 0) mcpServerToolsCache[srv.name] = srv.tools
  }
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
    registerClawdHandlers()
    registerRecruitHandlers(send)
    registerNavPluginHandlers(win, send)
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
// CLI handlers — CodexBridge (primary) + legacy StreamBridge (fallback)
// ----------------------------------------
function registerCliHandlers(win: BrowserWindow, send: (ch: string, ...a: unknown[]) => void): void {
  ipcMain.handle('cli:sendMessage', async (_e, args) => {
    // Validate and sanitize renderer-supplied flags and model (defence-in-depth)
    if (args.flags) args.flags = validateFlags(args.flags)
    if (args.model) validateModelName(args.model)

    // ── CodexBridge path (primary) ──
    // Use CodexBridge when OPENAI_API_KEY is set or no explicit ANTHROPIC key
    const useCodex = !args.env?.ANTHROPIC_API_KEY || args.env?.OPENAI_API_KEY

    if (useCodex) {
      return registerCodexSendMessage(args, send)
    }

    // ── Legacy StreamBridge fallback ──
    return registerLegacySendMessage(args, send)
  })

  ipcMain.handle('cli:abort', (_e, sessionId) => {
    // Try CodexBridge first, then legacy
    const codexBridge = codexBridgeManager.get(sessionId)
    if (codexBridge) {
      codexBridgeManager.abort(sessionId)
      return
    }
    streamBridgeManager.abort(sessionId)
  })

  ipcMain.handle('cli:respondPermission', (_e, { sessionId, requestId, allowed }) => {
    const codexBridge = codexBridgeManager.get(sessionId)
    if (codexBridge) {
      codexBridge.respondApproval(requestId, allowed)
      return
    }
    const bridge = streamBridgeManager.get(sessionId)
    if (bridge) bridge.respondPermission(requestId, allowed)
  })

  ipcMain.handle('cli:endSession', (_e, sessionId) => {
    const codexBridge = codexBridgeManager.get(sessionId)
    if (codexBridge) {
      codexBridge.endSession()
      return
    }
    const bridge = streamBridgeManager.get(sessionId)
    if (bridge) bridge.endSession()
  })

  // Codex-specific: steer an in-progress turn
  ipcMain.handle('cli:steerTurn', (_e, { sessionId, prompt }: { sessionId: string; prompt: string }) => {
    const codexBridge = codexBridgeManager.get(sessionId)
    if (codexBridge) {
      codexBridge.steerTurn(prompt).catch((err) => {
        log.warn('steerTurn error:', String(err))
      })
    }
  })

  // Codex-specific: fork a thread
  ipcMain.handle('cli:forkThread', async (_e, { sessionId, lastTurnId }: { sessionId: string; lastTurnId?: string }) => {
    const codexBridge = codexBridgeManager.get(sessionId)
    if (codexBridge) {
      const newThreadId = await codexBridge.forkThread(lastTurnId)
      return { success: true, threadId: newThreadId }
    }
    return { success: false, error: 'No active codex bridge' }
  })

  // Legacy handlers (kept for backward compat during migration)
  ipcMain.handle('cli:respondHookCallback', (_e, { sessionId, requestId, response }: { sessionId: string; requestId: string; response: Record<string, unknown> }) => {
    const bridge = streamBridgeManager.get(sessionId)
    if (bridge) bridge.respondHookCallback(requestId, response)
  })

  ipcMain.handle('cli:respondElicitation', (_e, { sessionId, requestId, result }: { sessionId: string; requestId: string; result: Record<string, unknown> }) => {
    const bridge = streamBridgeManager.get(sessionId)
    if (bridge) bridge.respondElicitation(requestId, result)
  })

  ipcMain.handle('cli:respondPlanApproval', (_e, { sessionId, requestId, approved, feedback }: { sessionId: string; requestId: string; approved: boolean; feedback?: string }) => {
    const bridge = streamBridgeManager.get(sessionId)
    if (bridge) bridge.respondPlanApproval(requestId, approved, feedback)
  })

  ipcMain.handle('cli:cancelRequest', (_e, { sessionId, requestId }: { sessionId: string; requestId: string }) => {
    const codexBridge = codexBridgeManager.get(sessionId)
    if (codexBridge) {
      codexBridge.interruptTurn().catch(() => {})
      return
    }
    const bridge = streamBridgeManager.get(sessionId)
    if (bridge) bridge.cancelRequest(requestId)
  })

  ipcMain.handle('cli:updateEnv', (_e, { sessionId, vars }: { sessionId: string; vars: Record<string, string> }) => {
    const bridge = streamBridgeManager.get(sessionId)
    if (bridge) bridge.updateEnv(vars)
  })
}

// ── CodexBridge send message implementation ──────────

async function registerCodexSendMessage(
  args: Record<string, unknown>,
  send: (ch: string, ...a: unknown[]) => void
): Promise<{ success: boolean; sessionId?: string; error?: string }> {
  const existingBridgeId = args.activeBridgeId as string | undefined

  // Reuse existing bridge for follow-up messages
  if (existingBridgeId) {
    const existingBridge = codexBridgeManager.get(existingBridgeId)
    if (existingBridge) {
      try {
        await existingBridge.sendFollowUp(args.prompt as string)
        return { success: true, sessionId: existingBridgeId }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  }

  // Create new CodexBridge
  const bridgeId = `codex-${Date.now()}`
  const bridge = codexBridgeManager.create(bridgeId)

  // Forward all events to renderer using same channel names as StreamBridge
  bridge.on('textDelta', (d) => send('cli:assistantText', d))
  bridge.on('thinkingDelta', (d) => send('cli:thinkingDelta', d))
  bridge.on('toolUse', (d) => send('cli:toolUse', d))
  bridge.on('toolResult', (d) => send('cli:toolResult', d))
  bridge.on('messageStop', (d) => send('cli:messageEnd', d))
  bridge.on('result', (d) => {
    // Map codexThreadId → claudeSessionId for renderer compatibility
    const mapped = { ...d, claudeSessionId: d.codexThreadId ?? d.threadId }
    send('cli:result', mapped)
  })
  bridge.on('messageStart', (d) => send('cli:messageStart', d))
  bridge.on('processExit', (d) => send('cli:processExit', d))
  bridge.on('stderr', (d) => send('cli:error', { sessionId: bridgeId, error: d }))
  bridge.on('permissionRequest', (d) => send('cli:permissionRequest', d))
  bridge.on('systemInit', (d) => {
    cacheMcpTools(d)
    send('cli:systemInit', d)
  })
  // Codex-specific events
  bridge.on('itemStarted', (d) => send('cli:itemStarted', d))
  bridge.on('itemCompleted', (d) => send('cli:itemCompleted', d))
  bridge.on('toolProgress', (d) => send('cli:toolProgress', d))
  bridge.on('threadStarted', (d) => send('cli:threadStarted', d))
  bridge.on('threadClosed', (d) => send('cli:threadClosed', d))

  // Clawd desktop pet notifications
  bridge.on('textDelta', () => notifyClawdState('thinking', bridgeId))
  bridge.on('thinkingDelta', () => notifyClawdState('thinking', bridgeId))
  bridge.on('toolUse', () => notifyClawdState('working', bridgeId))
  bridge.on('result', () => notifyClawdState('happy', bridgeId))
  bridge.on('processExit', () => notifyClawdState('idle', bridgeId))

  // Inject OpenAI API key if not explicitly set
  const env = (args.env as Record<string, string>) || {}
  if (!env.OPENAI_API_KEY && !env.ANTHROPIC_API_KEY) {
    env.OPENAI_API_KEY = getApiKey()
  }

  // Map permissionMode to Codex approvalPolicy
  const permissionMode = args.permissionMode as string | undefined
  let approvalPolicy: import('../codex/codex-bridge').ApprovalPolicy | undefined
  switch (permissionMode) {
    case 'bypassPermissions': approvalPolicy = 'never'; break
    case 'acceptEdits': approvalPolicy = 'unless-allow-listed'; break
    case 'dontAsk': approvalPolicy = 'never'; break
    case 'default': approvalPolicy = 'on-request'; break
    default: approvalPolicy = undefined
  }

  try {
    await bridge.sendMessage({
      prompt: args.prompt as string,
      cwd: (args.cwd as string) || process.cwd(),
      threadId: (args.sessionId as string) || undefined,
      model: args.model as string | undefined,
      env,
      approvalPolicy,
      personality: 'pragmatic',
    })
    return { success: true, sessionId: bridgeId }
  } catch (err) {
    send('cli:error', { sessionId: bridgeId, error: String(err) })
    return { success: false, error: String(err) }
  }
}

// ── Legacy StreamBridge send message (kept as fallback) ──

async function registerLegacySendMessage(
  args: Record<string, unknown>,
  send: (ch: string, ...a: unknown[]) => void
): Promise<{ success: boolean; sessionId?: string; error?: string }> {
  const skipPermissions: boolean = !!(args.flags as string[] || []).includes('--dangerously-skip-permissions')
  const permissionMode = args.permissionMode as string | undefined

  const existingBridgeId = args.activeBridgeId as string | undefined
  if (existingBridgeId && streamBridgeManager.get(existingBridgeId)) {
    const bridge = streamBridgeManager.get(existingBridgeId)!
    bridge.sendFollowUp(args.prompt as string, args.sessionId as string | undefined)
    return { success: true, sessionId: existingBridgeId }
  }

  const bridgeId = `bridge-${Date.now()}`
  const bridge = streamBridgeManager.create(bridgeId)

  bridge.on('textDelta', (d) => send('cli:assistantText', d))
  bridge.on('thinkingDelta', (d) => send('cli:thinkingDelta', d))
  bridge.on('toolUse', (d) => send('cli:toolUse', d))
  bridge.on('toolResult', (d) => send('cli:toolResult', d))
  bridge.on('messageStop', (d) => send('cli:messageEnd', d))
  bridge.on('result', (d) => send('cli:result', d))
  bridge.on('processExit', (d) => send('cli:processExit', d))
  bridge.on('stderr', (d) => send('cli:error', { sessionId: bridgeId, error: d }))
  bridge.on('permissionRequest', (d) => send('cli:permissionRequest', d))
  bridge.on('hookEvent', (d: unknown) => {
    const w = BrowserWindow.getAllWindows()[0]
    if (w && !w.isDestroyed()) w.webContents.send('cli:hookEvent', d)
  })
  bridge.on('hookCallback', (d) => send('cli:hookCallback', d))
  bridge.on('mcpElicitation', (d) => send('cli:elicitation', d))
  bridge.on('systemInit', (d) => {
    cacheMcpTools(d)
    send('cli:systemInit', d)
  })
  bridge.on('notification', (d) => send('cli:notification', d))
  bridge.on('planApprovalRequest', (d) => send('cli:planApprovalRequest', d))
  bridge.on('apiError', (d) => send('cli:apiError', d))
  bridge.on('worktreeState', (d) => send('cli:worktreeState', d))
  bridge.on('customTitle', (d) => send('cli:customTitle', d))
  bridge.on('taskCompleted', (d) => send('cli:taskCompleted', d))

  bridge.on('textDelta', () => notifyClawdState('thinking', bridgeId))
  bridge.on('thinkingDelta', () => notifyClawdState('thinking', bridgeId))
  bridge.on('toolUse', () => notifyClawdState('working', bridgeId))
  bridge.on('result', () => notifyClawdState('happy', bridgeId))
  bridge.on('apiError', () => notifyClawdState('error', bridgeId))
  bridge.on('notification', () => notifyClawdState('notification', bridgeId))
  bridge.on('processExit', () => notifyClawdState('idle', bridgeId))

  const env = (args.env as Record<string, string>) || {}
  const hasExplicitApiKey = 'ANTHROPIC_API_KEY' in env
  const hasAuthToken = !!env.ANTHROPIC_AUTH_TOKEN
  if (!hasExplicitApiKey && !hasAuthToken) {
    env.ANTHROPIC_API_KEY = getApiKey()
  }
  env.CLAUDECODE = ''

  try {
    await bridge.sendMessage({
      ...(args as any),
      skipPermissions,
      permissionMode: permissionMode as import('../pty/stream-bridge').PermissionMode | undefined,
      resumeSessionId: (args.sessionId as string) || undefined,
      sessionId: bridgeId,
      env,
    })
    return { success: true, sessionId: bridgeId }
  } catch (err) {
    send('cli:error', { sessionId: bridgeId, error: String(err) })
    return { success: false, error: String(err) }
  }
}

// ----------------------------------------
// Session handlers
// ----------------------------------------
function registerSessionHandlers(): void {
  // Session listing: merge Codex + Claude sessions (Codex primary, Claude for migration period)
  ipcMain.handle('session:list', () => {
    const codexSessions = listCodexSessions()
    const claudeSessions = listClaudeSessions()
    // Deduplicate by sessionId, preferring Codex sessions
    const seen = new Set(codexSessions.map(s => s.sessionId))
    const merged = [...codexSessions]
    for (const s of claudeSessions) {
      if (!seen.has(s.sessionId)) merged.push(s)
    }
    return merged.sort((a, b) => b.timestamp - a.timestamp)
  })

  // Session loading: try Codex first, then Claude
  ipcMain.handle('session:load', (_e, id) => {
    const codexResult = loadCodexSession(id)
    if (codexResult.length > 0) return codexResult
    return loadClaudeSession(id)
  })

  // Session deletion: try both
  ipcMain.handle('session:delete', (_e, id) => {
    const codexDeleted = deleteCodexSession(id)
    const claudeDeleted = deleteClaudeSession(id)
    return codexDeleted || claudeDeleted
  })

  // Session fork: use Codex fork
  ipcMain.handle('session:fork', (_e, { sessionId, upToMessageIndex }) => {
    const codexResult = forkCodexSession(sessionId, upToMessageIndex)
    if (codexResult) return codexResult
    return forkClaudeSession(sessionId, upToMessageIndex)
  })
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
    // Search both Codex and Claude sessions
    const codexResults = searchCodexSessions(query, limit)
    const claudeResults = searchClaudeSessions(query, limit)
    return [...codexResults, ...claudeResults].slice(0, limit || 20)
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

  ipcMain.handle('session:getStats', async () => {
    return getSessionStats()
  })

  // DreamTask detection: returns the mtime of the .consolidate-lock file that
  // the CLI updates whenever an auto-dream (memory consolidation) completes.
  // Renderer compares this against its session-start snapshot to detect dreams.
  ipcMain.handle('session:getDreamMtime', () => getDreamConsolidationMtime())
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

  // ── MCP ──────────────────────────────────────────────────────────────────
  // Every handler below is engine-routed (src/main/config/mcp-config.ts):
  // Codex keeps servers in ~/.codex/config.toml, Claude in ~/.claude/settings.json.
  safeHandle('mcp:configInfo', () => getMcpConfigInfo())

  safeHandle('mcp:list', () => readMcpServers().map(srv => ({
    name: srv.name,
    command: srv.command,
    args: srv.args,
    url: srv.url,
    type: srv.type,
    disabled: srv.disabled,
  })))

  /** Full config, including transport details, for the Settings → MCP tab. */
  safeHandle('mcp:readConfig', () => ({
    ...getMcpConfigInfo(),
    servers: readMcpServers(),
  }))

  // ── CLI settings.json read/write (Iteration 518) ─────
  safeHandle('config:readCLISettings', () => {
    try {
      return readCLISettings()
    } catch (err) {
      log.warn('config:readCLISettings error:', String(err))
      return { error: String(err) }
    }
  })
  safeHandle('config:writeCLISettings', (_e, patch: Record<string, unknown>) => {
    try {
      writeCLISettings(patch)
      return { success: true }
    } catch (err) {
      log.warn('config:writeCLISettings error:', String(err))
      return { error: String(err) }
    }
  })
  safeHandle('mcp:setEnabled', (_e, { serverName, enabled }: { serverName: string; enabled: boolean }) =>
    setMcpServerEnabledRouted(serverName, enabled))

  safeHandle('mcp:add', (_e, { name, config }: { name: string; type: string; config: Record<string, unknown> }) =>
    addMcpServer(name, config))

  safeHandle('mcp:remove', (_e, { name }: { name: string }) => removeMcpServer(name))

  safeHandle('mcp:getTools', async (_e, { serverName }: { serverName: string }) => {
    // Return tools from system.init cache; fall back to empty array if not yet populated
    const cachedTools = mcpServerToolsCache[serverName] ?? []
    const tools = cachedTools.map((toolFullName: string) => {
      // Parse display name from mcp__serverName__toolName format
      const prefix = `mcp__${serverName}__`
      const displayName = toolFullName.startsWith(prefix)
        ? toolFullName.slice(prefix.length)
        : toolFullName
      return { name: displayName, fullName: toolFullName }
    })
    return { tools }
  })

  safeHandle('mcp:reconnect', async (_e, { serverName: _serverName }: { serverName: string }) => {
    return { success: false, error: 'Reconnect not supported in this version' }
  })

  // ── Memory ──────────────────────────────────────────────────────────────
  safeHandle('memory:list', (_e, { scope }: { scope?: 'global' | 'project' | 'all' }) => {
    return listMemoryFiles(scope || 'all')
  })
  safeHandle('memory:read', (_e, { filePath }: { filePath: string }) => {
    return readMemoryFile(filePath)
  })
  safeHandle('memory:write', (_e, { filePath, content }: { filePath: string; content: string }) => {
    writeMemoryFile(filePath, content)
    return { success: true }
  })
  safeHandle('memory:create', (_e, { name, description, type, body, scope, projectHash }: {
    name: string; description: string; type: string; body: string; scope: 'global' | 'project'; projectHash?: string
  }) => {
    const filePath = createMemoryFile(name, description, type, body, scope, projectHash)
    return { success: true, filePath }
  })
  safeHandle('memory:delete', (_e, { filePath }: { filePath: string }) => {
    deleteMemoryFile(filePath)
    return { success: true }
  })

  // ── Worktree ─────────────────────────────────────────────────────────────
  safeHandle('worktree:isGitRepo', (_e, { cwd }: { cwd: string }) => {
    return { isGit: checkIsGitRepo(cwd) }
  })
  safeHandle('worktree:list', (_e, { cwd }: { cwd: string }) => {
    return listWorktrees(cwd)
  })
  safeHandle('worktree:create', async (_e, { cwd, name }: { cwd: string; name: string }) => {
    return createWorktree(cwd, name)
  })
  safeHandle('worktree:remove', (_e, { cwd, worktreePath, force }: { cwd: string; worktreePath: string; force: boolean }) => {
    removeWorktree(cwd, worktreePath, force)
    return { success: true }
  })

  // ── Plugin ───────────────────────────────────────────────────────────────
  safeHandle('plugin:list', () => {
    return listPlugins()
  })
  safeHandle('plugin:setEnabled', (_e, { name, enabled }: { name: string; enabled: boolean }) => {
    setPluginEnabled(name, enabled)
    return { success: true }
  })
  safeHandle('plugin:uninstall', (_e, { name }: { name: string }) => {
    uninstallPlugin(name)
    return { success: true }
  })
  safeHandle('plugin:registerLocal', (_e, { pluginPath }: { pluginPath: string }) => {
    return registerLocalPlugin(pluginPath)
  })

  ipcMain.handle('feedback:rate', (_e: Electron.IpcMainInvokeEvent, { messageId, rating }: { messageId: string; rating: 'up' | 'down' | null }) => {
    const key = `feedback.${messageId}`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(setPref as any)(key, rating)
  })
}

// ----------------------------------------
// Nav Plugin handlers (Hot-Pluggable Left-Rail & Main View Plugins)
// ----------------------------------------
function registerNavPluginHandlers(win: BrowserWindow, send: (ch: string, ...a: unknown[]) => void): void {
  const getWorkingDir = () => ((getPref as any)('workingDir') as string) || ''
  initNavPluginManager(
    getWorkingDir,
    (plugins) => {
      send('plugin:nav:updated', plugins)
    }
  )
  // Tasks panel moved into the Work Calendar plugin — carry old data over
  migrateLegacyTasks()
  startWorkCalendarReminders(win)

  safeHandle('plugin:nav:list', () => {
    return listNavPlugins()
  })
  safeHandle('plugin:nav:reload', () => reloadNavPlugins(getWorkingDir()))
  safeHandle('plugin:nav:openFolder', (_e, { pluginId }: { pluginId?: string } = {}) => {
    return openPluginFolder(pluginId || '')
  })

  // ── Host capabilities for plugins (gated by manifest.permissions) ──
  // PluginHostView already checks permissions; re-check here so a compromised
  // renderer path can't reach capabilities a plugin never declared.
  const requirePermission = (pluginId: string, permission: string): void => {
    const plugin = listNavPlugins().find(p => p.manifest.id === pluginId)
    if (!plugin) throw new Error(`Unknown plugin: ${pluginId}`)
    if (!plugin.manifest.permissions?.includes(permission)) {
      throw new Error(`Plugin ${pluginId} lacks "${permission}" permission`)
    }
  }

  safeHandle('plugin:data:get', (_e, { pluginId, key }: { pluginId: string; key: string }) => {
    requirePermission(pluginId, 'storage')
    return readPluginData(pluginId, key)
  })
  safeHandle('plugin:data:set', (_e, { pluginId, key, value }: { pluginId: string; key: string; value: unknown }) => {
    requirePermission(pluginId, 'storage')
    writePluginData(pluginId, key, value)
    return true
  })
  safeHandle('plugin:github:commits', (_e, { pluginId, args }: { pluginId: string; args: GithubCommitsArgs }) => {
    requirePermission(pluginId, 'network')
    return fetchGithubCommits(args)
  })
  safeHandle('plugin:fs:scanFolder', (_e, { pluginId, args }: { pluginId: string; args: ScanFolderArgs }) => {
    requirePermission(pluginId, 'fs')
    return scanFolderChanges(args)
  })
  safeHandle('plugin:fs:pickFolder', async (_e, { pluginId, title }: { pluginId: string; title?: string }) => {
    requirePermission(pluginId, 'fs')
    const result = win.isDestroyed()
      ? await dialog.showOpenDialog({ title, properties: ['openDirectory'] })
      : await dialog.showOpenDialog(win, { title, properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0] ?? null
  })
  safeHandle('plugin:ai:generate', async (_e, { pluginId, requestId, prompt, instructions, model }: {
    pluginId: string
    requestId: string
    prompt: string
    instructions?: string
    model?: string
  }) => {
    requirePermission(pluginId, 'ai')
    const scopedId = `${pluginId}:${requestId}`
    await startPluginAi(
      { requestId: scopedId, prompt, instructions, model, apiKey: getApiKey() || undefined },
      (event) => send('plugin:ai:event', { ...event, pluginId, requestId })
    )
    return { started: true }
  })
  safeHandle('plugin:ai:abort', (_e, { pluginId, requestId }: { pluginId: string; requestId: string }) => {
    abortPluginAi(`${pluginId}:${requestId}`)
  })

  // ── Edit drawer: a chat whose cwd IS the plugin folder, so the AI rewrites
  // the plugin's own files. Not permission-gated — this is the *host* editing
  // the plugin at the user's request, the same trust level as the source view.
  const editDir = (pluginId: string): string => {
    const plugin = listNavPlugins().find(p => p.manifest.id === pluginId)
    if (!plugin) throw new Error(`Unknown plugin: ${pluginId}`)
    // Resolve from our own scan, never from a renderer-supplied path.
    return plugin.dirPath
  }

  safeHandle('plugin:edit:start', async (_e, { pluginId, prompt, model }: {
    pluginId: string
    prompt: string
    model?: string
  }) => {
    await startPluginEdit(
      { pluginId, dirPath: editDir(pluginId), prompt, model, apiKey: getApiKey() || undefined },
      (event) => send('plugin:edit:event', event)
    )
    return { started: true }
  })
  safeHandle('plugin:edit:send', async (_e, { pluginId, prompt }: { pluginId: string; prompt: string }) => {
    await sendPluginEdit(pluginId, prompt)
    return { sent: true }
  })
  safeHandle('plugin:edit:abort', (_e, { pluginId }: { pluginId: string }) => abortPluginEdit(pluginId))
  safeHandle('plugin:edit:close', (_e, { pluginId }: { pluginId: string }) => endPluginEdit(pluginId))
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

// ----------------------------------------
// Recruit helpers (department roster)
// ----------------------------------------
// Nothing here reads or writes the roster — departments and their employees are
// renderer-side state. This is only the one-shot model call behind the recruit
// dialog's 「AI 润色」 button, reusing the same generator the plugins use.

const recruitPolishInstructions = (language: string): string => [
  'You are the recruiting assistant inside AIPA, a desktop AI assistant where every "employee" is an AI agent working in one folder.',
  'The recruiter drafts a job description for a new employee: the responsibilities that employee owns and the skills they bring.',
  'Rewrite the draft into a polished job description that can be handed straight to that employee as their first task briefing.',
  `- Write in ${language}.`,
  '- Keep the recruiter\'s intent, facts and scope. Sharpen the wording, fill obvious gaps, drop vagueness.',
  '- A short paragraph, then a few bullet lines covering responsibilities and required skills. No markdown headings, no title line, no preamble.',
  '- Never ask a question, never explain what you changed, never mention that this is a rewrite.',
  '- Under 200 words.',
].join('\n')

function registerRecruitHandlers(send: (ch: string, ...a: unknown[]) => void): void {
  safeHandle('recruit:polish:start', async (_e, { requestId, draft, deptName, locale, model }: {
    requestId: string
    draft: string
    deptName: string
    locale?: string
    model?: string
  }) => {
    const body = (draft || '').trim()
    const prompt = [
      `部门 / Department: ${deptName}`,
      body
        ? `招聘者写的职位描述草稿 / The recruiter's draft:\n"""\n${body}\n"""`
        : '招聘者还没有写任何内容，请仅根据部门自行起草这份职位描述。/ The recruiter has written nothing yet — draft the description yourself, using the department as the only context.',
    ].join('\n\n')
    // The scope prefix keeps this generator's request ids from colliding with a
    // plugin's, since both share the one in-flight registry.
    await startPluginAi(
      {
        requestId: `recruit:${requestId}`,
        prompt,
        instructions: recruitPolishInstructions(locale === 'zh-CN' ? 'Simplified Chinese (简体中文)' : 'English'),
        model,
        apiKey: getApiKey() || undefined,
      },
      (event) => send('recruit:polish:event', { ...event, requestId })
    )
    return { started: true }
  })
  safeHandle('recruit:polish:abort', (_e, { requestId }: { requestId: string }) => {
    abortPluginAi(`recruit:${requestId}`)
  })
}

// ----------------------------------------
// Clawd desktop pet handlers (Iteration 615)
// ----------------------------------------
function registerClawdHandlers(): void {
  safeHandle('clawd:launch', async () => {
    try {
      const running = await isClawdRunning()
      if (!running) {
        launchClawd()
      }
      return { success: true, alreadyRunning: running }
    } catch (err) {
      log.warn('clawd:launch error:', String(err))
      return { success: false, error: String(err) }
    }
  })

  safeHandle('clawd:isRunning', async () => {
    try {
      return { running: await isClawdRunning() }
    } catch {
      return { running: false }
    }
  })

  safeHandle('clawd:getInitError', async () => {
    return { error: getClawdInitError() }
  })

  // Read/write clawd prefs from the embedded pet's prefs file
  safeHandle('clawd:getPrefs', async () => {
    try {
      const prefsPath = path.join(app.getPath('userData'), 'clawd-prefs.json')
      const raw = JSON.parse(fs.readFileSync(prefsPath, 'utf8'))
      return { prefs: raw }
    } catch {
      return { prefs: {} }
    }
  })

  safeHandle('clawd:setPrefs', async (_e, key: string, value: unknown) => {
    try {
      const prefsPath = path.join(app.getPath('userData'), 'clawd-prefs.json')
      let prefs: Record<string, unknown> = {}
      try { prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8')) } catch {}
      prefs[key] = value
      fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2))

      // Notify the running clawd instance to apply the change immediately
      // via its settings controller IPC handler
      try {
        const mainWindow = BrowserWindow.getAllWindows()[0]
        if (mainWindow) {
          mainWindow.webContents.send('clawd:prefsChanged', key, value)
        }
      } catch { /* best-effort */ }

      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })
}
