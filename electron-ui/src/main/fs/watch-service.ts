import fs from 'fs'
import path from 'path'
import { createLogger } from '../utils/logger'

/**
 * Non-recursive directory watchers for the file browser.
 *
 * The renderer names the directories its tree is actually showing, so this
 * service never walks a workspace. Entries are refcounted per owner: two
 * mounted file browsers watching the same folder share one OS handle, and the
 * handle is closed as soon as the last owner lets go.
 */

/** Coalesce a build's write burst into one notification per directory. */
export const DEFAULT_WATCH_DEBOUNCE_MS = 250

/**
 * A directory listing only needs its changed name to repaint one row. Cap the
 * attribution list so a `node_modules` install cannot turn an IPC message into
 * a multi-kilobyte payload.
 */
export const MAX_NAMES_PER_CHANGE = 32

export interface FsWatchChange {
  directory: string
  /** Basenames the OS could attribute, deduplicated; contents never included. */
  names: string[]
  /** True when some basenames were dropped (or the OS gave none). */
  truncated: boolean
}

export interface FsWatchFailure {
  directory: string
  /** A short diagnostic, never file contents. */
  error: string
}

export interface FsWatchState {
  watching: string[]
  failed: FsWatchFailure[]
}

/** The small surface of `fs.FSWatcher` this service needs (fakes in tests). */
export interface WatchHandle {
  close(): void
}

export type WatchEventType = 'rename' | 'change'

export type WatchFactory = (
  directory: string,
  onEvent: (eventType: WatchEventType, filename: string | null) => void,
  onError: (error: Error) => void,
) => WatchHandle

export interface WatchLogger {
  debug(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
}

export interface DirectoryWatchServiceOptions {
  /** Called once per directory per debounce window, with attributed names. */
  onChange: (change: FsWatchChange) => void
  /** Called when a live watch dies (the folder vanished, handle revoked). */
  onStateChange?: (state: FsWatchState) => void
  debounceMs?: number
  watchFactory?: WatchFactory
  logger?: WatchLogger
}

export interface DirectoryWatchService {
  /** Replace this owner's watched set; refcounts are adjusted atomically. */
  setDirectories(ownerId: string, directories: readonly string[]): FsWatchState
  releaseOwner(ownerId: string): void
  /** Drop every subscription whose owner id starts with `prefix`. */
  releaseOwnerPrefix(prefix: string): void
  snapshot(): FsWatchState
  /** Close every handle and timer (app quit). Idempotent. */
  dispose(): void
}

interface Entry {
  key: string
  directory: string
  owners: Set<string>
  watcher: WatchHandle | null
  failed: string | null
  timer: ReturnType<typeof setTimeout> | null
  names: Set<string>
  truncated: boolean
}

/** Identity of a directory path, case-folded where the OS is case-insensitive. */
export function watchKey(directory: string): string {
  const resolved = path.normalize(path.resolve(directory))
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function clipError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const text = message.trim().replace(/\s+/g, ' ')
  return text ? text.slice(0, 200) : 'watch_failed'
}

const defaultWatchFactory: WatchFactory = (directory, onEvent, onError) => {
  // Not persistent: a watcher alone must not keep the process alive; Electron's
  // main loop already does. A directory that disappears makes `fs.watch` emit
  // an error later, which `attach` turns into a reported failure.
  const watcher = fs.watch(directory, { persistent: false, encoding: 'utf8' }, (eventType, filename) => {
    onEvent(eventType as WatchEventType, filename)
  })
  watcher.on('error', (err) => onError(err))
  return watcher
}

export function createDirectoryWatchService(
  options: DirectoryWatchServiceOptions,
): DirectoryWatchService {
  const log = options.logger ?? createLogger('fs:watch')
  const debounceMs = Math.max(0, options.debounceMs ?? DEFAULT_WATCH_DEBOUNCE_MS)
  const watchFactory = options.watchFactory ?? defaultWatchFactory

  const entries = new Map<string, Entry>()
  /** ownerId -> (watchKey -> display path) */
  const owners = new Map<string, Map<string, string>>()
  let disposed = false

  function snapshot(): FsWatchState {
    const watching: string[] = []
    const failed: FsWatchFailure[] = []
    for (const entry of entries.values()) {
      if (entry.watcher) watching.push(entry.directory)
      else if (entry.failed) failed.push({ directory: entry.directory, error: entry.failed })
    }
    watching.sort()
    failed.sort((a, b) => a.directory.localeCompare(b.directory))
    return { watching, failed }
  }

  function notifyState(): void {
    if (disposed) return
    try {
      options.onStateChange?.(snapshot())
    } catch (err) {
      log.debug('fs watch state listener failed:', String(err))
    }
  }

  function clearTimer(entry: Entry): void {
    if (!entry.timer) return
    clearTimeout(entry.timer)
    entry.timer = null
    entry.names.clear()
    entry.truncated = false
  }

  function closeEntry(entry: Entry): void {
    clearTimer(entry)
    const watcher = entry.watcher
    entry.watcher = null
    if (watcher) {
      try {
        watcher.close()
      } catch {
        // The OS may already have torn it down after the directory vanished.
      }
    }
  }

  function fail(entry: Entry, error: unknown): void {
    if (disposed) return
    closeEntry(entry)
    entry.failed = clipError(error)
    log.warn(`fs.watch unavailable for ${entry.directory}:`, entry.failed)
    notifyState()
  }

  function flush(entry: Entry): void {
    entry.timer = null
    if (disposed || !entry.watcher) {
      entry.names.clear()
      entry.truncated = false
      return
    }
    const change: FsWatchChange = {
      directory: entry.directory,
      names: [...entry.names],
      truncated: entry.truncated,
    }
    entry.names.clear()
    entry.truncated = false
    try {
      options.onChange(change)
    } catch (err) {
      log.debug('fs watch change listener failed:', String(err))
    }
  }

  function noteEvent(entry: Entry, filename: string | null): void {
    if (disposed || !entry.watcher) return
    if (filename) {
      if (entry.names.size < MAX_NAMES_PER_CHANGE) entry.names.add(filename)
      else entry.truncated = true
    } else {
      // Some platforms report an unnamed change. It still matters; we just
      // cannot say which basename caused it.
      entry.truncated = true
    }
    if (!entry.timer) {
      entry.timer = setTimeout(() => flush(entry), debounceMs)
      entry.timer.unref?.()
    }
  }

  function attach(entry: Entry): void {
    try {
      const watcher = watchFactory(
        entry.directory,
        (eventType, filename) => noteEvent(entry, filename),
        (error) => fail(entry, error),
      )
      // A factory that hands back nothing did not start a watch; reporting it
      // as running would make the renderer lie to the user.
      if (!watcher) throw new Error('watch_unavailable')
      entry.watcher = watcher
      entry.failed = null
    } catch (err) {
      entry.watcher = null
      entry.failed = clipError(err)
      log.warn(`fs.watch could not start for ${entry.directory}:`, entry.failed)
    }
  }

  function removeEntry(entry: Entry): void {
    closeEntry(entry)
    entries.delete(entry.key)
  }

  function setDirectories(ownerId: string, directories: readonly string[]): FsWatchState {
    // Normalize first so a disposed service can still report truthfully.
    const wanted = new Map<string, string>()
    for (const candidate of directories) {
      if (typeof candidate !== 'string' || !candidate.trim()) continue
      let resolved: string
      try {
        resolved = path.resolve(candidate)
      } catch {
        continue
      }
      if (!path.isAbsolute(resolved)) continue
      const key = watchKey(resolved)
      if (!wanted.has(key)) wanted.set(key, resolved)
    }

    if (disposed) {
      return {
        watching: [],
        failed: [...wanted.values()].map(directory => ({ directory, error: 'disposed' })),
      }
    }

    const previous = owners.get(ownerId) ?? new Map<string, string>()

    for (const [key, directory] of wanted) {
      if (previous.has(key)) continue
      let entry = entries.get(key)
      if (!entry) {
        entry = {
          key,
          directory,
          owners: new Set(),
          watcher: null,
          failed: null,
          timer: null,
          names: new Set(),
          truncated: false,
        }
        entries.set(key, entry)
        attach(entry)
      }
      entry.owners.add(ownerId)
    }

    for (const key of previous.keys()) {
      if (wanted.has(key)) continue
      const entry = entries.get(key)
      if (!entry) continue
      entry.owners.delete(ownerId)
      if (entry.owners.size === 0) removeEntry(entry)
    }

    if (wanted.size === 0) owners.delete(ownerId)
    else owners.set(ownerId, wanted)
    return snapshot()
  }

  function releaseOwner(ownerId: string): void {
    const owned = owners.get(ownerId)
    if (!owned) return
    owners.delete(ownerId)
    for (const key of owned.keys()) {
      const entry = entries.get(key)
      if (!entry) continue
      entry.owners.delete(ownerId)
      if (entry.owners.size === 0) removeEntry(entry)
    }
  }

  function releaseOwnerPrefix(prefix: string): void {
    for (const ownerId of [...owners.keys()]) {
      if (ownerId.startsWith(prefix)) releaseOwner(ownerId)
    }
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    owners.clear()
    for (const entry of entries.values()) closeEntry(entry)
    entries.clear()
  }

  return { setDirectories, releaseOwner, releaseOwnerPrefix, snapshot, dispose }
}
