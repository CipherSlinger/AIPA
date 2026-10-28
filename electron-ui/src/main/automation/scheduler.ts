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
 * cannot leave a burst of catch-up runs queued.
 */
import { app, BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as os from 'os'
import { getPref, getRawPref } from '../config/config-manager'
import { raiseAttention } from '../clawd-attention'
import { nextFireTime, parseCron } from '../utils/cron'
import { createLogger } from '../utils/logger'
import { getAllowedFsRoots, safePath } from '../utils/validate'
import { readAutomationJobs, writeAutomationJobs } from './job-store'
import { abortAutomationRun } from './runner'
import { workflowPrompts } from './workflow-plan'
import type { MainWorkflow, UiLocale } from './workflow-plan'
import type {
  AutomationAction,
  AutomationInput,
  AutomationJob,
  AutomationJobView,
  AutomationLimits,
  AutomationRunOutcome,
  AutomationRunRequest,
  AutomationTrigger,
} from './types'

const log = createLogger('automation-scheduler')

const CHECK_INTERVAL_MS = 15_000
/** A run this far past its scheduled minute is reported as late. */
const LATE_THRESHOLD_MS = 60_000
/** A single run (all prompts of a job) may not exceed this. */
const RUN_DEADLINE_MS = 30 * 60_000
const MAX_NAME_CHARS = 80
const MAX_PROMPT_CHARS = 4000
const MAX_REPORTED_RUNS = 24

export const AUTOMATION_LIMITS: AutomationLimits = {
  /** Anything faster turns the assistant into a runaway loop. */
  minIntervalMinutes: 5,
  maxRunsPerHour: 12,
  maxConcurrentRuns: 2,
  maxJobs: 50,
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
}

let ctx: SchedulerContext | null = null
let jobs: AutomationJob[] = []
const running = new Map<string, { startedAt: number }>()
let timer: NodeJS.Timeout | null = null

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
  return after + trigger.minutes * 60_000
}

function validateTrigger(value: AutomationTrigger): AutomationTrigger {
  if (!value || typeof value !== 'object') throw new AutomationInputError('trigger_invalid')
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
  writeAutomationJobs(jobs)
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

async function startRun(job: AutomationJob, opts: { manual: boolean; late: boolean }): Promise<void> {
  if (!ctx || running.has(job.id)) return
  const now = Date.now()
  const locale = resolveUiLanguage()

  const prompts = resolveActionPrompts(job.action, locale)
  const model = resolveModel()
  if (prompts === null) {
    // The workflow was deleted behind this job's back: stop retrying, and let
    // the row say why instead of failing every interval.
    job.enabled = false
    job.nextRunAt = null
    job.lastRunAt = now
    job.lastStatus = 'error'
    job.lastError = 'workflow_missing'
    job.lastSessionId = null
    job.lastRunLate = false
    job.lastDurationMs = null
    log.warn(`Automation "${job.name}" disabled — its workflow no longer exists`)
    persistAndBroadcast()
    return
  }
  if (prompts.length === 0) {
    job.lastRunAt = now
    job.lastStatus = 'error'
    job.lastError = 'nothing_to_run'
    if (!opts.manual) job.nextRunAt = nextRunAfter(job.trigger, now)
    persistAndBroadcast()
    return
  }

  const startedAt = now
  running.set(job.id, { startedAt })
  job.lastStatus = 'running'
  job.lastError = null
  job.runCount += 1
  job.recentRuns = [...job.recentRuns, startedAt]
    .filter(t => now - t < 3_600_000)
    .slice(-MAX_REPORTED_RUNS)
  if (!opts.manual) job.nextRunAt = nextRunAfter(job.trigger, now)
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
      deadline: startedAt + RUN_DEADLINE_MS,
    })
  } catch (err) {
    outcome = { ok: false, error: String(err) }
  }

  running.delete(job.id)
  job.lastRunAt = startedAt
  job.lastDurationMs = Date.now() - startedAt
  job.lastStatus = outcome.ok ? 'success' : 'error'
  job.lastError = outcome.ok ? null : (outcome.error || 'run_failed')
  job.lastSessionId = outcome.sessionId ?? null
  job.lastRunLate = opts.late
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

// ── Tick ─────────────────────────────────────────────

function tick(): void {
  if (!ctx) return
  const now = Date.now()
  let dirty = false

  for (const job of jobs) {
    if (!job.enabled) continue
    if (running.has(job.id)) continue

    if (job.nextRunAt === null) {
      const next = nextRunAfter(job.trigger, now)
      if (next === null) {
        job.enabled = false
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

    // Global slot limit: leave the job due rather than skipping it, so it runs
    // as soon as a slot frees instead of waiting a whole interval.
    if (running.size >= AUTOMATION_LIMITS.maxConcurrentRuns) break

    if (!hasHourlyCapacity(job, now)) {
      // Runaway guard. Advance the schedule so the job does not re-check every
      // tick, and record the skip without counting it as a run.
      job.lastRunAt = job.nextRunAt
      job.lastStatus = 'skipped'
      job.lastError = 'hourly_limit'
      job.lastRunLate = false
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
  ctx = { getWindow, notifyChanged: () => send('automation:changed'), run }

  jobs = readAutomationJobs()
  const now = Date.now()
  let repaired = false
  for (const job of jobs) {
    // A persisted `running` belongs to a process that no longer exists.
    if (job.lastStatus === 'running') {
      job.lastStatus = 'error'
      job.lastError = 'interrupted'
      repaired = true
    }
    // Due-while-closed jobs keep their past nextRunAt: the first tick runs them
    // once and flags them late.
    if (job.enabled && job.nextRunAt === null) {
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

  tick()
  timer = setInterval(tick, CHECK_INTERVAL_MS)
  // Never keep the process alive just to check a clock.
  timer.unref()
  log.info(`Automation scheduler started (${jobs.length} job(s))`)
}

export function listAutomationJobs(): { jobs: AutomationJobView[]; limits: AutomationLimits } {
  return { jobs: jobs.map(toView), limits: AUTOMATION_LIMITS }
}

export type AutomationMutationResult =
  | { ok: true; job: AutomationJobView }
  | { ok: false; error: string }

export function createAutomationJob(input: AutomationInput): AutomationMutationResult {
  try {
    if (jobs.length >= AUTOMATION_LIMITS.maxJobs) throw new AutomationInputError('too_many_jobs')
    const now = Date.now()
    const name = validateName(input?.name)
    const trigger = validateTrigger(input?.trigger)
    const action = validateAction(input?.action)
    const enabled = input?.enabled !== false
    const job: AutomationJob = {
      id: `auto-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      enabled,
      trigger,
      action,
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
    }
    jobs.push(job)
    persistAndBroadcast()
    log.info(`Automation "${name}" created`)
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
    const enabled = input?.enabled !== false

    const previousTrigger = JSON.stringify(job.trigger)
    const wasEnabled = job.enabled
    job.name = name
    job.trigger = trigger
    job.action = action
    job.enabled = enabled
    job.updatedAt = Date.now()
    // Keep the existing schedule unless it is genuinely invalidated — renaming
    // a job should not push its next run a full interval into the future.
    if (!enabled) job.nextRunAt = null
    else if (JSON.stringify(trigger) !== previousTrigger || !wasEnabled) {
      job.nextRunAt = nextRunAfter(trigger, job.updatedAt)
    }
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
  persistAndBroadcast()
  return { ok: true }
}

export function setAutomationEnabled(id: string, enabled: boolean): AutomationMutationResult {
  const job = jobs.find(j => j.id === id)
  if (!job) return { ok: false, error: 'not_found' }
  job.enabled = !!enabled
  job.updatedAt = Date.now()
  // Re-enabling starts a fresh schedule; an old nextRunAt would fire at once.
  job.nextRunAt = job.enabled ? nextRunAfter(job.trigger, job.updatedAt) : null
  persistAndBroadcast()
  return { ok: true, job: toView(job) }
}

/**
 * "Run now" is an explicit user gesture: it ignores `enabled` and the hourly
 * cap, but not the concurrency rail — an in-flight run still owns the job, and
 * hidden background work must never queue up behind a click.
 */
export function runAutomationNow(id: string): AutomationMutationResult {
  const job = jobs.find(j => j.id === id)
  if (!job) return { ok: false, error: 'not_found' }
  if (running.has(id)) return { ok: false, error: 'already_running' }
  if (running.size >= AUTOMATION_LIMITS.maxConcurrentRuns) return { ok: false, error: 'too_many_running' }
  void startRun(job, { manual: true, late: false })
  return { ok: true, job: toView(job) }
}

/** Stop the ticker (tests and shutdown). */
export function stopAutomationScheduler(): void {
  if (timer) clearInterval(timer)
  timer = null
  ctx = null
}
