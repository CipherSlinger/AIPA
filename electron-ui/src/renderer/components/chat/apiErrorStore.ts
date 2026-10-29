/**
 * One banner for the fallback engine's own API-error report.
 *
 * Module store rather than chat-store fields: the banner is a fact about the
 * live bridge, not part of the transcript. Writing it into `messages` would
 * make it survive a reload as if the assistant had said it, and would let it
 * masquerade as a failed turn.
 *
 * Lifetime, all decided by `reduceApiErrorBanner`:
 *   - appears on `cli:apiError`;
 *   - identical repeated reports collapse into `repeats`;
 *   - cleared by the next send, by a `cli:result` / turn end, by a session
 *     switch, and by dismiss.
 */

import {
  reduceApiErrorBanner,
  type ApiErrorBannerEvent,
  type EngineApiErrorBanner,
} from './engineApiError'

export interface ApiErrorStore {
  /** Ingest one `cli:apiError` payload. Returns true when the banner changed. */
  push: (payload: unknown) => boolean
  /** The user sent a new prompt. */
  beginTurn: () => boolean
  /** A turn ended. The result's own error treatment owns any failure claim. */
  endTurn: (resultIsError?: boolean) => boolean
  /** Another conversation is on screen. */
  reset: () => boolean
  dismiss: () => boolean
  subscribe: (listener: () => void) => () => void
  /** Stable snapshot for `useSyncExternalStore`. */
  getSnapshot: () => EngineApiErrorBanner | null
  getVersion: () => number
}

export function createApiErrorStore(): ApiErrorStore {
  let banner: EngineApiErrorBanner | null = null
  let version = 0
  const listeners = new Set<() => void>()

  const apply = (event: ApiErrorBannerEvent): boolean => {
    const next = reduceApiErrorBanner(banner, event)
    // Preserve the snapshot identity when nothing changed: a retry storm must
    // not re-render the chat on every identical event.
    if (next === banner) return false
    banner = next
    version += 1
    for (const listener of listeners) listener()
    return true
  }

  return {
    push: (payload) => apply({ type: 'api-error', payload }),
    beginTurn: () => apply({ type: 'send' }),
    endTurn: (resultIsError = false) => apply({ type: 'turn-end', resultIsError }),
    reset: () => apply({ type: 'session-switch' }),
    dismiss: () => apply({ type: 'dismiss' }),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    getSnapshot: () => banner,
    getVersion: () => version,
  }
}

/** One store for the live renderer; the harness builds its own instances. */
export const apiErrorStore = createApiErrorStore()
