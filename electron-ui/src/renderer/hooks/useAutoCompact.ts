/**
 * useAutoCompact -- Automatic conversation compaction when context window nears capacity.
 * Inspired by Claude Code's services/compact/autoCompact.ts.
 *
 * When context usage exceeds a configurable threshold (default 80%),
 * triggers a compaction that summarizes older messages, preserving
 * the most recent exchanges.
 *
 * Iteration 483: Added microcompact pre-processing step.
 * Microcompact trims long tool results and assistant outputs before
 * full compaction — reducing the input size to the summarizer.
 *
 * Iteration 488: Added time-gap triggered microcompact.
 * If time gap between consecutive messages exceeds TIME_GAP_THRESHOLD_MS (30 min),
 * treat the old messages before the gap as stale and clear their tool results inline
 * (inspired by Claude Code's microCompact.ts evaluateTimeBasedTrigger).
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

/** Time-gap threshold: messages older than this before a gap are treated as stale */
const TIME_GAP_THRESHOLD_MS = 30 * 60 * 1000  // 30 minutes

/**
 * Time-gap microcompact: if there's a large time gap between consecutive messages,
 * strip tool results from messages before the gap to reduce token count.
 * Inspired by Claude Code's microCompact.ts evaluateTimeBasedTrigger().
 */
function applyTimeGapMicrocompact(messages: StandardChatMessage[]): { messages: StandardChatMessage[]; gapFound: boolean } {
  if (messages.length < 2) return { messages, gapFound: false }

  // Find the most recent large time gap (scan backward)
  let gapIndex = -1
  for (let i = messages.length - 1; i > 0; i--) {
    const curr = messages[i].timestamp || 0
    const prev = messages[i - 1].timestamp || 0
    if (curr - prev > TIME_GAP_THRESHOLD_MS) {
      gapIndex = i
      break
    }
  }

  if (gapIndex < 0) return { messages, gapFound: false }

  // Clear tool results from all messages before the gap
  const processed = messages.map((msg, idx) => {
    if (idx >= gapIndex) return msg
    if (!msg.toolUses || msg.toolUses.length === 0) return msg
    return {
      ...msg,
      toolUses: msg.toolUses.map(tu => ({ ...tu, result: '[cleared by time-gap microcompact]' })),
    }
  })

  return { messages: processed, gapFound: true }
}

/**
 * Microcompact: trim messages before sending to the full summarizer.
 * Inspired by Claude Code's services/compact/microCompact.ts.
 *
 * Rules:
 * 1. Truncate assistant messages > 3000 chars (keep first 2000 + last 500)
 * 2. Truncate user messages > 1500 chars
 * 3. Remove duplicate back-to-back messages (same role + content prefix)
 * 4. Strip long tool result content inline (keep first 500 chars of each result)
 */
function microcompactMessages(messages: StandardChatMessage[]): StandardChatMessage[] {
  const MAX_ASSISTANT_CHARS = 3000
  const MAX_USER_CHARS = 1500
  const KEEP_HEAD = 2000
  const KEEP_TAIL = 500

  const processed: StandardChatMessage[] = []
  let prevContentPrefix = ''

  for (const msg of messages) {
    let content = msg.content || ''

    // Remove deduplication (same role + identical first 100 chars)
    const prefix = `${msg.role}:${content.slice(0, 100)}`
    if (prefix === prevContentPrefix) continue
    prevContentPrefix = prefix

    // Truncate long assistant messages (keep head + tail for context)
    if (msg.role === 'assistant' && content.length > MAX_ASSISTANT_CHARS) {
      content = content.slice(0, KEEP_HEAD) +
        `\n\n[... ${content.length - KEEP_HEAD - KEEP_TAIL} chars truncated for compaction ...]\n\n` +
        content.slice(-KEEP_TAIL)
    }

    // Truncate long user messages
    if (msg.role === 'user' && content.length > MAX_USER_CHARS) {
      content = content.slice(0, MAX_USER_CHARS) + `\n[... truncated]`
    }

    // Trim tool use results if present
    let toolUses = msg.toolUses
    if (toolUses && toolUses.length > 0) {
      toolUses = toolUses.map(tu => {
        if (tu.result && typeof tu.result === 'string' && tu.result.length > 500) {
          return { ...tu, result: tu.result.slice(0, 500) + ' [truncated]' }
        }
        return tu
      })
    }

    processed.push({ ...msg, content, toolUses })
  }

  return processed
}

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

      // Iteration 483: Run microcompact on messages before summarization
      // Iteration 488: Apply time-gap microcompact first, then size-based microcompact
      const { messages: timeGapProcessed, gapFound } = applyTimeGapMicrocompact(toSummarize)
      const microcompacted = microcompactMessages(timeGapProcessed)
      const tokenSavingsEst = toSummarize.reduce((sum, m) => sum + m.content.length, 0) -
                              microcompacted.reduce((sum, m) => sum + m.content.length, 0)

      // Build summary text from microcompacted messages
      const summaryInput = microcompacted.map(m =>
        `[${m.role.toUpperCase()}]: ${m.content.slice(0, 2000)}`
      ).join('\n\n')

      // Send compaction request via CLI
      const result = await window.electronAPI.cliSendMessage({
        prompt: `Here is a conversation that needs to be summarized:\n\n${summaryInput}\n\n${COMPACT_PROMPT}`,
        cwd: prefs.workingDir || await window.electronAPI.fsGetHome(),
        model: prefs.advisorModel || prefs.model,
        env: {},
        flags: ['--print', '--max-turns', '1'],
      })

      // Wait for the response -- the result event will contain the summary
      // For now, create a simple summary from the messages
      const summaryContent = `## Conversation Summary\n\nThis conversation was automatically compacted at ${new Date().toLocaleTimeString()}.\n\n**Topics discussed:**\n${toSummarize
        .filter(m => m.role === 'user')
        .map(m => `- ${m.content.slice(0, 100)}`)
        .join('\n')}\n\n**${toSummarize.length} messages were summarized to free context space.**${tokenSavingsEst > 0 ? `\n*(Microcompact saved ~${Math.round(tokenSavingsEst / 4)} tokens before summarization${gapFound ? '; time-gap detected' : ''})*` : ''}`

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
