// Folders the user has granted AIPA, remembered across restarts.
//
// The file-system gate (`safePath` + `getAllowedFsRoots`) was built when the app
// had exactly one working folder: home, `~/.claude`, and the global preference.
// Per-conversation and per-job folders broke that assumption — a project on
// another drive is a perfectly ordinary place to work, but the gate refuses it,
// so the git chip vanishes, a shell will not open, and a scheduled job cannot be
// saved pointing there. The gate is right to refuse anything the app was not
// given; what was missing is a way to be *given* a folder.
//
// The grant is recorded where the consent happened: the main process, when the
// user answers an OS folder dialog. The renderer cannot add a root by asking —
// it would only be echoing a path it made up. Every refusal stays a refusal
// until a human picks the folder.
//
// Kept free of electron-store so the gate's many call sites stay loadable in
// pure harnesses: `configureAllowedRoots` is called once at startup with the
// persisted list and a callback that writes it back.
//
// What this is and is not: the gate stops mistakes and stale claims — a
// conversation pointing at a folder the app never opened, a diff asked for in
// the wrong checkout, a job saved against a path nobody picked. It is not a
// boundary against a compromised renderer, and it does not pretend to be: the
// renderer can already set `workingDir`, which the gate treats as a root, and
// it can ask main to spawn a shell. A granted list is still worth keeping
// explicit, because it is visible, revocable, and it is what every refusal is
// able to point at.

import path from 'path'

/** Roots granted at run time, in the order they were granted. */
let granted: string[] = []

/** How a newly granted root reaches disk. Set once, at startup. */
let persist: ((roots: string[]) => void) | null = null

/**
 * Resolve and fold a folder for comparison.
 *
 * Windows paths are case-insensitive, so they fold to lower case; other
 * platforms do not, and folding there would merge two real folders. Trailing
 * separators are dropped so `D:\work` and `D:\work\` are one grant.
 */
export function normalizeAllowedRoot(dir: string): string {
  const resolved = path.resolve(dir)
  const trimmed = resolved.length > 1 && /[\\/]$/.test(resolved)
    ? resolved.replace(/[\\/]+$/, '')
    : resolved
  return process.platform === 'win32' ? trimmed.toLowerCase() : trimmed
}

/**
 * Wire the persisted list in. Called once, from IPC registration, before any
 * handler can consult the gate. Replacing the callback keeps a second call
 * (a test harness, a reload) from stacking writers.
 */
export function configureAllowedRoots(
  initial: readonly string[] | null | undefined,
  persistRoots: ((roots: string[]) => void) | null,
): void {
  granted = []
  const seen = new Set<string>()
  for (const entry of Array.isArray(initial) ? initial : []) {
    if (typeof entry !== 'string' || !entry.trim()) continue
    const resolved = path.resolve(entry.trim())
    const key = normalizeAllowedRoot(resolved)
    if (seen.has(key)) continue
    seen.add(key)
    granted.push(resolved)
  }
  persist = typeof persistRoots === 'function' ? persistRoots : null
}

/** Every granted folder, in grant order. A copy: callers cannot edit the list. */
export function getAllowedRoots(): string[] {
  return granted.slice()
}

/**
 * Record a folder the user just chose. Returns true only when the grant is new,
 * so a caller can say "added" rather than "already allowed".
 *
 * A path that is not absolute is refused here: `path.resolve` would silently
 * anchor it to the process's cwd, which is not a folder the user picked.
 */
export function registerAllowedRoot(dir: string): boolean {
  if (typeof dir !== 'string' || !dir.trim() || !path.isAbsolute(dir.trim())) return false
  const resolved = path.resolve(dir.trim())
  const key = normalizeAllowedRoot(resolved)
  if (granted.some(entry => normalizeAllowedRoot(entry) === key)) return false
  granted.push(resolved)
  try {
    persist?.(granted.slice())
  } catch {
    // A failed write must not undo the grant in this session: the folder is
    // still one the user picked, and the next startup is the only thing that
    // loses it. Callers are not told, because nothing about this turn is wrong.
  }
  return true
}

/**
 * Withdraw every grant at once, for "reset preferences".
 *
 * Clearing the stored pref alone would not be enough: the in-memory list is what
 * the gate reads, and the next register/forget would write that list straight
 * back over the cleared file. A reset that is silently undone the first time a
 * folder is picked again is worse than no reset at all.
 */
export function clearAllowedRoots(): number {
  const count = granted.length
  if (count === 0) return 0
  granted = []
  try {
    persist?.([])
  } catch {
    // The session is already fail-closed; a failed write leaves the file stale.
  }
  return count
}

/**
 * Withdraw a grant. Home and `~/.claude` are not in this list and cannot be
 * withdrawn — they are the app's own roots, not grants.
 */
export function forgetAllowedRoot(dir: string): boolean {
  if (typeof dir !== 'string' || !dir.trim()) return false
  const key = normalizeAllowedRoot(dir)
  const next = granted.filter(entry => normalizeAllowedRoot(entry) !== key)
  if (next.length === granted.length) return false
  granted = next
  try {
    persist?.(granted.slice())
  } catch {
    // As above: the session's gate is already narrowed, which is the safe
    // direction to fail.
  }
  return true
}
