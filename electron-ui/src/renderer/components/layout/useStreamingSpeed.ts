// Streaming speed hook — extracted from StatusBar.tsx (Iteration 313)

import { useState, useEffect, useRef } from 'react'
import { useChatStore } from '../../store'
import { StandardChatMessage } from '../../types/app.types'

export function useStreamingSpeed() {
  const isStreaming = useChatStore(s => s.isStreaming)
  const startRef = useRef<number>(0)
  const [speed, setSpeed] = useState<number | null>(null)

  useEffect(() => {
    if (isStreaming) {
      startRef.current = Date.now()
      setSpeed(null)

      const interval = setInterval(() => {
        const msgs = useChatStore.getState().messages
        const lastMsg = msgs[msgs.length - 1]
        if (lastMsg && lastMsg.role === 'assistant' && (lastMsg as StandardChatMessage).content) {
          const contentLen = (lastMsg as StandardChatMessage).content.length
          const elapsed = (Date.now() - startRef.current) / 1000
          if (elapsed > 0.5 && contentLen > 0) {
            setSpeed(Math.round(contentLen / elapsed))
          }
        }
      }, 500)

      return () => clearInterval(interval)
    } else {
      setSpeed(null)
    }
  }, [isStreaming])

  return speed
}
