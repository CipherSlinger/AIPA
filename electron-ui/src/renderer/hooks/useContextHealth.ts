// useContextHealth -- monitors context window usage and session cost,
// shows one-time toast warnings when thresholds are crossed.
// Inspired by Claude Code contextSuggestions.ts + CostThresholdDialog.tsx

import { useEffect, useRef } from 'react'
import { useChatStore, usePrefsStore, useUiStore } from '../store'
import { useT } from '../i18n'

const COST_THRESHOLD = 5.0          // warn at $5
const CONTEXT_CRITICAL_PCT = 95     // always warn
const CONTEXT_HIGH_PCT = 80         // warn only if auto-compact disabled

export function useContextHealth() {
  const t = useT()
  const shown = useRef<Set<string>>(new Set())

  useEffect(() => {
    const unsubscribe = useChatStore.subscribe((state) => {
      const addToast = useUiStore.getState().addToast

      // -- Cost threshold warning --
      if (
        state.totalSessionCost >= COST_THRESHOLD &&
        !shown.current.has('cost')
      ) {
        shown.current.add('cost')
        addToast('warning', t('cost.thresholdWarning'))
      }

      // -- Context health warnings --
      const ctx = state.lastContextUsage
      if (!ctx || ctx.total <= 0) return

      const pct = Math.round((ctx.used / ctx.total) * 100)

      // Critical: > 95% regardless of auto-compact
      if (pct >= CONTEXT_CRITICAL_PCT && !shown.current.has('ctx-critical')) {
        shown.current.add('ctx-critical')
        addToast('warning', t('context.almostFull', { pct: String(pct) }))
      }

      // High: > 80% but only if auto-compact is disabled
      if (
        pct >= CONTEXT_HIGH_PCT &&
        pct < CONTEXT_CRITICAL_PCT &&
        !shown.current.has('ctx-high')
      ) {
        const threshold = usePrefsStore.getState().prefs.compactThreshold
        const autoCompactEnabled = threshold != null && threshold > 0
        if (!autoCompactEnabled) {
          shown.current.add('ctx-high')
          addToast('info', t('context.nearCapacity', { pct: String(pct) }))
        }
      }
    })

    return unsubscribe
  }, [t])

  // Reset warnings when conversation changes (clear messages)
  useEffect(() => {
    const unsubscribe = useChatStore.subscribe((state, prev) => {
      if (state.messages.length === 0 && prev.messages.length > 0) {
        shown.current.clear()
      }
    })
    return unsubscribe
  }, [])
}
