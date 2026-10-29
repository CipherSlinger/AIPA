import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { safePath, getAllowedFsRoots } from '../utils/validate'
import type { GitStatusFailureCode } from './git-status'

/**
 * Which folder `git diff` runs in, and which path it is limited to (wave 88A).
 *
 * `fs:gitDiff` predates per-conversation folders: it always ran `git diff HEAD`
 * in the app-wide working folder, so a conversation scoped to its own tab
 * folder was shown a diff from another checkout — or none at all. The renderer
 * now names the folder it means, and this module decides what that name is
 * allowed to become before any process is spawned.
 *
 * The decision is separated from the `execFileSync` call for two reasons. It
 * can be exercised without Electron, and the property that matters most is
 * visible in one place: a folder that fails the allowed-roots gate is REFUSED.
 * It never falls back to the app-wide folder. A diff produced by the wrong
 * checkout reads exactly like a correct one — same colours, same hunks — so
 * "I could not look there" has to arrive as a refusal, not as another
 * repository's confident answer. `fs:gitStatus` made the same choice with
 * `cwd_invalid`, and the two surfaces must agree about the same folder.
 *
 * With no `cwd` the old behaviour is kept on purpose: the app-wide folder
 * (prefs, else home). Both `changes` panel and anything else that has no
 * conversation folder in hand still get the tree they always got.
 */

/** A diff must not hold the IPC call open longer than a status read would. */
export const GIT_DIFF_TIMEOUT_MS = 5000

/** Same ceiling the handler has always used; past it git's answer is refused. */
export const GIT_DIFF_MAX_BUFFER = 100 * 1024

export interface GitDiffRequest {
  /** Absolute, or relative to the folder the diff will run in. */
  filePath?: unknown
  /** The conversation's folder. Absent keeps the app-wide folder. */
  cwd?: unknown
}

/**
 * `file_invalid` is the file-path sibling of `cwd_invalid`; the other codes
 * are the ones `fs:gitStatus` already uses, so the renderer can reuse its
 * reading of them.
 */
export type GitDiffFailureCode = GitStatusFailureCode | 'file_invalid'

export interface GitDiffFailure {
  ok: false
  code: GitDiffFailureCode
  message: string
}

export interface GitDiffPlanOk {
  ok: true
  /** The folder git will run in — the one the file path was resolved against. */
  folder: string
  /** Validated absolute path, present only when the diff is limited to a file. */
  filePath?: string
  /** argv for `execFileSync`; never a shell string. */
  args: string[]
}

export type GitDiffPlan = GitDiffPlanOk | GitDiffFailure

export interface GitDiffPlanOptions {
  /**
   * The allowed-roots gate, injectable so the harness can drive refusals
   * without depending on where this machine's home directory happens to be.
   */
  allow?: (requested: string) => string
}

function refuse(code: GitDiffFailureCode, message: string): GitDiffFailure {
  return { ok: false, code, message: message.slice(0, 500) }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Decide where the diff runs and what it is limited to.
 *
 * `workingDir` is the app-wide folder the handler already resolved
 * (`getPref('workingDir')`, else home). It supplies both the fallback folder
 * and the allowed roots, exactly as `fs:gitStatus` does, so a folder one
 * surface accepts the other accepts too.
 */
export function planGitDiff(
  request: GitDiffRequest | undefined,
  workingDir: string,
  options: GitDiffPlanOptions = {},
): GitDiffPlan {
  const globalFolder = path.resolve(
    typeof workingDir === 'string' && workingDir.trim() ? workingDir : os.homedir(),
  )
  const allow = options.allow ?? ((requested: string) => safePath(requested, getAllowedFsRoots(globalFolder)))

  let folder = globalFolder
  const requestedCwd = request?.cwd
  if (typeof requestedCwd === 'string' && requestedCwd.trim()) {
    try {
      folder = allow(requestedCwd)
    } catch (err) {
      // No fallback: the caller asked about this folder, and answering about
      // another one would be a wrong answer that looks right.
      return refuse('cwd_invalid', messageOf(err))
    }
    // `fs:gitStatus` reports a missing folder as `cwd_invalid` rather than
    // letting git produce an error; a diff must not read as a git failure when
    // the folder itself is the problem.
    try {
      if (!fs.statSync(folder).isDirectory()) {
        return refuse('cwd_invalid', `Not a folder: ${folder}`)
      }
    } catch {
      return refuse('cwd_invalid', `Folder does not exist: ${folder}`)
    }
  }

  let filePath: string | undefined
  const requestedFilePath = request?.filePath
  if (typeof requestedFilePath === 'string' && requestedFilePath.trim()) {
    // Relative paths are resolved against the folder the diff actually uses,
    // not against the app-wide one — otherwise a tab-scoped conversation would
    // diff a same-named file in a different checkout.
    const resolved = path.isAbsolute(requestedFilePath)
      ? requestedFilePath
      : path.resolve(folder, requestedFilePath)
    try {
      filePath = allow(resolved)
    } catch (err) {
      return refuse('file_invalid', messageOf(err))
    }
  }

  return {
    ok: true,
    folder,
    ...(filePath ? { filePath } : {}),
    args: filePath ? ['diff', 'HEAD', '--', filePath] : ['diff', 'HEAD'],
  }
}

interface ExecFailure {
  code?: unknown
  status?: unknown
  signal?: unknown
  message?: unknown
  stdout?: unknown
  stderr?: unknown
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value
  if (Buffer.isBuffer(value)) return value.toString('utf-8')
  return ''
}

/**
 * Map an `execFileSync` throw onto the same codes `fs:gitStatus` uses. The
 * wording says `git diff` because that is what failed; the codes are shared so
 * a caller can ask "was this a refusal or a failure" the same way on both.
 *
 * Note what is NOT here: exit status 1. git exits 1 whenever there are
 * differences and still writes the diff to stdout, so the handler answers with
 * stdout before ever calling this. A non-zero exit that carried output is an
 * answer, not an error.
 */
export function classifyGitDiffError(err: unknown): GitDiffFailure {
  const failure = (err ?? {}) as ExecFailure
  const code = typeof failure.code === 'string' ? failure.code : ''
  if (code === 'ENOENT') return refuse('git_missing', 'Git was not found on PATH.')

  const stderr = textOf(failure.stderr).trim()
  const stdout = textOf(failure.stdout).trim()
  const message = typeof failure.message === 'string' ? failure.message : ''
  const detail = stderr || stdout || message || 'unknown error'

  if (/not a git repository|not a git work tree|must be run in a work tree/i.test(detail)) {
    return refuse('not_a_repo', detail)
  }
  if (code === 'ETIMEDOUT' || failure.signal === 'SIGTERM' || /timed out/i.test(message)) {
    return refuse('failed', 'git diff timed out.')
  }
  if (code === 'ENOBUFS' || /maxBuffer/i.test(message)) {
    return refuse('failed', 'git diff produced more output than AIPA will read.')
  }
  return refuse('failed', detail)
}
