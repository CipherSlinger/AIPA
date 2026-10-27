import { useMemo, useRef } from 'react'
import { ChatMessage, StandardChatMessage } from '../types/app.types'

export interface ConversationStats {
  total: number
  user: number
  assistant: number
  totalWords: number
  userWords: number
  assistantWords: number
  totalChars: number
  estTokens: number
  avgWordsPerMsg: number
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

interface WordCacheEntry {
  content: string
  words: number
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length
}

/**
 * Computes conversation statistics and bookmarked messages from the message list.
 *
 * PERF: word counts are cached per message id. During streaming the message array
 * is copied on every delta, but only the streaming message's content changes —
 * previously every message was re-split on whitespace each time.
 */
export function useConversationStats(messages: ChatMessage[]) {
  const wordCacheRef = useRef<Map<string, WordCacheEntry>>(new Map())

  const bookmarkedMessages = useMemo<BookmarkedMessage[]>(() => {
    const result: BookmarkedMessage[] = []
    for (let idx = 0; idx < messages.length; idx++) {
      const msg = messages[idx]
      if (msg.role === 'permission' || msg.role === 'plan') continue
      if ((msg as StandardChatMessage).bookmarked) result.push({ msg, idx })
    }
    return result
  }, [messages])

  const conversationStats = useMemo<ConversationStats>(() => {
    const wordCache = wordCacheRef.current
    let userCount = 0
    let assistantCount = 0
    let totalWords = 0
    let userWords = 0
    let assistantWords = 0
    let totalChars = 0
    let countedMsgCount = 0
    let toolUseCount = 0
    let annotationCount = 0
    let ratingUp = 0
    let ratingDown = 0
    let responseTimeSum = 0
    let responseTimeCount = 0
    const firstTs = messages.length > 0 ? messages[0].timestamp : 0
    const lastTs = messages.length > 0 ? messages[messages.length - 1].timestamp : 0

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      const std = msg as StandardChatMessage
      const isUser = msg.role === 'user'
      const isAssistant = msg.role === 'assistant'
      if (isUser) userCount++
      else if (isAssistant) assistantCount++

      if (msg.role !== 'permission' && msg.role !== 'plan') {
        countedMsgCount++
        const content = std.content || ''
        totalChars += content.length
        toolUseCount += std.toolUses?.length || 0
        if (std.annotation) annotationCount++

        // Cached word count, keyed by message id and invalidated by content change
        let entry = wordCache.get(msg.id)
        if (!entry || entry.content !== content) {
          entry = { content, words: countWords(content) }
          wordCache.set(msg.id, entry)
        }
        totalWords += entry.words
        if (isUser) userWords += entry.words
        else if (isAssistant) assistantWords += entry.words
      }

      if (isAssistant) {
        if (std.rating === 'up') ratingUp++
        else if (std.rating === 'down') ratingDown++
        if (std.responseDuration) {
          responseTimeSum += std.responseDuration
          responseTimeCount++
        }
      }
    }

    // Drop cache entries for messages no longer in the list
    if (wordCache.size > messages.length) {
      const liveIds = new Set<string>()
      for (const m of messages) liveIds.add(m.id)
      for (const id of wordCache.keys()) {
        if (!liveIds.has(id)) wordCache.delete(id)
      }
    }

    const avgWordsPerMsg = countedMsgCount > 0 ? Math.round(totalWords / countedMsgCount) : 0
    return {
      total: countedMsgCount,
      user: userCount,
      assistant: assistantCount,
      totalWords,
      userWords,
      assistantWords,
      totalChars,
      estTokens: Math.round(totalWords * 1.3),
      avgWordsPerMsg,
      readingTimeMin: Math.max(1, Math.round(totalWords / 200)),
      toolUseCount,
      durationMin: Math.max(1, Math.round((lastTs - firstTs) / 60000)),
      avgResponseSec: responseTimeCount > 0 ? Math.round(responseTimeSum / responseTimeCount / 1000) : 0,
      annotationCount,
      ratingUp,
      ratingDown,
    }
  }, [messages])

  return { bookmarkedMessages, conversationStats }
}
