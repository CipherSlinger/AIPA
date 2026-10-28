// Job-level archive filtering, kept pure so the rules can be exercised without
// React. The archive already filters by origin *kind*; a job is the narrower
// question "which scheduled automation opened this run". The options are
// derived from the sessions already in the store — no extra IPC.

import type {
  AutomationJobData,
  AutomationRunRecordData,
  AutomationRunUsageData,
} from '../../../preload'
import type { SessionListItem } from '../../types/app.types'
import { formatTokens } from '../../utils/formatUtils'
// The archive and the workflow schedules describe the same spend in the same
// words; importing keeps the two surfaces from drifting apart on precision or
// relative-age phrasing.
import { costText, errorCodeText, relativeTimeText } from '../workflows/scheduleSummary'

/** Origin pills in the archive: a kind, or every kind. */
export type ArchiveOriginKind = 'all' | 'user' | 'automation' | 'plugin'

export interface JobFilterOption {
  jobId: string
  /** The most recently seen name — a renamed job is still the same job. */
  jobName: string
  /** Sessions in the shown archive that this job covers. */
  count: number
}

/**
 * One option per distinct automation job, newest activity first. Sessions that
 * are not automation runs contribute nothing: a job filter only makes sense
 * over runs a job actually produced.
 */
export function deriveJobOptions(sessions: readonly SessionListItem[]): JobFilterOption[] {
  const byId = new Map<string, JobFilterOption & { latest: number }>()
  for (const session of sessions) {
    const origin = session.origin
    if (!origin || origin.kind !== 'automation') continue
    const existing = byId.get(origin.jobId)
    if (existing) {
      existing.count += 1
      if (session.timestamp >= existing.latest) {
        existing.latest = session.timestamp
        existing.jobName = origin.jobName
      }
    } else {
      byId.set(origin.jobId, {
        jobId: origin.jobId,
        jobName: origin.jobName,
        count: 1,
        latest: session.timestamp,
      })
    }
  }
  return [...byId.values()]
    .sort((a, b) => b.latest - a.latest)
    .map(entry => ({ jobId: entry.jobId, jobName: entry.jobName, count: entry.count }))
}

/**
 * Job pills are a choice, not a label: with a single job in the archive they would
 * only restate the origin filter, so they stay hidden until a second one exists.
 */
export function visibleJobOptions(options: readonly JobFilterOption[]): JobFilterOption[] {
  return options.length >= 2 ? [...options] : []
}

/** A job is an automation run, so those are the only kinds it can coexist with. */
export function originAcceptsJob(originKind: ArchiveOriginKind): boolean {
  return originKind === 'all' || originKind === 'automation'
}

/**
 * Choosing a different origin kind must not leave a job selected underneath a
 * kind that cannot contain it. "All" and "Scheduled runs" keep the selection.
 */
export function jobAfterOriginChange(
  jobId: string | null,
  originKind: ArchiveOriginKind,
): string | null {
  return originAcceptsJob(originKind) ? jobId : null
}

/**
 * When a job falls out of the loaded set (deleted, or all its runs archived
 * away) its filter would match nothing forever; drop it instead.
 */
export function resolveJobSelection(
  options: readonly JobFilterOption[],
  jobId: string | null,
): string | null {
  if (!jobId) return null
  return options.some(option => option.jobId === jobId) ? jobId : null
}

/**
 * The empty ledger may mean "this archive holds nothing" or "the filters
 * excluded everything"; only the latter should offer a one-click reset. Rows
 * hidden by the command-only toggle are explained by their own notice, not by
 * the filters, so they keep the ledger (and its notice) on screen.
 */
export function isFilteredEmpty(stats: {
  records: number
  scopedRecords: number
  allRecords: number
  filtersActive: boolean
  searching: boolean
  showCommandOnly: boolean
  commandOnlyCount: number
}): boolean {
  if (stats.records > 0 || stats.allRecords === 0) return false
  if (!stats.filtersActive) return false
  const onlyHiddenCommandRows = !stats.searching && !stats.showCommandOnly
    && stats.commandOnlyCount > 0 && stats.scopedRecords > 0
  return !onlyHiddenCommandRows
}

// ── Selected-job summary ─────────────────────────────────────────────────────
// Filtering to a job says which conversations it produced; this strip says how
// the job itself is doing. Everything here is derived from the bounded job
// snapshot (`history` is capped at 20) so the wording can never imply it covers
// every run the scheduler has ever made.

/** Same shape as the `t` returned by `useI18n`; kept local so this module stays React-free. */
type Translate = (key: string, params?: Record<string, string | number>) => string

/** The job a filter id points at, or null once the scheduler no longer lists it. */
export function findJob(
  jobs: readonly AutomationJobData[],
  jobId: string,
): AutomationJobData | null {
  return jobs.find(job => job.id === jobId) ?? null
}

export interface JobRunStats {
  /** Remembered runs the counts describe — the scheduler caps this at 20. */
  total: number
  succeeded: number
  failed: number
  /** Skips (hourly cap, spend cap, nothing to run) are not failures. */
  skipped: number
  /**
   * Mean duration of successful runs that recorded one, or null below two
   * samples. One sample is not an average, and a durationless run (skip or a
   * missing workflow) would drag the mean toward a number nobody measured.
   */
  averageSuccessMs: number | null
}

export function deriveJobRunStats(history: readonly AutomationRunRecordData[]): JobRunStats {
  let succeeded = 0
  let failed = 0
  let skipped = 0
  let durationSum = 0
  let durationCount = 0

  for (const run of history) {
    if (run.status === 'success') {
      succeeded += 1
      if (run.durationMs !== null) {
        durationSum += run.durationMs
        durationCount += 1
      }
    } else if (run.status === 'skipped') {
      skipped += 1
    } else {
      failed += 1
    }
  }

  return {
    total: history.length,
    succeeded,
    failed,
    skipped,
    averageSuccessMs: durationCount >= 2 ? Math.round(durationSum / durationCount) : null,
  }
}

/** Compact run duration: whole minutes once a run passes one, seconds below. */
export function runDurationText(ms: number, t: Translate): string {
  if (ms < 60_000) {
    const seconds = ms / 1000
    return t('automation.history.seconds', {
      seconds: seconds < 10 ? seconds.toFixed(1).replace(/\.0$/, '') : String(Math.round(seconds)),
    })
  }
  return t('automation.history.minutes', { minutes: Math.round(ms / 60_000) })
}

/**
 * A single failure is already on the outcome line; a streak only earns its own
 * sentence from the second consecutive failure, matching the settings row.
 */
export function failureStreakText(job: AutomationJobData, t: Translate): string | null {
  if (job.failureStreak < 2) return null
  return t('automation.failureStreak', { count: job.failureStreak })
}

export interface JobOutcomeText {
  text: string
  color: string
}

/**
 * Last outcome of the job, with the error code and a relative time. Mirrors the
 * settings row, including the distinction between a spend-cap skip and the
 * hourly cap: both are skips, but naming the wrong rail would blame the job.
 */
export function jobLastOutcomeText(
  job: AutomationJobData,
  t: Translate,
  now: number = Date.now(),
): JobOutcomeText {
  if (job.running || job.lastStatus === 'running') {
    return { text: t('automation.status.running'), color: 'var(--accent-text)' }
  }
  if (!job.lastStatus || job.lastRunAt === null) {
    return { text: t('automation.neverRun'), color: 'var(--text-muted)' }
  }
  const when = relativeTimeText(job.lastRunAt, t, now)
  if (job.lastStatus === 'success') {
    return { text: `${t('automation.status.success')} · ${when}`, color: 'var(--success-text)' }
  }
  if (job.lastStatus === 'skipped') {
    // Three rails can skip a run: the hourly cap (the generic label), the job's
    // own spend limit, and the budget shared by every job. They read differently
    // because only the first is a cadence decision; a budget stop names which
    // budget, since the job's own limit may not even be set.
    const text = job.lastError === 'global_budget_exceeded'
      ? t('automation.status.globalBudgetSkipped')
      : job.lastError === 'budget_exceeded'
        ? t('automation.status.budgetSkipped')
        : t('automation.status.skipped')
    return {
      text: `${text} · ${when}`,
      color: 'var(--warning-text)',
    }
  }
  const detail = errorCodeText(job.lastError, t)
  return {
    text: `${t('automation.status.error')}${detail ? `: ${detail}` : ''} · ${when}`,
    color: 'var(--danger-text)',
  }
}

export interface JobSpendText {
  text: string
  title: string
  /** The figures cover every reported run, not just the newest one. */
  lifetime: boolean
}

/**
 * The newest run that actually spent something. A skip leaves the prior run's
 * figures on the job, so its history entry is skipped here rather than passed
 * off as this run's spend.
 */
function newestReportedUsage(job: AutomationJobData): AutomationRunUsageData | null {
  // Only the newest actual run qualifies. Looking further back would label an
  // older run's figures "Last run" when the newest one simply reported none.
  for (let i = job.history.length - 1; i >= 0; i--) {
    const run = job.history[i]
    if (run.status === 'skipped') continue
    const usage = run.usage
    if (!usage) return null
    // Cache reads stay out of the headline figure; they would dwarf the
    // conversation tokens that the number is meant to describe.
    return usage.inputTokens + usage.outputTokens > 0 || (usage.costUsd ?? 0) > 0 ? usage : null
  }
  // No remembered actual run (empty history): trust the job's own last-run
  // fields, but only when the last outcome really was a run.
  const last = job.lastUsage
  if (last && (job.lastStatus === 'success' || job.lastStatus === 'error')
    && (last.inputTokens + last.outputTokens > 0 || (last.costUsd ?? 0) > 0)) {
    return last
  }
  return null
}

/**
 * Reported spend for the job: the lifetime total when the engine reports one,
 * otherwise the newest run's figures. Cost appears only when reported, and a
 * job that reports tokens but no money never gets a fabricated `$0.00`.
 */
export function deriveJobSpend(job: AutomationJobData, t: Translate): JobSpendText | null {
  const lifetimeTokens = job.totalTokens !== undefined && job.totalTokens > 0 ? job.totalTokens : 0
  const lifetimeCost = job.totalCostUsd !== undefined && job.totalCostUsd > 0 ? job.totalCostUsd : 0

  if (lifetimeTokens > 0 || lifetimeCost > 0) {
    const parts: string[] = []
    if (lifetimeTokens > 0) {
      parts.push(t('automation.usage.tokens', { count: formatTokens(lifetimeTokens) }))
    }
    if (lifetimeCost > 0) parts.push(costText(lifetimeCost))
    const title: string[] = []
    if (lifetimeTokens > 0) {
      title.push(t('automation.usage.tooltip.totalTokens', { count: formatTokens(lifetimeTokens) }))
    }
    if (lifetimeCost > 0) {
      title.push(t('automation.usage.tooltip.totalCost', { cost: costText(lifetimeCost) }))
    }
    return {
      text: t('archive.jobSummary.spendLifetime', { spend: parts.join(' · ') }),
      title: title.join('\n'),
      lifetime: true,
    }
  }

  const usage = newestReportedUsage(job)
  if (!usage) return null
  const tokens = usage.inputTokens + usage.outputTokens
  const cost = usage.costUsd !== undefined && usage.costUsd > 0 ? usage.costUsd : null
  if (tokens <= 0 && cost === null) return null

  const parts: string[] = []
  if (tokens > 0) parts.push(t('automation.usage.tokens', { count: formatTokens(tokens) }))
  if (cost !== null) parts.push(costText(cost))

  const detail: string[] = []
  if (usage.inputTokens > 0) {
    detail.push(t('automation.usage.tooltip.input', { count: formatTokens(usage.inputTokens) }))
  }
  if (usage.outputTokens > 0) {
    detail.push(t('automation.usage.tooltip.output', { count: formatTokens(usage.outputTokens) }))
  }
  if (usage.cachedInputTokens !== undefined && usage.cachedInputTokens > 0) {
    detail.push(t('automation.usage.tooltip.cached', { count: formatTokens(usage.cachedInputTokens) }))
  }

  return {
    text: t('archive.jobSummary.spendLastRun', { spend: parts.join(' · ') }),
    // Same tooltip shape as the settings row: the parts share one line.
    title: detail.join(' · '),
    lifetime: false,
  }
}
