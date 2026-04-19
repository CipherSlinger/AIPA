import { useEffect, useRef } from 'react'
import { useChatStore, usePrefsStore, useSessionStore } from '../store'
import { ElicitationMessage, HookCallbackMessage, PermissionMessage, PlanMessage, StandardChatMessage, PromptHistoryItem } from '../types/app.types'
import { useUiStore } from '../store'
import { useT } from '../i18n'
import { resolveProvider, sendCompletionNotification, playCompletionSound, getActiveApiKey, rotateApiKey } from './streamJsonUtils'
import { useAutoCompact } from './useAutoCompact'
import { useAutoMemory } from './useAutoMemory'
import { parseTokenBudget } from '../utils/tokenUtils'

export function useStreamJson() {
  // Use individual selectors so this hook only re-renders when the specific
  // action references change (they never do in Zustand), not on every state update.
  const appendTextDelta = useChatStore(s => s.appendTextDelta)
  const appendThinkingDelta = useChatStore(s => s.appendThinkingDelta)
  const addToolUse = useChatStore(s => s.addToolUse)
  const resolveToolUse = useChatStore(s => s.resolveToolUse)
  const setStreaming = useChatStore(s => s.setStreaming)
  const setSessionId = useChatStore(s => s.setSessionId)
  const addPermissionRequest = useChatStore(s => s.addPermissionRequest)
  const resolvePermission = useChatStore(s => s.resolvePermission)
  const denyPendingPermissions = useChatStore(s => s.denyPendingPermissions)
  const addHookCallback = useChatStore(s => s.addHookCallback)
  const resolveHookCallback = useChatStore(s => s.resolveHookCallback)
  const addElicitation = useChatStore(s => s.addElicitation)
  const resolveElicitation = useChatStore(s => s.resolveElicitation)
  const cancelPendingInteractiveMessages = useChatStore(s => s.cancelPendingInteractiveMessages)
  const setLastUsage = useChatStore(s => s.setLastUsage)
  const addPlanMessage = useChatStore(s => s.addPlanMessage)
  const setLastCost = useChatStore(s => s.setLastCost)
  const setLastContextUsage = useChatStore(s => s.setLastContextUsage)
  const setSessionTitle = useChatStore(s => s.setSessionTitle)
  const setLastResultUuid = useChatStore(s => s.setLastResultUuid)
  const setFastModeState = useChatStore(s => s.setFastModeState)
  const prefs = usePrefsStore(s => s.prefs)
  const activeTabId = useChatStore(s => s.activeTabId)
  const tabs = useChatStore(s => s.tabs)
  const t = useT()
  const { tryAutoCompact } = useAutoCompact()
  const { tryExtractMemories } = useAutoMemory()

  const activeBridgeIdRef = useRef<string | null>(null)
  // Keep a ref to sendMessage so it can be called from the IPC event handler without stale closure
  const sendMessageRef = useRef<((prompt: string) => Promise<unknown>) | null>(null)
  // Track when the user sends a message to calculate response duration
  const sendTimestampRef = useRef<number>(0)
  // Only warn once per session about context window nearing capacity
  const contextWarningShownRef = useRef<boolean>(false)
  // Snapshot of .consolidate-lock mtime at session start — used to detect dream completions
  const dreamMtimeSnapshotRef = useRef<number>(0)

  // Track prompt sends for analytics (deduped, max 200 items)
  const trackPromptHistory = (prompt: string) => {
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

  const sendMessage = async (prompt: string, attachments?: import('./useImagePaste').ImageAttachment[], fileAttachments?: import('./useImagePaste').FileAttachment[]) => {
    if (!prompt.trim() && (!attachments || attachments.length === 0) && (!fileAttachments || fileAttachments.length === 0)) return

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
    setStreaming(true)
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
    if (prefs.thinkingLevel === 'adaptive') {
      flags.push('--thinking', 'adaptive')
    }
    // Extended thinking toggle (Iteration 378): pass --thinking-budget when enabled
    if (prefs.extendedThinking) {
      flags.push('--thinking-budget', '10000')
    }

    // Build combined system prompt: user system prompt + output style + memory context
    const systemPromptParts: string[] = []

    // Inject system presence: date, time, working directory, user name
    if (prefs.systemPresence !== false) {
      const now = new Date()
      const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown'
      const presenceParts = [`Current date: ${dateStr}`, `Current time: ${timeStr} (${tz})`]
      if (effectiveCwdEarly) {
        presenceParts.push(`Working directory: ${effectiveCwdEarly}`)
      } else if (prefs.workingDir) {
        presenceParts.push(`Working directory: ${prefs.workingDir}`)
      }
      if (prefs.displayName) {
        presenceParts.push(`User name: ${prefs.displayName}`)
      }
      systemPromptParts.push(`<system_context>\n${presenceParts.join('\n')}\n</system_context>`)
    }

    if (prefs.systemPrompt?.trim()) {
      systemPromptParts.push(prefs.systemPrompt.trim())
    }

    // Inject output style modifier (Iteration 378: replaces responseTone)
    if (prefs.outputStyle && prefs.outputStyle !== 'default') {
      const stylePrompts: Record<string, string> = {
        explanatory: `You are in Explanatory mode. After providing your main response, add an "Insight" callout block that explains the reasoning behind key decisions or provides deeper context. Format:

> **Insight**: [Your explanatory insight here]

Use this to help the user understand WHY something works a certain way, not just WHAT to do. Add 1-2 insight blocks per response when there are meaningful decision points to explain.`,
        learning: `You are in Step-by-Step Learning mode. Break down complex topics into clear, numbered steps. After explaining a concept, add a "Practice" block that challenges the user to try something:

> **Practice**: [A small exercise or challenge related to what was just explained]

Keep exercises focused and achievable. The goal is active learning through doing, not passive reading.`,
      }
      const stylePrompt = stylePrompts[prefs.outputStyle]
      if (stylePrompt) {
        systemPromptParts.push(`<output_style>\n${stylePrompt}\n</output_style>`)
      }
    }

    // Inject effort level via CLI --effort flag (replaces system prompt hack)
    if (prefs.effortLevel && prefs.effortLevel !== 'auto') {
      flags.push('--effort', prefs.effortLevel)
    }

    // Inject persistent memories as context
    const memories = prefs.memories || []
    if (memories.length > 0) {
      const pinnedMemories = memories.filter(m => m.pinned)
      const recentMemories = memories
        .filter(m => !m.pinned)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 10) // max 10 non-pinned recent memories
      const allInjected = [...pinnedMemories, ...recentMemories]
      if (allInjected.length > 0) {
        const categoryLabels: Record<string, string> = {
          preference: 'Preference',
          fact: 'Fact',
          instruction: 'Instruction',
          context: 'Context',
        }
        const memoryLines = allInjected.map(m =>
          `- [${categoryLabels[m.category] || m.category}]${m.pinned ? ' (pinned)' : ''} ${m.content}`
        )
        systemPromptParts.push(
          `\n<user_memory>\nThe user has saved the following memories. Use them to personalize your responses:\n${memoryLines.join('\n')}\n</user_memory>`
        )
      }
    }

    // Inject custom append-system-prompt (Iteration 523)
    // tempSystemPrompt (per-session) overrides the persistent appendSystemPrompt pref
    const effectiveAppend = useChatStore.getState().tempSystemPrompt || prefs.appendSystemPrompt
    if (effectiveAppend?.trim()) {
      systemPromptParts.push(effectiveAppend.trim())
    }

    if (systemPromptParts.length > 0) {
      flags.push('--append-system-prompt', systemPromptParts.join('\n\n'))
    }

    // Inject disallowed tools (Iteration 527: tool access control)
    if (prefs.disallowedTools && prefs.disallowedTools.length > 0) {
      flags.push('--disallowedTools', prefs.disallowedTools.join(','))
    }

    if (prefs.maxTurns && prefs.maxTurns > 0) {
      flags.push('--max-turns', String(prefs.maxTurns))
    }
    if (prefs.maxBudgetUsd && prefs.maxBudgetUsd > 0) {
      flags.push('--max-budget-usd', String(prefs.maxBudgetUsd))
    }

    // Token budget shorthand parsing (#10): detect "+500k" / "use 2M tokens" in the prompt
    // Inspired by Claude Code's utils/tokenBudget.ts
    const tokenBudgetPattern = /(?:use\s+[\d.]+\s*[km]?\s*tokens?|[+][\d.]+\s*[km])/gi
    const budgetMatch = prompt.match(tokenBudgetPattern)
    if (budgetMatch) {
      const tokens = parseTokenBudget(budgetMatch[0])
      if (tokens && tokens >= 1000) {
        flags.push('--max-tokens', String(tokens))
      }
    }

    // Build actual prompt — if images or non-text file attachments present, encode as JSON content array
    let actualPrompt: string
    const hasImageAttachments = attachments && attachments.length > 0
    // Binary file attachments (PDF, images via file dialog with dataUrl) that need document/image blocks
    const binaryFileBlocks = (fileAttachments || []).filter(f => f.dataUrl && f.mimeType)
    const hasBinaryBlocks = binaryFileBlocks.length > 0
    if (hasImageAttachments || hasBinaryBlocks) {
      const contentBlocks: unknown[] = [{ type: 'text', text: prompt }]
      // Image paste attachments → image blocks
      for (const img of (attachments || [])) {
        const base64 = img.dataUrl.split(',')[1] // strip data:image/png;base64,
        contentBlocks.push({
          type: 'image',
          source: { type: 'base64', media_type: img.mimeType, data: base64 },
        })
      }
      // Binary file attachments (e.g. PDF, images from file dialog) → document or image blocks
      for (const file of binaryFileBlocks) {
        const base64 = file.dataUrl!.split(',')[1]
        if (file.isImage) {
          contentBlocks.push({
            type: 'image',
            source: { type: 'base64', media_type: file.mimeType, data: base64 },
          })
        } else {
          // PDFs and other binary docs → document block
          contentBlocks.push({
            type: 'document',
            source: { type: 'base64', media_type: file.mimeType, data: base64 },
          })
        }
      }
      actualPrompt = JSON.stringify(contentBlocks)  // stream-bridge will parse back to array
    } else {
      actualPrompt = prompt
    }

    // Route to appropriate provider based on model
    const routing = await resolveProvider(prefs.model)

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

      const result = await window.electronAPI.providerSendMessage({
        prompt: actualPrompt,
        model: prefs.model || 'gpt-4o',
        systemPrompt,
        messages: contextMessages,
        images: attachments?.map(a => a.dataUrl),
        maxTokens: 4096,
        temperature: 0.7,
      })

      if (result?.success && result.sessionId) {
        activeBridgeIdRef.current = result.sessionId
      }

      return result
    }

    // Claude CLI provider: use existing cliSendMessage
    // Determine effective cwd: per-tab override takes priority over global prefs
    const currentTab = tabs.find(t => t.id === activeTabId)
    const effectiveCwd = currentTab?.cwd || prefs.workingDir || (await window.electronAPI.fsGetHome())
    const result = await window.electronAPI.cliSendMessage({
      prompt: actualPrompt,
      cwd: effectiveCwd,
      sessionId: currentSessionId,
      activeBridgeId: activeBridgeIdRef.current ?? undefined,
      model: prefs.model,
      env: {
        ...(getActiveApiKey() ? { ANTHROPIC_API_KEY: getActiveApiKey() } : {}),
      },
      flags,
      // When Plan Mode is active via the toolbar toggle, override permissionMode to 'plan'
      // so the CLI starts with --permission-mode plan (planning only, no execution).
      // Exception: if the user has explicitly chosen bypassPermissions, respect that override.
      permissionMode: (useChatStore.getState().isPlanMode && prefs.permissionMode !== 'bypassPermissions')
        ? 'plan'
        : (prefs.permissionMode || 'default'),
    })

    if (result?.success && result.sessionId) {
      activeBridgeIdRef.current = result.sessionId
    }

    return result
  }

  // Keep ref in sync so IPC handler can call sendMessage without stale closure
  sendMessageRef.current = sendMessage

  // Helper: stop streaming + release prevent-sleep
  const stopStreamingAndReleaseSleep = () => {
    setStreaming(false)
    if (window.electronAPI?.windowPreventSleep) {
      window.electronAPI.windowPreventSleep(false)
    }
  }

  const abort = () => {
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
    denyPendingPermissions()
    cancelPendingInteractiveMessages()
    stopStreamingAndReleaseSleep()
  }

  const respondPermission = (permissionId: string, allowed: boolean) => {
    const bridgeId = activeBridgeIdRef.current
    if (!bridgeId) return
    window.electronAPI.cliRespondPermission({ sessionId: bridgeId, requestId: permissionId, allowed })
    resolvePermission(permissionId, allowed ? 'allowed' : 'denied')
  }

  const respondHookCallback = (requestId: string, response: Record<string, unknown>) => {
    const bridgeId = activeBridgeIdRef.current
    if (!bridgeId) return
    window.electronAPI.cliRespondHookCallback({ sessionId: bridgeId, requestId, response })
    resolveHookCallback(requestId, response.decision === 'approve' ? 'approved' : 'blocked')
  }

  const respondElicitation = (requestId: string, result: Record<string, unknown>) => {
    const bridgeId = activeBridgeIdRef.current
    if (!bridgeId) return
    window.electronAPI.cliRespondElicitation({ sessionId: bridgeId, requestId, result })
    const action = result.action as string
    const decision = action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'cancelled'
    resolveElicitation(requestId, decision)
  }

  const grantToolPermission = async (permissionId: string, _toolName: string) => {
    respondPermission(permissionId, true)
  }

  // Build a CLI permission rule string from tool name + input
  const buildPermissionRule = (toolName: string, toolInput: Record<string, unknown>): string => {
    if ((toolName === 'Bash' || toolName === 'computer') && toolInput.command) {
      const cmd = String(toolInput.command).trim()
      const firstWord = cmd.split(/\s+/)[0]
      if (firstWord) return `Bash(${firstWord} *)`
    }
    return toolName
  }

  // Write a permanent allow/deny rule to ~/.claude/settings.json
  const writePermissionRule = async (type: 'allow' | 'deny', toolName: string, toolInput: Record<string, unknown>) => {
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
      const toastMsg = type === 'allow'
        ? t('permission.ruleAddedAllow', { rule })
        : t('permission.ruleAddedDeny', { rule })
      useUiStore.getState().addToast('success', toastMsg)
    } catch {
      useUiStore.getState().addToast('warning', t('permissions.saveFailed'))
    }
  }

  const alwaysAllowTool = (toolName: string, toolInput: Record<string, unknown>) => {
    writePermissionRule('allow', toolName, toolInput)
  }

  const alwaysDenyTool = (toolName: string, toolInput: Record<string, unknown>) => {
    writePermissionRule('deny', toolName, toolInput)
  }

  const newConversation = async () => {
    const bridgeId = activeBridgeIdRef.current
    if (bridgeId) {
      window.electronAPI.cliEndSession(bridgeId)
      activeBridgeIdRef.current = null
    }
    denyPendingPermissions()
    useChatStore.getState().clearMessages()
    contextWarningShownRef.current = false
    // Auto-apply default persona for new sessions (Iteration 407)
    const defaultPersonaId = usePrefsStore.getState().prefs.activePersonaId
    if (defaultPersonaId) {
      const personas = usePrefsStore.getState().prefs.personas || []
      const persona = personas.find(p => p.id === defaultPersonaId)
      if (persona) {
        useChatStore.getState().setSessionPersonaId(defaultPersonaId)
        const resolvedPrompt = persona.presetKey ? t(`persona.presetPrompt.${persona.presetKey}`) : persona.systemPrompt
        usePrefsStore.getState().setPrefs({ model: persona.model, systemPrompt: resolvedPrompt, outputStyle: persona.outputStyle || 'default' })
        window.electronAPI.prefsSet('model', persona.model)
        window.electronAPI.prefsSet('systemPrompt', resolvedPrompt)
        window.electronAPI.prefsSet('outputStyle', persona.outputStyle || 'default')
      }
    }
  }

  useEffect(() => {
    // Request notification permission on mount
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    const unsub = window.electronAPI.onCliEvent(null as unknown as string, (event, data: any) => {
      switch (event) {
        case 'cli:assistantText': {
          appendTextDelta(data.sessionId as string, data.text as string)
          break
        }
        case 'cli:thinkingDelta': {
          appendThinkingDelta(data.sessionId as string, data.thinking as string)
          break
        }
        case 'cli:messageEnd':
          stopStreamingAndReleaseSleep()
          break
        case 'cli:toolUse': {
          const e = data.event as Record<string, unknown>
          // Detect ExitPlanMode — render as plan card instead of tool block
          if (e.name === 'ExitPlanMode') {
            const input = (e.input as Record<string, unknown>) ?? {}
            const planContent = (input.plan as string) || JSON.stringify(input, null, 2)
            addPlanMessage({
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
          const lastMsg = useChatStore.getState().messages.at(-1)
          if (lastMsg && lastMsg.role === 'assistant') {
            useChatStore.getState().addToolUse(
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
          resolveToolUse(
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
            setSessionId(claudeSessionId)
            // Refresh session list so the pending placeholder is replaced with the real session
            window.electronAPI.sessionList().then((list: any) => {
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
          setLastResultUuid((data.uuid as string | undefined) ?? null)
          setFastModeState((data.fastModeState as string | undefined) ?? null)
          const ev = data.event as Record<string, unknown>
          // Compact diff toast: when result metadata indicates compaction happened
          const metadata = ev?.metadata as Record<string, unknown> | undefined
          if (metadata?.compacted === true) {
            const msgCountAfter = useChatStore.getState().messages.length
            useUiStore.getState().addToast('success',
              t('compact.contextDiff', { before: String(msgCountBefore), after: String(msgCountAfter) })
            )
          }
          const usage = ev?.usage as Record<string, number> | undefined
          if (usage) {
            setLastUsage({
              inputTokens: (usage.input_tokens ?? 0),
              outputTokens: (usage.output_tokens ?? 0),
              cacheTokens: (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
            })
          }
          // cost (with per-model breakdown)
          const costUsd = ev?.total_cost_usd as number | undefined
          const currentModel = prefs.model || 'claude-sonnet-4-6'
          const turnUsage = usage ? {
            inputTokens: usage.input_tokens ?? 0,
            outputTokens: usage.output_tokens ?? 0,
            cacheTokens: (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
          } : undefined
          setLastCost(costUsd ?? null, currentModel, turnUsage)

          // context window usage
          if (usage?.context_window && usage.context_window > 0) {
            setLastContextUsage({ used: usage.input_tokens ?? 0, total: usage.context_window })
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
            tryAutoCompact(usage.input_tokens ?? 0, usage.context_window)

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
          sendCompletionNotification('AIPA', resultText || t('chat.responseComplete'))
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
            window.electronAPI.sessionGenerateTitle(firstUserPrompt).then((title: string) => {
              if (title) {
                window.electronAPI.sessionRename(claudeSessionId, title)
                // Update the session title in the store for toolbar display
                setSessionTitle(title)
                useUiStore.getState().addToast('info', t('session.titleGenerated'), 2000)
                // Refresh session list in sidebar to show the new title
                window.electronAPI.sessionList().then((list: any) => {
                  if (list) {
                    useSessionStore.getState().setSessions(list)
                  }
                }).catch(() => {})
              }
            }).catch(() => {})
          }

          // Auto-extract memories from conversation
          tryExtractMemories()

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
              sendCompletionNotification('AIPA', t('taskQueue.queueComplete', { count: String(doneCount) }))
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
          denyPendingPermissions()
          cancelPendingInteractiveMessages()
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
          addHookCallback({
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
          addElicitation({
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
  }, [])

  return { sendMessage, abort, respondPermission, respondHookCallback, respondElicitation, grantToolPermission, alwaysAllowTool, alwaysDenyTool, newConversation }
}
