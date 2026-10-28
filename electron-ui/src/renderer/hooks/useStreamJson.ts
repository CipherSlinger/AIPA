import { useCallback, useEffect, useRef } from 'react'
import { useChatStore, usePrefsStore, useSessionStore } from '../store'
import { CodexQuestion, ElicitationMessage, HookCallbackMessage, PermissionMessage, PlanMessage, StandardChatMessage, PromptHistoryItem, SessionListItem } from '../types/app.types'
import { useUiStore } from '../store'
import { getT } from '../i18n'
import { resolveProvider, sendCompletionNotification, playCompletionSound, getActiveApiKey, rotateApiKey } from './streamJsonUtils'
import { useAutoCompact } from './useAutoCompact'
import { useAutoMemory } from './useAutoMemory'
import { assembleMemoryContextForTurn } from './promptMemory'
import { composeSystemPromptParts, resolvePersonaTurnSettings } from './promptAssembly'
import { listSessionsShared } from '../utils/sessionListShared'
import { readThreadLifecycleEvent } from '../utils/threadLifecycle'
import { readThreadGoalNotice, shouldClearThreadGoal } from '../utils/threadGoal'
import { describeThreadStatus } from '../components/chat/threadStatusText'
import { describeEngineItem, TOOL_CARD_KINDS } from '../components/chat/engineStepText'
import { itemIdFromToolId } from '../components/chat/fileChangePatch'
import { buildCodexImageInput, canSendCodexImages } from '../components/chat/imageAttachmentRules'
import { liveFilePatchStore } from '../components/chat/liveFilePatchStore'
import { engineNoticeStore } from '../components/chat/engineNoticeStore'
import { autoApprovalReviewStore } from '../components/chat/autoApprovalReviewStore'
import {
  adoptEngineStepBucket,
  beginEngineTurn,
  clearEngineSteps,
  recordEngineStep,
} from '../components/chat/engineStepLog'
import {
  describeCodexError,
  looksLikeQuotaText,
  resolveTurnOutcome,
  type CodexErrorAction,
} from '../components/chat/codexErrorText'
import type { CliResultEventData, CliTurnErrorEventData } from '../../preload/index'
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

/**
 * Run the existing app action that a typed Codex error points at. Kept
 * module-level so the event listener can call it without stale closures.
 */
function runCodexErrorAction(action: CodexErrorAction): void {
  if (action === 'compact') {
    const sessionId = useChatStore.getState().currentSessionId
    if (!sessionId) return
    const chatState = useChatStore.getState()
    if (chatState.lastContextUsage) {
      chatState.setContextBeforeCompact({
        used: chatState.lastContextUsage.used,
        total: chatState.lastContextUsage.total,
      })
    }
    chatState.setCompacting(true)
    window.electronAPI.cliSendMessage({ prompt: '/compact', sessionId }).catch(() => {
      const failed = useChatStore.getState()
      failed.setCompacting(false)
      failed.setContextBeforeCompact(null)
      useUiStore.getState().addToast('error', getT()('compact.failed'))
    })
    return
  }
  if (action === 'account') {
    useUiStore.getState().openSettingsAt('ai-engine')
    return
  }
  useUiStore.getState().openSettingsAt('permissions')
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

/**
 * Some Codex item kinds are normally translated by the main process into rich
 * tool cards. If a future bridge stops translating one but still forwards its
 * lifecycle events, the quiet row must not duplicate the card that is already
 * on screen. The item id is the same id the card carries.
 */
function hasToolCardForItem(itemId: string): boolean {
  if (!itemId) return false
  return useChatStore.getState().messages.some(message => {
    const toolUses = (message as StandardChatMessage).toolUses
    return Array.isArray(toolUses) && toolUses.some(tool => tool.id === itemId)
  })
}

/**
 * A multi-file Codex patch opens one card per file (`itemId:0`, `itemId:1`).
 * A live patch names only the parent item id, so accept the family. Patches for
 * an item the transcript does not show are ignored rather than parked in the
 * live store.
 */
function hasToolCardForItemFamily(itemId: string): boolean {
  if (!itemId) return false
  const prefix = `${itemId}:`
  return useChatStore.getState().messages.some(message => {
    const toolUses = (message as StandardChatMessage).toolUses
    return Array.isArray(toolUses)
      && toolUses.some(tool => tool.id === itemId || tool.id.startsWith(prefix))
  })
}

/**
 * Thread-level Codex reports (`thread/settings/updated`) describe the whole
 * conversation, not a turn: they can arrive right after `thread/start`, before
 * any delta exists, so the turn-scoped ownership rule below would drop them.
 * They must still never be applied to another conversation's view: accept only
 * the bridge this composer started, or — when no bridge is live — an event that
 * names the conversation already on screen.
 */
/**
 * Engine notices (warnings / reroutes) are thread-level like the settings
 * report, but they can also arrive during `initialize`, before the send reply
 * has told this hook the bridge id. Accept a thread report, or a bridge the
 * store already considers the owner of the in-flight turn (which covers the
 * brand-new-conversation window). A notice from a turn the user walked away
 * from stays out.
 */
function isNoticeForActiveConversation(data: unknown, activeBridgeId: string | null): boolean {
  if (isThreadReportForActiveConversation(data, activeBridgeId)) return true
  const d = data as { sessionId?: unknown } | null
  const sid = typeof d?.sessionId === 'string' ? d.sessionId : ''
  return !!sid && useChatStore.getState().isOwnedStreamEvent(sid)
}

function isThreadReportForActiveConversation(data: unknown, activeBridgeId: string | null): boolean {
  const d = data as { sessionId?: unknown } | null
  const sid = typeof d?.sessionId === 'string' ? d.sessionId : ''
  if (!sid) return false
  const store = useChatStore.getState()
  const orphan = store.orphanedStream
  if (orphan && sid === orphan.bridgeId) return orphan.visible
  if (activeBridgeId && sid === activeBridgeId) return true
  const current = store.currentSessionId
  // No open conversation: this report belongs to nobody on screen.
  if (!current) return false
  // A brand-new conversation has no session id yet, and `thread/start`'s
  // settings report can arrive before `cliSendMessage` returns the bridge id.
  // The read-only settings are safe to accept in that window; an older
  // conversation's report is not.
  if (current.startsWith('pending-')) return true
  return sid === current
}

/**
 * `sandboxPolicy` is an object in current Codex builds and a plain string in
 * older ones. Keep a short label; the store must never hold protocol internals
 * that the renderer would be tempted to print raw.
 */
function compactSandboxPolicy(value: unknown): string | null {
  if (typeof value === 'string') return value || null
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const kind = record.type ?? record.kind ?? record.mode
    if (typeof kind === 'string' && kind) return kind
  }
  return null
}

function compactString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
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
    const memoryContext = isCompactCommand
      ? null
      : await assembleMemoryContextForTurn({
          prefs,
          cwd: effectiveCwdEarly,
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
    const effectiveCwd = currentTab?.cwd || prefs.workingDir || (await window.electronAPI.fsGetHome())
    const sendArgs = (promptText: string, input: unknown[] | undefined) => ({
      prompt: promptText,
      ...(input ? { input } : {}),
      cwd: effectiveCwd,
      sessionId: currentSessionId ?? undefined,
      activeBridgeId: activeBridgeIdRef.current ?? undefined,
      model: personaTurn.model,
      // Effort is a global preference (no per-session override); 'auto' means
      // "let the engine decide", so it is not sent at all. The main process
      // drops it again if the model that will run does not advertise it.
      ...(prefs.effortLevel && prefs.effortLevel !== 'auto' ? { effort: prefs.effortLevel } : {}),
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
        stopStreamingAndReleaseSleep()
        throw err
      }
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

    const unsub = window.electronAPI.onCliEvent(null, (event, data: any) => {
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
          } as StandardChatMessage)
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
            const toolId = String(e.id ?? '')
            const toolName = String(e.name ?? '')
            const toolInput = (e.input as Record<string, unknown>) ?? {}
            // Codex re-sends a file-change item's input when it completes so
            // the final Edit card carries the authoritative diff (the started
            // event usually had no paths yet). Update the existing card in
            // place; appending would show the same edit twice.
            const alreadyShown = chatState.messages.some(message => {
              if (message.role === 'permission') return false
              const toolUses = (message as StandardChatMessage).toolUses
              return Array.isArray(toolUses) && toolUses.some(tool => tool.id === toolId)
            })
            if (alreadyShown) {
              const pending = new Map(chatState.pendingToolUses)
              if (pending.has(toolId)) pending.set(toolId, { name: toolName, input: toolInput })
              useChatStore.setState({
                messages: chatState.messages.map(message => {
                  if (message.role === 'permission') return message
                  const std = message as StandardChatMessage
                  if (!std.toolUses?.some(tool => tool.id === toolId)) return message
                  return {
                    ...std,
                    toolUses: std.toolUses.map(tool =>
                      tool.id === toolId ? { ...tool, name: toolName, input: toolInput } : tool,
                    ),
                  }
                }),
                pendingToolUses: pending,
              })
            } else {
              chatState.addToolUse(lastMsg.id, toolId, toolName, toolInput)
              // A new card reused this id; a previous review's verdict is not
              // about it. (A re-sent completed item keeps its annotation.)
              autoApprovalReviewStore.beginItem(toolId)
            }
            // Track file changes for the Changes panel (Iteration 521: code
            // changes view). Only on first sight: Codex re-sends a file-change
            // toolUse when the item completes, and `addChangedFile` appends
            // without deduping, so tracking again would list the same file
            // twice in the Changes panel.
            if (!alreadyShown) {
              const filePath = (toolInput.file_path || toolInput.path) as string | undefined
              const isFileModifyingTool =
                /Edit|Write|Create/i.test(toolName) ||
                toolName === 'str_replace_editor' ||
                toolName === 'str_replace_based_edit_tool'
              if (filePath && isFileModifyingTool) {
                useChatStore.getState().addChangedFile(filePath, toolName)
              }
            }
            // A new item may reuse an id from a replayed transcript; forget a
            // previous completion marker so its live snapshots can land.
            liveFilePatchStore.beginItem(itemIdFromToolId(toolId))
          }
          break
        }
        case 'cli:toolResult': {
          const e = data.event as Record<string, unknown>
          // The completed fileChange item is authoritative. Drop the live
          // snapshot and any queued trailing update before resolving the card,
          // so a partial patch can never outlive or overwrite the final diff.
          liveFilePatchStore.completeItem(itemIdFromToolId(String(e.tool_use_id ?? '')))
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
            break
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
          break
        }
        case 'cli:serverRequestResolved': {
          // Codex settled the request itself (auto-resolution, another client,
          // turn cancel). No answer of ours is wanted any more — retire the card.
          const d = data as { requestId?: string }
          if (typeof d.requestId === 'string' && d.requestId) {
            useChatStore.getState().settleServerRequest(d.requestId, 'resolved')
          }
          break
        }
        case 'cli:serverRequestTimedOut': {
          // The bridge rejected the request on timeout; no answer was sent.
          const d = data as { requestId?: string }
          if (typeof d.requestId === 'string' && d.requestId) {
            useChatStore.getState().settleServerRequest(d.requestId, 'expired')
          }
          break
        }
        case 'cli:messageStart': {
          // `turn/started` from Codex. A new turn owns the transcript now, so
          // the previous turn's aggregate diff must not sit under its answer.
          const sid = typeof data.sessionId === 'string' ? data.sessionId : ''
          if (sid && useChatStore.getState().isOwnedStreamEvent(sid)) {
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
          break
        }
        case 'cli:itemStarted':
        case 'cli:itemCompleted': {
          // `codex-bridge` translates the item kinds the rich cards understand
          // and forwards the rest verbatim on these channels. Before this case
          // existed, those items vanished and a stretch of the turn looked like
          // it did nothing. The ownership rule is the same as for deltas: a
          // background or other-tab turn must not paint this transcript.
          const sid = typeof data.sessionId === 'string' ? data.sessionId : ''
          if (!sid || !useChatStore.getState().isOwnedStreamEvent(sid)) break
          const phase = event === 'cli:itemStarted' ? 'started' as const : 'completed' as const
          // An item that finished before its review did has no card left for
          // an in-progress line; a completed verdict stays.
          if (phase === 'completed') {
            const item = (data as { item?: { id?: unknown } }).item
            const completedId = typeof item?.id === 'string' ? item.id : ''
            if (completedId) autoApprovalReviewStore.completeItem(completedId)
          }
          const step = describeEngineItem(phase, data)
          if (!step) break
          // A quiet row is only for steps without a visible card; if the same
          // item already has one, adding a row would show the step twice.
          if (TOOL_CARD_KINDS.has(step.kind) && hasToolCardForItem(step.id)) break
          recordEngineStep(useChatStore.getState().viewSessionId, step)
          break
        }
        case 'cli:patchUpdated': {
          // A live snapshot of the file change Codex is still writing. Same
          // ownership rule as every other turn-scoped event: a background or
          // other-tab turn must not paint this transcript. Patches whose item
          // has no visible card are dropped by the store's caller; the card's
          // own completion event remains authoritative.
          const sid = typeof data.sessionId === 'string' ? data.sessionId : ''
          if (!sid || !useChatStore.getState().isOwnedStreamEvent(sid)) break
          const itemId = typeof data.itemId === 'string' ? data.itemId : ''
          if (!itemId || !hasToolCardForItemFamily(itemId)) break
          liveFilePatchStore.ingest(data)
          break
        }
        case 'cli:turnDiffUpdated': {
          // Codex's own aggregate patch for the turn — it includes changes made
          // by shell commands, which the per-tool cards cannot show. It belongs
          // to a turn, so the deltas' ownership rule applies: only the bridge
          // this composer started may paint this view.
          const sid = typeof data.sessionId === 'string' ? data.sessionId : ''
          if (!useChatStore.getState().isOwnedStreamEvent(sid)) break
          const diff = typeof data.diff === 'string' ? data.diff : ''
          if (!diff) break
          useChatStore.getState().setTurnDiff({
            sessionId: sid,
            threadId: compactString(data.threadId),
            turnId: compactString(data.turnId),
            diff,
            truncated: data.truncated === true,
          })
          break
        }
        case 'cli:threadNameUpdated': {
          // `thread/name/updated` fires for a rename made by any client — the
          // Codex CLI included — so the sidebar can follow it without waiting
          // for the next list reload. The bridge's `sessionId` is a bridge id;
          // the payload's `threadId` is the list row id (see threadLifecycle).
          const lifecycle = readThreadLifecycleEvent('rename', data)
          if (!lifecycle || lifecycle.kind !== 'rename') break
          useSessionStore.getState().applyThreadLifecycle(lifecycle)
          // The open header follows its own conversation even if the list has
          // not seen this thread yet (a brand-new thread is not listed until
          // its first result). `setSessionTitleFor` only paints the matching
          // view/tab, so a rename elsewhere leaves this transcript alone.
          useChatStore.getState().setSessionTitleFor(lifecycle.threadId, lifecycle.name)
          break
        }
        case 'cli:threadArchived':
        case 'cli:threadDeleted': {
          // A thread archived/deleted anywhere leaves the sidebar: both remove
          // the row. Deliberately do NOT clear the transcript the user is
          // reading — the honest minimum is to drop the stale row and leave
          // what is on screen intact. Continuing that conversation later fails
          // through the bridge's existing error path, not a fabricated one.
          const kind = event === 'cli:threadArchived' ? 'archive' as const : 'delete' as const
          const lifecycle = readThreadLifecycleEvent(kind, data)
          if (lifecycle) useSessionStore.getState().applyThreadLifecycle(lifecycle)
          break
        }
        case 'cli:threadUnarchived': {
          // The inverse of archive. `ThreadUnarchivedNotification` carries only
          // `threadId` — no title, cwd or timestamp — so the row cannot be
          // rebuilt from the event alone. Re-read the index and restore just
          // that one row; `restoreThreadRow` refuses an id that is already
          // listed (no duplicates) or that this window saw deleted (a late
          // unarchive cannot resurrect the user's delete).
          const lifecycle = readThreadLifecycleEvent('unarchive', data)
          if (!lifecycle || lifecycle.kind !== 'unarchive') break
          void listSessionsShared().then((list) => {
            if (!list) return
            const row = (list as SessionListItem[]).find(item => item.sessionId === lifecycle.threadId)
            if (row) useSessionStore.getState().restoreThreadRow(row)
          })
          break
        }
        case 'cli:threadStatusChanged': {
          // `thread/status/changed`, reduced to a composer chip. This is a
          // thread-level report, so it uses the same ownership rule as the
          // settings report: only the bridge this composer started (or the
          // pending conversation) may paint it. Malformed payloads and unknown
          // variants map to `hidden`, which clears the chip instead of guessing.
          if (!isThreadReportForActiveConversation(data, activeBridgeIdRef.current)) break
          const chip = describeThreadStatus(data)
          useChatStore.getState().setThreadStatus(chip.kind === 'hidden' ? null : chip)
          break
        }
        case 'cli:threadStarted': {
          // `thread/started`: the conversation moved to a different thread, so
          // the previous thread's "waiting on you" claim is no longer about
          // what is on screen. A goal belongs to a thread too: retire the line
          // when the report names another thread, and leave a same-thread
          // start (a resume) alone.
          if (!isThreadReportForActiveConversation(data, activeBridgeIdRef.current)) break
          useChatStore.getState().setThreadStatus(null)
          const startedThreadId = (data as { threadId?: unknown } | null)?.threadId
          const goal = useChatStore.getState().threadGoal
          if (goal && typeof startedThreadId === 'string' && startedThreadId && startedThreadId !== goal.threadId) {
            useChatStore.getState().setThreadGoal(null)
          }
          break
        }
        case 'cli:threadSettingsUpdated': {
          // The settings the thread is actually running with. Reported, never
          // applied: writing `prefs.model` from here would silently change what
          // the next turn sends.
          if (!isThreadReportForActiveConversation(data, activeBridgeIdRef.current)) break
          const settings = (data.settings ?? {}) as Record<string, unknown>
          useChatStore.getState().setThreadSettings({
            model: compactString(settings.model),
            modelProvider: compactString(settings.modelProvider),
            approvalPolicy: compactString(settings.approvalPolicy),
            effort: compactString(settings.effort),
            sandboxPolicy: compactSandboxPolicy(settings.sandboxPolicy),
          })
          break
        }
        case 'cli:threadGoalUpdated': {
          // A standing objective, not a turn delta. Same ownership rule as the
          // settings report: only the thread on screen may paint the strip.
          // `readThreadGoalNotice` is the validator — a malformed payload or an
          // unknown status leaves the current line untouched.
          if (!isThreadReportForActiveConversation(data, activeBridgeIdRef.current)) break
          const goal = readThreadGoalNotice(data)
          if (goal) useChatStore.getState().setThreadGoal(goal)
          break
        }
        case 'cli:threadGoalCleared': {
          // `ThreadGoalClearedNotification` names only its thread. Clear only
          // when it is the goal currently on screen; a cleared event for a
          // different thread (or a malformed one) must not retire this line.
          if (!isThreadReportForActiveConversation(data, activeBridgeIdRef.current)) break
          const clearedThreadId = (data as { threadId?: unknown } | null)?.threadId
          if (shouldClearThreadGoal(useChatStore.getState().threadGoal, clearedThreadId)) {
            useChatStore.getState().setThreadGoal(null)
          }
          break
        }
        case 'cli:engineWarning': {
          // The engine's own sentence. Warnings are thread-level, not turn
          // deltas: `configWarning` can arrive during initialize, before
          // `turn/started`. The store dedupes identical text, caps the stack
          // and keeps a dismissal until the turn ends; the text itself is
          // rendered verbatim, with no severity or cause invented here.
          // `kind: 'worldWritable'` rides this same channel and keeps the
          // engine's path list verbatim.
          if (!isNoticeForActiveConversation(data, activeBridgeIdRef.current)) break
          engineNoticeStore.pushWarning(data)
          break
        }
        case 'cli:sandboxSetupCompleted': {
          // App-level lifecycle. Success is deliberately silent (the channel
          // itself is the low-key record); a failure is specific: the setup
          // mode the engine named and its own error text. Never a generic
          // "sandbox unavailable" claim.
          if (!isNoticeForActiveConversation(data, activeBridgeIdRef.current)) break
          engineNoticeStore.pushSandboxSetupFailure(data)
          break
        }
        case 'cli:autoApprovalReview': {
          // A reviewer's verdict is only meaningful when the item it names is
          // already on screen. Checking the card first is what prevents a
          // phantom row; the store itself never renders anything.
          const sid = typeof data.sessionId === 'string' ? data.sessionId : ''
          if (!sid || !useChatStore.getState().isOwnedStreamEvent(sid)) break
          const targetItemId = typeof data.targetItemId === 'string' ? data.targetItemId : ''
          if (!targetItemId || !hasToolCardForItemFamily(targetItemId)) break
          autoApprovalReviewStore.ingest(data)
          break
        }
        case 'cli:modelRerouted': {
          // The picker named one model and the engine ran another. Keep both
          // ids in the strip until the next turn starts, so the mismatch is
          // visible rather than quietly hidden.
          if (!isNoticeForActiveConversation(data, activeBridgeIdRef.current)) break
          engineNoticeStore.setReroute(data)
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
