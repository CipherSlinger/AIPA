import { useChatStore, usePrefsStore, useSessionStore, useUiStore } from '../../store'
import type { StandardChatMessage } from '../../types/app.types'
import type { CliResultEventData } from '../../../preload/index'
import { listSessionsShared } from '../../utils/sessionListShared'
import { resolveTurnOutcome } from '../../components/chat/codexErrorText'
import { adoptEngineStepBucket } from '../../components/chat/engineStepLog'
import { engineNoticeStore } from '../../components/chat/engineNoticeStore'
import { autoApprovalReviewStore } from '../../components/chat/autoApprovalReviewStore'
import { sendCompletionNotification, playCompletionSound } from '../streamJsonUtils'
import { isResultForActiveConversation } from './guards'
import type { StreamJsonEventContext } from './eventContext'

/**
 * `cli:result` — the end of a turn: outcome, usage, cost, notifications,
 * title generation and the task queue. The largest branch of the old
 * switch; moved verbatim (wave 75C), including the workflow placeholder
 * substitution nested inside it.
 */
export function handleResultEvent(event: string, data: any, ctx: StreamJsonEventContext): boolean {
  const {
    activeBridgeIdRef,
    autoCompactRef,
    contextWarningShownRef,
    dreamMtimeSnapshotRef,
    extractMemoriesRef,
    sendMessageRef,
    sendTimestampRef,
    stopStreamingAndReleaseSleep,
    t,
  } = ctx

  if (event === 'cli:result') {
    if (!isResultForActiveConversation(data, activeBridgeIdRef.current)) {
      console.debug('[cli:result] ignored result from another conversation:', data.sessionId)
      return true
    }
    // The turn is over: its warning rows (and the dedupe memory that
    // made dismissals stick) are spent. A reroute line may stay until the
    // next turn starts, since it still describes the turn just finished.
    engineNoticeStore.endTurn()
    // A review that has not completed by the end of the turn can no
    // longer be true; drop its in-progress line instead of spinning.
    autoApprovalReviewStore.clearInProgress()
    const resultData = data as CliResultEventData
    // The protocol's terminal statement (Codex) — null for the legacy
    // Claude bridge, which has only `subtype`.
    const protocolOutcome = typeof resultData.outcome === 'string' ? resultData.outcome : null
    const turnOutcome = resolveTurnOutcome(resultData)
    const isCompletedTurn = turnOutcome === 'completed'
    // A stopped or unreported turn gets a quiet tail marker. A completed
    // or failed turn clears it (a failure has its own error treatment).
    useChatStore.getState().setLastTurnOutcome(
      protocolOutcome === 'interrupted'
        ? 'interrupted'
        : protocolOutcome === 'unknown'
          ? 'unknown'
          : null,
    )
    // Handle error subtypes before normal result processing
    const resultSubtype = (data.subtype as string | undefined) ?? 'success'
    if (resultSubtype === 'error_max_structured_output_retries') {
      useUiStore.getState().addToast('error', t('error.structuredOutputRetries'), 8000)
      stopStreamingAndReleaseSleep()
      return true
    }
    // Log enterprise / diagnostic fields — no UI exposure needed
    if (data.uuid) {
      console.debug('[cli:result] session result UUID:', data.uuid)
    }
    if (data.fastModeState !== undefined) {
      console.debug('[cli:result] fast_mode_state:', data.fastModeState)
    }
    const msgCountBefore = useChatStore.getState().messages.length
    const claudeSessionId = data.claudeSessionId as string | undefined
    if (claudeSessionId) {
      // A brand-new conversation's quiet rows were bucketed under `null`
      // while the engine id was unknown. Move them before the view starts
      // selecting the new bucket, so a turn's evidence never disappears
      // at the moment its thread id is announced.
      adoptEngineStepBucket(useChatStore.getState().viewSessionId, claudeSessionId)
      useChatStore.getState().setSessionId(claudeSessionId)
      // Refresh session list so the pending placeholder is replaced with the real session
      listSessionsShared().then((list: any) => {
        if (list) useSessionStore.getState().setSessions(list)
      })
    }
    // Consume full result stats: permission denials, turns, duration
    {
      const denials = (data.permissionDenials as Array<{ tool_name: string; reason?: string }> | undefined) ?? []
      const numTurns = (data.numTurns as number | undefined) ?? null
      const durationMs = (data.durationMs as number | undefined) ?? null
      useChatStore.getState().setResultStats(denials, numTurns, durationMs)
      // Show toast if any permissions were denied during this turn
      if (denials.length > 0) {
        useUiStore.getState().addToast('warning',
          t('permission.denialsCount', { count: String(denials.length) }),
          5000
        )
      }
    }
    useChatStore.getState().setLastResultUuid((data.uuid as string | undefined) ?? null)
    useChatStore.getState().setFastModeState((data.fastModeState as string | undefined) ?? null)
    const ev = data.event as Record<string, unknown>
    // Compact diff toast: when result metadata indicates compaction happened
    const metadata = ev?.metadata as Record<string, unknown> | undefined
    if (metadata?.compacted === true) {
      const msgCountAfter = useChatStore.getState().messages.length
      useUiStore.getState().addToast('success',
        t('compact.contextDiff', { before: String(msgCountBefore), after: String(msgCountAfter) })
      )
    }
    // Codex puts usage on the result envelope (turn/completed has no
    // usage field), Claude puts it inside event — accept either.
    const usage = (ev?.usage ?? data.usage) as Record<string, number> | undefined
    if (usage) {
      useChatStore.getState().setLastUsage({
        inputTokens: (usage.input_tokens ?? 0),
        outputTokens: (usage.output_tokens ?? 0),
        cacheTokens: (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
      })
    }
    // cost (with per-model breakdown)
    const costUsd = (ev?.total_cost_usd ?? ev?.totalCostUsd ?? data.totalCostUsd) as number | undefined
    const currentModel = usePrefsStore.getState().prefs.model || 'claude-sonnet-4-6'
    const turnUsage = usage ? {
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      cacheTokens: (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
    } : undefined
    useChatStore.getState().setLastCost(costUsd ?? null, currentModel, turnUsage)

    // context window usage
    if (usage?.context_window && usage.context_window > 0) {
      useChatStore.getState().setLastContextUsage({ used: usage.input_tokens ?? 0, total: usage.context_window })
      // Warn when context window is getting full
      const pct = Math.round((usage.input_tokens ?? 0) / usage.context_window * 100)
      if (pct >= 85 && !contextWarningShownRef.current) {
        contextWarningShownRef.current = true
        const addToast = useUiStore.getState().addToast
        addToast('warning', t('token.warningThreshold', { pct: String(pct) }), 8000)
      }
      // Reset warning flag if usage drops below 85% (e.g. after compaction)
      if (pct < 85 && contextWarningShownRef.current) {
        contextWarningShownRef.current = false
      }
      // Auto-compact when context window nears capacity
      autoCompactRef.current(usage.input_tokens ?? 0, usage.context_window)

      // Compact completion detection (Iteration 519)
      // When isCompacting is true and we get a result with context data, the compact is done
      const chatState = useChatStore.getState()
      if (chatState.isCompacting) {
        chatState.setCompacting(false)
        chatState.incrementCompactionCount()
        const before = chatState.contextBeforeCompact
        const afterPct = pct
        if (before && before.total > 0) {
          const beforePct = Math.round((before.used / before.total) * 100)
          useUiStore.getState().addToast('success',
            t('compact.success', { before: String(beforePct), after: String(afterPct) })
          )
        } else {
          useUiStore.getState().addToast('success', t('compact.complete'))
        }
        chatState.setContextBeforeCompact(null)
      }
    }

    // Compact completion fallback: if isCompacting but no context_window data in result
    {
      const chatState = useChatStore.getState()
      if (chatState.isCompacting && !(usage?.context_window && usage.context_window > 0)) {
        chatState.setCompacting(false)
        chatState.incrementCompactionCount()
        useUiStore.getState().addToast('success', t('compact.complete'))
        chatState.setContextBeforeCompact(null)
      }
    }
    // Set response duration on the last assistant message
    if (sendTimestampRef.current > 0) {
      const duration = Date.now() - sendTimestampRef.current
      sendTimestampRef.current = 0
      const msgs = useChatStore.getState().messages
      const lastAssistant = [...msgs].reverse().find(m => m.role === 'assistant')
      if (lastAssistant) {
        useChatStore.getState().setResponseDuration(lastAssistant.id, duration)
      }
    }
    const resultText = (ev?.result as string) || ''
    if (resultText.trim()) {
      const msgs = useChatStore.getState().messages
      const last = msgs[msgs.length - 1]
      if (!last || last.role !== 'assistant') {
        useChatStore.getState().addMessage({
          id: `asst-${Date.now()}`,
          role: 'assistant',
          content: resultText,
          timestamp: Date.now(),
        } as StandardChatMessage)
      }
    }
    if (!isCompletedTurn) {
      // A stopped, failed, or unreported turn is not a success: no
      // completion chime/notification, no title generation, no memory
      // extraction, and no task-queue advance. A genuine failure already
      // arrived as cli:turnError; a stopped/unknown turn has its quiet
      // tail marker set above and must not be shown as an error.
      const doneState = useChatStore.getState()
      const runningItem = doneState.taskQueue.find(item => item.status === 'running')
      if (runningItem) doneState.markQueueItemDone(runningItem.id)
      return true
    }
    // Completion notification
    sendCompletionNotification(
      'AIPA',
      resultText || t('chat.responseComplete'),
      useChatStore.getState().currentSessionId ?? undefined,
    )
    // DreamTask detection: check if .consolidate-lock mtime advanced since session start
    if (window.electronAPI?.sessionGetDreamMtime && dreamMtimeSnapshotRef.current >= 0) {
      const snapshotMtime = dreamMtimeSnapshotRef.current
      window.electronAPI.sessionGetDreamMtime().then((currentMtime: number) => {
        if (currentMtime > snapshotMtime && currentMtime > 0) {
          const dreamId = `dream-${currentMtime}`
          useChatStore.getState().addDreamEvent({ id: dreamId, timestamp: currentMtime })
          useUiStore.getState().addToast('info', t('dream.memoryConsolidated'), 5000)
        }
      }).catch(() => {})
    }
    // Increment per-session unread badge (Iteration 459)
    {
      const uiState = useUiStore.getState()
      const activeSessionId = useChatStore.getState().currentSessionId
      const resultSessionId = claudeSessionId || activeSessionId
      // Only mark unread if the result session is NOT the one currently being viewed
      if (resultSessionId && resultSessionId !== activeSessionId) {
        uiState.incrementUnreadForSession(resultSessionId)
      } else if (uiState.sidebarTab !== 'history' || !uiState.sidebarOpen) {
        // Even for the active session, if history tab isn't visible, increment
        if (resultSessionId) uiState.incrementUnreadForSession(resultSessionId)
      }
    }
    // Sound notification
    if (usePrefsStore.getState().prefs.notifySound !== false) {
      playCompletionSound()
    }
    // Auto-focus input after response completes
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('aipa:focusInput'))
    }, 100)
    // Auto-generate session title after first assistant response
    const msgs = useChatStore.getState().messages
    const userMsgs = msgs.filter(m => m.role === 'user')
    const firstUserPrompt = (userMsgs[0] as StandardChatMessage)?.content || ''
    if (userMsgs.length === 1 && firstUserPrompt && claudeSessionId) {
      const titleSessionId = claudeSessionId
      // Snapshot the name this conversation had when generation started.
      // A different name by the time the answer lands means someone (the
      // user) renamed it in between.
      const titleBefore =
        useSessionStore.getState().sessions.find(s => s.sessionId === titleSessionId)?.title ?? ''
      window.electronAPI.sessionGenerateTitle(firstUserPrompt).then((title: string) => {
        if (!title) return
        // The request outlives this turn. Apply the result to the session
        // it was generated for — never to whatever conversation happens to
        // be open now — and never over a name the user set by hand.
        if (useChatStore.getState().isSessionTitleManual(titleSessionId)) return
        const titleNow =
          useSessionStore.getState().sessions.find(s => s.sessionId === titleSessionId)?.title ?? ''
        if (titleNow !== titleBefore) return
        window.electronAPI.sessionRename(titleSessionId, title)
        useChatStore.getState().setSessionTitleFor(titleSessionId, title)
        useUiStore.getState().addToast('info', t('session.titleGenerated'), 2000)
        // Refresh session list in sidebar to show the new title
        listSessionsShared().then((list: any) => {
          if (list) {
            useSessionStore.getState().setSessions(list)
          }
        })
      }).catch(() => {})
    }

    // Auto-extract memories from conversation
    extractMemoriesRef.current()

    // ── Task Queue: auto-execute next task ──────────
    {
      const queueState = useChatStore.getState()
      // Mark any running item as done
      const runningItem = queueState.taskQueue.find(item => item.status === 'running')
      if (runningItem) {
        queueState.markQueueItemDone(runningItem.id)
      }
      // Check if all items are now done → fire completion toast
      const updatedQueue = useChatStore.getState().taskQueue
      const pendingCount = updatedQueue.filter(item => item.status === 'pending').length
      const doneCount = updatedQueue.filter(item => item.status === 'done').length
      if (pendingCount === 0 && doneCount > 0) {
        useUiStore.getState().addToast('success', t('taskQueue.queueComplete', { count: String(doneCount) }))
        sendCompletionNotification(
          'AIPA',
          t('taskQueue.queueComplete', { count: String(doneCount) }),
          useChatStore.getState().currentSessionId ?? undefined,
        )
      }
      // Auto-send next if not paused
      if (!queueState.queuePaused) {
        const nextItem = useChatStore.getState().shiftQueue()
        if (nextItem) {
          setTimeout(() => {
            // ── Template variable substitution for workflow steps ──
            let resolvedContent = nextItem.content
            if (nextItem.workflowId !== undefined && nextItem.stepIndex !== undefined && nextItem.stepIndex > 0) {
              const allMessages = useChatStore.getState().messages
              const allQueue = useChatStore.getState().taskQueue
              // Build map: stepIndex → assistant output text
              const stepOutputMap: Record<number, string> = {}
              const workflowItems = allQueue.filter(
                item => item.workflowId === nextItem.workflowId && item.status === 'done'
              )
              workflowItems.forEach(item => {
                if (item.stepIndex === undefined) return
                // Find the user message matching this step's content in chat history
                const stdMsgs = allMessages.filter(
                  m => m.role === 'user' || m.role === 'assistant'
                ) as StandardChatMessage[]
                for (let mi = 0; mi < stdMsgs.length; mi++) {
                  if (stdMsgs[mi].role === 'user' && stdMsgs[mi].content === item.content) {
                    // Find the next assistant message
                    for (let ai = mi + 1; ai < stdMsgs.length; ai++) {
                      if (stdMsgs[ai].role === 'assistant') {
                        stepOutputMap[item.stepIndex] = stdMsgs[ai].content
                        break
                      } else if (stdMsgs[ai].role === 'user') {
                        break
                      }
                    }
                    break
                  }
                }
              })
              // Replace {{step_N_output}} and {{output_N}} placeholders (1-based)
              resolvedContent = resolvedContent.replace(
                /\{\{step_(\d+)_output\}\}/g,
                (_match: string, n: string) => {
                  const idx = parseInt(n, 10) - 1 // convert 1-based to 0-based
                  return stepOutputMap[idx] ?? ''
                }
              ).replace(
                /\{\{output_(\d+)\}\}/g,
                (_match: string, n: string) => {
                  const idx = parseInt(n, 10) - 1
                  return stepOutputMap[idx] ?? ''
                }
              )
            }
            sendMessageRef.current?.(resolvedContent)
          }, 600)
        }
      }
    }
    return true
  }

  return false
}
