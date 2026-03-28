import { useState, useEffect, useMemo, useRef } from 'react'

/**
 * Manages the elapsed time display during streaming responses.
 * Uses a ref for start time to avoid re-render loops (fixed React #185).
 */
export function useStreamingTimer(isStreaming: boolean) {
  const streamStartRef = useRef<number | null>(null)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (isStreaming) {
      if (!streamStartRef.current) {
        streamStartRef.current = Date.now()
      }
      const tick = () => {
        if (streamStartRef.current) {
          setElapsed(Math.floor((Date.now() - streamStartRef.current) / 1000))
        }
      }
      tick()
      const id = setInterval(tick, 1000)
      return () => clearInterval(id)
    } else {
      streamStartRef.current = null
      setElapsed(0)
    }
  }, [isStreaming])

  const elapsedStr = useMemo(() => {
    if (!isStreaming || elapsed < 1) return null
    const m = Math.floor(elapsed / 60)
    const s = elapsed % 60
    return m > 0 ? `${m}m ${s}s` : `${s}s`
  }, [isStreaming, elapsed])

  return { elapsed, elapsedStr }
}
