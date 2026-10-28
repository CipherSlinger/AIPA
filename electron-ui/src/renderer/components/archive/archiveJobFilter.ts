// Job-level archive filtering, kept pure so the rules can be exercised without
// React. The archive already filters by origin *kind*; a job is the narrower
// question "which scheduled automation opened this run". The options are
// derived from the sessions already in the store — no extra IPC.

import type { SessionListItem } from '../../types/app.types'

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
