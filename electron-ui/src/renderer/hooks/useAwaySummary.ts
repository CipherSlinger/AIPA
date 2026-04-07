/**
 * useAwaySummary — Injects an "away summary" message into the conversation
 * after the window has been hidden/blurred for 5+ minutes (Iteration 481).
 *
 * Inspired by Claude Code's hooks/useAwaySummary.ts:
 * - Fires only when: 5min since blur, no turn in progress, no existing
 *   away_summary since the last user message, and there are messages to summarize.
 * - The summary is rendered as a collapsible system card in the chat.
 *
 * Integration: call this hook in ChatPanel.tsx alongside useAutoCompact.
 */
import { useEffect, useRef, useCallback } from 'react'
import { useChatStore, usePrefsStore } from '../store'
import { StandardChatMessage } from '../types/app.types'

const BLUR_DELAY_MS = 5 * 60_000  // 5 minutes

/** Check if there's already an away summary card since the last real user message */
function hasAwaySummarySinceLastUser(messages: StandardChatMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === 'user') return false
    if (m.role === 'system' && m.content.startsWith('[AWAY_SUMMARY]')) return true
  }
  return false
}

async function generateAwaySummary(
  messages: StandardChatMessage[],
  signal: AbortSignal,
  model: string,
  workingDir: string,
): Promise<string | null> {
  // Build a brief conversation excerpt — last 8 messages
  const recent = messages.slice(-8)
  const excerpt = recent
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `[${m.role.toUpperCase()}]: ${m.content.slice(0, 600)}`)
    .join('\n\n')

  if (!excerpt.trim()) return null

  const prompt = `Based on the conversation below, write a concise 2-3 sentence summary of what was being worked on and where things left off. This will be shown as an "away summary" when the user returns. Be specific but brief.

---
${excerpt}
---

Return only the summary text, no preamble.`

  try {
    const result = await window.electronAPI.cliSendMessage({
      prompt,
      cwd: workingDir,
      model,
      env: {},
      flags: ['--print', '--max-turns', '1'],
    })

    if (signal.aborted) return null

    // Wait briefly for the stream to settle
    await new Promise(resolve => setTimeout(resolve, 3000))
    if (signal.aborted) return null

    // Extract from the most recent assistant message
    const allMsgs = useChatStore.getState().messages as StandardChatMessage[]
    const lastAssistant = [...allMsgs].reverse().find(m => m.role === 'assistant')
    return lastAssistant?.content?.slice(0, 500) ?? null
  } catch {
    return null
  }
}

export function useAwaySummary(isLoading: boolean) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const isLoadingRef = useRef(isLoading)
  isLoadingRef.current = isLoading

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const abortInFlight = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const generate = useCallback(async () => {
    if (isLoadingRef.current) return  // don't generate mid-turn

    const messages = useChatStore.getState().messages as StandardChatMessage[]
    const chatMessages = messages.filter(m => m.role === 'user' || m.role === 'assistant') as StandardChatMessage[]

    if (chatMessages.length < 3) return  // need at least 1.5 exchanges
    if (hasAwaySummarySinceLastUser(chatMessages)) return  // already summarized

    abortInFlight()
    const controller = new AbortController()
    abortRef.current = controller

    const prefs = usePrefsStore.getState().prefs
    const model = prefs.advisorModel || prefs.model || 'claude-haiku-4-5'
    const workingDir = prefs.workingDir || ''

    const summaryText = await generateAwaySummary(
      chatMessages,
      controller.signal,
      model,
      workingDir,
    )

    if (controller.signal.aborted || !summaryText) return

    // Inject the summary as a system message with special prefix
    const summaryMessage: StandardChatMessage = {
      id: `away-${Date.now()}`,
      role: 'system',
      content: `[AWAY_SUMMARY] ${summaryText}`,
      timestamp: Date.now(),
    }

    useChatStore.getState().addMessage(summaryMessage)
  }, [abortInFlight])

  useEffect(() => {
    const onBlur = () => {
      // Start 5-minute timer on window blur/hide
      clearTimer()
      timerRef.current = setTimeout(generate, BLUR_DELAY_MS)
    }

    const onFocus = () => {
      // Cancel pending timer if user returns before 5 min
      clearTimer()
      abortInFlight()
    }

    // Use Page Visibility API for reliable hide detection (covers tab switches + minimize)
    const onVisibility = () => {
      if (document.hidden) onBlur()
      else onFocus()
    }

    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      clearTimer()
      abortInFlight()
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [clearTimer, abortInFlight, generate])
}
