import { useEffect } from 'react'
import { useChatStore, usePrefsStore } from '../store'

export function useStreamJson() {
  const { appendTextDelta, addToolUse, resolveToolUse, setStreaming, setSessionId } = useChatStore()
  const { prefs } = usePrefsStore()

  const sendMessage = async (prompt: string) => {
    if (!prompt.trim()) return

    const userMsg = {
      id: `user-${Date.now()}`,
      role: 'user' as const,
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
      model: prefs.model,
      env: {
        ...(prefs.apiKey ? { ANTHROPIC_API_KEY: prefs.apiKey } : {}),
      },
      flags: [
        ...(prefs.skipPermissions ? ['--dangerously-skip-permissions'] : []),
        ...(prefs.verbose ? ['--verbose'] : []),
      ],
    })

    return result
  }

  const abort = () => {
    const sid = useChatStore.getState().currentSessionId
    if (sid) window.electronAPI.cliAbort(sid)
    setStreaming(false)
  }

  useEffect(() => {
    // Pass null so onCliEvent accepts events from any sessionId
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
          // Capture the real Claude session ID for future resume
          const claudeSessionId = data.claudeSessionId as string | undefined
          if (claudeSessionId) setSessionId(claudeSessionId)
          // Fallback: if no assistant message was added via streaming, show result text
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
              })
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
          })
          setStreaming(false)
          break
        }
        case 'cli:processExit':
          setStreaming(false)
          break
      }
    })

    return unsub
  }, [])

  return { sendMessage, abort }
}
