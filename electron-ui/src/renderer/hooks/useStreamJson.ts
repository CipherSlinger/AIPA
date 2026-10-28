import { useCallback, useEffect, useRef } from 'react'
import { useChatStore, usePrefsStore, useSessionStore } from '../store'
import { ElicitationMessage, HookCallbackMessage, PermissionMessage, PlanMessage, StandardChatMessage, PromptHistoryItem } from '../types/app.types'
import { useUiStore } from '../store'
import { getT } from '../i18n'
import { resolveProvider, sendCompletionNotification, playCompletionSound, getActiveApiKey, rotateApiKey } from './streamJsonUtils'
import { useAutoCompact } from './useAutoCompact'
import { useAutoMemory } from './useAutoMemory'
import { assembleMemoryContext, createElectronMemoryIo } from './promptMemory'
import { composeSystemPromptParts, resolvePersonaTurnSettings } from './promptAssembly'
import { listSessionsShared } from '../utils/sessionListShared'
// parseTokenBudget used by token display utilities
// import { parseTokenBudget } from '../utils/tokenUtils'

// Track prompt sends for analytics (deduped, max 200 items).
// Module-level: touches only store state via getState(), so it needs no hook deps.
function trackPromptHistory(prompt: string) {
  const text = prompt.trim().slice(0, 500)
  if (!text) return
  const normalized = text.toLowerCase().replace(/\s+/g, ' ')
  const hash = `ph-${Array.from(normalized).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0).toString(36)}`
  const existing: PromptHistoryItem[] = usePrefsStore.getState().prefs.promptHistory || []
  const idx = existing.findIndex(item => item.id === hash)
  const now = Date.now()
  let updated: PromptHistoryItem[]
  if (idx >= 0) {
    updated = [...existing]
    updated[idx] = { ...updated[idx], count: updated[idx].count + 1, lastUsedAt: now }
  } else {
    const newItem: PromptHistoryItem = { id: hash, text, count: 1, lastUsedAt: now, firstUsedAt: now }
    updated = [newItem, ...existing].slice(0, 200)
  }
  usePrefsStore.getState().setPrefs({ promptHistory: updated })
  window.electronAPI?.prefsSet('promptHistory', updated)
}

// Build a CLI permission rule string from tool name + input
function buildPermissionRule(toolName: string, toolInput: Record<string, unknown>): string {
  if ((toolName === 'Bash' || toolName === 'computer') && toolInput.command) {
    const cmd = String(toolInput.command).trim()
    const firstWord = cmd.split(/\s+/)[0]
    if (firstWord) return `Bash(${firstWord} *)`
  }
  return toolName
}

/**
 * Background turns (memory extraction, away summary) carry an `internal-`
 * bridge id and are never published on the cli:* channels. The tag is still
 * checked here: the listener subscribes to every bridge, so a leak in the main
 * process must not be able to write into the open conversation.
 */
const INTERNAL_SESSION_PREFIX = 'internal-'
function isInternalCliEvent(data: unknown): boolean {
  const d = data as { internal?: unknown; sessionId?: unknown } | null
  if (!d) return false
  if (d.internal === true) return true
  return typeof d.sessionId === 'string' && d.sessionId.startsWith(INTERNAL_SESSION_PREFIX)
}

/**
 * Invariant: a cli:result may mutate the open conversation only when it is
 * (a) the bridge this hook started, (b) carries the engine session id that is
 * already on screen, or (c) belongs to a conversation that has no real id yet
 * (a new chat, or the sidebar's `pending-` placeholder waiting for its first
 * result). Anything else is another tab's or a background job's turn: it must
 * not switch currentSessionId, append messages, or set usage/cost.
 */
function isResultForActiveConversation(data: unknown, activeBridgeId: string | null): boolean {
  const d = data as { sessionId?: unknown; claudeSessionId?: unknown } | null
  if (!d) return false
  const bridgeSessionId = typeof d.sessionId === 'string' ? d.sessionId : ''
  const store = useChatStore.getState()
  // A bridge the user walked away from mid-turn. Its result reports on its own
  // conversation, never on whatever is on screen now: applying it would relabel
  // this view with the other session id and re-visible the orphan, letting the
  // rest of that turn land in this transcript.
  const orphan = store.orphanedStream
  if (orphan && bridgeSessionId === orphan.bridgeId) return orphan.visible
  if (activeBridgeId && bridgeSessionId === activeBridgeId) return true
  const engineSessionId = typeof d.claudeSessionId === 'string' ? d.claudeSessionId : ''
  const current = store.currentSessionId
  if (!current || current.startsWith('pending-')) return true
  return engineSessionId === current || bridgeSessionId === current
}

// Write a permanent allow/deny rule to ~/.claude/settings.json
async function writePermissionRule(type: 'allow' | 'deny', toolName: string, toolInput: Record<string, unknown>) {
  const rule = buildPermissionRule(toolName, toolInput)
  try {
    const settings = await window.electronAPI.configReadCLISettings()
    const perms = (settings.permissions || {}) as { allow?: string[]; deny?: string[] }
    const list = Array.isArray(perms[type]) ? perms[type]! : []
    if (!list.includes(rule)) {
      list.push(rule)
    }
    await window.electronAPI.configWriteCLISettings({
      permissions: { ...perms, [type]: list },
    })
    const t = getT()
    const toastMsg = type === 'allow'
      ? t('permission.ruleAddedAllow', { rule })
      : t('permission.ruleAddedDeny', { rule })
    useUiStore.getState().addToast('success', toastMsg)
  } catch {
    useUiStore.getState().addToast('warning', getT()('permissions.saveFailed'))
  }
}

export function useStreamJson() {
  // PERF: no state subscriptions here — every action is read lazily via
  // useChatStore.getState() at call time. This keeps the returned API (and the
  // callback identities consumed by ChatPanel's shortcut/event hooks) stable
  // across streaming renders.
  const { tryAutoCompact } = useAutoCompact()
  const { tryExtractMemories } = useAutoMemory()
  // Keep the latest callbacks reachable from the event-subscription effect below,
  // which is registered once ([]) and must not capture stale closures.
  const autoCompactRef = useRef(tryAutoCompact)
  autoCompactRef.current = tryAutoCompact
  const extractMemoriesRef = useRef(tryExtractMemories)
  extractMemoriesRef.current = tryExtractMemories

  const activeBridgeIdRef = useRef<string | null>(null)
  // Keep a ref to sendMessage so it can be called from the IPC event handler without stale closure
  const sendMessageRef = useRef<((prompt: string) => Promise<unknown>) | null>(null)
  // Track when the user sends a message to calculate response duration
  const sendTimestampRef = useRef<number>(0)
  // Only warn once per session about context window nearing capacity
  const contextWarningShownRef = useRef<boolean>(false)
  // Snapshot of .consolidate-lock mtime at session start — used to detect dream completions
  const dreamMtimeSnapshotRef = useRef<number>(0)

  // Helper: stop streaming + release prevent-sleep (stable — used by sendMessage/abort/effect)
  const stopStreamingAndReleaseSleep = useCallback(() => {
    useChatStore.getState().setStreaming(false)
    if (window.electronAPI?.windowPreventSleep) {
      window.electronAPI.windowPreventSleep(false)
    }
  }, [])

  const sendMessage = useCallback(async (prompt: string, attachments?: import('./useImagePaste').ImageAttachment[], fileAttachments?: import('./useImagePaste').FileAttachment[]) => {
    if (!prompt.trim() && (!attachments || attachments.length === 0) && (!fileAttachments || fileAttachments.length === 0)) return

    // PERF: read latest store values at call time so sendMessage keeps a stable
    // identity (prefs/tabs change often and would otherwise re-create it).
    // `t` intentionally shadows the hook value with the module-level accessor.
    const prefs = usePrefsStore.getState().prefs
    const t = getT()

    // Track prompt in history for analytics (max 200 items, deduped by normalized text)
    trackPromptHistory(prompt)

    const userMsg: StandardChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
      attachments: attachments?.map(a => ({ name: a.name, dataUrl: a.dataUrl })),
    }
    useChatStore.getState().addMessage(userMsg)
    useChatStore.getState().setStreaming(true)
    // Deltas can arrive before cliSendMessage resolves with the bridge id;
    // record which conversation this turn belongs to so the store only accepts
    // that bridge's events and drops anything the user has since navigated away
    // from.
    useChatStore.getState().beginTurn()
    // Prevent system idle sleep while streaming (if enabled in prefs)
    if (prefs.preventSleep !== false && window.electronAPI?.windowPreventSleep) {
      window.electronAPI.windowPreventSleep(true)
    }
    sendTimestampRef.current = Date.now()
    // Snapshot .consolidate-lock mtime so we can detect dream completions after result
    if (window.electronAPI?.sessionGetDreamMtime) {
      window.electronAPI.sessionGetDreamMtime().then((mtime: number) => {
        dreamMtimeSnapshotRef.current = mtime
      }).catch(() => {})
    }

    const currentSessionId = useChatStore.getState().currentSessionId

    // If this is a new conversation, add a pending session to the list immediately
    // so the user sees it appear in the sidebar without waiting for the AI response
    if (!currentSessionId) {
      const sessions = useSessionStore.getState().sessions
      const pendingSession = {
        sessionId: `pending-${Date.now()}`,
        lastPrompt: prompt.length > 100 ? prompt.slice(0, 100) + '...' : prompt,
        timestamp: Date.now(),
        project: '',
        projectSlug: '',
        messageCount: 1,
        firstTimestamp: Date.now(),
      }
      useSessionStore.getState().setSessions([pendingSession, ...sessions])
    }

    const flags: string[] = []

    // Compute effective cwd: per-tab override > global prefs > home dir
    const currentTabForCwd = useChatStore.getState().tabs.find(t => t.id === useChatStore.getState().activeTabId)
    const effectiveCwdEarly = currentTabForCwd?.cwd || prefs.workingDir || ''

    // Resolve the persona that belongs to this conversation. The catalogue
    // (`prefs.personas`) is global; the selection is per session, which is what
    // keeps two open conversations from sharing one expert's prompt and model.
    const personaTurn = resolvePersonaTurnSettings(
      prefs,
      useChatStore.getState().sessionPersonaId,
      (key) => getT()(key),
      useChatStore.getState().sessionModelOverride,
    )

    // `/compact` is intercepted in the main process and its result discarded,
    // so assembling/budgeting every memory tier for it is pure work with no
    // consumer. Checked before assembly because the slash command has to reach
    // the detector verbatim further below.
    const isCompactCommand = /^\/compact\b/.test(prompt.trim())

    // Assemble the persistent memory tiers once per turn (sendMessage is the
    // turn boundary — this code never runs on keystrokes). The result is
    // already budgeted and labelled by tier.
    const memoryContext = isCompactCommand
      ? null
      : await assembleMemoryContext({
          prefs,
          cwd: effectiveCwdEarly,
          io: createElectronMemoryIo(),
        })

    // Build combined system prompt (injected as prefix to user message: Codex
    // has no --append-system-prompt equivalent).
    const systemPromptParts = composeSystemPromptParts({
      prefs,
      persona: personaTurn,
      memoryContext: memoryContext?.text ?? '',
      cwd: effectiveCwdEarly,
      appendSystemPrompt: useChatStore.getState().tempSystemPrompt || prefs.appendSystemPrompt,
    })

    // For Codex: system prompt is prepended to the user message (Codex doesn't have --append-system-prompt)
    // System prompt parts will be prepended to the actual prompt below

    // Build actual prompt — prepend system prompt parts, handle attachments
    let actualPrompt: string
    // Codex accepts structured `UserInput[]`; keep the JSON-string prompt for
    // the legacy Claude bridge, which parses it itself.
    let codexInput: Array<Record<string, unknown>> | undefined

    // `/compact` must reach the main process verbatim (it is intercepted there
    // and mapped to thread/compact/start); a prepended system prompt would hide
    // the slash command from the detector. `isCompactCommand` is computed above,
    // before the (skipped) memory assembly.
    // Prepend system context to the user prompt (Codex doesn't support --append-system-prompt)
    const systemPrefix = !isCompactCommand && systemPromptParts.length > 0
      ? systemPromptParts.join('\n\n') + '\n\n'
      : ''

    const hasImageAttachments = !isCompactCommand && attachments && attachments.length > 0
    const binaryFileBlocks = isCompactCommand
      ? []
      : (fileAttachments || []).filter(f => f.dataUrl && f.mimeType)
    const hasBinaryBlocks = binaryFileBlocks.length > 0

    if (hasImageAttachments || hasBinaryBlocks) {
      const contentBlocks: unknown[] = [{ type: 'text', text: systemPrefix + prompt }]
      const inputs: Array<Record<string, unknown>> = [{ type: 'text', text: systemPrefix + prompt }]
      for (const img of (attachments || [])) {
        const base64 = img.dataUrl.split(',')[1]
        contentBlocks.push({
          type: 'image',
          source: { type: 'base64', media_type: img.mimeType, data: base64 },
        })
        // Codex takes the image as a URL; a data URL carries the bytes inline.
        inputs.push({ type: 'image', url: img.dataUrl })
      }
      for (const file of binaryFileBlocks) {
        const base64 = file.dataUrl!.split(',')[1]
        if (file.isImage) {
          contentBlocks.push({
            type: 'image',
            source: { type: 'base64', media_type: file.mimeType, data: base64 },
          })
          inputs.push({ type: 'image', url: file.dataUrl! })
        } else {
          contentBlocks.push({
            type: 'document',
            source: { type: 'base64', media_type: file.mimeType, data: base64 },
          })
          // Codex UserInput has no document variant. Say so in-band instead of
          // pasting base64 the model cannot read.
          inputs.push({
            type: 'text',
            text: `[Attached file "${file.name}" (${file.mimeType}). This engine cannot accept document attachments, so its contents were not sent.]`,
          })
        }
      }
      actualPrompt = JSON.stringify(contentBlocks)
      codexInput = inputs
    } else {
      actualPrompt = systemPrefix + prompt
    }

    // Route by the model this conversation's persona selected, not by whatever
    // another conversation last wrote into global prefs.
    const routing = await resolveProvider(personaTurn.model)

    if (routing.type === 'provider') {
      // Non-Claude provider: use providerSendMessage IPC
      // Build conversation history for context
      const existingMsgs = useChatStore.getState().messages
      const contextMessages = existingMsgs
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-20) // Last 20 messages for context
        .map(m => ({
          role: m.role as string,
          content: (m as StandardChatMessage).content || '',
        }))
      // Remove the last user message since it's sent as the prompt
      if (contextMessages.length > 0 && contextMessages[contextMessages.length - 1].role === 'user') {
        contextMessages.pop()
      }

      const systemPrompt = systemPromptParts.length > 0 ? systemPromptParts.join('\n\n') : undefined

      try {
        const result = await window.electronAPI.providerSendMessage({
          providerId: routing.providerId,
          prompt: actualPrompt,
          model: personaTurn.model || 'gpt-4o',
          systemPrompt,
          messages: contextMessages,
          images: attachments?.map(a => a.dataUrl),
          maxTokens: 4096,
          temperature: 0.7,
        })

        if (result?.success && result.sessionId) {
          activeBridgeIdRef.current = result.sessionId
          // Provider bridges publish on the same cli:* channels; declare them as
          // the active stream so the store guard does not drop their deltas.
          useChatStore.getState().setStreamSession(result.sessionId)
        } else if (!result?.success) {
          // The provider branch returns before any bridge exists, so no
          // cli:error/cli:messageEnd will arrive. Surface the failure and
          // release the streaming lock, otherwise the composer stays disabled.
          useUiStore.getState().addToast('error', result?.error || t('error.unknownError'))
          stopStreamingAndReleaseSleep()
        }

        return result
      } catch (err) {
        useUiStore.getState().addToast('error', String(err))
        stopStreamingAndReleaseSleep()
        throw err
      }
    }

    // Send via cliSendMessage (CodexBridge handles OpenAI, StreamBridge handles Claude)
    const chatState = useChatStore.getState()
    const currentTab = chatState.tabs.find(tab => tab.id === chatState.activeTabId)
    const effectiveCwd = currentTab?.cwd || prefs.workingDir || (await window.electronAPI.fsGetHome())
    const result = await window.electronAPI.cliSendMessage({
      prompt: actualPrompt,
      ...(codexInput ? { input: codexInput } : {}),
      cwd: effectiveCwd,
      sessionId: currentSessionId,
      activeBridgeId: activeBridgeIdRef.current ?? undefined,
      model: personaTurn.model,
      env: {
        // Provide both keys — CodexBridge uses OPENAI_API_KEY, legacy StreamBridge uses ANTHROPIC_API_KEY
        ...(getActiveApiKey() ? { OPENAI_API_KEY: getActiveApiKey(), ANTHROPIC_API_KEY: getActiveApiKey() } : {}),
      },
      flags,
      permissionMode: (useChatStore.getState().isPlanMode && prefs.permissionMode !== 'bypassPermissions')
        ? 'plan'
        : (prefs.permissionMode || 'default'),
    })

    if (result?.success && result.sessionId) {
      activeBridgeIdRef.current = result.sessionId
      // Only this bridge's deltas may enter the streaming buffer.
      useChatStore.getState().setStreamSession(result.sessionId)
    }

    return result
  }, [stopStreamingAndReleaseSleep])

  // Keep ref in sync so IPC handler can call sendMessage without stale closure
  sendMessageRef.current = sendMessage

  const abort = useCallback(() => {
    const sid = activeBridgeIdRef.current
    if (sid) {
      window.electronAPI.cliAbort(sid)
      // Cancel any pending interactive messages (hook_callback, elicitation)
      const msgs = useChatStore.getState().messages
      msgs.forEach((m) => {
        if (m.role === 'hook_callback' && (m as HookCallbackMessage).decision === 'pending') {
          window.electronAPI.cliCancelRequest({ sessionId: sid, requestId: (m as HookCallbackMessage).requestId })
        }
        if (m.role === 'elicitation' && (m as ElicitationMessage).decision === 'pending') {
          window.electronAPI.cliCancelRequest({ sessionId: sid, requestId: (m as ElicitationMessage).requestId })
        }
      })
      activeBridgeIdRef.current = null
    }
    const chatState = useChatStore.getState()
    chatState.denyPendingPermissions()
    chatState.cancelPendingInteractiveMessages()
    stopStreamingAndReleaseSleep()
  }, [stopStreamingAndReleaseSleep])

  const respondPermission = useCallback((permissionId: string, allowed: boolean) => {
    const bridgeId = activeBridgeIdRef.current
    if (!bridgeId) return
    window.electronAPI.cliRespondPermission({ sessionId: bridgeId, requestId: permissionId, allowed })
    useChatStore.getState().resolvePermission(permissionId, allowed ? 'allowed' : 'denied')
  }, [])

  const respondHookCallback = useCallback((requestId: string, response: Record<string, unknown>) => {
    const bridgeId = activeBridgeIdRef.current
    if (!bridgeId) return
    window.electronAPI.cliRespondHookCallback({ sessionId: bridgeId, requestId, response })
    useChatStore.getState().resolveHookCallback(requestId, response.decision === 'approve' ? 'approved' : 'blocked')
  }, [])

  const respondElicitation = useCallback((requestId: string, result: Record<string, unknown>) => {
    const bridgeId = activeBridgeIdRef.current
    if (!bridgeId) return
    window.electronAPI.cliRespondElicitation({ sessionId: bridgeId, requestId, result })
    const action = result.action as string
    const decision = action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'cancelled'
    useChatStore.getState().resolveElicitation(requestId, decision)
  }, [])

  const grantToolPermission = useCallback(async (permissionId: string, _toolName: string) => {
    respondPermission(permissionId, true)
  }, [respondPermission])

  const alwaysAllowTool = useCallback((toolName: string, toolInput: Record<string, unknown>) => {
    writePermissionRule('allow', toolName, toolInput)
  }, [])

  const alwaysDenyTool = useCallback((toolName: string, toolInput: Record<string, unknown>) => {
    writePermissionRule('deny', toolName, toolInput)
  }, [])

  const newConversation = useCallback(async () => {
    const bridgeId = activeBridgeIdRef.current
    if (bridgeId) {
      window.electronAPI.cliEndSession(bridgeId)
      activeBridgeIdRef.current = null
    }
    useChatStore.getState().denyPendingPermissions()
    useChatStore.getState().clearMessages()
    contextWarningShownRef.current = false
    // A new conversation inherits the currently selected persona. It is stored
    // on the session only: copying it into global prefs is what used to make one
    // conversation's expert leak into every other conversation.
    useChatStore.getState().setSessionPersonaId(usePrefsStore.getState().prefs.activePersonaId)
  }, [])

  // PERF: this effect is registered once and every store action is read through
  // getState() so the listeners are never torn down/re-created. Translations use
  // the module-level getT() accessor rather than capturing a `t` callback.
  useEffect(() => {
    // Live translation accessor — reads the current locale at call time, so the
    // once-registered listener always shows toasts in the active language.
    const t = getT()

    // Request notification permission on mount
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    const unsub = window.electronAPI.onCliEvent(null as unknown as string, (event, data: any) => {
      // Internal turns own no conversation. Drop their events before any
      // handler can touch the store.
      if (isInternalCliEvent(data)) return

      switch (event) {
        case 'cli:assistantText': {
          useChatStore.getState().appendTextDelta(data.sessionId as string, data.text as string)
          break
        }
        case 'cli:thinkingDelta': {
          useChatStore.getState().appendThinkingDelta(data.sessionId as string, data.thinking as string)
          break
        }
        case 'cli:tokenUsageUpdated': {
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
          break
        }
        case 'cli:turnError': {
          // A retrying error is informational — Codex reconnects on its own.
          if (data.willRetry) break
          const message = (data.message as string) || t('error.unknownError')
          useChatStore.getState().addMessage({
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: `⚠️ ${message}`,
            timestamp: Date.now(),
          } as StandardChatMessage)
          const chatState = useChatStore.getState()
          if (chatState.isCompacting) {
            chatState.setCompacting(false)
            chatState.setContextBeforeCompact(null)
            useUiStore.getState().addToast('error', t('compact.failed'))
          }
          stopStreamingAndReleaseSleep()
          break
        }
        case 'cli:planUpdated': {
          // Codex's plan is a living checklist: update the same card instead of
          // appending a new TodoWrite block every time a step changes.
          const planId = (data.planId as string) || `plan-${data.turnId ?? Date.now()}`
          const todos = (Array.isArray(data.plan) ? data.plan as Array<Record<string, unknown>> : [])
            .map(step => ({ content: String(step.content ?? step.step ?? ''), status: step.status ?? 'pending' }))
          if (todos.length === 0) break
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
            break
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
          break
        }
        case 'cli:compacted': {
          const chatState = useChatStore.getState()
          if (chatState.isCompacting) {
            chatState.setCompacting(false)
            chatState.incrementCompactionCount()
            useUiStore.getState().addToast('success', t('compact.complete'))
            chatState.setContextBeforeCompact(null)
          }
          break
        }
        case 'cli:messageEnd': {
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
              break
            }
          }
          stopStreamingAndReleaseSleep()
          // Auto-compact refuses to run while streaming (it would interrupt the
          // turn), so the post-turn check has to happen after the flag clears.
          // Result events arrive before messageEnd, which made the old call in
          // cli:result a no-op.
          const ctx = useChatStore.getState().lastContextUsage
          if (ctx && ctx.total > 0) {
            setTimeout(() => autoCompactRef.current(ctx.used, ctx.total), 0)
          }
          break
        }
        case 'cli:toolUse': {
          const e = data.event as Record<string, unknown>
          // Detect ExitPlanMode — render as plan card instead of tool block
          if (e.name === 'ExitPlanMode') {
            const input = (e.input as Record<string, unknown>) ?? {}
            const planContent = (input.plan as string) || JSON.stringify(input, null, 2)
            useChatStore.getState().addPlanMessage({
              id: `plan-${Date.now()}`,
              role: 'plan',
              planContent,
              decision: 'pending',
              timestamp: Date.now(),
            } as PlanMessage)
            break
          }
          // Track file changes (Iteration 521: code changes view)
          {
            const toolName = e.name as string
            const input = (e.input as Record<string, unknown>) ?? {}
            const filePath = (input.file_path || input.path) as string | undefined
            const isFileModifyingTool =
              /Edit|Write|Create/i.test(toolName) ||
              toolName === 'str_replace_editor' ||
              toolName === 'str_replace_based_edit_tool'
            if (filePath && isFileModifyingTool) {
              useChatStore.getState().addChangedFile(filePath, toolName)
            }
          }
          {
            const chatState = useChatStore.getState()
            let lastMsg = chatState.messages.at(-1)
            // Codex often runs a command before writing any text. Without a
            // streaming assistant message to attach to, the tool call would be
            // dropped; create the placeholder here (text deltas then append to
            // it because it is the last streaming assistant).
            if (!lastMsg || lastMsg.role !== 'assistant' || !(lastMsg as StandardChatMessage).isStreaming) {
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
            chatState.addToolUse(
              lastMsg.id,
              e.id as string,
              e.name as string,
              e.input as Record<string, unknown>
            )
          }
          break
        }
        case 'cli:toolResult': {
          const e = data.event as Record<string, unknown>
          useChatStore.getState().resolveToolUse(
            e.tool_use_id as string,
            e.content,
            Boolean(e.is_error)
          )
          break
        }
        case 'cli:hookEvent': {
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
          break
        }
        case 'cli:result': {
          if (!isResultForActiveConversation(data, activeBridgeIdRef.current)) {
            console.debug('[cli:result] ignored result from another conversation:', data.sessionId)
            break
          }
          // Handle error subtypes before normal result processing
          const resultSubtype = (data.subtype as string | undefined) ?? 'success'
          if (resultSubtype === 'error_max_structured_output_retries') {
            useUiStore.getState().addToast('error', t('error.structuredOutputRetries'), 8000)
            stopStreamingAndReleaseSleep()
            break
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
          break
        }
        case 'cli:error': {
          const errText = (data.error as string) || 'CLI encountered an unknown error'
          // Detect quota/billing exhaustion and auto-rotate API key
          const isQuotaError = /402|billing|credit|quota|rate.limit|overloaded/i.test(errText)
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
                return
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
          break
        }
        case 'cli:processExit':
          useChatStore.getState().denyPendingPermissions()
          useChatStore.getState().cancelPendingInteractiveMessages()
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
          break
        case 'cli:permissionRequest': {
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
          break
        }
        case 'cli:hookCallback': {
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
          break
        }
        case 'cli:elicitation': {
          const d = data as { sessionId: string; requestId: string; serverName: string; message: string; mode?: 'form' | 'url'; url?: string; requestedSchema?: Record<string, unknown> }
          useChatStore.getState().addElicitation({
            id: `elicit-${Date.now()}`,
            role: 'elicitation',
            requestId: d.requestId,
            serverName: d.serverName,
            message: d.message,
            mode: d.mode || 'form',
            url: d.url,
            requestedSchema: d.requestedSchema,
            decision: 'pending',
            timestamp: Date.now(),
          } as ElicitationMessage)
          break
        }
        case 'cli:apiError': {
          // Surface overloaded/auth errors as user-visible toasts
          const d = data as { sessionId: string; errorType: 'overloaded' | 'authentication'; message: string }
          if (d.errorType === 'authentication') {
            useUiStore.getState().addToast('error', `Auth error: ${d.message}`, 8000)
          } else if (d.errorType === 'overloaded') {
            useUiStore.getState().addToast('warning', `API overloaded: ${d.message}`, 6000)
          }
          break
        }
        case 'cli:customTitle': {
          // CLI has auto-generated a session title — update the store and notify user
          const d = data as { sessionId: string; title: string }
          if (d.title && !useChatStore.getState().currentSessionTitle) {
            useChatStore.getState().setSessionTitle(d.title)
            useUiStore.getState().addToast('info', t('session.titleGenerated'), 2000)
          }
          break
        }
        case 'cli:worktreeState': {
          // Worktree state change from CLI — store active worktree info
          const d = data as { sessionId: string; worktreePath: string; branch: string; state: string }
          useChatStore.getState().setActiveWorktree(
            d.worktreePath ? { path: d.worktreePath, branch: d.branch, state: d.state } : null
          )
          break
        }
        case 'cli:taskCompleted': {
          // Background task completed — show toast notification
          const d = data as { sessionId: string; taskId: string; result: unknown }
          const taskId = d.taskId ? ` #${d.taskId.slice(0, 8)}` : ''
          useUiStore.getState().addToast('success', t('task.backgroundCompleted', { id: taskId }), 5000)
          break
        }
      }
    })

    // Listen for multi-agent plan approval requests (P3-3)
    const unsubPlanApproval = window.electronAPI.onPlanApprovalRequest?.((data) => {
      useChatStore.getState().setPendingPlanApproval({
        sessionId: data.sessionId,
        requestId: data.requestId,
        from: data.from,
        planContent: data.planContent,
        planFilePath: data.planFilePath,
      })
    })

    // Listen for provider failover events
    const unsubFailover = window.electronAPI.onProviderFailover((data) => {
      useUiStore.getState().addToast('warning',
        `Failover: ${data.fromProvider} -> ${data.toProvider}. ${data.reason}`
      )
    })

    // Listen for tab-close abort event (Iteration 515)
    const handleAbortStream = () => {
      const sid = activeBridgeIdRef.current
      if (sid) {
        window.electronAPI.cliAbort(sid)
        activeBridgeIdRef.current = null
      }
      useChatStore.getState().denyPendingPermissions()
      stopStreamingAndReleaseSleep()
    }
    window.addEventListener('aipa:abortStream', handleAbortStream)

    // Listen for send-message events dispatched by tool cards (e.g. AskUserQuestionCard) (Iteration 540)
    const handleSendMessage = (e: Event) => {
      const text = (e as CustomEvent<{ text: string }>).detail?.text
      if (text) sendMessageRef.current?.(text)
    }
    window.addEventListener('aipa:sendMessage', handleSendMessage)

    return () => {
      unsub()
      unsubFailover()
      unsubPlanApproval?.()
      window.removeEventListener('aipa:abortStream', handleAbortStream)
      window.removeEventListener('aipa:sendMessage', handleSendMessage)
    }
  }, [stopStreamingAndReleaseSleep])

  return { sendMessage, abort, respondPermission, respondHookCallback, respondElicitation, grantToolPermission, alwaysAllowTool, alwaysDenyTool, newConversation }
}
