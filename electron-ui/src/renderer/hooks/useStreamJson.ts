import { useEffect, useRef } from 'react'
import { useChatStore, usePrefsStore } from '../store'
import { PermissionMessage, StandardChatMessage } from '../types/app.types'

export function useStreamJson() {
  const {
    appendTextDelta, appendThinkingDelta, addToolUse, resolveToolUse, setStreaming, setSessionId,
    addPermissionRequest, resolvePermission, denyPendingPermissions, setLastUsage,
  } = useChatStore()
  const { prefs } = usePrefsStore()

  const activeBridgeIdRef = useRef<string | null>(null)
  // When a permission error is pending, suppress Claude's follow-up explanation
  const pendingPermissionRef = useRef(false)

  const sendMessage = async (prompt: string) => {
    if (!prompt.trim()) return

    const userMsg: StandardChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
    }
    useChatStore.getState().addMessage(userMsg)
    setStreaming(true)

    const currentSessionId = useChatStore.getState().currentSessionId

    const result = await window.electronAPI.cliSendMessage({
      prompt,
      cwd: prefs.workingDir || (await window.electronAPI.fsGetHome()),
      sessionId: currentSessionId,
      activeBridgeId: activeBridgeIdRef.current ?? undefined,
      model: prefs.model,
      env: {
        ...(prefs.apiKey ? { ANTHROPIC_API_KEY: prefs.apiKey } : {}),
      },
      flags: [],
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
    pendingPermissionRef.current = false
    denyPendingPermissions()
    setStreaming(false)
  }

  const respondPermission = (permissionId: string, allowed: boolean) => {
    pendingPermissionRef.current = false
    const bridgeId = activeBridgeIdRef.current
    if (!bridgeId) return
    window.electronAPI.cliRespondPermission({ sessionId: bridgeId, requestId: permissionId, allowed })
    resolvePermission(permissionId, allowed ? 'allowed' : 'denied')
  }

  const grantToolPermission = async (permissionId: string, toolName: string) => {
    pendingPermissionRef.current = false
    await window.electronAPI.configAddToolPermission(toolName)
    resolvePermission(permissionId, 'allowed')
    await sendMessage(`权限已授予：${toolName}，请继续。`)
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
    const unsub = window.electronAPI.onCliEvent(null as unknown as string, (event, data: any) => {
      switch (event) {
        case 'cli:assistantText':
          if (!pendingPermissionRef.current) {
            appendTextDelta(data.sessionId as string, data.text as string)
          }
          break
        case 'cli:thinkingDelta':
          if (!pendingPermissionRef.current) {
            appendThinkingDelta(data.sessionId as string, data.thinking as string)
          }
          break
        case 'cli:messageEnd':
          // Always stop the streaming indicator, but don't render suppressed content
          setStreaming(false)
          break
        case 'cli:toolUse': {
          if (pendingPermissionRef.current) break
          const e = data.event as Record<string, unknown>
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
          // Suppress result text if we're waiting for permission response
          if (!pendingPermissionRef.current) {
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
        case 'cli:permissionError': {
          pendingPermissionRef.current = true
          const d = data as { sessionId: string; toolUseId: string; toolName: string; toolInput: Record<string, unknown>; message: string }
          useChatStore.getState().addPermissionRequest({
            id: `perm-${Date.now()}`,
            role: 'permission',
            permissionId: d.toolUseId,
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
