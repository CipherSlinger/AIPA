/**
 * Subscribes to Codex's account rate-limit reports for the composer's chip.
 *
 * Rate limits describe the signed-in Codex account, not a single thread or
 * bridge, so the merged snapshot is kept at module scope: switching
 * conversations unmounts the composer and would otherwise blank a limit that
 * is still in force. The active conversation id is still used to prefer the
 * snapshot that conversation last saw; the account-wide latest remains the
 * fallback, because a limit is not a property of a thread.
 *
 * Events arrive on the existing `cli:*` subscription. `internal-*` bridges are
 * background automation runs on the same account; their snapshots are real but
 * they are not the conversation the user is looking at, so they are ignored —
 * same rule the main process uses when it skips internal bridges for probes.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  buildRateLimitView,
  extractRateLimitSnapshot,
  mergeRateLimitSnapshots,
  type RateLimitSnapshotData,
  type RateLimitView,
} from '../components/chat/rateLimitView'

const INTERNAL_BRIDGE_PREFIX = 'internal-'

/**
 * Last merged snapshot seen by any user-facing bridge. Module scope is
 * deliberate (see the header); a fresh snapshot replaces it, and no timer is
 * involved — Codex pushes a new one whenever a window changes.
 */
let lastAccountSnapshot: RateLimitSnapshotData | null = null

/**
 * The same merge, kept per bridge id. It lets the chip prefer the numbers last
 * reported to the conversation on screen; the account-wide fallback keeps it
 * visible after a switch, because the limits do not belong to that thread.
 */
const snapshotsBySession = new Map<string, RateLimitSnapshotData>()

/** A long-lived app opens many bridges; remember only the recent conversations. */
const MAX_TRACKED_SESSIONS = 32

export function useRateLimits(activeSessionId: string | null): RateLimitView | null {
  const [snapshot, setSnapshot] = useState<RateLimitSnapshotData | null>(lastAccountSnapshot)
  // The reset countdown is the only part of the chip that rots without a push:
  // Codex reports when a window changes, not once a minute. A slow tick keeps
  // "resets in 43 min" true while the user sits in a conversation.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    // An empty session id subscribes to every bridge; the payload's own
    // sessionId is inspected below instead of relying on exact id equality,
    // because a turn's bridge id is not the thread id an archived conversation
    // is opened with.
    const unsubscribe = window.electronAPI.onCliEvent('', (channel, data) => {
      // The shared subscription also carries text deltas; ignore everything
      // but the account report before touching the payload.
      if (channel !== 'cli:rateLimitsUpdated') return
      const record = data && typeof data === 'object'
        ? data as Record<string, unknown>
        : null
      if (!record) return
      const sessionId = typeof record.sessionId === 'string' ? record.sessionId : ''
      if (sessionId.startsWith(INTERNAL_BRIDGE_PREFIX)) return

      const update = extractRateLimitSnapshot(record)
      if (!update) return
      const previous = (sessionId ? snapshotsBySession.get(sessionId) : null) ?? lastAccountSnapshot
      const merged = mergeRateLimitSnapshots(previous, update)
      if (sessionId) {
        snapshotsBySession.set(sessionId, merged)
        if (snapshotsBySession.size > MAX_TRACKED_SESSIONS) {
          const oldest = snapshotsBySession.keys().next().value
          if (oldest !== undefined) snapshotsBySession.delete(oldest)
        }
      }
      lastAccountSnapshot = merged
      setSnapshot(merged)
    })
    return unsubscribe
  }, [])

  return useMemo(() => {
    // Prefer the snapshot this conversation has seen; when it has none (an
    // archived thread, or the first turn before the prime read returns), the
    // account-wide latest is still true for it — limits are per account.
    const preferred = (activeSessionId ? snapshotsBySession.get(activeSessionId) : null)
      ?? snapshot
    return buildRateLimitView(preferred, now)
  }, [snapshot, activeSessionId, now])
}
