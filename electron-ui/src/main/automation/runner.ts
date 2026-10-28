/**
 * Executes one automation run on the Codex engine.
 *
 * A run must leave evidence: it opens a real (non-ephemeral) Codex thread, so
 * the transcript lands in `~/.codex/sessions` and shows up in the archive like
 * any other conversation. Every prompt of the job runs inside that one thread,
 * as follow-up turns, so a workflow reads as a single conversation.
 *
 * The bridge is tagged `internal-…` and its events never reach the renderer:
 * a background run may not stream into whatever conversation the user has
 * open, and the tag also keeps `CodexBridgeManager.findByThreadId` from
 * attaching a user's message to this bridge while it is still working.
 */
import { codexBridgeManager } from '../codex/codex-bridge'
import type { CodexBridge } from '../codex/codex-bridge'
import { buildCodexTurnArgs } from '../codex/codex-turn-args'
import { createLogger } from '../utils/logger'
import type { AutomationRunOutcome, AutomationRunRequest } from './types'

const log = createLogger('automation-runner')

export const AUTOMATION_BRIDGE_TAG = 'internal-automation-'

/** One turn (a single prompt) never gets more than this, even with time left. */
const TURN_TIMEOUT_MS = 10 * 60_000
const SUMMARY_MAX_CHARS = 280

/** jobId → bridgeId of the run in flight, so a delete/edit can stop it. */
const activeRuns = new Map<string, string>()

export function abortAutomationRun(jobId: string): void {
  const bridgeId = activeRuns.get(jobId)
  if (!bridgeId) return
  log.info(`Aborting automation run for ${jobId}`)
  codexBridgeManager.abort(bridgeId)
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
 * Run one turn and wait for its `turn/completed`.
 *
 * Listeners are attached before `start()` so a fast failure (auth, spawn) is
 * not missed, and every path that ends the turn — result, process exit,
 * timeout — detaches them again.
 */
function runTurn(bridge: CodexBridge, start: () => Promise<void>, timeoutMs: number): Promise<TurnResult> {
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

    start().catch((err) => finish({ ok: false, error: String(err) }))
  })
}

export async function runAutomation(req: AutomationRunRequest): Promise<AutomationRunOutcome> {
  const jobId = req.job.id
  if (activeRuns.has(jobId)) return { ok: false, error: 'This automation is already running' }
  if (req.prompts.length === 0) return { ok: false, error: 'Automation has nothing to run' }

  const bridgeId = `${AUTOMATION_BRIDGE_TAG}${jobId}-${Date.now().toString(36)}`
  const bridge = codexBridgeManager.create(bridgeId)
  activeRuns.set(jobId, bridgeId)

  let turnText = ''
  const collectText = (data: { text?: string }) => {
    if (typeof data?.text === 'string') turnText += data.text
  }
  bridge.on('textDelta', collectText)
  // Nobody can answer an approval prompt for a hidden run; deny and let the
  // model finish with what it is allowed to do.
  bridge.on('permissionRequest', (data: { requestId?: string | number }) => {
    try { bridge.respondApproval(String(data?.requestId ?? ''), false) } catch { /* request already gone */ }
  })

  const remaining = () => Math.min(TURN_TIMEOUT_MS, req.deadline - Date.now())

  try {
    turnText = ''
    // Same argument construction as a manual chat turn — in particular it
    // injects the API key saved in Settings, which a bare `env: {}` omits.
    const firstArgs = buildCodexTurnArgs(
      {
        prompt: req.prompts[0],
        cwd: req.cwd,
        model: req.model,
      },
      {
        // A background run writes files when the user asked for it, but only
        // inside the workspace, and never asks for anything it cannot get.
        approvalPolicy: 'never',
        sandbox: 'workspaceWrite',
        personality: 'pragmatic',
        // Without credentials Codex retries forever; fail the run instead.
        requireAuth: true,
      },
    )
    const first = await runTurn(bridge, () => bridge.sendMessage(firstArgs), remaining())

    if (!first.ok) {
      log.warn(`Automation ${jobId} first turn failed: ${first.error}`)
      return { ok: false, error: first.error }
    }

    let lastText = turnText
    for (let i = 1; i < req.prompts.length; i++) {
      const left = remaining()
      if (left <= 0) return { ok: false, error: 'Run exceeded its time budget' }
      turnText = ''
      const next = await runTurn(bridge, () => bridge.sendFollowUp(req.prompts[i]), left)
      if (!next.ok) {
        log.warn(`Automation ${jobId} step ${i + 1} failed: ${next.error}`)
        return { ok: false, error: next.error }
      }
      lastText = turnText
    }

    // Capture the thread id before cleanup clears it — this is the session the
    // archive and the notification will point at.
    const sessionId = bridge.getThreadId() ?? undefined
    return { ok: true, sessionId, summary: summarize(lastText) }
  } catch (err) {
    log.warn(`Automation ${jobId} failed:`, err)
    return { ok: false, error: String(err) }
  } finally {
    // Single-shot bridge: the thread is persisted, the app-server process is not.
    activeRuns.delete(jobId)
    bridge.off('textDelta', collectText)
    try { codexBridgeManager.abort(bridgeId) } catch { /* already stopped */ }
  }
}
