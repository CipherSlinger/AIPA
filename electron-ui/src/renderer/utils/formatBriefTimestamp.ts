// formatBriefTimestamp — context-sensitive timestamp formatter (Iteration 499)
// Ported from Claude Code sourcemap: src/utils/formatBriefTimestamp.ts
// Adapted for browser (no process.env POSIX locale — uses navigator.language instead).

/**
 * Format a timestamp for message display. Scales with age:
 *   - same day:       "1:30 PM" (or "13:30" locale-dependent)
 *   - within 6 days:  "Sunday, 4:15 PM"
 *   - older:          "Sunday, Feb 20, 4:30 PM"
 *
 * `now` is injectable for tests.
 */
export function formatBriefTimestamp(timestamp: string | number | Date, now: Date = new Date()): string {
  const d = timestamp instanceof Date ? timestamp : new Date(timestamp)
  if (Number.isNaN(d.getTime())) return ''

  const locale = navigator.language || undefined
  const dayDiff = startOfDay(now) - startOfDay(d)
  const daysAgo = Math.round(dayDiff / 86_400_000)

  if (daysAgo === 0) {
    return d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
  }

  if (daysAgo > 0 && daysAgo < 7) {
    return d.toLocaleString(locale, { weekday: 'long', hour: 'numeric', minute: '2-digit' })
  }

  return d.toLocaleString(locale, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}
