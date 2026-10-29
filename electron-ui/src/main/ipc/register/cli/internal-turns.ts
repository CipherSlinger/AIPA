/**
 * Hidden, engine-routed turns that belong to no conversation.
 *
 * Used by the ask overlay, workflow/skill generalisation, the dream pass and
 * plugin `chat.ask`. Kept together because they share one isolation contract:
 * an `internal-` bridge id, a private event sink and no renderer traffic.
 */
import { app } from 'electron'
import { codexBridgeManager } from '../../../codex/codex-bridge'
import { streamBridgeManager } from '../../../pty/stream-bridge'
import { resolveAuxiliaryEngine, noteAuxiliaryEngineUnavailable } from '../../../llm/auxiliary-engine'
import { isCodexSession } from '../../../codex/codex-session-reader'
import { loadSession as loadClaudeSession } from '../../../sessions/session-reader'
import { readPluginSessionOrigins } from '../../../sessions/session-origins'
import { pickOpenableSessionId } from '../../openable-session'
import {
  isInternalBridgeId,
  pickModelForEngine,
  registerCodexSendMessage,
  registerLegacySendMessage,
} from './send-message'
import type { BridgeSink } from '../types'

/**
 * Run one CLI turn that belongs to no conversation: the bridge gets an
 * `internal-` id, its events go to a private sink, and the final text is the
 * invoke's result. Both engines are reachable through the same two helpers,
 * so the isolation is identical for Codex and the legacy Claude bridge.
 */
export async function runInternalTurn(
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
export function pluginAskTargetEngine(env: Record<string, string> | undefined): 'codex' | 'claude' | null {
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
export function pluginChatContinuationEvidence(sessionId: string): {
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
export async function runAuxiliaryPrompt(args: {
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
