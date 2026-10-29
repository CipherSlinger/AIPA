import { useCallback, useEffect, useRef } from 'react'
import { useChatStore, useDepartmentStore, usePrefsStore, useSessionStore } from '../store'
import { ElicitationMessage, HookCallbackMessage, StandardChatMessage } from '../types/app.types'
import { useUiStore } from '../store'
import { getResolvedLocale, getT } from '../i18n'
import { resolveProvider, getActiveApiKey } from './streamJsonUtils'
import { useAutoCompact } from './useAutoCompact'
import { useAutoMemory } from './useAutoMemory'
import { assembleMemoryContextForTurn } from './promptMemory'
import { assembleTurnMemoryForSend, mergeTurnReceipt } from '../lib/memoryReceipt'
import { effortSendField, resolveEffectiveEffort } from '../lib/sessionEffort'
import { buildDeptHandbookTurn } from '../lib/deptHandbook'
import { composeSystemPromptParts, resolvePersonaTurnSettings } from './promptAssembly'
import { buildCodexImageInput, canSendCodexImages } from '../components/chat/imageAttachmentRules'
import { engineNoticeStore } from '../components/chat/engineNoticeStore'
import { autoApprovalReviewStore } from '../components/chat/autoApprovalReviewStore'
import { clearEngineSteps } from '../components/chat/engineStepLog'
// The one answer to "which folder will this turn run in", shared with the
// header, the terminal dock and the open path. A local fallback chain here is
// how those surfaces came to disagree.
import { resolveWorkingDir } from '../lib/workingDir'
// parseTokenBudget used by token display utilities
// import { parseTokenBudget } from '../utils/tokenUtils'
// The once-registered `cli:*` listener was split by topic into ./streamJson/*
// (wave 75C); this file keeps only the turn-boundary state machine. The
// handlers receive the hook's own refs through StreamJsonEventContext, so they
// read exactly the values the old closure read.
import { handleTurnEvent } from './streamJson/turnEvents'
import { handleToolEvent } from './streamJson/toolEvents'
import { handleResultEvent } from './streamJson/resultEvents'
import { handleConversationEvent } from './streamJson/conversationEvents'
import { handleThreadEvent } from './streamJson/threadEvents'
import { subscribeStreamJsonListeners } from './streamJson/subscriptions'
import { isInternalCliEvent } from './streamJson/guards'
import { trackPromptHistory, writePermissionRule } from './streamJson/moduleActions'
import type { StreamJsonEventContext } from './streamJson/eventContext'

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
    // Guidance still marked "sending" when the turn ends can no longer be
    // confirmed: the turn it was addressed to is gone. Say that on the row
    // instead of letting it keep claiming delivery.
    useChatStore.getState().settlePendingGuidance(getT()('chat.steer.turnEnded'))
    // The diff snapshot becomes final here: files the turn itself wrote are
    // "before", not drift. Only a change after this moment can be reported.
    useChatStore.getState().markTurnDiffCaptured(Date.now())
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

    // Cwd for the parts assembled before the send: the same resolver the send
    // itself uses, so a note read for the prompt and the turn that follows it
    // never come from two different folders. No home fallback here — nothing
    // has asked for a folder yet, and inventing one would make the prompt
    // describe work the turn will not do.
    const currentTabForCwd = useChatStore.getState().tabs.find(t => t.id === useChatStore.getState().activeTabId)
    const effectiveCwdEarly = resolveWorkingDir({
      tabCwd: currentTabForCwd?.cwd,
      globalDir: prefs.workingDir,
    }).dir

    // Resolve the persona that belongs to this conversation. The catalogue
    // (`prefs.personas`) is global; the selection is per session, which is what
    // keeps two open conversations from sharing one expert's prompt and model.
    const personaTurn = resolvePersonaTurnSettings(
      prefs,
      useChatStore.getState().sessionPersonaId,
      (key) => getT()(key),
      useChatStore.getState().sessionModelOverride,
    )
    // Effort is per conversation too: the level picked in this conversation
    // wins, and only a conversation without a pick follows the global default.
    // Resolved here, at the turn boundary, for the same reason as the persona:
    // the picker may have moved on since the hook was created.
    const effectiveEffort = resolveEffectiveEffort(
      prefs.effortLevel,
      useChatStore.getState().sessionEffortOverride,
    )

    // Image delivery is decided here, at the turn boundary, from the same
    // engine probe the composer uses. A credentials change between attaching
    // and pressing send must not turn into a silent "sent" claim.
    const routing = await resolveProvider(personaTurn.model)
    const activeEngine = await window.electronAPI.engineGetActive().catch(() => ({ kind: 'none' as const }))
    const imageAttachments = (attachments || []).filter(a => typeof a.path === 'string' && a.path.length > 0)
    const imagesDeliverable = imageAttachments.length > 0 &&
      canSendCodexImages(activeEngine.kind, routing.type)
    const imageNotSentReason = imageAttachments.length > 0 && !imagesDeliverable
      ? (activeEngine.kind === 'codex'
          ? t('chat.imageAttachment.providerUnavailable')
          : t('chat.imageAttachment.codexOnly'))
      : undefined

    // The user's row keeps the thumbnails and the reason they could not be
    // delivered, so the transcript never looks like an image the model saw.
    const userMsg: StandardChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
      attachments: imageAttachments.map(a => ({
        name: a.name,
        path: a.path,
        size: a.size,
        mimeType: a.mimeType,
      })),
      ...(imageNotSentReason ? { attachmentError: imageNotSentReason } : {}),
    }
    useChatStore.getState().addMessage(userMsg)
    useChatStore.getState().setStreaming(true)
    // Deltas can arrive before cliSendMessage resolves with the bridge id;
    // record which conversation this turn belongs to so the store only accepts
    // that bridge's events and drops anything the user has since navigated away
    // from.
    useChatStore.getState().beginTurn()
    // Record which engine owns this turn. The composer may only steer a Codex
    // turn, and it must never infer that from whatever credential the picker
    // shows later: credentials can change while the turn is still running.
    // The provider branch never reaches CodexBridge, whatever the credential
    // probe says, so it is never steerable.
    useChatStore.getState().beginLiveTurn(
      routing.type === 'provider' || activeEngine.kind !== 'codex' ? 'legacy' : 'codex',
    )
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
    if (imageNotSentReason) {
      useUiStore.getState().addToast('warning', t('chat.imageAttachment.notSent', { reason: imageNotSentReason }))
    }

    // `/compact` is intercepted in the main process and its result discarded,
    // so assembling/budgeting every memory tier for it is pure work with no
    // consumer. Checked before assembly because the slash command has to reach
    // the detector verbatim further below.
    const isCompactCommand = /^\/compact\b/.test(prompt.trim())

    // Assemble the persistent memory tiers once per turn (sendMessage is the
    // turn boundary — this code never runs on keystrokes). The result is
    // already budgeted and labelled by tier.
    //
    // Memory is a bonus, never a precondition: a read failure turns into a
    // receipt on the user's row, not into a send that never happened.
    const memoryTurn = isCompactCommand
      ? { text: '', receipt: null }
      : await assembleTurnMemoryForSend({
          assemble: () => assembleMemoryContextForTurn({
            prefs,
            cwd: effectiveCwdEarly,
          }),
        })
    // The department handbook rides in the same envelope, on EVERY turn of a
    // conversation that belongs to a department — not only the first message
    // of one started from that department's roster. Membership is resolved
    // from the user's own org tree (filing → session row's directory → the
    // desk the draft was started at); anything unknown or ambiguous yields no
    // block and no receipt, because silence is the honest answer there.
    //
    // Scheduled / automated runs are deliberately not covered: the main
    // process starts those turns and cannot read this renderer-owned tree, so
    // a job has no honest way to name its department yet. That is a known gap,
    // not an oversight — do not "fix" it by guessing a directory here.
    const deptTurn = isCompactCommand
      ? { text: '', receipt: null }
      : buildDeptHandbookTurn({
          departments: useDepartmentStore.getState().departments,
          filings: useDepartmentStore.getState().filings,
          sessions: useSessionStore.getState().sessions,
          sessionId: currentSessionId,
          draftDepartmentId: useChatStore.getState().draftDepartmentId,
          homeDir: useSessionStore.getState().homeDir,
          locale: getResolvedLocale(),
        })

    // One receipt per turn for both disclosures: the row renders one quiet
    // line, and either half may be absent without hiding the other.
    const turnReceipt = mergeTurnReceipt(memoryTurn.receipt, deptTurn.receipt)
    // The row already exists (added above, before assembly started), so the
    // disclosure lands on the message the user actually wrote rather than on
    // a row that appears once memory finishes loading.
    if (turnReceipt) {
      useChatStore.getState().noteMemoryReceipt(userMsg.id, turnReceipt)
    }

    // Build combined system prompt (injected as prefix to user message: Codex
    // has no --append-system-prompt equivalent).
    const systemPromptParts = composeSystemPromptParts({
      prefs,
      persona: personaTurn,
      memoryContext: memoryTurn.text,
      departmentHandbook: deptTurn.text,
      cwd: effectiveCwdEarly,
      appendSystemPrompt: useChatStore.getState().tempSystemPrompt || prefs.appendSystemPrompt,
    })

    // For Codex: system prompt is prepended to the user message (Codex doesn't have --append-system-prompt)
    // System prompt parts will be prepended to the actual prompt below

    // Build actual prompt — prepend system prompt parts, attach images.
    // Codex accepts structured `UserInput[]`; the legacy Claude bridge receives
    // the plain string. Images only ever travel as `localImage` paths, never as
    // base64, and only when this turn will actually run on Codex.
    let actualPrompt: string
    let codexInput: unknown[] | undefined

    // `/compact` must reach the main process verbatim (it is intercepted there
    // and mapped to thread/compact/start); a prepended system prompt would hide
    // the slash command from the detector. `isCompactCommand` is computed above,
    // before the (skipped) memory assembly.
    // Prepend system context to the user prompt (Codex doesn't support --append-system-prompt)
    const systemPrefix = !isCompactCommand && systemPromptParts.length > 0
      ? systemPromptParts.join('\n\n') + '\n\n'
      : ''

    if (!isCompactCommand && imageAttachments.length > 0 && imagesDeliverable) {
      codexInput = buildCodexImageInput(systemPrefix + prompt, imageAttachments.map(a => a.path))
      actualPrompt = systemPrefix + prompt
    } else if (!isCompactCommand && imageNotSentReason) {
      // Text-only fallback, with the reason in-band so the model does not
      // answer as though it had seen the images.
      actualPrompt = systemPrefix + prompt + `\n\n[${imageNotSentReason}]`
    } else {
      actualPrompt = systemPrefix + prompt
    }

    // Route by the model this conversation's persona selected, not by whatever
    // another conversation last wrote into global prefs.
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
    // One resolver for every surface that names this turn's folder, so the tab
    // badge, the status bar and the spawn directory cannot tell three stories.
    // Home is the last resort and costs an IPC round trip, so it is asked for
    // only when neither the tab nor the preference has an answer.
    const resolvedCwd = resolveWorkingDir({ tabCwd: currentTab?.cwd, globalDir: prefs.workingDir })
    const effectiveCwd = resolvedCwd.source === 'none'
      ? await window.electronAPI.fsGetHome()
      : resolvedCwd.dir
    const sendArgs = (promptText: string, input: unknown[] | undefined) => ({
      prompt: promptText,
      ...(input ? { input } : {}),
      cwd: effectiveCwd,
      sessionId: currentSessionId ?? undefined,
      activeBridgeId: activeBridgeIdRef.current ?? undefined,
      model: personaTurn.model,
      // This conversation's resolved level; 'auto' means "let the engine
      // decide", so it is not sent at all. The main process drops it again if
      // the model that will run does not advertise it.
      ...effortSendField(effectiveEffort),
      env: {
        // Provide both keys — CodexBridge uses OPENAI_API_KEY, legacy StreamBridge uses ANTHROPIC_API_KEY
        ...(getActiveApiKey() ? { OPENAI_API_KEY: getActiveApiKey(), ANTHROPIC_API_KEY: getActiveApiKey() } : {}),
      },
      flags,
      permissionMode: (useChatStore.getState().isPlanMode && prefs.permissionMode !== 'bypassPermissions')
        ? 'plan'
        : (prefs.permissionMode || 'default'),
    })
    let result: { success?: boolean; sessionId?: string; error?: string } | undefined
    try {
      result = await window.electronAPI.cliSendMessage(sendArgs(actualPrompt, codexInput))
    } catch (err) {
      // The bridge never started: the thumbnails must not stay unmarked.
      if (imageAttachments.length > 0) {
        useChatStore.getState().markAttachmentsNotSent(userMsg.id, String(err))
        useUiStore.getState().addToast('error', t('chat.imageAttachment.notSent', { reason: String(err) }))
      }
      // Nothing left the renderer, so the memory block was never delivered.
      useChatStore.getState().clearMemoryReceipt(userMsg.id)
      stopStreamingAndReleaseSleep()
      throw err
    }

    // The protocol accepted `localImage` in every probe so far, but a future
    // app-server may reject the shape. Retry that turn once as text only, and
    // leave the reason on the user's row — never a silent, image-less "success".
    const imageInputRejected = Boolean(
      result && !result.success && codexInput &&
      /turn\/start:.*(invalid params|unknown variant|deserialize|localImage|expected)/i.test(result.error ?? ''),
    )
    if (imageInputRejected) {
      const reason = result?.error || t('error.unknownError')
      useChatStore.getState().markAttachmentsNotSent(userMsg.id, reason)
      useUiStore.getState().addToast('warning', t('chat.imageAttachment.notSent', { reason }))
      try {
        result = await window.electronAPI.cliSendMessage(
          sendArgs(actualPrompt + `\n\n[${reason}]`, undefined),
        )
      } catch (err) {
        useUiStore.getState().addToast('error', String(err))
        useChatStore.getState().clearMemoryReceipt(userMsg.id)
        stopStreamingAndReleaseSleep()
        throw err
      }
    }

    // A rejected `turn/start` means the prompt never reached the model, so the
    // row may not keep claiming it was handed a memory block.
    if (result && !result.success) {
      useChatStore.getState().clearMemoryReceipt(userMsg.id)
    }

    if (result?.success && result.sessionId) {
      activeBridgeIdRef.current = result.sessionId
      // Only this bridge's deltas may enter the streaming buffer.
      useChatStore.getState().setStreamSession(result.sessionId)
    } else if (result && !result.success && imageAttachments.length > 0) {
      // `turn/start` may have rejected the localImage (or the turn failed for
      // another reason). The user's row now carries the truthful reason.
      const reason = result.error || t('error.unknownError')
      useChatStore.getState().markAttachmentsNotSent(userMsg.id, reason)
      useUiStore.getState().addToast('error', t('chat.imageAttachment.notSent', { reason }))
    }

    return result
  }, [stopStreamingAndReleaseSleep])

  // Keep ref in sync so IPC handler can call sendMessage without stale closure
  sendMessageRef.current = sendMessage

  /**
   * Send a message as guidance into the turn that is already running, instead
   * of starting another one. Only `sendMessage` owns a turn's side effects
   * (clearing state, assembling memory, `beginTurn`, `setStreaming`); a steer
   * reuses the live one and must not repeat any of them.
   *
   * The row is written before the request so an engine rejection has somewhere
   * to land. When the promise resolves the request left the renderer — Codex
   * has no "guidance applied" acknowledgement.
   */
  const steerMessage = useCallback(async (prompt: string): Promise<{ ok: boolean; messageId: string }> => {
    const t = getT()
    // Read at call time: the bridge id and the live turn both change during a
    // turn, and this callback must not capture the values from its last render.
    const bridgeId = activeBridgeIdRef.current
    const live = useChatStore.getState().liveTurn
    const turnId = live?.turnId ?? ''
    const messageId = `guidance-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

    trackPromptHistory(prompt)
    useChatStore.getState().addMessage({
      id: messageId,
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
      guidance: { turnId, state: 'sending' },
    } as StandardChatMessage)

    if (!bridgeId || !turnId) {
      // The turn ended between the decision and this call, or the bridge id
      // was never captured. Say so on the row rather than swallowing it.
      useChatStore.getState().settleGuidance(messageId, 'failed', t('chat.steer.noActiveTurn'))
      return { ok: false, messageId }
    }

    try {
      // Naming the expected turn lets the engine itself refuse guidance aimed
      // at a turn that is no longer active (`expected active turn id … but
      // found …`) instead of steering whatever happens to be running.
      const result = await window.electronAPI.cliSteerTurn({ sessionId: bridgeId, prompt, expectedTurnId: turnId })
      if (!result?.success) {
        // The engine's rejection text is the honest reason; it is shown as
        // sent, no cause is invented.
        useChatStore.getState().settleGuidance(
          messageId,
          'failed',
          result?.error || t('chat.steer.noActiveTurn'),
        )
        return { ok: false, messageId }
      }
      // The reply may land after the turn it addressed has ended. Claiming
      // delivery then would be false: the id we steered no longer names a
      // turn, so settle the row as unconfirmed instead of "sent".
      if (useChatStore.getState().liveTurn?.turnId !== turnId) {
        useChatStore.getState().settleGuidance(messageId, 'failed', t('chat.steer.turnEnded'))
        return { ok: false, messageId }
      }
      useChatStore.getState().settleGuidance(messageId, 'sent')
      return { ok: true, messageId }
    } catch (err) {
      useChatStore.getState().settleGuidance(messageId, 'failed', String(err))
      return { ok: false, messageId }
    }
  }, [])

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
    // Interrupting the turn retires any "waiting on you" claim it made.
    chatState.setThreadStatus(null)
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
    // Quiet engine-step rows belong to the transcript being cleared, including
    // the pending bucket of a draft conversation.
    clearEngineSteps(useChatStore.getState().viewSessionId)
    clearEngineSteps(null)
    // Composer notices belong to the conversation that was just cleared.
    engineNoticeStore.reset()
    // Review annotations are attached to cards that are about to disappear.
    autoApprovalReviewStore.clear()
    useChatStore.getState().clearMessages()
    contextWarningShownRef.current = false
    // A new conversation inherits the currently selected persona. It is stored
    // on the session only: copying it into global prefs is what used to make one
    // conversation's expert leak into every other conversation.
    useChatStore.getState().setSessionPersonaId(usePrefsStore.getState().prefs.activePersonaId)
  }, [])

  // Switching conversations swaps the view without going through
  // `newConversation`. Engine warnings/reroutes describe the turn that was on
  // screen, so they must not follow the user into another conversation. This
  // only observes the view id; no store writes happen here.
  useEffect(() => {
    let lastView = useChatStore.getState().viewSessionId
    return useChatStore.subscribe((state) => {
      if (state.viewSessionId === lastView) return
      lastView = state.viewSessionId
      engineNoticeStore.reset()
      autoApprovalReviewStore.clear()
    })
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

    // The listener below is registered once and used to close over this hook's
    // refs and the translator directly. They now travel in one object so the
    // handler code can live in ./streamJson/*; every field is the same ref, so a
    // handler still reads the live value at the moment the event arrives.
    const ctx: StreamJsonEventContext = {
      t,
      activeBridgeIdRef,
      sendMessageRef,
      sendTimestampRef,
      contextWarningShownRef,
      dreamMtimeSnapshotRef,
      autoCompactRef,
      extractMemoriesRef,
      stopStreamingAndReleaseSleep,
    }

    const unsub = window.electronAPI.onCliEvent(null, (event, data: any) => {
      // Internal turns own no conversation. Drop their events before any
      // handler can touch the store.
      if (isInternalCliEvent(data)) return
      // The switch that used to sit here is now one handler per topic under
      // ./streamJson. The groups own disjoint channel sets, so trying them in
      // turn cannot change which branch runs; each handler keeps the guards,
      // comments and store writes of the case it came from. A handler returns
      // true once it has recognised the event, which is this switch's `break`.
      if (handleTurnEvent(event, data, ctx)) return
      if (handleToolEvent(event, data)) return
      if (handleResultEvent(event, data, ctx)) return
      if (handleConversationEvent(event, data, ctx)) return
      handleThreadEvent(event, data, ctx)
    })

    // Plan approval, provider failover and the two window events: the same
    // subscriptions in the same order, behind one cleanup.
    const unsubListeners = subscribeStreamJsonListeners(ctx)

    return () => {
      unsub()
      unsubListeners()
    }
  }, [stopStreamingAndReleaseSleep])

  return { sendMessage, steerMessage, abort, respondPermission, respondHookCallback, respondElicitation, grantToolPermission, alwaysAllowTool, alwaysDenyTool, newConversation }
}
