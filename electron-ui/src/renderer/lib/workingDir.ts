// Which folder a turn will actually run in.
//
// Four places used to answer this question with three different formulas: the
// chat header and the send path preferred a tab override, the terminal dock
// preferred the chat store's copy, and the status bar showed the chat store at
// all — so the bar could name a folder the assistant was not running in. One
// resolver, used by every surface, is the only way those can agree.
//
// Pure: no React, no IPC. The harness drives it directly.

/** Where the folder came from, so the UI can say why rather than just which. */
export type WorkingDirSource = 'tab' | 'global' | 'home' | 'none'

export interface WorkingDirInput {
  /** The open conversation's own folder — picked in this tab, or restored on open. */
  tabCwd?: string | null
  /** The preference every new conversation starts from. */
  globalDir?: string | null
  /** Last resort: the user's home. Not a working folder, only the least wrong one. */
  homeDir?: string | null
}

export interface WorkingDirResolution {
  /** '' when nothing is known. A caller must not invent a path for it. */
  dir: string
  source: WorkingDirSource
}

function trimmed(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * The effective folder. A blank value is absence, not a folder named "": an
 * empty tab override falls through to the global preference, exactly like an
 * unset one, because both mean "this conversation has not chosen".
 */
export function resolveWorkingDir(input: WorkingDirInput): WorkingDirResolution {
  const tab = trimmed(input.tabCwd)
  if (tab) return { dir: tab, source: 'tab' }
  const global = trimmed(input.globalDir)
  if (global) return { dir: global, source: 'global' }
  const home = trimmed(input.homeDir)
  if (home) return { dir: home, source: 'home' }
  return { dir: '', source: 'none' }
}

/**
 * The folder an opened conversation should take with it.
 *
 * A Codex transcript records the folder it ran in; that record beats the
 * department it was filed under, because a department is a grouping while the
 * cwd is where the work happened. With neither, `undefined` — the caller clears
 * the tab override so the conversation falls back to the current preference
 * instead of silently inheriting the folder of whatever was open before.
 */
export function sessionWorkingDir(
  sessionCwd: string | null | undefined,
  deptDirectory: string | null | undefined,
): string | undefined {
  const fromSession = trimmed(sessionCwd)
  if (fromSession) return fromSession
  const fromDept = trimmed(deptDirectory)
  if (fromDept) return fromDept
  return undefined
}

/**
 * The single decision for "which folder does this opened conversation run in
 * when it was opened *for a task*?".
 *
 * The task directory wins over both the transcript's recorded cwd and the
 * department the task is filed under. A task is a folder of work; a department
 * is attribution. If the conversation is attached to a task, letting a stale
 * rollout cwd (or a department directory) decide would move the next turn out
 * of the folder the user believes the task owns. Only when there is no task
 * context does this fall back to the ordinary session/department rule.
 */
export function sessionOpenDir(
  sessionCwd: string | null | undefined,
  deptDirectory: string | null | undefined,
  taskDirectory: string | null | undefined,
): string | undefined {
  const fromTask = trimmed(taskDirectory)
  if (fromTask) return fromTask
  return sessionWorkingDir(sessionCwd, deptDirectory)
}

/**
 * A path reduced to what two of them can be compared on: the same folder
 * spelled with a trailing separator or different case is the same folder, and
 * telling the user it changed would be a lie. Windows is case-insensitive;
 * every other platform is not.
 */
export function normalizeWorkingDir(dir: string, platform?: string): string {
  const base = trimmed(dir).replace(/[\\/]+$/, '')
  if (!base) return ''
  const win = platform === 'win32' || /^[a-zA-Z]:[\\/]/.test(base) || base.startsWith('\\\\')
  return win ? base.replace(/\//g, '\\').toLowerCase() : base
}

export function sameWorkingDir(a: string | null | undefined, b: string | null | undefined, platform?: string): boolean {
  const left = normalizeWorkingDir(a ?? '', platform)
  const right = normalizeWorkingDir(b ?? '', platform)
  return left !== '' && left === right
}

/**
 * What a folder pick can honestly change.
 *
 * A Codex conversation is resumed with `thread/resume`, and the turn runs in
 * the cwd recorded in its rollout — the directory the app-server was spawned
 * in is not the turn's cwd. So picking a folder for a conversation that has
 * already been recorded cannot move it, and offering that would be a lie. Such
 * a pick can only mean "start a new conversation over there". A draft with no
 * record yet really is moved by the pick.
 */
export type FolderTarget = 'this_conversation' | 'new_conversation'

export function folderChangeTarget(recordedCwd: string | null | undefined): FolderTarget {
  return trimmed(recordedCwd) ? 'new_conversation' : 'this_conversation'
}

/**
 * One `fs:statPaths` answer, read as three states. `missing` needs both halves
 * of the envelope: a refused or failed stat proves nothing, so it stays
 * `unchecked` and the folder keeps being used without a warning.
 */
export type WorkingDirPresence = 'present' | 'missing' | 'unchecked'

export function workingDirPresence(result: { exists?: unknown; error?: unknown } | null | undefined): WorkingDirPresence {
  if (!result) return 'unchecked'
  if (result.error !== null && result.error !== undefined) return 'unchecked'
  if (result.exists === true) return 'present'
  if (result.exists === false) return 'missing'
  return 'unchecked'
}

/** The last path segment, for a chip that cannot afford the whole path. */
export function workingDirLabel(dir: string, homeDir?: string | null): string {
  const base = trimmed(dir)
  if (!base) return ''
  const home = trimmed(homeDir)
  if (home) {
    const n = normalizeWorkingDir(base)
    const h = normalizeWorkingDir(home)
    if (n === h) return '~'
    // Only a separator may follow the home directory; `~/x` is a child of
    // home, `~/../` is not.
    if (n.startsWith(h + '\\') || n.startsWith(h + '/')) {
      const rest = base.slice(home.length).replace(/^[\\/]+/, '')
      if (rest) return `~/${rest}`
    }
  }
  const parts = base.split(/[\\/]+/).filter(Boolean)
  return parts[parts.length - 1] ?? base
}
