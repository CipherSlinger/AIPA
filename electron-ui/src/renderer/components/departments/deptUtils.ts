// Shared helpers for the department views (org chart + single department).
// Kept in its own module so OrgChart.tsx and DepartmentDashboard.tsx can both
// use them without importing each other.

import type { Department } from '../../store'
import type { SessionListItem } from '../../types/app.types'

/** The three session fields the directory join is allowed to look at. */
type SessionDirFields = Pick<SessionListItem, 'cwd' | 'project' | 'projectSlug'>

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
 * owns it in one lookup.
 */
export function deptBySlug(departments: Department[]): Map<string, Department> {
  const map = new Map<string, Department>()
  for (const dept of departments) map.set(dirToSlug(dept.directory), dept)
  return map
}

/**
 * Index departments by their normalised directory path. Used when the engine
 * reports a real cwd (Codex), which is more trustworthy than a slug.
 */
export function deptByNormDir(departments: Department[], homeDir?: string): Map<string, Department> {
  const map = new Map<string, Department>()
  for (const dept of departments) map.set(normalizePath(dept.directory, homeDir), dept)
  return map
}

/**
 * The one and only join between a session and the directory it belongs to.
 *
 * Prefer the engine's real `cwd`: Codex reports it, and its basename-derived
 * `projectSlug` is useless for nested or non-ASCII folders (a Chinese folder
 * name slugifies to ""). Claude does not report a cwd, but its project
 * directory name IS dirToSlug(dir), so the slug comparison is exact there.
 */
export function sessionMatchesDir(session: SessionDirFields, dir: string, homeDir?: string): boolean {
  if (session.cwd) return normalizePath(session.cwd, homeDir) === normalizePath(dir, homeDir)
  return session.projectSlug === dirToSlug(dir)
}

/**
 * Which department owns this session, or null when none does. Both indexes are
 * passed in by the caller so they are built once per session list, not once per
 * session. `byNormDir` only decides when the session carries a real cwd.
 */
export function findDeptForSession(
  session: SessionDirFields,
  bySlug: Map<string, Department>,
  byNormDir: Map<string, Department>,
  homeDir?: string,
): Department | null {
  if (session.cwd) {
    const hit = byNormDir.get(normalizePath(session.cwd, homeDir))
    if (hit) return hit
  }
  return bySlug.get(session.projectSlug) ?? null
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

// ── Org-tree traversal ───────────────────────────────────────────────────────
// A node's kind decides how the org chart treats it: companies own a section,
// teams hang off a department card, departments are the cards themselves.

/** The node's kind, with the legacy default applied. */
export function kindOf(node: Department): 'company' | 'department' | 'team' {
  return node.kind ?? 'department'
}

/** Direct children of `parentId`, in creation order. */
export function childrenOf(depts: Department[], parentId: string): Department[] {
  return depts.filter(d => d.parentId === parentId)
}

/** Team children of a department — the only level the org chart expands. */
export function teamsOf(depts: Department[], deptId: string): Department[] {
  return childrenOf(depts, deptId).filter(d => kindOf(d) === 'team')
}

/** The department cards a section should draw, i.e. everything but teams. */
export function rootNodes(depts: Department[]): Department[] {
  return depts.filter(d => !d.parentId && kindOf(d) !== 'team')
}

/** Walk up to the top of the tree — the company a node belongs to, if any. */
export function rootOf(dept: Department, byId: Map<string, Department>): Department {
  let node = dept
  const seen = new Set([dept.id])
  while (node.parentId) {
    const parent = byId.get(node.parentId)
    if (!parent || seen.has(parent.id)) break
    seen.add(parent.id)
    node = parent
  }
  return node
}

/** Every node in `root`'s subtree, including `root`. */
export function subtreeOf(depts: Department[], root: Department): Department[] {
  const byParent = new Map<string, Department[]>()
  for (const d of depts) {
    if (!d.parentId) continue
    const siblings = byParent.get(d.parentId)
    if (siblings) siblings.push(d)
    else byParent.set(d.parentId, [d])
  }
  const out = [root]
  // `out` grows as we walk it, so this visits the whole subtree breadth-first.
  for (let i = 0; i < out.length; i++) {
    const kids = byParent.get(out[i].id)
    if (kids) out.push(...kids)
  }
  return out
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
