import { useEffect, useRef } from 'react'
import { useChatStore, usePrefsStore, useSessionStore } from '../store'
import { PermissionMessage, PlanMessage, StandardChatMessage } from '../types/app.types'
import { useUiStore } from '../store'

function sendCompletionNotification(summary: string) {
  if (document.hasFocus()) return  // Don't notify when window is focused
  if (!('Notification' in window)) return
  if (Notification.permission === 'granted') {
    new Notification('Claude Finished', { body: summary.slice(0, 100), icon: '' })
  } else if (Notification.permission === 'default') {
    Notification.requestPermission().then(perm => {
      if (perm === 'granted') {
        new Notification('Claude Finished', { body: summary.slice(0, 100) })
      }
    })
  }
}

/** Play a subtle completion chime using Web Audio API */
function playCompletionSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    // Two-tone chime: C5 then E5
    osc.type = 'sine'
    osc.frequency.setValueAtTime(523.25, ctx.currentTime)       // C5
    osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.12) // E5
    gain.gain.setValueAtTime(0.08, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)

    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.35)
    osc.onended = () => ctx.close()
  } catch {
    // Audio not available (e.g., no audio output device)
  }
}

export function useStreamJson() {
  const {
    appendTextDelta, appendThinkingDelta, addToolUse, resolveToolUse, setStreaming, setSessionId,
    addPermissionRequest, resolvePermission, denyPendingPermissions, setLastUsage, addPlanMessage,
    setLastCost, setLastContextUsage, setSessionTitle,
  } = useChatStore()
  const { prefs } = usePrefsStore()

  const activeBridgeIdRef = useRef<string | null>(null)
  // Keep a ref to sendMessage so it can be called from the IPC event handler without stale closure
  const sendMessageRef = useRef<((prompt: string) => Promise<unknown>) | null>(null)

  const sendMessage = async (prompt: string, attachments?: import('./useImagePaste').ImageAttachment[]) => {
    if (!prompt.trim() && (!attachments || attachments.length === 0)) return

    const userMsg: StandardChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
      attachments: attachments?.map(a => ({ name: a.name, dataUrl: a.dataUrl })),
    }
    useChatStore.getState().addMessage(userMsg)
    setStreaming(true)

    const currentSessionId = useChatStore.getState().currentSessionId

    const flags: string[] = []
    if (prefs.thinkingLevel === 'adaptive') {
      flags.push('--thinking', 'adaptive')
    }
    if (prefs.systemPrompt?.trim()) {
      flags.push('--append-system-prompt', prefs.systemPrompt.trim())
    }
    if (prefs.maxTurns && prefs.maxTurns > 0) {
      flags.push('--max-turns', String(prefs.maxTurns))
    }
    if (prefs.maxBudgetUsd && prefs.maxBudgetUsd > 0) {
      flags.push('--max-budget-usd', String(prefs.maxBudgetUsd))
    }

    // Build actual prompt — if images attached, encode as JSON content array
    let actualPrompt: string
    if (attachments && attachments.length > 0) {
      const contentBlocks: unknown[] = [{ type: 'text', text: prompt }]
      for (const img of attachments) {
        const base64 = img.dataUrl.split(',')[1] // strip data:image/png;base64,
        contentBlocks.push({
          type: 'image',
          source: { type: 'base64', media_type: img.mimeType, data: base64 },
        })
      }
      actualPrompt = JSON.stringify(contentBlocks)  // stream-bridge will parse back to array
    } else {
      actualPrompt = prompt
    }

    const result = await window.electronAPI.cliSendMessage({
      prompt: actualPrompt,
      cwd: prefs.workingDir || (await window.electronAPI.fsGetHome()),
      sessionId: currentSessionId,
      activeBridgeId: activeBridgeIdRef.current ?? undefined,
      model: prefs.model,
      env: {
        ...(prefs.apiKey ? { ANTHROPIC_API_KEY: prefs.apiKey } : {}),
      },
      flags,
    })

    if (result?.success && result.sessionId) {
      activeBridgeIdRef.current = result.sessionId
    }

    return result
  }

  // Keep ref in sync so IPC handler can call sendMessage without stale closure
  sendMessageRef.current = sendMessage

  const abort = () => {
    const sid = activeBridgeIdRef.current
    if (sid) {
      window.electronAPI.cliAbort(sid)
      activeBridgeIdRef.current = null
    }
    denyPendingPermissions()
    setStreaming(false)
  }

  const respondPermission = (permissionId: string, allowed: boolean) => {
    const bridgeId = activeBridgeIdRef.current
    if (!bridgeId) return
    window.electronAPI.cliRespondPermission({ sessionId: bridgeId, requestId: permissionId, allowed })
    resolvePermission(permissionId, allowed ? 'allowed' : 'denied')
  }

  const grantToolPermission = async (permissionId: string, _toolName: string) => {
    respondPermission(permissionId, true)
  }

  const newConversation = async () => {
    const bridgeId = activeBridgeIdRef.current
    if (bridgeId) {
      window.electronAPI.cliEndSession(bridgeId)
      activeBridgeIdRef.current = null
    }
    denyPendingPermissions()
    useChatStore.getState().clearMessages()
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
          setStreaming(false)
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
        case 'cli:result': {
          const claudeSessionId = data.claudeSessionId as string | undefined
          if (claudeSessionId) setSessionId(claudeSessionId)
          const ev = data.event as Record<string, unknown>
          const usage = ev?.usage as Record<string, number> | undefined
          if (usage) {
            setLastUsage({
              inputTokens: (usage.input_tokens ?? 0),
              outputTokens: (usage.output_tokens ?? 0),
              cacheTokens: (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
            })
          }
          // cost
          const costUsd = ev?.total_cost_usd as number | undefined
          setLastCost(costUsd ?? null)

          // context window usage
          if (usage?.context_window && usage.context_window > 0) {
            setLastContextUsage({ used: usage.input_tokens ?? 0, total: usage.context_window })
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
          sendCompletionNotification(resultText || 'Conversation complete')
          // Sound notification
          if (usePrefsStore.getState().prefs.notifySound !== false) {
            playCompletionSound()
          }
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
                // Refresh session list in sidebar to show the new title
                window.electronAPI.sessionList().then((list: any) => {
                  if (list) {
                    useSessionStore.getState().setSessions(list)
                  }
                }).catch(() => {})
              }
            }).catch(() => {})
          }

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
              useUiStore.getState().addToast('success', `Queue complete: ${doneCount} task${doneCount > 1 ? 's' : ''} finished`)
            }
            // Auto-send next if not paused
            if (!queueState.queuePaused) {
              const nextItem = useChatStore.getState().shiftQueue()
              if (nextItem) {
                setTimeout(() => {
                  sendMessageRef.current?.(nextItem.content)
                }, 600)
              }
            }
          }
          break
        }
        case 'cli:error': {
          const errText = (data.error as string) || 'CLI encountered an unknown error'
          useChatStore.getState().addMessage({
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: `⚠️ ${errText}`,
            timestamp: Date.now(),
          } as StandardChatMessage)
          setStreaming(false)
          break
        }
        case 'cli:processExit':
          denyPendingPermissions()
          activeBridgeIdRef.current = null
          setStreaming(false)
          break
        case 'cli:permissionRequest': {
          const d = data as { sessionId: string; requestId: string; toolName: string; toolInput: Record<string, unknown> }
          useChatStore.getState().addPermissionRequest({
            id: `perm-${Date.now()}`,
            role: 'permission',
            permissionId: d.requestId,
            toolName: d.toolName,
            toolInput: d.toolInput,
            decision: 'pending',
            timestamp: Date.now(),
          } as PermissionMessage)
          break
        }
      }
    })

    return unsub
  }, [])

  return { sendMessage, abort, respondPermission, grantToolPermission, newConversation }
}
