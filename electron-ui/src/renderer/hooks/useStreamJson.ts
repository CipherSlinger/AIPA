import { useEffect, useRef } from 'react'
import { useChatStore, usePrefsStore } from '../store'
import { PermissionMessage, PlanMessage, StandardChatMessage } from '../types/app.types'

function sendCompletionNotification(summary: string) {
  if (document.hasFocus()) return  // 窗口在前台不通知
  if (!('Notification' in window)) return
  if (Notification.permission === 'granted') {
    new Notification('Claude 已完成', { body: summary.slice(0, 100), icon: '' })
  } else if (Notification.permission === 'default') {
    Notification.requestPermission().then(perm => {
      if (perm === 'granted') {
        new Notification('Claude 已完成', { body: summary.slice(0, 100) })
      }
    })
  }
}

export function useStreamJson() {
  const {
    appendTextDelta, appendThinkingDelta, addToolUse, resolveToolUse, setStreaming, setSessionId,
    addPermissionRequest, resolvePermission, denyPendingPermissions, setLastUsage, addPlanMessage,
    setLastCost, setLastContextUsage,
  } = useChatStore()
  const { prefs } = usePrefsStore()

  const activeBridgeIdRef = useRef<string | null>(null)

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
        case 'cli:assistantText':
          appendTextDelta(data.sessionId as string, data.text as string)
          break
        case 'cli:thinkingDelta':
          appendThinkingDelta(data.sessionId as string, data.thinking as string)
          break
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
          sendCompletionNotification(resultText || '对话已完成')
          // Auto-generate session title after first assistant response
          const msgs = useChatStore.getState().messages
          const userMsgs = msgs.filter(m => m.role === 'user')
          const firstUserPrompt = (userMsgs[0] as StandardChatMessage)?.content || ''
          if (userMsgs.length === 1 && firstUserPrompt && claudeSessionId) {
            window.electronAPI.sessionGenerateTitle(firstUserPrompt).then((title: string) => {
              if (title) {
                window.electronAPI.sessionRename(claudeSessionId, title)
              }
            }).catch(() => {})
          }
          break
        }
        case 'cli:error': {
          const errText = (data.error as string) || 'CLI 发生未知错误'
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
