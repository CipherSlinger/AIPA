// useElapsedTime — live elapsed time hook (Iteration 494)
// Ported from Claude Code sourcemap: src/hooks/useElapsedTime.ts
// Uses useSyncExternalStore with interval-based updates for efficiency.

import { useCallback, useSyncExternalStore } from 'react'
import { formatDuration } from '../components/layout/statusBarConstants'

/**
 * Returns a formatted elapsed-time string that updates every `ms` milliseconds.
 *
 * @param startTime - Unix timestamp in ms when the operation began
 * @param isRunning - Whether to actively update the timer
 * @param ms - Update interval in ms (default: 1000)
 * @param endTime - If set, freezes the duration at this timestamp
 * @returns Formatted duration string (e.g., "1m 23s", "45s")
 */
export function useElapsedTime(
  startTime: number,
  isRunning: boolean,
  ms: number = 1000,
  endTime?: number,
): string {
  const get = () =>
    formatDuration(Math.max(0, (endTime ?? Date.now()) - startTime))

  const subscribe = useCallback(
    (notify: () => void) => {
      if (!isRunning) return () => {}
      const interval = setInterval(notify, ms)
      return () => clearInterval(interval)
    },
    [isRunning, ms],
  )

  return useSyncExternalStore(subscribe, get, get)
}
