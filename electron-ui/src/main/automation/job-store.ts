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
import { normalizeRunHistory } from './run-history'
import { normalizeCost, normalizeRunUsage, normalizeTokenCount } from './run-usage'
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
  const recentRuns = Array.isArray(job.recentRuns)
    ? job.recentRuns.filter((t): t is number => typeof t === 'number' && Number.isFinite(t)).slice(-24)
    : []

  return {
    id: job.id,
    name: job.name.trim(),
    enabled: job.enabled !== false,
    trigger: job.trigger,
    action: job.action,
    // Absent and '' both mean "follow the workflow"; only a real id is kept,
    // so a job can never be persisted as "a persona called ''".
    personaId: typeof job.personaId === 'string' && job.personaId.trim()
      ? job.personaId.trim()
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
    runCount: typeof job.runCount === 'number' && job.runCount >= 0 ? Math.floor(job.runCount) : 0,
    recentRuns,
    // This whitelist is why every new field needs a line here: a job saved with
    // history but read back without it would lose its older-run origins and
    // its failure streak on the next launch.
    history: normalizeRunHistory(job.history),
  }
}

export function readAutomationJobs(): AutomationJob[] {
  const file = getStorePath()
  if (!fs.existsSync(file)) return []
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>
    const list = Array.isArray(parsed.jobs) ? parsed.jobs : []
    return list
      .map(normalizeJob)
      .filter((job): job is AutomationJob => job !== null)
  } catch (err) {
    // A corrupt file must not stop the app; keep it on disk for inspection and
    // start from an empty list (the next save rewrites it).
    log.warn('Could not read automations.json:', err)
    return []
  }
}

export function writeAutomationJobs(jobs: AutomationJob[]): void {
  const file = getStorePath()
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify({ version: STORE_VERSION, jobs }, null, 2), 'utf-8')
    fs.renameSync(tmp, file)
  } catch (err) {
    log.warn('Could not write automations.json:', err)
  }
}
