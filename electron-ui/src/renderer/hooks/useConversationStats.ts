import { useMemo } from 'react'
import { ChatMessage, StandardChatMessage } from '../types/app.types'

export interface ConversationStats {
  total: number
  user: number
  assistant: number
  totalWords: number
  totalChars: number
  readingTimeMin: number
  toolUseCount: number
  durationMin: number
  avgResponseSec: number  // average assistant response time in seconds
  annotationCount: number  // number of messages with annotations
  ratingUp: number         // number of messages rated thumbs-up
  ratingDown: number       // number of messages rated thumbs-down
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
    const totalChars = messages.reduce((sum, m) => {
      if (m.role === 'permission' || m.role === 'plan') return sum
      return sum + ((m as StandardChatMessage).content || '').length
    }, 0)
    const readingTimeMin = Math.max(1, Math.round(totalWords / 200))
    const toolUseCount = messages.reduce((sum, m) => {
      if (m.role === 'permission' || m.role === 'plan') return sum
      return sum + ((m as StandardChatMessage).toolUses?.length || 0)
    }, 0)
    const firstTs = messages.length > 0 ? messages[0].timestamp : 0
    const lastTs = messages.length > 0 ? messages[messages.length - 1].timestamp : 0
    const durationMs = lastTs - firstTs
    const durationMin = Math.max(1, Math.round(durationMs / 60000))
    // Calculate average response time from responseDuration fields
    const responseTimes = messages
      .filter(m => m.role === 'assistant' && (m as StandardChatMessage).responseDuration)
      .map(m => (m as StandardChatMessage).responseDuration!)
    const avgResponseSec = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length / 1000)
      : 0
    const annotationCount = messages.filter(m =>
      m.role !== 'permission' && m.role !== 'plan' && (m as StandardChatMessage).annotation
    ).length
    const ratingUp = messages.filter(m =>
      m.role === 'assistant' && (m as StandardChatMessage).rating === 'up'
    ).length
    const ratingDown = messages.filter(m =>
      m.role === 'assistant' && (m as StandardChatMessage).rating === 'down'
    ).length
    return {
      total: messages.filter(m => m.role !== 'permission' && m.role !== 'plan').length,
      user: userMsgs.length,
      assistant: assistantMsgs.length,
      totalWords,
      totalChars,
      readingTimeMin,
      toolUseCount,
      durationMin,
      avgResponseSec,
      annotationCount,
      ratingUp,
      ratingDown,
    }
  }, [messages])

  return { bookmarkedMessages, conversationStats }
}
