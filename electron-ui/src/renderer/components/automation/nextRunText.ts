// When a scheduled job will fire next, as one honest clause.
//
// Settings → Automations and the archive's selected-job summary both answer
// "when does this run again". The scheduler owns `nextRunAt`, including the two
// cases a naive "Next run" label gets wrong: null by design (a watch job, whose
// next run is a file-system event) and a timestamp in the past (a tick that is
// late, or an occurrence that came due while AIPA was closed). This module turns
// those states into distinct sentences so no caller prints a past timestamp as
// if it were upcoming, or calls a healthy watcher a dead schedule.
//
// Pure apart from the formatters; `now` is a parameter so a harness can pin it.

import type { AutomationJobData } from '../../../preload'
import { formatDateTimeShort, type AppLocale } from '../../utils/formatDate'
import { relativeTimeText } from '../workflows/scheduleSummary'
import { clockText, type Translate } from './scheduleText'

/** The narrowest job shape this module needs; every automation job satisfies it. */
export type NextRunJob = Pick<AutomationJobData, 'enabled' | 'trigger' | 'nextRunAt'>

export type NextRunState =
  /** Switched off. A leftover `nextRunAt` is not a promise. */
  | 'off'
  /** A watch job: its next run is a file-system event, not a clock time. */
  | 'watching'
  /** Enabled, but the schedule has no occurrence at all (a dead cron). */
  | 'none'
  /** The occurrence is due within seconds; the scheduler tick has not landed yet. */
  | 'due'
  /** The occurrence is already in the past: a late tick or a missed launch. */
  | 'overdue'
  /** A real future occurrence. */
  | 'scheduled'

export interface NextRunDescription {
  state: NextRunState
  text: string
  /** True only for `overdue`; callers may warn without parsing the sentence. */
  overdue: boolean
}

/** A past occurrence this recent reads as "due now" rather than "overdue". */
const DUE_NOW_WINDOW_MS = 60_000

/**
 * Past this distance a date plus a clock time reads better than a countdown.
 * Twelve hours keeps "in 12 h" from becoming "in 23 h" for a run late tonight.
 */
const RELATIVE_HORIZON_MS = 12 * 60 * 60 * 1000

/** Whether `ts` falls on the calendar day after `from`, in local time. */
function isNextCalendarDay(from: number, ts: number): boolean {
  const start = new Date(from)
  const expected = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1)
  const target = new Date(ts)
  return target.getFullYear() === expected.getFullYear()
    && target.getMonth() === expected.getMonth()
    && target.getDate() === expected.getDate()
}

/**
 * A forward-looking phrase for a close occurrence ("in 12 min"), or null when
 * the absolute timestamp is enough.
 *
 * The shared `relativeTimeText` cannot serve here: it is past-only and clamps
 * a future timestamp to "just now", which is the opposite of what a countdown
 * needs. Its vocabulary is still reused for the past direction below.
 */
function upcomingRelative(nextRunAt: number, t: Translate, now: number): string | null {
  const diff = nextRunAt - now
  // Round up so a run 30 seconds away never reads "in 0 min".
  if (diff < DUE_NOW_WINDOW_MS) return t('automation.nextRun.relative.soon')
  if (diff < 60 * 60 * 1000) {
    return t('automation.nextRun.relative.minutes', { count: Math.ceil(diff / 60_000) })
  }
  // Overnight runs read more naturally as "tomorrow at 09:00" than as a
  // countdown; the clock part reuses the same 24-hour form the schedule line
  // already uses in both locales.
  if (isNextCalendarDay(now, nextRunAt)) {
    const target = new Date(nextRunAt)
    return t('automation.nextRun.relative.tomorrowAt', {
      time: clockText(target.getHours(), target.getMinutes()),
    })
  }
  if (diff <= RELATIVE_HORIZON_MS) {
    return t('automation.nextRun.relative.hours', { count: Math.round(diff / 3_600_000) })
  }
  return null
}

/**
 * What a row should say about this job's next occurrence. Total over every
 * state: the returned text is never empty.
 */
export function nextRunText(
  job: NextRunJob,
  t: Translate,
  locale: AppLocale,
  now: number = Date.now(),
): NextRunDescription {
  // A switched-off job owns no next run, whatever a stale timestamp says. The
  // scheduler clears `nextRunAt` on disable, but a crash between the two writes
  // (or an older store) can leave a value behind; reading it as upcoming would
  // promise a run that cannot happen.
  if (!job.enabled) {
    return { state: 'off', text: t('automation.nextRun.off'), overdue: false }
  }

  // Check the trigger before the null timestamp. A watch job's null is not a
  // missing schedule — it is a schedule without a clock — so "no next run"
  // would misdescribe a healthy watcher as a dead cron.
  if (job.trigger.kind === 'watch') {
    return { state: 'watching', text: t('automation.nextRun.watching'), overdue: false }
  }

  const nextRunAt = job.nextRunAt
  if (nextRunAt === null) {
    return { state: 'none', text: t('automation.nextRun.none'), overdue: false }
  }

  // A past timestamp is a fact about a missed tick, never an upcoming run.
  // Name it as due or overdue instead of formatting it under "Next run:".
  // The age reuses the app's only relative vocabulary, which is past-only.
  if (nextRunAt <= now) {
    const lateBy = now - nextRunAt
    if (lateBy < DUE_NOW_WINDOW_MS) {
      return { state: 'due', text: t('automation.nextRun.due'), overdue: false }
    }
    return {
      state: 'overdue',
      text: t('automation.nextRun.overdue', { time: relativeTimeText(nextRunAt, t, now) }),
      overdue: true,
    }
  }

  // A running job deliberately has no branch: the scheduler advances
  // `nextRunAt` when a run starts, so the next occurrence is exactly what the
  // row should keep showing. "Running" already occupies the status line, and
  // replacing this clause with it would answer a different question.
  const absolute = formatDateTimeShort(locale, nextRunAt)
  const relative = upcomingRelative(nextRunAt, t, now)
  return {
    state: 'scheduled',
    text: relative
      ? t('automation.nextRun.withRelative', { time: absolute, relative })
      : t('automation.nextRun.scheduled', { time: absolute }),
    overdue: false,
  }
}
