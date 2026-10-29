// Searching inside one folder.
//
// The folder select on the search strip is a view over the rows a scan already
// returned. That view can only speak for the loaded page: a folder whose older
// conversations sit past the scan's ceiling looks empty even though they
// exist. "Search only in this folder" hands the folder's session ids to main
// before its ceiling — the same allowlist channel the department scan uses —
// so the view on screen and the corpus that was scanned are the same set of
// conversations.
//
// Three facts keep that honest:
//
//   - the id list is a snapshot taken at the press. The session listing is
//     rebuilt when a conversation starts, is deleted or is re-indexed, and a
//     continuation page must slice the corpus the first page announced.
//     Recomputing the list per render would also hand the scan hook a new array
//     identity every time, which it reads as a new narrowing and restarts the
//     scan under the user. `pinFolderScanScope` freezes it;
//
//   - `total` counts every conversation that qualified before the renderer's
//     cap, while `ids` carries only the first `limit`. When `truncated` is true,
//     no count over `ids` is a total: the conversations past the cap were never
//     sent, and main cannot report on what it never saw. The copy must say so
//     rather than present the carried number as the whole folder;
//
//   - a session whose listing entry records no cwd cannot be assumed to belong
//     to the folder. A hit carries only `project`, which is a lossy display
//     slug, not a path; deriving a folder from it would silently scan a corpus
//     the user never chose. Such a session contributes nothing, and is not a
//     reason to widen.
//
// The reply's `filteredBy` echo — never the request — is what the copy reads,
// so a scan that failed or was refused can never be described as narrowed.
//
// Pure and React-free so the overlay and its harness run the same code.

import { normalizeWorkingDir } from '../../lib/workingDir'
import { MAX_SCOPE_SESSIONS } from './searchDeptAttribution'
import type { SearchFolderFilter } from './searchFolderFilter'

/** The slice of a listed session the folder join is allowed to read. */
export interface FolderScopeSession {
  sessionId: string
  /** The folder recorded for the conversation. Absence is never a folder. */
  cwd?: string | null
}

export interface FolderScopeOptions {
  /** Most session ids to carry. Defaults to the shared scope cap. */
  limit?: number
  /** Passed through so Windows case and separators fold. */
  platform?: string
}

export interface FolderScanScope {
  ids: string[]
  /** Distinct matching conversations before the cap. */
  total: number
  /** More conversations qualified than were carried. */
  truncated: boolean
}

/**
 * The conversations recorded as having run in `key`, in listing order.
 *
 * Membership is the recorded cwd normalized the same way the folder filter
 * compares paths, so `C:\Work\Api` and `c:/work/api/` are one folder. A session
 * that is not in the listing, records no cwd, or records only whitespace has no
 * known folder and is never included. Duplicate listing rows collapse to their
 * first occurrence — the first row is what the listing showed the user — and
 * `total` counts distinct sessions, so a repeated row cannot inflate it.
 *
 * `key` may be given in any spelling; it is normalized before comparison. An
 * empty key means "no folder", which matches nothing (an empty key would
 * otherwise be the key every cwd-less row normalizes to).
 */
export function folderScopeIds(
  sessions: ReadonlyArray<FolderScopeSession>,
  key: string,
  options: FolderScopeOptions = {},
): FolderScanScope {
  const platform = options.platform
  const target = normalizeWorkingDir(key, platform)
  if (!target) return { ids: [], total: 0, truncated: false }
  const rawLimit = options.limit
  const limit = typeof rawLimit === 'number' && Number.isFinite(rawLimit)
    ? Math.max(0, Math.floor(rawLimit))
    : MAX_SCOPE_SESSIONS

  const seen = new Set<string>()
  const ids: string[] = []
  let total = 0
  for (const session of sessions) {
    if (!session || seen.has(session.sessionId)) continue
    seen.add(session.sessionId)
    const cwd = typeof session.cwd === 'string' ? session.cwd.trim() : ''
    // No recorded cwd is an answer ("we cannot tell"), not a folder to guess.
    if (!cwd) continue
    if (normalizeWorkingDir(cwd, platform) !== target) continue
    total += 1
    if (ids.length < limit) ids.push(session.sessionId)
  }
  return { ids, total, truncated: total > ids.length }
}

/** The chosen folder as the press-time snapshot keeps it. */
export interface FolderScanTarget {
  /** The spelling the newest conversation used, shown to the user. */
  dir: string
  /** Normalized comparison key; two spellings of one folder share it. */
  key: string
  /** Short name shown in the copy. Frozen so it survives a refresh. */
  label: string
}

/**
 * One scan's folder narrowing, frozen.
 *
 * `ids` is copied, not aliased: the listing array it came from is rebuilt
 * whenever a conversation starts or a session is indexed, and a running scan
 * must keep the corpus it announced. `dir`/`label` are the folder's name at
 * press time, so a folder that later falls off the recent-options cap (or
 * disappears from the listing) can still be named honestly instead of becoming
 * an anonymous key.
 */
export interface FolderScanPin extends FolderScanTarget {
  ids: string[]
  /** Distinct conversations in the folder before the cap. */
  total: number
  truncated: boolean
}

export function pinFolderScanScope(
  target: FolderScanTarget,
  scope: FolderScanScope,
): FolderScanPin {
  return {
    dir: target.dir,
    key: target.key,
    label: target.label,
    ids: [...scope.ids],
    total: scope.total,
    truncated: scope.truncated,
  }
}

/** The folder a narrowed scan names, read from the pin rather than the live list. */
export interface ScannedFolderState {
  key: string
  dir: string
  label: string
  /** Conversations the scan carried after the cap. */
  carried: number
  /** More conversations qualified than the scan could carry. */
  truncated: boolean
}

export function scanFolderState(pin: FolderScanPin | null): ScannedFolderState | null {
  if (!pin) return null
  return {
    key: pin.key,
    dir: pin.dir,
    label: pin.label,
    carried: pin.ids.length,
    truncated: pin.truncated,
  }
}

/**
 * Whether the pin still names the folder the filter has chosen. Compared on
 * the normalized key, so a different spelling of the same folder is still the
 * same folder. A pin keeps naming its folder after that folder has left the
 * option list; this answers "is it the chosen one", not "is it still listed".
 */
export function folderPinNamesFolder(
  pin: Pick<FolderScanPin, 'key'> | null,
  key: string,
  platform?: string,
): boolean {
  if (!pin) return false
  const target = normalizeWorkingDir(key, platform)
  return target !== '' && normalizeWorkingDir(pin.key, platform) === target
}

/**
 * Whether the strip should offer the deliberate folder scan.
 *
 * Only a chosen folder can be scanned; `all` is not a narrowing and "no folder
 * recorded" names an absence, not a corpus that could be handed to main. The
 * loaded rows must also be a partial answer — with everything loaded, the
 * folder view already speaks for the whole result set — and a folder the
 * listing resolves to zero conversations is refused, because the scan it
 * would start reads nothing. Pressing it again while the scan already carries
 * exactly this folder would only re-run a scan that is already narrow.
 */
export function shouldOfferFolderScan(
  partial: boolean,
  filter: SearchFolderFilter,
  scannedKey: string | null,
  total: number | null,
): boolean {
  if (!partial) return false
  if (filter.kind !== 'folder') return false
  if (total === 0) return false
  if (!scannedKey) return true
  return normalizeWorkingDir(filter.key) !== normalizeWorkingDir(scannedKey)
}
