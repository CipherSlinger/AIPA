// Recent folders as command-palette rows (wave 88B).
//
// The palette already lists recent conversations; it did not list the places
// they ran in. That is a gap the app can answer without a second store: every
// Codex transcript records its cwd, and `recentFoldersFromSessions` derives the
// list from the session index, so a row disappears when its last conversation
// leaves the index instead of lingering as a folder nobody used any more.
//
// The wording is an action, not a destination. A resumed Codex thread runs in
// the cwd written in its rollout, so a folder pick cannot move it; picking one
// of these rows honestly starts a new conversation over there. The caller wires
// that to `applyFolderForView`, the same door the View menu and the folder
// dialog use, so the three cannot drift.
//
// Pure: no React, no IPC, no store reads. The caller passes the resolver's
// answer and the palette's `t`; the harness drives it directly.

import { recentFoldersFromSessions } from '../../lib/recentFolders'
import { normalizeWorkingDir } from '../../lib/workingDir'
import { relativeTimeText } from '../workflows/scheduleSummary'
import type { Translate } from '../automation/scheduleText'

/** Five rows: enough to cover a working week, short enough to stay a shortcut. */
export const RECENT_FOLDER_PALETTE_LIMIT = 5

export interface RecentFolderPaletteRow {
  /** Stable across renders; keyed by the folder identity, not its spelling. */
  id: string
  /** "Start a new conversation in <label>" — the row title, searchable. */
  name: string
  /** Full path, plus how long ago it was last used when that is known. */
  description: string
  /** The folder the action starts the new conversation in. */
  dir: string
}

export interface RecentFolderPaletteArgs {
  sessions: ReadonlyArray<{ sessionId: string; cwd?: string | null; timestamp: number }>
  homeDir?: string | null
  /**
   * The folder the open conversation already uses. Left out: a row that starts
   * a new conversation in the folder you are already in is a no-op wearing a
   * label.
   */
  currentDir?: string | null
  /** Passed through so Windows case and separator spellings fold. */
  platform?: string
  t: Translate
  /** Injectable clock, so a harness can pin the "used 2h ago" wording. */
  now?: number
}

export function recentFolderPaletteRows(args: RecentFolderPaletteArgs): RecentFolderPaletteRow[] {
  const folders = recentFoldersFromSessions(args.sessions, {
    homeDir: args.homeDir,
    exclude: args.currentDir,
    limit: RECENT_FOLDER_PALETTE_LIMIT,
    platform: args.platform,
  })

  return folders.map(entry => {
    // `lastUsed === 0` means "no usable timestamp", not 1970: the folder is
    // still real and worth offering, but the row must not date it. The plain
    // path is the description in that case rather than a fabricated age.
    const description = entry.lastUsed > 0
      ? args.t('command.recentFolder.description', {
        path: entry.dir,
        when: relativeTimeText(entry.lastUsed, args.t, args.now),
      })
      : entry.dir
    return {
      // The same identity `recentFoldersFromSessions` deduped on: two spellings
      // of one folder must not become two rows with colliding React keys.
      id: `recent-folder-${normalizeWorkingDir(entry.dir, args.platform)}`,
      name: args.t('command.recentFolder.startIn', { folder: entry.label }),
      description,
      dir: entry.dir,
    }
  })
}
