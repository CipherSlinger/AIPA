// The selected job's own health, shown above the ledger when a job filter is
// active. Filtering to a job answers "which conversations did it produce"; this
// strip answers "is it still working, what did it last do, and what has it cost".
//
// The scheduler snapshot is probed here rather than threaded through the panel:
// automations are optional context for the archive, and a failed or slow probe
// must leave the ledger exactly as it was.

import { useEffect, useState } from 'react'
import type { AutomationJobData } from '../../../preload'
import { useI18n } from '../../i18n'
import { formatDateTimeShort } from '../../utils/formatDate'
import {
  deriveJobRunStats,
  deriveJobSpend,
  failureStreakText,
  findJob,
  jobLastOutcomeText,
  runDurationText,
} from './archiveJobFilter'

export default function ArchiveJobSummary({ jobId }: { jobId: string }) {
  const { t, resolvedLocale } = useI18n()
  // null means "not known yet" (loading, or the probe failed). Either way the
  // strip stays absent instead of guessing.
  const [jobs, setJobs] = useState<AutomationJobData[] | null>(null)

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      try {
        const result = await window.electronAPI.automationList()
        if (!cancelled) setJobs(Array.isArray(result?.jobs) ? result.jobs : [])
      } catch {
        // The archive owns the ledger; a scheduler probe that fails only drops
        // this optional strip.
        if (!cancelled) setJobs(null)
      }
    }
    void refresh()
    // The scheduler broadcasts after every run and CRUD change, including the
    // ones it starts on its own clock.
    const unsubscribe = window.electronAPI.onAutomationChanged(() => { void refresh() })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const job = jobs ? findJob(jobs, jobId) : null
  // A deleted job vanishes here while the archive's own selection rule clears
  // the filter; rendering nothing keeps that hand-off from throwing or flashing
  // a stale summary.
  if (!job) return null

  const outcome = jobLastOutcomeText(job, t)
  const streak = failureStreakText(job, t)
  const spend = deriveJobSpend(job, t)
  const stats = deriveJobRunStats(job.history)

  const stateText = job.enabled
    ? [
        t('automation.enabled'),
        // Only an enabled job has a meaningful next run; a paused one would be
        // advertising a time it will not keep.
        job.nextRunAt !== null
          ? t('automation.nextRun', { time: formatDateTimeShort(resolvedLocale, job.nextRunAt) })
          : null,
      ].filter((part): part is string => part !== null).join(' · ')
    : t('archive.jobSummary.paused')

  const runText = stats.total > 0
    ? [
        // Name the window: `history` is capped by the scheduler, so these counts
        // describe the remembered runs, never the job's whole life.
        t('archive.jobSummary.runStats', {
          success: stats.succeeded,
          failed: stats.failed,
          skipped: stats.skipped,
          total: stats.total,
        }),
        stats.averageSuccessMs !== null
          ? t('archive.jobSummary.average', { duration: runDurationText(stats.averageSuccessMs, t) })
          : null,
      ].filter((part): part is string => part !== null).join(' · ')
    : null

  return (
    <div style={{ flexShrink: 0, padding: '4px 16px 0' }}>
      {/* One/two muted lines behind a thin rule — deliberately quieter than the
          ledger's rows, and wrapping rather than pushing the page wider. */}
      <div
        role="group"
        aria-label={t('archive.jobSummary.label')}
        style={{
          display: 'flex', flexDirection: 'column', gap: 1,
          minWidth: 0, maxWidth: '100%',
          paddingLeft: 10, borderLeft: '2px solid var(--border)',
          fontSize: 10, lineHeight: 1.5, color: 'var(--text-muted)',
          overflowWrap: 'anywhere',
        }}
      >
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'baseline',
          columnGap: 10, rowGap: 1, minWidth: 0,
        }}>
          <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{stateText}</span>
          <span style={{ color: outcome.color }}>{outcome.text}</span>
          {streak && <span style={{ color: 'var(--danger-text)' }}>{streak}</span>}
          {spend && (
            <span title={spend.title || undefined} style={{ color: 'var(--text-subtle)' }}>
              {spend.text}
            </span>
          )}
        </div>
        {runText && (
          <div style={{ minWidth: 0, color: 'var(--text-subtle)' }}>{runText}</div>
        )}
      </div>
    </div>
  )
}
