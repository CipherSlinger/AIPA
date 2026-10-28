/**
 * Persistence for automation jobs.
 *
 * This is main-process-owned durable state, so it does not live in the shared
 * electron-store prefs: the renderer's Settings save loop writes every pref key
 * it loaded, and a scheduled status update landing mid-save would be
 * overwritten. A dedicated file under userData with an atomic rename keeps the
 * scheduler's writes independent of renderer traffic.
 */
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { createLogger } from '../utils/logger'
import { normalizePendingRetry } from './retry-policy'
import { normalizeRunHistory } from './run-history'
import { normalizeCost, normalizeRunUsage, normalizeTokenCount } from './run-usage'
import { normalizeDailyCostLimit } from './spend-guard'
import type { AutomationAction, AutomationJob, AutomationRunStatus, AutomationTrigger } from './types'

const log = createLogger('automation-store')

const STORE_VERSION = 1

function getStorePath(): string {
  return path.join(app.getPath('userData'), 'automations.json')
}

function isTrigger(value: unknown): value is AutomationTrigger {
  if (!value || typeof value !== 'object') return false
  const trigger = value as Record<string, unknown>
  if (trigger.kind === 'cron') return typeof trigger.expr === 'string' && trigger.expr.trim().length > 0
  if (trigger.kind === 'interval') return typeof trigger.minutes === 'number' && Number.isFinite(trigger.minutes)
  return false
}

function isAction(value: unknown): value is AutomationAction {
  if (!value || typeof value !== 'object') return false
  const action = value as Record<string, unknown>
  if (action.kind === 'workflow') return typeof action.workflowId === 'string' && action.workflowId.length > 0
  if (action.kind === 'prompt') {
    return typeof action.prompt === 'string' &&
      (action.cwd === undefined || typeof action.cwd === 'string')
  }
  return false
}

const STATUSES: AutomationRunStatus[] = ['success', 'error', 'skipped', 'running']

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeJob(raw: unknown): AutomationJob | null {
  if (!raw || typeof raw !== 'object') return null
  const job = raw as Record<string, unknown>
  if (typeof job.id !== 'string' || !job.id) return null
  if (typeof job.name !== 'string' || !job.name.trim()) return null
  if (!isTrigger(job.trigger) || !isAction(job.action)) return null

  const status = typeof job.lastStatus === 'string' && STATUSES.includes(job.lastStatus as AutomationRunStatus)
    ? job.lastStatus as AutomationRunStatus
    : null
  const enabled = job.enabled !== false
  const retryOnFailure = job.retryOnFailure === true
  const recentRuns = Array.isArray(job.recentRuns)
    ? job.recentRuns.filter((t): t is number => typeof t === 'number' && Number.isFinite(t)).slice(-24)
    : []

  return {
    id: job.id,
    name: job.name.trim(),
    enabled,
    trigger: job.trigger,
    action: job.action,
    // Absent and '' both mean "follow the workflow"; only a real id is kept,
    // so a job can never be persisted as "a persona called ''".
    personaId: typeof job.personaId === 'string' && job.personaId.trim()
      ? job.personaId.trim()
      : undefined,
    // Restored only when it was genuinely turned on. Absent is the default
    // (announce success), so a job saved before this field existed keeps
    // behaving exactly as it did.
    quietOnSuccess: job.quietOnSuccess === true ? true : undefined,
    // Default off: only a genuine opt-in is restored, so a job saved before
    // this setting existed can never start spending on retries after an update.
    retryOnFailure: retryOnFailure ? true : undefined,
    // A disabled job or a job that no longer opted in must not carry a retry
    // into the next launch. A valid one is restored even when its due time has
    // passed (the first tick either runs it or expires it).
    pendingRetry: enabled && retryOnFailure
      ? normalizePendingRetry(job.pendingRetry)
      : undefined,
    createdAt: numberOrNull(job.createdAt) ?? Date.now(),
    updatedAt: numberOrNull(job.updatedAt) ?? Date.now(),
    nextRunAt: numberOrNull(job.nextRunAt),
    lastRunAt: numberOrNull(job.lastRunAt),
    lastStatus: status,
    lastError: typeof job.lastError === 'string' ? job.lastError : null,
    lastSessionId: typeof job.lastSessionId === 'string' ? job.lastSessionId : null,
    lastRunLate: job.lastRunLate === true,
    lastDurationMs: numberOrNull(job.lastDurationMs),
    // Optional accounting: restore a valid record as-is, and leave a missing or
    // malformed one undefined. Writing 0 here would turn "the engine never
    // reported a cost" into "$0".
    lastUsage: normalizeRunUsage(job.lastUsage),
    totalTokens: normalizeTokenCount(job.totalTokens),
    totalCostUsd: normalizeCost(job.totalCostUsd),
    // Absent, not 0: a cleared limit must stay cleared after a restart, and 0
    // would mean every scheduled run is already over budget.
    dailyCostLimitUsd: normalizeDailyCostLimit(job.dailyCostLimitUsd),
    runCount: typeof job.runCount === 'number' && job.runCount >= 0 ? Math.floor(job.runCount) : 0,
    recentRuns,
    // This whitelist is why every new field needs a line here: a job saved with
    // history but read back without it would lose its older-run origins and
    // its failure streak on the next launch.
    history: normalizeRunHistory(job.history),
  }
}

/**
 * The whole durable automation state: the jobs plus the global pause.
 *
 * The pause lives beside `jobs` in this file rather than in renderer prefs
 * because the scheduler owns it: it is timing state read and written by the
 * same main-process loop as `nextRunAt`, and the renderer's pref save loop
 * writes every key it loaded, which would race a pause toggled from elsewhere.
 * A sibling key also keeps the per-job whitelist free of a flag that is not a
 * property of any one job.
 */
export interface AutomationStore {
  jobs: AutomationJob[]
  /** Global pause; false whenever the stored value is absent or malformed. */
  pausedAll: boolean
  /**
   * One daily spend cap for all jobs together, in USD. Like `pausedAll` this is
   * timing/rail state owned by the scheduler, not a property of any one job, so
   * it lives beside `jobs` rather than on a job. Absent means no cap; an
   * unusable stored value also reads as absent (never as a cap of 0, which would
   * refuse every run forever).
   */
  globalDailyCostLimitUsd?: number
}

export function readAutomationStore(): AutomationStore {
  const file = getStorePath()
  if (!fs.existsSync(file)) return { jobs: [], pausedAll: false }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>
    const list = Array.isArray(parsed.jobs) ? parsed.jobs : []
    const globalDailyCostLimitUsd = normalizeDailyCostLimit(parsed.globalDailyCostLimitUsd)
    return {
      jobs: list
        .map(normalizeJob)
        .filter((job): job is AutomationJob => job !== null),
      // Only a literal `true` pauses. An older file has no key at all, and a
      // hand-edited or half-written value must fail open: silently suspending
      // every job because of a malformed flag would be the worse outcome, and
      // the user would have no visible cause for the silence.
      pausedAll: parsed.pausedAll === true,
      // A negative number, a string, a typo above the maximum or a hand edit all
      // fail open to "no cap": the alternative is enforcing a number the user
      // never intended, and 0 in particular would block every scheduled run.
      ...(globalDailyCostLimitUsd !== undefined ? { globalDailyCostLimitUsd } : {}),
    }
  } catch (err) {
    // A corrupt file must not stop the app; keep it on disk for inspection and
    // start from an empty, unpaused state (the next save rewrites it).
    log.warn('Could not read automations.json:', err)
    return { jobs: [], pausedAll: false }
  }
}

export function writeAutomationStore(store: AutomationStore): void {
  const file = getStorePath()
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    fs.writeFileSync(
      tmp,
      JSON.stringify({
        version: STORE_VERSION,
        pausedAll: store.pausedAll === true,
        // Omitted, not `null` or `0`: "cleared" and "never set" must round-trip
        // as the same state, and both mean "no cap".
        ...(store.globalDailyCostLimitUsd !== undefined
          ? { globalDailyCostLimitUsd: store.globalDailyCostLimitUsd }
          : {}),
        jobs: store.jobs,
      }, null, 2),
      'utf-8',
    )
    fs.renameSync(tmp, file)
  } catch (err) {
    log.warn('Could not write automations.json:', err)
  }
}

/**
 * Read only the jobs, for consumers that have no opinion on the pause (the
 * session-origin resolver). Callers that render or change automation state
 * should read the whole store so the pause travels with the jobs.
 */
export function readAutomationJobs(): AutomationJob[] {
  return readAutomationStore().jobs
}

/**
 * Write only the jobs, preserving the global state it did not set.
 *
 * Kept for older harnesses and simple callers; the scheduler uses
 * `writeAutomationStore` so one atomic write carries every half of the state.
 * The pause and the global cap are read back rather than defaulted, or a simple
 * job write would silently clear both.
 */
export function writeAutomationJobs(jobs: AutomationJob[]): void {
  const current = readAutomationStore()
  writeAutomationStore({
    jobs,
    pausedAll: current.pausedAll,
    ...(current.globalDailyCostLimitUsd !== undefined
      ? { globalDailyCostLimitUsd: current.globalDailyCostLimitUsd }
      : {}),
  })
}
