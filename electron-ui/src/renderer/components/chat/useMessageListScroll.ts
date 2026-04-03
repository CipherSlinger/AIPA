import { useRef, useState, useCallback, useEffect, RefObject } from 'react'
import { Virtualizer } from '@tanstack/react-virtual'
import { ChatMessage } from '../../types/app.types'
import { ListItem, scrollPositionMap } from './messageListUtils'

/**
 * Hook managing all scroll behavior for the MessageList:
 * - scroll position save/restore per session
 * - auto-scroll on new messages (respects scroll lock)
 * - scroll-to-bottom / scroll-to-top buttons visibility
 * - unread count badge
 * - scroll percentage display
 * - scroll progress bar (0-1)
 * - scroll lock during streaming
 * - keyboard navigation (Ctrl+Home/End, PageUp/Down, Alt+Up/Down user message jump)
 *
 * FIXED (Iteration 301): Consolidated scroll state updates to prevent
 * React error #185 (Maximum update depth exceeded). Previously, handleScroll
 * called 5 separate setState calls per scroll event, causing render cascades
 * during streaming. Now uses refs for rapidly-changing values and throttled
 * state updates.
 */
export function useMessageListScroll(
  scrollContainerRef: RefObject<HTMLDivElement | null>,
  messages: ChatMessage[],
  items: ListItem[],
  sessionId: string | null | undefined,
  isStreaming: boolean | undefined,
  virtualizer: Virtualizer<HTMLDivElement, Element>,
) {
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const [showScrollTopBtn, setShowScrollTopBtn] = useState(false)
  const [scrollPct, setScrollPct] = useState(100)
  const isNearBottomRef = useRef(true)
  const prevSessionIdRef = useRef<string | null | undefined>(sessionId)
  const lastSeenCountRef = useRef(messages.length)
  const [unreadCount, setUnreadCount] = useState(0)
  const [scrollLocked, setScrollLocked] = useState(false)
  const [scrollProgress, setScrollProgress] = useState(0)

  // Guard against auto-scroll re-entrance during streaming
  const autoScrollingRef = useRef(false)
  // Stable ref for last message ID to avoid inline dep in useEffect
  const lastMsgIdRef = useRef<string | undefined>(undefined)
  // Throttle timer for scroll state updates
  const scrollThrottleRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null)
  // STABILITY (Iteration 308): Keep messages.length in a ref so handleScroll
  // callback doesn't need it in its dependency array. During streaming,
  // messages.length changes every RAF flush, which would recreate handleScroll
  // and potentially cause cascading re-renders.
  const messagesLengthRef = useRef(messages.length)
  messagesLengthRef.current = messages.length

  // Save scroll position when session changes, restore for new session
  useEffect(() => {
    if (prevSessionIdRef.current && prevSessionIdRef.current !== sessionId) {
      const el = scrollContainerRef.current
      if (el) {
        const scrollable = el.scrollHeight - el.clientHeight
        const pct = scrollable > 0 ? el.scrollTop / scrollable : 1
        scrollPositionMap.set(prevSessionIdRef.current, pct)
      }
    }
    prevSessionIdRef.current = sessionId

    if (sessionId && scrollPositionMap.has(sessionId)) {
      const savedPct = scrollPositionMap.get(sessionId)!
      requestAnimationFrame(() => {
        const el = scrollContainerRef.current
        if (el) {
          const scrollable = el.scrollHeight - el.clientHeight
          const targetScroll = Math.round(savedPct * scrollable)
          el.scrollTop = targetScroll
          isNearBottomRef.current = el.scrollHeight - targetScroll - el.clientHeight < 100
          setShowScrollBtn(!isNearBottomRef.current)
        }
      })
    }
  }, [sessionId])

  const checkIfNearBottom = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 100
  }, [])

  // Throttled scroll handler: consolidates state updates into a single
  // requestAnimationFrame to prevent render cascade (React #185 fix)
  // STABILITY (Iteration 308): Removed messages.length from deps, use ref instead
  const handleScroll = useCallback(() => {
    // Update refs immediately (no render)
    const nearBottom = checkIfNearBottom()
    isNearBottomRef.current = nearBottom
    if (nearBottom) {
      lastSeenCountRef.current = messagesLengthRef.current
    }

    // Throttle state updates to one per animation frame
    if (scrollThrottleRef.current !== null) return
    scrollThrottleRef.current = requestAnimationFrame(() => {
      scrollThrottleRef.current = null

      const el = scrollContainerRef.current
      const currentNearBottom = isNearBottomRef.current

      // Batch all state updates together
      // Scroll-to-bottom button: show when scrolled up >= 300px from bottom (PRD Iteration 461)
      const distFromBottom = el ? el.scrollHeight - el.scrollTop - el.clientHeight : 0
      setShowScrollBtn(distFromBottom >= 300)
      if (currentNearBottom) {
        setUnreadCount(0)
      }
      setShowScrollTopBtn(el ? el.scrollTop > 400 : false)
      if (el) {
        const scrollable = el.scrollHeight - el.clientHeight
        const pct = scrollable > 0 ? Math.round((el.scrollTop / scrollable) * 100) : 100
        setScrollPct(pct)
        setScrollProgress(scrollable > 0 ? el.scrollTop / scrollable : 1)
      }
    })
  }, [checkIfNearBottom])

  // Cleanup throttle timer on unmount
  useEffect(() => {
    return () => {
      if (scrollThrottleRef.current !== null) {
        cancelAnimationFrame(scrollThrottleRef.current)
      }
    }
  }, [])

  const scrollToBottom = useCallback(() => {
    if (items.length > 0) {
      virtualizer.scrollToIndex(items.length - 1, { align: 'end', behavior: 'smooth' })
    }
  }, [items.length, virtualizer])

  const scrollToTop = useCallback(() => {
    virtualizer.scrollToIndex(0, { align: 'start', behavior: 'smooth' })
  }, [virtualizer])

  // Keep scrollLocked in a ref so the auto-scroll effect can read it without
  // adding it to the dependency array. This breaks the loop:
  //   messages.length change → effect → setScrollLocked → scrollLocked change
  //   → effect reruns → setUnreadCount → rerender → loop
  // STABILITY (Iteration 308): scrollLocked state drives UI (lock button color),
  // but the auto-scroll logic only needs to *read* it, not react to its changes.
  const scrollLockedRef = useRef(scrollLocked)
  scrollLockedRef.current = scrollLocked

  // Auto-scroll only when user is near the bottom and scroll is not locked.
  // Uses a ref guard to prevent re-entrance during streaming when scrollToIndex
  // triggers scroll events that update state and re-trigger this effect.
  //
  // STABILITY (Iteration 308): setState calls inside this effect are wrapped in
  // RAF (via the shared scrollThrottleRef pattern) to prevent synchronous
  // state-update cascades during streaming. During a streaming burst, messages.length
  // can change 10-30 times per second; without batching those setState calls hit
  // React's 50-update safety limit (error #185).
  const autoScrollStateRAFRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null)

  useEffect(() => {
    const lastMsgId = messages.length > 0 ? messages[messages.length - 1]?.id : undefined
    // Skip if the last message hasn't actually changed
    if (lastMsgId === lastMsgIdRef.current && messages.length === lastSeenCountRef.current) {
      return
    }
    lastMsgIdRef.current = lastMsgId

    if (isNearBottomRef.current && !scrollLockedRef.current && items.length > 0) {
      // Guard against re-entrance: scrollToIndex fires scroll events
      // which could trigger handleScroll -> state updates -> re-render -> this effect
      if (!autoScrollingRef.current) {
        autoScrollingRef.current = true
        requestAnimationFrame(() => {
          virtualizer.scrollToIndex(items.length - 1, { align: 'end', behavior: 'smooth' })
          // Release guard after a short delay to let the scroll settle
          setTimeout(() => { autoScrollingRef.current = false }, 100)
        })
      }
      lastSeenCountRef.current = messages.length
      // STABILITY (Iteration 308): Batch state update via RAF instead of calling
      // setState synchronously inside the effect. Synchronous setState here would
      // immediately queue a re-render which can retrigger this effect before React
      // has finished processing the current render batch, contributing to #185.
      if (autoScrollStateRAFRef.current !== null) cancelAnimationFrame(autoScrollStateRAFRef.current)
      autoScrollStateRAFRef.current = requestAnimationFrame(() => {
        autoScrollStateRAFRef.current = null
        setUnreadCount(0)
      })
    } else if (items.length > 0) {
      const newMessages = messages.length - lastSeenCountRef.current
      if (autoScrollStateRAFRef.current !== null) cancelAnimationFrame(autoScrollStateRAFRef.current)
      autoScrollStateRAFRef.current = requestAnimationFrame(() => {
        autoScrollStateRAFRef.current = null
        setShowScrollBtn(true)
        if (newMessages > 0) {
          setUnreadCount(newMessages)
        }
      })
    }
  }, [messages.length, items.length]) // scrollLocked intentionally excluded — read via ref above

  // Cleanup auto-scroll RAF on unmount
  useEffect(() => {
    return () => {
      if (autoScrollStateRAFRef.current !== null) {
        cancelAnimationFrame(autoScrollStateRAFRef.current)
      }
    }
  }, [])

  // Auto-unlock scroll when streaming stops.
  // STABILITY (Iteration 308): Both isStreaming and scrollLocked are in deps.
  // Without scrollLocked in deps, this effect uses a stale closure where
  // scrollLocked is always false (its initial value), so the condition
  // `!isStreaming && scrollLocked` never fires. Adding scrollLocked to deps
  // is safe because this effect only runs when isStreaming transitions false→true
  // or when scrollLocked is manually set by the user — both are rare events,
  // not streaming-frequency updates.
  useEffect(() => {
    if (!isStreaming && scrollLocked) setScrollLocked(false)
  }, [isStreaming, scrollLocked])

  // Keyboard navigation: Ctrl+Home (first), Ctrl+End (last), PageUp/Down, Alt+Up/Down
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
      const pageSize = el.clientHeight * 0.8
      el.scrollBy({ top: direction === 'up' ? -pageSize : pageSize, behavior: 'smooth' })
    }
    const userMessageIndices = items.reduce<number[]>((acc, item, idx) => {
      if (item.type === 'message' && item.msg.role === 'user') acc.push(idx)
      return acc
    }, [])
    const handleJumpUserMessage = (e: Event) => {
      const direction = (e as CustomEvent).detail as 'prev' | 'next'
      if (userMessageIndices.length === 0) return
      const el = scrollContainerRef.current
      if (!el) return
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

  return {
    showScrollBtn,
    showScrollTopBtn,
    scrollPct,
    unreadCount,
    scrollLocked,
    setScrollLocked,
    scrollProgress,
    handleScroll,
    scrollToBottom,
    scrollToTop,
  }
}
