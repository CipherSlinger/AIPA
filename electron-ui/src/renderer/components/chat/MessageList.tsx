import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChatMessage } from '../../types/app.types'
import Message from './Message'
import PermissionCard from './PermissionCard'
import PlanCard from './PlanCard'
import { useChatStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import { ArrowDown, ArrowUp, Lock, Unlock } from 'lucide-react'

// ── Date separator logic ──
function formatDateLabel(ts: number, t: (key: string) => string): string {
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
const TIME_GAP_THRESHOLD_MS = 30 * 60 * 1000 // 30 minutes

function formatTimeGap(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ── Response time badge ── Shows how long the assistant took to reply
function formatResponseTime(ms: number, t: (key: string, p?: Record<string, string>) => string): string {
  const secs = Math.round(ms / 1000)
  if (secs < 1) return ''
  if (secs < 60) return t('chat.repliedIn', { time: `${secs}s` })
  const mins = Math.floor(secs / 60)
  const remSecs = secs % 60
  const timeStr = remSecs > 0 ? `${mins}m ${remSecs}s` : `${mins}m`
  return t('chat.repliedIn', { time: timeStr })
}

type ListItem =
  | { type: 'message'; msg: ChatMessage; msgIdx: number }
  | { type: 'dateSep'; label: string }
  | { type: 'timeGap'; label: string }
  | { type: 'responseTime'; label: string }

// Store scroll positions per session (as percentage 0-1) so switching back restores position
// Using percentage-based storage for better cross-window-resize behavior
const scrollPositionMap = new Map<string, number>()

interface Props {
  messages: ChatMessage[]
  onPermission: (permissionId: string, allowed: boolean) => void
  onGrantPermission: (permissionId: string, toolName: string) => void
  sessionId?: string | null
  isStreaming?: boolean
  searchQuery?: string
  searchCaseSensitive?: boolean
  highlightedMessageIdx?: number
  scrollToMessageIdx?: number
  onEdit?: (msgId: string, newContent: string) => void
}

export default function MessageList({ messages, onPermission, onGrantPermission, sessionId, isStreaming, searchQuery, searchCaseSensitive, highlightedMessageIdx, scrollToMessageIdx, onEdit }: Props) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const resolvePlan = useChatStore(s => s.resolvePlan)
  const rateMessage = useChatStore(s => s.rateMessage)
  const toggleBookmark = useChatStore(s => s.toggleBookmark)
  const toggleCollapse = useChatStore(s => s.toggleCollapse)
  const addToast = useUiStore(s => s.addToast)
  const t = useT()
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const [showScrollTopBtn, setShowScrollTopBtn] = useState(false)
  const [scrollPct, setScrollPct] = useState(100)
  const isNearBottomRef = useRef(true)
  const prevSessionIdRef = useRef<string | null | undefined>(sessionId)
  const lastSeenCountRef = useRef(messages.length)
  const [unreadCount, setUnreadCount] = useState(0)
  const prevMessageCountRef = useRef(messages.length)
  const [scrollLocked, setScrollLocked] = useState(false)

  // Build flat list of items: date separators + time gap separators + response time badges + messages
  const items: ListItem[] = useMemo(() => {
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
          // Same day but >30 min gap: insert time separator
          result.push({ type: 'timeGap', label: formatTimeGap(msg.timestamp) })
        }
        // Response time badge: when previous message is user and this one is assistant
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
    })
    return result
  }, [messages, t])

  // Compute showAvatar for each message index (consecutive same-role → hide avatar)
  const showAvatarMap = useMemo(() => {
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

  // Pre-compute isLastUserMsg and hasAssistantReply for all messages
  // (avoids per-message Zustand linear scans that caused React error #185)
  const lastUserMsgId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') return messages[i].id
    }
    return null
  }, [messages])

  const assistantReplyMap = useMemo(() => {
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

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (idx) => {
      const item = items[idx]
      if (item.type === 'dateSep') return 32
      if (item.type === 'timeGap') return 28
      if (item.type === 'responseTime') return 22
      return 80
    },
    overscan: 5,
  })

  // Save scroll position when session changes, restore for new session
  useEffect(() => {
    if (prevSessionIdRef.current && prevSessionIdRef.current !== sessionId) {
      // Save old position as percentage (0-1) for cross-resize compatibility
      const el = scrollContainerRef.current
      if (el) {
        const scrollable = el.scrollHeight - el.clientHeight
        const pct = scrollable > 0 ? el.scrollTop / scrollable : 1
        scrollPositionMap.set(prevSessionIdRef.current, pct)
      }
    }
    prevSessionIdRef.current = sessionId

    // Restore position for new session (convert percentage back to pixels)
    if (sessionId && scrollPositionMap.has(sessionId)) {
      const savedPct = scrollPositionMap.get(sessionId)!
      requestAnimationFrame(() => {
        const el = scrollContainerRef.current
        if (el) {
          const scrollable = el.scrollHeight - el.clientHeight
          const targetScroll = Math.round(savedPct * scrollable)
          el.scrollTop = targetScroll
          isNearBottomRef.current = el.scrollHeight - targetScroll - el.clientHeight < 80
          setShowScrollBtn(!isNearBottomRef.current)
        }
      })
    }
  }, [sessionId])

  const checkIfNearBottom = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return true
    const threshold = 80
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold
  }, [])

  const handleScroll = useCallback(() => {
    const nearBottom = checkIfNearBottom()
    isNearBottomRef.current = nearBottom
    setShowScrollBtn(!nearBottom)
    if (nearBottom) {
      lastSeenCountRef.current = messages.length
      setUnreadCount(0)
    }
    // Show scroll-to-top button when scrolled down past 400px from top
    const el = scrollContainerRef.current
    setShowScrollTopBtn(el ? el.scrollTop > 400 : false)
    // Compute scroll percentage for position indicator
    if (el) {
      const scrollable = el.scrollHeight - el.clientHeight
      const pct = scrollable > 0 ? Math.round((el.scrollTop / scrollable) * 100) : 100
      setScrollPct(pct)
    }
  }, [checkIfNearBottom, messages.length])

  const scrollToBottom = useCallback(() => {
    if (items.length > 0) {
      virtualizer.scrollToIndex(items.length - 1, { align: 'end', behavior: 'smooth' })
    }
  }, [items.length, virtualizer])

  const scrollToTop = useCallback(() => {
    virtualizer.scrollToIndex(0, { align: 'start', behavior: 'smooth' })
  }, [virtualizer])

  // Auto-scroll only when user is near the bottom and scroll is not locked
  useEffect(() => {
    if (isNearBottomRef.current && !scrollLocked && items.length > 0) {
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(items.length - 1, { align: 'end', behavior: 'smooth' })
      })
      lastSeenCountRef.current = messages.length
      setUnreadCount(0)
    } else if (items.length > 0) {
      setShowScrollBtn(true)
      // Count new messages since user scrolled away
      const newMessages = messages.length - lastSeenCountRef.current
      if (newMessages > 0) {
        setUnreadCount(newMessages)
      }
    }
  }, [messages.length, messages[messages.length - 1]])

  // Auto-unlock scroll when streaming stops
  useEffect(() => {
    if (!isStreaming && scrollLocked) setScrollLocked(false)
  }, [isStreaming])

  // Scroll to highlighted search match (map message idx to item idx)
  useEffect(() => {
    if (highlightedMessageIdx !== undefined && highlightedMessageIdx >= 0) {
      const itemIdx = items.findIndex(it => it.type === 'message' && it.msgIdx === highlightedMessageIdx)
      if (itemIdx >= 0) {
        virtualizer.scrollToIndex(itemIdx, { align: 'center', behavior: 'smooth' })
      }
    }
  }, [highlightedMessageIdx, virtualizer, items])

  // Scroll to specific message index (triggered by bookmark jump)
  useEffect(() => {
    if (scrollToMessageIdx !== undefined && scrollToMessageIdx >= 0) {
      const itemIdx = items.findIndex(it => it.type === 'message' && it.msgIdx === scrollToMessageIdx)
      if (itemIdx >= 0) {
        virtualizer.scrollToIndex(itemIdx, { align: 'center', behavior: 'smooth' })
      }
    }
  }, [scrollToMessageIdx, virtualizer, items])

  // Keyboard navigation: Ctrl+Home (first), Ctrl+End (last), PageUp/Down
  useEffect(() => {
    const handleScrollToFirst = () => {
      if (items.length > 0) {
        virtualizer.scrollToIndex(0, { align: 'start', behavior: 'smooth' })
      }
    }
    const handleScrollToLast = () => {
      if (items.length > 0) {
        virtualizer.scrollToIndex(items.length - 1, { align: 'end', behavior: 'smooth' })
      }
    }
    const handlePageScroll = (e: Event) => {
      const direction = (e as CustomEvent).detail as 'up' | 'down'
      const el = scrollContainerRef.current
      if (!el) return
      const pageSize = el.clientHeight * 0.8 // Scroll 80% of visible height
      el.scrollBy({ top: direction === 'up' ? -pageSize : pageSize, behavior: 'smooth' })
    }
    // Jump between user messages (Alt+Up / Alt+Down)
    const userMessageIndices = items.reduce<number[]>((acc, item, idx) => {
      if (item.type === 'message' && item.msg.role === 'user') acc.push(idx)
      return acc
    }, [])
    const currentUserMsgRef = { current: -1 } // track which user message we're near
    const handleJumpUserMessage = (e: Event) => {
      const direction = (e as CustomEvent).detail as 'prev' | 'next'
      if (userMessageIndices.length === 0) return
      const el = scrollContainerRef.current
      if (!el) return
      // Determine current approximate position in the list
      const scrollRatio = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight)
      const approxIndex = Math.round(scrollRatio * (items.length - 1))
      if (direction === 'next') {
        const nextIdx = userMessageIndices.find(i => i > approxIndex)
        if (nextIdx !== undefined) {
          virtualizer.scrollToIndex(nextIdx, { align: 'center', behavior: 'smooth' })
        }
      } else {
        const prevIdx = [...userMessageIndices].reverse().find(i => i < approxIndex)
        if (prevIdx !== undefined) {
          virtualizer.scrollToIndex(prevIdx, { align: 'center', behavior: 'smooth' })
        }
      }
    }
    window.addEventListener('aipa:scrollToFirst', handleScrollToFirst)
    window.addEventListener('aipa:scrollToLast', handleScrollToLast)
    window.addEventListener('aipa:pageScroll', handlePageScroll)
    window.addEventListener('aipa:jumpUserMessage', handleJumpUserMessage)
    return () => {
      window.removeEventListener('aipa:scrollToFirst', handleScrollToFirst)
      window.removeEventListener('aipa:scrollToLast', handleScrollToLast)
      window.removeEventListener('aipa:pageScroll', handlePageScroll)
      window.removeEventListener('aipa:jumpUserMessage', handleJumpUserMessage)
    }
  }, [items.length, virtualizer])

  const renderMessage = useCallback((msg: ChatMessage, isHighlighted: boolean, msgIdx: number) => {
    if (msg.role === 'permission') {
      return (
        <PermissionCard
          message={msg}
          onAllow={() => onGrantPermission(msg.permissionId, msg.toolName)}
          onDeny={() => onPermission(msg.permissionId, false)}
        />
      )
    }
    if (msg.role === 'plan') {
      return (
        <PlanCard
          message={msg}
          onAccept={() => resolvePlan(msg.id, 'accepted')}
          onReject={() => resolvePlan(msg.id, 'rejected')}
        />
      )
    }
    const showAvatar = showAvatarMap.get(msgIdx) ?? true
    return (
      <Message
        message={msg}
        searchQuery={searchQuery}
        searchCaseSensitive={searchCaseSensitive}
        showAvatar={showAvatar}
        isLastUserMsg={msg.role === 'user' && msg.id === lastUserMsgId}
        hasAssistantReply={msg.role === 'user' && (assistantReplyMap.get(msg.id) ?? false)}
        onRate={(msgId, rating) => {
          rateMessage(msgId, rating)
          window.electronAPI.feedbackRate(msgId, rating)
        }}
        onBookmark={(msgId) => toggleBookmark(msgId)}
        onCollapse={(msgId) => toggleCollapse(msgId)}
        onEdit={onEdit}
        onRewind={sessionId ? async (ts) => {
          const isoTs = new Date(ts).toISOString()
          const result = await window.electronAPI.sessionRewind(sessionId, isoTs)
          if (result?.success) {
            addToast('success', t('message.rewindSuccess'))
          } else {
            addToast('error', t('message.rewindFailed', { error: result?.error || 'Unknown error' }))
          }
        } : undefined}
      />
    )
  }, [onPermission, onGrantPermission, sessionId, resolvePlan, rateMessage, toggleBookmark, toggleCollapse, addToast, searchQuery, searchCaseSensitive, showAvatarMap, onEdit, t, lastUserMsgId, assistantReplyMap])

  // Scroll progress (0..1)
  const [scrollProgress, setScrollProgress] = useState(0)

  const handleScrollWithProgress = useCallback(() => {
    handleScroll()
    const el = scrollContainerRef.current
    if (!el) return
    const scrollable = el.scrollHeight - el.clientHeight
    if (scrollable <= 0) {
      setScrollProgress(1)
    } else {
      setScrollProgress(el.scrollTop / scrollable)
    }
  }, [handleScroll])

  return (
    <div style={{ height: '100%', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      {/* Scroll progress bar */}
      {messages.length > 0 && (
        <div
          style={{
            height: 2,
            background: 'var(--border)',
            flexShrink: 0,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: '100%',
              width: `${scrollProgress * 100}%`,
              background: 'var(--accent)',
              transition: 'width 0.1s ease-out',
            }}
          />
        </div>
      )}
    <div
      ref={scrollContainerRef}
      onScroll={handleScrollWithProgress}
      role="log"
      aria-label="Conversation messages"
      aria-live="polite"
      style={{ flex: 1, overflowY: 'auto', padding: '16px 0', position: 'relative' }}
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index]
          if (item.type === 'dateSep') {
            return (
              <div
                key={`sep-${item.label}`}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '6px 20px',
                }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', fontWeight: 500, letterSpacing: 0.3 }}>
                    {item.label}
                  </span>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                </div>
              </div>
            )
          }
          if (item.type === 'timeGap') {
            return (
              <div
                key={`tgap-${virtualRow.index}`}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '4px 20px',
                }}>
                  <span style={{
                    fontSize: 9,
                    color: 'var(--text-muted)',
                    opacity: 0.7,
                    fontFamily: 'monospace',
                    letterSpacing: 0.5,
                  }}>
                    {item.label}
                  </span>
                </div>
              </div>
            )
          }
          if (item.type === 'responseTime') {
            return (
              <div
                key={`rt-${virtualRow.index}`}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '2px 20px',
                }}>
                  <span style={{
                    fontSize: 9,
                    color: 'var(--text-muted)',
                    opacity: 0.5,
                    fontStyle: 'italic',
                  }}>
                    {item.label}
                  </span>
                </div>
              </div>
            )
          }
          const msg = item.msg
          const isHighlighted = item.msgIdx === highlightedMessageIdx
          const isLastMessage = item.msgIdx === messages.length - 1
          const entranceClass = isLastMessage
            ? (msg.role === 'user' ? 'message-enter-right message-new-glow' : msg.role === 'assistant' ? 'message-enter-left message-new-glow' : 'message-enter message-new-glow')
            : undefined
          return (
            <div
              key={msg.id}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className={entranceClass}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div style={{
                outline: isHighlighted ? '2px solid var(--accent)' : 'none',
                borderRadius: isHighlighted ? 4 : 0,
                transition: 'outline 0.2s',
              }}>
                {renderMessage(msg, isHighlighted, item.msgIdx)}
              </div>
            </div>
          )
        })}
      </div>
      {showScrollTopBtn && !showScrollBtn && (
        <button
          onClick={scrollToTop}
          title={t('chat.scrollToTop')}
          style={{
            position: 'sticky',
            bottom: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'var(--bg-hover)',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            zIndex: 10,
            opacity: 0.8,
            transition: 'opacity 0.15s',
            fontSize: 11,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--text-primary)' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.8'; e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          <ArrowUp size={14} />
        </button>
      )}
      {/* Scroll lock button (visible during streaming) */}
      {isStreaming && (
        <button
          onClick={() => setScrollLocked(prev => !prev)}
          title={scrollLocked ? t('chat.scrollUnlock') : t('chat.scrollLock')}
          style={{
            position: 'sticky',
            bottom: showScrollBtn ? 50 : 12,
            left: '50%',
            transform: 'translateX(24px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: scrollLocked ? 'var(--warning)' : 'var(--bg-hover)',
            border: `1px solid ${scrollLocked ? 'var(--warning)' : 'var(--border)'}`,
            color: scrollLocked ? '#fff' : 'var(--text-muted)',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            zIndex: 10,
            opacity: 0.85,
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.85' }}
        >
          {scrollLocked ? <Lock size={12} /> : <Unlock size={12} />}
        </button>
      )}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          title={unreadCount > 0 ? t(unreadCount > 1 ? 'chat.newMessagesPlural' : 'chat.newMessages', { count: String(unreadCount) }) : t('chat.scrollToBottom')}
          style={{
            position: 'sticky',
            bottom: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            minWidth: 32,
            height: 32,
            borderRadius: (unreadCount > 0 || scrollPct < 100) ? 16 : '50%',
            padding: (unreadCount > 0 || scrollPct < 100) ? '0 12px' : 0,
            background: 'var(--accent)',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            zIndex: 10,
            opacity: 0.9,
            transition: 'opacity 0.15s',
            fontSize: 11,
            fontWeight: 600,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.9')}
        >
          <ArrowDown size={14} />
          {unreadCount > 0
            ? <span>{unreadCount}</span>
            : <span style={{ fontSize: 10, fontFamily: 'monospace', opacity: 0.85 }}>{scrollPct}%</span>
          }
        </button>
      )}
    </div>
    </div>
  )
}
