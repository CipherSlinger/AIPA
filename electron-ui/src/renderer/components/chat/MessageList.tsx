import React, { useEffect, useCallback, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChatMessage, StandardChatMessage, HookCallbackMessage, ElicitationMessage } from '../../types/app.types'
import Message from './Message'
import MessageErrorBoundary from './MessageErrorBoundary'
import PermissionCard from './PermissionCard'
import PlanCard from './PlanCard'
import { HookCallbackCard } from './HookCallbackCard'
import { ElicitationCard } from './ElicitationCard'
import PinnedMessagesStrip from './PinnedMessagesStrip'
import VirtualSeparatorRow from './VirtualSeparatorRow'
import RewindDialog from './RewindDialog'
import ForkDialog from './ForkDialog'
import ScrollToBottomFab from './ScrollToBottomFab'
import { useChatStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import { ArrowUp, Lock, Unlock } from 'lucide-react'
import { useBuildItems, useShowAvatarMap, useLastUserMsgId, useAssistantReplyMap, useShowTimestampMap } from './messageListUtils'
import { useMessageListScroll } from './useMessageListScroll'
import { useMessageNavigation } from './useMessageNavigation'

interface Props {
  messages: ChatMessage[]
  onPermission: (permissionId: string, allowed: boolean) => void
  onGrantPermission: (permissionId: string, toolName: string) => void
  onAlwaysAllow?: (toolName: string, toolInput: Record<string, unknown>) => void
  onAlwaysDeny?: (toolName: string, toolInput: Record<string, unknown>) => void
  onRespondHookCallback?: (requestId: string, response: Record<string, unknown>) => void
  onRespondElicitation?: (requestId: string, result: Record<string, unknown>) => void
  sessionId?: string | null
  isStreaming?: boolean
  searchQuery?: string
  searchCaseSensitive?: boolean
  highlightedMessageIdx?: number
  scrollToMessageIdx?: number
  onEdit?: (msgId: string, newContent: string) => void
  onFork?: (msgIdx: number) => void
}

export default function MessageList({ messages, onPermission, onGrantPermission, onAlwaysAllow, onAlwaysDeny, onRespondHookCallback, onRespondElicitation, sessionId, isStreaming, searchQuery, searchCaseSensitive, highlightedMessageIdx, scrollToMessageIdx, onEdit, onFork }: Props) {
  const resolvePlan = useChatStore(s => s.resolvePlan)
  const rateMessage = useChatStore(s => s.rateMessage)
  const toggleBookmark = useChatStore(s => s.toggleBookmark)
  const toggleCollapse = useChatStore(s => s.toggleCollapse)
  const addToast = useUiStore(s => s.addToast)
  const rewindToMessage = useChatStore(s => s.rewindToMessage)
  const t = useT()
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Rewind confirmation state
  const [rewindTarget, setRewindTarget] = useState<{ msgId: string; ts: number; count: number } | null>(null)

  // Fork dialog state
  const [forkTarget, setForkTarget] = useState<{ msgIdx: number } | null>(null)

  // Keyboard message navigation (extracted to useMessageNavigation — Iteration 403)
  // Pinned messages strip (extracted to PinnedMessagesStrip — Iteration 403)

  // Pre-computed data
  const items = useBuildItems(messages, t)
  const showAvatarMap = useShowAvatarMap(messages)
  const showTimestampMap = useShowTimestampMap(messages)
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
      if (item.type === 'compactSep') return 36
      return 80
    },
    overscan: 5,
  })

  const scrollState = useMessageListScroll(scrollContainerRef, messages, items, sessionId, isStreaming, virtualizer)

  const { focusedMsgIdx } = useMessageNavigation(messages, items, virtualizer)

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
          onAlwaysAllow={onAlwaysAllow ? () => {
            onAlwaysAllow(msg.toolName, msg.toolInput)
            onGrantPermission(msg.permissionId, msg.toolName)
          } : undefined}
          onAlwaysDeny={onAlwaysDeny ? () => {
            onAlwaysDeny(msg.toolName, msg.toolInput)
            onPermission(msg.permissionId, false)
          } : undefined}
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
    if (msg.role === 'hook_callback') {
      return (
        <HookCallbackCard
          message={msg as HookCallbackMessage}
          onRespond={onRespondHookCallback || (() => {})}
        />
      )
    }
    if (msg.role === 'elicitation') {
      return (
        <ElicitationCard
          message={msg as ElicitationMessage}
          onRespond={onRespondElicitation || (() => {})}
        />
      )
    }
    const showAvatar = showAvatarMap.get(msgIdx) ?? true
    const showTimestamp = showTimestampMap.get(msgIdx) ?? true
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
        showTimestamp={showTimestamp}
        isLastUserMsg={msg.role === 'user' && msg.id === lastUserMsgId}
        isLastMessage={msgIdx === messages.length - 1}
        hasAssistantReply={msg.role === 'user' && (assistantReplyMap.get(msg.id) ?? false)}
        onRate={(msgId, rating) => {
          rateMessage(msgId, rating)
          window.electronAPI.feedbackRate(msgId, rating)
        }}
        onBookmark={(msgId) => toggleBookmark(msgId)}
        onCollapse={(msgId) => toggleCollapse(msgId)}
        onEdit={onEdit}
        onFork={onFork && (msg as ChatMessage).role !== 'permission' && (msg as ChatMessage).role !== 'plan' && (msg as ChatMessage).role !== 'hook_callback' && (msg as ChatMessage).role !== 'elicitation' ? () => setForkTarget({ msgIdx }) : undefined}
        onRewind={sessionId ? (ts) => {
          // Find the message index by timestamp to calculate how many messages will be removed
          const msgIndex = messages.findIndex(m => m.role !== 'permission' && m.role !== 'plan' && m.role !== 'hook_callback' && m.role !== 'elicitation' && (m as StandardChatMessage).timestamp === ts)
          if (msgIndex < 0) return
          const count = messages.length - msgIndex - 1
          if (count <= 0) return
          setRewindTarget({ msgId: messages[msgIndex].id, ts, count })
        } : undefined}
      />
      </MessageErrorBoundary>
    )
  }, [onPermission, onGrantPermission, onAlwaysAllow, onAlwaysDeny, onRespondHookCallback, onRespondElicitation, sessionId, resolvePlan, rateMessage, toggleBookmark, toggleCollapse, addToast, searchQuery, searchCaseSensitive, showAvatarMap, showTimestampMap, onEdit, onFork, setForkTarget, t, lastUserMsgId, assistantReplyMap, messages])

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
              background: 'rgba(99,102,241,0.7)',
              transition: 'all 0.15s ease',
            }}
          />
        </div>
      )}
      {/* Pinned messages strip (extracted — Iteration 403) */}
      <PinnedMessagesStrip messages={messages} items={items} virtualizer={virtualizer} />
    <div
      ref={scrollContainerRef}
      onScroll={scrollState.handleScroll}
      role="log"
      aria-label={t('a11y.conversationMessages')}
      aria-live="polite"
      style={{ flex: 1, overflowY: 'auto', padding: '16px 0', position: 'relative', background: 'transparent', scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.12) transparent' }}
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
          if (item.type === 'dateSep' || item.type === 'timeGap' || item.type === 'responseTime' || item.type === 'compactSep') {
            return (
              <VirtualSeparatorRow
                key={item.type === 'dateSep' ? `sep-${item.label}` : `${item.type}-${virtualRow.index}`}
                type={item.type}
                label={item.label}
                virtualRow={virtualRow}
                measureElement={virtualizer.measureElement}
              />
            )
          }
          const msg = item.msg
          const isHighlighted = item.msgIdx === highlightedMessageIdx
          const isFocused = item.msgIdx === focusedMsgIdx
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
                outline: isHighlighted ? '2px solid rgba(99,102,241,0.7)' : 'none',
                borderLeft: isFocused ? '3px solid rgba(99,102,241,0.7)' : '3px solid transparent',
                borderRadius: isHighlighted ? 4 : 0,
                transition: 'all 0.15s ease',
                background: isFocused ? 'rgba(99,102,241,0.04)' : 'transparent',
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
            background: 'var(--glass-border)',
            border: '1px solid var(--glass-border-md)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            zIndex: 10,
            opacity: 0.8,
            transition: 'all 0.15s ease',
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
            background: scrollState.scrollLocked ? 'rgba(245,158,11,0.7)' : 'var(--glass-border)',
            border: `1px solid ${scrollState.scrollLocked ? 'rgba(245,158,11,0.5)' : 'var(--glass-border-md)'}`,
            color: scrollState.scrollLocked ? 'rgba(255,255,255,0.95)' : 'var(--text-muted)',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            zIndex: 10,
            opacity: 0.85,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.85' }}
        >
          {scrollState.scrollLocked ? <Lock size={12} /> : <Unlock size={12} />}
        </button>
      )}

      {/* Rewind confirmation dialog */}
      {rewindTarget && (
        <RewindDialog
          count={rewindTarget.count}
          onConfirm={async () => {
            const { msgId, ts, count } = rewindTarget
            setRewindTarget(null)
            rewindToMessage(msgId)
            if (sessionId) {
              const isoTs = new Date(ts).toISOString()
              await window.electronAPI.sessionRewind(sessionId, isoTs).catch(() => {})
            }
            addToast('success', t('rewind.rewound', { count: String(count) }))
          }}
          onCancel={() => setRewindTarget(null)}
        />
      )}

      {/* Fork dialog */}
      {forkTarget && onFork && (
        <ForkDialog
          msgIdx={forkTarget.msgIdx}
          sessionId={sessionId || null}
          onConfirm={(msgIdx) => {
            setForkTarget(null)
            onFork(msgIdx)
          }}
          onCancel={() => setForkTarget(null)}
        />
      )}
    </div>
    {/* FAB: positioned absolutely relative to the outer container (Iteration 461) */}
    <ScrollToBottomFab
      show={scrollState.showScrollBtn}
      unreadCount={scrollState.unreadCount}
      onClick={scrollState.scrollToBottom}
    />
    </div>
  )
}
