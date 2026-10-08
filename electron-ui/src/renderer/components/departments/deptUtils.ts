// Shared helpers for the department views (org chart + single department).
// Kept in its own module so OrgChart.tsx and DepartmentDashboard.tsx can both
// use them without importing each other.

/**
 * Encode a real directory path to Claude's project slug format.
 * Claude replaces all path separators (/ and \) and the Windows drive colon (:)
 * with hyphens, e.g. "C:\Users\osr\Desktop" → "C--Users-osr-Desktop".
 *
 * Comparing slugs is the only reliable match — the decoded `project` field is
 * lossy because decodeProjectSlug turns every hyphen back into a separator.
 */
export function dirToSlug(dir: string): string {
  return dir.replace(/[/\\:]/g, '-')
}

/** Last path segment of a directory, for compact display. */
export function baseName(dir: string): string {
  const parts = dir.replace(/\\/g, '/').replace(/\/+$/, '').split('/')
  return parts[parts.length - 1] || dir
}

/** Format a duration in ms to a compact human string: "2m", "1h 4m", "3d" */
export function formatDuration(ms: number): string {
  if (ms < 60000) return '<1m'
  const minutes = Math.floor(ms / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days >= 1) return `${days}d`
  if (hours >= 1) {
    const remainMins = minutes % 60
    return remainMins > 0 ? `${hours}h ${remainMins}m` : `${hours}h`
  }
  return `${minutes}m`
}

/** "刚刚" / "12 分钟前" / "3 天前" — units come from the session.* i18n keys. */
export function formatRelativeTime(timestamp: number, t: (key: string) => string): string {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return t('session.justNow')
  if (minutes < 60) return `${minutes}${t('session.minutesAgo')}`
  if (hours < 24) return `${hours}${t('session.hoursAgo')}`
  if (days < 7) return `${days}${t('session.daysAgo')}`
  return new Date(timestamp).toLocaleDateString()
}
