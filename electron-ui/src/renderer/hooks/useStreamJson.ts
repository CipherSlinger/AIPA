import { useEffect, useRef } from 'react'
import { useChatStore, usePrefsStore } from '../store'
import { PermissionMessage, StandardChatMessage } from '../types/app.types'

export function useStreamJson() {
  const {
    appendTextDelta, addToolUse, resolveToolUse, setStreaming, setSessionId,
    addPermissionRequest, resolvePermission, denyPendingPermissions,
  } = useChatStore()
  const { prefs } = usePrefsStore()

  const activeBridgeIdRef = useRef<string | null>(null)

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
      flags: ['--dangerously-skip-permissions'],
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
          appendTextDelta(data.sessionId as string, data.text as string)
          break
        case 'cli:messageEnd':
          setStreaming(false)
          break
        case 'cli:toolUse': {
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
          const resultText = ((data.event as Record<string, unknown>)?.result as string) || ''
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

  return { sendMessage, abort, respondPermission, newConversation }
}
