/**
 * Owns the Settings › Stats account card's probe state, and keeps it true
 * when the signed-in account changes.
 *
 * Two read-only probes (`codex:rateLimits`, `codex:accountUsage`) are read
 * once on mount, when the user presses refresh, and when Codex reports an
 * account change on a live bridge (`cli:accountUpdated` /
 * `cli:rateLimitsUpdated`). The event rule lives in the pure
 * `codexAccountRefresh` module; this hook only wires it to React and to the
 * existing IPC.
 *
 * It deliberately does not poll and does not refetch from render: the only
 * timers involved are the event subscription (unsubscribed on unmount) and,
 * in the card, a local clock tick that updates the "checked … ago" label
 * without touching the probes. That is the same split `useRateLimits` uses
 * for its reset countdown.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  accountFetchFailed,
  decideAccountRefresh,
  mergeAccountNumbers,
  type CodexAccountNumbers,
  type CodexAccountProbeResult,
} from '../components/settings/codexAccountRefresh'

/** Stable identity so an empty card does not allocate a new state object. */
const EMPTY_NUMBERS: CodexAccountNumbers = { limits: null, usage: null }

export interface CodexAccountProbeState {
  /** The numbers on screen; a failed round keeps the previous values. */
  numbers: CodexAccountNumbers
  /** False until the first probe round (or a missing-API check) settles. */
  resolvedOnce: boolean
  refreshing: boolean
  /** The last probe round returned nothing usable; the card says so. */
  refreshFailed: boolean
  /** When the numbers on screen were last confirmed by a probe, or null. */
  lastConfirmedAt: number | null
  /** Force a fresh read (the card's refresh button). */
  refresh: () => void
}

export function useCodexAccount(): CodexAccountProbeState {
  const [numbers, setNumbers] = useState<CodexAccountNumbers>(EMPTY_NUMBERS)
  const [resolvedOnce, setResolvedOnce] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshFailed, setRefreshFailed] = useState(false)
  const [lastConfirmedAt, setLastConfirmedAt] = useState<number | null>(null)

  /** One probe round at a time; overlapping rounds could land out of order. */
  const inFlightRef = useRef(false)
  /** An account event arrived while a probe was running; run one trailing round. */
  const pendingEventRef = useRef(false)
  /** Start of the last event-driven round, for the coalescing window. */
  const lastEventFetchAtRef = useRef<number | null>(null)

  const runProbe = useCallback(async (force: boolean, eventDriven: boolean): Promise<void> => {
    const api = window.electronAPI
    if (!api?.codexRateLimits || !api?.codexAccountUsage) {
      // No probe surface at all (e.g. a preload from an older build): settle
      // the card so it does not sit on its "loading" state forever.
      setResolvedOnce(true)
      return
    }
    if (inFlightRef.current) {
      if (eventDriven) pendingEventRef.current = true
      return
    }

    inFlightRef.current = true
    setRefreshing(true)
    try {
      // Both probes are independent reads; one failing must not discard the
      // other. `allSettled` keeps a thrown IPC call from rejecting the round.
      const [limitsResult, usageResult] = await Promise.allSettled([
        api.codexRateLimits({ force }),
        api.codexAccountUsage({ force }),
      ] as const)

      const fetched: CodexAccountProbeResult = {
        limits: limitsResult.status === 'fulfilled' && limitsResult.value.success
          ? limitsResult.value.rateLimits ?? null
          : null,
        usage: usageResult.status === 'fulfilled' && usageResult.value.success
          ? usageResult.value.usage ?? null
          : null,
      }

      // Keep whichever half we already had: a failed probe should not blank
      // data that is still the best information the user has.
      setNumbers(prev => mergeAccountNumbers(prev, fetched))
      const failed = accountFetchFailed(fetched)
      setRefreshFailed(failed)
      // "checked N ago" is only advanced by a round that actually confirmed
      // numbers; a failed round leaves the timestamp (and the note) alone.
      if (!failed) setLastConfirmedAt(Date.now())
    } catch {
      setRefreshFailed(true)
    } finally {
      inFlightRef.current = false
      setRefreshing(false)
      setResolvedOnce(true)
    }
  }, [])

  // First read. `force: false` lets main reuse its short probe cache, which is
  // enough for opening the page; an account event or the button forces fresh.
  useEffect(() => {
    void runProbe(false, false)
  }, [runProbe])

  // Subscribe to the shared `cli:*` stream. `''` subscribes to every bridge;
  // the payload's own sessionId is inspected by the pure decision helper, the
  // same way `useRateLimits` does it.
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onCliEvent?.('', (channel, data) => {
      const record = data && typeof data === 'object'
        ? data as Record<string, unknown>
        : null
      const sessionId = typeof record?.sessionId === 'string' ? record.sessionId : null
      const now = Date.now()

      const decision = decideAccountRefresh({
        channel,
        sessionId,
        now,
        lastFetchAt: lastEventFetchAtRef.current,
      })
      if (decision.action !== 'fetch') return

      // Stamp before probing: the window is about "a round is already on its
      // way", and the second half of the account-change burst must see it.
      lastEventFetchAtRef.current = now
      void runProbe(true, true)
    })
    return () => { unsubscribe?.() }
  }, [runProbe])

  // If an account event landed while the mount read was still running, the
  // mount read may have started before the change. Run exactly one trailing
  // round; the flag is cleared first so this cannot become a loop.
  useEffect(() => {
    if (refreshing || !pendingEventRef.current) return
    pendingEventRef.current = false
    void runProbe(true, true)
  }, [refreshing, runProbe])

  const refresh = useCallback(() => {
    void runProbe(true, false)
  }, [runProbe])

  return { numbers, resolvedOnce, refreshing, refreshFailed, lastConfirmedAt, refresh }
}
