import { useMemo } from 'react'
import { ChatMessage } from '../../types/app.types'

// ── Date separator logic ──
export function formatDateLabel(ts: number, t: (key: string) => string): string {
  const date = new Date(ts)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

  if (isSameDay(date, today)) return t('session.today')
  if (isSameDay(date, yesterday)) return t('session.yesterday')
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

// ── Time gap separator ── Show time when messages are >30 minutes apart within the same day
export const TIME_GAP_THRESHOLD_MS = 30 * 60 * 1000 // 30 minutes

export function formatTimeGap(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ── Response time badge ── Shows how long the assistant took to reply
export function formatResponseTime(ms: number, t: (key: string, p?: Record<string, string>) => string): string {
  const secs = Math.round(ms / 1000)
  if (secs < 1) return ''
  if (secs < 60) return t('chat.repliedIn', { time: `${secs}s` })
  const mins = Math.floor(secs / 60)
  const remSecs = secs % 60
  const timeStr = remSecs > 0 ? `${mins}m ${remSecs}s` : `${mins}m`
  return t('chat.repliedIn', { time: timeStr })
}

export type ListItem =
  | { type: 'message'; msg: ChatMessage; msgIdx: number }
  | { type: 'dateSep'; label: string }
  | { type: 'timeGap'; label: string }
  | { type: 'responseTime'; label: string }
  | { type: 'compactSep'; label: string }

// Store scroll positions per session (as percentage 0-1)
export const scrollPositionMap = new Map<string, number>()

/**
 * Build the flat list of items including date separators, time gap markers,
 * response time badges, and messages.
 */
export function useBuildItems(
  messages: ChatMessage[],
  t: (key: string, p?: Record<string, string>) => string,
): ListItem[] {
  return useMemo(() => {
    const result: ListItem[] = []
    let lastDateLabel = ''
    let lastTimestamp = 0
    messages.forEach((msg, idx) => {
      if (msg.timestamp) {
        const label = formatDateLabel(msg.timestamp, t)
        if (label !== lastDateLabel) {
          result.push({ type: 'dateSep', label })
          lastDateLabel = label
          lastTimestamp = msg.timestamp
        } else if (lastTimestamp > 0 && msg.timestamp - lastTimestamp > TIME_GAP_THRESHOLD_MS) {
          result.push({ type: 'timeGap', label: formatTimeGap(msg.timestamp) })
        }
        // Response time badge
        if (idx > 0 && msg.role === 'assistant' && messages[idx - 1].role === 'user' && messages[idx - 1].timestamp) {
          const elapsed = msg.timestamp - messages[idx - 1].timestamp!
          if (elapsed >= 1000) {
            const rtLabel = formatResponseTime(elapsed, t)
            if (rtLabel) result.push({ type: 'responseTime', label: rtLabel })
          }
        }
        lastTimestamp = msg.timestamp
      }
      result.push({ type: 'message', msg, msgIdx: idx })
      // Insert compaction separator after system messages that are compaction summaries
      if (msg.id?.startsWith('compact-')) {
        result.push({ type: 'compactSep', label: t('compact.complete') })
      }
    })
    return result
  }, [messages, t])
}

/** Compute showAvatar for each message index (consecutive same-role -> hide avatar) */
export function useShowAvatarMap(messages: ChatMessage[]): Map<number, boolean> {
  return useMemo(() => {
    const map = new Map<number, boolean>()
    messages.forEach((msg, idx) => {
      if (idx === 0) {
        map.set(idx, true)
        return
      }
      const prev = messages[idx - 1]
      map.set(idx, prev.role !== msg.role)
    })
    return map
  }, [messages])
}

/** Find the last user message ID */
export function useLastUserMsgId(messages: ChatMessage[]): string | null {
  return useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') return messages[i].id
    }
    return null
  }, [messages])
}

/** Build a map of user message ID -> whether an assistant reply follows */
export function useAssistantReplyMap(messages: ChatMessage[]): Map<string, boolean> {
  return useMemo(() => {
    const map = new Map<string, boolean>()
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].role === 'user') {
        let found = false
        for (let j = i + 1; j < messages.length; j++) {
          if (messages[j].role === 'assistant') { found = true; break }
        }
        map.set(messages[i].id, found)
      }
    }
    return map
  }, [messages])
}

/** Compute showTimestamp for each message index.
 * Consecutive same-role messages within 2 minutes only show timestamp on the first.
 */
const TIMESTAMP_GROUP_MS = 2 * 60 * 1000 // 2 minutes
export function useShowTimestampMap(messages: ChatMessage[]): Map<number, boolean> {
  return useMemo(() => {
    const map = new Map<number, boolean>()
    messages.forEach((msg, idx) => {
      if (idx === 0) {
        map.set(idx, true)
        return
      }
      const prev = messages[idx - 1]
      // Different role -> always show
      if (prev.role !== msg.role) {
        map.set(idx, true)
        return
      }
      // Same role, check time gap
      if (msg.timestamp && prev.timestamp && msg.timestamp - prev.timestamp < TIMESTAMP_GROUP_MS) {
        map.set(idx, false)
      } else {
        map.set(idx, true)
      }
    })
    return map
  }, [messages])
}
