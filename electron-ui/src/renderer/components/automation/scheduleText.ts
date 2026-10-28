// Shared trigger vocabulary for automations.
//
// Settings -> Automations and the workflow page both describe the same
// triggers, so the wording lives here once. `describeCron` also lets the
// create/edit dialog round-trip a stored cron back into its day/time fields.

import type { AutomationJobData, AutomationTriggerData } from '../../../preload'

/** Same shape as the `t` returned by `useI18n()`. */
export type Translate = (key: string, params?: Record<string, string | number>) => string

/**
 * The watch member of the trigger union. Derived from the wire type instead of
 * declared again here, so the renderer cannot drift from what main accepts.
 */
type WatchTrigger = Extract<AutomationTriggerData, { kind: 'watch' }>

/** Mirrors the main process default; only the pre-save state relies on it. */
export const DEFAULT_WATCH_DEBOUNCE_MINUTES = 5

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** `HH:MM`, the form an `<input type="time">` expects. */
export function clockText(hour: number, minute: number): string {
  return `${pad(hour)}:${pad(minute)}`
}

export interface CronFields {
  kind: 'daily' | 'weekly' | 'monthly'
  hour: number
  minute: number
  weekday?: number
  /** Monthly only. 1-31. */
  dayOfMonth?: number
}

/** Render a stored cron back into the dialog's fields, or null when custom. */
export function describeCron(expr: string): CronFields | null {
  const [min, hour, dom, month, dow] = expr.trim().split(/\s+/)
  if (!/^\d{1,2}$/.test(min) || !/^\d{1,2}$/.test(hour) || month !== '*') return null
  const minute = Number(min)
  const h = Number(hour)
  if (minute > 59 || h > 23) return null
  if (dom === '*' && dow === '*') return { kind: 'daily', hour: h, minute }
  if (dom === '*' && /^[0-6]$/.test(dow)) return { kind: 'weekly', hour: h, minute, weekday: Number(dow) }
  // Monthly: exactly one day of the month, weekday wildcarded. A list (`1,15`),
  // a range (`1-7`), a step, or a constrained weekday paired with a day uses
  // POSIX OR semantics or more than one day; the dialog has a single day field
  // and must not silently rewrite any of those, so they stay "Custom cron".
  if (/^\d{1,2}$/.test(dom) && dow === '*') {
    const dayOfMonth = Number(dom)
    if (dayOfMonth >= 1 && dayOfMonth <= 31) return { kind: 'monthly', hour: h, minute, dayOfMonth }
  }
  return null
}

/**
 * English ordinal suffix for a day number: 1st, 2nd, 3rd, 4th, 11th, 21st,
 * 22nd, 23rd, 31st. The 11-13 exception is why the last digit alone is not
 * enough. Locales that do not use an ordinal suffix (zh-CN) simply leave the
 * `{{ordinal}}` placeholder out of their template — see `dayOfMonthText`.
 */
export function ordinalSuffix(day: number): string {
  const n = Math.abs(Math.trunc(day))
  const lastTwo = n % 100
  if (lastTwo >= 11 && lastTwo <= 13) return 'th'
  const last = n % 10
  if (last === 1) return 'st'
  if (last === 2) return 'nd'
  if (last === 3) return 'rd'
  return 'th'
}

/**
 * A day of the month as a label: "21st" in English, "21" in Chinese. The two
 * templates share one key, and the one that has no use for the suffix drops
 * the placeholder rather than branching here on the locale.
 */
export function dayOfMonthText(t: Translate, day: number): string {
  return t('automation.schedule.monthlyDay', { count: day, ordinal: ordinalSuffix(day) })
}

/**
 * Whether a path reads as a folder, for wording only. Main owns the real
 * answer; this decides whether the "subfolders" clause is worth saying at all,
 * because claiming it about a plain file would be wrong. A trailing separator
 * or a dotless last segment both read as a folder ("Notes" with no extension is
 * likelier to be a folder than a file).
 */
function looksLikeDirectory(path: string): boolean {
  const trimmed = path.trim()
  if (trimmed === '') return false
  if (/[\\/]$/.test(trimmed)) return true
  const last = trimmed.split(/[\\/]/).filter(Boolean).pop() ?? ''
  if (/^[a-zA-Z]:$/.test(last)) return true
  return !last.includes('.')
}

/**
 * A watch job runs on an event, so its sentence never mentions a time. The
 * recursion and quiet-period clauses are appended only when the caller has
 * room for them (the dialog); a settings row shows the bare sentence.
 */
function watchText(t: Translate, trigger: WatchTrigger, withDetail: boolean): string {
  const sentence = t('automation.schedule.watch', { path: trigger.path })
  if (!withDetail) return sentence
  const parts = [sentence]
  if (looksLikeDirectory(trigger.path)) {
    // `recursive` is optional on the wire and defaults to true, so only an
    // explicit false narrows the watch to the folder itself.
    parts.push(trigger.recursive === false
      ? t('automation.schedule.watchFlat')
      : t('automation.schedule.watchRecursive'))
  }
  parts.push(t('automation.schedule.watchQuiet', {
    minutes: trigger.debounceMinutes ?? DEFAULT_WATCH_DEBOUNCE_MINUTES,
  }))
  return parts.join(' · ')
}

/**
 * One-line human description of a trigger, in the scheduler's own terms.
 *
 * Total over every trigger kind: every branch returns a non-empty sentence, so
 * a row can never render blank. `withDetail` adds the clauses only a wide
 * surface can afford.
 */
export function scheduleText(t: Translate, trigger: AutomationTriggerData, withDetail = false): string {
  if (trigger.kind === 'watch') return watchText(t, trigger, withDetail)
  if (trigger.kind === 'interval') {
    const n = trigger.minutes
    if (n % 1440 === 0) return t('automation.schedule.everyDays', { count: n / 1440 })
    if (n % 60 === 0) return t('automation.schedule.everyHours', { count: n / 60 })
    return t('automation.schedule.everyMinutes', { count: n })
  }
  const parsed = describeCron(trigger.expr)
  if (!parsed) return t('automation.schedule.cron', { expr: trigger.expr })
  const time = clockText(parsed.hour, parsed.minute)
  if (parsed.kind === 'daily') return t('automation.schedule.daily', { time })
  if (parsed.kind === 'monthly') {
    // "Monthly on the 1st at 09:00" / "每月 1 日 09:00". The ordinal travels as
    // part of the day label so the zh template never sees an English suffix.
    return t('automation.schedule.monthly', {
      day: dayOfMonthText(t, parsed.dayOfMonth ?? 1),
      time,
    })
  }
  return t('automation.schedule.weekly', {
    day: t(`automation.weekdays.${parsed.weekday ?? 0}`),
    time,
  })
}

/**
 * The one way a watch job can be broken that a calendar job cannot be: its
 * path is gone, so the watcher was never attached and nothing will fire. Null
 * for every other case, so a caller renders the warning without inspecting the
 * trigger itself.
 *
 * While the global pause is on the warning still applies — the path is missing
 * whether or not scheduling is suspended — so the callers keep their existing
 * paused treatment alongside this.
 */
export function watchWarningText(
  job: Pick<AutomationJobData, 'trigger' | 'watchMissing'>,
  t: Translate,
): string | null {
  if (job.trigger.kind !== 'watch' || job.watchMissing !== true) return null
  return t('automation.schedule.watchMissing')
}
