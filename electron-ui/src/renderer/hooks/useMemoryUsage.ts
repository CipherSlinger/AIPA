// useMemoryUsage — memory usage monitor ported from Claude Code sourcemap (Iteration 491)
// Polls process.memoryUsage().heapUsed every 10 seconds; returns null when normal.

import { useState, useEffect, useRef } from 'react'

export type MemoryUsageStatus = 'normal' | 'high' | 'critical'

export interface MemoryUsageInfo {
  heapUsed: number
  status: MemoryUsageStatus
}

const HIGH_MEMORY_THRESHOLD = 1.5 * 1024 * 1024 * 1024  // 1.5 GB
const CRITICAL_MEMORY_THRESHOLD = 2.5 * 1024 * 1024 * 1024  // 2.5 GB
const POLL_INTERVAL_MS = 10_000

function getMemoryStatus(heapUsed: number): MemoryUsageStatus {
  if (heapUsed >= CRITICAL_MEMORY_THRESHOLD) return 'critical'
  if (heapUsed >= HIGH_MEMORY_THRESHOLD) return 'high'
  return 'normal'
}

/**
 * Monitors renderer process memory usage.
 * Returns null when status is 'normal' to avoid unnecessary re-renders.
 */
export function useMemoryUsage(): MemoryUsageInfo | null {
  const [memInfo, setMemInfo] = useState<MemoryUsageInfo | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    function check() {
      // performance.memory is available in Chromium/Electron renderers
      const perf = (performance as any).memory
      const heapUsed = perf ? perf.usedJSHeapSize : 0
      const status = getMemoryStatus(heapUsed)
      setMemInfo(prev => {
        if (status === 'normal') return prev === null ? prev : null
        return { heapUsed, status }
      })
    }

    check()
    timerRef.current = setInterval(check, POLL_INTERVAL_MS)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  return memInfo
}
