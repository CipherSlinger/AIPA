// The folders your conversations have actually run in, derived — never stored.
//
// Starting a new conversation meant opening the OS folder dialog and walking to
// a path the app already knew: every Codex transcript records its cwd. Deriving
// the list from the session list instead of keeping a second store means it
// cannot drift, cannot outlive the conversations it describes, and needs no
// migration. What it can do is under-report: the session list is an index with
// its own cap, so a folder whose conversations all fell off the end is simply
// absent. That is why the entries carry no counts — "used by 3 conversations"
// would be a claim about a list that may have been truncated, while a folder
// name and when it was last used are each true of the rows that are there.
//
// Pure: no React, no IPC.

import { normalizeWorkingDir, workingDirLabel } from './workingDir'

export interface RecentFolderEntry {
  /** The spelling the most recent conversation used. */
  dir: string
  /** Last segment, or `~/child` — what a menu row can afford. */
  label: string
  /** Newest conversation timestamp in this folder (epoch ms). */
  lastUsed: number
}

export interface RecentFoldersOptions {
  homeDir?: string | null
  /** Most rows to return. */
  limit?: number
  /** A folder to leave out — usually the one the open conversation already uses. */
  exclude?: string | null
  /** Passed to `normalizeWorkingDir` so Windows case and separators fold. */
  platform?: string
}

const DEFAULT_LIMIT = 8

interface Row {
  sessionId: string
  cwd?: string | null
  timestamp: number
}

export function recentFoldersFromSessions(
  sessions: ReadonlyArray<Row>,
  options: RecentFoldersOptions = {},
): RecentFolderEntry[] {
  if (!Array.isArray(sessions)) return []
  const limit = typeof options.limit === 'number' && options.limit >= 0
    ? Math.floor(options.limit)
    : DEFAULT_LIMIT
  if (limit === 0) return []
  const excluded = options.exclude ? normalizeWorkingDir(options.exclude, options.platform) : ''

  const byKey = new Map<string, RecentFolderEntry>()
  for (const session of sessions) {
    const dir = typeof session.cwd === 'string' ? session.cwd.trim() : ''
    if (!dir) continue
    // A conversation with no usable timestamp cannot claim recency; it still
    // names a real folder, so it is kept with the oldest possible value rather
    // than dropped.
    const stamp = Number.isFinite(session.timestamp) ? session.timestamp : 0
    const key = normalizeWorkingDir(dir, options.platform)
    if (!key || key === excluded) continue
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, { dir, label: workingDirLabel(dir, options.homeDir), lastUsed: stamp })
      continue
    }
    if (stamp > existing.lastUsed) {
      byKey.set(key, { dir, label: workingDirLabel(dir, options.homeDir), lastUsed: stamp })
    }
  }

  return [...byKey.values()]
    .filter(entry => entry.label !== '')
    .sort((a, b) => b.lastUsed - a.lastUsed)
    .slice(0, limit)
}
