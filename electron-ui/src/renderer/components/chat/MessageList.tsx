import React, { useEffect, useCallback, useRef, useState, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChatMessage, StandardChatMessage } from '../../types/app.types'
import Message from './Message'
import MessageErrorBoundary from './MessageErrorBoundary'
import PermissionCard from './PermissionCard'
import PlanCard from './PlanCard'
import { useChatStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import { ArrowDown, ArrowUp, Lock, Unlock, Pin, ChevronDown, ChevronUp } from 'lucide-react'
import { useBuildItems, useShowAvatarMap, useLastUserMsgId, useAssistantReplyMap } from './messageListUtils'
import { useMessageListScroll } from './useMessageListScroll'

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
  const resolvePlan = useChatStore(s => s.resolvePlan)
  const rateMessage = useChatStore(s => s.rateMessage)
  const toggleBookmark = useChatStore(s => s.toggleBookmark)
  const toggleCollapse = useChatStore(s => s.toggleCollapse)
  const addToast = useUiStore(s => s.addToast)
  const t = useT()
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Pinned messages strip
  const [pinnedExpanded, setPinnedExpanded] = useState(true)
  const pinnedMessages = useMemo(() =>
    messages
      .map((m, idx) => ({ msg: m, idx }))
      .filter(({ msg }) => msg.role !== 'permission' && msg.role !== 'plan' && (msg as StandardChatMessage).pinned),
    [messages]
  )

  // Pre-computed data
  const items = useBuildItems(messages, t)
  const showAvatarMap = useShowAvatarMap(messages)
  const lastUserMsgId = useLastUserMsgId(messages)
  const assistantReplyMap = useAssistantReplyMap(messages)

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

  const scrollState = useMessageListScroll(scrollContainerRef, messages, items, sessionId, isStreaming, virtualizer)

  // Scroll to highlighted search match
  useEffect(() => {
    if (highlightedMessageIdx !== undefined && highlightedMessageIdx >= 0) {
      const itemIdx = items.findIndex(it => it.type === 'message' && it.msgIdx === highlightedMessageIdx)
      if (itemIdx >= 0) {
        virtualizer.scrollToIndex(itemIdx, { align: 'center', behavior: 'smooth' })
      }
    }
  }, [highlightedMessageIdx, virtualizer, items])

  // Scroll to specific message index (bookmark jump)
  useEffect(() => {
    if (scrollToMessageIdx !== undefined && scrollToMessageIdx >= 0) {
      const itemIdx = items.findIndex(it => it.type === 'message' && it.msgIdx === scrollToMessageIdx)
      if (itemIdx >= 0) {
        virtualizer.scrollToIndex(itemIdx, { align: 'center', behavior: 'smooth' })
      }
    }
  }, [scrollToMessageIdx, virtualizer, items])

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
    // STABILITY (Iteration 308): Per-message ErrorBoundary isolates render failures.
    // A single malformed message (e.g., bad markdown, huge content) won't crash the
    // entire ChatPanel. PermissionCard and PlanCard are simple enough not to need it.
    const rawContent = (msg as StandardChatMessage).content || ''
    return (
      <MessageErrorBoundary messageContent={rawContent}>
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
      </MessageErrorBoundary>
    )
  }, [onPermission, onGrantPermission, sessionId, resolvePlan, rateMessage, toggleBookmark, toggleCollapse, addToast, searchQuery, searchCaseSensitive, showAvatarMap, onEdit, t, lastUserMsgId, assistantReplyMap])

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
              width: `${scrollState.scrollProgress * 100}%`,
              background: 'var(--accent)',
              transition: 'width 0.1s ease-out',
            }}
          />
        </div>
      )}
      {/* Pinned messages strip */}
      {pinnedMessages.length > 0 && (
        <div style={{
          flexShrink: 0,
          background: 'var(--popup-bg)',
          borderBottom: '1px solid var(--popup-border)',
        }}>
          <button
            onClick={() => setPinnedExpanded(prev => !prev)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 12px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--accent)',
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            <Pin size={12} style={{ transform: 'rotate(-45deg)' }} />
            <span>{t('message.pinnedMessages')} ({pinnedMessages.length})</span>
            <span style={{ marginLeft: 'auto' }}>
              {pinnedExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </span>
          </button>
          {pinnedExpanded && (
            <div style={{ padding: '0 12px 6px', display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
              {pinnedMessages.map(({ msg, idx }) => {
                const content = (msg as StandardChatMessage).content || ''
                const preview = content.length > 120 ? content.slice(0, 120) + '...' : content
                const roleLabel = msg.role === 'user' ? 'You' : 'AIPA'
                return (
                  <button
                    key={msg.id}
                    onClick={() => {
                      const itemIdx = items.findIndex(it => it.type === 'message' && it.msgIdx === idx)
                      if (itemIdx >= 0) {
                        virtualizer.scrollToIndex(itemIdx, { align: 'center', behavior: 'smooth' })
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      padding: '5px 8px',
                      background: 'var(--action-btn-bg)',
                      border: '1px solid var(--action-btn-border)',
                      borderRadius: 6,
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--popup-item-hover)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--action-btn-bg)' }}
                  >
                    <span style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: msg.role === 'user' ? 'var(--accent)' : 'var(--text-muted)',
                      flexShrink: 0,
                      minWidth: 32,
                    }}>
                      {roleLabel}
                    </span>
                    <span style={{
                      fontSize: 11,
                      color: 'var(--text-primary)',
                      lineHeight: 1.4,
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}>
                      {preview}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    <div
      ref={scrollContainerRef}
      onScroll={scrollState.handleScroll}
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
      {scrollState.showScrollTopBtn && !scrollState.showScrollBtn && (
        <button
          onClick={scrollState.scrollToTop}
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
          onClick={() => scrollState.setScrollLocked(prev => !prev)}
          title={scrollState.scrollLocked ? t('chat.scrollUnlock') : t('chat.scrollLock')}
          style={{
            position: 'sticky',
            bottom: scrollState.showScrollBtn ? 50 : 12,
            left: '50%',
            transform: 'translateX(24px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: scrollState.scrollLocked ? 'var(--warning)' : 'var(--bg-hover)',
            border: `1px solid ${scrollState.scrollLocked ? 'var(--warning)' : 'var(--border)'}`,
            color: scrollState.scrollLocked ? '#fff' : 'var(--text-muted)',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            zIndex: 10,
            opacity: 0.85,
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.85' }}
        >
          {scrollState.scrollLocked ? <Lock size={12} /> : <Unlock size={12} />}
        </button>
      )}
      {scrollState.showScrollBtn && (
        <button
          onClick={scrollState.scrollToBottom}
          title={scrollState.unreadCount > 0 ? t(scrollState.unreadCount > 1 ? 'chat.newMessagesPlural' : 'chat.newMessages', { count: String(scrollState.unreadCount) }) : t('chat.scrollToBottom')}
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
            borderRadius: (scrollState.unreadCount > 0 || scrollState.scrollPct < 100) ? 16 : '50%',
            padding: (scrollState.unreadCount > 0 || scrollState.scrollPct < 100) ? '0 12px' : 0,
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
          {scrollState.unreadCount > 0
            ? <span>{scrollState.unreadCount}</span>
            : <span style={{ fontSize: 10, fontFamily: 'monospace', opacity: 0.85 }}>{scrollState.scrollPct}%</span>
          }
        </button>
      )}
    </div>
    </div>
  )
}
