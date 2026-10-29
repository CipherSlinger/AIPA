// Shared glue for the working-tree chip (wave 85B).
//
// The chip in the status bar and the command palette row must open the same
// panel. The palette row is built outside the chip's render tree, so the ask
// travels as one window event. A request is also remembered as pending: the
// palette may have to reveal a hidden status bar first, and the chip only
// mounts after that, so an event alone could be dispatched to no listener.

import type {
  GitDiffData,
  GitStatusData,
  GitStatusErrorData,
  GitStatusOkData,
} from '../../../preload'

export const GIT_STATUS_OPEN_EVENT = 'aipa:openGitStatus'

/**
 * What the chip says about one answer from `fs:gitStatus`.
 *
 *   - `hidden`  — there is no folder to ask about (or the first answer has not
 *                 arrived yet). Nothing is claimed.
 *   - `silent`  — a genuine "nothing to say": not a repository, git missing, or
 *                 a read that failed for a reason that is not about the folder.
 *                 The chip stays absent, exactly as before.
 *   - `repo`    — a working tree was read.
 *   - `refused` — main would not look: the folder is outside the roots it may
 *                 read, or it is gone / no longer a folder. This one must not
 *                 be dressed up as silence.
 *
 * `cwd_invalid` is the only code that becomes `refused`. Main sends a `reason`
 * with it; the renderer reads that reason rather than statting the folder.
 */
export type GitRefusalCause =
  | 'outside_allowed_roots'
  | 'missing'
  | 'not_directory'
  /** A refusal with no reason attached — an older main, or a path main never saw. */
  | 'unstated'

export type GitStatusReading =
  | { kind: 'hidden' }
  | { kind: 'silent' }
  | { kind: 'repo'; status: GitStatusOkData }
  | { kind: 'refused'; cause: GitRefusalCause }

export type GitStatusFailureReading =
  | { kind: 'silent' }
  | { kind: 'refused'; cause: GitRefusalCause }

/**
 * The one place a failure code is turned into "the chip says nothing" or "the
 * chip says it could not look". `not_a_repo`, `git_missing` and `failed` stay
 * silent: they are facts about the read, and the status bar has never claimed
 * anything in those states.
 */
export function readGitStatusFailure(failure: GitStatusErrorData): GitStatusFailureReading {
  if (failure.code !== 'cwd_invalid') return { kind: 'silent' }
  switch (failure.reason) {
    case 'outside_allowed_roots':
    case 'missing':
    case 'not_directory':
      return { kind: 'refused', cause: failure.reason }
    default:
      // `no_folder`, or a main that predates the reason: still a refusal, but
      // one whose cause this build cannot name. Say so without inventing a
      // distinction.
      return { kind: 'refused', cause: 'unstated' }
  }
}

/** The chip's whole reading of the current answer. */
export function gitStatusReading(status: GitStatusData | null, folder: string): GitStatusReading {
  if (!folder.trim() || !status) return { kind: 'hidden' }
  if (status.ok) return { kind: 'repo', status }
  const failure = readGitStatusFailure(status)
  return failure.kind === 'refused' ? failure : { kind: 'silent' }
}

export interface GitRefusalCopyKeys {
  label: string
  title: string
  heading: string
  body: string
}

/**
 * The words for a refusal, chosen in one place so the chip's tooltip and the
 * panel cannot describe the same answer differently.
 */
export function gitRefusalCopyKeys(cause: GitRefusalCause): GitRefusalCopyKeys {
  switch (cause) {
    case 'outside_allowed_roots':
      return {
        label: 'gitStatus.refusedOutsideLabel',
        title: 'gitStatus.refusedOutsideTitle',
        heading: 'gitStatus.refusedOutsideHeading',
        body: 'gitStatus.refusedOutsideBody',
      }
    case 'missing':
      return {
        label: 'gitStatus.refusedMissingLabel',
        title: 'gitStatus.refusedMissingTitle',
        heading: 'gitStatus.refusedMissingHeading',
        body: 'gitStatus.refusedMissingBody',
      }
    case 'not_directory':
      return {
        label: 'gitStatus.refusedNotFolderLabel',
        title: 'gitStatus.refusedNotFolderTitle',
        heading: 'gitStatus.refusedNotFolderHeading',
        body: 'gitStatus.refusedNotFolderBody',
      }
    case 'unstated':
      return {
        label: 'gitStatus.refusedUnknownLabel',
        title: 'gitStatus.refusedUnknownTitle',
        heading: 'gitStatus.refusedUnknownHeading',
        body: 'gitStatus.refusedUnknownBody',
      }
  }
}

/**
 * Whether the refusal can honestly end with a folder pick. A folder outside
 * the roots is not fixed by picking another one — the user may need to know
 * why *this* one cannot be read — so only a folder that is gone (or is no
 * longer a folder) offers that exit. The `unstated` case cannot tell, so it
 * explains and stops. An outside-roots refusal has its own exit instead:
 * `gitRefusalOffersGrant`.
 */
export function gitRefusalOffersNewFolder(cause: GitRefusalCause): boolean {
  return cause === 'missing' || cause === 'not_directory'
}

/**
 * Whether the refusal can end by granting *this* folder.
 *
 * Since wave 90 a confirmed OS dialog is consent, so the folder that was
 * refused can become readable without changing it. The panel offers that only
 * for `outside_allowed_roots`: a folder that is gone cannot be granted into
 * existence, and an unnamed refusal cannot say which folder the grant is for.
 */
export function gitRefusalOffersGrant(cause: GitRefusalCause): boolean {
  return cause === 'outside_allowed_roots'
}

let pending = false

/** Ask the status bar to open the working-tree panel for the current folder. */
export function requestGitStatusPanel(): void {
  pending = true
  window.dispatchEvent(new CustomEvent(GIT_STATUS_OPEN_EVENT))
}

/**
 * Claim a request. Called by the chip's listener and again when it mounts, so
 * revealing the status bar and asking in the same turn still opens the panel.
 */
export function consumeGitStatusRequest(): boolean {
  if (!pending) return false
  pending = false
  return true
}

/** Path comparison with Windows separators and casing normalized. */
export function gitFolderKey(folder: string): string {
  return folder.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

/**
 * Was this diff refused because main would not read that folder at all?
 *
 * Only a refusal earns the "reveal the file instead" fallback. A git failure
 * (timeout, git missing) is a failure of this one request and must be shown as
 * such; treating it as a refusal would replace the diagnosis with a click that
 * explains nothing. `cwd_invalid` is the same code `fs:gitStatus` uses, so the
 * two surfaces agree about what "not this folder" means.
 */
export function diffRefusedForFolder(result: GitDiffData): boolean {
  return typeof result !== 'string' && result.ok === false && result.code === 'cwd_invalid'
}

// The palette is rebuilt when it opens and cannot run `git` itself. The chip
// records what it last read, so the row's description can tell the truth about
// a folder already known not to be a repository instead of only promising.
const cache = new Map<string, GitStatusData>()

export function rememberGitStatus(folder: string, status: GitStatusData): void {
  if (!folder) return
  cache.set(gitFolderKey(folder), status)
}

export function cachedGitStatus(folder: string): GitStatusData | null {
  if (!folder) return null
  return cache.get(gitFolderKey(folder)) ?? null
}

/**
 * Drop the remembered answer for a folder.
 *
 * The cache exists so the palette can describe a folder already read. A
 * refusal in it is an answer from before the user granted the folder; after a
 * confirmed dialog it is stale, and leaving it would let a later reader repeat
 * "not readable" about a folder main may now open. Invalidating is not a
 * claim that the next read succeeds — only that the old answer is no longer
 * the truth to repeat.
 */
export function forgetGitStatus(folder: string): void {
  if (!folder) return
  cache.delete(gitFolderKey(folder))
}

/**
 * One sentence for a failed read. The code chooses the sentence; the raw git
 * message is appended only for `failed`, where it is the only detail there is.
 */
export function gitStatusErrorText(
  t: (key: string, params?: Record<string, string>) => string,
  failure: GitStatusErrorData,
  folder: string,
): string {
  const folderName = folder.split(/[/\\]/).filter(Boolean).pop() || folder
  switch (failure.code) {
    case 'not_a_repo':
      return t('gitStatus.notARepo', { folder: folderName })
    case 'git_missing':
      return t('gitStatus.gitMissing')
    case 'cwd_invalid': {
      // The same reading the chip and the panel use. The shipped
      // `gitStatus.cwdInvalid` sentence names only the allowed-roots case, so
      // it is not reused for a folder that is simply gone.
      const reading = readGitStatusFailure(failure)
      const keys = gitRefusalCopyKeys(reading.kind === 'refused' ? reading.cause : 'unstated')
      return t(keys.title, { folder: folderName })
    }
    case 'failed':
      return t('gitStatus.failed', { message: failure.message })
    default:
      return t('gitStatus.failed', { message: failure.message })
  }
}
