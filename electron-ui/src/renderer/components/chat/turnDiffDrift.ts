/**
 * Pure drift rules for the turn-diff card.
 *
 * The card records an aggregate diff for a turn. Once the turn is over, that
 * diff is only a historical record: the files may have been edited, touched or
 * deleted since. This module turns the diff's paths plus a stat snapshot and
 * the moment AIPA received the diff into exactly four honest states——
 * `changed`, `unchanged`, `missing`, `unchecked`.
 *
 * Deliberately React- and IPC-free so a plain Node harness can exercise every
 * rule. The caller decides *which* paths to stat (and only files in watched
 * directories get that far); this module decides what may be claimed.
 */

import { canonicalWatchPath } from '../filebrowser/watchModel'

export type TurnDiffDriftState = 'changed' | 'unchanged' | 'missing' | 'unchecked'

/** Why a file could not be judged. Only meaningful for `unchecked`. */
export type TurnDiffDriftReason =
  | 'capture_unknown'
  | 'path_unknown'
  | 'not_watched'
  | 'not_checked'
  | 'stat_failed'

/**
 * What the diff itself says about the path once the turn is over. A deletion or
 * rename source is expected to be gone; its absence is not drift. Everything
 * else is expected to still exist.
 */
export type TurnDiffExpectation = 'present' | 'gone'

/** A path as the diff wrote it, plus the absolute form when it could be resolved. */
export interface TurnDiffPathRef {
  /** Path with the git `a/` / `b/` prefix removed, as displayed. */
  path: string
  /** null when there is no known turn cwd to resolve a relative path. */
  absolutePath: string | null
  /** Defaults to `present` for callers that only have a path. */
  expected?: TurnDiffExpectation
}

/** Structural mirror of `FsStatPathResultData` in the preload API. */
export interface TurnDiffStatResult {
  path: string
  exists?: boolean
  isFile?: boolean
  size?: number | null
  mtimeMs?: number | null
  /** A non-null error means the stat did not establish anything. */
  error?: string | null
}

export interface TurnDiffDriftFile extends TurnDiffPathRef {
  expected: TurnDiffExpectation
  state: TurnDiffDriftState
  reason: TurnDiffDriftReason | null
  size: number | null
  mtimeMs: number | null
}

export interface TurnDiffDriftSummary {
  total: number
  changed: number
  /** Missing files the diff expected to still be there: real drift. */
  missing: number
  /** Missing files the diff itself deleted or renamed away: not drift. */
  missingExpected: number
  unchanged: number
  unchecked: number
  /** Unchecked files whose directory was not reported as watched. */
  uncheckedNotWatched: number
  /** changed + missing: the files the diff no longer describes. */
  drifted: number
}

export interface TurnDiffDrift {
  files: TurnDiffDriftFile[]
  summary: TurnDiffDriftSummary
}

export type DriftTranslator = (key: string, params?: Record<string, string | number>) => string

/** Matches the bridge's 32 KiB diff bound; a path list beyond it is pathological. */
const MAX_DIFF_FILE_PATHS = 256

function isWindowsPath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) || value.includes('\\')
}

/** Git's C-style quoting, used when a path contains spaces or special characters. */
function unquoteGitPath(token: string): string {
  const body = token.slice(1, -1)
  let out = ''
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (ch !== '\\') {
      out += ch
      continue
    }
    const next = body[++i]
    if (next === undefined) {
      out += '\\'
      continue
    }
    if (next === 'n') out += '\n'
    else if (next === 't') out += '\t'
    else if (next === 'r') out += '\r'
    else if (next === '"') out += '"'
    else if (next === '\\') out += '\\'
    else if (/[0-7]/.test(next)) {
      let octal = next
      for (let k = 0; k < 2 && /[0-7]/.test(body[i + 1] ?? ''); k++) octal += body[++i]
      out += String.fromCharCode(parseInt(octal, 8))
    } else {
      out += next
    }
  }
  return out
}

function readQuotedToken(input: string): { value: string; rest: string } | null {
  if (!input.startsWith('"')) return null
  let escaped = false
  for (let i = 1; i < input.length; i++) {
    const ch = input[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === '\\') {
      escaped = true
      continue
    }
    if (ch === '"') {
      return {
        value: unquoteGitPath(input.slice(0, i + 1)),
        rest: input.slice(i + 1).trimStart(),
      }
    }
  }
  return null
}

function readUnquotedToken(input: string): { value: string; rest: string } | null {
  const trimmed = input.trimStart()
  if (!trimmed) return null
  const space = trimmed.indexOf(' ')
  if (space === -1) return { value: trimmed, rest: '' }
  return { value: trimmed.slice(0, space), rest: trimmed.slice(space + 1) }
}

/**
 * Paths on a `diff --git` line.
 *
 * Git does not quote ordinary spaces, so `a/foo bar b/foo bar` is parsed by
 * finding the ` b/` whose left and right halves are identical. A rename whose
 * halves differ falls back to the first ` b/` boundary.
 */
function parseGitDiffPaths(rest: string): string[] {
  if (rest.startsWith('"')) {
    const first = readQuotedToken(rest)
    if (!first) return []
    const second = readQuotedToken(first.rest)
    return second ? [first.value, second.value] : [first.value]
  }

  if (rest.startsWith('a/')) {
    const body = rest.slice(2)
    for (let idx = body.indexOf(' b/'); idx !== -1; idx = body.indexOf(' b/', idx + 1)) {
      const left = body.slice(0, idx)
      const right = body.slice(idx + 3)
      if (left === right) return [`a/${left}`, `b/${right}`]
    }
    const split = body.indexOf(' b/')
    if (split > 0) return [`a/${body.slice(0, split)}`, `b/${body.slice(split + 3)}`]
  }

  const first = readUnquotedToken(rest)
  if (!first) return []
  const second = readUnquotedToken(first.rest)
  return second ? [first.value, second.value] : [first.value]
}

/** `---` / `+++` headers end at a tab before the timestamp; spaces may be real. */
function parseHeaderPath(rest: string): string | null {
  const input = rest.trimStart()
  if (input.startsWith('"')) {
    const token = readQuotedToken(input)
    return token ? token.value : null
  }
  const tab = input.indexOf('\t')
  const value = tab === -1 ? input : input.slice(0, tab)
  return value || null
}

/** `rename from` / `copy to` lines carry a plain or C-quoted path, no timestamp. */
function parseMetadataPath(rest: string): string | null {
  const input = rest.trim()
  if (!input) return null
  if (input.startsWith('"')) {
    const token = readQuotedToken(input)
    return token ? token.value : null
  }
  return input
}

function stripDiffPrefix(value: string): string {
  return value.startsWith('a/') || value.startsWith('b/') ? value.slice(2) : value
}

function dedupeKey(path: string, windows: boolean): string {
  const normalized = path.replace(/\\/g, '/')
  return windows ? normalized.toLowerCase() : normalized
}

export function isAbsoluteDiffPath(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\')
}

/**
 * Resolve a diff path against the thread cwd. A relative path with no known
 * cwd stays unresolved on purpose: guessing would make the card stat a file
 * that has nothing to do with the turn.
 */
export function resolveDiffFilePath(path: string, cwd?: string | null): string | null {
  if (typeof path !== 'string' || !path) return null
  if (isAbsoluteDiffPath(path)) return path
  if (typeof cwd !== 'string' || !cwd.trim() || !isAbsoluteDiffPath(cwd)) return null
  const separator = cwd.includes('\\') && !cwd.includes('/') ? '\\' : '/'
  const base = cwd.replace(/[\\/]+$/, '')
  const tail = path.replace(/^[\\/]+/, '')
  // Unified diffs always use `/`; a Windows cwd gets native separators so the
  // displayed absolute path does not mix both.
  const nativeTail = separator === '\\' ? tail.replace(/\//g, '\\') : tail
  return `${base}${separator}${nativeTail}`
}

/** Parent directory of an absolute path without relying on Node's `path`. */
export function diffPathDirectory(path: string): string | null {
  if (typeof path !== 'string' || !path) return null
  const trimmed = path.replace(/[\\/]+$/, '')
  const slash = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  if (slash < 0) return null
  if (slash === 0) return trimmed.slice(0, 1)
  const directory = trimmed.slice(0, slash)
  if (/^[A-Za-z]:$/.test(directory)) {
    return `${directory}${path[2] === '\\' ? '\\' : '/'}`
  }
  return directory
}

/**
 * Directories the card must ask main to watch before it may stat anything.
 * Only parents of resolvable paths are included; a path with no cwd cannot be
 * watched either, and therefore stays `unchecked`.
 */
export function collectDiffDirectories(paths: readonly TurnDiffPathRef[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const ref of paths) {
    if (!ref || !ref.absolutePath) continue
    const directory = diffPathDirectory(ref.absolutePath)
    if (!directory) continue
    const key = canonicalWatchPath(directory)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(directory)
  }
  return result
}

interface DiffBlock {
  oldGit: string | null
  newGit: string | null
  oldHeader: string | null
  newHeader: string | null
  deleted: boolean
  added: boolean
  renameFrom: string | null
  renameTo: string | null
  copyFrom: string | null
  copyTo: string | null
}

/**
 * Every file path a unified diff touches, in first-seen order, together with
 * what the diff says the disk should look like afterwards.
 *
 * Both `diff --git` pairs and `---`/`+++` headers are read; `---`/`+++` lines
 * inside a hunk are code, not headers, so the same stateful rule as
 * `classifyTurnDiff` applies. A deletion or a rename source is marked `gone`:
 * treating its absence as drift would warn about the very change the diff
 * records. A front-truncated diff can lose the first file's headers; the
 * surviving `diff --git` boundaries still yield the later files.
 */
export function extractTurnDiffPaths(
  diff: string | null | undefined,
  cwd?: string | null,
): TurnDiffPathRef[] {
  if (typeof diff !== 'string' || diff.length === 0) return []

  const lines = diff.split(/\r?\n/)
  const entries: Array<{ path: string; expected: TurnDiffExpectation }> = []
  const indexByKey = new Map<string, number>()

  const push = (
    value: string | null,
    expected: TurnDiffExpectation,
    stripPrefix = true,
  ): void => {
    if (!value) return
    // `rename from` / `copy to` paths are already repo-relative. Stripping an
    // `a/` there would silently point the check at a different file when the
    // repository itself has a folder named `a` or `b`.
    const path = stripPrefix ? stripDiffPrefix(value) : value
    if (!path || path === '/dev/null') return
    // Case-fold only when the path or the turn cwd is Windows-shaped. Looking
    // for a backslash anywhere in the diff would be fooled by patch content.
    const key = dedupeKey(path, isWindowsPath(path) || isWindowsPath(cwd ?? ''))
    const existing = indexByKey.get(key)
    if (existing !== undefined) {
      // Contradictory blocks collapse to `present`: a wrong `gone` suppresses a
      // real drift warning, while a wrong `present` merely stats the path.
      if (expected === 'present') entries[existing].expected = 'present'
      return
    }
    if (entries.length >= MAX_DIFF_FILE_PATHS) return
    indexByKey.set(key, entries.length)
    entries.push({ path, expected })
  }

  const flush = (block: DiffBlock | null): void => {
    if (!block) return
    const oldPath = block.oldHeader !== '/dev/null' ? block.oldHeader : null
    const newPath = block.newHeader !== '/dev/null' ? block.newHeader : null
    const oldIsNull = block.oldHeader === '/dev/null'
    const newIsNull = block.newHeader === '/dev/null'

    if (block.deleted || newIsNull) {
      push(block.renameFrom ?? oldPath ?? block.oldGit, 'gone', !block.renameFrom)
      return
    }
    if (block.added || oldIsNull) {
      push(block.renameTo ?? newPath ?? block.newGit, 'present', !block.renameTo)
      return
    }
    if (block.copyFrom || block.copyTo) {
      // A copy leaves the source in place; only the destination is new.
      push(block.copyFrom ?? oldPath ?? block.oldGit, 'present', !block.copyFrom)
      push(block.copyTo ?? newPath ?? block.newGit, 'present', !block.copyTo)
      return
    }
    if (block.renameFrom || block.renameTo) {
      push(block.renameFrom ?? oldPath ?? block.oldGit, 'gone', !block.renameFrom)
      push(block.renameTo ?? newPath ?? block.newGit, 'present', !block.renameTo)
      return
    }

    const oldValue = oldPath ?? block.oldGit
    const newValue = newPath ?? block.newGit
    if (oldValue && newValue && stripDiffPrefix(oldValue) !== stripDiffPrefix(newValue)) {
      // A differing pair without rename metadata still describes a move; the
      // old side is expected to be gone.
      push(oldValue, 'gone')
      push(newValue, 'present')
      return
    }
    push(newValue ?? oldValue, 'present')
  }

  let block: DiffBlock | null = null
  let inHunk = false
  let pendingOld: string | null = null

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      flush(block)
      const values = parseGitDiffPaths(line.slice('diff --git '.length))
      block = {
        oldGit: values[0] ?? null,
        newGit: values[1] ?? values[0] ?? null,
        oldHeader: null,
        newHeader: null,
        deleted: false,
        added: false,
        renameFrom: null,
        renameTo: null,
        copyFrom: null,
        copyTo: null,
      }
      inHunk = false
      pendingOld = null
      continue
    }
    if (line.startsWith('@@')) {
      flush(block)
      block = null
      inHunk = true
      pendingOld = null
      continue
    }
    if (inHunk) continue

    if (block) {
      if (line.startsWith('deleted file mode')) block.deleted = true
      else if (line.startsWith('new file mode')) block.added = true
      else if (line.startsWith('rename from ')) block.renameFrom = parseMetadataPath(line.slice('rename from '.length))
      else if (line.startsWith('rename to ')) block.renameTo = parseMetadataPath(line.slice('rename to '.length))
      else if (line.startsWith('copy from ')) block.copyFrom = parseMetadataPath(line.slice('copy from '.length))
      else if (line.startsWith('copy to ')) block.copyTo = parseMetadataPath(line.slice('copy to '.length))
      else if (line.startsWith('--- ')) block.oldHeader = parseHeaderPath(line.slice(4))
      else if (line.startsWith('+++ ')) block.newHeader = parseHeaderPath(line.slice(4))
      continue
    }

    // A plain unified diff has no `diff --git` boundary to lean on.
    if (line.startsWith('--- ')) {
      pendingOld = parseHeaderPath(line.slice(4))
      continue
    }
    if (line.startsWith('+++ ')) {
      const next = parseHeaderPath(line.slice(4))
      const previous = pendingOld
      pendingOld = null
      if (!next) continue
      if (previous === '/dev/null') push(next, 'present')
      else if (next === '/dev/null') push(previous, 'gone')
      else if (previous && stripDiffPrefix(previous) !== stripDiffPrefix(next)) {
        push(previous, 'gone')
        push(next, 'present')
      } else {
        push(next, 'present')
      }
      continue
    }
    // A `---` line that is not followed by `+++` is not a file header pair.
    pendingOld = null
  }

  flush(block)

  return entries.map(entry => ({
    path: entry.path,
    expected: entry.expected,
    absolutePath: resolveDiffFilePath(entry.path, cwd),
  }))
}

function decideFile(
  ref: TurnDiffPathRef,
  byPath: ReadonlyMap<string, TurnDiffStatResult>,
  capturedAt: number | null,
  watched: ReadonlySet<string> | null,
): TurnDiffDriftFile {
  const expected: TurnDiffExpectation = ref.expected === 'gone' ? 'gone' : 'present'
  const base = {
    path: ref.path,
    absolutePath: ref.absolutePath,
    expected,
    size: null as number | null,
    mtimeMs: null as number | null,
  }
  const unchecked = (reason: TurnDiffDriftReason): TurnDiffDriftFile => ({
    ...base,
    state: 'unchecked',
    reason,
  })

  // No receipt time means there is no defensible line between "before" and
  // "after" the diff; even a successful stat cannot support a claim.
  if (capturedAt === null) return unchecked('capture_unknown')
  if (!ref.absolutePath) return unchecked('path_unknown')

  if (watched) {
    const directory = diffPathDirectory(ref.absolutePath)
    const key = directory ? canonicalWatchPath(directory) : null
    if (!key || !watched.has(key)) return unchecked('not_watched')
  }

  const key = canonicalWatchPath(ref.absolutePath) ?? ref.absolutePath
  const stat = byPath.get(key)
  if (!stat) return unchecked('not_checked')
  if (typeof stat.error === 'string' && stat.error) return unchecked('stat_failed')

  if (stat.exists === false) return { ...base, state: 'missing', reason: null }
  if (stat.exists !== true) return unchecked('stat_failed')

  const size = typeof stat.size === 'number' && Number.isFinite(stat.size) ? stat.size : null
  const mtimeMs = typeof stat.mtimeMs === 'number' && Number.isFinite(stat.mtimeMs) ? stat.mtimeMs : null

  // A path that now names a directory is no longer the file the diff changed.
  if (stat.isFile === false) return { ...base, state: 'missing', reason: null }

  // The diff deleted or renamed this path away. If something lives there now,
  // the disk contradicts the diff even when its mtime is old (a restored file
  // keeps its timestamp): presence, not time, is the evidence here.
  if (expected === 'gone') {
    return { ...base, size, mtimeMs, state: 'changed', reason: null }
  }

  if (mtimeMs === null) return unchecked('stat_failed')

  return {
    ...base,
    size,
    mtimeMs,
    state: mtimeMs > capturedAt ? 'changed' : 'unchanged',
    reason: null,
  }
}

/**
 * Decide every file's state. `watchedDirectories` is the set main actually
 * started watching; when omitted, the caller is responsible for having stat'ed
 * only paths it is allowed to ask about. Passing an empty set marks every path
 * `not_watched` — never `unchanged`.
 */
export function decideTurnDiffDrift(
  paths: readonly TurnDiffPathRef[],
  stats: readonly TurnDiffStatResult[] | null | undefined,
  capturedAt: number | null | undefined,
  watchedDirectories?: readonly string[] | null,
): TurnDiffDrift {
  const knownCapture = typeof capturedAt === 'number' && Number.isFinite(capturedAt)
    ? capturedAt
    : null

  const byPath = new Map<string, TurnDiffStatResult>()
  for (const stat of stats ?? []) {
    if (!stat || typeof stat.path !== 'string') continue
    const key = canonicalWatchPath(stat.path) ?? stat.path
    byPath.set(key, stat)
  }

  let watched: Set<string> | null = null
  if (Array.isArray(watchedDirectories)) {
    watched = new Set<string>()
    for (const directory of watchedDirectories) {
      const key = canonicalWatchPath(directory)
      if (key) watched.add(key)
    }
  }

  const files: TurnDiffDriftFile[] = []
  let changed = 0
  let missing = 0
  let missingExpected = 0
  let unchanged = 0
  let unchecked = 0
  let uncheckedNotWatched = 0

  for (const ref of paths) {
    const file = decideFile(ref, byPath, knownCapture, watched)
    files.push(file)
    if (file.state === 'changed') changed++
    else if (file.state === 'missing') {
      if (file.expected === 'gone') missingExpected++
      else missing++
    } else if (file.state === 'unchanged') unchanged++
    else {
      unchecked++
      if (file.reason === 'not_watched') uncheckedNotWatched++
    }
  }

  return {
    files,
    summary: {
      total: files.length,
      changed,
      missing,
      missingExpected,
      unchanged,
      unchecked,
      uncheckedNotWatched,
      drifted: changed + missing,
    },
  }
}

/** The single warning line the card shows when at least one file drifted. */
export function driftSummaryLine(
  summary: TurnDiffDriftSummary,
  t: DriftTranslator,
): string | null {
  if (summary.drifted === 0) return null
  if (summary.changed > 0 && summary.missing > 0) {
    return t('codex.diff.drift.mixed', { changed: summary.changed, missing: summary.missing })
  }
  if (summary.missing > 0) {
    return summary.missing === 1
      ? t('codex.diff.drift.missingOne', { count: 1 })
      : t('codex.diff.drift.missingMany', { count: summary.missing })
  }
  return summary.changed === 1
    ? t('codex.diff.drift.changedOne', { count: 1 })
    : t('codex.diff.drift.changedMany', { count: summary.changed })
}

/**
 * The quiet line that keeps an unchecked file from reading as fresh. "Not
 * watched" is named explicitly; every other reason stays a bare "not checked"
 * because the card cannot know more.
 */
export function driftUncheckedLine(
  summary: TurnDiffDriftSummary,
  t: DriftTranslator,
): string | null {
  if (summary.unchecked === 0) return null
  if (summary.uncheckedNotWatched === summary.unchecked) {
    return summary.unchecked === 1
      ? t('codex.diff.drift.uncheckedNotWatchedOne', { count: 1 })
      : t('codex.diff.drift.uncheckedNotWatchedMany', { count: summary.unchecked })
  }
  return summary.unchecked === 1
    ? t('codex.diff.drift.uncheckedOne', { count: 1 })
    : t('codex.diff.drift.uncheckedMany', { count: summary.unchecked })
}

export function driftChipKey(state: Exclude<TurnDiffDriftState, 'unchecked'>): string {
  if (state === 'changed') return 'codex.diff.drift.chipChanged'
  if (state === 'missing') return 'codex.diff.drift.chipMissing'
  return 'codex.diff.drift.chipUnchanged'
}
