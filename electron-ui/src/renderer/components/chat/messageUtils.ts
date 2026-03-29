// Message utility functions and shared state
// Extracted from Message.tsx for decomposition

/** Module-level timestamp display mode: false = relative ("2m ago"), true = absolute ("2:30 PM") */
let _showAbsoluteTime = (() => {
  try {
    return localStorage.getItem('aipa:timestampMode') === 'absolute'
  } catch { return false }
})()

export function getShowAbsoluteTime(): boolean {
  return _showAbsoluteTime
}

export function toggleShowAbsoluteTime(): void {
  _showAbsoluteTime = !_showAbsoluteTime
  try {
    localStorage.setItem('aipa:timestampMode', _showAbsoluteTime ? 'absolute' : 'relative')
  } catch { /* ignore */ }
}

/** Format response duration (milliseconds) to human-readable string */
export function formatResponseDuration(ms: number): string {
  const secs = Math.round(ms / 1000)
  if (secs < 1) return ''
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const remSecs = secs % 60
  return remSecs > 0 ? `${mins}m ${remSecs}s` : `${mins}m`
}

/** Format timestamp as absolute time with contextual date prefix */
export function formatAbsoluteTime(ts: number, t: (key: string) => string): string {
  const d = new Date(ts)
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  if (isSameDay(d, now)) return `${t('session.today')} ${timeStr}`
  if (isSameDay(d, yesterday)) return `${t('session.yesterday')} ${timeStr}`
  const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${dateStr} ${timeStr}`
}

/** Format timestamp as relative time ("just now", "2m ago", etc.) */
export function relativeTime(ts: number, t: (key: string, p?: Record<string, string>) => string): string {
  const diff = Date.now() - ts
  if (diff < 10_000) return t('message.justNow')
  if (diff < 60_000) return t('message.secsAgo', { count: String(Math.floor(diff / 1000)) })
  if (diff < 3_600_000) return t('message.minsAgo', { count: String(Math.floor(diff / 60_000)) })
  if (diff < 86_400_000) return t('message.hoursAgo', { count: String(Math.floor(diff / 3_600_000)) })
  return t('message.daysAgo', { count: String(Math.floor(diff / 86_400_000)) })
}
