// Scheduled-run activity owned by one org node and its subtree.
//
// The Brief used to say scheduled jobs could not be attributed at all. A job now
// records one `departmentId` (an org node id), so this module answers the only
// question that field can answer: which jobs name a node in scope, and which of
// their *recorded* runs started inside the Brief's existing window.
//
// This is React-free and pure, like `deptBrief.data.ts`, so every claim can be
// tested without a DOM. The rules that keep the figures honest:
//
//   * `departmentId` is the only attribution. `action.cwd` is never read as
//     ownership — a job filed here may run anywhere.
//   * A job without a department was saved before the field existed (or its
//     department was deleted); it is counted as unfiled/unknown, never guessed.
//   * Run counts come from the bounded `history` records, whose status carries
//     the outcome. `recentRuns` is a rate-limit ledger of start timestamps with
//     no outcome and is deliberately not counted.
//   * A skip is an occurrence, not a run: `runsInWindow` is success + error, and
//     skips are returned separately.
//   * The window bounds are the ones the Brief already computed, passed in
//     whole, so jobs and conversations describe the same span of time.
//
// Total over malformed input: non-arrays, missing ids, duplicate ids, unknown
// statuses and NaN timestamps degrade to fewer honest rows, never to an
// exception or a fabricated zero while the list is still loading.

import type {
  AutomationRunStatusData,
  AutomationTriggerData,
  AutomationWatchTriggerData,
} from '../../../preload'

/**
 * Mirrors main's `AUTOMATION_HISTORY_CAP`. The renderer cannot import main, so
 * the number is repeated here and disclosed in the panel's copy.
 */
export const AUTOMATION_HISTORY_CAP = 20

/** How many owned jobs the Brief lists; the full count is shown beside them. */
export const BRIEF_JOB_ROW_LIMIT = 5

/** `loading`/`error` come from the IPC read; `ready` means an answer arrived. */
export type DeptJobsLoad = 'loading' | 'ready' | 'error'

/**
 * `unreadable` is a `ready` read whose payload was not a job array. It is kept
 * distinct from an empty array so the panel never prints "0 jobs" for a shape
 * it could not understand.
 */
export type DeptJobsState = DeptJobsLoad | 'unreadable'

export type DeptRunStatus = 'success' | 'error' | 'skipped'

/** One recorded run, normalised down to the fields a window count and a hold use. */
export interface DeptRunRecord {
  startedAt: number
  status: DeptRunStatus
  /**
   * The structured reason a skip named, when the record carries one this build
   * understands. An unknown string is no structured reason, not a hold.
   */
  skipReason: 'dept-budget' | null
}

export interface DeptJobRow {
  id: string
  name: string
  /** Strictly true; a missing or non-boolean value is not evidence of "on". */
  enabled: boolean
  /** True when a global pause suspends this job's scheduled runs. */
  pausedAll: boolean
  /** The org node this job names; always non-empty for a row that exists. */
  departmentId: string
  /** Preserved for the shared "next run" sentence. */
  trigger: AutomationTriggerData
  nextRunAt: number | null
  lastRunAt: number | null
  lastStatus: AutomationRunStatusData | null
  /** The newest record's reason when it was a skip this build understands. */
  lastSkipReason: 'dept-budget' | null
  /**
   * The newest record is a skip held by the department's daily cap. It is not a
   * failure: nothing ran and nothing broke, so it must not be shown as an error.
   */
  lastHeld: boolean
  lastError: string | null
  running: boolean
  /** Successes recorded inside the passed window. */
  succeededInWindow: number
  /** Failures recorded inside the passed window. */
  failedInWindow: number
  /** Skipped occurrences inside the window; not included in `runsInWindow`. */
  skippedInWindow: number
  /** success + error inside the window. */
  runsInWindow: number
  /** Newest recorded start inside the window, any outcome; null when none. */
  latestWindowAt: number | null
  /** Newest recorded start at all, from `lastRunAt` or `history`; null if never. */
  latestRecordedAt: number | null
}

export interface DeptJobsCounts {
  /** Jobs whose departmentId is in scope. */
  total: number
  enabled: number
  disabled: number
  succeededInWindow: number
  failedInWindow: number
  skippedInWindow: number
  /** success + error; a skip did not run and is not added here. */
  runsInWindow: number
  /** Owned jobs with at least one recorded occurrence (including a skip) in the window. */
  jobsWithWindowActivity: number
  /** In-scope records that could not be read (bad status / NaN timestamp). */
  unreadableRuns: number
  /** Jobs with no departmentId (saved before the field existed). */
  unfiled: number
  /** Jobs whose departmentId names no known org node (deleted department). */
  unknownDepartment: number
  /** Jobs filed under a known node outside this subtree. */
  outsideScope: number
  /** Repeated job ids; the first occurrence wins. */
  duplicateIds: number
  /** Job entries with no usable id. */
  unreadableJobs: number
  /** Owned jobs whose recorded history is at the cap, so older runs may be gone. */
  jobsAtHistoryCap: number
}

export interface DeptJobsResult {
  state: DeptJobsState
  /** Null while loading, on IPC failure, or when the payload was unreadable. */
  counts: DeptJobsCounts | null
  /** Owned job count, or null when no answer is available. */
  ownedTotal: number | null
  /** Every owned job, newest-relevant first. */
  owned: DeptJobRow[]
  /** The first five of `owned`, for the Brief's compact list. */
  rows: DeptJobRow[]
}

export interface BuildDeptJobsInput {
  /** The raw `automation:list` payload; `unknown` so malformed input is handled. */
  jobs: unknown
  /** Every org node id known to the caller (used to tell "deleted" from "elsewhere"). */
  nodeIds: readonly string[]
  /** The covered subtree: the Brief's root plus descendants. */
  scopeIds: readonly string[]
  /** The Brief's already-computed inclusive bounds, epoch ms. */
  window: { start: number; end: number }
  load?: DeptJobsLoad
}

/** Same shape as the `t` returned by `useI18n()`. */
export type DeptJobTranslate = (key: string, params?: Record<string, string | number>) => string

function emptyResult(state: DeptJobsState): DeptJobsResult {
  return { state, counts: null, ownedTotal: null, owned: [], rows: [] }
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** Inclusive at both ends, the same rule the conversation window uses. */
function inWindow(timestamp: number, start: number, end: number): boolean {
  return timestamp >= start && timestamp <= end
}

/**
 * A trigger is kept only for the shared next-run sentence. Anything malformed
 * degrades to an empty cron trigger: `nextRunText` never prints that expression,
 * and it lets a switch-off/next-null state still be described honestly.
 */
function readTrigger(raw: unknown): AutomationTriggerData {
  if (!isRecord(raw)) return { kind: 'cron', expr: '' }
  if (raw.kind === 'cron') {
    return { kind: 'cron', expr: typeof raw.expr === 'string' ? raw.expr : '' }
  }
  if (raw.kind === 'interval') {
    const minutes = finiteOrNull(raw.minutes)
    return minutes === null
      ? { kind: 'cron', expr: '' }
      : { kind: 'interval', minutes }
  }
  if (raw.kind === 'watch') {
    if (typeof raw.path !== 'string') return { kind: 'cron', expr: '' }
    const trigger: AutomationWatchTriggerData = { kind: 'watch', path: raw.path }
    if (typeof raw.recursive === 'boolean') trigger.recursive = raw.recursive
    const debounce = finiteOrNull(raw.debounceMinutes)
    if (debounce !== null) trigger.debounceMinutes = debounce
    return trigger
  }
  return { kind: 'cron', expr: '' }
}

function readHistory(raw: unknown): { records: DeptRunRecord[]; unreadable: number; atCap: boolean } {
  if (!Array.isArray(raw)) return { records: [], unreadable: 0, atCap: false }
  // Main keeps the newest 20 records. A caller that hands over more (an older
  // store, a fixture) must not make the Brief claim a longer memory than the
  // app actually has, so the oldest entries are dropped here too.
  const atCap = raw.length >= AUTOMATION_HISTORY_CAP
  const entries = atCap ? raw.slice(-AUTOMATION_HISTORY_CAP) : raw
  const records: DeptRunRecord[] = []
  let unreadable = 0
  for (const entry of entries) {
    if (!isRecord(entry)) {
      unreadable++
      continue
    }
    const startedAt = finiteOrNull(entry.startedAt)
    const status = entry.status
    if (startedAt === null || startedAt < 0
      || (status !== 'success' && status !== 'error' && status !== 'skipped')) {
      unreadable++
      continue
    }
    // Only a skip can be held, and only the literal this build understands
    // survives. Older records carry no reason at all; an unknown string is a
    // reason a reader cannot interpret, so it is dropped rather than shown.
    const skipReason = status === 'skipped' && entry.skipReason === 'dept-budget'
      ? 'dept-budget'
      : null
    records.push({ startedAt, status, skipReason })
  }
  return { records, unreadable, atCap }
}

function readStatus(raw: unknown): AutomationRunStatusData | null {
  return raw === 'success' || raw === 'error' || raw === 'skipped' || raw === 'running'
    ? raw
    : null
}

/**
 * The record the job's current state is taken from. The store appends in time
 * order, but a malformed or reordered payload must not let an older hold shadow
 * a newer run, so the greatest start time wins; ties go to the later entry,
 * which is the order the store would have written.
 */
function newestRecord(records: readonly DeptRunRecord[]): DeptRunRecord | null {
  let newest: DeptRunRecord | null = null
  for (const record of records) {
    if (!newest || record.startedAt >= newest.startedAt) newest = record
  }
  return newest
}

/**
 * Newest-relevant first:
 *   group 0 — an occurrence (run or skip) is recorded inside the window;
 *   group 1 — the job has run at some point, but not in this window;
 *   group 2 — the job has never run.
 * Group 0 is ordered by newest in-window occurrence, group 1 by newest recorded
 * start, and group 2 by the soonest next occurrence. Ids break every tie, so the
 * order is stable even when timestamps collide or the clock is malformed.
 */
function relevanceGroup(row: DeptJobRow): 0 | 1 | 2 {
  if (row.runsInWindow + row.skippedInWindow > 0) return 0
  if (row.latestRecordedAt !== null) return 1
  return 2
}

function compareRows(a: DeptJobRow, b: DeptJobRow): number {
  const groupA = relevanceGroup(a)
  const groupB = relevanceGroup(b)
  if (groupA !== groupB) return groupA - groupB

  if (groupA === 0) {
    const windowA = a.latestWindowAt ?? Number.NEGATIVE_INFINITY
    const windowB = b.latestWindowAt ?? Number.NEGATIVE_INFINITY
    if (windowA !== windowB) return windowB - windowA
    const recordedA = a.latestRecordedAt ?? Number.NEGATIVE_INFINITY
    const recordedB = b.latestRecordedAt ?? Number.NEGATIVE_INFINITY
    if (recordedA !== recordedB) return recordedB - recordedA
  } else if (groupA === 1) {
    const recordedA = a.latestRecordedAt ?? Number.NEGATIVE_INFINITY
    const recordedB = b.latestRecordedAt ?? Number.NEGATIVE_INFINITY
    if (recordedA !== recordedB) return recordedB - recordedA
  } else {
    if (a.nextRunAt !== b.nextRunAt) {
      if (a.nextRunAt === null) return 1
      if (b.nextRunAt === null) return -1
      return a.nextRunAt - b.nextRunAt
    }
  }

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Derive the scheduled-run view for a subtree. Never throws; when no answer is
 * available (`loading`, `error`, `unreadable`) every numeric field is null or
 * absent rather than zero.
 */
export function buildDeptJobs(input: BuildDeptJobsInput): DeptJobsResult {
  const source = input ?? ({} as BuildDeptJobsInput)
  const load: DeptJobsLoad = source.load === 'loading' || source.load === 'error'
    ? source.load
    : 'ready'
  if (load !== 'ready') return emptyResult(load)

  if (!Array.isArray(source.jobs)) return emptyResult('unreadable')

  const rawNodes = Array.isArray(source.nodeIds) ? source.nodeIds : []
  const rawScope = Array.isArray(source.scopeIds) ? source.scopeIds : []
  const scope = new Set<string>()
  for (const id of rawScope) {
    if (typeof id === 'string' && id) scope.add(id)
  }
  // A caller that supplies only the scope still gets "in scope" right; the
  // union prevents a scope id from being misread as a deleted department.
  const known = new Set<string>(scope)
  for (const id of rawNodes) {
    if (typeof id === 'string' && id) known.add(id)
  }

  const start = finiteOrNull(source.window?.start)
  const end = finiteOrNull(source.window?.end)
  const windowStart = start ?? 0
  const windowEnd = end ?? 0

  const counts: DeptJobsCounts = {
    total: 0,
    enabled: 0,
    disabled: 0,
    succeededInWindow: 0,
    failedInWindow: 0,
    skippedInWindow: 0,
    runsInWindow: 0,
    jobsWithWindowActivity: 0,
    unreadableRuns: 0,
    unfiled: 0,
    unknownDepartment: 0,
    outsideScope: 0,
    duplicateIds: 0,
    unreadableJobs: 0,
    jobsAtHistoryCap: 0,
  }

  const owned: DeptJobRow[] = []
  const seenIds = new Set<string>()

  for (const raw of source.jobs) {
    if (!isRecord(raw)) {
      counts.unreadableJobs++
      continue
    }
    const id = typeof raw.id === 'string' ? raw.id.trim() : ''
    if (!id) {
      counts.unreadableJobs++
      continue
    }
    if (seenIds.has(id)) {
      counts.duplicateIds++
      continue
    }
    seenIds.add(id)

    const departmentId = typeof raw.departmentId === 'string' ? raw.departmentId.trim() : ''
    if (!departmentId) {
      // A job saved before `departmentId` existed. Never infer one from cwd.
      counts.unfiled++
      continue
    }
    if (!known.has(departmentId)) {
      counts.unknownDepartment++
      continue
    }
    if (!scope.has(departmentId)) {
      counts.outsideScope++
      continue
    }

    const historyRead = readHistory(raw.history)
    const newest = newestRecord(historyRead.records)
    const lastSkipReason = newest?.skipReason ?? null
    const lastHeld = newest?.status === 'skipped' && lastSkipReason === 'dept-budget'
    const lastRunAt = finiteOrNull(raw.lastRunAt)
    const nextRunAt = finiteOrNull(raw.nextRunAt)
    const lastStatus = readStatus(raw.lastStatus)
    const running = raw.running === true || lastStatus === 'running'

    let succeeded = 0
    let failed = 0
    let skipped = 0
    let latestWindowAt: number | null = null
    let latestRecordedAt = lastRunAt

    for (const record of historyRead.records) {
      latestRecordedAt = latestRecordedAt === null
        ? record.startedAt
        : Math.max(latestRecordedAt, record.startedAt)
      if (!inWindow(record.startedAt, windowStart, windowEnd)) continue
      if (record.status === 'success') succeeded++
      else if (record.status === 'error') failed++
      else skipped++
      latestWindowAt = latestWindowAt === null
        ? record.startedAt
        : Math.max(latestWindowAt, record.startedAt)
    }

    const enabled = raw.enabled === true
    const row: DeptJobRow = {
      id,
      name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : id,
      enabled,
      pausedAll: raw.pausedAll === true,
      departmentId,
      trigger: readTrigger(raw.trigger),
      nextRunAt,
      lastRunAt,
      lastStatus,
      lastSkipReason,
      lastHeld,
      lastError: typeof raw.lastError === 'string' ? raw.lastError : null,
      running,
      succeededInWindow: succeeded,
      failedInWindow: failed,
      skippedInWindow: skipped,
      runsInWindow: succeeded + failed,
      latestWindowAt,
      latestRecordedAt,
    }
    owned.push(row)

    counts.total++
    if (enabled) counts.enabled++
    else counts.disabled++
    counts.succeededInWindow += succeeded
    counts.failedInWindow += failed
    counts.skippedInWindow += skipped
    counts.runsInWindow += row.runsInWindow
    counts.unreadableRuns += historyRead.unreadable
    if (row.runsInWindow + skipped > 0) counts.jobsWithWindowActivity++
    if (historyRead.atCap) counts.jobsAtHistoryCap++
  }

  const sorted = [...owned].sort(compareRows)
  return {
    state: 'ready',
    counts,
    ownedTotal: counts.total,
    owned: sorted,
    rows: sorted.slice(0, BRIEF_JOB_ROW_LIMIT),
  }
}

/** Last recorded outcome, in the app's existing automation vocabulary. */
export function deptJobStatusText(
  job: Pick<DeptJobRow, 'running' | 'lastStatus' | 'lastHeld'>,
  t: DeptJobTranslate,
): string {
  if (job.running || job.lastStatus === 'running') return t('automation.status.running')
  if (job.lastStatus === 'success') return t('automation.status.success')
  if (job.lastStatus === 'error') return t('automation.status.error')
  // A held occurrence never started, so nothing failed. Naming it as a hold
  // keeps it from reading as an error, and keeps it distinct from the other
  // rails' neutral "Skipped" (hourly cap, app closed at the scheduled time).
  if (job.lastHeld) return t('dept.jobs.statusHeld')
  // The settings label names the hourly cap; a Brief count has no room for that
  // distinction, so it uses a neutral "Skipped" instead.
  if (job.lastStatus === 'skipped') return t('dept.jobs.statusSkipped')
  return t('automation.neverRun')
}

/** Semantic colour for the last outcome; presentation maps the names to tokens. */
export type DeptJobStatusTone = 'warning' | 'danger' | 'success' | 'running' | 'muted'

/**
 * The same decision `deptJobStatusText` makes, reduced to a colour role, so the
 * department page and the Brief cannot colour one state differently. A hold is
 * `warning` because it is a pause imposed by a limit, not a failure.
 */
export function deptJobStatusTone(
  job: Pick<DeptJobRow, 'running' | 'lastStatus' | 'lastHeld'>,
): DeptJobStatusTone {
  if (job.running || job.lastStatus === 'running') return 'running'
  if (job.lastStatus === 'success') return 'success'
  if (job.lastStatus === 'error') return 'danger'
  if (job.lastHeld) return 'warning'
  return 'muted'
}

/** Enabled state, including the global pause, for a row's state chip. */
export function deptJobStateText(
  job: Pick<DeptJobRow, 'enabled' | 'pausedAll'>,
  t: DeptJobTranslate,
): string {
  if (!job.enabled) return t('dept.jobs.paused')
  if (job.pausedAll) return t('dept.jobs.enabledAllPaused')
  return t('automation.enabled')
}
