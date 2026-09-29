/**
 * Minimal 5-field cron parser ("minute hour day-of-month month day-of-week").
 * Supports *, lists (1,3,5), ranges (1-5) and steps (star/5), with POSIX
 * OR semantics for dom/dow. Used to migrate legacy recurring reminders.
 */

// Parse a single cron field into an array of valid values.
// Supports: *, n, n-m, n/step, star/step, lists (comma-separated)
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
 * Uses POSIX cron OR semantics for dom/dow: when both are constrained (neither
 * is wildcarded), a day matches if EITHER dom OR dow matches.
 */
export function nextFireTime(expr: string, after: Date = new Date()): Date | null {
  const parsed = parseCron(expr)
  if (!parsed) return null

  const { minutes, hours, doms, months, dows } = parsed
  if (!minutes.length || !hours.length || !doms.length || !months.length || !dows.length) return null

  // Detect wildcarded fields (full range = wildcard)
  const domWild = doms.length === 31  // all days 1-31
  const dowWild = dows.length === 7   // all days 0-6

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

    // POSIX cron OR semantics for dom/dow:
    // - Both wildcarded: always match
    // - Only dom wildcarded: check dow
    // - Only dow wildcarded: check dom
    // - Neither wildcarded: match if EITHER matches
    const dayMatches =
      domWild && dowWild ? true
      : domWild ? dows.includes(dow)
      : dowWild ? doms.includes(dom)
      : doms.includes(dom) || dows.includes(dow)

    if (!dayMatches) {
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
