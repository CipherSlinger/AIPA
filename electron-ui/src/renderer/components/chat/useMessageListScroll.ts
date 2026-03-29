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
          isNearBottomRef.current = el.scrollHeight - targetScroll - el.clientHeight < 80
          setShowScrollBtn(!isNearBottomRef.current)
        }
      })
    }
  }, [sessionId])

  const checkIfNearBottom = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }, [])

  const handleScroll = useCallback(() => {
    const nearBottom = checkIfNearBottom()
    isNearBottomRef.current = nearBottom
    setShowScrollBtn(!nearBottom)
    if (nearBottom) {
      lastSeenCountRef.current = messages.length
      setUnreadCount(0)
    }
    const el = scrollContainerRef.current
    setShowScrollTopBtn(el ? el.scrollTop > 400 : false)
    if (el) {
      const scrollable = el.scrollHeight - el.clientHeight
      const pct = scrollable > 0 ? Math.round((el.scrollTop / scrollable) * 100) : 100
      setScrollPct(pct)
      setScrollProgress(scrollable > 0 ? el.scrollTop / scrollable : 1)
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
