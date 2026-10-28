// Pure derivations for the automation group in the command palette.
//
// The palette's filter only reads `name` and `description`, so everything the
// user might search a scheduled job by — its name, its schedule, whether it is
// turned off, waiting on a path, overdue, running or failed — has to reach one
// of those two strings. Keeping that derivation out of the React file also lets
// the harness pin the clock and exercise every state without a DOM or a
// translation provider.

import type { AutomationJobData } from '../../../preload'
import type { AppLocale } from '../../utils/formatDate'
import { failureStreakText } from '../archive/archiveJobFilter'
import { nextRunText } from '../automation/nextRunText'
import { scheduleText, type Translate } from '../automation/scheduleText'
import { outcomeText } from '../workflows/scheduleSummary'

export type AutomationCommandKind = 'open' | 'run' | 'manage'

/** One palette row: a job plus the action the row performs on it. */
export interface AutomationCommandDescriptor {
  id: string
  kind: AutomationCommandKind
  job: AutomationJobData
  name: string
  description: string
}

/**
 * A run is in flight when the scheduler says so, or when the last recorded
 * status is still `running` — the list can lag a beat behind the process.
 */
export function isAutomationRunning(job: AutomationJobData): boolean {
  return job.running || job.lastStatus === 'running'
}

/**
 * Whether a fresh run can be started. A live run already owns the job, and a
 * job whose workflow was deleted has nothing to execute — the scheduler would
 * reject both, so the palette must not offer them.
 */
export function canRunAutomation(job: AutomationJobData): boolean {
  return !isAutomationRunning(job) && !job.actionMissing
}

/**
 * `Every day at 09:00 · Next run: Oct 30, 2026, 9:00 AM · Failed: hourly_limit ·
 * 2h ago · Failing — 2 failures in a row`
 *
 * The timing segment is the same clause Settings → Automations and the archive
 * print, verbatim: turned off (never a stale timestamp), waiting on the watched
 * path, no scheduled occurrence, due now / overdue, or a real future time. The
 * palette is the one surface a user can search a job by its state, so it must
 * not keep its own private reading of the scheduler — a past occurrence printed
 * under "Next run:" is exactly the lie this helper exists to prevent.
 *
 * The outcome segment is the same wording the workflow strip and Settings use,
 * including the raw error code when the locale has no sentence for it. The
 * streak segment appears only from the second consecutive failure, so "failing"
 * finds a job even when its schedule and outcome alone would not say so.
 */
export function automationDescription(
  job: AutomationJobData,
  t: Translate,
  locale: AppLocale,
  now: number,
): string {
  const schedule = scheduleText(t, job.trigger)
  // `locale` is the resolved app locale, not React context: the helper formats
  // the absolute time itself, so the builder stays a pure function of its args.
  const timing = nextRunText(job, t, locale, now).text
  // `automation.palette.paused` is deliberately no longer used here: "Paused"
  // was this surface's private word for `enabled === false`, and it read as a
  // temporary state beside Settings' "Turned off".
  //
  // From the second consecutive failure the row owes the user a state word:
  // the outcome segment only reports the last run, so "Failed" alone cannot
  // tell a one-off from a job that keeps failing, and a user searching
  // "failing" would find nothing. The archive's sentence supplies the count
  // and the ≥2 threshold; an enabled job gets the present-tense word in front
  // because it will run again, while a turned-off job's streak is history and
  // must not be described as still happening.
  const streak = failureStreakText(job, t)
  const streakText = streak
    ? job.enabled
      ? t('automation.palette.failing', { streak })
      : streak
    : null

  return [schedule, timing, outcomeText(job, t, now).text, streakText]
    .filter((part): part is string => Boolean(part))
    .join(' · ')
}

/**
 * Rows for every job, or none when the probe failed (`null`) or found nothing.
 *
 * A job gets one primary row — the only one that carries its bare name, so
 * typing the name ranks it first. That row opens the last conversation when
 * there is one; otherwise the only useful destination is the Settings page
 * that owns the job. Run and Manage are separate rows rather than buttons on
 * the primary row because the palette navigates with the arrow keys: every
 * action has to be a row to stay keyboard-reachable.
 */
export function buildAutomationDescriptors(
  jobs: readonly AutomationJobData[] | null,
  t: Translate,
  locale: AppLocale,
  now: number,
): AutomationCommandDescriptor[] {
  if (!jobs || jobs.length === 0) return []

  const descriptors: AutomationCommandDescriptor[] = []
  for (const job of jobs) {
    const description = automationDescription(job, t, locale, now)
    const canOpen = Boolean(job.lastSessionId)

    descriptors.push({
      id: `automation-job-${job.id}`,
      kind: canOpen ? 'open' : 'manage',
      job,
      name: canOpen ? job.name : `${job.name} · ${t('automation.palette.manage')}`,
      description,
    })

    if (canRunAutomation(job)) {
      descriptors.push({
        id: `automation-run-${job.id}`,
        kind: 'run',
        job,
        name: `${job.name} · ${t('automation.runNow')}`,
        description,
      })
    }

    // The primary row already manages a job with no transcript.
    if (canOpen) {
      descriptors.push({
        id: `automation-manage-${job.id}`,
        kind: 'manage',
        job,
        name: `${job.name} · ${t('automation.palette.manage')}`,
        description,
      })
    }
  }
  return descriptors
}
