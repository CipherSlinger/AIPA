// Folder-level archive filtering.
//
// Every Codex transcript records the folder it ran in, and `SessionListItem.cwd`
// carries it into the renderer. The archive can already ask "which company",
// "which job", "which week"; this is the narrower and more literal question
// "where did this happen". The options are derived with `recentFoldersFromSessions`
// — the same list the quick switcher and the folder palette use — so there is
// no second answer to "what folders have I worked in".
//
// Two consequences of that derivation are load-bearing here:
//   - the list is capped, so an option carries no conversation count. A number
//     beside a folder would describe a truncated list while reading as a total.
//   - conversations with no recorded folder are a real part of the archive, so
//     they get their own explicit option instead of disappearing under "all".
//
// Pure: no React, no IPC. The harness drives it directly.

import type { SessionListItem } from '../../types/app.types'
import { recentFoldersFromSessions } from '../../lib/recentFolders'
import { normalizeWorkingDir } from '../../lib/workingDir'

export interface ArchiveFolderOption {
  /** Normalized path — what a session's cwd is compared against. */
  key: string
  /** The spelling the newest conversation used, shown in full in a tooltip. */
  dir: string
  /** Last segment, or `~/child` — what the closed selector can afford. */
  label: string
  /** Newest conversation timestamp in this folder (epoch ms). */
  lastUsed: number
}

/**
 * What the folder facet is asking for.
 *
 * `folder` keeps both the normalized key (for comparison) and the original
 * spelling (for a label and a tooltip). Keeping the spelling means the chip can
 * still name the chosen folder after a session-list refresh pushes that folder
 * past the option cap — silently dropping the filter would bring back rows the
 * user had excluded.
 */
export type ArchiveFolderFilter =
  | { kind: 'all' }
  | { kind: 'none' }
  | { kind: 'folder'; key: string; dir: string }

/** Stable values, so resetting the filter does not allocate a new object. */
export const ALL_FOLDER_FILTER: ArchiveFolderFilter = { kind: 'all' }
export const NO_FOLDER_FILTER: ArchiveFolderFilter = { kind: 'none' }

export interface ArchiveFolderOptions {
  folders: ArchiveFolderOption[]
  /** At least one loaded conversation recorded no folder; offer the option. */
  hasMissing: boolean
}

export interface DeriveArchiveFolderOptions {
  homeDir?: string | null
  /** Passed through so Windows case and separators fold. */
  platform?: string
  /** Most folder rows to offer. Defaults to the shared helper's cap. */
  limit?: number
}

/**
 * The folders represented in the loaded archive, newest activity first, plus
 * whether an explicit "no folder recorded" choice is needed.
 *
 * Delegating to `recentFoldersFromSessions` is deliberate: the quick switcher
 * and this filter must not disagree about whether `C:\Work\Api` and
 * `c:/work/api/` are the same folder. `hasMissing` is a separate scan because
 * the shared helper drops blank cwds rather than returning them.
 */
export function deriveArchiveFolderOptions(
  sessions: readonly SessionListItem[],
  options: DeriveArchiveFolderOptions = {},
): ArchiveFolderOptions {
  const entries = recentFoldersFromSessions(sessions, {
    homeDir: options.homeDir,
    platform: options.platform,
    limit: options.limit,
  })
  const folders: ArchiveFolderOption[] = []
  for (const entry of entries) {
    const key = normalizeWorkingDir(entry.dir, options.platform)
    // A folder whose label resolved to nothing is already filtered by the
    // shared helper; an empty key would make every row match, so keep it out.
    if (!key) continue
    folders.push({ key, dir: entry.dir, label: entry.label, lastUsed: entry.lastUsed })
  }

  let hasMissing = false
  for (const session of sessions) {
    const cwd = typeof session.cwd === 'string' ? session.cwd.trim() : ''
    if (!cwd) {
      hasMissing = true
      break
    }
  }

  return { folders, hasMissing }
}

/**
 * The one predicate. `all` keeps everything (including rows with no folder),
 * `none` keeps only those rows, and a folder compares normalized paths so a
 * trailing separator or differing case is the same folder.
 */
export function matchesFolderFilter(
  cwd: string | null | undefined,
  filter: ArchiveFolderFilter,
  platform?: string,
): boolean {
  if (filter.kind === 'all') return true
  const key = normalizeWorkingDir(typeof cwd === 'string' ? cwd : '', platform)
  if (filter.kind === 'none') return key === ''
  return key === filter.key
}

// ── Select encoding ─────────────────────────────────────────────────────────
// A native `<select>` speaks strings. Encoding the kind too keeps a real folder
// called "all" from being confused with the clear value.

const FOLDER_VALUE_PREFIX = 'folder:'
export const ALL_FOLDERS_VALUE = 'all'
export const NO_FOLDER_VALUE = '__no_folder__'

export function folderFilterValue(filter: ArchiveFolderFilter): string {
  if (filter.kind === 'none') return NO_FOLDER_VALUE
  if (filter.kind === 'folder') return FOLDER_VALUE_PREFIX + filter.key
  return ALL_FOLDERS_VALUE
}

/**
 * Read a selector value back into the filter. A folder value normally resolves
 * through `folders`; the fallback covers the one render where the chosen folder
 * has fallen past the cap, and it uses the key only for comparison.
 */
export function folderFilterFromValue(
  value: string,
  folders: readonly ArchiveFolderOption[],
): ArchiveFolderFilter {
  if (value === NO_FOLDER_VALUE) return NO_FOLDER_FILTER
  if (value.startsWith(FOLDER_VALUE_PREFIX)) {
    const key = value.slice(FOLDER_VALUE_PREFIX.length)
    const match = folders.find(option => option.key === key)
    if (match) return { kind: 'folder', key: match.key, dir: match.dir }
    return { kind: 'folder', key, dir: key }
  }
  return ALL_FOLDER_FILTER
}

/**
 * The options the selector should list, including the chosen folder when the
 * cap has pushed it out. Without this the control would show "All folders" as
 * selected while the ledger stayed filtered — the state and the label would
 * contradict each other.
 */
export function folderOptionsWithSelection(
  folders: readonly ArchiveFolderOption[],
  filter: ArchiveFolderFilter,
): ArchiveFolderOption[] {
  if (filter.kind !== 'folder') return [...folders]
  if (folders.some(option => option.key === filter.key)) return [...folders]
  return [{ key: filter.key, dir: filter.dir, label: '', lastUsed: 0 }, ...folders]
}
