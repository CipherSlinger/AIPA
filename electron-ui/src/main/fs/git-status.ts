import * as fs from 'fs'
import * as path from 'path'
import { execFileSync } from 'child_process'

/**
 * `git status` for the folder a conversation is using (wave 85B).
 *
 * This module is deliberately free of Electron imports: the parsing lives in
 * pure functions so the harness can feed it real captured porcelain strings,
 * and the reader can be exercised against a scratch repository under plain
 * Node. The IPC handler owns path validation because that is where the app's
 * allowed roots live.
 *
 * Three honesty rules shape the result:
 *
 *  - A folder that is not a repository, or a machine without git, is reported
 *    as such. It is never flattened into "clean": absence is not zero.
 *  - A capped list says it was capped and still reports how many entries the
 *    folder actually had, so the UI can say "and N more".
 *  - An unreadable branch name stays null. It is never guessed to be `main`.
 */

/** The reader never hands more than this many entries to the renderer. */
export const GIT_STATUS_MAX_FILES = 200

const DEFAULT_TIMEOUT_MS = 5000
const HEAD_SHA_TIMEOUT_MS = 2000

/**
 * `git status` scans the whole index; a repository with a very large working
 * tree can produce more output than a chat IPC call should carry. Past this
 * ceiling the read is reported as failed rather than silently shortened.
 */
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024

export interface GitStatusFile {
  /** Path relative to the repository root; for renames this is the new path. */
  path: string
  /** Index (staged) status letter, e.g. `M`, `A`, `R`, `?`. */
  index: string
  /** Worktree (unstaged) status letter, e.g. `M`, `D`, `?`. */
  worktree: string
  /** Previous path for a rename/copy entry, parsed from `old -> new`. */
  origPath?: string
}

export interface GitStatusSuccess {
  ok: true
  /**
   * Branch name, or null when HEAD is detached or the header could not be
   * read. Null is not "main".
   */
  branch: string | null
  detached: boolean
  /** Short sha when detached and readable. */
  headSha?: string
  /** Configured upstream, omitted when there is none or it is gone. */
  upstream?: string
  ahead: number
  behind: number
  files: GitStatusFile[]
  /** True when `files` is shorter than `total`. */
  truncated: boolean
  /**
   * Entries `git status` reported before the cap. `files.length === total`
   * exactly when nothing was dropped.
   */
  total: number
  /**
   * Repository root. Porcelain paths are relative to this folder, which can be
   * an ancestor of the folder that was asked about. Omitted only when git
   * answered the status but not the root query.
   */
  root?: string
}

export type GitStatusFailureCode = 'not_a_repo' | 'git_missing' | 'cwd_invalid' | 'failed'

/**
 * Why a folder could not be read, as *this* process knows it.
 *
 * `cwd_invalid` alone conflates "AIPA is not allowed here" with "it is gone",
 * and those two call for different words in the status bar. Only a
 * `cwd_invalid` carries this field; a git failure does not have a folder
 * problem to explain.
 */
export type GitStatusCwdReason =
  | 'outside_allowed_roots'
  | 'missing'
  | 'not_directory'
  | 'no_folder'

export interface GitStatusFailure {
  ok: false
  code: GitStatusFailureCode
  /**
   * Which kind of `cwd_invalid` this is. Omitted for every other code.
   *
   * The renderer must not re-derive this by statting the folder: the answer
   * already says it, and a second opinion could contradict it.
   */
  reason?: GitStatusCwdReason
  /** Short diagnostic for the renderer to append to its translated sentence. */
  message: string
}

export type GitStatusResult = GitStatusSuccess | GitStatusFailure

export type GitStatusGroup = 'staged' | 'unstaged' | 'untracked' | 'conflicted'

/**
 * The seven unmerged XY pairs porcelain reports. A file in one of these states
 * is a conflict, not a normal staged/unstaged change.
 */
const CONFLICT_PAIRS = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'])

/** Which groups one porcelain entry belongs to. `MM` belongs to the first two. */
export function gitStatusGroups(file: GitStatusFile): GitStatusGroup[] {
  const pair = `${file.index}${file.worktree}`
  if (CONFLICT_PAIRS.has(pair)) return ['conflicted']
  if (file.index === '?' && file.worktree === '?') return ['untracked']
  const groups: GitStatusGroup[] = []
  if (file.index !== ' ' && file.index !== '?') groups.push('staged')
  if (file.worktree !== ' ' && file.worktree !== '?') groups.push('unstaged')
  return groups
}

interface ParsedHeader {
  branch: string | null
  detached: boolean
  headSha?: string
  upstream?: string
  ahead: number
  behind: number
}

/**
 * Parse the `## ` line.
 *
 * Accepted forms (as emitted by `--porcelain=v1 -b`):
 *   ## main
 *   ## main...origin/main
 *   ## main...origin/main [ahead 2, behind 1]
 *   ## feature/x...origin/feature/x [gone]
 *   ## No commits yet on main
 *   ## HEAD (no branch)            (detached; the short sha comes from a follow-up)
 *   ## HEAD (detached from abc123)
 */
export function parseGitStatusHeader(line: string): ParsedHeader | null {
  if (!line.startsWith('## ')) return null
  const rest = line.slice(3).trim()
  if (!rest) return { branch: null, detached: false, ahead: 0, behind: 0 }

  if (rest.startsWith('HEAD (no branch)')) {
    return { branch: null, detached: true, ahead: 0, behind: 0 }
  }
  const detachedFrom = /^HEAD \(detached from ([^)]+)\)$/i.exec(rest)
  if (detachedFrom) {
    const sha = detachedFrom[1].trim()
    return { branch: null, detached: true, headSha: sha || undefined, ahead: 0, behind: 0 }
  }
  if (rest.startsWith('HEAD ')) {
    // Any other HEAD form still means "not on a branch"; don't invent a name.
    return { branch: null, detached: true, ahead: 0, behind: 0 }
  }

  const noCommits = /^No commits yet on (.+)$/i.exec(rest)
  if (noCommits) {
    return { branch: noCommits[1].trim() || null, detached: false, ahead: 0, behind: 0 }
  }

  let body = rest
  let ahead = 0
  let behind = 0
  let gone = false
  const bracket = / \[([^\]]*)\]$/.exec(body)
  if (bracket) {
    body = body.slice(0, bracket.index).trimEnd()
    for (const token of bracket[1].split(',')) {
      const trimmed = token.trim()
      const aheadMatch = /^ahead (\d+)$/.exec(trimmed)
      if (aheadMatch) ahead = Number(aheadMatch[1])
      const behindMatch = /^behind (\d+)$/.exec(trimmed)
      if (behindMatch) behind = Number(behindMatch[1])
      if (trimmed === 'gone') gone = true
    }
  }

  // Branch names cannot contain "..", so "..." is unambiguously the upstream
  // separator here.
  const separator = body.indexOf('...')
  let branch = body
  let upstream: string | undefined
  if (separator >= 0) {
    branch = body.slice(0, separator)
    upstream = body.slice(separator + 3) || undefined
  }
  // A gone upstream is still configured but no longer a ref to be ahead of;
  // keeping it would let the UI print arrows that mean nothing.
  if (gone) upstream = undefined

  return {
    branch: branch.trim() || null,
    detached: false,
    ...(upstream ? { upstream } : {}),
    ahead,
    behind,
  }
}

/**
 * Undo git's C-style quoting for one path (`"a b"`, `"caf\303\251"`, `"a\tb"`).
 * Unquoted paths are returned unchanged.
 */
export function unquoteGitPath(value: string): string {
  if (value.length < 2 || !value.startsWith('"') || !value.endsWith('"')) return value
  const body = value.slice(1, -1)
  // Git quotes each byte of a non-ASCII path as an octal escape. Collecting
  // bytes and decoding UTF-8 once is what turns `caf\303\251` into `café`,
  // rather than into two characters of the wrong encoding.
  const bytes: number[] = []
  const pushChar = (ch: string) => {
    for (const byte of Buffer.from(ch, 'utf-8')) bytes.push(byte)
  }
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (ch !== '\\') {
      // Keep surrogate pairs together so a literal emoji is not mangled.
      const code = ch.charCodeAt(0)
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = body[i + 1]
        if (next && next.charCodeAt(0) >= 0xdc00 && next.charCodeAt(0) <= 0xdfff) {
          pushChar(ch + next)
          i++
          continue
        }
      }
      pushChar(ch)
      continue
    }
    const next = body[++i]
    if (next === undefined) break
    switch (next) {
      case 'a': bytes.push(0x07); break
      case 'b': bytes.push(0x08); break
      case 'f': bytes.push(0x0c); break
      case 'n': bytes.push(0x0a); break
      case 'r': bytes.push(0x0d); break
      case 't': bytes.push(0x09); break
      case 'v': bytes.push(0x0b); break
      case '\\': bytes.push(0x5c); break
      case '"': bytes.push(0x22); break
      default:
        if (/[0-7]/.test(next)) {
          let octal = next
          while (octal.length < 3 && /[0-7]/.test(body[i + 1] ?? '')) {
            octal += body[++i]
          }
          bytes.push(parseInt(octal, 8) & 0xff)
        } else {
          pushChar(next)
        }
    }
  }
  return Buffer.from(bytes).toString('utf-8')
}

/**
 * Find the ` -> ` rename separator without being fooled by an arrow inside a
 * quoted path. Returns null when there is no unquoted separator.
 */
function splitRename(pathField: string): [string, string] | null {
  let quoted = false
  for (let i = 0; i < pathField.length; i++) {
    const ch = pathField[i]
    if (quoted && ch === '\\') {
      i++
      continue
    }
    if (ch === '"') {
      quoted = !quoted
      continue
    }
    if (!quoted && pathField.startsWith(' -> ', i)) {
      return [pathField.slice(0, i), pathField.slice(i + 4)]
    }
  }
  return null
}

/**
 * Parse one porcelain v1 line (`XY path`). The two status letters occupy the
 * first two columns, column 3 is a space, and everything after it is the path
 * (possibly quoted, possibly a rename's `old -> new`).
 */
export function parseGitStatusLine(line: string): GitStatusFile | null {
  if (line.length < 4) return null
  if (line.startsWith('## ')) return null
  const index = line[0]
  const worktree = line[1]
  if (line[2] !== ' ') return null
  const raw = line.slice(3)
  if (!raw) return null

  if (index === 'R' || index === 'C' || worktree === 'R' || worktree === 'C') {
    const pair = splitRename(raw)
    if (pair) {
      const origPath = unquoteGitPath(pair[0])
      const newPath = unquoteGitPath(pair[1])
      if (newPath) return { path: newPath, index, worktree, origPath }
    }
  }
  return { path: unquoteGitPath(raw), index, worktree }
}

/** Parse a whole `--porcelain=v1 -b` output into the structured result. */
export function parseGitStatus(
  output: string,
  maxFiles: number = GIT_STATUS_MAX_FILES,
): GitStatusSuccess {
  let header: ParsedHeader = { branch: null, detached: false, ahead: 0, behind: 0 }
  let headerSeen = false
  const files: GitStatusFile[] = []
  let total = 0

  for (const line of output.split(/\r?\n/)) {
    if (!line) continue
    if (!headerSeen && line.startsWith('## ')) {
      header = parseGitStatusHeader(line) ?? header
      headerSeen = true
      continue
    }
    const file = parseGitStatusLine(line)
    if (!file) continue
    total += 1
    if (files.length < maxFiles) files.push(file)
  }

  const result: GitStatusSuccess = {
    ok: true,
    branch: header.branch,
    detached: header.detached,
    ahead: header.ahead,
    behind: header.behind,
    files,
    truncated: total > files.length,
    total,
  }
  if (header.headSha) result.headSha = header.headSha
  if (header.upstream) result.upstream = header.upstream
  return result
}

export interface ReadGitStatusOptions {
  /** Overridable for tests; production uses whatever `git` resolves to on PATH. */
  gitBin?: string
  maxFiles?: number
  timeoutMs?: number
}

function fail(
  code: GitStatusFailureCode,
  message: string,
  reason?: GitStatusCwdReason,
): GitStatusFailure {
  const failure: GitStatusFailure = { ok: false, code, message: message.slice(0, 500) }
  if (reason) failure.reason = reason
  return failure
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value
  if (Buffer.isBuffer(value)) return value.toString('utf-8')
  return ''
}

interface ExecFailure {
  code?: unknown
  status?: unknown
  signal?: unknown
  message?: unknown
  stdout?: unknown
  stderr?: unknown
}

/** Map an `execFileSync` throw onto the IPC contract's codes. */
export function classifyGitError(err: unknown): GitStatusFailure {
  const failure = (err ?? {}) as ExecFailure
  const code = typeof failure.code === 'string' ? failure.code : ''
  if (code === 'ENOENT') {
    return fail('git_missing', 'Git was not found on PATH.')
  }
  const stderr = textOf(failure.stderr).trim()
  const stdout = textOf(failure.stdout).trim()
  const message = typeof failure.message === 'string' ? failure.message : ''
  const detail = stderr || stdout || message || 'unknown error'

  if (/not a git repository|not a git work tree|must be run in a work tree/i.test(detail)) {
    return fail('not_a_repo', detail)
  }
  if (code === 'ETIMEDOUT' || failure.signal === 'SIGTERM' || /timed out/i.test(message)) {
    return fail('failed', 'git status timed out.')
  }
  if (code === 'ENOBUFS' || /maxBuffer/i.test(message)) {
    return fail('failed', 'git status produced more output than AIPA will read.')
  }
  return fail('failed', detail)
}

function readGitOutput(
  gitBin: string,
  args: string[],
  cwd: string,
  timeout: number,
): string {
  return execFileSync(gitBin, args, {
    cwd,
    timeout,
    maxBuffer: MAX_OUTPUT_BYTES,
    encoding: 'utf-8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

/**
 * Read and parse `git status` in `cwd`. The folder must already have passed
 * the IPC handler's allowed-roots check; this function only checks existence
 * so a caller passing a bad folder gets `cwd_invalid` instead of a git error.
 */
export function readGitStatus(cwd: string, options: ReadGitStatusOptions = {}): GitStatusResult {
  if (typeof cwd !== 'string' || !cwd.trim()) {
    return fail('cwd_invalid', 'No folder was given.', 'no_folder')
  }
  const resolved = path.resolve(cwd)
  try {
    if (!fs.statSync(resolved).isDirectory()) {
      return fail('cwd_invalid', `Not a folder: ${resolved}`, 'not_directory')
    }
  } catch {
    return fail('cwd_invalid', `Folder does not exist: ${resolved}`, 'missing')
  }

  const gitBin = options.gitBin || 'git'
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  let stdout: string
  try {
    stdout = readGitOutput(
      gitBin,
      ['-c', 'core.quotePath=false', 'status', '--porcelain=v1', '-b', '--untracked-files=all'],
      resolved,
      timeout,
    )
  } catch (err) {
    return classifyGitError(err)
  }

  const parsed = parseGitStatus(stdout, options.maxFiles)

  if (parsed.detached && !parsed.headSha) {
    try {
      const sha = readGitOutput(
        gitBin,
        ['rev-parse', '--short', 'HEAD'],
        resolved,
        Math.min(timeout, HEAD_SHA_TIMEOUT_MS),
      ).trim()
      if (sha) parsed.headSha = sha
    } catch {
      // A detached HEAD with no readable sha is still detached; the UI says so
      // without a sha rather than inventing one.
    }
  }

  try {
    const root = readGitOutput(
      gitBin,
      ['rev-parse', '--show-toplevel'],
      resolved,
      Math.min(timeout, HEAD_SHA_TIMEOUT_MS),
    ).trim()
    if (root) parsed.root = root
  } catch {
    // Paths stay relative to the asked folder when no root could be read.
  }

  return parsed
}
