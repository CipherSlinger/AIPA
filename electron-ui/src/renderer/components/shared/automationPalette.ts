// Pure derivations for the automation group in the command palette.
//
// The palette's filter only reads `name` and `description`, so everything the
// user might search a scheduled job by — its name, its schedule, whether it is
// paused, running or failed — has to reach one of those two strings. Keeping
// that derivation out of the React file also lets the harness pin the clock
// and exercise every state without a DOM or a translation provider.

import type { AutomationJobData } from '../../../preload'
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
 * `Every day at 09:00 · Next run: Oct 30, 2026, 9:00 AM · Succeeded · 2h ago`
 *
 * The timing segment follows the job's own state: enabled jobs name the next
 * occurrence, paused ones say so, and a job with no scheduled next run shows
 * only its schedule. The outcome segment is the same wording the workflow
 * strip and Settings use, including the raw error code when the locale has no
 * sentence for it.
 */
export function automationDescription(
  job: AutomationJobData,
  t: Translate,
  now: number,
  nextRunText: (ts: number) => string,
): string {
  const schedule = scheduleText(t, job.trigger)
  let timing = ''
  if (!job.enabled) timing = t('automation.palette.paused')
  // `automation.nextRun` is a namespace since the next-run helper landed; the
  // plain "Next run: <time>" sentence is its `scheduled` leaf.
  else if (job.nextRunAt !== null) timing = t('automation.nextRun.scheduled', { time: nextRunText(job.nextRunAt) })

  return [schedule, timing, outcomeText(job, t, now).text].filter(Boolean).join(' · ')
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
  now: number,
  nextRunText: (ts: number) => string,
): AutomationCommandDescriptor[] {
  if (!jobs || jobs.length === 0) return []

  const descriptors: AutomationCommandDescriptor[] = []
  for (const job of jobs) {
    const description = automationDescription(job, t, now, nextRunText)
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
