/**
 * Coalescing store for live `item/fileChange/patchUpdated` snapshots.
 *
 * Why a store instead of a message field:
 *  - Patches arrive while the Edit card is still running. Rewriting the
 *    transcript messages 10×/second would re-render the whole list for a
 *    single card, so the latest snapshot lives beside the messages and only
 *    the card that renders it subscribes.
 *  - The completed `fileChange` item is authoritative. `completeItem()` drops
 *    the live snapshot, cancels any queued trailing update, and remembers the
 *    item as completed so a late snapshot cannot paint over the final diff.
 *
 * At most one update per item is applied every `LIVE_PATCH_COALESCE_MS`
 * (leading + trailing). Intermediate snapshots are full-state, so dropping
 * them loses nothing.
 */

import {
  normalizePatchUpdate,
  parsePartialUnifiedDiff,
  type LivePatchEntry,
} from './fileChangePatch'

/** ~10 updates/second per item. */
export const LIVE_PATCH_COALESCE_MS = 100

type TimerHandle = unknown

export interface LivePatchStoreOptions {
  intervalMs?: number
  now?: () => number
  setTimeout?: (fn: () => void, ms: number) => TimerHandle
  clearTimeout?: (handle: TimerHandle) => void
}

export interface LivePatchStore {
  /**
   * Queue a raw `cli:patchUpdated` payload. Returns false when it was
   * malformed, had no parseable diff, or arrived after the item completed.
   */
  ingest: (payload: unknown) => boolean
  /** A tool card for this item is starting; forget any completed marker. */
  beginItem: (itemId: string) => void
  /** The item completed: the card's own input/result is now authoritative. */
  completeItem: (itemId: string) => void
  clear: () => void
  subscribe: (listener: () => void) => () => void
  /** Monotonic version for `useSyncExternalStore`. */
  getVersion: () => number
  getEntry: (itemId: string) => LivePatchEntry | undefined
}

export function createLivePatchStore(options: LivePatchStoreOptions = {}): LivePatchStore {
  const intervalMs = options.intervalMs ?? LIVE_PATCH_COALESCE_MS
  const now = options.now ?? (() => Date.now())
  const schedule = options.setTimeout ?? ((fn, ms) => setTimeout(fn, ms))
  const cancel = options.clearTimeout
    ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>))

  const entries = new Map<string, LivePatchEntry>()
  const pending = new Map<string, ReturnType<typeof normalizePatchUpdate>>()
  const timers = new Map<string, TimerHandle>()
  const lastAppliedAt = new Map<string, number>()
  // Bumped by completeItem/beginItem; a queued callback only applies when its
  // generation still matches, so a cancelled trailing update can never win.
  const generations = new Map<string, number>()
  const completed = new Set<string>()
  const listeners = new Set<() => void>()
  let version = 0

  const bump = () => {
    version += 1
    for (const listener of listeners) listener()
  }

  const clearTimer = (itemId: string) => {
    const handle = timers.get(itemId)
    if (handle !== undefined) {
      cancel(handle)
      timers.delete(itemId)
    }
  }

  const apply = (update: NonNullable<ReturnType<typeof normalizePatchUpdate>>, generation: number) => {
    if (generation !== (generations.get(update.itemId) ?? 0)) return
    const changes = update.changes.filter(change => parsePartialUnifiedDiff(change.diff) !== null)
    if (changes.length === 0) return
    entries.set(update.itemId, {
      itemId: update.itemId,
      changes,
      updatedAt: now(),
    })
    lastAppliedAt.set(update.itemId, now())
    bump()
  }

  return {
    ingest: (payload) => {
      const update = normalizePatchUpdate(payload)
      if (!update) return false
      const { itemId } = update
      // A snapshot after item/completed is stale by definition; the final
      // card already carries the authoritative diff.
      if (completed.has(itemId)) return false
      // Validate before queuing so an unparseable snapshot cannot replace a
      // valid live view. If none of the files parse, keep the old behavior.
      const changes = update.changes.filter(change => parsePartialUnifiedDiff(change.diff) !== null)
      if (changes.length === 0) return false
      const usable = { ...update, changes }

      const generation = generations.get(itemId) ?? 0
      const elapsed = now() - (lastAppliedAt.get(itemId) ?? Number.NEGATIVE_INFINITY)
      const wait = intervalMs - elapsed
      if (wait <= 0) {
        clearTimer(itemId)
        pending.delete(itemId)
        apply(usable, generation)
        return true
      }

      pending.set(itemId, usable)
      if (!timers.has(itemId)) {
        timers.set(itemId, schedule(() => {
          timers.delete(itemId)
          const latest = pending.get(itemId)
          pending.delete(itemId)
          if (latest) apply(latest, generation)
        }, wait))
      }
      return true
    },

    beginItem: (itemId) => {
      if (!itemId) return
      completed.delete(itemId)
      clearTimer(itemId)
      pending.delete(itemId)
      lastAppliedAt.delete(itemId)
      if (entries.delete(itemId)) bump()
    },

    completeItem: (itemId) => {
      if (!itemId) return
      generations.set(itemId, (generations.get(itemId) ?? 0) + 1)
      // Bounded set: ids are unique per item, so this is only a leak guard.
      if (completed.size > 512) completed.clear()
      completed.add(itemId)
      clearTimer(itemId)
      pending.delete(itemId)
      lastAppliedAt.delete(itemId)
      if (entries.delete(itemId)) bump()
    },

    clear: () => {
      for (const handle of timers.values()) cancel(handle)
      timers.clear()
      pending.clear()
      lastAppliedAt.clear()
      generations.clear()
      completed.clear()
      if (entries.size > 0) {
        entries.clear()
        bump()
      }
    },

    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },

    getVersion: () => version,

    getEntry: (itemId) => entries.get(itemId),
  }
}

/** One store for the live renderer; the harness builds its own instances. */
export const liveFilePatchStore = createLivePatchStore()
