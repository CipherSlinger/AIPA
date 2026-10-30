/**
 * Starting a turn on either engine: reuse a live conversation or create a new
 * bridge, then hand the bridge to `bridge-wiring`.
 *
 * The two implementations are kept side by side because `runInternalTurn`
 * routes between them, and their differences (Codex `threadId` resume vs the
 * legacy `--resume`, credentials injection) are the contract callers rely on.
 */
import { getApiKey } from '../../../config/config-manager'
import { buildCodexTurnArgs } from '../../../codex/codex-turn-args'
import { codexBridgeManager } from '../../../codex/codex-bridge'
import { streamBridgeManager } from '../../../pty/stream-bridge'
import { dreamNoteTurnStart, dreamNoteTurnCancelled } from '../../../memory/dream-runtime'
import { sanitizeCodexInput } from '../../attachment-handlers'
import { clearActiveSession, noteActiveSession } from '../../../active-session'
import { noteBridgeSession, sessionForBridge, trackBridge } from './bridge-state'
import { wireCodexBridge, wireStreamBridge } from './bridge-wiring'
import type { BridgeSink } from '../types'

/**
 * Bridge-id prefix reserved for background turns. The renderer subscribes to
 * every bridge (onCliEvent(null)), so an untagged background turn used to pour
 * its tokens into whichever conversation was open. Internal turns get a fresh
 * bridge with this prefix and their events are consumed here instead of being
 * forwarded to the renderer.
 */
export const INTERNAL_BRIDGE_PREFIX = 'internal-'

export function isInternalBridgeId(id: unknown): boolean {
  return typeof id === 'string' && id.startsWith(INTERNAL_BRIDGE_PREFIX)
}

/**
 * Keep a background caller's model id from crossing engines.
 *
 * Suggestions and memory extraction take the model from renderer prefs, which
 * describes the *chat* engine. A Claude id sent to Codex's `thread/start` is
 * rejected as an unknown model, so it is dropped there and Codex uses its own
 * default. The Claude bridge is left alone: the installed CLI may understand
 * ids outside the Codex catalogue.
 */
export function pickModelForEngine(
  model: string | undefined,
  engine: 'codex' | 'claude',
): string | undefined {
  if (!model) return undefined
  const looksClaude = /^claude[-:]/i.test(model)
  if (engine === 'codex' && looksClaude) return undefined
  return model
}

/**
 * Remember which conversation a user-facing turn belongs to. A new
 * conversation has no id until the engine names it, so the previous pointer is
 * dropped rather than letting a quick ask continue the wrong thread. Internal
 * turns own no conversation and never call this.
 */
function noteTurnConversation(args: Record<string, unknown>, activeBridgeId: string | null): void {
  const provided = typeof args.sessionId === 'string' && args.sessionId.trim()
    ? args.sessionId.trim()
    : ''
  const known = provided || (activeBridgeId ? sessionForBridge(activeBridgeId) : null)
  if (known) noteActiveSession(known)
  else clearActiveSession()
}

export interface CodexSendOptions {
  /**
   * Fail fast through `account/read` when Codex has no credentials. The pet's
   * quick command bar uses this to show "not signed in" inline in the bar
   * instead of creating a bridge that only fails after its first turn event.
   */
  requireAuth?: boolean
}

export async function registerCodexSendMessage(
  args: Record<string, unknown>,
  sink: BridgeSink,
  internal = false,
  options: CodexSendOptions = {},
): Promise<{ success: boolean; sessionId?: string; error?: string }> {
  const existingBridgeId = args.activeBridgeId as string | undefined
  const prompt = args.prompt as string
  // The renderer's structured input crosses a trust boundary. Only text and
  // `localImage` paths inside this app's attachments directory are forwarded.
  const input = sanitizeCodexInput(args.input)
  // The renderer's model/effort describe the *chat* engine. A Claude id must
  // never reach Codex's thread/start or turn/start; `effort` is a Codex
  // concept and is validated against the model catalogue by the bridge.
  const requestedModel = pickModelForEngine(typeof args.model === 'string' ? args.model : undefined, 'codex')
  const requestedEffort = typeof args.effort === 'string' && args.effort ? args.effort : undefined
  const turnOptions = { ...(requestedModel ? { model: requestedModel } : {}), ...(requestedEffort ? { effort: requestedEffort } : {}) }
  // `/compact` is a renderer-side command; Codex exposes it as thread/compact/start.
  // Sending the literal string would just make the model talk about a slash command.
  const isCompact = /^\/compact\b/.test(prompt.trim())

  if (!internal) noteTurnConversation(args, existingBridgeId ?? null)

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
      ...(options.requireAuth === true ? { requireAuth: true } : {}),
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

export async function registerLegacySendMessage(
  args: Record<string, unknown>,
  sink: BridgeSink,
  internal = false,
): Promise<{ success: boolean; sessionId?: string; error?: string }> {
  const skipPermissions: boolean = !!(args.flags as string[] || []).includes('--dangerously-skip-permissions')
  const permissionMode = args.permissionMode as string | undefined

  const existingBridgeId = args.activeBridgeId as string | undefined
  if (!internal) noteTurnConversation(args, existingBridgeId ?? null)
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
      permissionMode: permissionMode as import('../../../pty/stream-bridge').PermissionMode | undefined,
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
