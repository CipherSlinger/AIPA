// Shared glue for the working-tree chip (wave 85B).
//
// The chip in the status bar and the command palette row must open the same
// panel. The palette row is built outside the chip's render tree, so the ask
// travels as one window event. A request is also remembered as pending: the
// palette may have to reveal a hidden status bar first, and the chip only
// mounts after that, so an event alone could be dispatched to no listener.

import type { GitDiffData, GitStatusData, GitStatusErrorData } from '../../../preload'

export const GIT_STATUS_OPEN_EVENT = 'aipa:openGitStatus'

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
    case 'cwd_invalid':
      return t('gitStatus.cwdInvalid', { folder: folderName })
    case 'failed':
      return t('gitStatus.failed', { message: failure.message })
    default:
      return t('gitStatus.failed', { message: failure.message })
  }
}
