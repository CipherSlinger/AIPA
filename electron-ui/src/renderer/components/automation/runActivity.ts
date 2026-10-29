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
  AutomationRunActivityRowData,
  AutomationRunRecordData,
  AutomationRunSourceData,
} from '../../../preload'
import type { Translate } from './scheduleText'

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
  /** The loaded rows this filter keeps, in main's order (newest first). */
  visible: AutomationRunActivityRowData[]
  /** Counts over every loaded row, regardless of the filter. */
  counts: RunActivityCounts
  /** Loaded rows the filter hides. */
  hidden: number
  /** The filter narrows the list at all. */
  filtered: boolean
}

export function viewRunActivity(
  rows: readonly AutomationRunActivityRowData[],
  filter: RunActivityFilter = RUN_ACTIVITY_FILTER_ALL,
): RunActivityView {
  const counts = countRunActivity(rows)
  const visible = rows.filter(row => matchesRunActivityRow(row, filter))
  return {
    visible,
    counts,
    hidden: rows.length - visible.length,
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
 * Which empty state the page is in. Four answers, three of them "nothing to
 * list" and each a different fact:
 *
 *  - `unreadable`  the read failed; the store may be full of runs
 *  - `no-runs`     the read worked and no job remembers a run
 *  - `no-match`    runs exist but the filter hides all of them
 *  - `none`        there is something to render
 *
 * `total` is main's pre-cap count, so a cap that somehow returned zero rows
 * still reads as "runs exist", never as "nothing has run".
 */
export type RunActivityEmptyState = 'none' | 'unreadable' | 'no-runs' | 'no-match'

export function runActivityEmptyState(input: {
  readFailed: boolean
  loaded: number
  total: number
  visible: number
}): RunActivityEmptyState {
  if (input.readFailed) return 'unreadable'
  if (input.visible > 0) return 'none'
  if (input.total <= 0 && input.loaded <= 0) return 'no-runs'
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
