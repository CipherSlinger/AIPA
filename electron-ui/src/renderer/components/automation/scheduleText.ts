// Shared trigger vocabulary for automations.
//
// Settings -> Automations and the workflow page both describe the same
// triggers, so the wording lives here once. `describeCron` also lets the
// create/edit dialog round-trip a stored cron back into its day/time fields.

import type { AutomationTriggerData } from '../../../preload'

/** Same shape as the `t` returned by `useI18n()`. */
export type Translate = (key: string, params?: Record<string, string | number>) => string

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** `HH:MM`, the form an `<input type="time">` expects. */
export function clockText(hour: number, minute: number): string {
  return `${pad(hour)}:${pad(minute)}`
}

export interface CronFields {
  kind: 'daily' | 'weekly'
  hour: number
  minute: number
  weekday?: number
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
  return null
}

/** One-line human description of a trigger, in the scheduler's own terms. */
export function scheduleText(t: Translate, trigger: AutomationTriggerData): string {
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
  return t('automation.schedule.weekly', {
    day: t(`automation.weekdays.${parsed.weekday ?? 0}`),
    time,
  })
}
