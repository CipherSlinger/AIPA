// The rows of the folder popover: folders your conversations actually ran in.
//
// A pick used to mean opening the OS dialog and walking to a path the app had
// already read out of a transcript. `recentFoldersFromSessions` turns that into
// a list; this module is the popover's reading of it and nothing more — one
// place that decides how many rows a 300px popover can carry, which folder is
// left out, and that an empty answer stays empty.
//
// The empty answer is the one that needs saying: with no transcript carrying a
// cwd there is no list, and the popover shows Browse alone. Substituting home
// here would dress a guess as a memory — home is where a conversation may have
// started, not where one of yours did.
//
// Pure: no React, no IPC, no i18n. The component renders these rows; the
// harness drives this module directly.

import { recentFoldersFromSessions, type RecentFolderEntry } from '../../lib/recentFolders'

/**
 * Most rows the popover can afford before it stops being a shortcut and starts
 * being a second sidebar. The list is newest-first, so the cap is not a filter:
 * the folders you used today are the ones you get.
 */
export const RECENT_FOLDER_ROW_LIMIT = 5

/** What this helper needs from a session row — a subset of `SessionListItem`. */
export interface RecentFolderSessionRow {
  sessionId: string
  cwd?: string | null
  timestamp: number
}

export interface WorkingDirRecentRowsInput {
  /** The sidebar's loaded sessions; an unloaded list is not an error, just no rows. */
  sessions: ReadonlyArray<RecentFolderSessionRow>
  /**
   * The folder the conversation on screen already uses. Left out: offering to
   * start a new conversation where this one already is would be a pick that
   * changes nothing.
   */
  currentDir?: string | null
  /** So a folder under home reads `~` like the chip does. */
  homeDir?: string | null
  /** Overrides `RECENT_FOLDER_ROW_LIMIT`; the popover never asks for more. */
  limit?: number
  /** Passed through so Windows case and separators fold when deduping/excluding. */
  platform?: string
}

export function workingDirRecentRows(input: WorkingDirRecentRowsInput): RecentFolderEntry[] {
  const limit = typeof input.limit === 'number' && input.limit >= 0
    ? Math.floor(input.limit)
    : RECENT_FOLDER_ROW_LIMIT
  if (limit === 0) return []
  // The delegate already ignores blank cwds, dedupes case-insensitively and
  // sorts newest-first; re-deriving any of that here would be the drift the
  // shared module exists to prevent.
  return recentFoldersFromSessions(input.sessions ?? [], {
    homeDir: input.homeDir,
    limit,
    exclude: input.currentDir,
    platform: input.platform,
  })
}
