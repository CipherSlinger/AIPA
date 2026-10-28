import { ipcMain, BrowserWindow, shell, app, dialog } from 'electron'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { ptyManager } from '../pty/pty-manager'
import { fallbackShellManager } from '../pty/fallback-shell'
import { codexBridgeManager } from '../codex/codex-bridge'
import { buildCodexTurnArgs } from '../codex/codex-turn-args'
import { streamBridgeManager } from '../pty/stream-bridge'
import { speculationManager, isSafeToSpeculate } from '../pty/speculation-bridge'
import { readSettings, writeSettings, listSessions as listClaudeSessions, loadSession as loadClaudeSession, deleteSession as deleteClaudeSession, forkSession as forkClaudeSession, renameSession, generateSessionTitle, generatePromptSuggestion, generateAwaySummary, rewindSession, searchSessions as searchClaudeSessions, detectTurnInterruption, getDreamConsolidationMtime } from '../sessions/session-reader'
import { listSessions as listCodexSessions, loadSession as loadCodexSession, deleteSession as deleteCodexSession, forkSession as forkCodexSession, searchSessions as searchCodexSessions, readCodexConfig } from '../codex/codex-session-reader'
import { addMcpServer, getMcpConfigInfo, readMcpServers, removeMcpServer, setMcpServerEnabledRouted } from '../config/mcp-config'
import { getSessionStats } from '../sessions/session-stats'
import { getApiKey, setApiKey, getPref, setPref, getAllPrefs, resetAllPrefs } from '../config/config-manager'
import { redactProviderSecrets } from '../providers'
import type { ModelProviderConfig } from '../providers'
import { readCLISettings, writeCLISettings } from '../config/cli-settings-manager'
import { listMemoryFiles, readMemoryFile, writeMemoryFile, createMemoryFile, deleteMemoryFile } from '../sessions/memory-manager'
import { checkIsGitRepo, listWorktrees, createWorktree, removeWorktree } from '../sessions/worktree-manager'
import { listPlugins, setPluginEnabled, uninstallPlugin, registerLocalPlugin } from '../plugins/plugin-manager'
import { initNavPluginManager, listNavPlugins, reloadNavPlugins, openPluginFolder } from '../plugins/nav-plugin-manager'
import { pluginUrl } from '../plugins/plugin-url'
import { migrateLegacyTasks, startWorkCalendarReminders } from '../plugins/work-calendar-reminders'
import { readPluginData, writePluginData, fetchGithubCommits, scanFolderChanges, startPluginAi, abortPluginAi, type GithubCommitsArgs, type ScanFolderArgs } from '../plugins/plugin-services'
import { startPluginEdit, sendPluginEdit, abortPluginEdit, endPluginEdit } from '../plugins/plugin-edit-session'
import { getCliPath } from '../utils/cli-path'
import { validateApiKey, validateModelName, validateFlags, safePath, getAllowedFsRoots, isValidSessionId } from '../utils/validate'
import { registerSkillsHandlers } from './skills-handlers'
import { registerProviderHandlers } from './provider-handlers'
import { registerFsHandlers } from './fs-handlers'
import { registerWindowHandlers } from './window-handlers'
import { registerDiagnosticsHandlers } from './diagnostics-handlers'
import { registerBackupHandlers } from './backup-handlers'
import { registerAutomationHandlers } from './automation-handlers'
import { startAutomationScheduler } from '../automation/scheduler'
import { runAutomation } from '../automation/runner'
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
 * The window push events should go to. It is a module-level reference rather
 * than a captured argument because `createWindow` runs again after the first
 * window is destroyed (macOS activate, tray "show"), and handlers registered
 * once must keep working against the new one.
 */
let liveWindow: BrowserWindow | null = null

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
  liveWindow = win
  if (handlersRegistered) {
    log.info('IPC handlers already registered, updating window reference only')
    // `send` and the scheduler read `liveWindow`, so a recreated window is
    // picked up without re-registering every handler.
    return
  }
  handlersRegistered = true

  const send = (channel: string, ...args: unknown[]) => {
    const target = liveWindow
    if (target && !target.isDestroyed()) target.webContents.send(channel, ...args)
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
    registerAutomationHandlers()
    // Started last: its first tick may run a due job, and every channel it
    // broadcasts on already exists by then. The scheduler resolves the window
    // lazily: it outlives this one and must not hold a destroyed reference.
    startAutomationScheduler(
      () => (liveWindow && !liveWindow.isDestroyed() ? liveWindow : null),
      send,
      runAutomation,
    )
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

/** Renderer-push sink shared by both engines. */
type BridgeSink = (channel: string, data: Record<string, unknown>) => void

/**
 * Bridge-id prefix reserved for background turns. The renderer subscribes to
 * every bridge (onCliEvent(null)), so an untagged background turn used to pour
 * its tokens into whichever conversation was open. Internal turns get a fresh
 * bridge with this prefix and their events are consumed here instead of being
 * forwarded to the renderer.
 */
export const INTERNAL_BRIDGE_PREFIX = 'internal-'

function isInternalBridgeId(id: unknown): boolean {
  return typeof id === 'string' && id.startsWith(INTERNAL_BRIDGE_PREFIX)
}

function registerCliHandlers(win: BrowserWindow, send: (ch: string, ...a: unknown[]) => void): void {
  ipcMain.handle('cli:sendMessage', async (_e, args) => {
    // Validate and sanitize renderer-supplied flags, model, cwd and resume id
    // (defence-in-depth). `cwd` becomes the CLI's working directory and
    // `sessionId` becomes its `--resume` argument, so neither may pass through
    // raw. Validation used to throw out of the handler, which reaches the
    // renderer as a raw "Error invoking remote method" rejection.
    try {
      if (args.flags) args.flags = validateFlags(args.flags)
      if (args.model) validateModelName(args.model)
      if (args.cwd) {
        args.cwd = safePath(
          args.cwd,
          getAllowedFsRoots(getPref('workingDir') as string | undefined),
        )
      }
      if (args.sessionId && !isValidSessionId(args.sessionId)) {
        return { success: false, error: 'Invalid session id' }
      }
    } catch (err) {
      log.warn('cli:sendMessage rejected:', String(err))
      return { success: false, error: String(err) }
    }

    // ── CodexBridge path (primary) ──
    // Use CodexBridge when OPENAI_API_KEY is set or no explicit ANTHROPIC key
    const useCodex = !args.env?.ANTHROPIC_API_KEY || args.env?.OPENAI_API_KEY
    const sink: BridgeSink = (channel, data) => send(channel, data)

    if (useCodex) {
      return registerCodexSendMessage(args, sink)
    }

    // ── Legacy StreamBridge fallback ──
    return registerLegacySendMessage(args, sink)
  })

  // Background work (memory extraction, away summary) runs a real CLI turn but
  // owns no conversation. The caller gets the final text from this invoke, so
  // it never has to scrape the chat store for output that was never its own —
  // and the turn's events never reach the renderer at all.
  ipcMain.handle('cli:runInternal', async (_e, args: Record<string, unknown> | undefined) => {
    try {
      if (!args || typeof args.prompt !== 'string' || !args.prompt.trim()) {
        return { success: false, error: 'Missing prompt' }
      }
      const safeArgs = { ...args }
      if (typeof safeArgs.cwd === 'string' && safeArgs.cwd) {
        safeArgs.cwd = safePath(
          safeArgs.cwd,
          getAllowedFsRoots(getPref('workingDir') as string | undefined),
        )
      }
      if (typeof safeArgs.model === 'string' && safeArgs.model) {
        validateModelName(safeArgs.model)
      }
      return await runInternalTurn(safeArgs)
    } catch (err) {
      log.warn('cli:runInternal rejected:', String(err))
      return { success: false, error: String(err) }
    }
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

/** Wire a CodexBridge to the renderer, reusing the legacy channel names. */
function wireCodexBridge(
  bridge: import('../codex/codex-bridge').CodexBridge,
  bridgeId: string,
  sink: BridgeSink,
  internal = false,
): void {
  bridge.on('textDelta', (d) => sink('cli:assistantText', d))
  bridge.on('thinkingDelta', (d) => sink('cli:thinkingDelta', d))
  bridge.on('toolUse', (d) => sink('cli:toolUse', d))
  bridge.on('toolResult', (d) => sink('cli:toolResult', d))
  bridge.on('messageStop', (d) => sink('cli:messageEnd', d))
  bridge.on('result', (d) => {
    // Map codexThreadId → claudeSessionId for renderer compatibility
    const mapped = { ...d, claudeSessionId: d.codexThreadId ?? d.threadId }
    sink('cli:result', mapped)
  })
  bridge.on('messageStart', (d) => sink('cli:messageStart', d))
  bridge.on('processExit', (d) => sink('cli:processExit', d))
  bridge.on('stderr', (d) => sink('cli:error', { sessionId: bridgeId, error: d }))
  bridge.on('permissionRequest', (d) => sink('cli:permissionRequest', d))
  bridge.on('systemInit', (d) => {
    cacheMcpTools(d)
    sink('cli:systemInit', d)
  })
  // Token accounting + failure/checklist signals the renderer's ChatPanel and
  // TokenUsageBar already know how to consume; without these the Codex path
  // had no context meter, no warnings and a failed turn looked like a hang.
  bridge.on('tokenUsageUpdated', (d) => sink('cli:tokenUsageUpdated', d))
  bridge.on('turnError', (d) => sink('cli:turnError', d))
  bridge.on('threadStatusChanged', (d) => sink('cli:threadStatusChanged', d))
  bridge.on('planUpdated', (d) => sink('cli:planUpdated', d))
  bridge.on('compacted', (d) => sink('cli:compacted', d))
  // Codex-specific events
  bridge.on('itemStarted', (d) => sink('cli:itemStarted', d))
  bridge.on('itemCompleted', (d) => sink('cli:itemCompleted', d))
  bridge.on('toolProgress', (d) => sink('cli:toolProgress', d))
  bridge.on('threadStarted', (d) => sink('cli:threadStarted', d))
  bridge.on('threadClosed', (d) => sink('cli:threadClosed', d))

  // A background turn must not drive the desktop pet — it has no session id
  // the pet can attribute, and it would flip the state while the user reads.
  if (internal) return

  // Clawd desktop pet notifications
  bridge.on('textDelta', () => notifyClawdState('thinking', bridgeId))
  bridge.on('thinkingDelta', () => notifyClawdState('thinking', bridgeId))
  bridge.on('toolUse', () => notifyClawdState('working', bridgeId))
  bridge.on('result', () => notifyClawdState('happy', bridgeId))
  bridge.on('processExit', () => notifyClawdState('idle', bridgeId))
}

/** Wire the legacy StreamBridge to the renderer (shared by user + internal turns). */
function wireStreamBridge(
  bridge: import('../pty/stream-bridge').StreamBridge,
  bridgeId: string,
  sink: BridgeSink,
  internal = false,
): void {
  bridge.on('textDelta', (d) => sink('cli:assistantText', d))
  bridge.on('thinkingDelta', (d) => sink('cli:thinkingDelta', d))
  bridge.on('toolUse', (d) => sink('cli:toolUse', d))
  bridge.on('toolResult', (d) => sink('cli:toolResult', d))
  bridge.on('messageStop', (d) => sink('cli:messageEnd', d))
  bridge.on('result', (d) => sink('cli:result', d))
  bridge.on('processExit', (d) => sink('cli:processExit', d))
  bridge.on('stderr', (d) => sink('cli:error', { sessionId: bridgeId, error: d }))
  bridge.on('permissionRequest', (d) => sink('cli:permissionRequest', d))
  bridge.on('hookEvent', (d) => sink('cli:hookEvent', d))
  bridge.on('hookCallback', (d) => sink('cli:hookCallback', d))
  bridge.on('mcpElicitation', (d) => sink('cli:elicitation', d))
  bridge.on('systemInit', (d) => {
    cacheMcpTools(d)
    sink('cli:systemInit', d)
  })
  bridge.on('notification', (d) => sink('cli:notification', d))
  bridge.on('planApprovalRequest', (d) => sink('cli:planApprovalRequest', d))
  bridge.on('apiError', (d) => sink('cli:apiError', d))
  bridge.on('worktreeState', (d) => sink('cli:worktreeState', d))
  bridge.on('customTitle', (d) => sink('cli:customTitle', d))
  bridge.on('taskCompleted', (d) => sink('cli:taskCompleted', d))

  if (internal) return

  bridge.on('textDelta', () => notifyClawdState('thinking', bridgeId))
  bridge.on('thinkingDelta', () => notifyClawdState('thinking', bridgeId))
  bridge.on('toolUse', () => notifyClawdState('working', bridgeId))
  bridge.on('result', () => notifyClawdState('happy', bridgeId))
  bridge.on('apiError', () => notifyClawdState('error', bridgeId))
  bridge.on('notification', () => notifyClawdState('notification', bridgeId))
  bridge.on('processExit', () => notifyClawdState('idle', bridgeId))
}

async function registerCodexSendMessage(
  args: Record<string, unknown>,
  sink: BridgeSink,
  internal = false,
): Promise<{ success: boolean; sessionId?: string; error?: string }> {
  const existingBridgeId = args.activeBridgeId as string | undefined
  const prompt = args.prompt as string
  const input = args.input as import('../codex/codex-bridge').CodexUserInput[] | undefined
  // `/compact` is a renderer-side command; Codex exposes it as thread/compact/start.
  // Sending the literal string would just make the model talk about a slash command.
  const isCompact = /^\/compact\b/.test(prompt.trim())

  // Reuse existing bridge for follow-up messages (never for a background turn,
  // which must not join a user conversation's thread).
  if (existingBridgeId && !internal) {
    const existingBridge = codexBridgeManager.get(existingBridgeId)
    if (existingBridge) {
      try {
        if (isCompact) {
          await existingBridge.compactThread()
          // A notification follows, but only for current Codex builds; emit
          // once more so the renderer can never stay stuck in "compacting".
          sink('cli:compacted', { sessionId: existingBridgeId })
        } else {
          await existingBridge.sendFollowUp(prompt, input)
        }
        return { success: true, sessionId: existingBridgeId }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  }

  // A live bridge may already own this thread even when the renderer lost its
  // bridge id (new tab, rebuilt renderer, TokenUsageBar's direct /compact call).
  const requestedThreadId = internal ? undefined : args.sessionId as string | undefined
  if (requestedThreadId) {
    const live = codexBridgeManager.findByThreadId(requestedThreadId)
    if (live) {
      try {
        if (isCompact) {
          await live.bridge.compactThread()
          sink('cli:compacted', { sessionId: live.bridgeId })
        } else {
          await live.bridge.sendFollowUp(prompt, input)
        }
        return { success: true, sessionId: live.bridgeId }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  }

  // Create new CodexBridge
  const bridgeId = `${internal ? INTERNAL_BRIDGE_PREFIX : ''}codex-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const bridge = codexBridgeManager.create(bridgeId)
  wireCodexBridge(bridge, bridgeId, sink, internal)

  // Credentials and sandbox defaults come from the shared builder, so a
  // background/automation caller cannot accidentally construct a turn that
  // runs without the key the user saved in Settings.
  const bridgeArgs = buildCodexTurnArgs(
    {
      prompt,
      ...(input ? { input } : {}),
      cwd: (args.cwd as string) || process.cwd(),
      threadId: (args.sessionId as string) || undefined,
      model: args.model as string | undefined,
      env: (args.env as Record<string, string>) || {},
      permissionMode: args.permissionMode as string | undefined,
    },
    {
      // A background turn has no UI to answer an approval prompt (its events
      // never reach the renderer), so it must never ask: deny and let the
      // model finish. It must also not leave a rollout in session history.
      ...(internal ? { approvalPolicy: 'never' as const, ephemeral: true } : {}),
      ...(args.ephemeral === true ? { ephemeral: true } : {}),
    },
  )

  try {
    if (isCompact) {
      await bridge.compactSession(bridgeArgs)
      sink('cli:compacted', { sessionId: bridgeId })
    } else {
      await bridge.sendMessage(bridgeArgs)
    }
    return { success: true, sessionId: bridgeId }
  } catch (err) {
    // The handshake/turn never started; don't leave a half-initialized
    // app-server process behind waiting for input.
    try { bridge.abort() } catch { /* already gone */ }
    sink('cli:error', { sessionId: bridgeId, error: String(err) })
    return { success: false, error: String(err) }
  }
}

// ── Legacy StreamBridge send message (kept as fallback) ──

async function registerLegacySendMessage(
  args: Record<string, unknown>,
  sink: BridgeSink,
  internal = false,
): Promise<{ success: boolean; sessionId?: string; error?: string }> {
  const skipPermissions: boolean = !!(args.flags as string[] || []).includes('--dangerously-skip-permissions')
  const permissionMode = args.permissionMode as string | undefined

  const existingBridgeId = args.activeBridgeId as string | undefined
  if (existingBridgeId && !internal && streamBridgeManager.get(existingBridgeId)) {
    const bridge = streamBridgeManager.get(existingBridgeId)!
    bridge.sendFollowUp(args.prompt as string, args.sessionId as string | undefined)
    return { success: true, sessionId: existingBridgeId }
  }

  const bridgeId = `${internal ? INTERNAL_BRIDGE_PREFIX : ''}bridge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const bridge = streamBridgeManager.create(bridgeId)
  wireStreamBridge(bridge, bridgeId, sink, internal)

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
      // A background turn never resumes a user conversation.
      resumeSessionId: internal ? undefined : ((args.sessionId as string) || undefined),
      sessionId: bridgeId,
      env,
    })
    return { success: true, sessionId: bridgeId }
  } catch (err) {
    sink('cli:error', { sessionId: bridgeId, error: String(err) })
    return { success: false, error: String(err) }
  }
}

// ── Internal (background) turns ──────────────────────────

/**
 * Run one CLI turn that belongs to no conversation: the bridge gets an
 * `internal-` id, its events go to a private sink, and the final text is the
 * invoke's result. Both engines are reachable through the same two helpers,
 * so the isolation is identical for Codex and the legacy Claude bridge.
 */
async function runInternalTurn(
  args: Record<string, unknown>,
): Promise<{ success: boolean; text?: string; error?: string }> {
  const prompt = String(args.prompt ?? '')
  const timeoutMs = Math.min(Math.max(Number(args.timeoutMs) || 60_000, 5_000), 180_000)

  let streamed = ''
  let resultText = ''
  let lastError = ''
  let failure = ''
  let settle: () => void = () => {}
  const finished = new Promise<void>((resolve) => { settle = resolve })
  let settled = false
  const done = () => {
    if (settled) return
    settled = true
    settle()
  }

  const sink: BridgeSink = (channel, data) => {
    switch (channel) {
      case 'cli:assistantText':
        if (typeof data.text === 'string') streamed += data.text
        break
      case 'cli:result': {
        // Terminal for both engines: Codex emits it from turn/completed, and
        // the Claude bridge only after the whole turn is done. Claude also
        // puts the complete answer on the result envelope; Codex does not, so
        // the accumulated deltas remain the fallback.
        const event = data.event as Record<string, unknown> | undefined
        if (typeof event?.result === 'string') resultText = event.result
        if (typeof data.subtype === 'string' && data.subtype !== 'success') failure = data.subtype
        done()
        break
      }
      case 'cli:processExit':
        done()
        break
      // `cli:messageEnd` is deliberately NOT terminal. On the legacy Claude
      // bridge it mirrors every `assistant`/`message_stop` event, i.e. it fires
      // once per assistant message — long before `cli:result`, which is where
      // Claude puts the final text. Settling here used to abort the bridge
      // before the answer existed and made every reply look empty.
      case 'cli:error':
        if (typeof data.error === 'string') lastError = data.error
        break
      case 'cli:permissionRequest': {
        // Nobody is watching this turn; deny instead of waiting for a reply.
        const sid = String(data.sessionId ?? '')
        const requestId = String(data.requestId ?? '')
        const codex = codexBridgeManager.get(sid)
        if (codex) codex.respondApproval(requestId, false)
        streamBridgeManager.get(sid)?.respondPermission(requestId, false)
        break
      }
    }
  }

  const sendArgs: Record<string, unknown> = {
    prompt,
    cwd: (args.cwd as string) || process.cwd(),
    model: args.model,
    env: (args.env as Record<string, string>) || {},
    flags: [],
    // Read-only turns: a memory extraction must not be able to edit the repo.
    permissionMode: 'plan',
    // Background work is not a conversation: do not persist a rollout that
    // would show up in the sidebar/archive with quoted private text.
    ephemeral: true,
  }
  const env = sendArgs.env as Record<string, string>
  const useCodex = !env.ANTHROPIC_API_KEY || !!env.OPENAI_API_KEY

  let launched: { success: boolean; sessionId?: string; error?: string }
  try {
    launched = useCodex
      ? await registerCodexSendMessage(sendArgs, sink, true)
      : await registerLegacySendMessage(sendArgs, sink, true)
  } catch (err) {
    return { success: false, error: String(err) }
  }
  const bridgeId = launched.sessionId
  if (!launched.success || !bridgeId) {
    return { success: false, error: launched.error || 'Failed to start internal turn' }
  }

  let timer: NodeJS.Timeout | undefined
  const timedOut = await Promise.race([
    finished.then(() => false),
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(true), timeoutMs)
      timer.unref?.()
    }),
  ])
  if (timer) clearTimeout(timer)

  // Single-shot bridge: reap the process instead of letting it idle until the
  // app exits (Codex keeps a whole app-server alive per bridge).
  if (isInternalBridgeId(bridgeId)) {
    codexBridgeManager.abort(bridgeId)
    streamBridgeManager.abort(bridgeId)
  }

  if (timedOut) {
    return { success: false, error: `Internal turn timed out after ${timeoutMs}ms`, text: streamed || undefined }
  }
  if (failure) {
    return { success: false, error: failure, text: resultText || streamed || undefined }
  }
  const text = resultText || streamed
  if (!text.trim()) {
    return { success: false, error: lastError || 'Empty response' }
  }
  return { success: true, text }
}

// ----------------------------------------
// Session handlers
// ----------------------------------------
function registerSessionHandlers(): void {
  // Session listing: merge Codex + Claude sessions (Codex primary, Claude for migration period)
  ipcMain.handle('session:list', () => {
    try {
      const codexSessions = listCodexSessions()
      const claudeSessions = listClaudeSessions()
      // Deduplicate by sessionId, preferring Codex sessions
      const seen = new Set(codexSessions.map(s => s.sessionId))
      const merged = [...codexSessions]
      for (const s of claudeSessions) {
        if (!seen.has(s.sessionId)) merged.push(s)
      }
      return merged.sort((a, b) => b.timestamp - a.timestamp)
    } catch (err) {
      log.warn('session:list error:', String(err))
      return []
    }
  })

  // Session loading: try Codex first, then Claude
  ipcMain.handle('session:load', (_e, id) => {
    try {
      const codexResult = loadCodexSession(id)
      if (codexResult.length > 0) return codexResult
      return loadClaudeSession(id)
    } catch (err) {
      log.warn('session:load error:', String(err))
      return []
    }
  })

  // Session deletion: try both
  ipcMain.handle('session:delete', (_e, id) => {
    try {
      const codexDeleted = deleteCodexSession(id)
      const claudeDeleted = deleteClaudeSession(id)
      return codexDeleted || claudeDeleted
    } catch (err) {
      log.warn('session:delete error:', String(err))
      return false
    }
  })

  // Session fork: use Codex fork
  ipcMain.handle('session:fork', (_e, { sessionId, upToMessageIndex }) => {
    try {
      const codexResult = forkCodexSession(sessionId, upToMessageIndex)
      if (codexResult) return codexResult
      return forkClaudeSession(sessionId, upToMessageIndex)
    } catch (err) {
      log.warn('session:fork error:', String(err))
      return null
    }
  })
  ipcMain.handle('session:rename', (_e, { sessionId, title }) => {
    try {
      return renameSession(sessionId, title)
    } catch (err) {
      log.warn('session:rename error:', String(err))
      return false
    }
  })
  ipcMain.handle('session:generateTitle', async (_e: Electron.IpcMainInvokeEvent, { description }: { description: string }) => {
    const cliPath = getCliPath()
    return generateSessionTitle(description, cliPath)
  })

  ipcMain.handle('session:rewind', async (_e: Electron.IpcMainInvokeEvent, { sessionId, beforeTimestamp }: { sessionId: string; beforeTimestamp: string }) => {
    try {
      const cliPath = getCliPath()
      return await rewindSession(sessionId, beforeTimestamp, cliPath)
    } catch (err) {
      log.warn('session:rewind error:', String(err))
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('session:search', async (_e: Electron.IpcMainInvokeEvent, { query, limit }: { query: string; limit?: number }) => {
    try {
      const capped = Math.min(Math.max(Number(limit) || 20, 1), 100)
      const [codexResults, claudeResults] = await Promise.all([
        searchCodexSessions(query, capped),
        searchClaudeSessions(query, capped),
      ])
      // Both engines can surface the same id after a migration; keep one row
      // per session and let the newest hit represent it.
      const bySession = new Map<string, (typeof codexResults)[number] | (typeof claudeResults)[number]>()
      for (const hit of [...codexResults, ...claudeResults]) {
        const existing = bySession.get(hit.sessionId)
        if (!existing || hit.timestamp > existing.timestamp) bySession.set(hit.sessionId, hit)
      }
      return [...bySession.values()]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, capped)
    } catch (err) {
      log.warn('session:search error:', String(err))
      return []
    }
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
    try {
      return detectTurnInterruption(sessionId)
    } catch (err) {
      log.warn('session:detectInterruption error:', String(err))
      return 'none'
    }
  })

  ipcMain.handle('session:getStats', async () => {
    try {
      return getSessionStats()
    } catch (err) {
      log.warn('session:getStats error:', String(err))
      return null
    }
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
    try {
      // Same redaction as prefs:getAll — a single-key read must not become a
      // side door for the credential fields.
      if (key === 'apiKeyEncrypted' || key === 'apiKey') return ''
      if (key === 'modelProviders') {
        const providers = getPref('modelProviders')
        return Array.isArray(providers)
          ? redactProviderSecrets(providers as ModelProviderConfig[])
          : []
      }
      return getPref(key)
    } catch (err) { log.warn('prefs:get error:', String(err)); return null }
  })
  ipcMain.handle('prefs:set', (_e, key, value) => {
    try { setPref(key, value) } catch (err) { log.warn('prefs:set error:', String(err)) }
  })
  ipcMain.handle('prefs:getAll', () => {
    try {
      // Never hand the encrypted API key (or any other secret) to the renderer.
      // The renderer only needs to know whether a key exists — see config:getEnv.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { apiKeyEncrypted, apiKey, modelProviders, ...safe } = getAllPrefs()
      return {
        ...safe,
        modelProviders: Array.isArray(modelProviders)
          ? redactProviderSecrets(modelProviders as ModelProviderConfig[])
          : [],
      }
    } catch (err) { log.warn('prefs:getAll error:', String(err)); return {} }
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

  /**
   * Full config, including transport details, for the Settings → MCP tab.
   *
   * `env` and `headers` are where MCP servers keep their credentials
   * (`GITHUB_TOKEN`, `Authorization: Bearer …`), so the renderer only learns
   * which keys are set — the values never cross the bridge. `mcp:list` already
   * omits them; this channel must not become the way around it.
   */
  safeHandle('mcp:readConfig', () => ({
    ...getMcpConfigInfo(),
    servers: readMcpServers().map(srv => ({
      ...srv,
      env: srv.env ? redactKeys(srv.env) : undefined,
      headers: srv.headers ? redactKeys(srv.headers) : undefined,
    })),
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
    try {
      return listMemoryFiles(scope || 'all')
    } catch (err) {
      log.warn('memory:list error:', String(err))
      return []
    }
  })
  safeHandle('memory:read', (_e, { filePath }: { filePath: string }) => {
    try {
      return readMemoryFile(filePath)
    } catch (err) {
      log.warn('memory:read error:', String(err))
      return { error: String(err) }
    }
  })
  safeHandle('memory:write', (_e, { filePath, content }: { filePath: string; content: string }) => {
    try {
      writeMemoryFile(filePath, content)
      return { success: true }
    } catch (err) {
      log.warn('memory:write error:', String(err))
      return { success: false, error: String(err) }
    }
  })
  safeHandle('memory:create', (_e, { name, description, type, body, scope, projectHash }: {
    name: string; description: string; type: string; body: string; scope: 'global' | 'project'; projectHash?: string
  }) => {
    try {
      const filePath = createMemoryFile(name, description, type, body, scope, projectHash)
      return { success: true, filePath }
    } catch (err) {
      log.warn('memory:create error:', String(err))
      return { success: false, error: String(err) }
    }
  })
  safeHandle('memory:delete', (_e, { filePath }: { filePath: string }) => {
    try {
      deleteMemoryFile(filePath)
      return { success: true }
    } catch (err) {
      log.warn('memory:delete error:', String(err))
      return { success: false, error: String(err) }
    }
  })

  // ── Worktree ─────────────────────────────────────────────────────────────
  // `cwd` becomes the working directory of `git worktree add/remove`, so it has
  // to be inside the roots the user has actually opened. Every handler also
  // reports failures as data: worktree-manager throws on "not a git repo" and
  // on a bad branch name, and a raw IPC rejection shows the renderer an
  // "Error invoking remote method" string instead of something to display.
  const worktreeCwd = (cwd: string): string =>
    safePath(cwd, getAllowedFsRoots(getPref('workingDir') as string | undefined))
  safeHandle('worktree:isGitRepo', (_e, { cwd }: { cwd: string }) => {
    try {
      return { isGit: checkIsGitRepo(worktreeCwd(cwd)) }
    } catch (err) {
      log.warn('worktree:isGitRepo rejected:', String(err))
      return { isGit: false }
    }
  })
  safeHandle('worktree:list', (_e, { cwd }: { cwd: string }) => {
    try {
      return listWorktrees(worktreeCwd(cwd))
    } catch (err) {
      log.warn('worktree:list error:', String(err))
      return []
    }
  })
  safeHandle('worktree:create', async (_e, { cwd, name }: { cwd: string; name: string }) => {
    try {
      return createWorktree(worktreeCwd(cwd), name)
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })
  safeHandle('worktree:remove', (_e, { cwd, worktreePath, force }: { cwd: string; worktreePath: string; force: boolean }) => {
    try {
      removeWorktree(worktreeCwd(cwd), worktreePath, force)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
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
    // The path is read, persisted to ~/.claude/plugins.json and later loaded by
    // the plugin scanner, so it must stay inside the roots the user has opened
    // rather than anywhere on disk (including UNC paths).
    try {
      const safe = safePath(pluginPath, getAllowedFsRoots(getPref('workingDir') as string | undefined))
      return registerLocalPlugin(safe)
    } catch (err) {
      log.warn('plugin:registerLocal rejected:', String(err))
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('feedback:rate', (_e: Electron.IpcMainInvokeEvent, { messageId, rating }: { messageId: string; rating: 'up' | 'down' | null }) => {
    const key = `feedback.${messageId}`
    ;(setPref as any)(key, rating)
  })
}

// ----------------------------------------
// Nav Plugin handlers (Hot-Pluggable Left-Rail & Main View Plugins)
// ----------------------------------------
/**
 * Attach the custom-scheme URL to every plugin before it reaches the renderer,
 * so the iframe src is built in one place and can never drift from the protocol
 * handler's host scheme.
 */
function withPluginUrls<T extends { manifest: { id: string }; entryPath: string }>(plugins: T[]): (T & { url: string })[] {
  return plugins.map(p => ({ ...p, url: pluginUrl(p.manifest.id, p.entryPath) }))
}

function registerNavPluginHandlers(win: BrowserWindow, send: (ch: string, ...a: unknown[]) => void): void {
  const getWorkingDir = () => ((getPref as any)('workingDir') as string) || ''
  initNavPluginManager(
    getWorkingDir,
    (plugins) => {
      send('plugin:nav:updated', withPluginUrls(plugins))
    }
  )
  // Tasks panel moved into the Work Calendar plugin — carry old data over
  migrateLegacyTasks()
  startWorkCalendarReminders(win)

  safeHandle('plugin:nav:list', () => withPluginUrls(listNavPlugins()))
  safeHandle('plugin:nav:reload', () => withPluginUrls(reloadNavPlugins(getWorkingDir())))
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
    // `fs` permission is a manifest self-declaration; containment is enforced
    // separately so a plugin cannot enumerate the whole disk through it.
    try {
      requirePermission(pluginId, 'fs')
      const folderPath = safePath(args.folderPath, getAllowedFsRoots(getPref('workingDir') as string | undefined))
      return scanFolderChanges({ ...args, folderPath })
    } catch (err) {
      log.warn('plugin:fs:scanFolder rejected:', String(err))
      return { success: false, error: String(err) }
    }
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
      // Link previews come from chat transcripts, i.e. from content an agent
      // produced. Without this a crafted link could make the main process
      // probe loopback services or the cloud metadata endpoint from inside
      // the user's network and report the result back as a page title.
      if (isPrivateHost(parsed.hostname)) return null
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

/** Loopback, link-local and RFC-1918 hosts must never be fetched for previews. */
function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0') return true
  // IPv6 loopback / unspecified / unique-local / link-local
  if (host === '::1' || host === '::' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) return true
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!v4) return false
  const [a, b] = [Number(v4[1]), Number(v4[2])]
  if (a === 10 || a === 127 || a === 0) return true
  if (a === 169 && b === 254) return true // link-local incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  return false
}

/** Replace every value in a key→secret map with a marker, keeping the keys. */
function redactKeys(map: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.keys(map).map(k => [k, '***']))
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
  safeHandle('speculation:accept', (_e, { id }: { id: string }) => {
    const bridge = speculationManager.get(id)
    if (!bridge) return { merged: [] }
    // The merge target is the cwd the speculation was started for, held by the
    // main process — never a path the renderer supplies at accept time.
    const merged = bridge.mergeToReal()
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
