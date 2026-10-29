import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  buildFindState,
  clampMatchIndex,
  findRangesInText,
  normalizeFindQuery,
  stepMatchIndex,
  type FindDirection,
  type FindState,
} from '../lib/findInText'

const ALL_HIGHLIGHT = 'aipa-find'
const CURRENT_HIGHLIGHT = 'aipa-find-current'
const FALLBACK_ATTR = 'data-find-fallback'
const FALLBACK_CURRENT_ATTR = 'data-find-fallback-current'

/**
 * Chromium 105+ ships the CSS Custom Highlight API; Electron 39 is far past
 * that. The check is still explicit because `CSS.highlights` is a runtime
 * property, and a missing one must fall back instead of throwing on open.
 */
function supportsCssHighlights(): boolean {
  return typeof CSS !== 'undefined'
    && typeof Highlight !== 'undefined'
    && typeof CSS.highlights !== 'undefined'
}

function clearHighlights(): void {
  if (supportsCssHighlights()) {
    CSS.highlights.delete(ALL_HIGHLIGHT)
    CSS.highlights.delete(CURRENT_HIGHLIGHT)
  }
  // Fallback markers are removed even when the API exists: the user may have
  // moved the app between engines, and a stale outline would be a lie.
  document
    .querySelectorAll<HTMLElement>(`[${FALLBACK_ATTR}], [${FALLBACK_CURRENT_ATTR}]`)
    .forEach(el => {
      el.removeAttribute(FALLBACK_ATTR)
      el.removeAttribute(FALLBACK_CURRENT_ATTR)
    })
}

/**
 * Walk the transcript's text nodes and turn every occurrence into a Range.
 *
 * Only nodes inside a `[data-find-scope]` are read. Those markers sit on the
 * elements that actually display message text — markdown output, an expanded
 * thinking block, a raw-markdown view, a collapsed preview — so timestamps,
 * tool cards and the find bar itself cannot contribute phantom matches.
 * Markdown syntax never reaches the DOM, so no HTML is rewritten to strip it.
 *
 * A match split across two inline elements (e.g. "foo**bar**" rendering as two
 * text nodes) is not found; that is the same limit a node-local scan has, and
 * crossing element boundaries would need a layout-aware text model that this
 * bar should not be inventing.
 */
function collectRanges(root: HTMLElement, needle: string): Range[] {
  const ranges: Range[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()

  while (node) {
    const parent = node.parentElement
    if (
      parent
      && !parent.closest('[data-find-bar]')
      // Code-block headers and other controls inside a message are chrome,
      // not message text: searching "Copy" should not find a button label.
      && !parent.closest('button, [aria-hidden="true"]')
      && parent.closest('[data-find-scope]')
    ) {
      const text = node.nodeValue || ''
      for (const { start, end } of findRangesInText(text, needle)) {
        const range = document.createRange()
        range.setStart(node, start)
        range.setEnd(node, end)
        ranges.push(range)
      }
    }
    node = walker.nextNode()
  }

  return ranges
}

function applyHighlights(ranges: Range[], current: number): void {
  clearHighlights()
  if (ranges.length === 0) return

  const currentIndex = clampMatchIndex(current, ranges.length)

  if (supportsCssHighlights()) {
    // The active match is kept out of the "all matches" registry so the two
    // paints never overlap; the same Range cannot live in both highlights.
    const others = ranges.filter((_, index) => index !== currentIndex)
    if (others.length > 0) {
      CSS.highlights.set(ALL_HIGHLIGHT, new Highlight(...others))
    }
    CSS.highlights.set(CURRENT_HIGHLIGHT, new Highlight(ranges[currentIndex]))
    return
  }

  // Fallback: mark the containing visible text block. The element is React's
  // own DOM node; attributes are added and removed on cleanup, the subtree is
  // never rebuilt.
  ranges.forEach((range, index) => {
    const element = range.startContainer.parentElement?.closest<HTMLElement>('[data-find-scope]')
    if (!element) return
    element.setAttribute(FALLBACK_ATTR, '')
    if (index === currentIndex) element.setAttribute(FALLBACK_CURRENT_ATTR, '')
  })
}

function scrollRangeIntoView(range: Range | undefined): void {
  if (!range) return
  // A text node has no box of its own; its parent is the smallest element that
  // contains the occurrence.
  range.startContainer.parentElement?.scrollIntoView({ block: 'center' })
}

interface FindInChatOptions {
  /** Whether the conversation has any messages at all, loaded or not. */
  hasMessages: boolean
  /** Re-scans when a message is added; the transcript's content changed. */
  messageCount: number
  /** A turn settling is the other cheap point at which text is final. */
  isStreaming: boolean
}

export function useFindInChat({ hasMessages, messageCount, isStreaming }: FindInChatOptions) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [total, setTotal] = useState(0)
  const [current, setCurrent] = useState(0)

  const rangesRef = useRef<Range[]>([])
  const currentRef = useRef(current)
  currentRef.current = current
  /** Set by a step so a re-render caused by anything else never scrolls. */
  const pendingScrollRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  /** Where the caret was before Ctrl+F, so Escape can put it back. */
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  const openBar = useCallback(() => {
    const active = document.activeElement
    if (
      active instanceof HTMLElement
      && active !== document.body
      && !active.closest('[data-find-bar]')
    ) {
      restoreFocusRef.current = active
    }
    setOpen(true)
    // The input mounts with the bar; focus it once that commit has landed.
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [])

  const closeBar = useCallback(() => {
    setOpen(false)
    clearHighlights()
    rangesRef.current = []
    setTotal(0)
    setCurrent(0)
    // Closing ends the search. Keeping the text would make the next open show
    // the retained query with a zero count for the frame before the re-scan,
    // which reads as "no matches" when nothing has been searched yet.
    setQuery('')

    const target = restoreFocusRef.current
    restoreFocusRef.current = null
    // Focus after the bar has been removed, or the browser would leave the
    // caret on the container that just disappeared.
    requestAnimationFrame(() => {
      if (target && target.isConnected) target.focus()
    })
  }, [])

  const changeQuery = useCallback((value: string) => {
    setQuery(value)
    // A new query is a new result list; keeping index 7 would point at an
    // unrelated occurrence, so the next Enter starts from the first match.
    setCurrent(0)
  }, [])

  const scan = useCallback(() => {
    const needle = normalizeFindQuery(query)
    if (!needle) {
      rangesRef.current = []
      setTotal(0)
      clearHighlights()
      return
    }

    const root = document.querySelector<HTMLElement>('[data-find-transcript]')
    if (!root) {
      // The transcript is not on screen. Keep the previous answer out of the
      // counter rather than pretending it still describes this view.
      rangesRef.current = []
      setTotal(0)
      clearHighlights()
      return
    }

    const ranges = collectRanges(root, needle)
    rangesRef.current = ranges
    // Keep the standing match where possible: an append at the end of the
    // conversation does not move any earlier occurrence, so index-stability is
    // the honest "stay where the user was" for this list.
    const next = clampMatchIndex(currentRef.current, ranges.length)
    setTotal(ranges.length)
    setCurrent(next)
    // Apply even when both state values are unchanged: a re-scan can replace
    // the Range objects while the count stays equal, and React would bail out
    // of the state updates, leaving the old registrations in place.
    applyHighlights(ranges, next)
  }, [query])

  // Recompute policy, and why it is this small:
  //
  // Re-walking the DOM on every streaming delta would rebuild hundreds of
  // Ranges per animation frame, and the text under them is being replaced as
  // it streams. The count would flicker without helping anyone read. So the
  // scan runs when the bar opens, when the query changes, when a message is
  // added, and when a turn finishes (the moment the transcript's text stops
  // changing). None of those touches the user's scroll position.
  //
  // A layout effect, not an effect: MessageList mounts every row in the same
  // commit that opens this bar (ref callbacks have already measured them), and
  // scanning before paint means a new query never flashes the previous query's
  // count or, worse, a premature "No matches".
  useLayoutEffect(() => {
    if (!open) {
      clearHighlights()
      rangesRef.current = []
      return
    }
    scan()
  }, [open, scan, messageCount, isStreaming])

  // Stepping is the only action allowed to move the viewport.
  useEffect(() => {
    if (!open) return
    applyHighlights(rangesRef.current, current)
    if (pendingScrollRef.current) {
      pendingScrollRef.current = false
      scrollRangeIntoView(rangesRef.current[current])
    }
  }, [open, current])

  // Leaving the view while the bar is open must not leave a registry pointing
  // at removed nodes; the bar is the only thing that clears it on close.
  useEffect(() => () => {
    clearHighlights()
    rangesRef.current = []
  }, [])

  const step = useCallback((direction: FindDirection) => {
    const ranges = rangesRef.current
    if (ranges.length === 0) return
    pendingScrollRef.current = true
    setCurrent(stepMatchIndex(currentRef.current, ranges.length, direction))
  }, [])

  const next = useCallback(() => step('next'), [step])
  const prev = useCallback(() => step('prev'), [step])

  const state: FindState = useMemo(
    () => buildFindState(query, total, hasMessages, current),
    [query, total, hasMessages, current],
  )

  return {
    open,
    query,
    state,
    inputRef,
    openBar,
    closeBar,
    changeQuery,
    next,
    prev,
  }
}
