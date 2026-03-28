import { useMemo } from 'react'
import { ChatMessage, StandardChatMessage } from '../types/app.types'

export interface ConversationStats {
  total: number
  user: number
  assistant: number
  totalWords: number
  toolUseCount: number
  durationMin: number
}

export interface BookmarkedMessage {
  msg: ChatMessage
  idx: number
}

/**
 * Computes conversation statistics and bookmarked messages from the message list.
 */
export function useConversationStats(messages: ChatMessage[]) {
  const bookmarkedMessages = useMemo<BookmarkedMessage[]>(() => {
    return messages
      .map((msg, idx) => ({ msg, idx }))
      .filter(({ msg }) => msg.role !== 'permission' && msg.role !== 'plan' && (msg as StandardChatMessage).bookmarked)
  }, [messages])

  const conversationStats = useMemo<ConversationStats>(() => {
    const userMsgs = messages.filter(m => m.role === 'user')
    const assistantMsgs = messages.filter(m => m.role === 'assistant')
    const totalWords = messages.reduce((sum, m) => {
      if (m.role === 'permission' || m.role === 'plan') return sum
      const content = (m as StandardChatMessage).content || ''
      return sum + content.split(/\s+/).filter(w => w.length > 0).length
    }, 0)
    const toolUseCount = messages.reduce((sum, m) => {
      if (m.role === 'permission' || m.role === 'plan') return sum
      return sum + ((m as StandardChatMessage).toolUses?.length || 0)
    }, 0)
    const firstTs = messages.length > 0 ? messages[0].timestamp : 0
    const lastTs = messages.length > 0 ? messages[messages.length - 1].timestamp : 0
    const durationMs = lastTs - firstTs
    const durationMin = Math.max(1, Math.round(durationMs / 60000))
    return {
      total: messages.filter(m => m.role !== 'permission' && m.role !== 'plan').length,
      user: userMsgs.length,
      assistant: assistantMsgs.length,
      totalWords,
      toolUseCount,
      durationMin,
    }
  }, [messages])

  return { bookmarkedMessages, conversationStats }
}
