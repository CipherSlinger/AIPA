import { useState, useRef, useEffect } from 'react'

/**
 * Tracks typing speed (words per minute) using a sliding window of keystroke timestamps.
 * Returns the current WPM and a ref to push keystroke timestamps into.
 */
export function useTypingWpm() {
  const [typingWpm, setTypingWpm] = useState(0)
  const keystrokeTimestamps = useRef<number[]>([])

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      // Keep only keystrokes within last 10 seconds
      keystrokeTimestamps.current = keystrokeTimestamps.current.filter(
        (t) => now - t < 10000,
      )
      const count = keystrokeTimestamps.current.length
      if (count < 2) {
        setTypingWpm(0)
        return
      }
      // Characters per minute, then convert to words (avg 5 chars/word)
      const span = (now - keystrokeTimestamps.current[0]) / 60000 // minutes
      if (span < 0.001) {
        setTypingWpm(0)
        return
      }
      const wpm = Math.round(count / 5 / span)
      setTypingWpm(wpm)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  return { typingWpm, keystrokeTimestamps }
}
