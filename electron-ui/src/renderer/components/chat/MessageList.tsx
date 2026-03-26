import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChatMessage } from '../../types/app.types'
import Message from './Message'
import PermissionCard from './PermissionCard'
import PlanCard from './PlanCard'
import { useChatStore, useUiStore } from '../../store'
import { ArrowDown } from 'lucide-react'

// ── Date separator logic ──
function formatDateLabel(ts: number): string {
  const date = new Date(ts)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

  if (isSameDay(date, today)) return 'Today'
  if (isSameDay(date, yesterday)) return 'Yesterday'
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

type ListItem = { type: 'message'; msg: ChatMessage; msgIdx: number } | { type: 'dateSep'; label: string }

// Store scroll positions per session so switching back restores position
const scrollPositionMap = new Map<string, number>()

interface Props {
  messages: ChatMessage[]
  onPermission: (permissionId: string, allowed: boolean) => void
  onGrantPermission: (permissionId: string, toolName: string) => void
  sessionId?: string | null
  searchQuery?: string
  highlightedMessageIdx?: number
  scrollToMessageIdx?: number
}

export default function MessageList({ messages, onPermission, onGrantPermission, sessionId, searchQuery, highlightedMessageIdx, scrollToMessageIdx }: Props) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const { resolvePlan, rateMessage, toggleBookmark, toggleCollapse } = useChatStore()
  const { addToast } = useUiStore()
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const isNearBottomRef = useRef(true)
  const prevSessionIdRef = useRef<string | null | undefined>(sessionId)
  const lastSeenCountRef = useRef(messages.length)
  const [unreadCount, setUnreadCount] = useState(0)

  // Build flat list of items: date separators + messages
  const items: ListItem[] = useMemo(() => {
    const result: ListItem[] = []
    let lastDateLabel = ''
    messages.forEach((msg, idx) => {
      if (msg.timestamp) {
        const label = formatDateLabel(msg.timestamp)
        if (label !== lastDateLabel) {
          result.push({ type: 'dateSep', label })
          lastDateLabel = label
        }
      }
      result.push({ type: 'message', msg, msgIdx: idx })
    })
    return result
  }, [messages])

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (idx) => items[idx].type === 'dateSep' ? 32 : 80,
    overscan: 5,
  })

  // Save scroll position when session changes, restore for new session
  useEffect(() => {
    if (prevSessionIdRef.current && prevSessionIdRef.current !== sessionId) {
      // Save old position
      const el = scrollContainerRef.current
      if (el) {
        scrollPositionMap.set(prevSessionIdRef.current, el.scrollTop)
      }
    }
    prevSessionIdRef.current = sessionId

    // Restore position for new session
    if (sessionId && scrollPositionMap.has(sessionId)) {
      const saved = scrollPositionMap.get(sessionId)!
      requestAnimationFrame(() => {
        const el = scrollContainerRef.current
        if (el) {
          el.scrollTop = saved
          isNearBottomRef.current = el.scrollHeight - saved - el.clientHeight < 80
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
  }, [checkIfNearBottom, messages.length])

  const scrollToBottom = useCallback(() => {
    if (items.length > 0) {
      virtualizer.scrollToIndex(items.length - 1, { align: 'end', behavior: 'smooth' })
    }
  }, [items.length, virtualizer])

  // Auto-scroll only when user is near the bottom
  useEffect(() => {
    if (isNearBottomRef.current && items.length > 0) {
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

  const renderMessage = useCallback((msg: ChatMessage, isHighlighted: boolean) => {
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
    return (
      <Message
        message={msg}
        searchQuery={searchQuery}
        onRate={(msgId, rating) => {
          rateMessage(msgId, rating)
          window.electronAPI.feedbackRate(msgId, rating)
        }}
        onBookmark={(msgId) => toggleBookmark(msgId)}
        onCollapse={(msgId) => toggleCollapse(msgId)}
        onRewind={sessionId ? async (ts) => {
          const isoTs = new Date(ts).toISOString()
          const result = await window.electronAPI.sessionRewind(sessionId, isoTs)
          if (result?.success) {
            addToast('success', 'Files reverted to state before this message')
          } else {
            addToast('error', 'Rewind failed: ' + (result?.error || 'Unknown error'))
          }
        } : undefined}
      />
    )
  }, [onPermission, onGrantPermission, sessionId, resolvePlan, rateMessage, toggleBookmark, toggleCollapse, addToast, searchQuery])

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
          const msg = item.msg
          const isHighlighted = item.msgIdx === highlightedMessageIdx
          return (
            <div
              key={msg.id}
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
                outline: isHighlighted ? '2px solid var(--accent)' : 'none',
                borderRadius: isHighlighted ? 4 : 0,
                transition: 'outline 0.2s',
              }}>
                {renderMessage(msg, isHighlighted)}
              </div>
            </div>
          )
        })}
      </div>
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          title={unreadCount > 0 ? `${unreadCount} new message${unreadCount > 1 ? 's' : ''}` : 'Scroll to bottom'}
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
            borderRadius: unreadCount > 0 ? 16 : '50%',
            padding: unreadCount > 0 ? '0 12px' : 0,
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
          {unreadCount > 0 && <span>{unreadCount}</span>}
        </button>
      )}
    </div>
    </div>
  )
}
