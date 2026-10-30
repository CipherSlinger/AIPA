import { useChatStore, usePrefsStore, useUiStore } from '../../store'
import type { StandardChatMessage } from '../../types/app.types'
import { describeCodexError } from '../../components/chat/codexErrorText'
import { liveFilePatchStore } from '../../components/chat/liveFilePatchStore'
import type { CliTurnErrorEventData } from '../../../preload/index'
import { runCodexErrorAction } from './moduleActions'
import { markActiveTaskNeedsYou } from '../../lib/taskWorkState'
import type { StreamJsonEventContext } from './eventContext'

/**
 * `cli:*` channels that carry one turn's text, usage, plan and end.
 *
 * Moved verbatim (wave 75C) from the switch in `useStreamJson`; each branch
 * keeps its guards, comments and store writes. Returns true when the event
 * belongs to this group (including the branches that deliberately do
 * nothing), false otherwise.
 */
export function handleTurnEvent(event: string, data: any, ctx: StreamJsonEventContext): boolean {
  const { autoCompactRef, contextWarningShownRef, stopStreamingAndReleaseSleep, t } = ctx

  if (event === 'cli:assistantText') {
    useChatStore.getState().appendTextDelta(data.sessionId as string, data.text as string)
    return true
  }

  if (event === 'cli:thinkingDelta') {
    useChatStore.getState().appendThinkingDelta(data.sessionId as string, data.thinking as string)
    return true
  }

  if (event === 'cli:tokenUsageUpdated') {
    // Codex reports accounting mid-turn (thread/tokenUsage/updated) rather
    // than only at the end, which is what makes the context meter and
    // auto-compact usable before the window is exhausted.
    const u = (data.usage ?? {}) as Record<string, number>
    const turnUsage = {
      inputTokens: u.input_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0,
      cacheTokens: (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    }
    useChatStore.getState().setLastUsage(turnUsage)
    useChatStore.getState().setLastCost(
      null,
      usePrefsStore.getState().prefs.model || undefined,
      turnUsage,
    )
    const total = u.context_window ?? 0
    if (total > 0) {
      useChatStore.getState().setLastContextUsage({ used: turnUsage.inputTokens, total })
      const pct = Math.round((turnUsage.inputTokens / total) * 100)
      if (pct >= 85 && !contextWarningShownRef.current) {
        contextWarningShownRef.current = true
        useUiStore.getState().addToast('warning', t('token.warningThreshold', { pct: String(pct) }), 8000)
      }
      if (pct < 85 && contextWarningShownRef.current) {
        contextWarningShownRef.current = false
      }
      autoCompactRef.current(turnUsage.inputTokens, total)
    }
    return true
  }

  if (event === 'cli:turnError') {
    // A retrying error is informational — Codex reconnects on its own.
    if (data.willRetry) return true
    const errData = data as CliTurnErrorEventData
    // The typed protocol code decides the explanation and action. Prose
    // regexes are used only when the engine sent no recognisable code.
    const view = describeCodexError({
      codexErrorInfo: errData.codexErrorInfo,
      message: errData.message,
      details: errData.details,
    })
    const explanation = view.explanationKey ? t(view.explanationKey, view.params) : ''
    const raw = view.detail || t('error.unknownError')
    const content = explanation
      ? (view.detail && view.detail !== explanation
        ? `⚠️ ${explanation}\n\n${view.detail}`
        : `⚠️ ${explanation}`)
      : `⚠️ ${raw}`
    useChatStore.getState().addMessage({
      id: `err-${Date.now()}`,
      role: 'assistant',
      content,
      timestamp: Date.now(),
      // While this row is the transcript's tail it can offer Retry; a new turn
      // appends its own row and the offer ends. See `turnRetry.ts`.
      turnError: true,
    } as StandardChatMessage)
    // A task whose turn just died is not "in progress" any more: somebody has
    // to decide what happens next, which is what the needs-you column means.
    // Send the most specific line the engine gave us — the protocol detail,
    // else the localized explanation, else the fallback raw line — collapsed
    // to one line. The store caps it at 200 characters.
    const reason = (view.detail || explanation || raw).replace(/\s+/g, ' ').trim()
    markActiveTaskNeedsYou(reason)
    const chatState = useChatStore.getState()
    if (chatState.isCompacting) {
      chatState.setCompacting(false)
      chatState.setContextBeforeCompact(null)
      useUiStore.getState().addToast('error', t('compact.failed'))
    }
    if (view.action) {
      const action = view.action
      const labelKey = action === 'compact'
        ? 'codex.error.action.compact'
        : action === 'account'
          ? 'codex.error.action.account'
          : 'codex.error.action.permissions'
      useUiStore.getState().addToast(
        'error',
        explanation || raw,
        10000,
        { label: t(labelKey), onClick: () => runCodexErrorAction(action) },
      )
    }
    stopStreamingAndReleaseSleep()
    return true
  }

  if (event === 'cli:planUpdated') {
    // Codex's plan is a living checklist: update the same card instead of
    // appending a new TodoWrite block every time a step changes.
    const planId = (data.planId as string) || `plan-${data.turnId ?? Date.now()}`
    const todos = (Array.isArray(data.plan) ? data.plan as Array<Record<string, unknown>> : [])
      .map(step => ({ content: String(step.content ?? step.step ?? ''), status: step.status ?? 'pending' }))
    if (todos.length === 0) return true
    const chatState = useChatStore.getState()
    let found = false
    const updated = chatState.messages.map(m => {
      if (m.role !== 'assistant') return m
      const std = m as StandardChatMessage
      if (!std.toolUses?.some(tu => tu.id === planId)) return m
      found = true
      return {
        ...std,
        toolUses: std.toolUses.map(tu => tu.id === planId ? { ...tu, input: { todos } } : tu),
      }
    })
    if (found) {
      useChatStore.setState({ messages: updated })
      return true
    }
    let lastMsg = chatState.messages.at(-1)
    if (!lastMsg || lastMsg.role !== 'assistant') {
      const placeholder: StandardChatMessage = {
        id: `asst-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
      }
      chatState.addMessage(placeholder)
      lastMsg = placeholder
    }
    chatState.addToolUse(lastMsg.id, planId, 'TodoWrite', { todos })
    return true
  }

  if (event === 'cli:compacted') {
    const chatState = useChatStore.getState()
    if (chatState.isCompacting) {
      chatState.setCompacting(false)
      chatState.incrementCompactionCount()
      useUiStore.getState().addToast('success', t('compact.complete'))
      chatState.setContextBeforeCompact(null)
    }
    return true
  }

  if (event === 'cli:messageEnd') {
    // The end of a turn must obey the same ownership rule as its deltas.
    // Before this guard, another tab's (or a background) bridge finishing
    // cleared the foreground's isStreaming, finalized its placeholder and
    // released its sleep lock for a conversation that was still running.
    {
      const endedBridgeId = String(data.sessionId ?? '')
      if (!useChatStore.getState().isOwnedStreamEvent(endedBridgeId)) {
        // The bridge that just ended may be the orphan the user walked
        // away from. It is finished and cannot be reattached; forget it
        // without touching the foreground's streaming state.
        useChatStore.getState().releaseOrphanStream(endedBridgeId)
        return true
      }
    }
    // A turn has ended, so no status from inside it can still be true:
    // a "waiting on you" chip must not outlive the turn it described.
    useChatStore.getState().setThreadStatus(null)
    // No live patch can still be meaningful after its turn ended.
    liveFilePatchStore.clear()
    stopStreamingAndReleaseSleep()
    // Auto-compact refuses to run while streaming (it would interrupt the
    // turn), so the post-turn check has to happen after the flag clears.
    // Result events arrive before messageEnd, which made the old call in
    // cli:result a no-op.
    const ctx = useChatStore.getState().lastContextUsage
    if (ctx && ctx.total > 0) {
      setTimeout(() => autoCompactRef.current(ctx.used, ctx.total), 0)
    }
    return true
  }

  return false
}
