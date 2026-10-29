import React, { useEffect, useLayoutEffect, useCallback, useRef, useState, useSyncExternalStore } from 'react'
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
import { useBuildItems, useMessageListMaps } from './messageListUtils'
import { savedInterruptionStore, selectSavedInterruption } from './savedInterruptionStore'
import { useMessageListScroll } from './useMessageListScroll'
import { useMessageNavigation } from './useMessageNavigation'
import { useEngineSteps } from './useEngineSteps'
import { branchAvailability, forkBlockedKey } from './forkDecision'

// PERF: module-level handlers so every <Message> receives identical callback
// identities across renders (store actions are read via getState()).
const handleRate = (msgId: string, rating: 'up' | 'down' | null) => {
  useChatStore.getState().rateMessage(msgId, rating)
  window.electronAPI.feedbackRate(msgId, rating)
}
const handleBookmark = (msgId: string) => {
  useChatStore.getState().toggleBookmark(msgId)
}
const handleCollapse = (msgId: string) => {
  useChatStore.getState().toggleCollapse(msgId)
}

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
  /**
   * The in-conversation find bar is open. It searches the transcript's DOM,
   * so every row has to be mounted for its count to describe the whole
   * conversation rather than whatever happened to be on screen.
   */
  findOpen?: boolean
  searchQuery?: string
  searchCaseSensitive?: boolean
  highlightedMessageIdx?: number
  scrollToMessageIdx?: number
  /** Row to flash after a cross-session search hit lands here. */
  evidenceMessageIdx?: number
  onEdit?: (msgId: string, newContent: string) => void
  onFork?: (msgIdx: number) => void
  /** Codex: branch the engine thread before the user message with this id. */
  onBranch?: (msgId: string) => void
  /** Reports the scroll offset as the user scrolls, for per-tab restore. */
  onScrollTop?: (scrollTop: number) => void
  /** Tab identity — when it changes, `restoreScrollTop` is applied once. */
  tabId?: string | null
  /** Pixel offset to restore when `tabId` changes. */
  restoreScrollTop?: number
}

export default function MessageList({ messages, onPermission, onGrantPermission, onAlwaysAllow, onAlwaysDeny, onRespondHookCallback, onRespondElicitation, sessionId, isStreaming, findOpen, searchQuery, searchCaseSensitive, highlightedMessageIdx, scrollToMessageIdx, evidenceMessageIdx, onEdit, onFork, onBranch, onScrollTop, tabId, restoreScrollTop }: Props) {
  const resolvePlan = useChatStore(s => s.resolvePlan)
  const addToast = useUiStore(s => s.addToast)
  const rewindToMessage = useChatStore(s => s.rewindToMessage)
  const t = useT()
  const lastTurnOutcome = useChatStore(s => s.lastTurnOutcome)
  // Engine-step rows are bucketed by the conversation the user is looking at,
  // not by the transient bridge id: `viewSessionId` stays stable for the whole
  // turn, including a brand-new chat whose engine id is still unknown.
  const viewSessionId = useChatStore(s => s.viewSessionId)
  const engineSteps = useEngineSteps(viewSessionId)
  const [expandedStepGroups, setExpandedStepGroups] = useState<Set<string>>(() => new Set())
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const toggleStepGroup = useCallback((rowKey: string) => {
    setExpandedStepGroups(prev => {
      const next = new Set(prev)
      if (next.has(rowKey)) next.delete(rowKey)
      else next.add(rowKey)
      return next
    })
  }, [])

  // Keep the reading column centred on the same axis as the composer. The
  // scroll container reserves a symmetric scrollbar gutter, so its content
  // box is narrower than the conversation pane; compensating by exactly that
  // amount makes the message text and the composer share a left edge at every
  // width, without hard-coding a platform scrollbar size.
  useLayoutEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const update = () => {
      el.style.setProperty('--chat-gutter-comp', `${el.offsetWidth - el.clientWidth}px`)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Rewind confirmation state
  const [rewindTarget, setRewindTarget] = useState<{ msgId: string; ts: number; count: number } | null>(null)

  // Fork dialog state
  const [forkTarget, setForkTarget] = useState<{ msgIdx: number } | null>(null)

  // Keyboard message navigation (extracted to useMessageNavigation — Iteration 403)
  // Pinned messages strip (extracted to PinnedMessagesStrip — Iteration 403)

  // What the saved file looked like when this session was opened. The store is
  // filled once by the load path, keyed by session id; a late answer for
  // another session (or a live turn that moved on) selects as null.
  const interruptionState = useSyncExternalStore(
    savedInterruptionStore.subscribe,
    savedInterruptionStore.getSnapshot,
    savedInterruptionStore.getSnapshot,
  )
  const savedInterruption = selectSavedInterruption(interruptionState, sessionId ?? null)

  // Pre-computed data (single combined pass, Iteration perf)
  const items = useBuildItems(messages, t, lastTurnOutcome, engineSteps, savedInterruption)
  const { showAvatarMap, showTimestampMap, lastUserMsgId, assistantReplyMap } = useMessageListMaps(messages)

  // PERF: keep the latest messages reachable from stable callbacks without
  // adding `messages` to their dependency arrays (that would re-create the
  // render callback on every streaming delta and defeat React.memo on Message).
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  const handleRewind = useCallback((ts: number) => {
    const msgs = messagesRef.current
    // Find the message index by timestamp to calculate how many messages will be removed
    const msgIndex = msgs.findIndex(m => m.role !== 'permission' && m.role !== 'plan' && m.role !== 'hook_callback' && m.role !== 'elicitation' && (m as StandardChatMessage).timestamp === ts)
    if (msgIndex < 0) return
    const count = msgs.length - msgIndex - 1
    if (count <= 0) return
    setRewindTarget({ msgId: msgs[msgIndex].id, ts, count })
  }, [])

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (idx) => {
      const item = items[idx]
      if (item.type === 'dateSep') return 32
      if (item.type === 'timeGap') return 28
      if (item.type === 'responseTime') return 22
      if (item.type === 'compactSep') return 36
      if (item.type === 'turnEnded') return 24
      if (item.type === 'interruption') return 32
      // Collapsed quiet rows are a single line; `measureElement` corrects this
      // when a "N engine steps" group is expanded.
      if (item.type === 'engineSteps') return 22
      return 80
    },
    // While the find bar is open, mount every row. The bar counts occurrences
    // in the transcript's DOM; with virtualization on, a "3 of 12" would be a
    // claim about rows that were never rendered or searched. Virtualization
    // resumes when the bar closes, so this cost is paid only while searching.
    overscan: findOpen ? items.length : 5,
  })

  const scrollState = useMessageListScroll(scrollContainerRef, messages, items, sessionId, isStreaming, virtualizer)

  // Per-tab scroll restore. The session-scoped restore inside the hook stores a
  // *percentage*; switching tabs doesn't change sessionId, so tabs need their
  // own pixel-exact path. Fires once per tab change, after layout settles.
  const restoreScrollTopRef = useRef(restoreScrollTop)
  restoreScrollTopRef.current = restoreScrollTop
  useEffect(() => {
    const target = restoreScrollTopRef.current
    if (!tabId || !target) return
    // Two frames: the virtualizer measures rows on the first paint, so its
    // scrollHeight is still only the estimate when the first frame lands and a
    // large offset would be clamped away. Re-apply once it has real heights.
    const rafs: number[] = []
    const apply = () => {
      const el = scrollContainerRef.current
      if (el) el.scrollTop = target
    }
    rafs.push(requestAnimationFrame(() => {
      apply()
      rafs.push(requestAnimationFrame(apply))
    }))
    return () => rafs.forEach(cancelAnimationFrame)
  }, [tabId])

  // Report scroll offset for the tab cache. Stable identity so the container's
  // onScroll prop doesn't churn on every ChatPanel render; the inner handler is
  // read through a ref for the same reason.
  const onScrollTopRef = useRef(onScrollTop)
  onScrollTopRef.current = onScrollTop
  const innerScrollHandlerRef = useRef(scrollState.handleScroll)
  innerScrollHandlerRef.current = scrollState.handleScroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    innerScrollHandlerRef.current()
    onScrollTopRef.current?.(e.currentTarget.scrollTop)
  }, [])

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

  const onForkRef = useRef(onFork)
  onForkRef.current = onFork
  // One stable handler per message id (Message.memo can then bail out).
  const forkHandlersRef = useRef(new Map<string, () => void>())
  const getForkHandler = useCallback((msgId: string) => {
    let handler = forkHandlersRef.current.get(msgId)
    if (!handler) {
      handler = () => {
        if (!onForkRef.current) return
        const idx = messagesRef.current.findIndex(m => m.id === msgId)
        if (idx >= 0) setForkTarget({ msgIdx: idx })
      }
      forkHandlersRef.current.set(msgId, handler)
    }
    return handler
  }, [])

  // Same stable-identity pattern for the Codex branch action: the handler is
  // created once per row and reads the latest callback through a ref.
  const onBranchRef = useRef(onBranch)
  onBranchRef.current = onBranch
  const branchHandlersRef = useRef(new Map<string, () => void>())
  const getBranchHandler = useCallback((msgId: string) => {
    let handler = branchHandlersRef.current.get(msgId)
    if (!handler) {
      handler = () => { onBranchRef.current?.(msgId) }
      branchHandlersRef.current.set(msgId, handler)
    }
    return handler
  }, [])

  const renderMessage = useCallback((msg: ChatMessage, isHighlighted: boolean, msgIdx: number, isLast: boolean) => {
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
    // A Codex user row is branchable while it still carries the turn id the
    // engine echoed. Disk-loaded rows have none, so they never offer it. While
    // a turn streams the action stays visible but disabled with the reason.
    const branch = onBranch && msg.role === 'user'
      ? branchAvailability(msg as StandardChatMessage, { isStreaming: !!isStreaming, sessionId })
      : { visible: false, enabled: false, reason: null as null }
    // PERF: stable, per-message callback identities. Message branches on
    // message.role itself, so the fork/rewind callbacks can be created in the
    // callback body — Message.memo bails out when the message object is unchanged.
    return (
      <MessageErrorBoundary messageContent={rawContent}>
      <Message
        message={msg}
        searchQuery={searchQuery}
        searchCaseSensitive={searchCaseSensitive}
        showAvatar={showAvatar}
        showTimestamp={showTimestamp}
        isLastUserMsg={msg.role === 'user' && msg.id === lastUserMsgId}
        isLastMessage={isLast}
        hasAssistantReply={msg.role === 'user' && (assistantReplyMap.get(msg.id) ?? false)}
        onRate={handleRate}
        onBookmark={handleBookmark}
        onCollapse={handleCollapse}
        onEdit={onEdit}
        // A natively branchable Codex row uses the engine branch action; the
        // file-level fork dialog remains for rows that have no turn id.
        onFork={onFork && !branch.visible ? getForkHandler(msg.id) : undefined}
        onBranch={branch.enabled ? getBranchHandler(msg.id) : undefined}
        branchBlockedReason={branch.visible && !branch.enabled && branch.reason
          ? t(forkBlockedKey(branch.reason))
          : undefined}
        onRewind={sessionId ? handleRewind : undefined}
      />
      </MessageErrorBoundary>
    )
  }, [onPermission, onGrantPermission, onAlwaysAllow, onAlwaysDeny, onRespondHookCallback, onRespondElicitation, sessionId, isStreaming, resolvePlan, searchQuery, searchCaseSensitive, showAvatarMap, showTimestampMap, onEdit, onFork, onBranch, getForkHandler, getBranchHandler, handleRewind, lastUserMsgId, assistantReplyMap, t])

  return (
    <div style={{ height: '100%', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      {/* Scroll progress bar. The track is transparent so a 1% fill is not
          accompanied by a visible hairline, and the fill is driven by
          transform so a scroll frame never triggers layout. */}
      {messages.length > 0 && (
        <div
          aria-hidden="true"
          style={{
            height: 2,
            background: 'transparent',
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
              width: '100%',
              background: 'var(--accent)',
              opacity: scrollState.scrollProgress >= 1 || scrollState.scrollProgress <= 0 ? 0 : 0.7,
              transform: `scaleX(${scrollState.scrollProgress})`,
              transformOrigin: 'left center',
              transition: 'transform 0.15s ease, opacity 0.15s ease',
              willChange: 'transform',
            }}
          />
        </div>
      )}
      {/* Pinned messages strip (extracted — Iteration 403) */}
      <PinnedMessagesStrip messages={messages} items={items} virtualizer={virtualizer} />
    {/* `data-find-transcript` marks the element the find bar walks. Only
        rendered message text carries `data-find-scope` underneath it. */}
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      data-find-transcript=""
      role="log"
      aria-label={t('a11y.conversationMessages')}
      aria-live="polite"
      style={{ flex: 1, overflowY: 'auto', padding: '16px 0', position: 'relative', background: 'transparent', scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent', scrollbarGutter: 'stable both-edges' }}
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
          if (item.type === 'engineSteps') {
            return (
              <VirtualSeparatorRow
                key={`engine-${item.key}`}
                type="engineSteps"
                steps={item.steps}
                rowKey={item.key}
                expanded={expandedStepGroups.has(item.key)}
                onToggle={toggleStepGroup}
                virtualRow={virtualRow}
                measureElement={virtualizer.measureElement}
              />
            )
          }
          if (item.type === 'dateSep' || item.type === 'timeGap' || item.type === 'responseTime' || item.type === 'compactSep' || item.type === 'turnEnded' || item.type === 'interruption') {
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
          const isEvidence = item.msgIdx === evidenceMessageIdx
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
              className={[entranceClass, isEvidence ? 'evidence-flash' : undefined].filter(Boolean).join(' ') || undefined}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div
                data-chat-column
                className="chat-column"
                style={{
                  outline: isHighlighted ? '2px solid var(--accent)' : 'none',
                  // Inset rather than border: a border would shift the
                  // message text 3px away from the composer edge when the
                  // row is focused.
                  boxShadow: isFocused ? 'inset 3px 0 0 var(--accent)' : 'none',
                  borderRadius: isHighlighted ? 4 : 0,
                  transition: 'all 0.15s ease',
                  background: isFocused ? 'var(--accent-bg)' : 'transparent',
                  boxSizing: 'border-box',
                }}
              >
                {renderMessage(msg, isHighlighted, item.msgIdx, isLastMessage)}
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
