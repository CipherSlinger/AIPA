import { ipcMain } from 'electron'
import { createLogger } from '../../../utils/logger'
import {
  codexBridgeManager,
  forkCodexThread,
  fetchCodexModels,
  fetchCodexAccountUsage,
  fetchCodexRateLimits,
  fetchCodexSkills,
  fetchCodexHooks,
} from '../../../codex/codex-bridge'
import { streamBridgeManager } from '../../../pty/stream-bridge'
import { resolveAuxiliaryEngine } from '../../../llm/auxiliary-engine'
import { getPref } from '../../../config/config-manager'
import {
  safePath,
  getAllowedFsRoots,
  validateFlags,
  validateModelName,
  isValidSessionId,
} from '../../../utils/validate'
import { clearAttentionForBridge, resolveAttention } from '../../../clawd-attention'
import { dreamNoteTurnCancelled } from '../../../memory/dream-runtime'
import { markBridgeAborted } from './bridge-state'
import { codexProbeEnv, resolveCodexProbeCwd } from './bridge-wiring'
import { registerCodexSendMessage, registerLegacySendMessage } from './send-message'
import { runInternalTurn } from './internal-turns'
import { safeHandle } from '../safe-handle'
import type { SendFn } from '../types'

const log = createLogger('ipc:cli')

// ----------------------------------------
// CLI handlers — CodexBridge (primary) + legacy StreamBridge (fallback)
// ----------------------------------------

/**
 * Stop the turn running on `sessionId`, with the same cleanup the renderer's
 * stop button gets. Exported because the stop gesture also lives outside the
 * renderer now (the pet's radial STOP petal); aborting a bridge directly would
 * skip the attention bookkeeping and let a stopped turn surface as a failure.
 * Returns false when nothing is live, so callers can report "nothing to stop".
 */
export function abortCliTurn(sessionId: string): boolean {
  if (typeof sessionId !== 'string' || !sessionId) return false
  // A stopped turn is not a failed one, and its pending approvals are moot.
  markBridgeAborted(sessionId)
  clearAttentionForBridge(sessionId)
  // Release the dream pass's "turn in flight" gate even if the bridge never
  // reports an exit; a stopped turn is not consolidated.
  dreamNoteTurnCancelled(sessionId)
  // Try CodexBridge first, then legacy
  const codexBridge = codexBridgeManager.get(sessionId)
  if (codexBridge) {
    codexBridgeManager.abort(sessionId)
    return true
  }
  const streamBridge = streamBridgeManager.get(sessionId)
  if (streamBridge) {
    streamBridgeManager.abort(sessionId)
    return true
  }
  return false
}

export function registerCliHandlers(send: SendFn): void {
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
    const sink = (channel: string, data: Record<string, unknown>) => send(channel, data)

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
    abortCliTurn(sessionId)
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

  // Codex-specific: steer an in-progress turn.
  //
  // The rejection has to reach the renderer: the guidance row it just wrote is
  // the only place the user learns the steer did not land, and a swallowed
  // error would leave that row claiming delivery. The handler therefore
  // resolves with a result instead of fire-and-forget.
  ipcMain.handle('cli:steerTurn', async (_e, args: { sessionId?: unknown; prompt?: unknown; expectedTurnId?: unknown } | undefined) => {
    const sessionId = typeof args?.sessionId === 'string' ? args.sessionId : ''
    const prompt = typeof args?.prompt === 'string' ? args.prompt : ''
    if (!sessionId || !prompt.trim()) {
      return { success: false, error: 'Missing sessionId or prompt' }
    }
    const codexBridge = codexBridgeManager.get(sessionId)
    if (!codexBridge) {
      return { success: false, error: 'No active codex bridge' }
    }
    try {
      const turnId = await codexBridge.steerTurn(
        prompt,
        typeof args?.expectedTurnId === 'string' && args.expectedTurnId ? args.expectedTurnId : undefined,
      )
      return { success: true, turnId }
    } catch (err) {
      log.warn('steerTurn error:', String(err))
      return { success: false, error: String(err) }
    }
  })

  // Codex-specific: branch a conversation from an earlier user message.
  //
  // Validates like `cli:steerTurn` and resolves with a result instead of
  // throwing: the engine's own refusal text (`-32600`, verbatim) is what the
  // renderer shows, and a rejected IPC call would reach it as an opaque
  // "Error invoking remote method" instead.
  //
  // `sessionId` is the Codex thread id (the id `session:list`/`session:load`
  // use), not a bridge id. `forkCodexThread` always uses a throwaway
  // app-server: `thread/fork` emits `thread/started`, which would retarget a
  // live bridge at the new branch. Detaching also means this can never resume
  // or join another conversation's bridge.
  ipcMain.handle('cli:forkThread', async (_e, args: { sessionId?: unknown; beforeTurnId?: unknown } | undefined) => {
    const threadId = typeof args?.sessionId === 'string' ? args.sessionId.trim() : ''
    if (!threadId) {
      return { success: false, error: 'Missing sessionId' }
    }
    const beforeTurnId = typeof args?.beforeTurnId === 'string' && args.beforeTurnId.trim()
      ? args.beforeTurnId.trim()
      : undefined
    try {
      const fork = await forkCodexThread(threadId, beforeTurnId)
      // `turnCount` is how much history the branch kept. The renderer opens an
      // empty branch (0 turns — branching before the first message) directly,
      // because there is no transcript for `session:load` to read.
      return { success: true, threadId: fork.threadId, turnCount: fork.turnCount }
    } catch (err) {
      log.warn('forkThread error:', String(err))
      return { success: false, error: String(err) }
    }
  })

  // ── Engine routing ──────────────────────────────────
  // The model picker may only offer what the engine that will run the next
  // turn actually accepts: Codex's own catalog on a Codex profile, the
  // built-in Claude models otherwise. `resolveAuxiliaryEngine` answers from
  // credentials and installed binaries, so it is a cheap read with no spawn.
  // Its `env` is deliberately dropped here — it carries the API key and has
  // no business crossing the context bridge — and a failed probe reports
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

  // Configured Codex hooks (read-only). `cwds` is validated against the same
  // roots as every `fs:*` path and capped; nothing here can trust or enable a
  // hook — the protocol has no trust request. Failures resolve as a result,
  // never throw across IPC.
  safeHandle('hooks:list', async (_e, args?: { cwds?: unknown } | undefined) => {
    try {
      const workingDir = getPref('workingDir') as string | undefined
      let cwds: string[] | undefined
      if (args?.cwds !== undefined) {
        if (!Array.isArray(args.cwds) || args.cwds.some(cwd => typeof cwd !== 'string')) {
          return { success: false, error: 'Invalid cwds' }
        }
        cwds = (args.cwds as string[]).slice(0, 8)
          .map(cwd => safePath(cwd, getAllowedFsRoots(workingDir)))
      }
      // Settings must answer before the first turn; a detached app-server is
      // the only way to list hooks when no conversation is open.
      const fallbackCwd = resolveCodexProbeCwd(undefined)
      const data = await fetchCodexHooks({
        cwds: cwds && cwds.length > 0 ? cwds : [fallbackCwd],
        cwd: fallbackCwd,
        env: codexProbeEnv(),
      })
      return { success: true, data }
    } catch (err) {
      log.warn('hooks:list error:', String(err))
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
