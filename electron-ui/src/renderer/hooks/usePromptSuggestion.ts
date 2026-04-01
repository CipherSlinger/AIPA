import { useState, useEffect, useRef, useCallback } from 'react'
import { useChatStore, usePrefsStore } from '../store'
import { StandardChatMessage } from '../types/app.types'

/**
 * Hook that generates AI-predicted follow-up suggestions after each assistant response.
 * Returns ghost text to display in the chat input as a faded placeholder.
 *
 * The suggestion is generated via a lightweight CLI call (--print mode) using
 * the last few messages as context. It fires after streaming completes and
 * is cancelled if the user starts typing or a new message arrives.
 */
export function usePromptSuggestion(input: string, isStreaming: boolean) {
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const abortRef = useRef(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevStreamingRef = useRef(isStreaming)

  const enabled = usePrefsStore(s => s.prefs.promptSuggestionsEnabled !== false)

  // Dismiss suggestion when user types
  useEffect(() => {
    if (input.length > 0 && suggestion) {
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
    setSuggestion(null)
    abortRef.current = true
  }, [])

  // Detect streaming end (transition from true -> false) to trigger suggestion
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current
    prevStreamingRef.current = isStreaming

    if (!wasStreaming || isStreaming) return
    if (!enabled) return

    // Streaming just ended - generate a suggestion after a brief delay
    abortRef.current = false
    setIsLoading(true)

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
            setSuggestion(result)
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

  return { suggestion, isLoading, dismissSuggestion }
}
