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
import type { EventEmitter } from 'node:events'
import { codexBridgeManager } from '../codex/codex-bridge'
import type { CodexBridge } from '../codex/codex-bridge'
import { buildCodexTurnArgs } from '../codex/codex-turn-args'
import { resolveAuxiliaryEngine } from '../llm/auxiliary-engine'
import type { AuxiliaryEngine } from '../llm/auxiliary-engine'
import { streamBridgeManager } from '../pty/stream-bridge'
import { buildMemorySnapshotForTurn, prefixWithMemoryContext } from '../sessions/memory-context'
import { createLogger } from '../utils/logger'
import { createChangedFilesCollector } from './changed-files'
import { resolveRunHandbook } from './dept-handbook'
import { readDeptHandbookSnapshot } from './dept-handbook-store'
import { buildMemoryDigest, failedMemoryDigest } from './memory-digest'
import { buildPersonaPromptPrefix, filterModelForEngine } from './persona-plan'
import {
  MAX_RUN_APPROVALS_RECORDED,
  clipApprovalSubject,
  runApprovalQueue,
  toRunApproval,
} from './run-approvals'
import { RunUsageAccumulator, readTurnUsage } from './run-usage'
import type { TurnUsage } from './run-usage'
import type {
  AutomationRunApproval,
  AutomationRunChangedFiles,
  AutomationRunOutcome,
  AutomationRunRequest,
  AutomationWaitingApproval,
} from './types'

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
  /** What this turn spent, when the engine reported it — failures included. */
  usage?: TurnUsage
}

/**
 * A turn's timeout, which a held approval must not consume.
 *
 * The wait for an answer is not the engine working, so it must not be what
 * makes a turn "time out": without this, the 15-minute request timeout could
 * never be reached on a 10-minute turn, and the stated timeout would be a lie.
 * The timer is paused when a request is held and resumed when it settles, with
 * the turn keeping exactly the budget it had left.
 */
interface TurnTimer {
  pause(): void
  resume(): void
  stop(): void
}

/**
 * Shared with the approval desk: the live turn's timer (so a held request can
 * pause it) and the run's release hook (so a turn that ends while waiting
 * settles the request before the outcome is built, not after).
 */
interface TurnSlot {
  timer: TurnTimer | null
  onEnd?: () => void
}

function createTurnTimer(timeoutMs: number, onExpire: () => void): TurnTimer {
  let remaining = Math.max(1, timeoutMs)
  let armedAt = 0
  let handle: NodeJS.Timeout | null = null
  let stopped = false

  const arm = () => {
    if (stopped) return
    armedAt = Date.now()
    handle = setTimeout(() => {
      handle = null
      remaining -= Date.now() - armedAt
      // A timer that fired early (clock skew, a long event-loop block) is
      // re-armed for what is left instead of ending the turn early.
      if (remaining > 0) { arm(); return }
      onExpire()
    }, Math.max(1, remaining))
    handle.unref?.()
  }

  arm()

  return {
    pause() {
      if (stopped || handle === null) return
      clearTimeout(handle)
      handle = null
      remaining = Math.max(0, remaining - (Date.now() - armedAt))
    },
    resume() {
      if (stopped || handle !== null) return
      arm()
    },
    stop() {
      stopped = true
      if (handle !== null) clearTimeout(handle)
      handle = null
    },
  }
}

/**
 * The exact ask, as the engine phrased it.
 *
 * The panel is the user's only chance to see what a hidden run wants to do, so
 * nothing here paraphrases: a command is shown as the command, a file change as
 * its path, and anything else as the engine's own input JSON. A title is used
 * only when there is no input at all, and is still labelled with the tool.
 */
function describeApprovalAsk(data: {
  toolName?: unknown
  toolInput?: unknown
  title?: unknown
}): string {
  const tool = typeof data?.toolName === 'string' && data.toolName.trim()
    ? data.toolName.trim()
    : 'request'
  const input = data?.toolInput && typeof data.toolInput === 'object' && !Array.isArray(data.toolInput)
    ? data.toolInput as Record<string, unknown>
    : null
  const command = input && typeof input.command === 'string' ? input.command : ''
  if (command.trim()) return clipApprovalSubject(`${tool}: ${command}`)
  for (const key of ['file_path', 'path', 'notebook_path']) {
    const value = input?.[key]
    if (typeof value === 'string' && value.trim()) return clipApprovalSubject(`${tool}: ${value}`)
  }
  if (input && Object.keys(input).length > 0) {
    try {
      return clipApprovalSubject(`${tool}: ${JSON.stringify(input)}`)
    } catch {
      // A non-serialisable payload cannot be shown verbatim; the tool name is
      // still true, and it is better than an invented description.
    }
  }
  if (typeof data?.title === 'string' && data.title.trim()) {
    return clipApprovalSubject(`${tool}: ${data.title.trim()}`)
  }
  return clipApprovalSubject(tool) || 'request'
}

interface ApprovalDesk {
  /** Feed one engine permission event into the queue. */
  request(data: { requestId?: unknown; toolName?: unknown; toolInput?: unknown; title?: unknown }): void
  /** What this run asked, oldest first; absent when it never asked. */
  approvals(): AutomationRunApproval[] | undefined
  /** Settle anything still held because the run ended. */
  release(): void
}

/**
 * The one place a run's permission requests meet the user.
 *
 * Each request is put to the bounded queue with a single callback that both
 * answers the engine and records the outcome — the two facts the record and
 * the live UI must never disagree about. `respond` is the engine's own reply
 * function, called with this request's id only.
 */
function createApprovalDesk(
  req: AutomationRunRequest,
  runKey: string,
  slot: TurnSlot,
  respond: (requestId: string, approved: boolean) => void,
): ApprovalDesk {
  const recorded: AutomationRunApproval[] = []
  let waiting: AutomationWaitingApproval | null = null

  const report = (next: AutomationWaitingApproval | null): void => {
    waiting = next
    try {
      req.onApprovalWait?.(next)
    } catch (err) {
      // The scheduler owns the row and the store; a failure there must not
      // leave the engine unanswered.
      log.warn('Could not report an approval wait:', err)
    }
  }

  const request: ApprovalDesk['request'] = (data) => {
    const requestId = String(data?.requestId ?? '')
    if (!requestId) {
      // The bridge could not name the request, so it cannot be answered by
      // name either. Deny it as the old path did and keep no record.
      try { respond('', false) } catch { /* request already gone */ }
      return
    }
    const subject = describeApprovalAsk(data)
    const result = runApprovalQueue.request(
      { jobId: req.job.id, jobName: req.job.name, runKey, requestId, subject },
      (decision) => {
        recorded.push(toRunApproval(decision))
        if (recorded.length > MAX_RUN_APPROVALS_RECORDED) {
          recorded.splice(0, recorded.length - MAX_RUN_APPROVALS_RECORDED)
        }
        if (waiting && waiting.requestId === requestId) report(null)
        slot.timer?.resume()
        try {
          respond(requestId, decision.outcome === 'approved')
        } catch { /* request already gone */ }
      },
    )
    if (result.held && result.hold) {
      // The wait is not the engine working: stop the turn's clock until it ends.
      slot.timer?.pause()
      report({
        requestId,
        since: result.hold.since,
        subject: result.hold.subject,
      })
    }
  }

  return {
    request,
    approvals: () => (recorded.length > 0 ? [...recorded] : undefined),
    release: () => { runApprovalQueue.releaseRun(runKey) },
  }
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
  /**
   * File-editing tool calls observed so far. Present for every real run: an
   * empty list is the honest "no file-editing calls observed" answer, not a
   * missing record.
   */
  changedFiles(): AutomationRunChangedFiles
  /** Permission requests this run held, oldest first; absent when none. */
  approvals(): AutomationRunApproval[] | undefined
  /** Stop the process and detach every listener; safe after a failure. */
  dispose(): void
}

/**
 * Watch both bridges' tool events and feed the run's file collector.
 *
 * Both engines emit the same pair: `toolUse` `{ event: { id, name, input } }`
 * and `toolResult` `{ event: { tool_use_id, is_error } }`. Codex's file-change
 * items arrive as Claude-style `Edit` inputs (`file_path`, `change_kind`),
 * because the bridge already normalizes them for its own cards; the legacy CLI
 * emits its tool blocks unchanged. Returns a detach function so `dispose` does
 * not leave the bridge holding a dead run.
 *
 * Deliberately not subscribed: `turnDiffUpdated`. It is an aggregate snapshot
 * that is never persisted and carries no per-call attribution, so it could only
 * double-count what the tool events already say.
 */
function observeFileEdits(
  bridge: EventEmitter,
  files: ReturnType<typeof createChangedFilesCollector>,
): () => void {
  const onToolUse = (data: { event?: { id?: unknown; name?: unknown; input?: unknown } }) => {
    const event = data?.event
    files.observeToolUse(event?.id, event?.name, event?.input)
  }
  const onToolResult = (data: { event?: { tool_use_id?: unknown; is_error?: unknown } }) => {
    const event = data?.event
    files.observeToolResult(event?.tool_use_id, event?.is_error)
  }
  bridge.on('toolUse', onToolUse)
  bridge.on('toolResult', onToolResult)
  return () => {
    bridge.off('toolUse', onToolUse)
    bridge.off('toolResult', onToolResult)
  }
}

// ── Codex ────────────────────────────────────────────

/**
 * Run one turn and wait for its `turn/completed`.
 *
 * Listeners are attached before `start()` so a fast failure (auth, spawn) is
 * not missed, and every path that ends the turn — result, process exit,
 * timeout — detaches them again.
 */
function runCodexTurn(
  bridge: CodexBridge,
  start: () => Promise<void>,
  timeoutMs: number,
  slot: TurnSlot,
): Promise<TurnResult> {
  return new Promise<TurnResult>((resolve) => {
    let settled = false
    let turnError = ''
    let timer: TurnTimer | null = null
    // Codex reports the turn's usage as it progresses; each update restates the
    // turn's totals, so only the latest snapshot is kept. `result` is not used:
    // when a turn reports no update the bridge can replay the previous turn's
    // cached snapshot, which would double-count it in a multi-prompt run.
    let turnUsage: TurnUsage | undefined

    const finish = (result: TurnResult) => {
      if (settled) return
      settled = true
      timer?.stop()
      if (slot.timer === timer) slot.timer = null
      // A request held by this turn cannot outlive it. Settling before the
      // outcome is built is what lets the run record say "the run ended while
      // waiting" instead of dropping the fact.
      slot.onEnd?.()
      bridge.off('result', onResult)
      bridge.off('turnError', onTurnError)
      bridge.off('processExit', onExit)
      bridge.off('tokenUsageUpdated', onUsage)
      resolve(turnUsage ? { ...result, usage: turnUsage } : result)
    }

    const onResult = (data: { subtype?: string }) => {
      // A scheduled run is only ever stopped by AIPA going away, so a stopped
      // turn maps to the named `interrupted` reason (which has its own wording
      // in Settings) rather than surfacing engine vocabulary to the user.
      const error = data?.subtype === 'interrupted'
        ? 'interrupted'
        : `Turn ended with ${data?.subtype ?? 'error'}`
      finish(data?.subtype === 'success' ? { ok: true } : { ok: false, error: turnError || error })
    }
    const onTurnError = (data: { message?: string }) => {
      if (data?.message) turnError = String(data.message)
    }
    const onExit = (data: { code?: number }) => {
      finish({ ok: false, error: `Codex exited (code ${data?.code ?? '?'})` })
    }
    const onUsage = (data: { usage?: unknown }) => {
      const parsed = readTurnUsage(data?.usage)
      if (parsed) turnUsage = parsed
    }

    bridge.on('result', onResult)
    bridge.on('turnError', onTurnError)
    bridge.on('processExit', onExit)
    bridge.on('tokenUsageUpdated', onUsage)

    timer = createTurnTimer(timeoutMs, () => {
      // A wedged engine would otherwise hold a concurrency slot forever.
      try { bridge.abort() } catch { /* already gone */ }
      finish({ ok: false, error: `Turn timed out after ${Math.round(timeoutMs / 1000)}s` })
    })
    slot.timer = timer

    Promise.resolve().then(start).catch((err) => finish({ ok: false, error: String(err) }))
  })
}

function createCodexRun(req: AutomationRunRequest, bridgeId: string, model: string | undefined): EngineRun {
  const bridge = codexBridgeManager.create(bridgeId)
  const changedFiles = createChangedFilesCollector()
  const detachFileEdits = observeFileEdits(bridge, changedFiles)
  let turnText = ''
  let first = true
  const slot: TurnSlot = { timer: null }
  // A hidden run used to answer every approval itself, always "no". It now
  // holds the request for the user and answers with whatever the queue settled
  // on; "no" remains the outcome of a wait nobody answered.
  const desk = createApprovalDesk(
    req,
    bridgeId,
    slot,
    (requestId, approved) => { bridge.respondApproval(requestId, approved) },
  )
  slot.onEnd = desk.release
  bridge.on('permissionRequest', desk.request)

  const collectText = (data: { text?: string }) => {
    if (typeof data?.text === 'string') turnText += data.text
  }
  bridge.on('textDelta', collectText)

  return {
    async send(prompt: string, timeoutMs: number): Promise<TurnResult> {
      turnText = ''
      const isFirst = first
      first = false
      if (isFirst) {
        // Same argument construction as a manual chat turn — in particular it
        // injects the API key saved in Settings, which a bare `env: {}` omits.
        const args = buildCodexTurnArgs(
          {
            prompt,
            cwd: req.cwd,
            model,
            // The job's own level, or the app default the scheduler read when
            // this run started. Absent for `'auto'`, exactly like a chat turn.
            // The bridge validates it against the model's catalogue and drops
            // it if unadvertised, so an unsupported level degrades to the
            // engine's default instead of failing the run.
            ...(req.effort ? { effort: req.effort } : {}),
          },
          {
            // A background run writes files when the user asked for it, but
            // only inside the workspace. It may still *ask* to go outside, and
            // that ask is now held for the user instead of being auto-denied:
            // `never` would answer it before anyone saw it, which is what made
            // a nightly job fail on the same permission every night. The
            // sandbox still refuses anything the engine does not ask about,
            // and an unanswered hold is a denial after the stated timeout.
            approvalPolicy: 'unless-allow-listed',
            sandbox: 'workspaceWrite',
            personality: 'pragmatic',
            // Without credentials Codex retries forever; fail the run instead.
            requireAuth: true,
          },
        )
        return runCodexTurn(bridge, () => bridge.sendMessage(args), timeoutMs, slot)
      }
      return runCodexTurn(bridge, () => bridge.sendFollowUp(prompt), timeoutMs, slot)
    },
    sessionId: () => bridge.getThreadId() ?? undefined,
    lastText: () => turnText,
    changedFiles: () => changedFiles.summary(),
    approvals: desk.approvals,
    dispose: () => {
      bridge.off('permissionRequest', desk.request)
      // A request still held when the run ends has nobody left to answer it.
      desk.release()
      bridge.off('textDelta', collectText)
      detachFileEdits()
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
  const changedFiles = createChangedFilesCollector()
  const detachFileEdits = observeFileEdits(bridge, changedFiles)
  let streamed = ''
  let resultText = ''
  let sessionId: string | undefined
  let turnUsage: TurnUsage | undefined
  let first = true
  const slot: TurnSlot = { timer: null }
  // Tool permission requests are held for the user, exactly like the Codex
  // path. A plan approval is deliberately still denied: approving a plan is a
  // different decision from allowing one command, and this wave does not put
  // it in front of someone who is away.
  const desk = createApprovalDesk(
    req,
    bridgeId,
    slot,
    (requestId, approved) => { bridge.respondPermission(requestId, approved) },
  )
  slot.onEnd = desk.release
  bridge.on('permissionRequest', desk.request)
  bridge.on('planApprovalRequest', (data: { requestId?: string }) => {
    try { bridge.respondPlanApproval(String(data?.requestId ?? ''), false) } catch { /* request already gone */ }
  })

  const collectText = (data: { text?: string }) => {
    if (typeof data?.text === 'string') streamed += data.text
  }
  bridge.on('textDelta', collectText)

  return {
    async send(prompt: string, timeoutMs: number): Promise<TurnResult> {
      streamed = ''
      resultText = ''
      turnUsage = undefined
      return new Promise<TurnResult>((resolve) => {
        let settled = false
        let turnError = ''
        let timer: TurnTimer | null = null

        const finish = (result: TurnResult) => {
          if (settled) return
          settled = true
          timer?.stop()
          if (slot.timer === timer) slot.timer = null
          // Settle anything this turn held before the outcome is built.
          slot.onEnd?.()
          bridge.off('result', onResult)
          bridge.off('apiError', onApiError)
          bridge.off('processExit', onExit)
          resolve(result)
        }

        const onResult = (data: {
          subtype?: string
          claudeSessionId?: string
          totalCostUsd?: unknown
          usage?: unknown
          event?: Record<string, unknown>
        }) => {
          // The result envelope carries the real JSONL session id. It is the
          // only id the archive can open; the bridge id is internal bookkeeping.
          const real = typeof data?.claudeSessionId === 'string' && data.claudeSessionId
            ? data.claudeSessionId
            : (typeof data?.event?.session_id === 'string' ? data.event.session_id : '')
          if (real) sessionId = real
          // Each result in session mode is one turn, so its `usage` and
          // `total_cost_usd` are that turn's spend and can be added as-is.
          turnUsage = readTurnUsage(
            data?.usage ?? data?.event?.usage,
            data?.totalCostUsd ?? data?.event?.total_cost_usd,
          ) ?? turnUsage
          // Claude puts the complete answer on the envelope; the accumulated
          // deltas are only a fallback (they can double-count the `assistant`
          // message and its `content_block_delta`s).
          if (typeof data?.event?.result === 'string' && data.event.result) {
            resultText = data.event.result
          }
          const subtype = typeof data?.subtype === 'string' ? data.subtype : 'success'
          finish(subtype === 'success'
            ? { ok: true, usage: turnUsage }
            : { ok: false, error: turnError || `Turn ended with ${subtype}`, usage: turnUsage })
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

        timer = createTurnTimer(timeoutMs, () => {
          // A wedged engine would otherwise hold a concurrency slot forever.
          try { bridge.abort() } catch { /* already gone */ }
          finish({ ok: false, error: `Turn timed out after ${Math.round(timeoutMs / 1000)}s` })
        })
        slot.timer = timer

        const isFirst = first
        first = false
        Promise.resolve().then(() => {
          if (isFirst) {
            // Session mode (acceptEdits is not bypassPermissions), persistence
            // on: that is what produces a session the archive can list.
            //
            // No effort is passed here on purpose: the legacy CLI path has never
            // carried one (`CliSendMessageArgs` has no field for it, and the chat
            // renderer's `effort` is dropped by the legacy handler too). Adding a
            // flag here would make a scheduled run behave differently from the
            // identical chat turn, which is the one thing this runner must not do.
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
    changedFiles: () => changedFiles.summary(),
    approvals: desk.approvals,
    dispose: () => {
      bridge.off('permissionRequest', desk.request)
      // Nothing can answer a request once the run is gone.
      desk.release()
      bridge.off('textDelta', collectText)
      detachFileEdits()
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
  // Spend is accumulated across the job's prompts: every turn is one result in
  // the same conversation, and a failure after N turns must still report them.
  const usage = new RunUsageAccumulator()
  activeRuns.set(jobId, bridgeId)
  if (req.personaId) {
    log.info(`Automation ${jobId} runs as persona ${req.personaName ?? req.personaId}`)
  }

  // Memory for a run nobody is watching. One snapshot per run: every prompt in
  // the job belongs to the same conversation, so re-reading the tiers between
  // steps could hand one session two different views of the user. Best-effort —
  // a failed read sends the raw prompt rather than failing the job, but the
  // outcome still carries a digest saying the read failed, so a 03:00 run that
  // misbehaved is never silently indistinguishable from a user with no memory.
  const memory = await buildMemorySnapshotForTurn(req.cwd)
  const memoryText = memory.text
  const memoryDigest = memory.context ? buildMemoryDigest(memory.context) : failedMemoryDigest()

  // The desk's standing rules, on every unattended turn. The org tree is
  // renderer state, so the renderer writes a snapshot of each node's id, name
  // and handbook and main reads it here, at run start. Resolved from `req.job`
  // — for a chained start the scheduler passes the *successor*, so the target's
  // department decides, never the source's.
  //
  // Read once per run and reused for every prompt: a run is one conversation,
  // and re-reading between steps could hand the same session two editions of
  // its rules. The digest travels with every outcome, including failures: a
  // run with no handbook must be explainable, not just quiet.
  const handbook = resolveRunHandbook({
    snapshot: readDeptHandbookSnapshot(),
    departmentId: req.job.departmentId,
    now: Date.now(),
  })
  const handbookPrefix = handbook.text ? `${handbook.text}\n\n` : ''

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
        return {
          ok: false,
          error: 'Run exceeded its time budget',
          sessionId: run.sessionId(),
          usage: usage.total(),
          memory: memoryDigest,
          handbook: handbook.digest,
          changedFiles: run.changedFiles(),
          ...(run.approvals() ? { approvals: run.approvals() } : {}),
        }
      }
      // Memory stays outermost; inside it the order matches a chat turn:
      // persona prompt, output style, the department handbook, then the
      // workflow's own step.
      const turn = await run.send(
        prefixWithMemoryContext(systemPrefix + handbookPrefix + req.prompts[i], memoryText),
        remaining(),
      )
      usage.add(turn.usage)
      if (!turn.ok) {
        log.warn(`Automation ${jobId} step ${i + 1} failed: ${turn.error}`)
        // A failed turn may still have written a transcript (Claude reports its
        // session id on the error result; Codex reports the thread id first).
        // Keep it so the failure notification can open what was produced.
        return {
          ok: false,
          error: turn.error,
          sessionId: run.sessionId(),
          usage: usage.total(),
          memory: memoryDigest,
          handbook: handbook.digest,
          changedFiles: run.changedFiles(),
          ...(run.approvals() ? { approvals: run.approvals() } : {}),
        }
      }
    }

    // Captured before cleanup: this is the session the archive and the
    // notification will point at. For Claude it is the real JSONL id, for
    // Codex the persisted thread id.
    const sessionId = run.sessionId()
    if (!sessionId) {
      log.warn(`Automation ${jobId} finished without a reported session id; the run will not be openable`)
    }
    return {
      ok: true,
      sessionId,
      summary: summarize(run.lastText()),
      usage: usage.total(),
      memory: memoryDigest,
      handbook: handbook.digest,
      changedFiles: run.changedFiles(),
      ...(run.approvals() ? { approvals: run.approvals() } : {}),
    }
  } catch (err) {
    log.warn(`Automation ${jobId} failed:`, err)
    return {
      ok: false,
      error: String(err),
      sessionId: run.sessionId(),
      usage: usage.total(),
      memory: memoryDigest,
      handbook: handbook.digest,
      changedFiles: run.changedFiles(),
      ...(run.approvals() ? { approvals: run.approvals() } : {}),
    }
  } finally {
    activeRuns.delete(jobId)
    run.dispose()
  }
}
