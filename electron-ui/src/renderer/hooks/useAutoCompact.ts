/**
 * useAutoCompact -- Automatic conversation compaction when context window nears capacity.
 * Inspired by Claude Code's services/compact/autoCompact.ts.
 *
 * When context usage exceeds a configurable threshold (default 80%),
 * dispatches an 'aipa:triggerCompact' event which causes ChatPanel to send
 * '/compact' to the CLI — delegating summarization to Claude Code itself
 * rather than performing renderer-side summarization.
 *
 * Iteration P1-2 fix: Replaced renderer-side API summarization with CLI '/compact' delegation.
 *   - Old renderer code performed microcompact + local API call to build synthetic summary
 *   - New code dispatches 'aipa:triggerCompact' → useChatPanelShortcuts → sendMessage('/compact')
 *   - This is the same path as Ctrl+Shift+K and the manual compact button
 */
import { useRef, useCallback } from 'react'
import { useChatStore, usePrefsStore, useUiStore } from '../store'

export function useAutoCompact() {
  const isCompactingRef = useRef(false)
  const lastCompactTimestampRef = useRef(0)

  const tryAutoCompact = useCallback(async (contextUsed: number, contextTotal: number) => {
    // Don't trigger if already compacting
    if (isCompactingRef.current) return

    // Rate limit: don't trigger more than once per 60 seconds
    if (Date.now() - lastCompactTimestampRef.current < 60000) return

    const prefs = usePrefsStore.getState().prefs
    const threshold = prefs.compactThreshold ?? 80
    const pct = Math.round((contextUsed / contextTotal) * 100)

    if (pct < threshold) return

    // Need at least 10 messages before triggering auto-compact
    const messages = useChatStore.getState().messages
    const chatMessages = messages.filter(m => m.role === 'user' || m.role === 'assistant')
    if (chatMessages.length < 10) return

    // Don't trigger if already streaming (CLI is busy)
    if (useChatStore.getState().isStreaming) return

    isCompactingRef.current = true
    lastCompactTimestampRef.current = Date.now()

    // Snapshot context usage before compact for before/after comparison
    const contextUsage = useChatStore.getState().lastContextUsage
    if (contextUsage) {
      useChatStore.getState().setContextBeforeCompact({
        used: contextUsage.used,
        total: contextUsage.total,
      })
    }

    // Show a toast so the user knows auto-compact is firing
    useUiStore.getState().addToast('info', '正在压缩上下文 (auto-compact)...')

    // Delegate to CLI via custom event.
    // useChatPanelShortcuts listens for 'aipa:triggerCompact' and calls sendMessage('/compact').
    // This is identical to the Ctrl+Shift+K keyboard shortcut path.
    window.dispatchEvent(new CustomEvent('aipa:triggerCompact'))

    // Reset guard ref after delay — the store's isCompacting flag is managed by the CLI path
    setTimeout(() => { isCompactingRef.current = false }, 5000)
  }, [])

  return { tryAutoCompact }
}
