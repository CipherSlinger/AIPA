import { useState, useEffect, useRef, useCallback } from 'react'
import { useChatStore, usePrefsStore } from '../store'
import { StandardChatMessage } from '../types/app.types'

/**
 * Module-level ref so useSpeculation can read the latest suggestion
 * without prop drilling through ChatPanel → ChatInput → back up.
 */
export const latestSuggestionRef = { current: null as string | null }

/**
 * Hook that generates AI-predicted follow-up suggestions after each assistant response.
 * Returns ghost text to display in the chat input as a faded placeholder.
 *
 * The suggestion is generated via a lightweight CLI call (--print mode) using
 * the last few messages as context. It fires after streaming completes and
 * is cancelled if the user starts typing or a new message arrives.
 *
 * Iteration 488: Added suggestion lifecycle tracking (shownAt, acceptedAt, firstKeystrokeAt)
 * inspired by Claude Code's hooks/usePromptSuggestion.ts.
 */

interface SuggestionLifecycle {
  text: string
  shownAt: number
  acceptedAt?: number
  firstKeystrokeAt?: number
  dismissed?: boolean
}

// Module-level analytics buffer — logs suggestion lifecycle events
// Useful for future analytics or A/B testing of suggestion quality
const suggestionLog: SuggestionLifecycle[] = []

export function usePromptSuggestion(input: string, isStreaming: boolean) {
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const abortRef = useRef(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevStreamingRef = useRef(isStreaming)
  const lifecycleRef = useRef<SuggestionLifecycle | null>(null)
  const firstKeystrokeRecordedRef = useRef(false)

  const enabled = usePrefsStore(s => s.prefs.promptSuggestionsEnabled !== false)

  // Track first keystroke after a suggestion was shown
  useEffect(() => {
    if (input.length === 0) {
      firstKeystrokeRecordedRef.current = false
      return
    }
    if (suggestion && !firstKeystrokeRecordedRef.current && lifecycleRef.current && !lifecycleRef.current.firstKeystrokeAt) {
      lifecycleRef.current.firstKeystrokeAt = Date.now()
      firstKeystrokeRecordedRef.current = true
    }
    // Dismiss suggestion when user types
    if (suggestion) {
      if (lifecycleRef.current && !lifecycleRef.current.acceptedAt) {
        lifecycleRef.current.dismissed = true
      }
      setSuggestion(null)
    }
  }, [input, suggestion])

  // Cancel pending suggestion when a new streaming starts
  useEffect(() => {
    if (isStreaming) {
      abortRef.current = true
      setSuggestion(null)
      setIsLoading(false)
    }
  }, [isStreaming])

  const dismissSuggestion = useCallback(() => {
    if (lifecycleRef.current) {
      lifecycleRef.current.dismissed = true
    }
    setSuggestion(null)
    latestSuggestionRef.current = null
    abortRef.current = true
  }, [])

  const acceptSuggestion = useCallback((): string | null => {
    if (!suggestion) return null
    if (lifecycleRef.current) {
      lifecycleRef.current.acceptedAt = Date.now()
    }
    const accepted = suggestion
    setSuggestion(null)
    return accepted
  }, [suggestion])

  // Detect streaming end (transition from true → false) to trigger suggestion
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current
    prevStreamingRef.current = isStreaming

    if (!wasStreaming || isStreaming) return
    if (!enabled) return

    // Streaming just ended - generate a suggestion after a brief delay
    abortRef.current = false
    setIsLoading(true)
    firstKeystrokeRecordedRef.current = false

    // Small delay to let the UI settle before spawning the CLI
    timeoutRef.current = setTimeout(async () => {
      if (abortRef.current) {
        setIsLoading(false)
        return
      }

      try {
        // Build context from last 4 message pairs
        const messages = useChatStore.getState().messages
        const recentMessages = messages
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .slice(-8) // last 4 pairs
          .map(m => {
            const content = (m as StandardChatMessage).content || ''
            const truncated = content.length > 200 ? content.slice(0, 200) + '...' : content
            return `${m.role}: ${truncated}`
          })
          .join('\n')

        if (!recentMessages || abortRef.current) {
          setIsLoading(false)
          return
        }

        const result = await window.electronAPI.cliGenerateSuggestion(recentMessages)

        if (!abortRef.current && result && result.length > 0) {
          // Only show suggestion if input is still empty
          const currentInput = useChatStore.getState().isStreaming
          if (!currentInput) {
            const lifecycle: SuggestionLifecycle = { text: result, shownAt: Date.now() }
            lifecycleRef.current = lifecycle
            suggestionLog.push(lifecycle)
            // Keep log bounded to last 50 events
            if (suggestionLog.length > 50) suggestionLog.shift()
            setSuggestion(result)
            latestSuggestionRef.current = result
          }
        }
      } catch {
        // Silently fail - suggestion is non-critical
      } finally {
        setIsLoading(false)
      }
    }, 500)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [isStreaming, enabled])

  return { suggestion, isLoading, dismissSuggestion, acceptSuggestion }
}

/** Access suggestion lifecycle log for analytics (exported for debugging/testing) */
export function getSuggestionLog(): readonly SuggestionLifecycle[] {
  return suggestionLog
}
