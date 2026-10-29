import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useChatStore } from '../store'
import type { ChatMessage, StandardChatMessage } from '../types/app.types'
import {
  buildFindState,
  clampMatchIndex,
  findRangesInText,
  normalizeFindQuery,
  stepMatchIndex,
  type FindDirection,
  type FindScope,
  type FindState,
} from '../lib/findInText'
import {
  MAX_FIND_EXPAND_BODIES,
  MAX_FIND_EXPAND_CHARS,
  collapsedMessageIds,
  measureExpandCost,
  messagesToRecollapse,
  type ExpandBlock,
  type FindExpandMessage,
} from '../lib/findScope'

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
 * thinking block, a raw-markdown view, a collapsed preview — so timestamps and
 * the find bar itself cannot contribute phantom matches. The tool group inside
 * a bubble carries the marker only while the "include tool output" toggle is
 * on; off, tool text is out of scope exactly as before.
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
  /**
   * How many rows are collapsed right now. Collapsing a row hides text that
   * may already be counted, so a change here is also a change of content —
   * cheap to compute, and it keeps the count describing the DOM.
   */
  collapsedCount: number
  /** A turn settling is the other cheap point at which text is final. */
  isStreaming: boolean
}

/** The store's messages in the shape the pure expand planner needs. */
function toExpandShape(message: ChatMessage): FindExpandMessage {
  const standard = message as StandardChatMessage
  const toolUses = Array.isArray(standard.toolUses) ? standard.toolUses : []
  // String lengths stand in for rendered size: no DOM, no parse, and the same
  // number the planner's char budget was calibrated against.
  let toolChars = 0
  for (const tool of toolUses) {
    if (typeof tool.result === 'string') toolChars += tool.result.length
    else if (tool.result != null) toolChars += JSON.stringify(tool.result).length
  }
  return {
    textChars: typeof standard.content === 'string' ? standard.content.length : 0,
    toolChars,
    toolUseCount: toolUses.length,
    id: message.id,
    role: message.role,
    collapsed: standard.collapsed,
  }
}

export function useFindInChat({ hasMessages, messageCount, collapsedCount, isStreaming }: FindInChatOptions) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [total, setTotal] = useState(0)
  const [current, setCurrent] = useState(0)
  /** "Include tool output" — off by default, and ends with the bar. */
  const [includeToolOutput, setIncludeToolOutput] = useState(false)
  /** Set when the transcript is too large to expand safely: what it refused. */
  const [expandBlocked, setExpandBlocked] = useState<ExpandBlock | null>(null)

  const rangesRef = useRef<Range[]>([])
  const currentRef = useRef(current)
  currentRef.current = current
  /** Set by a step so a re-render caused by anything else never scrolls. */
  const pendingScrollRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  /** Where the caret was before Ctrl+F, so Escape can put it back. */
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  /** Rows that were collapsed before the toggle expanded them; see restore(). */
  const collapsedSnapshotRef = useRef<string[]>([])

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

  /**
   * Put the transcript's collapse state back the way the user left it.
   *
   * Only ids captured when the toggle was turned on are touched, and only if
   * they still exist. A message added while the search was deep was never
   * collapsed by us, so it keeps the state it has — which matters mid-stream,
   * where collapsing a freshly arrived answer would be a surprise the user
   * never asked for.
   */
  const restoreCollapse = useCallback(() => {
    if (collapsedSnapshotRef.current.length === 0) return
    const live = useChatStore.getState().messages.map(toExpandShape)
    const ids = messagesToRecollapse(collapsedSnapshotRef.current, live)
    collapsedSnapshotRef.current = []
    if (ids.length > 0) useChatStore.getState().collapseMessages(ids)
  }, [])

  const toggleToolOutput = useCallback(() => {
    if (includeToolOutput) {
      // Back to the messages-only scan, and back to the transcript the user
      // had. The query survives: its count is recomputed over the smaller set.
      restoreCollapse()
      setIncludeToolOutput(false)
      setExpandBlocked(null)
      return
    }

    const shapes = useChatStore.getState().messages.map(toExpandShape)
    const cost = measureExpandCost(shapes)
    // Refuse rather than scan a partial set: the bar then says why the toggle
    // is still off, and the count keeps naming the messages-only set. Bodies
    // are checked first because that is the cost a user can reason about.
    if (cost.bodies > MAX_FIND_EXPAND_BODIES) {
      setExpandBlocked({ reason: 'bodies', cost: cost.bodies, limit: MAX_FIND_EXPAND_BODIES })
      return
    }
    if (cost.chars > MAX_FIND_EXPAND_CHARS) {
      setExpandBlocked({ reason: 'chars', cost: cost.chars, limit: MAX_FIND_EXPAND_CHARS })
      return
    }

    collapsedSnapshotRef.current = collapsedMessageIds(shapes)
    useChatStore.getState().expandAll()
    setExpandBlocked(null)
    setIncludeToolOutput(true)
  }, [includeToolOutput, restoreCollapse])

  const closeBar = useCallback(() => {
    setOpen(false)
    clearHighlights()
    rangesRef.current = []
    setTotal(0)
    setCurrent(0)
    // The deep-search mode ends with the bar; leaving the transcript expanded
    // would hand the user back a different conversation from the one they had.
    restoreCollapse()
    setIncludeToolOutput(false)
    setExpandBlocked(null)
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
  }, [restoreCollapse])

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
  // added, when a row is collapsed or expanded (that changes what is on
  // screen), when the tool-output toggle flips, and when a turn finishes (the
  // moment the transcript's text stops changing). None of those touches the
  // user's scroll position.
  //
  // A layout effect, not an effect: MessageList mounts every row in the same
  // commit that opens this bar (ref callbacks have already measured them), and
  // scanning before paint means a new query never flashes the previous query's
  // count or, worse, a premature "No matches". The tool-output toggle lands in
  // the same commit that expands the bodies it needs, for the same reason.
  useLayoutEffect(() => {
    if (!open) {
      clearHighlights()
      rangesRef.current = []
      return
    }
    scan()
  }, [open, scan, messageCount, collapsedCount, isStreaming, includeToolOutput])

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
  // at removed nodes, nor a transcript expanded by a search that no longer
  // exists. The bar is the only thing that clears either on close.
  useEffect(() => () => {
    clearHighlights()
    rangesRef.current = []
    restoreCollapse()
  }, [restoreCollapse])

  const step = useCallback((direction: FindDirection) => {
    const ranges = rangesRef.current
    if (ranges.length === 0) return
    pendingScrollRef.current = true
    setCurrent(stepMatchIndex(currentRef.current, ranges.length, direction))
  }, [])

  const next = useCallback(() => step('next'), [step])
  const prev = useCallback(() => step('prev'), [step])

  // The scope travels inside the state: the sentence that reports a count and
  // the sentence that reports a failed search are then guaranteed to name the
  // same set.
  const scope: FindScope = includeToolOutput ? 'messages-tools' : 'messages'
  const state: FindState = useMemo(
    () => buildFindState(query, total, hasMessages, current, scope),
    [query, total, hasMessages, current, scope],
  )

  return {
    open,
    query,
    state,
    includeToolOutput,
    expandBlocked,
    inputRef,
    openBar,
    closeBar,
    changeQuery,
    toggleToolOutput,
    next,
    prev,
  }
}
