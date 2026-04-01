import { useState, useEffect, useRef, useCallback } from 'react'
import { useChatStore, usePrefsStore } from '../store'

const IDLE_THRESHOLD_MS = 30 * 60 * 1000 // 30 minutes
const MIN_CONTEXT_PCT = 20 // Only show dialog if context usage > 20%

/**
 * Formats an idle duration in minutes to a human-readable string.
 * Examples: "< 1m", "15m", "2h", "1h 30m"
 */
function formatIdleDuration(minutes: number): string {
  if (minutes < 1) return '< 1m'
  if (minutes < 60) return `${Math.floor(minutes)}m`
  const hours = Math.floor(minutes / 60)
  const remaining = Math.floor(minutes % 60)
  if (remaining === 0) return `${hours}h`
  return `${hours}h ${remaining}m`
}

/**
 * Hook that detects when the user returns after being idle and shows a dialog
 * asking whether to continue or start a new conversation.
 *
 * Tracks the last interaction time and checks on window focus events.
 */
export function useIdleReturn() {
  const [showDialog, setShowDialog] = useState(false)
  const [idleDuration, setIdleDuration] = useState('')
  const lastInteractionRef = useRef(Date.now())

  const enabled = usePrefsStore(s => s.prefs.idleReturnDialogEnabled !== false)

  // Update last interaction time on any user activity
  const updateInteraction = useCallback(() => {
    lastInteractionRef.current = Date.now()
  }, [])

  // Track user interactions (keyboard + click)
  useEffect(() => {
    window.addEventListener('keydown', updateInteraction)
    window.addEventListener('mousedown', updateInteraction)
    return () => {
      window.removeEventListener('keydown', updateInteraction)
      window.removeEventListener('mousedown', updateInteraction)
    }
  }, [updateInteraction])

  // Check on window focus
  useEffect(() => {
    if (!enabled) return

    const handleFocus = () => {
      const idleMs = Date.now() - lastInteractionRef.current
      if (idleMs < IDLE_THRESHOLD_MS) return

      // Check if there's an active conversation with meaningful context
      const { messages, lastContextUsage } = useChatStore.getState()
      if (messages.length === 0) return

      // Check context usage percentage
      if (lastContextUsage && lastContextUsage.total > 0) {
        const pct = (lastContextUsage.used / lastContextUsage.total) * 100
        if (pct < MIN_CONTEXT_PCT) return
      }

      const idleMinutes = idleMs / (60 * 1000)
      setIdleDuration(formatIdleDuration(idleMinutes))
      setShowDialog(true)
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [enabled])

  const dismiss = useCallback(() => {
    setShowDialog(false)
    lastInteractionRef.current = Date.now()
  }, [])

  const suppressForever = useCallback(() => {
    setShowDialog(false)
    lastInteractionRef.current = Date.now()
    usePrefsStore.getState().setPrefs({ idleReturnDialogEnabled: false })
    window.electronAPI.prefsSet('idleReturnDialogEnabled', false)
  }, [])

  return { showDialog, idleDuration, dismiss, suppressForever }
}
