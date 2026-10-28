/**
 * Path helpers shared by the dream service and its transcript reader.
 *
 * The slug algorithm must match `cwdToProjectSlug` in the renderer's
 * `promptMemory.ts`: Claude replaces every non-alphanumeric character with
 * `-`, so a path with a dot or a space maps to the same directory the memory
 * tiers read. Diverging here would write a pass the prompt never sees.
 */
import * as path from 'path'

export function cwdToProjectSlug(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

export function dreamProjectsRoot(claudeDir: string): string {
  return path.join(claudeDir, 'projects')
}

export function dreamProjectMemoryDir(claudeDir: string, projectSlug: string): string {
  return path.join(dreamProjectsRoot(claudeDir), projectSlug, 'memory')
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Local calendar date (`YYYY-MM-DD`): the filename is read by humans. */
export function localDate(now: number): string {
  const d = new Date(now)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** Local clock time (`HHmmss`) used to make each pass its own file. */
export function localTimeSlug(now: number): string {
  const d = new Date(now)
  return `${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
}

/** Short, filesystem-safe session fragment for the pass filename. */
export function sessionFileSlug(sessionId: string): string {
  const compact = sessionId.replace(/[^A-Za-z0-9]/g, '')
  return compact.slice(0, 12) || 'session'
}
