/**
 * Executes one automation run on whichever engine this profile can authenticate.
 *
 * A run must leave evidence: it opens a real, persisted conversation, so the
 * transcript shows up in the archive like any other. Every prompt of the job
 * runs inside that one conversation, as follow-up turns, so a workflow reads as
 * a single session.
 *
 * Engine choice is delegated to `resolveAuxiliaryEngine` — the same rule hidden
 * helpers (suggestions, recaps) use. Previously this runner always opened a
 * Codex app-server, so on a profile whose only credentials are an Anthropic key
 * or a Claude Code login every automation failed even though chat worked. One
 * resolver means an automation can never pick an engine the rest of the app
 * considers unavailable.
 *
 *   - Codex: `CodexBridge`, non-ephemeral thread; the openable id is the
 *     thread id, and Codex persists the rollout in `~/.codex/sessions`.
 *   - Legacy Claude CLI / provider: `StreamBridge` in session mode, WITHOUT
 *     `--no-session-persistence`. The openable id is the real JSONL session id
 *     the result envelope reports (`claudeSessionId`); we never substitute the
 *     internal bridge id, which the archive cannot open. If the CLI reports no
 *     id, the run still succeeds but the job's `lastSessionId` stays null rather
 *     than pointing at something that does not exist.
 *
 * The bridge is tagged `internal-…` and its events never reach the renderer:
 * a background run may not stream into whatever conversation the user has
 * open, and the tag also keeps `CodexBridgeManager.findByThreadId` from
 * attaching a user's message to this bridge while it is still working.
 */
import { codexBridgeManager } from '../codex/codex-bridge'
import type { CodexBridge } from '../codex/codex-bridge'
import { buildCodexTurnArgs } from '../codex/codex-turn-args'
import { resolveAuxiliaryEngine } from '../llm/auxiliary-engine'
import type { AuxiliaryEngine } from '../llm/auxiliary-engine'
import { streamBridgeManager } from '../pty/stream-bridge'
import { buildMemoryBlockForTurn, prefixWithMemoryContext } from '../sessions/memory-context'
import { createLogger } from '../utils/logger'
import { buildPersonaPromptPrefix, filterModelForEngine } from './persona-plan'
import type { AutomationRunOutcome, AutomationRunRequest } from './types'

const log = createLogger('automation-runner')

export const AUTOMATION_BRIDGE_TAG = 'internal-automation-'

/** One turn (a single prompt) never gets more than this, even with time left. */
const TURN_TIMEOUT_MS = 10 * 60_000
const SUMMARY_MAX_CHARS = 280

/** jobId → bridge id of the run in flight, so a delete/edit can stop it. */
const activeRuns = new Map<string, string>()

export function abortAutomationRun(jobId: string): void {
  const bridgeId = activeRuns.get(jobId)
  if (!bridgeId) return
  log.info(`Aborting automation run for ${jobId}`)
  // Only one manager owns the id; asking both keeps the abort path free of an
  // engine lookup that could disagree with the one the runner actually chose.
  codexBridgeManager.abort(bridgeId)
  streamBridgeManager.abort(bridgeId)
}

function summarize(text: string): string | undefined {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (!flat) return undefined
  return flat.length > SUMMARY_MAX_CHARS ? `${flat.slice(0, SUMMARY_MAX_CHARS - 1)}…` : flat
}

interface TurnResult {
  ok: boolean
  error?: string
}

/**
 * One running conversation. Both engines implement the same operations, so
 * the prompt sequencing, deadline, abort and status bookkeeping in
 * `runAutomation` are written once.
 */
interface EngineRun {
  /** First prompt starts the conversation; every later prompt continues it. */
  send(prompt: string, timeoutMs: number): Promise<TurnResult>
  /** Openable conversation id for the archive, once the engine has reported it. */
  sessionId(): string | undefined
  /** Assistant text of the most recently completed turn. */
  lastText(): string
  /** Stop the process and detach every listener; safe after a failure. */
  dispose(): void
}

// ── Codex ────────────────────────────────────────────

/**
 * Run one turn and wait for its `turn/completed`.
 *
 * Listeners are attached before `start()` so a fast failure (auth, spawn) is
 * not missed, and every path that ends the turn — result, process exit,
 * timeout — detaches them again.
 */
function runCodexTurn(bridge: CodexBridge, start: () => Promise<void>, timeoutMs: number): Promise<TurnResult> {
  return new Promise<TurnResult>((resolve) => {
    let settled = false
    let turnError = ''
    let timer: NodeJS.Timeout | undefined

    const finish = (result: TurnResult) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      bridge.off('result', onResult)
      bridge.off('turnError', onTurnError)
      bridge.off('processExit', onExit)
      resolve(result)
    }

    const onResult = (data: { subtype?: string }) => {
      const ok = data?.subtype === 'success'
      finish(ok ? { ok: true } : { ok: false, error: turnError || `Turn ended with ${data?.subtype ?? 'error'}` })
    }
    const onTurnError = (data: { message?: string }) => {
      if (data?.message) turnError = String(data.message)
    }
    const onExit = (data: { code?: number }) => {
      finish({ ok: false, error: `Codex exited (code ${data?.code ?? '?'})` })
    }

    bridge.on('result', onResult)
    bridge.on('turnError', onTurnError)
    bridge.on('processExit', onExit)

    timer = setTimeout(() => {
      // A wedged engine would otherwise hold a concurrency slot forever.
      try { bridge.abort() } catch { /* already gone */ }
      finish({ ok: false, error: `Turn timed out after ${Math.round(timeoutMs / 1000)}s` })
    }, Math.max(1, timeoutMs))
    timer.unref?.()

    Promise.resolve().then(start).catch((err) => finish({ ok: false, error: String(err) }))
  })
}

function createCodexRun(req: AutomationRunRequest, bridgeId: string, model: string | undefined): EngineRun {
  const bridge = codexBridgeManager.create(bridgeId)
  let turnText = ''
  let first = true

  const collectText = (data: { text?: string }) => {
    if (typeof data?.text === 'string') turnText += data.text
  }
  bridge.on('textDelta', collectText)
  // Nobody can answer an approval prompt for a hidden run; deny and let the
  // model finish with what it is allowed to do.
  bridge.on('permissionRequest', (data: { requestId?: string | number }) => {
    try { bridge.respondApproval(String(data?.requestId ?? ''), false) } catch { /* request already gone */ }
  })

  return {
    async send(prompt: string, timeoutMs: number): Promise<TurnResult> {
      turnText = ''
      const isFirst = first
      first = false
      if (isFirst) {
        // Same argument construction as a manual chat turn — in particular it
        // injects the API key saved in Settings, which a bare `env: {}` omits.
        const args = buildCodexTurnArgs(
          { prompt, cwd: req.cwd, model },
          {
            // A background run writes files when the user asked for it, but
            // only inside the workspace, and never asks for anything it cannot
            // get.
            approvalPolicy: 'never',
            sandbox: 'workspaceWrite',
            personality: 'pragmatic',
            // Without credentials Codex retries forever; fail the run instead.
            requireAuth: true,
          },
        )
        return runCodexTurn(bridge, () => bridge.sendMessage(args), timeoutMs)
      }
      return runCodexTurn(bridge, () => bridge.sendFollowUp(prompt), timeoutMs)
    },
    sessionId: () => bridge.getThreadId() ?? undefined,
    lastText: () => turnText,
    dispose: () => {
      bridge.off('textDelta', collectText)
      // Single-shot bridge: the thread is persisted, the app-server process is not.
      try { codexBridgeManager.abort(bridgeId) } catch { /* already stopped */ }
    },
  }
}

// ── Legacy Claude CLI (and provider transports) ──────

/**
 * A Claude model id is only meaningful to a Claude login. Provider scenarios
 * deliberately pass non-Claude ids (the CLI forwards them to the provider's
 * endpoint), so the filter applies to the legacy engine only.
 */
function pickClaudeModel(
  model: string | undefined,
  source: 'legacy' | 'provider',
): string | undefined {
  if (!model) return undefined
  if (source === 'legacy' && !/^claude[-:]/i.test(model)) return undefined
  return model
}

function createClaudeRun(
  req: AutomationRunRequest,
  bridgeId: string,
  engine: Extract<AuxiliaryEngine, { kind: 'claude' }>,
): EngineRun {
  const bridge = streamBridgeManager.create(bridgeId)
  let streamed = ''
  let resultText = ''
  let sessionId: string | undefined
  let first = true

  const collectText = (data: { text?: string }) => {
    if (typeof data?.text === 'string') streamed += data.text
  }
  bridge.on('textDelta', collectText)
  // A hidden run cannot answer: deny whatever asks, and keep the turn moving.
  bridge.on('permissionRequest', (data: { requestId?: string }) => {
    try { bridge.respondPermission(String(data?.requestId ?? ''), false) } catch { /* request already gone */ }
  })
  bridge.on('planApprovalRequest', (data: { requestId?: string }) => {
    try { bridge.respondPlanApproval(String(data?.requestId ?? ''), false) } catch { /* request already gone */ }
  })

  return {
    async send(prompt: string, timeoutMs: number): Promise<TurnResult> {
      streamed = ''
      resultText = ''
      return new Promise<TurnResult>((resolve) => {
        let settled = false
        let turnError = ''
        let timer: NodeJS.Timeout | undefined

        const finish = (result: TurnResult) => {
          if (settled) return
          settled = true
          if (timer) clearTimeout(timer)
          bridge.off('result', onResult)
          bridge.off('apiError', onApiError)
          bridge.off('processExit', onExit)
          resolve(result)
        }

        const onResult = (data: {
          subtype?: string
          claudeSessionId?: string
          event?: Record<string, unknown>
        }) => {
          // The result envelope carries the real JSONL session id. It is the
          // only id the archive can open; the bridge id is internal bookkeeping.
          const real = typeof data?.claudeSessionId === 'string' && data.claudeSessionId
            ? data.claudeSessionId
            : (typeof data?.event?.session_id === 'string' ? data.event.session_id : '')
          if (real) sessionId = real
          // Claude puts the complete answer on the envelope; the accumulated
          // deltas are only a fallback (they can double-count the `assistant`
          // message and its `content_block_delta`s).
          if (typeof data?.event?.result === 'string' && data.event.result) {
            resultText = data.event.result
          }
          const subtype = typeof data?.subtype === 'string' ? data.subtype : 'success'
          finish(subtype === 'success'
            ? { ok: true }
            : { ok: false, error: turnError || `Turn ended with ${subtype}` })
        }
        const onApiError = (data: { message?: string }) => {
          if (data?.message) turnError = String(data.message)
        }
        const onExit = (data: { code?: number }) => {
          // The process is meant to stay alive between turns in session mode,
          // so an exit before `result` means the CLI died mid-turn.
          finish({ ok: false, error: `Claude CLI exited (code ${data?.code ?? '?'})` })
        }

        bridge.on('result', onResult)
        bridge.on('apiError', onApiError)
        bridge.on('processExit', onExit)

        timer = setTimeout(() => {
          // A wedged engine would otherwise hold a concurrency slot forever.
          try { bridge.abort() } catch { /* already gone */ }
          finish({ ok: false, error: `Turn timed out after ${Math.round(timeoutMs / 1000)}s` })
        }, Math.max(1, timeoutMs))
        timer.unref?.()

        const isFirst = first
        first = false
        Promise.resolve().then(() => {
          if (isFirst) {
            // Session mode (acceptEdits is not bypassPermissions), persistence
            // on: that is what produces a session the archive can list.
            return bridge.sendMessage({
              prompt,
              cwd: req.cwd,
              model: pickClaudeModel(req.model, engine.source),
              env: engine.env,
              permissionMode: 'acceptEdits',
            })
          }
          bridge.sendFollowUp(prompt, sessionId)
        }).catch((err) => finish({ ok: false, error: String(err) }))
      })
    },
    sessionId: () => sessionId,
    lastText: () => resultText || streamed,
    dispose: () => {
      bridge.off('textDelta', collectText)
      try { streamBridgeManager.abort(bridgeId) } catch { /* already stopped */ }
    },
  }
}

// ── Entry point ──────────────────────────────────────

export async function runAutomation(req: AutomationRunRequest): Promise<AutomationRunOutcome> {
  const jobId = req.job.id
  if (activeRuns.has(jobId)) return { ok: false, error: 'This automation is already running' }
  if (req.prompts.length === 0) return { ok: false, error: 'Automation has nothing to run' }

  const engine = resolveAuxiliaryEngine()
  if (engine.kind === 'none') {
    // The profile can neither reach Codex nor the legacy CLI. Say so on the
    // job row instead of spawning a process that cannot authenticate.
    log.warn(`Automation ${jobId} cannot run: ${engine.reason}`)
    return { ok: false, error: 'no_authenticated_engine' }
  }

  const bridgeId = `${AUTOMATION_BRIDGE_TAG}${jobId}-${Date.now().toString(36)}`
  // A persona preset ships a Claude model id; Codex would reject it. Drop it on
  // the Codex path so the engine falls back to its own default model.
  const codexModel = engine.kind === 'codex' ? filterModelForEngine(req.model, 'codex') : undefined
  const run = engine.kind === 'codex'
    ? createCodexRun(req, bridgeId, codexModel)
    : createClaudeRun(req, bridgeId, engine)
  activeRuns.set(jobId, bridgeId)
  if (req.personaId) {
    log.info(`Automation ${jobId} runs as persona ${req.personaName ?? req.personaId}`)
  }

  // Memory for a run nobody is watching. One snapshot per run: every prompt in
  // the job belongs to the same conversation, so re-reading the tiers between
  // steps could hand one session two different views of the user. Best-effort —
  // a failed read sends the raw prompt rather than failing the job.
  const memoryText = await buildMemoryBlockForTurn(req.cwd)

  // PERSONA RULE: a scheduled run adopts the persona its workflow binds, so a
  // job that fires at 3 a.m. behaves as the expert the user chose when they built
  // the workflow. The binding is resolved in the scheduler and carried on the
  // request; it is absent for a plain `prompt` job and for a workflow whose
  // persona was deleted, and those runs stay the plain assistant. Falling back
  // to `prefs.activePersonaId` would instead invent a global default for a run
  // the user never saw created — the wrong expert (and the wrong model and cost)
  // would silently drive the job.
  const systemPrefix = buildPersonaPromptPrefix(req.systemPrompt, req.outputStyle)

  const remaining = (): number => Math.min(TURN_TIMEOUT_MS, req.deadline - Date.now())

  try {
    for (let i = 0; i < req.prompts.length; i++) {
      // Checked once per prompt so a run that is already out of budget does
      // not start another turn only to time out against a 1 ms timer.
      if (remaining() <= 0) {
        return { ok: false, error: 'Run exceeded its time budget', sessionId: run.sessionId() }
      }
      // Memory stays outermost; inside it the order matches a chat turn:
      // persona prompt, output style, then the workflow's own step.
      const turn = await run.send(
        prefixWithMemoryContext(systemPrefix + req.prompts[i], memoryText),
        remaining(),
      )
      if (!turn.ok) {
        log.warn(`Automation ${jobId} step ${i + 1} failed: ${turn.error}`)
        // A failed turn may still have written a transcript (Claude reports its
        // session id on the error result; Codex reports the thread id first).
        // Keep it so the failure notification can open what was produced.
        return { ok: false, error: turn.error, sessionId: run.sessionId() }
      }
    }

    // Captured before cleanup: this is the session the archive and the
    // notification will point at. For Claude it is the real JSONL id, for
    // Codex the persisted thread id.
    const sessionId = run.sessionId()
    if (!sessionId) {
      log.warn(`Automation ${jobId} finished without a reported session id; the run will not be openable`)
    }
    return { ok: true, sessionId, summary: summarize(run.lastText()) }
  } catch (err) {
    log.warn(`Automation ${jobId} failed:`, err)
    return { ok: false, error: String(err), sessionId: run.sessionId() }
  } finally {
    activeRuns.delete(jobId)
    run.dispose()
  }
}
