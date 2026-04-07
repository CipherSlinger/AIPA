/**
 * cronScheduler.ts — Lightweight cron expression parser and scheduler (Iteration 482).
 * Inspired by Claude Code's utils/cronScheduler.ts.
 *
 * Supports standard 5-field cron: "minute hour day-of-month month day-of-week"
 * - Wildcards: *
 * - Lists: 1,3,5
 * - Ranges: 1-5
 * - Steps: *\/5
 *
 * Used by TasksPanel for custom reminder scheduling.
 * Durable cron jobs are persisted to electron-store under prefs key 'cronJobs'.
 */

export interface CronJob {
  id: string           // 'cron-' + timestamp
  prompt: string       // reminder text / prompt to send
  cron: string         // 5-field cron expression in local time
  durable: boolean     // persists across restarts if true
  recurring: boolean   // false = fire once and delete
  createdAt: number
  lastFiredAt?: number
  nextFireAt: number   // pre-computed epoch ms (for display)
}

/**
 * Parse a single cron field into an array of valid values.
 * Supports: *, n, n-m, n/step, */step, lists (comma-separated)
 */
function parseField(field: string, min: number, max: number): number[] {
  const results = new Set<number>()

  for (const part of field.split(',')) {
    const trimmed = part.trim()

    if (trimmed === '*') {
      for (let i = min; i <= max; i++) results.add(i)
    } else if (trimmed.includes('/')) {
      const [base, stepStr] = trimmed.split('/')
      const step = parseInt(stepStr, 10)
      if (isNaN(step) || step <= 0) continue
      const start = base === '*' ? min : parseInt(base, 10)
      for (let i = start; i <= max; i += step) results.add(i)
    } else if (trimmed.includes('-')) {
      const [fromStr, toStr] = trimmed.split('-')
      const from = parseInt(fromStr, 10)
      const to = parseInt(toStr, 10)
      for (let i = from; i <= to; i++) results.add(i)
    } else {
      const n = parseInt(trimmed, 10)
      if (!isNaN(n)) results.add(n)
    }
  }

  return [...results].filter(n => n >= min && n <= max).sort((a, b) => a - b)
}

/**
 * Parse a 5-field cron expression into field arrays.
 * Returns null if the expression is invalid.
 */
export function parseCron(expr: string): {
  minutes: number[]
  hours: number[]
  doms: number[]
  months: number[]
  dows: number[]
} | null {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return null

  try {
    return {
      minutes: parseField(parts[0], 0, 59),
      hours: parseField(parts[1], 0, 23),
      doms: parseField(parts[2], 1, 31),
      months: parseField(parts[3], 1, 12),
      dows: parseField(parts[4], 0, 6),
    }
  } catch {
    return null
  }
}

/**
 * Compute the next fire time (epoch ms) for a cron expression after `after`.
 * Returns null if no next time can be found within 2 years.
 */
export function nextFireTime(expr: string, after: Date = new Date()): Date | null {
  const parsed = parseCron(expr)
  if (!parsed) return null

  const { minutes, hours, doms, months, dows } = parsed
  if (!minutes.length || !hours.length || !doms.length || !months.length || !dows.length) return null

  // Start checking from 1 minute after `after`
  const candidate = new Date(after.getTime())
  candidate.setSeconds(0, 0)
  candidate.setMinutes(candidate.getMinutes() + 1)

  // Search up to 2 years
  const deadline = new Date(after.getTime() + 366 * 2 * 24 * 60 * 60 * 1000)

  while (candidate < deadline) {
    const month = candidate.getMonth() + 1  // 1-based

    // Skip to next valid month if current month not in list
    if (!months.includes(month)) {
      candidate.setMonth(candidate.getMonth() + 1, 1)
      candidate.setHours(0, 0, 0, 0)
      continue
    }

    const dom = candidate.getDate()
    const dow = candidate.getDay()           // 0=Sun

    // Skip to next day if dom or dow doesn't match
    if (!doms.includes(dom) || !dows.includes(dow)) {
      candidate.setDate(candidate.getDate() + 1)
      candidate.setHours(0, 0, 0, 0)
      continue
    }

    const hour = candidate.getHours()

    // Skip to next hour if hour doesn't match
    if (!hours.includes(hour)) {
      candidate.setHours(candidate.getHours() + 1, 0, 0, 0)
      continue
    }

    const min = candidate.getMinutes()

    if (minutes.includes(min)) {
      return new Date(candidate)
    }

    // Advance by 1 minute within the valid hour
    candidate.setMinutes(candidate.getMinutes() + 1)
  }

  return null
}

/**
 * Convert a cron expression to a human-readable frequency string.
 * E.g. "*/5 * * * *" → "Every 5 minutes", "0 9 * * 1-5" → "Weekdays at 9:00 AM"
 * Inspired by Claude Code's utils/cronScheduler.ts cronToHuman().
 */
export function cronToHuman(expr: string): string | null {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const [min, hr, dom, mon, dow] = parts

  // Every minute
  if (min === '*' && hr === '*' && dom === '*' && mon === '*' && dow === '*') return 'Every minute'

  // Every N minutes (*/N * * * *)
  if (min.startsWith('*/') && hr === '*' && dom === '*' && mon === '*' && dow === '*') {
    const n = parseInt(min.slice(2), 10)
    if (!isNaN(n) && n > 1) return `Every ${n} minutes`
    return 'Every minute'
  }

  // Hourly (0 * * * *)
  if (min === '0' && hr === '*' && dom === '*' && mon === '*' && dow === '*') return 'Every hour'

  // Every N hours (0 */N * * *)
  if (min === '0' && hr.startsWith('*/') && dom === '*' && mon === '*' && dow === '*') {
    const n = parseInt(hr.slice(2), 10)
    if (!isNaN(n)) return `Every ${n} hours`
  }

  // Helper: format hour/minute as "9:00 AM"
  const fmtTime = (h: number, m: number) => {
    const period = h < 12 ? 'AM' : 'PM'
    const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${displayH}:${String(m).padStart(2, '0')} ${period}`
  }

  // Daily at specific time (M H * * *)
  if (dom === '*' && mon === '*' && dow === '*' && !min.includes('*') && !hr.includes('*')) {
    const h = parseInt(hr, 10)
    const m = parseInt(min, 10)
    if (!isNaN(h) && !isNaN(m)) return `Every day at ${fmtTime(h, m)}`
  }

  // Weekdays (M H * * 1-5)
  if (dom === '*' && mon === '*' && dow === '1-5' && !min.includes('*') && !hr.includes('*')) {
    const h = parseInt(hr, 10)
    const m = parseInt(min, 10)
    if (!isNaN(h) && !isNaN(m)) return `Weekdays at ${fmtTime(h, m)}`
  }

  // Weekends (M H * * 0,6 or 6,0)
  if (dom === '*' && mon === '*' && (dow === '0,6' || dow === '6,0' || dow === '0-6') && !min.includes('*') && !hr.includes('*')) {
    const h = parseInt(hr, 10)
    const m = parseInt(min, 10)
    if (!isNaN(h) && !isNaN(m)) return `Weekends at ${fmtTime(h, m)}`
  }

  // Specific day of week (M H * * N)
  const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  if (dom === '*' && mon === '*' && !dow.includes('*') && !dow.includes('-') && !dow.includes(',')) {
    const d = parseInt(dow, 10)
    const h = parseInt(hr, 10)
    const m = parseInt(min, 10)
    if (!isNaN(d) && d >= 0 && d <= 6 && !isNaN(h) && !isNaN(m)) {
      return `Every ${DOW_NAMES[d]} at ${fmtTime(h, m)}`
    }
  }

  // Monthly (M H D * *)
  if (dom !== '*' && mon === '*' && dow === '*' && !min.includes('*') && !hr.includes('*') && !dom.includes('*')) {
    const h = parseInt(hr, 10)
    const m = parseInt(min, 10)
    const d = parseInt(dom, 10)
    if (!isNaN(h) && !isNaN(m) && !isNaN(d)) return `Monthly on day ${d} at ${fmtTime(h, m)}`
  }

  // Fall back to next-fire description
  return null
}

/**
 * Validate a cron expression and return a human-readable description.
 */
export function describeCron(expr: string): string | null {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const parsed = parseCron(expr)
  if (!parsed) return null

  const next = nextFireTime(expr)
  if (!next) return 'No valid fire time found'

  const d = next
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()
  const diffMin = Math.round(diffMs / 60000)

  if (diffMin < 60) return `Next: in ${diffMin} min`
  if (diffMin < 1440) return `Next: in ${Math.floor(diffMin / 60)}h ${diffMin % 60}m`

  const label = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  return `Next: ${label}`
}

/** Common cron presets for the UI picker */
export const CRON_PRESETS = [
  { label: 'Every 5 minutes', labelKey: 'cronPresets.every5min', cron: '*/5 * * * *' },
  { label: 'Every hour', labelKey: 'cronPresets.everyHour', cron: '0 * * * *' },
  { label: 'Every morning (9am)', labelKey: 'cronPresets.everyMorning', cron: '0 9 * * *' },
  { label: 'Weekdays at 9am', labelKey: 'cronPresets.weekdayMorning', cron: '0 9 * * 1-5' },
  { label: 'Every day at noon', labelKey: 'cronPresets.everyNoon', cron: '0 12 * * *' },
  { label: 'Every evening (6pm)', labelKey: 'cronPresets.everyEvening', cron: '0 18 * * *' },
] as const
