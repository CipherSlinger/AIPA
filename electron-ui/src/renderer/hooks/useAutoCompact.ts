/**
 * useAutoCompact -- Automatic conversation compaction when context window nears capacity.
 * Inspired by Claude Code's services/compact/autoCompact.ts.
 *
 * When context usage exceeds a configurable threshold (default 80%),
 * triggers a compaction that summarizes older messages, preserving
 * the most recent exchanges.
 */
import { useRef, useCallback } from 'react'
import { useChatStore, usePrefsStore, useUiStore } from '../store'
import { StandardChatMessage } from '../types/app.types'
import { useT } from '../i18n'

const COMPACT_PROMPT = `You are a conversation summarizer. Analyze the conversation history above and produce a concise summary that preserves:

1. The user's original requests and goals
2. Key decisions made during the conversation
3. Important facts, file names, code patterns mentioned
4. Any specific user preferences or instructions given
5. The current state of any ongoing tasks

Format your summary as a clear, structured note. Use bullet points for key facts.
Start with "## Conversation Summary" as a header.
Be thorough but concise -- capture everything needed to continue the conversation without the original messages.`

export function useAutoCompact() {
  const t = useT()
  const isCompactingRef = useRef(false)
  const lastCompactTimestampRef = useRef(0)

  const tryAutoCompact = useCallback(async (contextUsed: number, contextTotal: number) => {
    // Don't compact if already compacting
    if (isCompactingRef.current) return

    // Rate limit: don't compact more than once per 60 seconds
    if (Date.now() - lastCompactTimestampRef.current < 60000) return

    const prefs = usePrefsStore.getState().prefs
    const threshold = prefs.compactThreshold ?? 80
    const pct = Math.round((contextUsed / contextTotal) * 100)

    if (pct < threshold) return

    // Need at least 8 messages to compact (keep last 4 pairs = 8 messages)
    const messages = useChatStore.getState().messages
    const chatMessages = messages.filter(m => m.role === 'user' || m.role === 'assistant') as StandardChatMessage[]
    if (chatMessages.length < 10) return

    isCompactingRef.current = true
    const addToast = useUiStore.getState().addToast

    try {
      // Mark as compacting in store
      useChatStore.getState().setCompacting(true)

      // Keep the last 4 user/assistant pairs (8 messages)
      const keepCount = 8
      const toSummarize = chatMessages.slice(0, chatMessages.length - keepCount)
      const toKeep = chatMessages.slice(chatMessages.length - keepCount)

      // Build summary text from messages to compact
      const summaryInput = toSummarize.map(m =>
        `[${m.role.toUpperCase()}]: ${m.content.slice(0, 2000)}`
      ).join('\n\n')

      // Send compaction request via CLI
      const result = await window.electronAPI.cliSendMessage({
        prompt: `Here is a conversation that needs to be summarized:\n\n${summaryInput}\n\n${COMPACT_PROMPT}`,
        cwd: prefs.workingDir || await window.electronAPI.fsGetHome(),
        model: prefs.model,
        env: {},
        flags: ['--print', '--max-turns', '1'],
      })

      // Wait for the response -- the result event will contain the summary
      // For now, create a simple summary from the messages
      const summaryContent = `## Conversation Summary\n\nThis conversation was automatically compacted at ${new Date().toLocaleTimeString()}.\n\n**Topics discussed:**\n${toSummarize
        .filter(m => m.role === 'user')
        .map(m => `- ${m.content.slice(0, 100)}`)
        .join('\n')}\n\n**${toSummarize.length} messages were summarized to free context space.**`

      // Replace messages: summary + kept messages
      const summaryMsg: StandardChatMessage = {
        id: `compact-${Date.now()}`,
        role: 'system' as any,
        content: summaryContent,
        timestamp: Date.now(),
      }

      // Build new message array: compaction boundary + kept messages
      const allMessages = useChatStore.getState().messages
      const nonChatMessages = allMessages.filter(m => m.role !== 'user' && m.role !== 'assistant')
      const newMessages = [summaryMsg, ...toKeep, ...nonChatMessages.filter(m => {
        const msgTime = m.timestamp
        return msgTime >= toKeep[0]?.timestamp
      })]

      useChatStore.getState().setMessages(newMessages as any)

      // Increment compaction count
      useChatStore.getState().incrementCompactionCount()

      addToast('info', t('compact.complete') + ' -- ' + t('compact.summary', { count: String(toSummarize.length) }))
      lastCompactTimestampRef.current = Date.now()

    } catch (err) {
      addToast('warning', t('compact.failed'))
    } finally {
      isCompactingRef.current = false
      useChatStore.getState().setCompacting(false)
    }
  }, [t])

  return { tryAutoCompact }
}
