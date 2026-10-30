/**
 * Repeat rules for tasks, kept free of Electron so the store, the renderer's
 * type imports and a plain-Node harness all share one definition of "next
 * occurrence".
 *
 * Days are local calendar days (`YYYY-MM-DD`), never timestamps: the store's
 * `dueOn` is a day, and adding 86_400_000 ms would drift across DST and land on
 * the wrong date twice a year. Every step here builds a `Date(y, m - 1, d + n)`
 * in local time and reads the local fields back.
 */

export const TASK_REPEATS = ['daily', 'weekly', 'monthly'] as const
export type TaskRepeat = typeof TASK_REPEATS[number]

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isTaskRepeat(value: unknown): value is TaskRepeat {
  return typeof value === 'string' && (TASK_REPEATS as readonly string[]).includes(value)
}

/**
 * The IPC boundary may carry anything, so the value is narrowed here. `null`
 * means "clear the repeat"; an absent field is handled by the caller as
 * "leave it alone" and must not reach this function unless it means clear.
 */
export function normalizeRepeat(value: unknown): { ok: true; value: TaskRepeat | null } | { ok: false } {
  if (value === null) return { ok: true, value: null }
  if (isTaskRepeat(value)) return { ok: true, value }
  return { ok: false }
}

interface CalendarDay {
  year: number
  month: number
  day: number
}

function parseDay(day: string): CalendarDay {
  const match = DAY_RE.exec(day)
  if (!match) throw new RangeError(`Not a calendar day: ${day}`)
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

function formatDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * The local day a task is owed after its current occurrence is finished.
 *
 * `fromDay` is the occurrence being completed; `undefined` means the task had
 * no due day, so the series starts from the day after `todayDay` (tomorrow for
 * daily, seven days out for weekly, one calendar month for monthly). `todayDay`
 * is only consulted in that no-due-day case — from an existing due day the step
 * is always exactly one interval, even if the task was finished late.
 *
 * Monthly clamping follows calendar apps: 31 Jan → 28/29 Feb, and the *stored*
 * day is then what the next step uses, so Feb 28 → 28 Mar rather than drifting
 * back to 31. A shorter target month clamps to its last day; it never rolls
 * over into the following month the way `new Date(y, m, 31)` would.
 */
export function nextOccurrenceDay(
  fromDay: string | undefined,
  repeat: TaskRepeat,
  todayDay: string,
): string {
  const base = parseDay(fromDay ?? todayDay)

  if (repeat === 'monthly') {
    // Month indices are 0-based; the current month plus one is `base.month`.
    const targetIndex = base.month
    const targetYear = base.year + Math.floor(targetIndex / 12)
    const targetMonth = targetIndex % 12
    // Day 0 of the following month is the last day of the target month.
    const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate()
    return formatDay(new Date(targetYear, targetMonth, Math.min(base.day, lastDay)))
  }

  const step = repeat === 'daily' ? 1 : 7
  return formatDay(new Date(base.year, base.month - 1, base.day + step))
}

/** Today as the same local `YYYY-MM-DD` the store persists. */
export function localTodayDay(): string {
  return formatDay(new Date())
}
