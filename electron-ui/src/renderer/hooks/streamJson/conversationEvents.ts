import { useChatStore, usePrefsStore, useUiStore } from '../../store'
import type {
  CodexQuestion,
  ElicitationMessage,
  HookCallbackMessage,
  PermissionMessage,
  StandardChatMessage,
} from '../../types/app.types'
import { rotateApiKey } from '../streamJsonUtils'
import { looksLikeQuotaText } from '../../components/chat/codexErrorText'
import { beginEngineTurn } from '../../components/chat/engineStepLog'
import { engineNoticeStore } from '../../components/chat/engineNoticeStore'
import { decideHookNotice } from '../../components/chat/hookRunView'
import type { StreamJsonEventContext } from './eventContext'

/**
 * `cli:*` channels about the conversation itself: process lifecycle,
 * interactive requests, turn boundaries and the small session facts the
 * header/sidebar follow. Moved verbatim (wave 75C) from the switch in
 * `useStreamJson`.
 */
export function handleConversationEvent(event: string, data: any, ctx: StreamJsonEventContext): boolean {
  const { activeBridgeIdRef, sendMessageRef, stopStreamingAndReleaseSleep, t } = ctx

  if (event === 'cli:hookEvent') {
    const hookData = data as { hookType?: string; message?: string; data?: Record<string, unknown> }
    if (hookData.hookType === 'Notification' && hookData.message) {
      useUiStore.getState().addToast('info', hookData.message)
    }
    // Record hook event in history (capped at 50 entries)
    {
      const innerData = (hookData.data ?? hookData) as Record<string, unknown>
      const eventType = (innerData.event_type ?? innerData.eventType ?? 'unknown') as string
      const hookType = (innerData.hook_type ?? innerData.hookType ?? 'unknown') as string
      const toolName = (innerData.tool_name ?? innerData.toolName ?? '') as string
      const status = ((innerData.status ?? 'success') as string) as 'running' | 'success' | 'error'
      const output = toolName || (innerData.message as string | undefined)
      const existingEvents = useChatStore.getState().hookEvents
      const newEvent = {
        id: `he-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        hookEvent: eventType,
        hookType,
        status,
        output,
        timestamp: Date.now(),
      }
      // Keep last 50, newest first
      const updated = [newEvent, ...existingEvents].slice(0, 50)
      useChatStore.setState({ hookEvents: updated })
    }
    return true
  }

  if (event === 'cli:error') {
    const errText = (data.error as string) || 'CLI encountered an unknown error'
    // Legacy stderr carries no typed code; the shared text heuristic is
    // the only fallback, and it is never presented as a stated cause.
    const isQuotaError = looksLikeQuotaText(errText)
    if (isQuotaError && (usePrefsStore.getState().prefs.apiKeyPool || []).length > 0) {
      const switched = rotateApiKey()
      if (switched) {
        const nextKey = usePrefsStore.getState().prefs.activeApiKeyId
        const pool = usePrefsStore.getState().prefs.apiKeyPool || []
        const entry = pool.find(k => k.id === nextKey)
        useUiStore.getState().addToast('warning', t('settings.apiKeyAutoSwitched', { label: entry?.label || 'next key' }))
        // Auto-retry the last message
        const msgs = useChatStore.getState().messages
        const lastUser = [...msgs].reverse().find(m => m.role === 'user')
        if (lastUser) {
          setTimeout(() => {
            sendMessageRef.current?.((lastUser as StandardChatMessage).content)
          }, 500)
          return true
        }
      }
    }
    useChatStore.getState().addMessage({
      id: `err-${Date.now()}`,
      role: 'assistant',
      content: `⚠️ ${errText}`,
      timestamp: Date.now(),
    } as StandardChatMessage)
    // Compact failure detection (Iteration 519)
    const chatStateErr = useChatStore.getState()
    if (chatStateErr.isCompacting) {
      chatStateErr.setCompacting(false)
      chatStateErr.setContextBeforeCompact(null)
      useUiStore.getState().addToast('error', t('compact.failed'))
    }
    stopStreamingAndReleaseSleep()
    return true
  }

  if (event === 'cli:processExit') {
    useChatStore.getState().denyPendingPermissions()
    useChatStore.getState().cancelPendingInteractiveMessages()
    // The bridge is gone: no status it reported can still be live.
    useChatStore.getState().setThreadStatus(null)
    activeBridgeIdRef.current = null
    // Reset compact state if process exits mid-compact (Iteration 519)
    {
      const chatStateExit = useChatStore.getState()
      if (chatStateExit.isCompacting) {
        chatStateExit.setCompacting(false)
        chatStateExit.setContextBeforeCompact(null)
      }
    }
    stopStreamingAndReleaseSleep()
    return true
  }

  if (event === 'cli:permissionRequest') {
    const d = data as { sessionId: string; requestId: string; toolName: string; toolInput: Record<string, unknown>; permissionSuggestions?: unknown[] }
    useChatStore.getState().addPermissionRequest({
      id: `perm-${Date.now()}`,
      role: 'permission',
      permissionId: d.requestId,
      toolName: d.toolName,
      toolInput: d.toolInput,
      decision: 'pending',
      timestamp: Date.now(),
      permissionSuggestions: d.permissionSuggestions,
    } as PermissionMessage)
    return true
  }

  if (event === 'cli:hookCallback') {
    const d = data as { sessionId: string; requestId: string; callbackId: string; hookInput: Record<string, unknown>; toolUseId?: string }
    useChatStore.getState().addHookCallback({
      id: `hook-${Date.now()}`,
      role: 'hook_callback',
      requestId: d.requestId,
      callbackId: d.callbackId,
      hookInput: d.hookInput || {},
      toolUseId: d.toolUseId,
      decision: 'pending',
      timestamp: Date.now(),
    } as HookCallbackMessage)
    return true
  }

  if (event === 'cli:elicitation') {
    const d = data as { sessionId: string; requestId: string; serverName: string; message: string; mode?: 'form' | 'url'; url?: string; requestedSchema?: Record<string, unknown>; codexQuestions?: CodexQuestion[] }
    useChatStore.getState().addElicitation({
      id: `elicit-${Date.now()}`,
      role: 'elicitation',
      requestId: d.requestId,
      serverName: d.serverName,
      message: d.message,
      mode: d.mode || 'form',
      url: d.url,
      requestedSchema: d.requestedSchema,
      // Structured Codex questions render as a choice form; absent for
      // MCP elicitations, which keep using requestedSchema.
      ...(Array.isArray(d.codexQuestions) && d.codexQuestions.length > 0
        ? { codexQuestions: d.codexQuestions }
        : {}),
      decision: 'pending',
      timestamp: Date.now(),
    } as ElicitationMessage)
    return true
  }

  if (event === 'cli:serverRequestResolved') {
    // Codex settled the request itself (auto-resolution, another client,
    // turn cancel). No answer of ours is wanted any more — retire the card.
    const d = data as { requestId?: string }
    if (typeof d.requestId === 'string' && d.requestId) {
      useChatStore.getState().settleServerRequest(d.requestId, 'resolved')
    }
    return true
  }

  if (event === 'cli:serverRequestTimedOut') {
    // The bridge rejected the request on timeout; no answer was sent.
    const d = data as { requestId?: string }
    if (typeof d.requestId === 'string' && d.requestId) {
      useChatStore.getState().settleServerRequest(d.requestId, 'expired')
    }
    return true
  }

  if (event === 'cli:messageStart') {
    // `turn/started` from Codex. A new turn owns the transcript now, so
    // the previous turn's aggregate diff must not sit under its answer.
    const sid = typeof data.sessionId === 'string' ? data.sessionId : ''
    if (sid && useChatStore.getState().isOwnedStreamEvent(sid)) {
      // This notification is the only place the renderer is told the
      // turn id (`turn/started` carries `turn.id`); `turn/steer` needs
      // exactly that id as its `expectedTurnId` precondition.
      const startedTurn = (data.event as { turn?: { id?: unknown } } | undefined)?.turn
      const turnId = typeof startedTurn?.id === 'string' ? startedTurn.id : ''
      if (turnId) {
        useChatStore.getState().setLiveTurnId(turnId)
        // Fallback attribution: the row the user just sent is the one
        // this turn answers. The exact echo (`cli:userMessageTurn`) is
        // preferred but may be missing on older builds.
        useChatStore.getState().attachTurnToLastUserMessage(turnId)
      }
      // A new turn is no longer covered by the previous turn's reroute
      // report. Warnings stay until `cli:result` (they can arrive before
      // `turn/started` during initialize).
      engineNoticeStore.beginTurn()
      useChatStore.getState().clearTurnDiff()
      // A protocol turn boundary also ends a grouping window: two turns
      // that each produced one unhandled item must not merge into one
      // "2 engine steps" row just because no visible message sat between.
      beginEngineTurn(useChatStore.getState().viewSessionId)
    }
    return true
  }

  if (event === 'cli:userMessageTurn') {
    // The engine's echo of a user prompt, carrying the turn it started.
    // Same ownership rule as every other turn event: a background bridge
    // must not tag a row in the visible transcript.
    const sid = typeof data.sessionId === 'string' ? data.sessionId : ''
    if (!sid || !useChatStore.getState().isOwnedStreamEvent(sid)) return true
    const turnId = (data as { turnId?: unknown }).turnId
    if (typeof turnId === 'string' && turnId) {
      useChatStore.getState().attachTurnToLastUserMessage(turnId)
    }
    return true
  }

  if (event === 'cli:hookRun') {
    // Hook notices are turn-scoped. A background or other-tab bridge must
    // not write into this transcript — same ownership rule as the deltas.
    const sid = typeof data.sessionId === 'string' ? data.sessionId : ''
    if (!sid || !useChatStore.getState().isOwnedStreamEvent(sid)) return true
    const notice = decideHookNotice(data)
    if (!notice) return true
    // `run.id` is stable across the started/completed pair; the turn id
    // keeps a run without one from colliding across turns.
    const turnId = typeof data.turnId === 'string' ? data.turnId : ''
    const id = `hook-${notice.runId || `${notice.kind}-${notice.eventName}-${turnId}`}`
    if (useChatStore.getState().messages.some(m => m.id === id)) return true
    useChatStore.getState().addMessage({
      id,
      role: 'system',
      content: '',
      hookNotice: notice,
      timestamp: Date.now(),
    } as StandardChatMessage)
    return true
  }

  if (event === 'cli:apiError') {
    // Surface overloaded/auth errors as user-visible toasts
    const d = data as { sessionId: string; errorType: 'overloaded' | 'authentication'; message: string }
    if (d.errorType === 'authentication') {
      useUiStore.getState().addToast('error', `Auth error: ${d.message}`, 8000)
    } else if (d.errorType === 'overloaded') {
      useUiStore.getState().addToast('warning', `API overloaded: ${d.message}`, 6000)
    }
    return true
  }

  if (event === 'cli:worktreeState') {
    // Worktree state change from CLI — store active worktree info
    const d = data as { sessionId: string; worktreePath: string; branch: string; state: string }
    useChatStore.getState().setActiveWorktree(
      d.worktreePath ? { path: d.worktreePath, branch: d.branch, state: d.state } : null
    )
    return true
  }

  if (event === 'cli:taskCompleted') {
    // Background task completed — show toast notification
    const d = data as { sessionId: string; taskId: string; result: unknown }
    const taskId = d.taskId ? ` #${d.taskId.slice(0, 8)}` : ''
    useUiStore.getState().addToast('success', t('task.backgroundCompleted', { id: taskId }), 5000)
    return true
  }

  return false
}
