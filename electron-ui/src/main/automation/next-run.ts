/**
 * When a trigger next fires, computed from an instant.
 *
 * Extracted from the scheduler because the trash needs the same answer when it
 * re-arms a restored job. Keeping one function means "restore starts the
 * schedule from now" cannot drift from the maths the ticker and the dialog
 * preview already use.
 *
 * `after` is exclusive of nothing: an interval job adds its minutes to the
 * given instant, while a cron is asked for the first occurrence strictly after
 * it.
 */
import { nextFireTime } from '../utils/cron'
import type { AutomationTrigger } from './types'

export function nextRunAfter(trigger: AutomationTrigger, after: number): number | null {
  if (trigger.kind === 'cron') {
    const next = nextFireTime(trigger.expr, new Date(after))
    return next ? next.getTime() : null
  }
  // A watch job has no calendar. Its next run is the next file-system event,
  // which this process cannot predict, so "never" is the only honest answer —
  // and it is also what keeps the due-tick from ever choosing the job.
  if (trigger.kind === 'watch') return null
  return after + trigger.minutes * 60_000
}
