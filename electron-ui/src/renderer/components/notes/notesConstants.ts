export const MAX_NOTES = 100
export const MAX_CONTENT_LENGTH = 10000
export const MAX_CATEGORIES = 10
export const MAX_CATEGORY_NAME = 20

export const CATEGORY_COLORS = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#6b7280', // gray
]

export function formatRelativeTime(ts: number, t: (key: string, params?: Record<string, string>) => string): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return t('notes.justNow')
  const mins = Math.floor(diff / 60)
  if (mins < 60) return t('notes.minsAgo', { count: String(mins) })
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return t('notes.hoursAgo', { count: String(hrs) })
  const days = Math.floor(hrs / 24)
  if (days === 1) return t('notes.yesterday')
  return t('notes.daysAgo', { count: String(days) })
}

export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
