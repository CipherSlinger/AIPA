// Folder filtering for cross-session search.
//
// A hit carries `sessionId` and a `project` label, but not the folder the
// conversation ran in: `project` is a Claude project slug decoded back into a
// path, or a Codex slug for grouping. The real folder lives on
// `SessionListItem.cwd`, so every hit's folder is looked up by session id in
// the session listing — exactly how the origin filter finds who started a
// session. A hit whose session is not in the listing, or whose listing entry
// records no cwd, has no known folder. That is a real answer, not a reason to
// guess one, and the UI offers it as its own explicit choice.
//
// Everything here is a pure derivation over rows the hook already returned.
// Filtering never starts a scan: it runs after `useGlobalSessionSearch` has
// produced its pages, so it cannot race the request sequencing, and it never
// reorders what was asked for.
//
// Options are derived with `recentFoldersFromSessions` — the same helper the
// archive filter and the folder palettes use — so there is one answer to "what
// folders have I worked in". Consequently an option carries no conversation
// count: the hit set is paged, and a number beside a folder would describe a
// slice of the loaded rows while reading as a total.

import { recentFoldersFromSessions } from '../../lib/recentFolders'
import { normalizeWorkingDir } from '../../lib/workingDir'

/** The part of a session listing row this module needs. */
export interface SearchFolderSource {
  sessionId: string
  cwd?: string | null
}

/**
 * Session id -> recorded cwd. A missing key is "not in this machine's session
 * listing"; an entry with an empty string is "listed, but no folder recorded".
 * The filter treats both as "no known folder", but the map keeps them distinct
 * so a caller can tell them apart without inventing a path.
 */
export type SearchFolderMap = ReadonlyMap<string, string>

/** The smallest shape a folder option needs from a hit. */
export interface SearchFolderHit {
  sessionId: string
  /** The session's own recency; the folder list is ordered by it. */
  timestamp: number
}

export interface SearchFolderOption {
  /** Normalized path — what a hit's folder is compared against. */
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
 * `none` keeps the hits whose folder is unknown — either the session is absent
 * from the listing or it records no cwd. A folder choice excludes those hits,
 * which is why the option must exist rather than letting them vanish silently.
 *
 * The chosen spelling is kept beside the normalized key so the chip can still
 * name the folder after a page pushes it past the option cap.
 */
export type SearchFolderFilter =
  | { kind: 'all' }
  | { kind: 'none' }
  | { kind: 'folder'; key: string; dir: string }

/** Stable values, so clearing the filter does not allocate a new object. */
export const ALL_FOLDERS_FILTER: SearchFolderFilter = { kind: 'all' }
export const NO_FOLDER_FILTER: SearchFolderFilter = { kind: 'none' }

export interface SearchFolderOptions {
  folders: SearchFolderOption[]
  /** At least one loaded hit has no known folder; offer the explicit choice. */
  hasMissing: boolean
}

export interface DeriveSearchFolderOptions {
  homeDir?: string | null
  /** Passed through so Windows case and separators fold. */
  platform?: string
  /** Most folder rows to offer. Defaults to the shared helper's cap. */
  limit?: number
}

/** Session id -> cwd from the session listing. Pure; never reads a transcript. */
export function buildSearchFolderMap(
  sessions: ReadonlyArray<SearchFolderSource>,
): SearchFolderMap {
  const map = new Map<string, string>()
  for (const session of sessions) {
    map.set(session.sessionId, typeof session.cwd === 'string' ? session.cwd : '')
  }
  return map
}

/**
 * The folder recorded for one hit, or '' when none is known.
 *
 * Both "not listed" and "listed without a cwd" return '', because neither
 * proves where the turn ran. The caller must not turn this into a path.
 */
export function knownSearchFolder(sessionId: string, folders: SearchFolderMap): string {
  const cwd = folders.get(sessionId)
  return typeof cwd === 'string' ? cwd.trim() : ''
}

/** The comparison key for one hit's folder; '' when no folder is known. */
export function searchHitFolderKey(
  sessionId: string,
  folders: SearchFolderMap,
  platform?: string,
): string {
  return normalizeWorkingDir(knownSearchFolder(sessionId, folders), platform)
}

/**
 * The folders represented in the loaded hits, newest activity first, plus
 * whether an explicit "No folder recorded" choice is needed.
 *
 * Delegating to `recentFoldersFromSessions` keeps dedupe, spelling and order in
 * one place: two hits from `C:\Work\Api` and `c:/work/api/` are one option, and
 * the shared cap applies. A hit whose session is not in the listing contributes
 * no option but still counts towards `hasMissing`.
 */
export function deriveSearchFolderOptions(
  hits: ReadonlyArray<SearchFolderHit>,
  folders: SearchFolderMap,
  options: DeriveSearchFolderOptions = {},
): SearchFolderOptions {
  const rows = hits.map(hit => ({
    sessionId: hit.sessionId,
    cwd: knownSearchFolder(hit.sessionId, folders),
    timestamp: hit.timestamp,
  }))
  const entries = recentFoldersFromSessions(rows, {
    homeDir: options.homeDir,
    platform: options.platform,
    limit: options.limit,
  })
  const result: SearchFolderOption[] = []
  for (const entry of entries) {
    const key = normalizeWorkingDir(entry.dir, options.platform)
    // An empty key would match every row, so a folder that normalized to
    // nothing never becomes an option (the shared helper already drops empty
    // labels, but the key is what the predicate compares).
    if (!key) continue
    result.push({ key, dir: entry.dir, label: entry.label, lastUsed: entry.lastUsed })
  }

  let hasMissing = false
  for (const hit of hits) {
    if (!knownSearchFolder(hit.sessionId, folders)) {
      hasMissing = true
      break
    }
  }

  return { folders: result, hasMissing }
}

/**
 * The one predicate. `all` keeps every row (including hits with no folder);
 * `none` keeps only those rows; a folder compares normalized paths so a
 * trailing separator or differing case is the same folder.
 */
export function matchesSearchFolderFilter(
  sessionId: string,
  filter: SearchFolderFilter,
  folders: SearchFolderMap,
  platform?: string,
): boolean {
  if (filter.kind === 'all') return true
  const key = searchHitFolderKey(sessionId, folders, platform)
  if (filter.kind === 'none') return key === ''
  return key === filter.key
}

export interface FolderFilteredResults<T> {
  visible: T[]
  /** Rows this filter keeps out of the loaded set it was given. */
  hidden: number
}

/**
 * Apply the folder view over rows another view already narrowed. Only one
 * total is returned — the number of rows this step hid — never a per-folder
 * count, because the loaded hit set is a page and a count would present a
 * partial total as the whole.
 */
export function filterResultsByFolder<T extends { sessionId: string }>(
  results: ReadonlyArray<T>,
  folders: SearchFolderMap,
  filter: SearchFolderFilter,
  platform?: string,
): FolderFilteredResults<T> {
  const visible: T[] = []
  for (const result of results) {
    if (matchesSearchFolderFilter(result.sessionId, filter, folders, platform)) {
      visible.push(result)
    }
  }
  return { visible, hidden: results.length - visible.length }
}

/**
 * True only when the search found rows and the folder filter hid every one of
 * the rows it was given. An empty input means the earlier views already found
 * nothing; the folder filter is not the thing to blame.
 */
export function isFolderFilterEmpty(
  totalResults: number,
  visibleResults: number,
  filter: SearchFolderFilter,
): boolean {
  return filter.kind !== 'all' && totalResults > 0 && visibleResults === 0
}

/**
 * A folder choice describes one query's loaded rows. A changed query starts at
 * All, because the new rows may all have run elsewhere and the filter would
 * hide them for a reason the user cannot see. Comparing trimmed text keeps a
 * trailing space from discarding a choice that still describes the same rows.
 */
export function folderFilterForQuery(
  previousQuery: string,
  nextQuery: string,
  filter: SearchFolderFilter,
): SearchFolderFilter {
  return previousQuery.trim() === nextQuery.trim() ? filter : ALL_FOLDERS_FILTER
}

// ── Select encoding ─────────────────────────────────────────────────────────
// A native `<select>` speaks strings. Encoding the kind keeps a real folder
// named "all" from being confused with the clear value.

const FOLDER_VALUE_PREFIX = 'folder:'
export const ALL_FOLDERS_VALUE = 'all'
export const NO_FOLDER_VALUE = '__no_folder__'

export function folderFilterValue(filter: SearchFolderFilter): string {
  if (filter.kind === 'none') return NO_FOLDER_VALUE
  if (filter.kind === 'folder') return FOLDER_VALUE_PREFIX + filter.key
  return ALL_FOLDERS_VALUE
}

/**
 * Read a selector value back into the filter. A folder value normally resolves
 * through `folders`; the fallback covers the one render where the chosen folder
 * has fallen past the option cap, and it uses the key only for comparison.
 */
export function folderFilterFromValue(
  value: string,
  folders: readonly SearchFolderOption[],
): SearchFolderFilter {
  if (value === NO_FOLDER_VALUE) return NO_FOLDER_FILTER
  if (value.startsWith(FOLDER_VALUE_PREFIX)) {
    const key = value.slice(FOLDER_VALUE_PREFIX.length)
    const match = folders.find(option => option.key === key)
    if (match) return { kind: 'folder', key: match.key, dir: match.dir }
    return { kind: 'folder', key, dir: key }
  }
  return ALL_FOLDERS_FILTER
}

/**
 * The options the selector should list, including the chosen folder when the
 * cap pushed it out. Without this the control would read "All folders" while
 * the rows stayed filtered — the state and the label would contradict.
 */
export function folderOptionsWithSelection(
  folders: readonly SearchFolderOption[],
  filter: SearchFolderFilter,
): SearchFolderOption[] {
  if (filter.kind !== 'folder') return [...folders]
  if (folders.some(option => option.key === filter.key)) return [...folders]
  return [{ key: filter.key, dir: filter.dir, label: '', lastUsed: 0 }, ...folders]
}
