// The cross-job run list: which rows a filter shows, what each chip counts,
// and which of the three empty states a read is in.
//
// Pure and React-free, the same shape as `jobFilter.ts` and `runHistoryView.ts`:
// the panel owns the DOM, this module owns the arithmetic, and a harness can
// exercise ordering, counts and the empty states without mounting anything.
//
// Two numbers are deliberately kept apart. `loaded` is how many rows main
// returned (already capped); `total` is how many remembered runs exist. A filter
// never hides anything past the cap — it can only narrow what was loaded — and
// every sentence the panel prints is careful not to imply otherwise.

import type {
  AutomationJobData,
  AutomationRunActivityRowData,
  AutomationRunRecordData,
  AutomationRunSourceData,
} from '../../../preload'
import type { Translate } from './scheduleText'
import { errorCodeText } from '../workflows/scheduleSummary'

/** The status chips, in display order. `all` is not narrowed. */
export const RUN_ACTIVITY_STATUSES = ['all', 'failed', 'skipped', 'succeeded'] as const
export type RunActivityStatus = typeof RUN_ACTIVITY_STATUSES[number]

/**
 * The source values the record can carry, plus the two ends of the filter.
 *
 * `unrecorded` is a real choice, not a misc bucket: every record written before
 * main stored the source has no value, and a reader asking "which of these did
 * a chain start?" needs to be able to see that the answer is unknown rather than
 * have those rows silently counted as scheduled.
 */
export const RUN_ACTIVITY_SOURCES = ['all', 'scheduled', 'manual', 'watch', 'chain', 'unrecorded'] as const
export type RunActivitySource = typeof RUN_ACTIVITY_SOURCES[number]

/**
 * How far back the page looks. This is a scope over the already-loaded rows,
 * not another request: main has already answered with the newest 500 runs, so
 * a window can only narrow what is in hand. `all` means every loaded row,
 * including those older than a week — it does not mean every remembered run,
 * which is why the footer still states the cap.
 */
export const RUN_ACTIVITY_WINDOWS = ['24h', '7d', 'all'] as const
export type RunActivityWindow = typeof RUN_ACTIVITY_WINDOWS[number]

/** Windows that cut by age. A fixed 24 h / 7 d, not a calendar day or week. */
export const RUN_ACTIVITY_WINDOW_MS: Record<Exclude<RunActivityWindow, 'all'>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
}

/**
 * The loaded rows that fall inside the window.
 *
 * Boundaries are inclusive: a run started exactly 24 h (or 7 d) before `now` is
 * still in the window, and one started 1 ms earlier is out. A run with no
 * usable start time cannot be placed in time, so a time window drops it rather
 * than guessing; `all` keeps it.
 */
export function filterRunActivityWindow(
  rows: readonly AutomationRunActivityRowData[],
  window: RunActivityWindow,
  now: number = Date.now(),
): AutomationRunActivityRowData[] {
  if (window === 'all') return [...rows]
  const span = RUN_ACTIVITY_WINDOW_MS[window]
  return rows.filter(row =>
    Number.isFinite(row.run.startedAt) && now - row.run.startedAt <= span)
}

export interface RunActivityFilter {
  status: RunActivityStatus
  source: RunActivitySource
  /** A job id, or null for every job. */
  jobId: string | null
  /** Free text; matched case-insensitively against the row's visible facts. */
  query: string
}

export const RUN_ACTIVITY_FILTER_ALL: RunActivityFilter = {
  status: 'all',
  source: 'all',
  jobId: null,
  query: '',
}

export interface RunActivityCounts {
  all: number
  failed: number
  skipped: number
  succeeded: number
}

/** What each chip says. Counts always describe the loaded rows, never the filter. */
export function countRunActivity(rows: readonly AutomationRunActivityRowData[]): RunActivityCounts {
  const counts: RunActivityCounts = { all: 0, failed: 0, skipped: 0, succeeded: 0 }
  for (const row of rows) {
    counts.all += 1
    if (row.run.status === 'error') counts.failed += 1
    else if (row.run.status === 'skipped') counts.skipped += 1
    else if (row.run.status === 'success') counts.succeeded += 1
  }
  return counts
}

function matchesStatus(record: AutomationRunRecordData, status: RunActivityStatus): boolean {
  if (status === 'all') return true
  if (status === 'failed') return record.status === 'error'
  if (status === 'skipped') return record.status === 'skipped'
  return record.status === 'success'
}

function matchesSource(record: AutomationRunRecordData, source: RunActivitySource): boolean {
  if (source === 'all') return true
  if (source === 'unrecorded') return record.source === undefined
  return record.source === source
}

/**
 * The text a row is searchable by.
 *
 * Only what the row actually shows: the job name, the failure code/message and
 * the transcript id. Not the localized status or source words — those depend on
 * the interface language, and a filter that matched "Failed" in English but not
 * in Chinese would be a filter whose results change when the user switches
 * language.
 */
function haystack(row: AutomationRunActivityRowData): string {
  return [
    row.jobName,
    row.run.error ?? '',
    row.run.sessionId ?? '',
  ].join('\n').toLowerCase()
}

export function matchesRunActivityRow(
  row: AutomationRunActivityRowData,
  filter: RunActivityFilter,
): boolean {
  if (!matchesStatus(row.run, filter.status)) return false
  if (!matchesSource(row.run, filter.source)) return false
  if (filter.jobId !== null && row.jobId !== filter.jobId) return false
  const query = filter.query.trim().toLowerCase()
  if (query && !haystack(row).includes(query)) return false
  return true
}

export interface RunActivityView {
  /** Every loaded row inside the window, in main's order (newest first). */
  windowed: AutomationRunActivityRowData[]
  /** The windowed rows this filter keeps, in main's order (newest first). */
  visible: AutomationRunActivityRowData[]
  /** Counts over every row inside the window, regardless of the filter. */
  counts: RunActivityCounts
  /** Windowed rows the filter hides. */
  hidden: number
  /** Loaded rows the window itself hides (older than the selected window). */
  windowHidden: number
  /** Loaded rows inside the window. */
  windowRows: number
  /** The status/source/job/text filter narrows the list at all. */
  filtered: boolean
}

/**
 * Apply the window first, then the filter. The chips describe the windowed
 * set, not the loaded set: a page showing "last 24 hours" whose chip still
 * counted a run from three weeks ago would be counting something the reader
 * cannot see. The window is a scope, so it is applied before the filter but is
 * not part of `filtered` — clearing filters must not silently widen the window.
 */
export function viewRunActivity(
  rows: readonly AutomationRunActivityRowData[],
  filter: RunActivityFilter = RUN_ACTIVITY_FILTER_ALL,
  window: RunActivityWindow = 'all',
  now: number = Date.now(),
): RunActivityView {
  const windowed = filterRunActivityWindow(rows, window, now)
  const counts = countRunActivity(windowed)
  const visible = windowed.filter(row => matchesRunActivityRow(row, filter))
  return {
    windowed,
    visible,
    counts,
    hidden: windowed.length - visible.length,
    windowHidden: rows.length - windowed.length,
    windowRows: windowed.length,
    filtered: filter.status !== 'all'
      || filter.source !== 'all'
      || filter.jobId !== null
      || filter.query.trim().length > 0,
  }
}

/**
 * The job choices for the selector: only jobs a loaded row names.
 *
 * A job with no remembered runs has nothing to select, and a deleted job is not
 * in the rows at all — listing either would promise rows that do not exist.
 * Ordered by name so the menu is stable between reads.
 */
export interface RunActivityJobChoice {
  id: string
  name: string
  /** Loaded rows for this job. */
  count: number
}

export function runActivityJobChoices(
  rows: readonly AutomationRunActivityRowData[],
): RunActivityJobChoice[] {
  const byId = new Map<string, RunActivityJobChoice>()
  for (const row of rows) {
    const existing = byId.get(row.jobId)
    if (existing) existing.count += 1
    else byId.set(row.jobId, { id: row.jobId, name: row.jobName, count: 1 })
  }
  return [...byId.values()].sort((a, b) =>
    a.name.localeCompare(b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/**
 * Which empty state the page is in. Five answers, four of them "nothing to
 * list" and each a different fact:
 *
 *  - `unreadable`  the read failed; the store may be full of runs
 *  - `no-runs`     the read worked and no job remembers a run
 *  - `no-window`   runs were loaded, but the selected time window keeps none
 *  - `no-match`    runs exist in the window but the filter hides all of them
 *  - `none`        there is something to render
 *
 * `total` is main's pre-cap count, so a cap that somehow returned zero rows
 * still reads as "runs exist", never as "nothing has run". A window that hides
 * everything gets its own answer because "clear the filter" would not bring
 * the rows back: only widening the window can.
 */
export type RunActivityEmptyState =
  | 'none' | 'unreadable' | 'no-runs' | 'no-window' | 'no-match'

export function runActivityEmptyState(input: {
  readFailed: boolean
  loaded: number
  total: number
  visible: number
  /** Loaded rows inside the selected window. Omitted means "same as loaded". */
  windowRows?: number
  window?: RunActivityWindow
}): RunActivityEmptyState {
  if (input.readFailed) return 'unreadable'
  if (input.visible > 0) return 'none'
  if (input.total <= 0 && input.loaded <= 0) return 'no-runs'
  const windowRows = input.windowRows ?? input.loaded
  if (input.window && input.window !== 'all' && windowRows === 0) return 'no-window'
  return 'no-match'
}

/**
 * How a run came due, in words. `undefined` is its own answer and says so — the
 * record does not know, and defaulting to "scheduled" would invent it.
 */
export function runActivitySourceText(
  source: AutomationRunSourceData | undefined,
  t: Translate,
): string {
  return t(`automation.runActivity.source.${source ?? 'unrecorded'}`)
}

/**
 * Compact duration, in the same words the job's own history uses (`3.2s`,
 * `12m`). A null duration is a skip or a run that never started; the row then
 * says nothing rather than "0s".
 */
export function runActivityDurationText(ms: number | null, t: Translate): string | null {
  if (ms === null) return null
  if (ms < 60_000) {
    const seconds = ms / 1000
    return t('automation.history.seconds', {
      seconds: seconds < 10 ? seconds.toFixed(1).replace(/\.0$/, '') : String(Math.round(seconds)),
    })
  }
  return t('automation.history.minutes', { minutes: Math.round(ms / 60_000) })
}

/**
 * One run's outcome, in the same vocabulary and the same locale keys the job's
 * own history uses, so the two surfaces can never describe one record two ways.
 * The rail that stopped a skip is named here; a failure keeps its raw code in
 * the row and its sentence in the title (see the panel).
 */
export function runActivityStatusText(
  record: AutomationRunRecordData,
  t: Translate,
): { text: string; color: string } {
  if (record.status === 'success') {
    return { text: t('automation.status.success'), color: 'var(--success-text)' }
  }
  if (record.status === 'skipped') {
    const text = record.error === 'global_budget_exceeded'
      ? t('automation.status.globalBudgetSkipped')
      : record.error === 'budget_exceeded'
        ? t('automation.status.budgetSkipped')
        : record.error === 'missed_while_closed'
          ? t('automation.status.missedSkipped')
          : t('automation.status.skipped')
    return { text, color: 'var(--warning-text)' }
  }
  return { text: t('automation.status.error'), color: 'var(--danger-text)' }
}

/** Thousands separators, so "500 of 1,240" does not read as a telemetry id. */
export function runActivityCount(value: number): string {
  return String(Math.max(0, Math.trunc(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export interface RunActivitySummaryInput {
  /** Rows the window and filter leave on screen. */
  shown: number
  /** Loaded rows inside the window, before the status/source/job/text filter. */
  windowRows: number
  window: RunActivityWindow
  /** Rows main returned (already capped). */
  loaded: number
  /** Runs remembered before the cap. */
  total: number
}

/**
 * The header sentence. It names both bounds at once: how many of the window's
 * rows the filter leaves ("showing X of Y"), and how many remembered runs main
 * actually loaded ("Z of N remembered"). The window is in the sentence only
 * when it cuts — "all" has no cut to explain, but the cap still does.
 */
export function runActivitySummaryText(
  input: RunActivitySummaryInput,
  t: Translate,
): string {
  const total = runActivityCount(input.total)
  const shown = runActivityCount(input.shown)
  if (input.total <= 0) return t('automation.runActivity.subtitle')
  const capped = input.loaded < input.total
  if (input.window === 'all') {
    if (!capped) return t('automation.runActivity.summaryAll', { total })
    return t('automation.runActivity.summaryAllCapped', {
      shown,
      loaded: runActivityCount(input.loaded),
      total,
    })
  }
  const label = t(`automation.runActivity.window.label.${input.window}`)
  const window = runActivityCount(input.windowRows)
  if (!capped) {
    return t('automation.runActivity.summaryWindowAll', { shown, window, label, total })
  }
  return t('automation.runActivity.summaryWindowCapped', {
    shown,
    window,
    label,
    loaded: runActivityCount(input.loaded),
    total,
  })
}

/** How many loaded rows the window itself put out of view, in the footer's words. */
export function runActivityWindowCutText(
  windowHidden: number,
  loaded: number,
  t: Translate,
): string {
  if (windowHidden <= 0) return ''
  return t('automation.runActivity.windowCut', {
    count: runActivityCount(windowHidden),
    loaded: runActivityCount(loaded),
  })
}

/**
 * Whether "Run again" can start this row's job.
 *
 * `jobs === null` means the live job list could not be read: the page cannot
 * tell a deleted job from a running one, so it offers no per-row action rather
 * than one that might refuse. A job that is missing from a *successful* read is
 * deleted; its row keeps its record but has no live target.
 */
export type RunActivityRunAgainState =
  | { kind: 'available' }
  | { kind: 'running' }
  | { kind: 'missing-action' }
  | { kind: 'deleted' }
  | { kind: 'unknown' }

export function runActivityRunAgainState(
  jobId: string,
  jobs: readonly AutomationJobData[] | null,
): RunActivityRunAgainState {
  if (jobs === null) return { kind: 'unknown' }
  const job = jobs.find(candidate => candidate.id === jobId)
  if (!job) return { kind: 'deleted' }
  if (job.running) return { kind: 'running' }
  // A job whose workflow or skill no longer resolves is refused by the
  // scheduler after it has already recorded a failure. Do not offer a start the
  // row can already predict will fail.
  if (job.actionMissing) return { kind: 'missing-action' }
  return { kind: 'available' }
}

/** A row may open Settings only when its job is in a successful live read. */
export function runActivityJobExists(
  jobId: string,
  jobs: readonly AutomationJobData[] | null,
): boolean {
  return jobs !== null && jobs.some(job => job.id === jobId)
}

/**
 * A refusal from `automation:runNow`, in the same words the status-bar panel
 * uses. Anything unknown goes through `errorCodeText` inside one sentence, so a
 * raw code is never the whole message.
 */
export function runActivityRefusalText(
  code: string,
  name: string,
  t: Translate,
): string {
  switch (code) {
    case 'already_running':
      return t('statusBar.background.runAlreadyRunning', { name })
    case 'not_found':
      return t('statusBar.background.runNotFound', { name })
    case 'too_many_running':
      return t('statusBar.background.runTooMany', { name })
    case 'workflow_missing':
      return t('statusBar.background.runWorkflowMissing', { name })
    case 'nothing_to_run':
      return t('statusBar.background.runNothingToRun', { name })
    default: {
      const reason = errorCodeText(code, t)
      return t('statusBar.background.runRefused', { name, reason: reason || code })
    }
  }
}
