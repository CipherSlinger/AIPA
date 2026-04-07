// Streaming speed hook — extracted from StatusBar.tsx (Iteration 313)
// Iteration 492: uses CircularBuffer for rolling 6-sample window (more accurate than total-elapsed avg)

import { useState, useEffect, useRef } from 'react'
import { useChatStore } from '../../store'
import { StandardChatMessage } from '../../types/app.types'
import { CircularBuffer } from '../../utils/CircularBuffer'

interface SpeedSample {
  chars: number
  ts: number
}

const WINDOW_SIZE = 6   // rolling window of 6 samples (3 seconds at 500ms interval)

export function useStreamingSpeed() {
  const isStreaming = useChatStore(s => s.isStreaming)
  const [speed, setSpeed] = useState<number | null>(null)
  const bufRef = useRef(new CircularBuffer<SpeedSample>(WINDOW_SIZE))
  const lastContentLenRef = useRef(0)

  useEffect(() => {
    if (isStreaming) {
      bufRef.current.clear()
      lastContentLenRef.current = 0
      setSpeed(null)

      const interval = setInterval(() => {
        const msgs = useChatStore.getState().messages
        const lastMsg = msgs[msgs.length - 1]
        if (lastMsg && lastMsg.role === 'assistant' && (lastMsg as StandardChatMessage).content) {
          const contentLen = (lastMsg as StandardChatMessage).content.length
          const delta = contentLen - lastContentLenRef.current
          if (delta > 0) {
            bufRef.current.add({ chars: delta, ts: Date.now() })
            lastContentLenRef.current = contentLen
          }
          // Compute rolling average chars/sec from buffer
          const samples = bufRef.current.toArray()
          if (samples.length >= 2) {
            const totalChars = samples.reduce((sum, s) => sum + s.chars, 0)
            const windowMs = samples[samples.length - 1]!.ts - samples[0]!.ts
            if (windowMs > 0) {
              setSpeed(Math.round(totalChars / (windowMs / 1000)))
            }
          }
        }
      }, 500)

      return () => clearInterval(interval)
    } else {
      bufRef.current.clear()
      lastContentLenRef.current = 0
      setSpeed(null)
    }
  }, [isStreaming])

  return speed
}
