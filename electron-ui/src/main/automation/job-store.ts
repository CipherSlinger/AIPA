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
import { normalizeDeptBudgets } from './dept-budget'
import { normalizeDepartmentId } from './job-department'
import { normalizeJobProvenance } from './job-provenance'
import { normalizeMissedRunPolicy } from './missed-policy'
import { normalizePendingRetry } from './retry-policy'
import { normalizeRunHistory } from './run-history'
import { normalizeCost, normalizeRunUsage, normalizeTokenCount } from './run-usage'
import { normalizeDailyCostLimit } from './spend-guard'
import { normalizeWatchDebounceMinutes } from './watcher'
import type {
  AutomationAction,
  AutomationDeptBudget,
  AutomationJob,
  AutomationRunStatus,
  AutomationTrigger,
} from './types'

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
  if (trigger.kind === 'watch') {
    // The same shape the create/update path enforces: a hand-edited file must
    // not smuggle in a relative path, which the watcher would resolve against
    // an unrelated cwd. Defaults are filled by `normalizeTrigger` below.
    return typeof trigger.path === 'string' &&
      path.isAbsolute(trigger.path.trim()) &&
      (trigger.recursive === undefined || typeof trigger.recursive === 'boolean') &&
      (trigger.debounceMinutes === undefined ||
        (typeof trigger.debounceMinutes === 'number' && Number.isFinite(trigger.debounceMinutes)))
  }
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

/**
 * A validated trigger with its defaults filled in.
 *
 * A watch trigger's optional fields are materialized here so the rest of the
 * main process (watcher, view, menu) never has to repeat "absent means true /
 * five minutes". This is a normalization, not a migration: the values are the
 * ones the create/update validation would have stored.
 */
function normalizeTrigger(trigger: AutomationTrigger): AutomationTrigger {
  if (trigger.kind !== 'watch') return trigger
  return {
    kind: 'watch',
    path: trigger.path.trim(),
    recursive: trigger.recursive !== false,
    debounceMinutes: normalizeWatchDebounceMinutes(trigger.debounceMinutes),
  }
}

/**
 * The single validator for a persisted job.
 *
 * Exported because the trash stores whole job records too, and a trashed row
 * must pass exactly the same whitelist a live one does — a second copy of these
 * checks would let the two disagree about what a job is.
 */
export function normalizeJob(raw: unknown): AutomationJob | null {
  if (!raw || typeof raw !== 'object') return null
  const job = raw as Record<string, unknown>
  if (typeof job.id !== 'string' || !job.id) return null
  if (typeof job.name !== 'string' || !job.name.trim()) return null
  if (!isTrigger(job.trigger) || !isAction(job.action)) return null
  const trigger = normalizeTrigger(job.trigger)

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
    trigger,
    action: job.action,
    // Absent and '' both mean "follow the workflow"; only a real id is kept,
    // so a job can never be persisted as "a persona called ''".
    personaId: typeof job.personaId === 'string' && job.personaId.trim()
      ? job.personaId.trim()
      : undefined,
    // An id only: the org tree is a renderer-side record, so a hand-edited or
    // synced file can only be checked for shape here. A malformed value is
    // dropped without discarding the job; a well-formed but unknown id is kept,
    // because only the renderer can tell whether it still resolves.
    departmentId: normalizeDepartmentId(job.departmentId),
    // Restored only when it was genuinely turned on. Absent is the default
    // (announce success), so a job saved before this field existed keeps
    // behaving exactly as it did.
    quietOnSuccess: job.quietOnSuccess === true ? true : undefined,
    // Default off: only a genuine opt-in is restored, so a job saved before
    // this setting existed can never start spending on retries after an update.
    retryOnFailure: retryOnFailure ? true : undefined,
    // Only a deliberate 'skip' is restored; absent, 'run' and a corrupt value
    // all read as the default catch-up behaviour, so a hand-edited file can
    // never silently drop a scheduled occurrence.
    missedRunPolicy: normalizeMissedRunPolicy(job.missedRunPolicy),
    // A disabled job or a job that no longer opted in must not carry a retry
    // into the next launch. A valid one is restored even when its due time has
    // passed (the first tick either runs it or expires it).
    pendingRetry: enabled && retryOnFailure
      ? normalizePendingRetry(job.pendingRetry)
      : undefined,
    // Plugin ownership is persisted state, not something to recompute from the
    // job's shape: the plugin list/delete paths trust exactly this value. Kept
    // only as a non-empty string, so a hand-edited file cannot leave a job
    // claiming an owner it never had (and an absent value stays absent, which
    // is what a user-made job is).
    originPluginId: typeof job.originPluginId === 'string' && job.originPluginId.trim()
      ? job.originPluginId.trim()
      : undefined,
    // Creation facts, restored independently: a hand-edited title drops only
    // the title, and a job with no usable provenance stays a job (no line is
    // shown) rather than being discarded on load.
    ...normalizeJobProvenance(job),
    createdAt: numberOrNull(job.createdAt) ?? Date.now(),
    updatedAt: numberOrNull(job.updatedAt) ?? Date.now(),
    // A watch job has no calendar at all. A stale or hand-edited `nextRunAt`
    // must never let the due-tick pick it up, so it is nulled on the way in.
    nextRunAt: trigger.kind === 'watch' ? null : numberOrNull(job.nextRunAt),
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
  /**
   * Daily spend caps on departments, one entry per capped org node.
   *
   * Same reasoning as `pausedAll` and the global cap: this is rail state read
   * by the scheduler for every unattended run, so it is written in the same
   * atomic file with the same jobs, not in renderer-owned prefs. Empty (or
   * absent, which read turns into an empty list) means no department is capped;
   * an unreadable entry is dropped rather than failing the whole store open
   * into "no caps" only for everyone else.
   */
  deptBudgets?: AutomationDeptBudget[]
}

export function readAutomationStore(): AutomationStore {
  const file = getStorePath()
  if (!fs.existsSync(file)) return { jobs: [], pausedAll: false, deptBudgets: [] }
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
      // Each entry is validated on its own: one corrupt cap is dropped and the
      // rest still hold. A missing or non-array value is simply no caps, never
      // a reason to refuse a scheduled run.
      deptBudgets: normalizeDeptBudgets(parsed.deptBudgets),
    }
  } catch (err) {
    // A corrupt file must not stop the app; keep it on disk for inspection and
    // start from an empty, unpaused, uncapped state (the next save rewrites it).
    log.warn('Could not read automations.json:', err)
    return { jobs: [], pausedAll: false, deptBudgets: [] }
  }
}

export function writeAutomationStore(store: AutomationStore): void {
  const file = getStorePath()
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    // Normalized again on the way out: the in-memory list is already valid, but
    // this is the one place a malformed value from any caller would reach disk,
    // and an omitted key keeps a store that never used caps byte-identical.
    const deptBudgets = normalizeDeptBudgets(store.deptBudgets)
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
        ...(deptBudgets.length > 0 ? { deptBudgets } : {}),
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
    ...(current.deptBudgets !== undefined ? { deptBudgets: current.deptBudgets } : {}),
  })
}
