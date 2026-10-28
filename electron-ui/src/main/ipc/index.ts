import { ipcMain, BrowserWindow, shell, app, dialog } from 'electron'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { ptyManager } from '../pty/pty-manager'
import { fallbackShellManager } from '../pty/fallback-shell'
import {
  codexBridgeManager,
  renameCodexThread,
  fetchCodexModels,
  fetchCodexAccountUsage,
  fetchCodexRateLimits,
  fetchCodexSkills,
} from '../codex/codex-bridge'
import { buildCodexTurnArgs } from '../codex/codex-turn-args'
import { streamBridgeManager } from '../pty/stream-bridge'
import { speculationManager, isSafeToSpeculate } from '../pty/speculation-bridge'
import { readSettings, writeSettings, listSessions as listClaudeSessions, loadSession as loadClaudeSession, deleteSession as deleteClaudeSession, forkSession as forkClaudeSession, renameSession, rewindSession, searchSessions as searchClaudeSessions, detectTurnInterruption, getDreamConsolidationMtime } from '../sessions/session-reader'
import type { SessionListItem as ClaudeSessionListItem } from '../sessions/session-reader'
import { listSessions as listCodexSessions, loadSession as loadCodexSession, deleteSession as deleteCodexSession, forkSession as forkCodexSession, searchSessions as searchCodexSessions, isCodexSession } from '../codex/codex-session-reader'
import {
  historyAskStatus,
  historyIndexBuilding,
  collectHistoryDigest,
  buildAskPrompt,
  sanitizeAskHistory,
} from '../sessions/ask-history'
import { addMcpServer, getMcpConfigInfo, readMcpServers, removeMcpServer, setMcpServerEnabledRouted } from '../config/mcp-config'
import { getSessionStats } from '../sessions/session-stats'
import {
  readPluginSessionOrigins,
  recordPluginSessionOrigin,
  resolveSessionOrigins,
  type SessionOrigin,
} from '../sessions/session-origins'
import { readAutomationJobs } from '../automation/job-store'
import { getApiKey, setApiKey, getPref, getRawPref, setPref, getAllPrefs, resetAllPrefs } from '../config/config-manager'
import { redactProviderSecrets } from '../providers'
import type { ModelProviderConfig } from '../providers'
import { readCLISettings, writeCLISettings } from '../config/cli-settings-manager'
import { listMemoryFiles, readMemoryFile, writeMemoryFile, createMemoryFile, deleteMemoryFile, writeConsolidatedMemoryFile, deleteConsolidatedMemoryFile } from '../sessions/memory-manager'
import { assembleMemoryContext, readPersonalMemories } from '../sessions/memory-context'
import { createDreamService } from '../memory/dream-service'
import { createDreamTranscriptReader } from '../memory/dream-transcript'
import { setDreamService, getDreamService, dreamNoteTurnStart, dreamNoteTurnEnd, dreamNoteTurnCancelled } from '../memory/dream-runtime'
import { registerDreamHandlers } from './memory-dream-handlers'
import { checkIsGitRepo, listWorktrees, createWorktree, removeWorktree } from '../sessions/worktree-manager'
import { listPlugins, setPluginEnabled, uninstallPlugin, registerLocalPlugin } from '../plugins/plugin-manager'
import { initNavPluginManager, listNavPlugins, reloadNavPlugins, openPluginFolder } from '../plugins/nav-plugin-manager'
import { pluginUrl } from '../plugins/plugin-url'
import { migrateLegacyTasks, startWorkCalendarReminders } from '../plugins/work-calendar-reminders'
import { readPluginData, writePluginData, fetchGithubCommits, scanFolderChanges, startPluginAi, abortPluginAi, resolvePluginTurnTarget, type GithubCommitsArgs, type ScanFolderArgs } from '../plugins/plugin-services'
import { startPluginEdit, sendPluginEdit, abortPluginEdit, endPluginEdit } from '../plugins/plugin-edit-session'
import { askPluginChat } from '../plugins/plugin-chat'
import {
  createPluginAutomation,
  deletePluginAutomation,
  listPluginAutomations,
} from '../plugins/plugin-automation'
import { shouldAnnouncePluginConversation } from '../plugins/plugin-chat-continuation'
import { getCliPath } from '../utils/cli-path'
import { resolveAuxiliaryEngine, noteAuxiliaryEngineUnavailable, deriveSessionTitle } from '../llm/auxiliary-engine'
import { validateApiKey, validateModelName, validateFlags, safePath, getAllowedFsRoots, isValidSessionId } from '../utils/validate'
import { registerSkillsHandlers } from './skills-handlers'
import { registerProviderHandlers } from './provider-handlers'
import { registerFsHandlers } from './fs-handlers'
import { registerWindowHandlers } from './window-handlers'
import { registerDiagnosticsHandlers } from './diagnostics-handlers'
import { registerBackupHandlers } from './backup-handlers'
import { registerAutomationHandlers } from './automation-handlers'
import { pickOpenableSessionId } from './openable-session'
import { startAutomationScheduler } from '../automation/scheduler'
import { runAutomation } from '../automation/runner'
import { createLogger } from '../utils/logger'
import { notifyClawdState, isClawdRunning, launchClawd } from '../clawd-bridge'
import { getClawdInitError, getClawdLanguage } from '../clawd-integration'
import { raiseAttention, resolveAttention, clearAttentionForBridge, bindAttentionSession, refreshAttention } from '../clawd-attention'

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

// ── Attention bookkeeping ───────────────────────────
//
// Bridge events carry the bridge's own id, but opening a conversation needs an
// openable session id: the Codex thread id, or the Claude JSONL session id.
// Both can arrive after the first approval event, so the mapping is filled in
// lazily and the attention queue is re-keyed when it changes.

const bridgeSessions = new Map<string, string>()

/**
 * Per-bridge turn state for the attention path. A deliberately aborted bridge
 * exits non-zero, and a failed turn is reported twice (result + exit); neither
 * may produce a second "task failed" bubble.
 */
const bridgeTurns = new Map<string, { sawResult: boolean; aborted: boolean }>()

function trackBridge(bridgeId: string): void {
  bridgeTurns.set(bridgeId, { sawResult: false, aborted: false })
}

function noteBridgeSession(bridgeId: string, sessionId: unknown): void {
  if (typeof sessionId !== 'string' || !sessionId) return
  bridgeSessions.set(bridgeId, sessionId)
  bindAttentionSession(bridgeId, sessionId)
}

function sessionForBridge(bridgeId: string): string | null {
  return bridgeSessions.get(bridgeId) || null
}

function markBridgeResult(bridgeId: string): void {
  const state = bridgeTurns.get(bridgeId)
  if (state) state.sawResult = true
}

function markBridgeAborted(bridgeId: string): void {
  const state = bridgeTurns.get(bridgeId)
  if (state) state.aborted = true
}

/** True when an exit code is the first and only failure signal for a bridge. */
function shouldRaiseExitFailure(bridgeId: string): boolean {
  const state = bridgeTurns.get(bridgeId)
  return !!state && !state.aborted && !state.sawResult
}

function forgetBridge(bridgeId: string): void {
  bridgeSessions.delete(bridgeId)
  bridgeTurns.delete(bridgeId)
}

/** Keep a CLI error message short enough to read in a pet bubble. */
function clipDetail(value: unknown, max = 90): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim().replace(/\s+/g, ' ')
  if (!text) return null
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/**
 * Plugin jobs the user stopped. Their terminal `error` event is an
 * acknowledgement, not a failure, so the pet must not call them over it.
 * Keyed by `pluginId:requestId` for one-shot AI jobs and by `pluginId` for the
 * persistent edit session.
 */
const stoppedPluginJobs = new Set<string>()

function takeStoppedPluginJob(key: string): boolean {
  return stoppedPluginJobs.delete(key)
}

/** Plugin label in the pet's language; falls back to the id when unknown. */
function pluginLabel(pluginId: string): string {
  try {
    const plugin = listNavPlugins().find(p => p.manifest.id === pluginId)
    if (!plugin) return pluginId
    return getClawdLanguage() === 'zh'
      ? (plugin.manifest.name || pluginId)
      : (plugin.manifest.nameEn || plugin.manifest.name || pluginId)
  } catch {
    return pluginId
  }
}

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

// One "ask about your history" turn at a time, process-wide. The digest is a
// few thousand characters and the turn is read-only, but two concurrent asks
// would fight over each reader's search epoch (the newer call cancels the
// older one) and produce an empty digest for whoever lost.
let askHistoryInFlight = false
// Abort plumbing for that single ask. `generation` keeps a cancelled handler's
// `finally` from clearing the state of the ask that replaced it: cancelling
// hands the slot back immediately, so a new question may already be running
// by the time the aborted one unwinds.
let askHistoryAbort: AbortController | null = null
let askHistoryGeneration = 0

export function registerAllHandlers(
  win: BrowserWindow,
  options: { onAutomationsChanged?: () => void } = {},
): void {
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
    // The scheduler has a single "something changed" signal, and the menus need
    // it too: they exist while the window is hidden in the tray, where the
    // renderer (and this broadcast) is not what the user is looking at. A
    // listener that throws must not break the renderer notification above.
    if (channel === 'automation:changed') {
      try { options.onAutomationsChanged?.() } catch { /* menu refresh is best-effort */ }
    }
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

    // Background memory consolidation ("dream"). Created even while the
    // preference is off: the console must be able to show its state and turn
    // it on without restarting the app — `isEnabled` is read on every tick.
    const dream = createDreamService({
      storePath: path.join(app.getPath('userData'), 'memory-dream.json'),
      claudeDir: path.join(os.homedir(), '.claude'),
      writeMemoryFile: writeConsolidatedMemoryFile,
      deleteMemoryFile: deleteConsolidatedMemoryFile,
      isEnabled: () => getPref('dreamConsolidationEnabled') !== false,
      runTurn: async (prompt, options) => {
        // The advisor model is the user's explicit choice for background work;
        // otherwise inherit the chat model. `runInternalTurn` drops a Claude id
        // on the Codex path, so cross-engine ids cannot break the turn.
        const advisor = getRawPref('advisorModel')
        const model = typeof advisor === 'string' && advisor.trim()
          ? advisor.trim()
          : (getPref('model') as string | undefined)
        // A session may have been opened in a directory that no longer exists
        // (deleted worktree); let the engine run in its own default instead of
        // failing the pass on spawn.
        const cwd = options.cwd && fs.existsSync(options.cwd) ? options.cwd : undefined
        const result = await runInternalTurn({
          prompt,
          timeoutMs: options.timeoutMs,
          internalTag: 'dream-consolidate',
          answerOnly: true,
          ...(cwd ? { cwd } : {}),
          ...(model ? { model } : {}),
        })
        return { success: result.success, text: result.text, error: result.error }
      },
      readTranscript: createDreamTranscriptReader(),
      getPersonalMemories: () => {
        const items = getRawPref('memories')
        if (!Array.isArray(items)) return []
        return items
          .map(item => (
            item && typeof item === 'object' && typeof (item as { content?: unknown }).content === 'string'
              ? (item as { content: string }).content
              : ''
          ))
          .filter(text => text.trim().length > 0)
      },
      emitPass: (record) => send('memory:dream:pass', record),
    })
    setDreamService(dream)
    registerDreamHandlers(getDreamService)
    dream.start()

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
      // This channel is reachable from the renderer. Only the plugin handler
      // may name a conversation to resume, and only after the origin ledger
      // proved the plugin owns it; a renderer caller gets a new private turn.
      delete safeArgs.resumeSessionId
      delete safeArgs.sessionId
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
    // A stopped turn is not a failed one, and its pending approvals are moot.
    markBridgeAborted(sessionId)
    clearAttentionForBridge(sessionId)
    // Release the dream pass's "turn in flight" gate even if the bridge never
    // reports an exit; a stopped turn is not consolidated.
    if (typeof sessionId === 'string') dreamNoteTurnCancelled(sessionId)
    // Try CodexBridge first, then legacy
    const codexBridge = codexBridgeManager.get(sessionId)
    if (codexBridge) {
      codexBridgeManager.abort(sessionId)
      return
    }
    streamBridgeManager.abort(sessionId)
  })

  ipcMain.handle('cli:respondPermission', (_e, { sessionId, requestId, allowed }) => {
    // One answered request clears one queued approval (others may remain).
    resolveAttention({ kind: 'approval', bridgeId: sessionId, requestId })
    const codexBridge = codexBridgeManager.get(sessionId)
    if (codexBridge) {
      codexBridge.respondApproval(requestId, allowed)
      return
    }
    const bridge = streamBridgeManager.get(sessionId)
    if (bridge) bridge.respondPermission(requestId, allowed)
  })

  ipcMain.handle('cli:endSession', (_e, sessionId) => {
    markBridgeAborted(sessionId)
    clearAttentionForBridge(sessionId)
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

  // ── Engine routing ──────────────────────────────────
  // The model picker may only offer what the engine that will run the next
  // turn actually accepts: Codex's own catalog on a Codex profile, the legacy
  // provider groups otherwise. `resolveAuxiliaryEngine` answers from
  // credentials and installed binaries, so it is a cheap read with no spawn.
  // Its `env` is deliberately dropped here — it carries the provider key and
  // has no business crossing the context bridge — and a failed probe reports
  // "none" instead of throwing into the renderer.
  safeHandle('engine:getActive', () => {
    try {
      const engine = resolveAuxiliaryEngine()
      if (engine.kind === 'codex') return { kind: 'codex' as const }
      if (engine.kind === 'claude') return { kind: 'claude' as const, source: engine.source }
      return { kind: 'none' as const, reason: engine.reason }
    } catch (err) {
      log.warn('engine:getActive error:', String(err))
      return { kind: 'none' as const, reason: 'probe_failed' }
    }
  })

  // ── Codex read-only protocol probes ─────────────────
  // These back Settings/model pickers with Codex's real data instead of
  // app-side synthetic numbers. Each uses a live user-facing bridge when one
  // exists, otherwise a short-lived probe; failures are returned, never thrown.
  safeHandle('codex:modelList', async (_e, args?: { sessionId?: string; cwd?: string; force?: boolean }) => {
    try {
      const bridge = typeof args?.sessionId === 'string'
        ? codexBridgeManager.get(args.sessionId)
        : codexBridgeManager.firstLive()
      const models = bridge
        ? await bridge.listModels({ force: args?.force === true })
        : await fetchCodexModels({
            cwd: resolveCodexProbeCwd(args?.cwd),
            env: codexProbeEnv(),
            force: args?.force === true,
          })
      return { success: true, models }
    } catch (err) {
      log.warn('codex:modelList error:', String(err))
      return { success: false, error: String(err) }
    }
  })

  safeHandle('codex:accountUsage', async (_e, args?: { sessionId?: string; force?: boolean }) => {
    try {
      const bridge = typeof args?.sessionId === 'string'
        ? codexBridgeManager.get(args.sessionId)
        : codexBridgeManager.firstLive()
      const usage = bridge
        ? await bridge.readAccountUsage({ force: args?.force === true })
        : await fetchCodexAccountUsage({ env: codexProbeEnv(), force: args?.force === true })
      return { success: true, usage }
    } catch (err) {
      log.warn('codex:accountUsage error:', String(err))
      return { success: false, error: String(err) }
    }
  })

  safeHandle('codex:rateLimits', async (_e, args?: { sessionId?: string; force?: boolean }) => {
    try {
      const bridge = typeof args?.sessionId === 'string'
        ? codexBridgeManager.get(args.sessionId)
        : codexBridgeManager.firstLive()
      const rateLimits = bridge
        ? await bridge.readRateLimits({ force: args?.force === true })
        : await fetchCodexRateLimits({ env: codexProbeEnv(), force: args?.force === true })
      return { success: true, rateLimits }
    } catch (err) {
      log.warn('codex:rateLimits error:', String(err))
      return { success: false, error: String(err) }
    }
  })

  safeHandle('codex:skillsList', async (_e, args?: { sessionId?: string; cwd?: string; force?: boolean }) => {
    try {
      const cwd = resolveCodexProbeCwd(args?.cwd)
      const bridge = typeof args?.sessionId === 'string'
        ? codexBridgeManager.get(args.sessionId)
        : codexBridgeManager.firstLive()
      const skills = bridge
        ? await bridge.listSkills({ cwd, force: args?.force === true })
        : await fetchCodexSkills({ cwd, env: codexProbeEnv(), force: args?.force === true })
      return { success: true, skills }
    } catch (err) {
      log.warn('codex:skillsList error:', String(err))
      return { success: false, error: String(err) }
    }
  })

  // Legacy handlers (kept for backward compat during migration)
  ipcMain.handle('cli:respondHookCallback', (_e, { sessionId, requestId, response }: { sessionId: string; requestId: string; response: Record<string, unknown> }) => {
    const bridge = streamBridgeManager.get(sessionId)
    if (bridge) bridge.respondHookCallback(requestId, response)
  })

  ipcMain.handle('cli:respondElicitation', (_e, { sessionId, requestId, result }: { sessionId: string; requestId: string; result: Record<string, unknown> }) => {
    resolveAttention({ kind: 'clarification', bridgeId: sessionId, requestId })
    // Codex routes both `item/tool/requestUserInput` and
    // `mcpServer/elicitation/request` through the same card/answer channel.
    const codexBridge = codexBridgeManager.get(sessionId)
    if (codexBridge) {
      codexBridge.respondElicitation(requestId, result)
      return
    }
    const bridge = streamBridgeManager.get(sessionId)
    if (bridge) bridge.respondElicitation(requestId, result)
  })

  ipcMain.handle('cli:respondPlanApproval', (_e, { sessionId, requestId, approved, feedback }: { sessionId: string; requestId: string; approved: boolean; feedback?: string }) => {
    resolveAttention({ kind: 'approval', bridgeId: sessionId, requestId })
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

/**
 * Environment for a detached Codex probe.
 *
 * Chat turns go through `buildCodexTurnArgs`, which injects the Settings key;
 * probes spawn their own app-server and must do the same, otherwise usage and
 * limits fail with "authentication required" even though the user is signed in.
 */
function codexProbeEnv(): Record<string, string> {
  try {
    const key = getApiKey()
    return key ? { OPENAI_API_KEY: key } : {}
  } catch (err) {
    log.debug('codexProbeEnv: no stored key:', String(err))
    return {}
  }
}

/**
 * Resolve the cwd for a detached probe. The renderer may pass the active tab's
 * cwd; keep the same sandbox check as `fs:*` and fall back to the app's working
 * directory rather than failing the whole probe on a stale path.
 */
function resolveCodexProbeCwd(input: unknown): string {
  const workingDir = getPref('workingDir') as string | undefined
  const candidate = typeof input === 'string' && input.trim()
    ? input
    : (workingDir && workingDir.trim() ? workingDir : process.cwd())
  try {
    return safePath(candidate, getAllowedFsRoots(workingDir))
  } catch (err) {
    log.debug('codex probe rejected cwd:', String(err))
    return process.cwd()
  }
}

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
    // The thread id is what `openSessionCore` can open; learn it as soon as a
    // turn reports it so a later approval bubble is clickable.
    noteBridgeSession(bridgeId, d.codexThreadId ?? d.threadId)
    markBridgeResult(bridgeId)
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
  bridge.on('threadStarted', (d) => {
    noteBridgeSession(bridgeId, d.threadId)
    sink('cli:threadStarted', d)
  })
  bridge.on('threadClosed', (d) => sink('cli:threadClosed', d))
  // Read-only/observability notifications. The renderer ignores channels it
  // does not know, but forwarding them keeps the renderer wave able to adopt
  // them without another main-process change.
  bridge.on('turnDiffUpdated', (d) => sink('cli:turnDiffUpdated', d))
  bridge.on('threadSettingsUpdated', (d) => sink('cli:threadSettingsUpdated', d))
  bridge.on('serverRequestResolved', (d) => sink('cli:serverRequestResolved', d))
  bridge.on('serverRequestTimedOut', (d) => sink('cli:serverRequestTimedOut', d))

  // A background turn must not drive the desktop pet — it has no session id
  // the pet can attribute, and it would flip the state while the user reads.
  // It still has to release its attention bookkeeping when the process ends.
  if (internal) {
    bridge.on('processExit', () => forgetBridge(bridgeId))
    return
  }

  // Background memory consolidation observes finished user turns only —
  // internal bridges returned above, and automation runs never pass through
  // this wiring. The result is where the durable thread id is known; an exit
  // without one releases the "turn in flight" gate without counting a turn.
  bridge.on('result', (d) => {
    dreamNoteTurnEnd(bridgeId, d.codexThreadId ?? d.threadId ?? null, {
      success: d.subtype === 'success',
      engine: 'codex',
    })
  })
  bridge.on('processExit', () => dreamNoteTurnCancelled(bridgeId))

  // Clawd desktop pet notifications
  bridge.on('textDelta', () => notifyClawdState('thinking', bridgeId))
  bridge.on('thinkingDelta', () => notifyClawdState('thinking', bridgeId))
  bridge.on('toolUse', () => notifyClawdState('working', bridgeId))
  // "happy" is a completed-turn signal; a stopped or unknown turn is not one.
  bridge.on('result', (d) => {
    if (d.subtype === 'success') notifyClawdState('happy', bridgeId)
  })
  bridge.on('processExit', () => notifyClawdState('idle', bridgeId))

  // Codex's user-facing questions (requestUserInput and MCP elicitation) use
  // the Claude elicitation card; only user-facing bridges get this listener,
  // so an internal turn auto-declines inside the bridge instead of hanging.
  bridge.on('elicitationRequest', (d) => {
    sink('cli:elicitation', d)
    raiseAttention({
      kind: 'clarification',
      bridgeId,
      sessionId: sessionForBridge(bridgeId),
      requestId: d.requestId != null ? String(d.requestId) : null,
    })
  })

  // Attention: the four events that may need the user while AIPA is in the
  // background. Approvals are per-request so answering one leaves the rest.
  bridge.on('permissionRequest', (d) => {
    raiseAttention({
      kind: 'approval',
      bridgeId,
      sessionId: sessionForBridge(bridgeId),
      requestId: typeof d.requestId === 'string' ? d.requestId : null,
      detail: clipDetail(d.toolName ?? d.title),
    })
  })

  // The server resolved or expired a request itself; retract its bubble.
  const resolveServerRequestAttention = (d: Record<string, unknown>) => {
    if (d.requestId == null) return
    resolveAttention({ kind: 'approval', bridgeId, requestId: String(d.requestId) })
    resolveAttention({ kind: 'clarification', bridgeId, requestId: String(d.requestId) })
  }
  bridge.on('serverRequestResolved', resolveServerRequestAttention)
  bridge.on('serverRequestTimedOut', resolveServerRequestAttention)
  bridge.on('result', (d) => {
    // A finished turn answers whatever it was waiting on.
    resolveAttention({ kind: 'approval', bridgeId })
    resolveAttention({ kind: 'clarification', bridgeId })
    // Only a genuine failure raises a failure. An interrupted turn is the user
    // stopping, and an unknown outcome is not evidence of failure.
    if (d.subtype === 'error') {
      raiseAttention({
        kind: 'failed',
        bridgeId,
        sessionId: sessionForBridge(bridgeId),
        detail: clipDetail(d.event?.turn?.error?.message ?? d.event?.error?.message),
      })
    }
  })
  bridge.on('turnError', (d) => {
    // Codex is reconnecting; a retryable error is not a failed task.
    if (d.willRetry) return
    raiseAttention({
      kind: 'failed',
      bridgeId,
      sessionId: sessionForBridge(bridgeId),
      detail: clipDetail(d.message),
    })
  })
  bridge.on('processExit', (d) => {
    if (typeof d.code === 'number' && d.code !== 0 && shouldRaiseExitFailure(bridgeId)) {
      raiseAttention({ kind: 'failed', bridgeId, sessionId: sessionForBridge(bridgeId) })
    }
    // A dead bridge can no longer answer its own requests.
    resolveAttention({ kind: 'approval', bridgeId })
    resolveAttention({ kind: 'clarification', bridgeId })
    forgetBridge(bridgeId)
  })
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
  bridge.on('result', (d) => {
    // Claude only reveals its session id on the result envelope; approvals can
    // precede it, so the queue is re-keyed here.
    noteBridgeSession(bridgeId, d.claudeSessionId ?? d.event?.session_id)
    markBridgeResult(bridgeId)
    sink('cli:result', d)
  })
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

  if (internal) {
    bridge.on('processExit', () => forgetBridge(bridgeId))
    return
  }

  bridge.on('textDelta', () => notifyClawdState('thinking', bridgeId))
  bridge.on('thinkingDelta', () => notifyClawdState('thinking', bridgeId))
  bridge.on('toolUse', () => notifyClawdState('working', bridgeId))
  bridge.on('result', () => notifyClawdState('happy', bridgeId))
  bridge.on('apiError', () => notifyClawdState('error', bridgeId))

  // Same dream bookkeeping as the Codex path. Claude reveals its session id on
  // the result envelope, so the earlier `noteBridgeSession` mapping is the
  // fallback for a resumed conversation.
  bridge.on('result', (d) => {
    dreamNoteTurnEnd(bridgeId, d.claudeSessionId ?? sessionForBridge(bridgeId), {
      success: d.subtype === 'success',
      engine: 'claude',
    })
  })
  bridge.on('processExit', () => dreamNoteTurnCancelled(bridgeId))
  bridge.on('notification', () => notifyClawdState('notification', bridgeId))
  bridge.on('processExit', () => notifyClawdState('idle', bridgeId))

  // Attention: the legacy Claude path raises the same four shapes as Codex.
  bridge.on('permissionRequest', (d) => {
    raiseAttention({
      kind: 'approval',
      bridgeId,
      sessionId: sessionForBridge(bridgeId),
      requestId: typeof d.requestId === 'string' ? d.requestId : null,
      detail: clipDetail(d.toolName),
    })
  })
  bridge.on('planApprovalRequest', (d) => {
    raiseAttention({
      kind: 'approval',
      bridgeId,
      sessionId: sessionForBridge(bridgeId),
      requestId: typeof d.requestId === 'string' ? d.requestId : null,
    })
  })
  bridge.on('mcpElicitation', (d) => {
    raiseAttention({
      kind: 'clarification',
      bridgeId,
      sessionId: sessionForBridge(bridgeId),
      requestId: typeof d.requestId === 'string' ? d.requestId : null,
    })
  })
  bridge.on('result', (d) => {
    resolveAttention({ kind: 'approval', bridgeId })
    resolveAttention({ kind: 'clarification', bridgeId })
    if (d.subtype && d.subtype !== 'success') {
      raiseAttention({
        kind: 'failed',
        bridgeId,
        sessionId: sessionForBridge(bridgeId),
        detail: clipDetail(d.subtype),
      })
    }
  })
  bridge.on('apiError', (d) => {
    raiseAttention({
      kind: 'failed',
      bridgeId,
      sessionId: sessionForBridge(bridgeId),
      detail: clipDetail(d.message),
    })
  })
  bridge.on('processExit', (d) => {
    if (typeof d.code === 'number' && d.code !== 0 && shouldRaiseExitFailure(bridgeId)) {
      raiseAttention({ kind: 'failed', bridgeId, sessionId: sessionForBridge(bridgeId) })
    }
    // A dead bridge can no longer answer its own requests.
    resolveAttention({ kind: 'approval', bridgeId })
    resolveAttention({ kind: 'clarification', bridgeId })
    forgetBridge(bridgeId)
  })
}

async function registerCodexSendMessage(
  args: Record<string, unknown>,
  sink: BridgeSink,
  internal = false,
): Promise<{ success: boolean; sessionId?: string; error?: string }> {
  const existingBridgeId = args.activeBridgeId as string | undefined
  const prompt = args.prompt as string
  const input = args.input as import('../codex/codex-bridge').CodexUserInput[] | undefined
  // The renderer's model/effort describe the *chat* engine. A Claude id must
  // never reach Codex's thread/start or turn/start; `effort` is a Codex
  // concept and is validated against the model catalogue by the bridge.
  const requestedModel = pickModelForEngine(typeof args.model === 'string' ? args.model : undefined, 'codex')
  const requestedEffort = typeof args.effort === 'string' && args.effort ? args.effort : undefined
  const turnOptions = { ...(requestedModel ? { model: requestedModel } : {}), ...(requestedEffort ? { effort: requestedEffort } : {}) }
  // `/compact` is a renderer-side command; Codex exposes it as thread/compact/start.
  // Sending the literal string would just make the model talk about a slash command.
  const isCompact = /^\/compact\b/.test(prompt.trim())

  // Reuse existing bridge for follow-up messages (never for a background turn,
  // which must not join a user conversation's thread).
  if (existingBridgeId && !internal) {
    const existingBridge = codexBridgeManager.get(existingBridgeId)
    if (existingBridge) {
      // `/compact` is housekeeping, not a conversational turn; it must not
      // increment the dream pass's "turns waiting" counter.
      if (!internal && !isCompact) {
        dreamNoteTurnStart(existingBridgeId, typeof args.cwd === 'string' ? args.cwd : undefined)
      }
      try {
        if (isCompact) {
          await existingBridge.compactThread()
          // A notification follows, but only for current Codex builds; emit
          // once more so the renderer can never stay stuck in "compacting".
          sink('cli:compacted', { sessionId: existingBridgeId })
        } else {
          await existingBridge.sendFollowUp(prompt, input, turnOptions)
        }
        return { success: true, sessionId: existingBridgeId }
      } catch (err) {
        dreamNoteTurnCancelled(existingBridgeId)
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
      if (!internal && !isCompact) {
        dreamNoteTurnStart(live.bridgeId, typeof args.cwd === 'string' ? args.cwd : undefined)
      }
      try {
        if (isCompact) {
          await live.bridge.compactThread()
          sink('cli:compacted', { sessionId: live.bridgeId })
        } else {
          await live.bridge.sendFollowUp(prompt, input, turnOptions)
        }
        return { success: true, sessionId: live.bridgeId }
      } catch (err) {
        dreamNoteTurnCancelled(live.bridgeId)
        return { success: false, error: String(err) }
      }
    }
  }

  // Create new CodexBridge. An internal caller may supply a tag so its run is
  // attributable in the bridge id (the plugin chat turn uses its plugin id).
  const tag = internal && typeof args.internalTag === 'string' ? `${args.internalTag}-` : ''
  const bridgeId = `${internal ? INTERNAL_BRIDGE_PREFIX : ''}${tag}codex-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const bridge = codexBridgeManager.create(bridgeId)
  trackBridge(bridgeId)
  // A resumed thread is openable from the very first turn, before
  // `threadStarted` has had a chance to report it.
  noteBridgeSession(bridgeId, requestedThreadId)
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
      model: requestedModel,
      ...(requestedEffort ? { effort: requestedEffort } : {}),
      env: (args.env as Record<string, string>) || {},
      permissionMode: args.permissionMode as string | undefined,
    },
    {
      // A background turn has no UI to answer an approval prompt (its events
      // never reach the renderer), so it can never ask. For an answer-only
      // turn — whose prompt is built from the user's own transcripts — "cannot
      // ask" must not mean "may run things": `always` is the bridge-level
      // spelling for the wire value `untrusted`, which raises an approval
      // request for every command, and `runInternalTurn`'s sink denies each
      // one, so nothing executes. Every other internal turn keeps `never`,
      // which denies silently without the round trip.
      ...(internal
        ? {
            approvalPolicy: args.answerOnly === true ? 'always' : 'never',
            // Internal turns are hidden and therefore ephemeral unless the
            // caller explicitly asks for a persisted thread (a visible plugin
            // chat). `false` is the default when the caller says nothing.
            ephemeral: args.ephemeral !== false,
          }
        : {}),
      ...(args.ephemeral === true ? { ephemeral: true } : {}),
    },
  )

  if (!internal && !isCompact) {
    dreamNoteTurnStart(bridgeId, (args.cwd as string) || undefined)
  }
  try {
    if (isCompact) {
      await bridge.compactSession(bridgeArgs)
      sink('cli:compacted', { sessionId: bridgeId })
    } else {
      await bridge.sendMessage(bridgeArgs)
    }
    return { success: true, sessionId: bridgeId }
  } catch (err) {
    dreamNoteTurnCancelled(bridgeId)
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
    dreamNoteTurnStart(existingBridgeId, typeof args.cwd === 'string' ? args.cwd : undefined)
    try {
      bridge.sendFollowUp(args.prompt as string, args.sessionId as string | undefined)
      return { success: true, sessionId: existingBridgeId }
    } catch (err) {
      dreamNoteTurnCancelled(existingBridgeId)
      return { success: false, error: String(err) }
    }
  }

  const tag = internal && typeof args.internalTag === 'string' ? `${args.internalTag}-` : ''
  const bridgeId = `${internal ? INTERNAL_BRIDGE_PREFIX : ''}${tag}bridge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const bridge = streamBridgeManager.create(bridgeId)
  trackBridge(bridgeId)
  // A resumed conversation already knows its JSONL session id.
  noteBridgeSession(bridgeId, internal ? undefined : args.sessionId)
  wireStreamBridge(bridge, bridgeId, sink, internal)

  const env = (args.env as Record<string, string>) || {}
  const hasExplicitApiKey = 'ANTHROPIC_API_KEY' in env
  const hasAuthToken = !!env.ANTHROPIC_AUTH_TOKEN
  if (!hasExplicitApiKey && !hasAuthToken) {
    env.ANTHROPIC_API_KEY = getApiKey()
  }
  env.CLAUDECODE = ''

  if (!internal) {
    dreamNoteTurnStart(bridgeId, (args.cwd as string) || undefined)
  }
  try {
    await bridge.sendMessage({
      ...(args as any),
      skipPermissions,
      permissionMode: permissionMode as import('../pty/stream-bridge').PermissionMode | undefined,
      // A background turn normally never resumes a user conversation. The one
      // exception is a plugin continuation, which `runInternalTurn` sets only
      // after the origin ledger proved the plugin owns the conversation.
      resumeSessionId: typeof args.resumeSessionId === 'string' && args.resumeSessionId
        ? args.resumeSessionId
        : (internal ? undefined : ((args.sessionId as string) || undefined)),
      sessionId: bridgeId,
      env,
    })
    return { success: true, sessionId: bridgeId }
  } catch (err) {
    dreamNoteTurnCancelled(bridgeId)
    sink('cli:error', { sessionId: bridgeId, error: String(err) })
    return { success: false, error: String(err) }
  }
}

// ── Internal (background) turns ──────────────────────────

/**
 * Keep a background caller's model id from crossing engines.
 *
 * Suggestions and memory extraction take the model from renderer prefs, which
 * describes the *chat* engine. A Claude id sent to Codex's `thread/start` is
 * rejected as an unknown model, so it is dropped there and Codex uses its own
 * default. The Claude bridge is left alone: provider scenarios deliberately
 * pass non-Claude model ids through `ANTHROPIC_MODEL`/`--model`.
 */
function pickModelForEngine(
  model: string | undefined,
  engine: 'codex' | 'claude',
): string | undefined {
  if (!model) return undefined
  const looksClaude = /^claude[-:]/i.test(model)
  if (engine === 'codex' && looksClaude) return undefined
  return model
}

/**
 * Run one CLI turn that belongs to no conversation: the bridge gets an
 * `internal-` id, its events go to a private sink, and the final text is the
 * invoke's result. Both engines are reachable through the same two helpers,
 * so the isolation is identical for Codex and the legacy Claude bridge.
 */
async function runInternalTurn(
  args: Record<string, unknown>,
  signal?: AbortSignal,
  onText?: (text: string) => void,
): Promise<{ success: boolean; text?: string; error?: string }> {
  // Nobody is waiting for a turn that was cancelled before it even started.
  if (signal?.aborted) return { success: false, error: 'aborted' }

  const prompt = String(args.prompt ?? '')
  // Ten minutes is the ceiling a plugin may ask for; background callers that
  // want less still get their own bound.
  const timeoutMs = Math.min(Math.max(Number(args.timeoutMs) || 60_000, 5_000), 600_000)
  // Optional label embedded in the internal bridge id, so a failure in app
  // logs can be traced back to the plugin that asked.
  const internalTag = typeof args.internalTag === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(args.internalTag)
    ? args.internalTag
    : ''
  // A visible plugin turn persists the rollout / JSONL so the archive can open
  // it later. Everything else about the turn — the internal bridge tag, the
  // private sink, `plan` mode, deny-everything approvals — stays the same.
  const visible = args.visible === true
  // A plugin continuation names an existing conversation. It is honoured only
  // when the plugin handler has already checked the origin ledger; all other
  // internal callers leave it unset, and `cli:runInternal` strips it.
  const resumeSessionId = typeof args.resumeSessionId === 'string' && args.resumeSessionId.trim()
    ? args.resumeSessionId.trim()
    : ''

  let streamed = ''
  let resultText = ''
  let lastError = ''
  let failure = ''
  // The legacy Claude result envelope's real JSONL id. Never the bridge id.
  let envelopeSessionId = ''
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
        if (typeof data.text === 'string') {
          streamed += data.text
          // The listener is the caller's progress tap (the ask overlay). It
          // must never be able to break the private turn, so a throw here is
          // swallowed and the turn continues with the accumulated text.
          try {
            onText?.(streamed)
          } catch {
            // intentionally ignored
          }
        }
        break
      case 'cli:result': {
        // Terminal for both engines: Codex emits it from turn/completed, and
        // the Claude bridge only after the whole turn is done. Claude also
        // puts the complete answer on the result envelope; Codex does not, so
        // the accumulated deltas remain the fallback.
        const event = data.event as Record<string, unknown> | undefined
        if (typeof event?.result === 'string') resultText = event.result
        // The result envelope is where the legacy CLI reports the real JSONL
        // session id. Keep it for a visible turn; the archive can open this id,
        // whereas the internal bridge id is unopenable bookkeeping.
        const envelopeId = typeof data.claudeSessionId === 'string' && data.claudeSessionId
          ? data.claudeSessionId
          : (typeof event?.session_id === 'string' ? event.session_id : '')
        if (envelopeId) envelopeSessionId = envelopeId
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

  const explicitEnv = (args.env as Record<string, string>) || {}
  // Explicit Claude credentials mean the caller meant the Claude engine.
  // Testing the API key for truthiness sent gateway configs (empty key + auth
  // token) to Codex, which then failed auth or rejected the read-only sandbox.
  const hasClaudeCredentials = 'ANTHROPIC_API_KEY' in explicitEnv || 'ANTHROPIC_AUTH_TOKEN' in explicitEnv
  let useCodex: boolean
  let engineEnv: Record<string, string> = explicitEnv
  let engineKind: 'codex' | 'claude'
  if (hasClaudeCredentials) {
    useCodex = Boolean(explicitEnv.OPENAI_API_KEY)
    engineKind = useCodex ? 'codex' : 'claude'
  } else {
    // No engine hint from the caller: pick the engine this profile can
    // actually authenticate with. Defaulting to Codex used to break
    // legacy-only profiles; defaulting to the legacy CLI (the old behaviour
    // for these callers) spent the wrong account on Codex profiles.
    const engine = resolveAuxiliaryEngine()
    if (engine.kind === 'none') {
      noteAuxiliaryEngineUnavailable(engine.reason)
      return { success: false, error: `No authenticated engine: ${engine.reason}` }
    }
    engineKind = engine.kind
    useCodex = engine.kind === 'codex'
    if (engine.kind === 'claude') {
      // Provider credentials/URLs must reach the child, exactly as they do for
      // `provider:sendMessage`. Legacy credentials are also passed explicitly
      // so the bridge cannot fall back to the other engine.
      engineEnv = { ...explicitEnv, ...engine.env }
    }
  }

  const sendArgs: Record<string, unknown> = {
    prompt,
    cwd: (args.cwd as string) || process.cwd(),
    model: pickModelForEngine(typeof args.model === 'string' ? args.model : undefined, engineKind),
    env: engineEnv,
    // Forwarded so the Codex path can pick an approval policy that raises a
    // request for every command; the internal sink denies all of them.
    answerOnly: args.answerOnly === true,
    // Answer-only turns (plugin `chat.ask`, ask-history) must not touch tools.
    // Codex gets an `always` (wire `untrusted`) approval policy from
    // `registerCodexSendMessage`, so every command it tries raises a request its
    // internal sink denies; a read-only sandbox alone still executed shell
    // commands silently. The Claude CLI needs the empty tool list.
    flags: args.answerOnly === true && !useCodex ? ['--tools', ''] : [],
    // Read-only turns: a memory extraction must not be able to edit the repo.
    permissionMode: 'plan',
    // Background work is not a conversation: do not persist a rollout that
    // would show up in the sidebar/archive with quoted private text. A visible
    // plugin turn is the one exception — its whole point is a persisted
    // conversation — but it keeps the read-only mode and private sink above.
    ephemeral: !visible,
    // Codex resumes via `threadId`, the legacy bridge via `--resume`; these two
    // fields are where each one reads the id. An empty pair keeps the turn new.
    ...(resumeSessionId ? { sessionId: resumeSessionId, resumeSessionId } : {}),
    ...(internalTag ? { internalTag } : {}),
  }

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

  // The caller may have cancelled while the handshake was in flight; the
  // bridge exists now, so reap it rather than wait for the model.
  if (signal?.aborted) {
    if (isInternalBridgeId(bridgeId)) {
      codexBridgeManager.abort(bridgeId)
      streamBridgeManager.abort(bridgeId)
    }
    return { success: false, error: 'aborted' }
  }

  let timer: NodeJS.Timeout | undefined
  let abortListener: (() => void) | undefined
  const waits: Array<Promise<'done' | 'timeout' | 'aborted'>> = [
    finished.then(() => 'done' as const),
    new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), timeoutMs)
      timer.unref?.()
    }),
  ]
  if (signal) {
    waits.push(new Promise<'aborted'>((resolve) => {
      // Registered only after `bridgeId` is known and the listener is removed
      // below, so a late abort cannot leak into the next turn.
      if (signal.aborted) {
        resolve('aborted')
        return
      }
      abortListener = () => resolve('aborted')
      signal.addEventListener('abort', abortListener, { once: true })
    }))
  }
  const outcome = await Promise.race(waits)
  if (timer) clearTimeout(timer)
  if (abortListener) signal?.removeEventListener('abort', abortListener)

  // Captured before the bridge is reaped: for Codex only the live bridge knows
  // the persisted thread id. The helper returns null rather than the internal
  // bridge id when neither engine reported one.
  const openableSessionId = visible
    ? pickOpenableSessionId(engineKind, {
        codexThreadId: () => codexBridgeManager.get(bridgeId)?.getThreadId(),
        claudeSessionId: envelopeSessionId,
      })
    : null
  // Private turns keep their old result shape byte-for-byte; a visible turn
  // always reports whether it produced an openable conversation.
  const visibility = visible ? { sessionId: openableSessionId } : {}

  // Single-shot bridge: reap the process instead of letting it idle until the
  // app exits (Codex keeps a whole app-server alive per bridge). The abort path
  // takes the same route as the timeout path.
  if (isInternalBridgeId(bridgeId)) {
    codexBridgeManager.abort(bridgeId)
    streamBridgeManager.abort(bridgeId)
  }

  if (outcome === 'aborted') {
    return { success: false, error: 'aborted', text: streamed || undefined, ...visibility }
  }
  if (outcome === 'timeout') {
    return { success: false, error: `Internal turn timed out after ${timeoutMs}ms`, text: streamed || undefined, ...visibility }
  }
  if (failure) {
    return { success: false, error: failure, text: resultText || streamed || undefined, ...visibility }
  }
  const text = resultText || streamed
  if (!text.trim()) {
    return { success: false, error: lastError || 'Empty response', ...visibility }
  }
  return { success: true, text, ...visibility }
}

/**
 * Engine `runInternalTurn` will pick for a plugin ask, using that function's
 * own rule: explicit Anthropic credentials mean the Claude bridge; otherwise
 * the engine this profile can authenticate with. A continuation is refused
 * when this engine cannot resume the conversation's engine.
 */
function pluginAskTargetEngine(env: Record<string, string> | undefined): 'codex' | 'claude' | null {
  const explicitEnv = env ?? {}
  if ('ANTHROPIC_API_KEY' in explicitEnv || 'ANTHROPIC_AUTH_TOKEN' in explicitEnv) {
    return explicitEnv.OPENAI_API_KEY ? 'codex' : 'claude'
  }
  const engine = resolveAuxiliaryEngine()
  return engine.kind === 'none' ? null : engine.kind
}

/**
 * The evidence behind a continuation refusal: ownership from the plugin-origin
 * ledger, and whether the archive can still open the id and on which engine.
 * A Codex id is recognised by its rollout/index entry; anything else is only
 * believed when a Claude JSONL actually reads back.
 */
function pluginChatContinuationEvidence(sessionId: string): {
  ownerPluginId: string | null
  openable: boolean
  engine: 'codex' | 'claude' | null
} {
  const owner = readPluginSessionOrigins(app.getPath('userData'))
    .find(record => record.sessionId === sessionId)
  const codex = isCodexSession(sessionId)
  const openable = codex || loadClaudeSession(sessionId).length > 0
  return {
    ownerPluginId: owner?.pluginId ?? null,
    openable,
    engine: codex ? 'codex' : (openable ? 'claude' : null),
  }
}

/**
 * One hidden, engine-routed turn for a small UI feature.
 *
 * Returning '' is the feature's "off" state: the renderer already treats an
 * empty result as "nothing to show", and doing so here keeps an unconfigured
 * profile from spawning a process it cannot authenticate.
 */
async function runAuxiliaryPrompt(args: {
  prompt: string
  timeoutMs: number
  tag: string
}): Promise<string> {
  const engine = resolveAuxiliaryEngine()
  if (engine.kind === 'none') {
    noteAuxiliaryEngineUnavailable(engine.reason)
    return ''
  }
  const result = await runInternalTurn({
    prompt: args.prompt,
    timeoutMs: args.timeoutMs,
    internalTag: args.tag,
    // A read-only, answer-only turn: these prompts may summarise private chat
    // context and must not get tool access to the workspace.
    answerOnly: true,
    // Pass the resolved engine's credentials so `runInternalTurn` cannot pick
    // the other engine if the profile state changed between the two checks.
    ...(engine.kind === 'claude' ? { env: engine.env } : {}),
  })
  return result.success ? (result.text || '').trim() : ''
}

/**
 * Predict the user's next message (ghost text in the composer).
 *
 * Previously spawned `cli --print`; now runs on whichever engine the profile
 * is actually on, through the same private bridge as other background work.
 */
async function generatePromptSuggestion(context: string): Promise<string> {
  const systemPrompt = 'You are a prompt predictor. Given the conversation context, predict what the user would naturally type next as their follow-up message. Output ONLY the predicted prompt text (2-12 words). Match the user\'s language and style. No quotes, no explanation.'
  const text = await runAuxiliaryPrompt({
    prompt: `${systemPrompt}\n\nConversation context:\n${context}\n\nPredict the user's next message (2-12 words):`,
    timeoutMs: 12_000,
    tag: 'suggestion',
  })
  // Models occasionally wrap the answer in quotes despite the instruction.
  const suggestion = text.replace(/^["'`]+|["'`]+$/g, '').trim()
  return suggestion.length > 0 && suggestion.length <= 120 ? suggestion : ''
}

/**
 * A 1-3 sentence recap for the "while you were away" dialog.
 *
 * Same engine rule as the suggestion; `cli:runInternal` was already the right
 * shape, so this uses it rather than a second spawn path.
 */
async function generateAwaySummary(context: string): Promise<string> {
  const systemPrompt = 'You are a session recap assistant. The user stepped away and is coming back. Write exactly 1-3 short sentences. Start by stating the high-level task — what they are building or debugging, not implementation details. Next: the concrete next step. Skip status reports and commit recaps. Match the user\'s language.'
  const text = await runAuxiliaryPrompt({
    prompt: `${systemPrompt}\n\nConversation context:\n${context}\n\nWrite a 1-3 sentence recap of where we left off:`,
    timeoutMs: 15_000,
    tag: 'away-summary',
  })
  return text.length > 0 && text.length <= 500 ? text : ''
}

// ----------------------------------------
// Session handlers
// ----------------------------------------

/** A `session:list` row plus the origin derived for the renderer. */
type SessionListRow = ClaudeSessionListItem & { origin?: SessionOrigin }

function registerSessionHandlers(): void {
  // Session listing: merge Codex + Claude sessions (Codex primary, Claude for migration period)
  ipcMain.handle('session:list', () => {
    try {
      const codexSessions = listCodexSessions()
      const claudeSessions = listClaudeSessions()
      // Deduplicate by sessionId, preferring Codex sessions
      const seen = new Set(codexSessions.map(s => s.sessionId))
      const merged: SessionListRow[] = [...codexSessions]
      for (const s of claudeSessions) {
        if (!seen.has(s.sessionId)) merged.push(s)
      }
      merged.sort((a, b) => b.timestamp - a.timestamp)

      // Origins ride along with the list instead of a second IPC round trip.
      // The list already scans transcripts; this adds two small metadata reads
      // (jobs + the plugin ledger), so rows render with the right badge on the
      // first paint rather than flickering from "started by me" to the truth.
      // A broken origin source must leave the list intact, never empty it:
      // both readers already swallow their own errors, and this guard covers
      // anything else (e.g. an unreadable userData path).
      try {
        const origins = resolveSessionOrigins(
          merged.map(session => session.sessionId),
          readAutomationJobs(),
          readPluginSessionOrigins(app.getPath('userData')),
        )
        for (const session of merged) {
          const origin = origins[session.sessionId]
          if (origin) session.origin = origin
        }
      } catch (originErr) {
        log.warn('session:list origins error:', String(originErr))
      }

      return merged
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
  ipcMain.handle('session:rename', async (_e, { sessionId, title }) => {
    try {
      if (typeof sessionId !== 'string' || !isValidSessionId(sessionId)) return false
      const name = String(title ?? '').trim()
      if (!name) return false
      // Codex titles live in Codex's own index; appending a Claude
      // `session-title` line would never surface in the sidebar. Ask the
      // protocol first, but only for ids the Codex reader can actually see.
      if (isCodexSession(sessionId)) {
        return await renameCodexThread(sessionId, name)
      }
      return renameSession(sessionId, title)
    } catch (err) {
      log.warn('session:rename error:', String(err))
      return false
    }
  })
  ipcMain.handle('session:generateTitle', (_e: Electron.IpcMainInvokeEvent, { description }: { description: string }) => {
    try {
      if (typeof description !== 'string') return ''
      // Local derivation: the legacy CLI never shipped a working
      // `generate-session-title` subcommand, so spawning it only added a
      // process start on the path to the same fallback.
      return deriveSessionTitle(description)
    } catch (err) {
      log.debug('session:generateTitle failed:', String(err))
      return ''
    }
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

  // ── Ask AIPA about your history ──
  //
  // A question from the global search overlay: local retrieval first, then one
  // private turn on the engine this profile can authenticate with. The prompt
  // is never logged and the result carries only the answer plus the cited
  // sources; everything the model saw stays in this process.
  ipcMain.handle('session:askHistoryStatus', (): { available: boolean; reason?: string } => {
    return historyAskStatus()
  })

  // The overlay unmounts mid-run when it is closed. Without this the handler
  // kept the slot "busy" until the 90 s turn timed out, and the next question
  // was rejected even though nobody would ever see the old answer.
  ipcMain.handle('session:askHistoryCancel', (): void => {
    askHistoryGeneration++
    askHistoryAbort?.abort()
    askHistoryAbort = null
    askHistoryInFlight = false
  })

  ipcMain.handle('session:askHistory', async (
    event: Electron.IpcMainInvokeEvent,
    { question, locale, requestId, history }: {
      question: string
      locale?: string
      requestId?: string
      /** Last exchange(s) from the overlay; validated below, never trusted. */
      history?: unknown
    },
  ): Promise<{
    ok: boolean
    answer?: string
    sources?: Awaited<ReturnType<typeof collectHistoryDigest>>['sources']
    /** A zero-source answer was answered while an index was still building. */
    indexing?: boolean
    error?: string
    available?: boolean
    reason?: string
  }> => {
    const trimmed = typeof question === 'string' ? question.trim() : ''
    if (!trimmed || trimmed.length > 500) return { ok: false, error: 'invalid_question' }

    const status = historyAskStatus()
    if (!status.available) return { ok: false, available: false, reason: status.reason }
    if (askHistoryInFlight) return { ok: false, error: 'busy' }

    const generation = ++askHistoryGeneration
    const controller = new AbortController()
    askHistoryAbort = controller
    askHistoryInFlight = true
    let progressTimer: ReturnType<typeof setInterval> | null = null
    try {
      const normalizedLocale = /^zh/i.test(locale || '') ? 'zh-CN' : 'en'
      let { sources, digest, indexing } = await collectHistoryDigest(trimmed, {
        locale: normalizedLocale,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return { ok: false, error: 'aborted' }

      // A cold index answers from whatever is already extracted and builds the
      // rest in the background, so zero hits can mean "not indexed yet". Wait
      // briefly (polling, so a cancel is honoured) and ask once more before
      // telling the user the history is silent.
      if (sources.length === 0 && historyIndexBuilding()) {
        const deadline = Date.now() + 2_000
        while (!controller.signal.aborted && Date.now() < deadline && historyIndexBuilding()) {
          await new Promise<void>(resolve => {
            const timer = setTimeout(done, 150)
            function done(): void {
              clearTimeout(timer)
              controller.signal.removeEventListener('abort', done)
              resolve()
            }
            controller.signal.addEventListener('abort', done, { once: true })
          })
        }
        if (controller.signal.aborted) return { ok: false, error: 'aborted' }
        const retry = await collectHistoryDigest(trimmed, {
          locale: normalizedLocale,
          signal: controller.signal,
        })
        sources = retry.sources
        digest = retry.digest
        indexing = retry.indexing
        if (controller.signal.aborted) return { ok: false, error: 'aborted' }
      }

      // Nothing matched. Skipping the turn is honest and saves a model call:
      // the renderer shows its own "no matching history" copy, or an
      // "indexing" note when `indexing` says the search was provisional.
      if (sources.length === 0) {
        return { ok: true, answer: '', sources: [], indexing }
      }

      // The overlay paints tokens as they arrive instead of spinning for up to
      // 90 s. The buffer is filled by `runInternalTurn`'s tap and pushed on a
      // timer so a fast model cannot flood the IPC channel with one event per
      // token. Nothing is pushed for callers that did not ask for progress.
      let draft = ''
      if (typeof requestId === 'string' && requestId) {
        let lastSent = ''
        progressTimer = setInterval(() => {
          // A cancelled or superseded ask must never paint the overlay.
          if (askHistoryGeneration !== generation) return
          if (event.sender.isDestroyed()) return
          // The answer is ≤200 words; this only guards a runaway generation.
          const text = draft.slice(0, 12_000)
          if (text === lastSent) return
          lastSent = text
          try {
            event.sender.send('session:askHistoryProgress', { requestId, text })
          } catch {
            // The renderer went away between the check and the send.
          }
        }, 120)
        progressTimer.unref?.()
      }

      // A stale renderer may still send the old shape; sanitize rather than
      // reject, so a follow-up never fails because of its own context.
      const safeHistory = sanitizeAskHistory(history)
      const result = await runInternalTurn({
        prompt: buildAskPrompt(trimmed, digest, sources, normalizedLocale, safeHistory),
        timeoutMs: 90_000,
        internalTag: 'ask-history',
        // Answer from the excerpts alone; a read-only turn must not reach for
        // tools (the Claude bridge needs the empty tool list for that).
        answerOnly: true,
        cwd: getPref('workingDir'),
      }, controller.signal, (text) => {
        draft = text
      })

      if (!result.success) {
        const code = result.error === 'aborted'
          ? 'aborted'
          : /timed out/i.test(result.error || '') ? 'timeout' : 'failed'
        if (code !== 'aborted') {
          log.warn(`session:askHistory ${code}:`, String(result.error || 'unknown').slice(0, 300))
        }
        return { ok: false, error: code }
      }
      const answer = (result.text || '').trim()
      if (!answer) return { ok: false, error: 'empty_response' }
      return { ok: true, answer, sources }
    } catch (err) {
      log.warn('session:askHistory error:', String(err).slice(0, 300))
      return { ok: false, error: 'failed' }
    } finally {
      // The timer must not outlive the handler: after the invoke settles the
      // renderer's final answer supersedes every progress event.
      if (progressTimer) clearInterval(progressTimer)
      // A cancellation already handed the slot to the next ask: only the
      // handler that still owns this generation may clear the state.
      if (askHistoryGeneration === generation) {
        askHistoryInFlight = false
        if (askHistoryAbort === controller) askHistoryAbort = null
      }
    }
  })

  ipcMain.handle('cli:generateSuggestion', async (_e: Electron.IpcMainInvokeEvent, { context }: { context: string }) => {
    try {
      if (typeof context !== 'string' || !context.trim()) return ''
      return await generatePromptSuggestion(context)
    } catch (err) {
      // Fires after every assistant turn; a warning per failure would drown
      // the log. The empty string is the renderer's "no suggestion" state.
      log.debug('cli:generateSuggestion failed:', String(err))
      return ''
    }
  })

  ipcMain.handle('cli:generateAwaySummary', async (_e: Electron.IpcMainInvokeEvent, { context }: { context: string }) => {
    try {
      if (typeof context !== 'string' || !context.trim()) return ''
      return await generateAwaySummary(context)
    } catch (err) {
      log.debug('cli:generateAwaySummary failed:', String(err))
      return ''
    }
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
    try {
      setPref(key, value)
      // Switching the background pet alerts off also retracts any bubble that
      // is currently up; switching them on lets queued items surface.
      if (key === 'petAttentionAlerts') refreshAttention()
    } catch (err) { log.warn('prefs:set error:', String(err)) }
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
  // The canonical five-tier assembler. The renderer's chat turn calls this
  // instead of assembling locally, so a hidden automation/plugin turn and a
  // manual send produce the same `<memory_context>` block.
  safeHandle('memory:buildContext', async (_e, { cwd, personalMemories }: {
    cwd?: string
    personalMemories?: import('../sessions/memory-context').PersonalMemoryLike[]
  }) => {
    try {
      return await assembleMemoryContext({
        cwd: typeof cwd === 'string' ? cwd : '',
        personalMemories: Array.isArray(personalMemories) ? personalMemories : readPersonalMemories(),
      })
    } catch (err) {
      log.warn('memory:buildContext error:', String(err))
      // Complete shape: a caller must not be able to tell a failed read from
      // an older build by looking for a missing field.
      return { text: '', applied: [], omitted: [], used: {}, truncated: [], unreadable: [] }
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
      (event) => {
        send('plugin:ai:event', { ...event, pluginId, requestId })
        // Terminal events are what the user is waiting for; report them to
        // the pet when nobody is watching the plugin view.
        if (event.type === 'done') {
          stoppedPluginJobs.delete(scopedId)
          raiseAttention({ kind: 'plugin-done', pluginId, detail: pluginLabel(pluginId) })
        } else if (event.type === 'error' && !takeStoppedPluginJob(scopedId)) {
          raiseAttention({ kind: 'failed', pluginId, detail: pluginLabel(pluginId) })
        }
      }
    )
    return { started: true }
  })
  safeHandle('plugin:ai:abort', (_e, { pluginId, requestId }: { pluginId: string; requestId: string }) => {
    // The terminal error this produces is a user cancellation, not a failure.
    stoppedPluginJobs.add(`${pluginId}:${requestId}`)
    abortPluginAi(`${pluginId}:${requestId}`)
  })

  // `chat.ask` — a plugin asks the assistant a question and gets the answer
  // back. `runInternalTurn` always gives it an `internal-` bridge, a read-only
  // permission mode and a private event sink, so nothing reaches the renderer.
  // A private turn is also ephemeral. A visible turn persists the thread and
  // reports the openable id; the event below tells the renderer to refresh the
  // archive and name the plugin that started the conversation. With a
  // `sessionId`, the same visible turn continues an earlier conversation this
  // plugin started, after the origin ledger check inside `askPluginChat`. The
  // permission itself is checked there too, and every refusal carries a code
  // the plugin can branch on.
  safeHandle('plugin:chat:ask', async (_e, { pluginId, args }: {
    pluginId: string
    args?: import('../plugins/plugin-chat').PluginChatAskArgs
  }) => {
    // Route like chat / ai.generate: a gateway or compatible provider serves
    // the turn on its own credentials; otherwise the default engine does.
    const target = resolvePluginTurnTarget()
    const requestedSessionId = typeof args?.sessionId === 'string' ? args.sessionId.trim() : ''
    const answer = await askPluginChat(pluginId, args, (turn) => runInternalTurn({
      prompt: turn.prompt,
      cwd: turn.cwd,
      timeoutMs: turn.timeoutMs,
      internalTag: turn.tag,
      answerOnly: true,
      visible: turn.visible,
      ...(turn.sessionId ? { resumeSessionId: turn.sessionId } : {}),
      ...(target ? { model: target.model, env: target.env } : {}),
    }), {
      targetEngine: pluginAskTargetEngine(target?.env),
      evidence: pluginChatContinuationEvidence,
    })
    // askPluginChat only returns a sessionId for a visible turn whose id the
    // archive can open, so the renderer is never told about a phantom session.
    if (args?.visible === true && answer.sessionId) {
      // Record before announcing: the renderer refreshes the archive on the
      // event below, and a row arriving before its origin would read as
      // user-started until the next refresh. A continuation refreshes its
      // existing record so the ledger's cap cannot evict a conversation that
      // is still in use. Recording is best-effort; it must never fail the ask.
      recordPluginSessionOrigin(app.getPath('userData'), {
        sessionId: answer.sessionId,
        pluginId,
        pluginLabel: pluginLabel(pluginId),
      })
      // A continuation already has an archive row; announcing it again would
      // read as a second conversation.
      if (shouldAnnouncePluginConversation(true, requestedSessionId || null, answer.sessionId)) {
        send('plugin:conversation-created', {
          pluginId,
          pluginLabel: pluginLabel(pluginId),
          sessionId: answer.sessionId,
        })
      }
    }
    return answer
  })

  // `schedule` — a plugin creates, lists and deletes its own automations.
  //
  // The manifest gate lives in `plugin-automation.ts` rather than here, for the
  // same reason `chat.ask`'s does: the capability module re-checks it on every
  // call, so one check cannot drift from the other and a rejected invoke still
  // carries a `[code]` the plugin can branch on (the local `requirePermission`
  // throws plain prose, which the other capabilities use for their
  // `{ success, error }` shape). Ownership is stamped by the scheduler through
  // the `…ForPlugin` entry points and never read from this payload, so nothing
  // a renderer sends can choose whose job it becomes.
  safeHandle('plugin:automation:create', (_e, { pluginId, input }: {
    pluginId: string
    input?: import('../plugins/plugin-automation').PluginAutomationInput
  }) => createPluginAutomation(pluginId, input))
  safeHandle('plugin:automation:list', (_e, { pluginId }: { pluginId: string }) =>
    listPluginAutomations(pluginId))
  safeHandle('plugin:automation:delete', (_e, { pluginId, id }: { pluginId: string; id: string }) =>
    deletePluginAutomation(pluginId, id))

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
    // A new turn clears an earlier "stopped" marker so a genuine failure is
    // still reported.
    stoppedPluginJobs.delete(pluginId)
    await startPluginEdit(
      { pluginId, dirPath: editDir(pluginId), prompt, model, apiKey: getApiKey() || undefined },
      (event) => {
        send('plugin:edit:event', event)
        // Same completion path as the one-shot AI jobs: a background edit turn
        // that ends while the app is in the background is a plugin job done.
        if (event.type === 'done') {
          stoppedPluginJobs.delete(pluginId)
          raiseAttention({ kind: 'plugin-done', pluginId, detail: pluginLabel(pluginId) })
        } else if (event.type === 'error' && !takeStoppedPluginJob(pluginId)) {
          raiseAttention({ kind: 'failed', pluginId, detail: pluginLabel(pluginId) })
        }
      }
    )
    return { started: true }
  })
  safeHandle('plugin:edit:send', async (_e, { pluginId, prompt }: { pluginId: string; prompt: string }) => {
    stoppedPluginJobs.delete(pluginId)
    await sendPluginEdit(pluginId, prompt)
    return { sent: true }
  })
  safeHandle('plugin:edit:abort', (_e, { pluginId }: { pluginId: string }) => {
    stoppedPluginJobs.add(pluginId)
    abortPluginEdit(pluginId)
  })
  safeHandle('plugin:edit:close', (_e, { pluginId }: { pluginId: string }) => {
    stoppedPluginJobs.add(pluginId)
    endPluginEdit(pluginId)
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
    // Speculation executes the guessed prompt in an isolated overlay using the
    // legacy CLI's `--print`/`--skip-permissions` loop. Codex's app-server has
    // no equivalent, and running the guess on the Codex engine would spend the
    // user's quota on a message they never sent. Off is the honest state on
    // every other engine (the hook already treats an error as "idle").
    const engine = resolveAuxiliaryEngine()
    if (engine.kind !== 'claude') {
      return { id, error: 'engine_unavailable' }
    }
    // Provider credentials/URLs must reach the child; renderer-provided vars
    // still win, mirroring how chat routing passes its env.
    const effectiveEnv = { ...engine.env, ...(env || {}) }
    // Abort any previous speculation with the same id
    speculationManager.abort(id)
    const bridge = speculationManager.create(id)
    try {
      const result = await bridge.run(prompt, cwd, model, effectiveEnv)
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
