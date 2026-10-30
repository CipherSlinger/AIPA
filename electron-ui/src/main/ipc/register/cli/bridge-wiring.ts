/**
 * Wire a live engine bridge to the renderer and to the desktop surfaces the
 * main process owns: the pet, background memory turns and attention bubbles.
 *
 * Kept in one module because both engines must be wired identically — the
 * same channel names, the same internal-bridge suppression, the same failure
 * rules — and a second copy would be free to drift.
 */
import type { EventEmitter } from 'events'
import { createLogger } from '../../../utils/logger'
import { getApiKey, getPref } from '../../../config/config-manager'
import { safePath, getAllowedFsRoots } from '../../../utils/validate'
import {
  cacheMcpTools,
  forgetMcpRuntimeReports,
  noteMcpOauthCompleted,
  noteMcpStartupStatus,
} from '../mcp-runtime'
import { dreamNoteTurnEnd, dreamNoteTurnCancelled } from '../../../memory/dream-runtime'
import { notifyClawdState } from '../../../clawd-bridge'
import { raiseAttention, resolveAttention } from '../../../clawd-attention'
import { notePetActivity } from '../../../pet-activity'
import {
  clipDetail,
  forgetBridge,
  markBridgeResult,
  noteBridgeSession,
  sessionForBridge,
  shouldRaiseExitFailure,
} from './bridge-state'
import type { BridgeSink } from '../types'

const log = createLogger('ipc:cli')

/**
 * Environment for a detached Codex probe.
 *
 * Chat turns go through `buildCodexTurnArgs`, which injects the Settings key;
 * probes spawn their own app-server and must do the same, otherwise usage and
 * limits fail with "authentication required" even though the user is signed in.
 */
export function codexProbeEnv(): Record<string, string> {
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
export function resolveCodexProbeCwd(input: unknown): string {
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

/**
 * Feed the pet's live activity strip from the narrowest existing turn signals:
 * the turn/started message, a tool card opening or closing, the result
 * envelope that ends the turn, and the engine's error events. These are the
 * same events the pet's session state already follows, so neither bridge needs
 * a new hook and no IPC payload changes.
 *
 * Registered only for user-facing bridges (after the `internal` early return):
 * a background turn must not drive the single strip the user is reading.
 */
function wirePetActivity(bridge: EventEmitter, bridgeId: string): void {
  bridge.on('messageStart', () => notePetActivity({ type: 'turn-start', bridgeId }))
  bridge.on('textDelta', () => notePetActivity({ type: 'thinking', bridgeId }))
  bridge.on('thinkingDelta', () => notePetActivity({ type: 'thinking', bridgeId }))
  bridge.on('toolUse', (d: { event?: { id?: string; name?: string; input?: Record<string, unknown> } }) => {
    notePetActivity({
      type: 'tool-start',
      bridgeId,
      toolId: d?.event?.id,
      toolName: d?.event?.name,
      input: d?.event?.input,
    })
  })
  bridge.on('toolResult', (d: { event?: { tool_use_id?: string } }) => {
    notePetActivity({ type: 'tool-finish', bridgeId, toolId: d?.event?.tool_use_id })
  })
  bridge.on('result', (d: { outcome?: string; subtype?: string; totalCostUsd?: number }) => {
    // The engine prices the turn only in its final envelope. Note the cost
    // before the completion clears the strip: today the strip disappears with
    // the turn, so this is the honest hook for a card that survives briefly
    // longer, not an attempt to keep a completion card alive.
    if (typeof d?.totalCostUsd === 'number') {
      notePetActivity({ type: 'cost', bridgeId, costUsd: d.totalCostUsd })
    }
    // `outcome` is the Codex vocabulary, `subtype` the Claude one. Both mean
    // "this turn is over"; the strip hides either way.
    notePetActivity({ type: 'turn-complete', bridgeId, outcome: d?.outcome ?? d?.subtype })
  })
  // Per-turn token reading. Codex emits `thread/tokenUsage/updated` while the
  // turn runs; the bridge has already normalized `last` into Claude's usage
  // vocabulary and dropped the zeroed pre-request event.
  bridge.on('tokenUsageUpdated', (d: { usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; context_window?: number } }) => {
    notePetActivity({
      type: 'token-usage',
      bridgeId,
      inputTokens: d?.usage?.input_tokens,
      outputTokens: d?.usage?.output_tokens,
      cacheReadTokens: d?.usage?.cache_read_input_tokens,
      contextWindow: d?.usage?.context_window,
    })
  })
  bridge.on('turnError', (d: { willRetry?: boolean; message?: string }) => {
    // A retryable engine error is a reconnect, not a failed turn.
    if (d?.willRetry) return
    notePetActivity({ type: 'turn-error', bridgeId, message: d?.message })
  })
  bridge.on('apiError', (d: { message?: string }) => {
    notePetActivity({ type: 'turn-error', bridgeId, message: d?.message })
  })
  // A pending approval or question is still the agent working, just blocked on
  // the user; the strip says so until the request is answered.
  bridge.on('permissionRequest', () => notePetActivity({ type: 'awaiting', bridgeId }))
  bridge.on('planApprovalRequest', () => notePetActivity({ type: 'awaiting', bridgeId }))
  bridge.on('elicitationRequest', () => notePetActivity({ type: 'awaiting', bridgeId }))
  bridge.on('mcpElicitation', () => notePetActivity({ type: 'awaiting', bridgeId }))
  bridge.on('serverRequestResolved', () => notePetActivity({ type: 'thinking', bridgeId }))
  bridge.on('processExit', () => notePetActivity({ type: 'reset', bridgeId }))
}

/** Wire a CodexBridge to the renderer, reusing the legacy channel names. */
export function wireCodexBridge(
  bridge: import('../../../codex/codex-bridge').CodexBridge,
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
  // The engine's echo of the user's prompt, carrying the turn it started. The
  // renderer uses it to tag its locally-added user row with a `turnId` — the
  // only value `thread/fork` accepts as a branch point.
  bridge.on('userMessageTurn', (d) => sink('cli:userMessageTurn', d))
  bridge.on('toolProgress', (d) => sink('cli:toolProgress', d))
  // Live `apply_patch` snapshots; the Edit card grows while Codex writes.
  bridge.on('patchUpdated', (d) => sink('cli:patchUpdated', d))
  bridge.on('threadStarted', (d) => {
    noteBridgeSession(bridgeId, d.threadId)
    sink('cli:threadStarted', d)
  })
  bridge.on('threadClosed', (d) => sink('cli:threadClosed', d))
  // Thread life-cycle changes made by any client (including the Codex CLI).
  // The renderer edits its session list in place from these; the bridge already
  // normalizes `threadName` into `name` (nullable on the wire).
  bridge.on('threadNameUpdated', (d) => sink('cli:threadNameUpdated', d))
  bridge.on('threadArchived', (d) => sink('cli:threadArchived', d))
  bridge.on('threadDeleted', (d) => sink('cli:threadDeleted', d))
  // Read-only/observability notifications. The renderer ignores channels it
  // does not know, but forwarding them keeps the renderer wave able to adopt
  // them without another main-process change.
  bridge.on('turnDiffUpdated', (d) => sink('cli:turnDiffUpdated', d))
  bridge.on('threadSettingsUpdated', (d) => sink('cli:threadSettingsUpdated', d))
  bridge.on('serverRequestResolved', (d) => sink('cli:serverRequestResolved', d))
  bridge.on('serverRequestTimedOut', (d) => sink('cli:serverRequestTimedOut', d))
  // Account rate limits (`account/rateLimits/updated` / prime read). The raw
  // snapshot is forwarded; the composer's rateLimitView owns the sparse merge.
  bridge.on('rateLimitsUpdated', (d) => sink('cli:rateLimitsUpdated', d))

  // A background turn must not drive the desktop pet — it has no session id
  // the pet can attribute, and it would flip the state while the user reads.
  // It still has to release its attention bookkeeping when the process ends.
  if (internal) {
    bridge.on('processExit', () => forgetBridge(bridgeId))
    return
  }

  // The pet's live activity strip. User-facing bridges only, like the state
  // notifications below: a background turn has no place on the strip.
  wirePetActivity(bridge, bridgeId)

  // Thread goal + unarchive. Both are user-facing: a goal is a standing
  // objective the composer shows, and an unarchive puts a row back in the
  // sidebar. A background bridge must not touch either surface, so they are
  // registered after the `internal` early return (the private sink drops
  // them anyway, but the listener never runs for an internal bridge).
  bridge.on('threadGoalUpdated', (d) => sink('cli:threadGoalUpdated', d))
  bridge.on('threadGoalCleared', (d) => sink('cli:threadGoalCleared', d))
  bridge.on('threadUnarchived', (d) => sink('cli:threadUnarchived', d))

  // The engine's own notices. These are user-facing by definition (warnings
  // meant to be read, a reroute the picker would otherwise hide, an account
  // change, a changed skills catalogue), so they are wired only after the
  // `internal` early return: a background turn keeps bypassing this path even
  // though its private sink would drop the channels anyway. `skills/changed`
  // still invalidates the bridge's cache for every bridge — that happens in
  // the bridge before this point.
  bridge.on('engineWarning', (d) => sink('cli:engineWarning', d))
  bridge.on('modelRerouted', (d) => sink('cli:modelRerouted', d))
  // Hook runs. A blocked user-prompt-submit hook produces a turn with no
  // model answer; the renderer needs the completed run to explain that gap.
  // A background bridge returned above: its hooks own no transcript.
  bridge.on('hookRun', (d) => sink('cli:hookRun', d))
  bridge.on('accountUpdated', (d) => sink('cli:accountUpdated', d))
  bridge.on('skillsChanged', (d) => sink('cli:skillsChanged', d))
  // Live MCP startup/auth reports. Also user-facing by definition, so an
  // internal bridge never reaches them. The cache lets Settings → MCP show
  // what the engine already said when the page opens later; an open page is
  // kept current by the forwarded events.
  bridge.on('mcpStartupStatusUpdated', (d) => {
    noteMcpStartupStatus(bridgeId, d)
    sink('cli:mcpStartupStatusUpdated', d)
  })
  bridge.on('mcpOauthLoginCompleted', (d) => {
    noteMcpOauthCompleted(bridgeId, d)
    sink('cli:mcpOauthLoginCompleted', d)
  })
  bridge.on('processExit', () => forgetMcpRuntimeReports(bridgeId))
  // Windows sandbox lifecycle. Success is intentionally low-key (diagnostics
  // may consume it); failure is shown from `error` by the notice stack. The
  // sandbox setup is app-wide, but an internal bridge still owns no UI and
  // returned above.
  bridge.on('sandboxSetupCompleted', (d) => sink('cli:sandboxSetupCompleted', d))
  // Automatic approval reviews annotate the item they name. The renderer
  // validates the item id against an existing card; this channel never creates
  // one.
  bridge.on('autoApprovalReview', (d) => sink('cli:autoApprovalReview', d))

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
export function wireStreamBridge(
  bridge: import('../../../pty/stream-bridge').StreamBridge,
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
  bridge.on('taskCompleted', (d) => sink('cli:taskCompleted', d))

  if (internal) {
    bridge.on('processExit', () => forgetBridge(bridgeId))
    return
  }

  // Same live activity strip as the Codex path; the stream bridge exposes the
  // same turn/tool/result events, so one mapping serves both engines.
  wirePetActivity(bridge, bridgeId)

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
