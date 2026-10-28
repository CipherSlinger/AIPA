/**
 * The automation scheduler: decides when a job is due, enforces the safety
 * rails, and hands each run to the runner.
 *
 * It owns its own ticker (same 15 s cadence as the Work Calendar reminders)
 * rather than sharing theirs: reminders stop when no window exists, while a
 * hidden window must keep automations alive, and a failure while starting one
 * subsystem should not take the other down.
 *
 * Missed runs: when the app was not running, a due job runs once on the next
 * tick and is marked late (the UI shows "ran late"). It is never replayed N
 * times, and the following occurrence is computed from "now" so a long outage
 * cannot leave a burst of catch-up runs queued. A job may opt out of that
 * catch-up (`missedRunPolicy: 'skip'`): its closed-app occurrence is recorded
 * as a skip and the schedule moves on, while a run that came due with the app
 * open still waits for a slot and runs late.
 */
import { app, BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { getPref, getRawPref } from '../config/config-manager'
import { raiseAttention } from '../clawd-attention'
import { nextFireTime, parseCron } from '../utils/cron'
import { createLogger } from '../utils/logger'
import { getAllowedFsRoots, safePath } from '../utils/validate'
import { readAutomationStore, writeAutomationStore } from './job-store'
import { MISSED_RUN_GRACE_MS, normalizeMissedRunPolicy, shouldSkipMissedRun } from './missed-policy'
import { AUTOMATION_RETRY_POLICY, isPendingRetryExpired, nextRetryAfterFailure } from './retry-policy'
import { appendRunRecord, countFailureStreak, createSkipRecord, MAX_RUN_ERROR_CHARS } from './run-history'
import { addToLifetimeTotals } from './run-usage'
import {
  checkGlobalSpendLimit,
  checkSpendLimit,
  MAX_DAILY_COST_LIMIT_USD,
  normalizeDailyCostLimit,
  summarizeGlobalSpendWindow,
  summarizeSpendWindow,
} from './spend-guard'
import { pickRunModel, resolveScheduledPersona } from './persona-plan'
import type { StoredPersona, WorkflowPersonaBinding } from './persona-plan'
import { abortAutomationRun } from './runner'
import { normalizeWatchDebounceMinutes, stopWatchers, syncWatchTriggers, watchAttachFailed } from './watcher'
import type { WatchHandlers } from './watcher'
import { workflowPrompts } from './workflow-plan'
import type { MainWorkflow, UiLocale } from './workflow-plan'
import type {
  AutomationAction,
  AutomationInput,
  AutomationJob,
  AutomationJobView,
  AutomationLimits,
  AutomationMissedRunPolicy,
  AutomationRunOutcome,
  AutomationRunRequest,
  AutomationRunSource,
  AutomationTrigger,
} from './types'

const log = createLogger('automation-scheduler')

const CHECK_INTERVAL_MS = 15_000
/**
 * A run this far past its scheduled minute is reported as late.
 *
 * Assigned from the missed-run grace so "late" and "missed while closed" can
 * never disagree: the same minute that makes a run late is the minute a
 * `'skip'` job needs before its occurrence is treated as a closed-app miss.
 */
const LATE_THRESHOLD_MS = MISSED_RUN_GRACE_MS
/** A single run (all prompts of a job) may not exceed this. */
const RUN_DEADLINE_MS = 30 * 60_000
const MAX_NAME_CHARS = 80
const MAX_PROMPT_CHARS = 4000
const MAX_REPORTED_RUNS = 24

/**
 * The static rails. The global pause is dynamic state, added alongside these
 * in `listAutomationJobs` rather than stored on the constant.
 */
export const AUTOMATION_LIMITS: Omit<AutomationLimits, 'pausedAll'> = {
  /** Anything faster turns the assistant into a runaway loop. */
  minIntervalMinutes: 5,
  maxRunsPerHour: 12,
  maxConcurrentRuns: 2,
  maxJobs: 50,
  // The retry numbers have one home (`AUTOMATION_RETRY_POLICY`); this is the
  // read-only copy the UI uses for its copy, not a second policy.
  retry: {
    maxRetries: AUTOMATION_RETRY_POLICY.maxRetries,
    delaysMinutes: AUTOMATION_RETRY_POLICY.delaysMs.map(ms => ms / 60_000),
  },
}

interface SchedulerContext {
  /**
   * Resolve the live main window at call time. Caching the BrowserWindow here
   * leaves the scheduler holding a destroyed object after the window is
   * recreated (macOS activate, tray show), so both broadcasts and completion
   * notifications silently stop working.
   */
  getWindow: () => BrowserWindow | null
  notifyChanged: () => void
  run: (req: AutomationRunRequest) => Promise<AutomationRunOutcome>
  /**
   * When this process started the scheduler. Recorded once so the tick can tell
   * an occurrence that predates the process (closed-app miss) from one that
   * came due while it was open and is merely waiting for a run slot.
   */
  startedAt: number
}

let ctx: SchedulerContext | null = null
let jobs: AutomationJob[] = []
const running = new Map<string, { startedAt: number }>()
let timer: NodeJS.Timeout | null = null
/** Global pause: scheduled runs are suspended; per-job `enabled` is untouched. */
let pausedAll = false
/**
 * One daily spend cap for all jobs together; absent means no cap. Owned by the
 * scheduler for the same reason as `pausedAll` — it is rail state for the whole
 * store, read by the tick and written atomically with the jobs — and persisted
 * as a sibling key under `automations.json`.
 */
let globalDailyCostLimitUsd: number | undefined

// ── Validation ───────────────────────────────────────

/** Carries a stable code; the renderer maps it to a translated message. */
class AutomationInputError extends Error {
  constructor(public code: string) {
    super(code)
  }
}

function errorCode(err: unknown): string {
  if (err instanceof AutomationInputError) return err.code
  log.warn('Unexpected automation error:', err)
  return 'unexpected_error'
}

function validateName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name) throw new AutomationInputError('name_required')
  if (name.length > MAX_NAME_CHARS) throw new AutomationInputError('name_too_long')
  return name
}

function nextRunAfter(trigger: AutomationTrigger, after: number): number | null {
  if (trigger.kind === 'cron') {
    const next = nextFireTime(trigger.expr, new Date(after))
    return next ? next.getTime() : null
  }
  // A watch job has no calendar. Its next run is the next file-system event,
  // which this process cannot predict, so "never" is the only honest answer —
  // and it is also what keeps the due-tick from ever choosing the job.
  if (trigger.kind === 'watch') return null
  return after + trigger.minutes * 60_000
}

function validateTrigger(value: AutomationTrigger): AutomationTrigger {
  if (!value || typeof value !== 'object') throw new AutomationInputError('trigger_invalid')
  if (value.kind === 'watch') {
    const target = typeof value.path === 'string' ? value.path.trim() : ''
    // A relative path would be resolved against whatever cwd the main process
    // happens to have, which is not the folder the user picked. Refuse it here
    // rather than watch the wrong place. A path that merely does not exist yet
    // is accepted: folders get created and drives come back, and the view says
    // when it is missing.
    if (!target || !path.isAbsolute(target)) throw new AutomationInputError('watch_path_invalid')
    return {
      kind: 'watch',
      path: target,
      // Directory recursion defaults to on; a single file ignores it.
      recursive: value.recursive !== false,
      debounceMinutes: normalizeWatchDebounceMinutes(value.debounceMinutes),
    }
  }
  if (value.kind === 'cron') {
    const expr = String(value.expr ?? '').trim().replace(/\s+/g, ' ')
    if (!parseCron(expr)) throw new AutomationInputError('cron_invalid')
    const first = nextFireTime(expr, new Date())
    if (!first) throw new AutomationInputError('cron_invalid')
    // Reject a cron that fires faster than the minimum interval; the hourly
    // cap alone would let it burn twelve runs before it is noticed.
    const second = nextFireTime(expr, first)
    if (second && second.getTime() - first.getTime() < AUTOMATION_LIMITS.minIntervalMinutes * 60_000) {
      throw new AutomationInputError('cron_too_frequent')
    }
    return { kind: 'cron', expr }
  }
  if (value.kind === 'interval') {
    const minutes = Math.round(Number(value.minutes))
    if (!Number.isFinite(minutes)) throw new AutomationInputError('interval_invalid')
    if (minutes < AUTOMATION_LIMITS.minIntervalMinutes) throw new AutomationInputError('interval_too_short')
    if (minutes > 7 * 24 * 60) throw new AutomationInputError('interval_too_long')
    return { kind: 'interval', minutes }
  }
  throw new AutomationInputError('trigger_invalid')
}

/**
 * A job's own expert override.
 *
 * Empty/null means "follow the workflow" (plain assistant for a prompt job),
 * not a persona whose id is ''. Anything that is not a non-empty string is
 * therefore treated exactly like an absent override.
 */
function validatePersonaId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const id = value.trim()
  return id || undefined
}

/**
 * A job's opt-in quiet mode. Only a real boolean true is kept; anything else is
 * "announce", which is the behaviour every existing job already had, so a
 * malformed value can never accidentally silence a failure or a success.
 */
function validateQuietOnSuccess(value: unknown): boolean | undefined {
  return value === true ? true : undefined
}

/**
 * The opt-in retry flag. Like quiet mode, only a real boolean true turns it on;
 * anything else is off, which is the behaviour every job had before retries
 * existed and the safe default for a setting that spends money.
 */
function validateRetryOnFailure(value: unknown): boolean | undefined {
  return value === true ? true : undefined
}

/**
 * The missed-while-closed choice. Only a deliberate `'skip'` is stored;
 * `'run'`, absent and any unknown value all mean the default catch-up
 * behaviour, so a malformed value can never silently drop an occurrence. The
 * rule itself lives in `missed-policy.ts` beside the tick's predicate.
 */
function validateMissedRunPolicy(value: unknown): AutomationMissedRunPolicy | undefined {
  return normalizeMissedRunPolicy(value)
}

/**
 * A job's optional daily spend limit. An empty input clears it; a value that is
 * present but unusable is an error rather than a silent "no limit", because a
 * typo must not quietly remove the rail the user asked for.
 */
function validateDailyCostLimit(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const limit = normalizeDailyCostLimit(
    typeof value === 'number' ? value : Number(value),
  )
  if (limit === undefined) {
    const n = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(n) && n > 0 && n > MAX_DAILY_COST_LIMIT_USD) {
      throw new AutomationInputError('cost_limit_too_high')
    }
    throw new AutomationInputError('cost_limit_invalid')
  }
  return limit
}

function validateAction(value: AutomationAction): AutomationAction {
  if (!value || typeof value !== 'object') throw new AutomationInputError('action_invalid')
  if (value.kind === 'workflow') {
    const workflowId = typeof value.workflowId === 'string' ? value.workflowId : ''
    if (!workflowId) throw new AutomationInputError('action_invalid')
    if (!findWorkflow(workflowId)) throw new AutomationInputError('workflow_missing')
    return { kind: 'workflow', workflowId }
  }
  if (value.kind === 'prompt') {
    const prompt = typeof value.prompt === 'string' ? value.prompt.trim() : ''
    if (!prompt) throw new AutomationInputError('prompt_required')
    if (prompt.length > MAX_PROMPT_CHARS) throw new AutomationInputError('prompt_too_long')
    if (value.cwd) {
      try {
        const cwd = safePath(String(value.cwd), getAllowedFsRoots(String(getPref('workingDir') || '')))
        return { kind: 'prompt', prompt, cwd }
      } catch {
        throw new AutomationInputError('cwd_not_allowed')
      }
    }
    return { kind: 'prompt', prompt }
  }
  throw new AutomationInputError('action_invalid')
}

// ── Workflows (read-only view of the renderer-owned pref) ──

function readWorkflows(): MainWorkflow[] {
  const raw = getRawPref('workflows')
  if (!Array.isArray(raw)) return []
  return raw.filter((w): w is MainWorkflow => !!w && typeof w === 'object' && typeof (w as MainWorkflow).id === 'string')
}

function findWorkflow(workflowId: string): MainWorkflow | undefined {
  return readWorkflows().find(w => w.id === workflowId)
}

function readPersonas(): StoredPersona[] {
  const raw = getRawPref('personas')
  if (!Array.isArray(raw)) return []
  return raw.filter((p): p is StoredPersona => !!p && typeof p === 'object')
}

/**
 * The persona a run should adopt, or null for the plain assistant.
 *
 * A job's own override wins over its workflow's binding. A deleted persona in
 * either place must not disable the job or fail the run: the job keeps working
 * as the plain assistant, and this warning is the only trace of the break.
 */
function resolveRunPersona(
  job: AutomationJob,
  workflow: MainWorkflow | undefined,
  locale: UiLocale,
): WorkflowPersonaBinding | null {
  const resolved = resolveScheduledPersona(
    job.personaId,
    workflow?.personaId,
    readPersonas(),
    locale,
  )
  if (resolved.missingId) {
    log.warn(
      `Automation "${job.name}" references missing persona ${resolved.missingId}; running as the plain assistant`,
    )
  }
  return resolved.persona
}

function resolveActionPrompts(action: AutomationAction, locale: UiLocale): string[] | null {
  if (action.kind === 'prompt') return [action.prompt]
  const workflow = findWorkflow(action.workflowId)
  if (!workflow) return null
  return workflowPrompts(workflow, locale)
}

/** Working directory for a run: the job's own, else prefs, else home. */
function resolveCwd(action: AutomationAction): string {
  if (action.kind === 'prompt' && action.cwd) return action.cwd
  const workingDir = String(getPref('workingDir') || '')
  if (workingDir && fs.existsSync(workingDir)) return workingDir
  return os.homedir()
}

// ── Persistence / broadcast ──────────────────────────

function persist(): void {
  writeAutomationStore({
    jobs,
    pausedAll,
    ...(globalDailyCostLimitUsd !== undefined ? { globalDailyCostLimitUsd } : {}),
  })
}

function broadcastChanged(): void {
  try { ctx?.notifyChanged() } catch (err) { log.warn('Could not notify renderer:', err) }
}

function persistAndBroadcast(): void {
  persist()
  broadcastChanged()
}

function toView(job: AutomationJob): AutomationJobView {
  return {
    ...job,
    actionMissing: job.action.kind === 'workflow' && !findWorkflow(job.action.workflowId),
    running: running.has(job.id),
    // Derived, so a surface reading the list alone can tell that this enabled
    // job is waiting on the global pause rather than on its own schedule.
    pausedAll,
    // A watch job's "no upcoming run" would otherwise read like a dead cron.
    // What matters is whether the watcher is attached: a path that is gone and
    // a watcher that could not attach both mean nothing will fire.
    ...(job.trigger.kind === 'watch'
      ? { watchMissing: !fs.existsSync(job.trigger.path) || watchAttachFailed(job.id) }
      : {}),
    // Derived rather than persisted: the history is the authority, so the
    // streak can never drift from the runs the row is about to list.
    failureStreak: countFailureStreak(job.history),
    // Only a job with a limit needs the window figures; the row stays quiet on
    // jobs the user never put a rail on.
    ...(job.dailyCostLimitUsd !== undefined
      ? { spendWindow: summarizeSpendWindow(job, Date.now()) }
      : {}),
  }
}

// ── Runs ─────────────────────────────────────────────

function hasHourlyCapacity(job: AutomationJob, now: number): boolean {
  const recent = job.recentRuns.filter(t => now - t < 3_600_000)
  return recent.length < AUTOMATION_LIMITS.maxRunsPerHour
}

/**
 * Start one run. The schedule is advanced *before* awaiting, so a run that
 * outlives its own interval cannot fire a second copy of itself.
 */
/** The model a manual chat turn would use: the same pref the renderer sends. */
function resolveModel(): string | undefined {
  const model = getPref('model')
  return typeof model === 'string' && model.trim() ? model.trim() : undefined
}

/**
 * Refuse a scheduled run and record why.
 *
 * Shared by the per-job and the global spend rails so the two can never disagree
 * about what a skip means: nothing started, the record carries no spend, session
 * or duration (`createSkipRecord` enforces that shape), a pending retry is
 * resolved so it cannot fire again a tick later, and the regular schedule
 * advances so the refused occurrence does not re-check every tick.
 * `countFailureStreak` keeps ignoring skips, so a skip is not a failure.
 *
 * A watch-triggered run uses this too: it is unattended spend under the same
 * rails, and its "occurrence" is simply the moment the file changed.
 */
function recordSpendSkip(
  job: AutomationJob,
  now: number,
  retryAttempt: number | undefined,
  code: 'budget_exceeded' | 'global_budget_exceeded',
): void {
  const isRetry = retryAttempt !== undefined
  // A retry is due now, not at the regular occurrence still on the calendar.
  const skippedAt = isRetry ? now : (job.nextRunAt ?? now)
  job.lastRunAt = skippedAt
  job.lastStatus = 'skipped'
  job.lastError = code
  job.lastRunLate = false
  job.lastUsage = undefined
  // A skip is not an attempt: no spend, no session, and the failure streak
  // neither grows nor resets. The retry marker keeps the refused wait visible
  // in the history.
  job.history = appendRunRecord(job.history, createSkipRecord(skippedAt, code, retryAttempt))
  // The rail resolved the retry: it must not stay pending and retry again a
  // tick later, which would be the loop the limit exists to stop.
  job.pendingRetry = undefined
  // A retry must not move the regular schedule; only an occurrence does.
  if (!isRetry) job.nextRunAt = nextRunAfter(job.trigger, now)
  persistAndBroadcast()
}

async function startRun(
  job: AutomationJob,
  opts: { manual: boolean; late: boolean; watch?: boolean; retryAttempt?: number },
): Promise<void> {
  if (!ctx || running.has(job.id)) return
  const now = Date.now()
  const locale = resolveUiLanguage()
  // A manual run is the user spending now, and an ordinary occurrence is a
  // fresh chance; either supersedes a retry that was waiting for this moment.
  // A retry start has already had its pending record cleared by the tick.
  if (opts.manual || opts.retryAttempt === undefined) job.pendingRetry = undefined

  const prompts = resolveActionPrompts(job.action, locale)
  if (prompts === null) {
    // The workflow was deleted behind this job's back: stop retrying, and let
    // the row say why instead of failing every interval.
    job.enabled = false
    job.nextRunAt = null
    job.pendingRetry = undefined
    job.lastRunAt = now
    job.lastStatus = 'error'
    job.lastError = 'workflow_missing'
    job.lastSessionId = null
    job.lastRunLate = false
    job.lastDurationMs = null
    // Nothing ran, so the previous run's spend must not masquerade as this one's.
    job.lastUsage = undefined
    // The failure still belongs in the history: a job that keeps naming a
    // deleted workflow has failed again, and the row should say so after a
    // restart instead of only until the next persistence.
    job.history = appendRunRecord(job.history, {
      startedAt: now,
      status: 'error',
      durationMs: null,
      sessionId: null,
      error: 'workflow_missing',
      late: false,
      ...(opts.retryAttempt !== undefined ? { retry: opts.retryAttempt } : {}),
    })
    log.warn(`Automation "${job.name}" disabled — its workflow no longer exists`)
    // A disabled watch job must release its watcher here rather than wait for
    // the next mutation that may never come.
    syncWatchers()
    persistAndBroadcast()
    return
  }
  if (prompts.length === 0) {
    job.lastRunAt = now
    job.lastStatus = 'error'
    job.lastError = 'nothing_to_run'
    job.lastUsage = undefined
    // Nothing to send means retrying would fail the same way; resolve the wait
    // instead of spending another attempt on it.
    job.pendingRetry = undefined
    job.history = appendRunRecord(job.history, {
      startedAt: now,
      status: 'error',
      durationMs: null,
      sessionId: null,
      error: 'nothing_to_run',
      late: false,
      ...(opts.retryAttempt !== undefined ? { retry: opts.retryAttempt } : {}),
    })
    // A retry leaves the regular schedule alone; only an occurrence advances it.
    if (!opts.manual && opts.retryAttempt === undefined) {
      job.nextRunAt = nextRunAfter(job.trigger, now)
    }
    persistAndBroadcast()
    return
  }

  // Spend rail. It sits after the "nothing to run" checks so a job naming a
  // deleted workflow still gets disabled instead of being masked by a skip,
  // and before any session or model work so a refused occurrence costs nothing.
  //
  // Manual runs bypass it: Run now is the user spending on purpose. A window
  // whose engines reported no money is *not* treated as $0 spent — the run is
  // allowed and the row says the limit could not be checked (see spend-guard).
  // A watch-triggered run is unattended spend exactly like a scheduled one, so
  // it is railed the same way. Only `manual` is exempt (the user spending now).
  const source: AutomationRunSource = opts.manual ? 'manual' : opts.watch ? 'watch' : 'scheduled'
  const spend = checkSpendLimit(job, now, source)
  if (spend.kind === 'blocked') {
    recordSpendSkip(job, now, opts.retryAttempt, 'budget_exceeded')
    log.warn(
      `Automation "${job.name}" ${opts.retryAttempt !== undefined ? `retry ${opts.retryAttempt} ` : ''}`
      + `skipped — reported spend in the last 24 h is at its ${job.dailyCostLimitUsd} USD limit`,
    )
    return
  }
  if (spend.kind === 'allowed' && spend.unmeasured) {
    log.warn(
      `Automation "${job.name}" started despite its spend limit — no run in the last `
      + '24 h reported a cost, so the limit cannot be evaluated',
    )
  }

  // The global daily cap, checked only after the per-job rail has allowed the
  // run: when both would refuse, the job's own limit is the more specific reason
  // and one skip record is enough. `jobs` is the live list including this job, so
  // the shared window covers every job's runs — the whole point of one number.
  // Manual runs are `not_applicable` here for the same reason as above.
  const globalSpend = checkGlobalSpendLimit(jobs, globalDailyCostLimitUsd, now, source)
  if (globalSpend.kind === 'blocked') {
    recordSpendSkip(job, now, opts.retryAttempt, 'global_budget_exceeded')
    log.warn(
      `Automation "${job.name}" ${opts.retryAttempt !== undefined ? `retry ${opts.retryAttempt} ` : ''}`
      + `skipped — reported spend across all jobs in the last 24 h is at the `
      + `${globalDailyCostLimitUsd} USD daily budget`,
    )
    return
  }
  if (globalSpend.kind === 'allowed' && globalSpend.unmeasured) {
    log.warn(
      `Automation "${job.name}" started despite the daily budget — no run in the last `
      + '24 h reported a cost, so the budget cannot be evaluated',
    )
  }

  // A job may name its own expert; otherwise the workflow's binding applies.
  // A prompt job with no override stays the plain assistant.
  const workflow = job.action.kind === 'workflow'
    ? findWorkflow(job.action.workflowId)
    : undefined
  const persona = resolveRunPersona(job, workflow, locale)
  // Persona model > global model, so a 3 a.m. run costs what the chosen expert
  // costs rather than whatever the chat picker happens to be set to.
  const model = pickRunModel(persona?.model, resolveModel())

  const startedAt = now
  running.set(job.id, { startedAt })
  job.lastStatus = 'running'
  job.lastError = null
  job.runCount += 1
  job.recentRuns = [...job.recentRuns, startedAt]
    .filter(t => now - t < 3_600_000)
    .slice(-MAX_REPORTED_RUNS)
  // A retry is an extra attempt for the same occurrence: advancing the regular
  // schedule here would push the job's own cadence every time it retried.
  if (!opts.manual && opts.retryAttempt === undefined) {
    job.nextRunAt = nextRunAfter(job.trigger, now)
  }
  persistAndBroadcast()

  let outcome: AutomationRunOutcome
  try {
    outcome = await ctx.run({
      job: { ...job },
      prompts,
      cwd: resolveCwd(job.action),
      // Same preference the chat path reads, so a scheduled run costs and
      // behaves like a manual one instead of falling back to Codex's default.
      ...(model ? { model } : {}),
      // Absent together when the workflow binds no persona (or its persona was
      // deleted), which keeps the run identical to the pre-persona behaviour.
      ...(persona
        ? {
            personaId: persona.id,
            personaName: persona.name,
            ...(persona.systemPrompt.trim() ? { systemPrompt: persona.systemPrompt } : {}),
            ...(persona.outputStyle ? { outputStyle: persona.outputStyle } : {}),
          }
        : {}),
      deadline: startedAt + RUN_DEADLINE_MS,
    })
  } catch (err) {
    outcome = { ok: false, error: String(err) }
  }

  running.delete(job.id)
  const finishedAt = Date.now()
  const durationMs = finishedAt - startedAt
  const sessionId = outcome.sessionId ?? null
  const error = outcome.ok ? null : clip(outcome.error || 'run_failed', MAX_RUN_ERROR_CHARS)
  job.lastRunAt = startedAt
  job.lastDurationMs = durationMs
  job.lastStatus = outcome.ok ? 'success' : 'error'
  job.lastError = error
  job.lastSessionId = sessionId
  job.lastRunLate = opts.late
  // A failed run still reports what its completed turns spent, so usage lives on
  // the outcome, not only on success. `undefined` here clears a stale figure
  // from an earlier run when this engine reported nothing.
  job.lastUsage = outcome.usage
  job.history = appendRunRecord(job.history, {
    startedAt,
    status: outcome.ok ? 'success' : 'error',
    durationMs,
    sessionId,
    error,
    late: opts.late,
    ...(opts.retryAttempt !== undefined ? { retry: opts.retryAttempt } : {}),
    ...(outcome.usage ? { usage: outcome.usage } : {}),
    // A failed run still saw the snapshot it fetched, so the digest is carried
    // on either outcome. A runner that returned before fetching one has none.
    ...(outcome.memory ? { memory: outcome.memory } : {}),
  })
  // Success ends the occurrence; a failure under the policy schedules the next
  // bounded attempt. `nextRetryAfterFailure` returns nothing for a default-off
  // job, a manual run, an exhausted budget, or when the regular occurrence
  // would arrive first. A failed retry is never rewritten as a success here.
  //
  // A failed watch run is deliberately never retried: the policy needs a
  // non-null `nextRunAt` (it is what `expiresAt` is derived from), and a watch
  // job's is null for life. The next file change is its retry — that is why no
  // timer or special case is needed here.
  job.pendingRetry = outcome.ok
    ? undefined
    : nextRetryAfterFailure({
        retryOnFailure: job.retryOnFailure === true,
        manual: opts.manual,
        attempt: opts.retryAttempt ?? 0,
        now: finishedAt,
        nextRunAt: job.nextRunAt,
      })
  const totals = addToLifetimeTotals(job, outcome.usage)
  job.totalTokens = totals.totalTokens
  job.totalCostUsd = totals.totalCostUsd
  persistAndBroadcast()
  log.info(`Automation "${job.name}" finished: ${job.lastStatus}${outcome.sessionId ? ` (session ${outcome.sessionId})` : ''}`)
  // `raiseAttention` owns the one delivery decision for every surface: pet
  // bubble, native notification, or nothing. The scheduler must not show a
  // notification of its own, or a single run could be announced twice.
  raiseAutomationAttention(job, outcome)
}

/**
 * Route a finished run into the attention queue.
 *
 * Failures use the existing `failed` shape (same bubble as a failed chat turn),
 * successes get `automation-done` so a hidden job that worked is announced
 * without pretending something broke. Both carry the run's session id, so a
 * pet click or native-notification click opens the conversation the run
 * produced. When there is no openable session, the stable job id keeps repeated
 * raises deduped and the click only brings the app forward.
 */
function raiseAutomationAttention(job: AutomationJob, outcome: AutomationRunOutcome): void {
  // Quiet mode is a decision not to raise at all — no bubble, no OS notice and
  // no dedupe entry — not a muted attention kind. The run's record, history and
  // usage were already persisted above, so only the announcement is skipped.
  // Checked for success only: a failure must stay loud, whatever this flag says.
  if (outcome.ok && job.quietOnSuccess) return
  const sessionId = outcome.sessionId ?? null
  if (outcome.ok) {
    raiseAttention({
      kind: 'automation-done',
      sessionId,
      // A run that produced no openable session still needs an identity for
      // dedupe; the job id is stable, so a repeat refreshes one item.
      bridgeId: sessionId ? null : `automation:${job.id}`,
      detail: job.name,
    })
    return
  }
  raiseAttention({
    kind: 'failed',
    sessionId,
    bridgeId: sessionId ? null : `automation:${job.id}`,
    detail: clip(outcome.error || 'run_failed', 90),
  })
}

/**
 * The locale the UI is actually showing.
 *
 * The renderer stores `'en' | 'zh-CN' | 'system'`; `'system'` (the default) is
 * resolved through `app.getLocale()`. Treating `'system'` as a literal locale
 * made every default-language Chinese user get English notifications.
 */
function resolveUiLanguage(): UiLocale {
  const stored = getRawPref('language')
  const value = stored === 'en' || stored === 'zh-CN'
    ? stored
    // 'system', absent, or an unknown/corrupt value: ask the OS, exactly like
    // the renderer's `resolveSystemLocale`.
    : app.getLocale()
  return value.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

// ── Watch triggers ───────────────────────────────────

function watchHandlers(): WatchHandlers {
  return {
    fire: fireWatchJob,
    // Live accessors: a watcher attaches long before an event arrives, and the
    // pause or an in-flight run may have changed by then.
    isRunning: id => running.has(id),
    isPausedAll: () => pausedAll,
    notify: broadcastChanged,
  }
}

/**
 * Re-align the attached watchers with the live job list.
 *
 * Called after every store mutation and at startup. Syncing is cheap when
 * nothing changed; the alternative — a dirty flag kept in step by every
 * mutation path — is one more fact that can disagree with the job list.
 */
function syncWatchers(): void {
  try {
    syncWatchTriggers(jobs, watchHandlers())
  } catch (err) {
    // The watcher module already absorbs per-path failures; this guards the
    // scheduler against a bug there taking a create/update down with it.
    log.warn('Could not sync watch triggers:', err)
  }
}

/**
 * Start a job because its watched path changed.
 *
 * The watcher has already answered "may an event fire at all" (pause, single
 * run, debounce). This is where the rails every unattended run meets apply; a
 * refusal writes the same skip record a scheduled occurrence would, so the
 * history explains the silence the same way.
 */
function fireWatchJob(jobId: string): void {
  const job = jobs.find(j => j.id === jobId)
  if (!job || !job.enabled || pausedAll) return
  if (running.has(job.id)) return
  const now = Date.now()

  // The concurrency rail. A due occurrence waits on the ticker for a free slot;
  // a file-system event has already happened, and holding it would replay a
  // burst of changes long after they were made. The event is dropped instead —
  // the same coalescing rule the debounce window follows — and the next change
  // re-opens the question.
  if (running.size >= AUTOMATION_LIMITS.maxConcurrentRuns) {
    log.warn(
      `Automation "${job.name}" watch event dropped — ${running.size} runs already in flight`,
    )
    return
  }

  if (!hasHourlyCapacity(job, now)) {
    // Same shape as the tick's runaway guard: a skip record, no attempt, no
    // spend, the streak untouched. There is no occurrence to advance — the
    // job has no calendar — so the record's time is the event itself.
    job.lastRunAt = now
    job.lastStatus = 'skipped'
    job.lastError = 'hourly_limit'
    job.lastRunLate = false
    job.lastUsage = undefined
    job.history = appendRunRecord(job.history, createSkipRecord(now, 'hourly_limit'))
    persistAndBroadcast()
    log.warn(
      `Automation "${job.name}" watch run skipped — more than `
      + `${AUTOMATION_LIMITS.maxRunsPerHour} runs this hour`,
    )
    return
  }

  // `late` stays false: a watch run is by definition on time, the file changed
  // now. `watch` is what puts it under the unattended spend rails.
  void startRun(job, { manual: false, late: false, watch: true })
}

// ── Tick ─────────────────────────────────────────────

function tick(): void {
  if (!ctx) return
  // Global pause: return before touching any job. Scheduled work (occurrences
  // and pending retries) is suspended, but each job keeps its own `enabled`
  // flag and its frozen `nextRunAt`, so resuming is a schedule recalculation
  // rather than a restore. Manual runs do not come through this ticker, and a
  // run already in flight is never aborted by pausing.
  if (pausedAll) return
  const appStartedAt = ctx.startedAt
  const now = Date.now()
  let dirty = false

  for (const job of jobs) {
    if (!job.enabled) continue
    // A watch job's `nextRunAt` is null for life by design, and the watcher —
    // not this ticker — is what starts it. Falling through would make it look
    // like a dead cron and disable it on the very first tick.
    if (job.trigger.kind === 'watch') continue
    if (running.has(job.id)) continue

    // A pending retry is a bounded wait owned by this one ticker. Expire it
    // first: once the next regular occurrence has arrived, running both would
    // be a burst, and a retry left over from days ago must never fire now.
    if (job.pendingRetry && isPendingRetryExpired(job.pendingRetry, now)) {
      log.info(
        `Automation "${job.name}" dropped stale retry ${job.pendingRetry.attempt} — `
        + 'the next scheduled occurrence has arrived',
      )
      job.pendingRetry = undefined
      dirty = true
    }

    if (job.pendingRetry && now >= job.pendingRetry.dueAt) {
      // Global slot limit: leave the retry due rather than skipping it, exactly
      // like a due occurrence, so it runs when a slot frees.
      if (running.size >= AUTOMATION_LIMITS.maxConcurrentRuns) break
      const retry = job.pendingRetry
      if (!hasHourlyCapacity(job, now)) {
        // A retry is a scheduled run, so the runaway guard applies. Resolve the
        // wait with a skip record: leaving it pending would re-check every tick
        // and never terminate.
        job.pendingRetry = undefined
        job.lastRunAt = retry.dueAt
        job.lastStatus = 'skipped'
        job.lastError = 'hourly_limit'
        job.lastRunLate = false
        job.lastUsage = undefined
        job.history = appendRunRecord(
          job.history,
          createSkipRecord(retry.dueAt, 'hourly_limit', retry.attempt),
        )
        dirty = true
        log.warn(
          `Automation "${job.name}" retry ${retry.attempt} skipped — more than `
          + `${AUTOMATION_LIMITS.maxRunsPerHour} runs this hour`,
        )
        continue
      }
      // Cleared before the run so a crash cannot replay the same attempt; a
      // failed outcome schedules its successor once the result is known.
      job.pendingRetry = undefined
      // `late` stays false: it describes a missed cron occurrence, while the
      // record's `retry` number already says why this run happened off-cadence.
      void startRun(job, { manual: false, late: false, retryAttempt: retry.attempt })
      continue
    }

    if (job.nextRunAt === null) {
      const next = nextRunAfter(job.trigger, now)
      if (next === null) {
        job.enabled = false
        job.pendingRetry = undefined
        job.lastStatus = 'error'
        job.lastError = 'cron_invalid'
        dirty = true
      } else {
        job.nextRunAt = next
        dirty = true
      }
      continue
    }
    if (job.nextRunAt > now) continue

    // A closed-app miss the job asked to skip. Checked before the slot rail
    // because a skip needs no run slot, and after the retry branch above because
    // a pending retry is a separate occurrence. The predicate requires the
    // occurrence to predate this process, so a job that came due while AIPA was
    // open but could not start (all slots busy) is not skipped — it still runs
    // late once a slot frees, exactly as before.
    if (shouldSkipMissedRun({
      policy: job.missedRunPolicy,
      nextRunAt: job.nextRunAt,
      appStartedAt,
      now,
      graceMs: MISSED_RUN_GRACE_MS,
    })) {
      const missedAt = job.nextRunAt
      job.lastRunAt = missedAt
      job.lastStatus = 'skipped'
      job.lastError = 'missed_while_closed'
      // Nothing ran, so this is not a late run; the error code carries the
      // truth and `createSkipRecord` keeps the record spendless and sessionless.
      job.lastRunLate = false
      job.lastUsage = undefined
      job.history = appendRunRecord(
        job.history,
        createSkipRecord(missedAt, 'missed_while_closed'),
      )
      job.nextRunAt = nextRunAfter(job.trigger, now)
      dirty = true
      log.warn(
        `Automation "${job.name}" skipped its ${new Date(missedAt).toISOString()} occurrence — `
        + 'it came due while AIPA was closed',
      )
      continue
    }

    // Global slot limit: leave the job due rather than skipping it, so it runs
    // as soon as a slot frees instead of waiting a whole interval.
    if (running.size >= AUTOMATION_LIMITS.maxConcurrentRuns) break

    if (!hasHourlyCapacity(job, now)) {
      // Runaway guard. Advance the schedule so the job does not re-check every
      // tick, and record the skip without counting it as a run.
      const skippedAt = job.nextRunAt
      job.lastRunAt = skippedAt
      job.lastStatus = 'skipped'
      job.lastError = 'hourly_limit'
      job.lastRunLate = false
      job.lastUsage = undefined
      // Kept in history so the gap is explainable, but it is not an attempt:
      // the streak ignores it and the record carries no spend or session.
      job.history = appendRunRecord(job.history, createSkipRecord(skippedAt, 'hourly_limit'))
      job.nextRunAt = nextRunAfter(job.trigger, now)
      dirty = true
      log.warn(`Automation "${job.name}" skipped — more than ${AUTOMATION_LIMITS.maxRunsPerHour} runs this hour`)
      continue
    }

    const late = now - job.nextRunAt > LATE_THRESHOLD_MS
    void startRun(job, { manual: false, late })
  }

  if (dirty) persistAndBroadcast()
}

// ── Public API ───────────────────────────────────────

export function startAutomationScheduler(
  getWindow: () => BrowserWindow | null,
  send: (channel: string, ...args: unknown[]) => void,
  run: (req: AutomationRunRequest) => Promise<AutomationRunOutcome>,
): void {
  if (ctx) return
  // One launch stamp for the whole process lifetime. The tick compares a due
  // occurrence against it to tell "missed while AIPA was closed" from "due
  // while it was open but waiting".
  const startedAt = Date.now()
  ctx = { getWindow, notifyChanged: () => send('automation:changed'), run, startedAt }

  const store = readAutomationStore()
  jobs = store.jobs
  pausedAll = store.pausedAll
  globalDailyCostLimitUsd = store.globalDailyCostLimitUsd
  const now = startedAt
  let repaired = false
  for (const job of jobs) {
    // A persisted `running` belongs to a process that no longer exists.
    if (job.lastStatus === 'running') {
      job.lastStatus = 'error'
      job.lastError = 'interrupted'
      // The interrupted run never wrote a usage figure; an older run's would be
      // read as this failed run's spend.
      job.lastUsage = undefined
      // Recover the attempt from the last recorded start so it stays in history
      // (and in the failure streak) instead of vanishing. `lastRunAt` still
      // names the previous completed run, so it must not be reused here.
      const interruptedAt = job.recentRuns[job.recentRuns.length - 1]
      const newest = job.history[job.history.length - 1]
      if (interruptedAt !== undefined && interruptedAt !== newest?.startedAt) {
        job.history = appendRunRecord(job.history, {
          startedAt: interruptedAt,
          status: 'error',
          durationMs: null,
          sessionId: null,
          error: 'interrupted',
          late: false,
        })
      }
      repaired = true
    }
    // Due-while-closed jobs keep their past nextRunAt: the first tick runs them
    // once and flags them late. A watch job is skipped: it is meant to have no
    // next run, and computing one would defeat the whole trigger kind.
    if (job.enabled && job.nextRunAt === null && job.trigger.kind !== 'watch') {
      const next = nextRunAfter(job.trigger, now)
      if (next !== null) {
        job.nextRunAt = next
        repaired = true
      }
    }
    if (!job.enabled && job.nextRunAt !== null) {
      job.nextRunAt = null
      repaired = true
    }
  }
  if (repaired) persist()

  // Attach watchers before the first tick: a watch job enabled at launch must
  // start listening at launch, not on the first store mutation.
  syncWatchers()

  tick()
  timer = setInterval(tick, CHECK_INTERVAL_MS)
  // Never keep the process alive just to check a clock.
  timer.unref()
  log.info(`Automation scheduler started (${jobs.length} job(s))`)
}

export function listAutomationJobs(): { jobs: AutomationJobView[]; limits: AutomationLimits } {
  return {
    jobs: jobs.map(toView),
    // The pause and the global cap are dynamic state, not constants, so they are
    // merged in here rather than added to `AUTOMATION_LIMITS`. The spend snapshot
    // is derived from this same `jobs` array at call time, so the settings
    // readout and the rows it sits beside can never disagree.
    limits: {
      ...AUTOMATION_LIMITS,
      pausedAll,
      ...(globalDailyCostLimitUsd !== undefined ? { globalDailyCostLimitUsd } : {}),
      globalSpend: summarizeGlobalSpendWindow(jobs, Date.now(), globalDailyCostLimitUsd),
    },
  }
}

/** How many upcoming occurrences the dialog previews. */
const PREVIEW_RUN_COUNT = 3

export type AutomationSchedulePreview =
  | { ok: true; runs: number[] }
  | { ok: false; error: string }

/**
 * What a trigger would actually do if it were saved right now.
 *
 * Read-only: it runs the same validation and the same next-run maths a saved job
 * would, and touches neither the job list nor the store. That is the whole point
 * — a cron that parses but never fires (31 February) must be refused here with
 * the same stable code save would use, instead of looking fine until the job
 * silently never runs.
 *
 * Fewer than three times is an answer, not an error. A valid but rare schedule
 * may have only one or two occurrences inside the window the cron evaluator
 * searches, and a schedule with none left returns an empty list; nothing is
 * invented to fill the line.
 */
export function previewAutomationSchedule(trigger: AutomationTrigger): AutomationSchedulePreview {
  try {
    // A file has no calendar. Answered before validation so even a half-typed
    // watch path reads as "not applicable" rather than a path error the preview
    // could never fix.
    if (trigger && typeof trigger === 'object' && trigger.kind === 'watch') {
      return { ok: false, error: 'not_applicable' }
    }
    const validated = validateTrigger(trigger)
    const runs: number[] = []
    // "Now" rather than a caller-supplied instant: the dialog asks about the
    // schedule it is about to save, and saving starts the clock from now.
    let cursor = Date.now()
    for (let i = 0; i < PREVIEW_RUN_COUNT; i += 1) {
      const next = nextRunAfter(validated, cursor)
      if (next === null) break
      // A next-run function that hands back the same instant twice must not be
      // asked again: without this the collection loop would repeat forever and
      // the IPC call would never answer. What was collected so far is the honest
      // result.
      if (next <= cursor) break
      runs.push(next)
      cursor = next
    }
    return { ok: true, runs }
  } catch (err) {
    return { ok: false, error: errorCode(err) }
  }
}

export type AutomationMutationResult =
  | { ok: true; job: AutomationJobView }
  | { ok: false; error: string }

export function createAutomationJob(input: AutomationInput): AutomationMutationResult {
  return createJob(input)
}

/**
 * Create a job owned by a plugin.
 *
 * The renderer-facing `createAutomationJob` above never sets `originPluginId`,
 * and this is the only function that does: ownership has to be recorded by the
 * layer that verified the plugin's `schedule` permission, never read off the
 * input. A job's fields are otherwise identical to a user-made one — there is
 * deliberately no "plugin job" mode in the scheduler, so every rail (hourly
 * cap, spend limits, global pause, retries, history, memory digest) applies to
 * it exactly as it would to a job the user typed in Settings.
 */
export function createAutomationJobForPlugin(
  pluginId: string,
  input: AutomationInput,
): AutomationMutationResult {
  if (typeof pluginId !== 'string' || !pluginId.trim()) {
    return { ok: false, error: 'plugin_unknown' }
  }
  return createJob(input, pluginId.trim())
}

/** Ids only need to be unique inside one store; the timestamp keeps them sortable. */
function makeJobId(now: number): string {
  return `auto-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function createJob(input: AutomationInput, originPluginId?: string): AutomationMutationResult {
  try {
    if (jobs.length >= AUTOMATION_LIMITS.maxJobs) throw new AutomationInputError('too_many_jobs')
    const now = Date.now()
    const name = validateName(input?.name)
    const trigger = validateTrigger(input?.trigger)
    const action = validateAction(input?.action)
    const personaId = validatePersonaId(input?.personaId)
    const quietOnSuccess = validateQuietOnSuccess(input?.quietOnSuccess)
    const retryOnFailure = validateRetryOnFailure(input?.retryOnFailure)
    const missedRunPolicy = validateMissedRunPolicy(input?.missedRunPolicy)
    const dailyCostLimitUsd = validateDailyCostLimit(input?.dailyCostLimitUsd)
    const enabled = input?.enabled !== false
    const job: AutomationJob = {
      id: makeJobId(now),
      name,
      enabled,
      trigger,
      action,
      ...(personaId ? { personaId } : {}),
      ...(quietOnSuccess ? { quietOnSuccess } : {}),
      ...(retryOnFailure ? { retryOnFailure } : {}),
      ...(missedRunPolicy ? { missedRunPolicy } : {}),
      ...(dailyCostLimitUsd !== undefined ? { dailyCostLimitUsd } : {}),
      ...(originPluginId ? { originPluginId } : {}),
      createdAt: now,
      updatedAt: now,
      nextRunAt: enabled ? nextRunAfter(trigger, now) : null,
      lastRunAt: null,
      lastStatus: null,
      lastError: null,
      lastSessionId: null,
      lastRunLate: false,
      lastDurationMs: null,
      runCount: 0,
      recentRuns: [],
      history: [],
    }
    jobs.push(job)
    // Before the broadcast, so the view a listener reads already knows whether
    // this watch job's path could be attached.
    syncWatchers()
    persistAndBroadcast()
    log.info(`Automation "${name}" created`)
    return { ok: true, job: toView(job) }
  } catch (err) {
    return { ok: false, error: errorCode(err) }
  }
}

/**
 * The name a duplicate gets when the caller did not choose one.
 *
 * The suffix is what identifies the copy, so it is never clipped; the original
 * name loses characters instead. It also never stacks: a copy of a copy becomes
 * "x (copy 2)", then "x (copy 3)", rather than "x (copy) (copy)".
 */
const COPY_SUFFIX = / \(copy(?: (\d+))?\)$/

function copyNameFor(sourceName: string): string {
  const match = COPY_SUFFIX.exec(sourceName)
  const base = match ? sourceName.slice(0, match.index) : sourceName
  // "(copy)" is the first copy, "(copy 2)" the second; a hand-edited number is
  // kept as the starting point rather than reset.
  const next = match ? (match[1] ? Number(match[1]) + 1 : 2) : 1
  const suffix = next === 1 ? ' (copy)' : ` (copy ${next})`
  const room = MAX_NAME_CHARS - suffix.length
  const head = base.length > room ? base.slice(0, room).trimEnd() : base
  // `base` cannot be empty for a valid stored name (names are trimmed, and the
  // pattern needs a leading space), so the suffix always has something to
  // attach to without inventing a name.
  return `${head}${suffix}`
}

/**
 * Create a switched-off copy of an existing job.
 *
 * The copy carries the *configuration* and nothing that happened: history,
 * last-run state, the pending retry and the plugin origin are all new-job
 * defaults. In particular it starts disabled — duplicating a 03:00 job must not
 * silently give the user two of them — and it is not a paused job, it is simply
 * off until the user reviews it and turns it on.
 *
 * The trigger and action are copied as stored rather than re-validated: a job
 * whose workflow or watched folder was deleted must still be duplicable, and
 * the view flags the copy (`actionMissing` / `watchMissing`) exactly as it flags
 * the original. `originPluginId` is deliberately absent: a job the user creates
 * is the user's, even when the original was made by a plugin.
 */
export function cloneAutomationJob(id: string, name?: string): AutomationMutationResult {
  const source = jobs.find(j => j.id === id)
  if (!source) return { ok: false, error: 'not_found' }
  try {
    if (jobs.length >= AUTOMATION_LIMITS.maxJobs) throw new AutomationInputError('too_many_jobs')
    const now = Date.now()
    // An explicit name is held to the same rule as any other name; an empty one
    // is "not provided" so the generated copy name applies.
    const explicitName = typeof name === 'string' ? name.trim() : ''
    const job: AutomationJob = {
      id: makeJobId(now),
      name: explicitName ? validateName(explicitName) : copyNameFor(source.name),
      enabled: false,
      trigger: { ...source.trigger },
      action: { ...source.action },
      // Assignment is conditional so a field the original never set stays
      // absent rather than becoming an explicit false/empty override.
      ...(source.personaId ? { personaId: source.personaId } : {}),
      ...(source.quietOnSuccess === true ? { quietOnSuccess: true } : {}),
      ...(source.retryOnFailure === true ? { retryOnFailure: true } : {}),
      ...(source.missedRunPolicy === 'skip' ? { missedRunPolicy: 'skip' } : {}),
      ...(source.dailyCostLimitUsd !== undefined
        ? { dailyCostLimitUsd: source.dailyCostLimitUsd }
        : {}),
      createdAt: now,
      updatedAt: now,
      // Off means no calendar: a nextRunAt here would make the ticker run a job
      // the user has not reviewed yet.
      nextRunAt: null,
      lastRunAt: null,
      lastStatus: null,
      lastError: null,
      lastSessionId: null,
      lastRunLate: false,
      lastDurationMs: null,
      runCount: 0,
      recentRuns: [],
      history: [],
    }
    jobs.push(job)
    // Same contract as every other mutation: re-align watchers before the
    // broadcast. A disabled watch copy will not attach, which is the point.
    syncWatchers()
    persistAndBroadcast()
    log.info(`Automation "${job.name}" created as a copy of "${source.name}" (off)`)
    return { ok: true, job: toView(job) }
  } catch (err) {
    return { ok: false, error: errorCode(err) }
  }
}

export function updateAutomationJob(id: string, input: AutomationInput): AutomationMutationResult {
  const job = jobs.find(j => j.id === id)
  if (!job) return { ok: false, error: 'not_found' }
  try {
    const name = validateName(input?.name)
    const trigger = validateTrigger(input?.trigger)
    const action = validateAction(input?.action)
    const personaId = validatePersonaId(input?.personaId)
    const quietOnSuccess = validateQuietOnSuccess(input?.quietOnSuccess)
    const retryOnFailure = validateRetryOnFailure(input?.retryOnFailure)
    const missedRunPolicy = validateMissedRunPolicy(input?.missedRunPolicy)
    const dailyCostLimitUsd = validateDailyCostLimit(input?.dailyCostLimitUsd)
    const enabled = input?.enabled !== false

    const previousTrigger = JSON.stringify(job.trigger)
    const triggerChanged = JSON.stringify(trigger) !== previousTrigger
    const wasEnabled = job.enabled
    job.name = name
    job.trigger = trigger
    job.action = action
    // Assignment (not omission) is deliberate: clearing the field must remove a
    // previous override, falling back to the workflow binding.
    job.personaId = personaId
    // Turning quiet mode off removes the field instead of storing `false`: the
    // default is "announce", and an absent flag keeps a legacy job reading
    // exactly as it did before this setting existed.
    job.quietOnSuccess = quietOnSuccess
    // Same rule for retries: absent means "never retry", which spends nothing.
    job.retryOnFailure = retryOnFailure
    // Same opt-in shape: switching back to "run" removes the field, so the job
    // reads exactly like one that never made the choice.
    job.missedRunPolicy = missedRunPolicy
    // Same rule for the spend rail: an empty field removes the limit rather than
    // storing 0, which would block every scheduled run forever.
    job.dailyCostLimitUsd = dailyCostLimitUsd
    job.enabled = enabled
    job.updatedAt = Date.now()
    // A pending retry belongs to the old schedule/policy. A schedule change,
    // disabling the job, or turning retries off must not let it fire under the
    // new settings.
    if (!enabled || triggerChanged || !retryOnFailure) job.pendingRetry = undefined
    // Keep the existing schedule unless it is genuinely invalidated — renaming
    // a job should not push its next run a full interval into the future.
    if (!enabled) job.nextRunAt = null
    else if (triggerChanged || !wasEnabled) {
      job.nextRunAt = nextRunAfter(trigger, job.updatedAt)
    }
    // Path, recursion, debounce or `enabled` may all have changed; one sync
    // closes what no longer matches and attaches what does.
    syncWatchers()
    persistAndBroadcast()
    return { ok: true, job: toView(job) }
  } catch (err) {
    return { ok: false, error: errorCode(err) }
  }
}

export function deleteAutomationJob(id: string): { ok: boolean; error?: string } {
  const index = jobs.findIndex(j => j.id === id)
  if (index < 0) return { ok: false, error: 'not_found' }
  if (running.has(id)) abortAutomationRun(id)
  jobs.splice(index, 1)
  // A deleted job must stop watching immediately; its watcher has no owner left
  // to fire into.
  syncWatchers()
  persistAndBroadcast()
  return { ok: true }
}

/**
 * Every job a plugin created, and only those.
 *
 * Filtered on the recorded `originPluginId` rather than on anything the caller
 * supplies or on the job's shape. A job the user made — even one that looks
 * exactly like a plugin's — is never returned here, and a plugin's job stays
 * visible to it after the user edits it, because the user editing the schedule
 * does not change who created it.
 */
export function listAutomationJobsForPlugin(pluginId: string): AutomationJobView[] {
  return jobs.filter(job => job.originPluginId === pluginId).map(toView)
}

/**
 * Delete a job a plugin created.
 *
 * The ownership check and the removal happen in the same synchronous step, so a
 * rename, a second plugin, or a user action cannot slip in between them. A
 * job that exists but belongs to the user or to another plugin is `not_owned`
 * rather than `not_found`: the plugin is not told whether someone else's job
 * with that id exists.
 */
export function deleteAutomationJobForPlugin(
  pluginId: string,
  id: string,
): { ok: boolean; error?: string } {
  const job = jobs.find(j => j.id === id)
  if (!job) return { ok: false, error: 'not_found' }
  if (job.originPluginId !== pluginId) return { ok: false, error: 'not_owned' }
  return deleteAutomationJob(id)
}

export function setAutomationEnabled(id: string, enabled: boolean): AutomationMutationResult {
  const job = jobs.find(j => j.id === id)
  if (!job) return { ok: false, error: 'not_found' }
  job.enabled = !!enabled
  job.updatedAt = Date.now()
  // Re-enabling starts a fresh schedule; an old nextRunAt would fire at once.
  job.nextRunAt = job.enabled ? nextRunAfter(job.trigger, job.updatedAt) : null
  // A job that is off must not keep a retry waiting; turning it back on is a
  // fresh start, not a resumption of the old failure.
  if (!job.enabled) job.pendingRetry = undefined
  syncWatchers()
  persistAndBroadcast()
  return { ok: true, job: toView(job) }
}

export type AutomationPauseResult =
  | { ok: true; pausedAll: boolean }
  | { ok: false; error: string }

/**
 * Suspend or resume every scheduled run.
 *
 * This is deliberately not "disable every job": each job keeps its own
 * `enabled` flag and schedule state, so resuming restores exactly what was on.
 * While paused, `tick` returns before doing anything; manual runs still start
 * (the user is present and asking), and a run already in flight finishes
 * rather than being aborted mid-way.
 *
 * Schedule semantics. `nextRunAt` is frozen while paused — it is not rewritten
 * on every tick, because a pause may last days and moving it continuously
 * would make the row promise a run that cannot happen. On resume, an
 * occurrence that fell inside the pause is recomputed from "now": a long pause
 * therefore skips its missed occurrences instead of running them late, so
 * there is no catch-up burst and nothing is flagged "ran late" (the existing
 * late-run rule only sees a due job on a tick, and the tick never sees one for
 * this gap). An occurrence still in the future is kept as-is, so a short pause
 * does not push the cadence back. Pending retries are dropped on pause: they
 * are scheduled work, and resuming must not replay an old failure.
 */
export function setAutomationPausedAll(paused: boolean): AutomationPauseResult {
  const next = paused === true
  if (next === pausedAll) return { ok: true, pausedAll }
  pausedAll = next
  const now = Date.now()

  if (pausedAll) {
    // A retry belongs to a failed occurrence and waits on this same ticker.
    // Holding it across the pause would either expire silently or fire right
    // after resume, which is exactly the burst the schedule recalculation
    // below exists to avoid.
    for (const job of jobs) {
      if (job.pendingRetry) job.pendingRetry = undefined
    }
  } else {
    for (const job of jobs) {
      if (!job.enabled) continue
      // A watch job has nothing to recalculate on resume: its watcher stayed
      // attached through the pause (it was the fire decision that consulted
      // `pausedAll`), and its `nextRunAt` is meant to be null. Treating that
      // null as a dead cron is what this loop does for clock jobs.
      if (job.trigger.kind === 'watch') continue
      // Keep an occurrence that is still ahead; only what the pause swallowed
      // needs a new time.
      if (job.nextRunAt !== null && job.nextRunAt > now) continue
      const nextRun = nextRunAfter(job.trigger, now)
      if (nextRun === null) {
        // Same dead-cron outcome the tick applies: an enabled job that can
        // never fire must not stay silently enabled.
        job.enabled = false
        job.nextRunAt = null
        job.lastStatus = 'error'
        job.lastError = 'cron_invalid'
      } else {
        job.nextRunAt = nextRun
      }
    }
  }

  // The watchers stay attached across the pause (a fire is suppressed by the
  // decision, not by detaching), but a sync here retries any attach that failed
  // before the pause and keeps the contract "every mutation re-aligns".
  syncWatchers()
  persistAndBroadcast()
  log.info(`Automation scheduler ${pausedAll ? 'paused' : 'resumed'} (${jobs.length} job(s))`)
  return { ok: true, pausedAll }
}

export type AutomationGlobalBudgetResult =
  | { ok: true; globalDailyCostLimitUsd?: number; changed: boolean }
  | { ok: false; error: string }

/**
 * Set or clear the daily budget that covers every job together.
 *
 * `null` clears it. An unusable number is an error rather than a silent "no
 * cap", because a typo must not quietly remove the rail the user asked for —
 * the same rule as the per-job field. A value equal to the stored one is a
 * no-op: no write and no `automation:changed` broadcast, so a settings page that
 * saves without editing does not make every automation surface refresh.
 */
export function setAutomationGlobalBudget(limitUsd: number | null): AutomationGlobalBudgetResult {
  let next: number | undefined
  if (limitUsd !== null) {
    try {
      next = validateDailyCostLimit(limitUsd)
    } catch (err) {
      return { ok: false, error: errorCode(err) }
    }
  }
  if (next === globalDailyCostLimitUsd) {
    return {
      ok: true,
      ...(next !== undefined ? { globalDailyCostLimitUsd: next } : {}),
      changed: false,
    }
  }
  globalDailyCostLimitUsd = next
  persistAndBroadcast()
  log.info(`Automation daily budget ${next !== undefined ? `set to ${next} USD` : 'cleared'}`)
  return {
    ok: true,
    ...(next !== undefined ? { globalDailyCostLimitUsd: next } : {}),
    changed: true,
  }
}

/**
 * "Run now" is an explicit user gesture: it ignores `enabled`, the global
 * pause, the hourly cap, the spend limit, and the global daily budget, but not
 * the concurrency rail — an in-flight run still owns the job, and hidden
 * background work must never queue up behind a click.
 */
export function runAutomationNow(id: string): AutomationMutationResult {
  const job = jobs.find(j => j.id === id)
  if (!job) return { ok: false, error: 'not_found' }
  if (running.has(id)) return { ok: false, error: 'already_running' }
  if (running.size >= AUTOMATION_LIMITS.maxConcurrentRuns) return { ok: false, error: 'too_many_running' }
  void startRun(job, { manual: true, late: false })
  return { ok: true, job: toView(job) }
}

/** Stop the ticker and close every watcher (tests and shutdown). */
export function stopAutomationScheduler(): void {
  if (timer) clearInterval(timer)
  timer = null
  // Watchers hold OS handles; without this a restart in the same process (or a
  // harness) would leave stale listeners firing into a dead scheduler.
  stopWatchers()
  ctx = null
}
