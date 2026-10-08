// Shared helpers for the department views (org chart + single department).
// Kept in its own module so OrgChart.tsx and DepartmentDashboard.tsx can both
// use them without importing each other.

import type { Department } from '../../store'

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

/**
 * Index departments by their slug, so a session can find the department that
 * owns it in one lookup. This slug join is the ONLY link between the two — a
 * session carries no department id.
 */
export function deptBySlug(departments: Department[]): Map<string, Department> {
  const map = new Map<string, Department>()
  for (const dept of departments) map.set(dirToSlug(dept.directory), dept)
  return map
}

/** Expand a leading `~` against the user's home directory and normalise separators. */
export function normalizePath(p: string, homeDir?: string): string {
  let normalized = p.replace(/\\/g, '/')
  if (homeDir && normalized.startsWith('~/')) {
    normalized = homeDir.replace(/\/+$/, '') + normalized.slice(1)
  } else if (homeDir && normalized === '~') {
    normalized = homeDir.replace(/\/+$/, '')
  }
  return normalized.replace(/\/+$/, '')
}

/** Join a directory and a child segment with the separator the base already uses. */
export function joinPath(base: string, child: string): string {
  const trimmed = base.replace(/[/\\]+$/, '')
  const sep = trimmed.includes('\\') && !trimmed.includes('/') ? '\\' : '/'
  return `${trimmed}${sep}${child}`
}

/** Rotation palette for auto-assigned department colors. */
export const DEPT_COLORS = ['#6366f1', '#fbbf24', '#4ade80', '#f87171', '#818cf8', '#a78bfa', '#ec4899', '#14b8a6']

/** Deterministic emoji per department, so a card keeps its face across reloads. */
const DEPT_EMOJI = ['🏢', '🧪', '🎨', '📊', '🛠️', '📈', '🧠', '🔬', '🚀', '📦', '💡', '🗂️', '🛰️', '🧰', '📐', '🎯', '🧩', '⚙️']

export function deptEmoji(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return DEPT_EMOJI[hash % DEPT_EMOJI.length]
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
