/**
 * Pure helpers for the file browser's live directory watching.
 *
 * Kept free of React and IPC so both the component and the wave harness can
 * exercise the path bookkeeping directly. The main process watches exactly the
 * directories this module collects — no recursive walk of a workspace.
 */

export interface FsWatchFailureLike {
  directory: string
  error: string
}

export interface FsWatchStateLike {
  watching: string[]
  failed: FsWatchFailureLike[]
}

export interface FsChangeLike {
  directory: string
  names?: string[]
  truncated?: boolean
}

/**
 * Identity of a directory path for dedupe and map keys.
 *
 * Paths arrive from main with platform separators. Windows comparisons fold
 * case and separators; POSIX paths stay case-sensitive. Returns null for
 * anything that cannot name a directory.
 */
export function canonicalWatchPath(input: string): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed) return null

  const windows = /^[A-Za-z]:[\\/]/.test(trimmed) || trimmed.includes('\\')
  let normalized = trimmed.replace(/\\/g, '/').replace(/\/{2,}/g, '/')

  if (windows) {
    normalized = normalized.replace(/\/+$/, '')
    if (!normalized || /^[A-Za-z]:$/.test(normalized)) normalized += '/'
    return normalized.toLowerCase()
  }

  normalized = normalized.replace(/\/+$/, '')
  return normalized || '/'
}

/**
 * Directories to ask main to watch: the root the browser shows plus every
 * expanded folder. Nested paths are deliberately all kept — the watcher is
 * non-recursive, so a parent's handle cannot report changes inside a child.
 */
export function collectWatchedDirectories(
  rootDir: string,
  expanded: Iterable<string>,
): string[] {
  const result: string[] = []
  const seen = new Set<string>()

  const add = (candidate: unknown): void => {
    if (typeof candidate !== 'string') return
    const key = canonicalWatchPath(candidate)
    if (!key || seen.has(key)) return
    seen.add(key)
    result.push(candidate.trim())
  }

  add(rootDir)
  for (const directory of expanded) add(directory)
  return result
}

/**
 * Map a `fs:changed` payload to the nodes the browser must refetch.
 *
 * Only a directory this browser subscribed to can be affected; an event from
 * a folder the user cannot see (or a stale subscription) is ignored. Repeated
 * entries in one burst collapse to one node.
 */
export function affectedDirectories(
  watched: readonly string[],
  changes: readonly FsChangeLike[] | undefined,
): string[] {
  const byKey = new Map<string, string>()
  for (const directory of watched) {
    const key = canonicalWatchPath(directory)
    if (key && !byKey.has(key)) byKey.set(key, directory)
  }

  const result: string[] = []
  const seen = new Set<string>()
  for (const change of changes ?? []) {
    if (!change || typeof change.directory !== 'string') continue
    const key = canonicalWatchPath(change.directory)
    if (!key || seen.has(key)) continue
    const directory = byKey.get(key)
    if (!directory) continue
    seen.add(key)
    result.push(directory)
  }
  return result
}

/**
 * What the header badge may claim. "failed" wins over "on" so a partial
 * failure is never hidden by the folders that are still being watched.
 */
export function watchIndicator(state: FsWatchStateLike | null): 'off' | 'on' | 'failed' {
  if (!state) return 'off'
  if (state.failed.length > 0) return 'failed'
  if (state.watching.length > 0) return 'on'
  return 'off'
}
