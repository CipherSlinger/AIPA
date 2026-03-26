import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChatMessage } from '../../types/app.types'
import Message from './Message'
import PermissionCard from './PermissionCard'
import PlanCard from './PlanCard'
import { useChatStore, useUiStore } from '../../store'
import { ArrowDown } from 'lucide-react'

// Store scroll positions per session so switching back restores position
const scrollPositionMap = new Map<string, number>()

interface Props {
  messages: ChatMessage[]
  onPermission: (permissionId: string, allowed: boolean) => void
  onGrantPermission: (permissionId: string, toolName: string) => void
  sessionId?: string | null
  searchQuery?: string
  highlightedMessageIdx?: number
}

export default function MessageList({ messages, onPermission, onGrantPermission, sessionId, searchQuery, highlightedMessageIdx }: Props) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const { resolvePlan, rateMessage, toggleBookmark } = useChatStore()
  const { addToast } = useUiStore()
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const isNearBottomRef = useRef(true)
  const prevSessionIdRef = useRef<string | null | undefined>(sessionId)

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 80,
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
  }, [checkIfNearBottom])

  const scrollToBottom = useCallback(() => {
    if (messages.length > 0) {
      virtualizer.scrollToIndex(messages.length - 1, { align: 'end', behavior: 'smooth' })
    }
  }, [messages.length, virtualizer])

  // Auto-scroll only when user is near the bottom
  useEffect(() => {
    if (isNearBottomRef.current && messages.length > 0) {
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(messages.length - 1, { align: 'end', behavior: 'smooth' })
      })
    } else if (messages.length > 0) {
      setShowScrollBtn(true)
    }
  }, [messages.length, messages[messages.length - 1]])

  // Scroll to highlighted search match
  useEffect(() => {
    if (highlightedMessageIdx !== undefined && highlightedMessageIdx >= 0) {
      virtualizer.scrollToIndex(highlightedMessageIdx, { align: 'center', behavior: 'smooth' })
    }
  }, [highlightedMessageIdx, virtualizer])

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
  }, [onPermission, onGrantPermission, sessionId, resolvePlan, rateMessage, toggleBookmark, addToast, searchQuery])

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      style={{ height: '100%', overflowY: 'auto', padding: '16px 0', position: 'relative' }}
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const msg = messages[virtualRow.index]
          const isHighlighted = virtualRow.index === highlightedMessageIdx
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
          title="Scroll to bottom"
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
            background: 'var(--accent)',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            zIndex: 10,
            opacity: 0.9,
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.9')}
        >
          <ArrowDown size={16} />
        </button>
      )}
    </div>
  )
}
