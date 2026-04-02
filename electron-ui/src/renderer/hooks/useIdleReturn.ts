import { useState, useEffect, useRef, useCallback } from 'react'
import { useChatStore, usePrefsStore } from '../store'
import { StandardChatMessage } from '../types/app.types'

const IDLE_THRESHOLD_MS = 30 * 60 * 1000 // 30 minutes
const MIN_CONTEXT_PCT = 20 // Only show dialog if context usage > 20%
const MIN_MESSAGES_FOR_SUMMARY = 3 // Need at least 3 messages for a meaningful summary

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
 * Enhanced with AI-generated "away summary" that recaps where the conversation left off.
 */
export function useIdleReturn() {
  const [showDialog, setShowDialog] = useState(false)
  const [idleDuration, setIdleDuration] = useState('')
  const [awaySummary, setAwaySummary] = useState<string | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
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

  // Generate away summary using CLI
  const generateSummary = useCallback(async () => {
    const { messages } = useChatStore.getState()
    if (messages.length < MIN_MESSAGES_FOR_SUMMARY) return

    setSummaryLoading(true)
    try {
      // Build context from last 15 messages (approx 7-8 exchanges)
      const recentMessages = messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-15)
        .map(m => {
          const content = (m as StandardChatMessage).content || ''
          const truncated = content.length > 300 ? content.slice(0, 300) + '...' : content
          return `${m.role}: ${truncated}`
        })
        .join('\n')

      if (!recentMessages) {
        setSummaryLoading(false)
        return
      }

      const result = await window.electronAPI.cliGenerateAwaySummary(recentMessages)
      if (result && result.length > 0) {
        setAwaySummary(result)
      }
    } catch {
      // Silently fail - summary is non-critical
    } finally {
      setSummaryLoading(false)
    }
  }, [])

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
      setAwaySummary(null) // Reset previous summary
      setShowDialog(true)

      // Start generating summary in parallel with showing dialog
      generateSummary()
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [enabled, generateSummary])

  const dismiss = useCallback(() => {
    setShowDialog(false)
    setAwaySummary(null)
    setSummaryLoading(false)
    lastInteractionRef.current = Date.now()
  }, [])

  const suppressForever = useCallback(() => {
    setShowDialog(false)
    setAwaySummary(null)
    setSummaryLoading(false)
    lastInteractionRef.current = Date.now()
    usePrefsStore.getState().setPrefs({ idleReturnDialogEnabled: false })
    window.electronAPI.prefsSet('idleReturnDialogEnabled', false)
  }, [])

  return { showDialog, idleDuration, awaySummary, summaryLoading, dismiss, suppressForever }
}
