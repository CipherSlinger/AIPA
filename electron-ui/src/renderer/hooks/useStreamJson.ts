import { useCallback, useEffect, useRef } from 'react'
import { useChatStore, useDepartmentStore, usePrefsStore, useSessionStore, useTaskStore } from '../store'
import { ElicitationMessage, HookCallbackMessage, StandardChatMessage } from '../types/app.types'
import { useUiStore } from '../store'
import { getResolvedLocale, getT } from '../i18n'
import { getActiveApiKey, getActiveKeyEntry } from './streamJsonUtils'
import { useAutoCompact } from './useAutoCompact'
import { useAutoMemory } from './useAutoMemory'
import { assembleMemoryContextForTurn } from './promptMemory'
import { assembleTurnMemoryForSend, mergeTurnReceipt } from '../lib/memoryReceipt'
import { effortSendField, resolveEffectiveEffort } from '../lib/sessionEffort'
import { buildDeptHandbookTurn, resolveDepartmentMembership } from '../lib/deptHandbook'
import { composeSystemPromptParts, resolvePersonaTurnSettings } from './promptAssembly'
import { buildCodexImageInput, canSendCodexImages } from '../components/chat/imageAttachmentRules'
import { engineNoticeStore } from '../components/chat/engineNoticeStore'
import { autoApprovalReviewStore } from '../components/chat/autoApprovalReviewStore'
import { clearEngineSteps } from '../components/chat/engineStepLog'
import { findReplayableUserMessage, isTurnErrorRow } from '../components/chat/turnRetry'
import { noteTaskTurnStarted } from '../lib/taskDispatch'
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
  // A task tab owns its bridge, because the hook's single ref describes the
  // last turn sent from any conversation. Without this, dispatching a task
  // after using chat elsewhere could attach the task's first turn to the
  // previous conversation's thread. The narrow selectors keep ad-hoc tabs on
  // the existing ref-only behaviour.
  const activeTaskTabId = useChatStore(s => {
    const tab = s.tabs.find(item => item.id === s.activeTabId)
    return tab?.task ? tab.id : null
  })
  const activeTaskTabBridgeId = useChatStore(s => {
    const tab = s.tabs.find(item => item.id === s.activeTabId)
    return tab?.task ? tab.bridgeId ?? null : null
  })
  useEffect(() => {
    if (!activeTaskTabId) return
    activeBridgeIdRef.current = activeTaskTabBridgeId
  }, [activeTaskTabId, activeTaskTabBridgeId])
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

  /**
   * `options.appendUserMessage === false` sends the turn without writing a new
   * user row. Retry uses it: the prompt it resends already sits in the
   * transcript, and appending it again would look like the user had typed it a
   * second time. Every other side effect of a send (streaming state, sleep
   * lock, `beginTurn`, task bookkeeping, tab bridge ownership) is unchanged —
   * a retry must be an ordinary turn in every respect except its missing echo.
   */
  const sendMessage = useCallback(async (prompt: string, attachments?: import('./useImagePaste').ImageAttachment[], fileAttachments?: import('./useImagePaste').FileAttachment[], options?: { appendUserMessage?: boolean }) => {
    if (!prompt.trim() && (!attachments || attachments.length === 0) && (!fileAttachments || fileAttachments.length === 0)) return
    const appendUserMessage = options?.appendUserMessage !== false

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

    // The task, if any, whose conversation is being sent. Its routed department
    // is the one that owns the handbook and the default persona; a task routed
    // nowhere deliberately answers `null` so the legacy folder join cannot
    // claim the conversation.
    const activeTask = currentTabForCwd?.task
      ? useTaskStore.getState().tasks.find(task => task.id === currentTabForCwd.task?.taskId)
      : undefined
    const taskDepartmentId = activeTask ? activeTask.departmentId : undefined

    // Resolve the persona that belongs to this conversation. The catalogue
    // (`prefs.personas`) is global; the selection is per session, which is what
    // keeps two open conversations from sharing one expert's prompt and model.
    // A task with no explicit persona runs as its department's default, the
    // same rule the department page shows when a seat is hired.
    const membership = resolveDepartmentMembership({
      departments: useDepartmentStore.getState().departments,
      filings: useDepartmentStore.getState().filings,
      sessions: useSessionStore.getState().sessions,
      sessionId: currentSessionId,
      draftDepartmentId: useChatStore.getState().draftDepartmentId,
      homeDir: useSessionStore.getState().homeDir,
      taskDepartmentId,
    })
    const personaId = useChatStore.getState().sessionPersonaId
      ?? (activeTask && membership.kind === 'found' ? membership.dept.defaultPersonaId : undefined)
    const personaTurn = resolvePersonaTurnSettings(
      prefs,
      personaId,
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
    const activeEngine = await window.electronAPI.engineGetActive().catch(() => ({ kind: 'none' as const }))
    const imageAttachments = (attachments || []).filter(a => typeof a.path === 'string' && a.path.length > 0)
    const imagesDeliverable = imageAttachments.length > 0 &&
      canSendCodexImages(activeEngine.kind)
    const imageNotSentReason = imageAttachments.length > 0 && !imagesDeliverable
      ? t('chat.imageAttachment.codexOnly')
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
    // A retry answers the prompt that is already in the transcript, so its row
    // is deliberately not added again. Receipt writes below address this id and
    // are harmless no-ops when the row was not written.
    if (appendUserMessage) useChatStore.getState().addMessage(userMsg)
    useChatStore.getState().setStreaming(true)
    // Deltas can arrive before cliSendMessage resolves with the bridge id;
    // record which conversation this turn belongs to so the store only accepts
    // that bridge's events and drops anything the user has since navigated away
    // from.
    useChatStore.getState().beginTurn()
    // Record which engine owns this turn. The composer may only steer a Codex
    // turn, and it must never infer that from whatever credential the picker
    // shows later: credentials can change while the turn is still running.
    useChatStore.getState().beginLiveTurn(activeEngine.kind === 'codex' ? 'codex' : 'legacy')
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
          taskDepartmentId,
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
    const sendArgs = (promptText: string, input: unknown[] | undefined) => {
      // Resolve the key and its endpoint once: both belong to the same pool
      // entry, and reading the store per field could split them across an edit
      // made while this turn was being assembled.
      const activeKey = getActiveApiKey()
      const activeBaseUrl = getActiveKeyEntry()?.baseUrl?.trim()
      return {
        prompt: promptText,
        ...(input ? { input } : {}),
        cwd: effectiveCwd,
        sessionId: currentSessionId ?? undefined,
        // A task tab may only reuse the bridge it owns, and only while it is
        // still showing that conversation. The hook-wide ref still describes
        // whichever conversation sent last (or one the user just left); after
        // "new conversation" (Ctrl+N) the tab keeps its folder but has no
        // current session, so it must not inherit the old bridge. Ad-hoc tabs
        // are unchanged.
        activeBridgeId: currentTab?.task
          ? (currentSessionId && currentTab.sessionId === currentSessionId
              ? currentTab.bridgeId
              : undefined)
          : activeBridgeIdRef.current ?? undefined,
        model: personaTurn.model,
        // This conversation's resolved level; 'auto' means "let the engine
        // decide", so it is not sent at all. The main process drops it again if
        // the model that will run does not advertise it.
        ...effortSendField(effectiveEffort),
        env: {
          // Provide both keys — CodexBridge uses OPENAI_API_KEY, legacy StreamBridge uses ANTHROPIC_API_KEY
          ...(activeKey ? { OPENAI_API_KEY: activeKey, ANTHROPIC_API_KEY: activeKey } : {}),
          // The key's own endpoint must travel with the key, or a relay key
          // would be sent to the official host. An empty value is deliberately
          // omitted: the child env allowlist already passes through an
          // ANTHROPIC_BASE_URL the user exported, and sending '' would override
          // it with nothing.
          //
          // Both names carry the same value because the two sanitizers each
          // pass only their own variable — Codex keeps OPENAI_BASE_URL, the
          // Claude bridge keeps ANTHROPIC_BASE_URL. One relay base URL can
          // therefore serve either flavour of endpoint without the engines
          // seeing a variable meant for the other.
          ...(activeKey && activeBaseUrl
            ? { ANTHROPIC_BASE_URL: activeBaseUrl, OPENAI_BASE_URL: activeBaseUrl }
            : {}),
        },
        flags,
        permissionMode: (useChatStore.getState().isPlanMode && prefs.permissionMode !== 'bypassPermissions')
          ? 'plan'
          : (prefs.permissionMode || 'default'),
      }
    }
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
      // Keep the tab's own bridge in step with the turn that just started, so a
      // follow-up in this task conversation reuses it while a follow-up task
      // dispatch (a new tab with no bridge) starts clean.
      if (currentTab?.task) {
        useChatStore.getState().setTabBridgeId(currentTab.id, result.sessionId)
      }
      // Only this bridge's deltas may enter the streaming buffer.
      useChatStore.getState().setStreamSession(result.sessionId)
    } else if (result && !result.success && imageAttachments.length > 0) {
      // `turn/start` may have rejected the localImage (or the turn failed for
      // another reason). The user's row now carries the truthful reason.
      const reason = result.error || t('error.unknownError')
      useChatStore.getState().markAttachmentsNotSent(userMsg.id, reason)
      useUiStore.getState().addToast('error', t('chat.imageAttachment.notSent', { reason }))
    }

    // A turn that really started is what lifts a queued task into "in progress":
    // the board should describe work that began without the user keeping two
    // places in step. A refused send changes nothing, and the helper never
    // reports a bookkeeping failure over the turn itself.
    if (result?.success && activeTask) noteTaskTurnStarted(activeTask.id)
  }, [stopStreamingAndReleaseSleep])

  // Keep ref in sync so IPC handler can call sendMessage without stale closure
  sendMessageRef.current = sendMessage

  /**
   * Resend the prompt behind a `cli:turnError` row as a brand-new turn, through
   * the ordinary send path, without adding a second copy of the user's row.
   *
   * The caller names the error row it rendered. A click can land after the view
   * moved to another tab, so the id is checked against the transcript that is
   * live *now*: Retry in tab A must never resend tab B's prompt. Only text is
   * replayable from a transcript; a prompt that carried images or files is
   * offered no button at all (see `turnRetry.ts`), and this repeats the check
   * for callers that bypass the component.
   */
  const retryLastTurn = useCallback(async (errorMessageId: string): Promise<boolean> => {
    const state = useChatStore.getState()
    // The send path would refuse while a turn is streaming; do not queue.
    if (state.isStreaming) return false
    const last = state.messages[state.messages.length - 1]
    if (!last || last.id !== errorMessageId || !isTurnErrorRow(last)) return false
    const user = findReplayableUserMessage(state.messages)
    if (!user) return false
    if ((user.attachments?.length ?? 0) > 0 || (user.fileAttachments?.length ?? 0) > 0) return false
    const text = user.content
    if (!text || !text.trim()) return false
    // Retire the offer before the send. If the retried turn is stopped before
    // it emits anything, the old failure's button must not come back.
    state.setTurnErrorActive(errorMessageId, false)
    try {
      await sendMessage(text, undefined, undefined, { appendUserMessage: false })
      return true
    } catch {
      // Nothing left the renderer, so the offer was never answered.
      useChatStore.getState().setTurnErrorActive(errorMessageId, true)
      return false
    }
  }, [sendMessage])

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

    // Plan approval and the two window events: the same subscriptions in the
    // same order, behind one cleanup.
    const unsubListeners = subscribeStreamJsonListeners(ctx)

    return () => {
      unsub()
      unsubListeners()
    }
  }, [stopStreamingAndReleaseSleep])

  return { sendMessage, retryLastTurn, steerMessage, abort, respondPermission, respondHookCallback, respondElicitation, grantToolPermission, alwaysAllowTool, alwaysDenyTool, newConversation }
}
