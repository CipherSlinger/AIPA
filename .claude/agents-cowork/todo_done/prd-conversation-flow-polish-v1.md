# PRD: Conversation Flow Polish
_Date: 2026-04-03 | Author: aipa-pm_

## Background
The chat experience feels static. Adding subtle motion and visual feedback makes the app feel alive and responsive — a key differentiator from terminal-based tools.

## In Scope

### 1. Streaming Cursor
Show an animated blinking cursor at the end of the currently-streaming assistant message.

**Acceptance Criteria**:
- Blinking `|` or block cursor appended to the last streamed text character while `isStreaming === true`
- Cursor disappears immediately when streaming ends
- CSS animation only (no JS timers), 1s blink cycle
- Does not affect copy/paste behavior

### 2. Message Entrance Animation
New messages slide in with a subtle fade+translate animation.

**Acceptance Criteria**:
- Each new message bubble animates in: `opacity 0→1` + `translateY 8px→0` over 200ms ease-out
- Applied via CSS class `.message-enter` on mount
- Only triggers for new messages, not on initial load/scroll
- Respects `prefers-reduced-motion` media query (skip animation if set)

### 3. Smooth Auto-Scroll
Auto-scroll to bottom feels jarring on fast streams. Make it smooth.

**Acceptance Criteria**:
- Replace `scrollIntoView({ behavior: 'instant' })` with `behavior: 'smooth'` during streaming
- Auto-scroll only follows if user is within 100px of the bottom (don't hijack manual scrolling)
- Scroll-to-bottom button appears when user has scrolled up ≥200px

## Out of Scope
- Typing indicators (separate feature)
- Sound effects
- i18n changes

## Technical Notes
- Streaming cursor: add `.streaming-cursor` span after text in `MessageBubbleContent.tsx`
- Message animation: add CSS keyframe in `globals.css`, apply class in `MessageBubble.tsx`
- Scroll logic: update `useAutoScroll` hook or scroll logic in `MessageList.tsx`
- High-risk files: `MessageList.tsx`, `MessageBubble.tsx` / `MessageBubbleContent.tsx`, `globals.css`
