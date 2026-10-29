// The overlay's keyboard protocol, in one place.
//
// Three rules are easy to lose when this handler is copied around:
//
//   - While a turn runs or its answer shows, the result rows are not rendered.
//     Only Escape applies then; the answer's citation chips are real buttons in
//     the tab order and handle themselves.
//   - ArrowDown on the last loaded row asks for the next page instead of
//     wrapping. That keeps paging reachable without a mouse even when a filter
//     has hidden every loaded row (`flat` is empty). Focus stays on the input.
//   - Enter opens the highlighted row; it never submits a form. Ctrl/Cmd+Enter
//     is the ask shortcut and is checked first.
//
// Pure over its context so the harness can drive it with a fake event.

import type { KeyboardEvent } from 'react'
import type { SessionSearchResultData } from '../../../../preload/index'
import type { AskState } from './askHistory'

export interface OverlayKeyboardContext {
  askState: AskState
  /** Rows currently drawn, in render order. */
  flat: ReadonlyArray<SessionSearchResultData>
  active: number
  hasMore: boolean
  loadingMore: boolean
  loadMore: () => void
  /** Functional update: the handler never reads a stale `active`. */
  setActive: (update: (previous: number) => number) => void
  openHit: (hit: SessionSearchResultData) => void | Promise<void>
  close: () => void
  runAsk: () => void | Promise<void>
}

export function handleOverlayKeyDown(e: KeyboardEvent, ctx: OverlayKeyboardContext): void {
  const { askState, flat, active, hasMore, loadingMore, loadMore, setActive, openHit, close, runAsk } = ctx

  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    void runAsk()
    return
  }
  // While an ask is running or its answer is showing, the result rows are
  // not visible; only Escape applies. The answer's citation chips are real
  // buttons in the tab order.
  if (askState !== 'idle') {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    }
    return
  }
  if (e.key === 'ArrowDown') {
    // At the last loaded row, ArrowDown asks for the next page instead of
    // wrapping to the top. That makes paging reachable without a mouse even
    // when a filter has hidden every loaded row (flat is empty then). Focus
    // stays on the input; the page appends below and the user keeps arrowing.
    if (flat.length === 0) {
      if (hasMore && !loadingMore) {
        e.preventDefault()
        loadMore()
      }
      return
    }
    e.preventDefault()
    if (active >= flat.length - 1 && hasMore && !loadingMore) {
      loadMore()
      return
    }
    setActive(prev => (prev + 1) % flat.length)
  } else if (e.key === 'ArrowUp') {
    if (flat.length === 0) return
    e.preventDefault()
    setActive(prev => (prev - 1 + flat.length) % flat.length)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const hit = flat[active]
    if (hit) void openHit(hit)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    close()
  }
}
