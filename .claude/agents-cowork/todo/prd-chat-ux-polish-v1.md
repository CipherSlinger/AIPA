# PRD: Chat UX Polish

_Version: 1.0 | Date: 2026-04-03 | Author: agent-leader (acting as PM)_

## Background

The chat experience is functionally complete but lacks several small polish touches that professional chat applications provide. These micro-interactions reduce cognitive friction and make the app feel more refined. None of these individually justify a full feature cycle, but together they represent a meaningful UX upgrade.

## In Scope (4 features)

### Feature 1: Scroll-to-Bottom FAB

When the user scrolls up in the message list and new messages arrive, show a floating action button (FAB) at the bottom-right of the chat area with a down-arrow icon and an unread message count badge. Clicking it smooth-scrolls to the latest message.

**Acceptance Criteria:**
- [x] FAB appears when user scrolls > 300px from bottom of message list
- [x] FAB shows count of messages received since scrolling away (badge number)
- [x] Click FAB → smooth scroll to bottom, FAB disappears
- [x] FAB has subtle entrance/exit animation (fade + slide up)
- [x] Does not appear when auto-scrolling during AI streaming (only when user manually scrolled up)

### Feature 2: Message Timestamp on Hover

Currently messages don't show individual timestamps. Add a subtle timestamp that appears on hover, showing the exact time (HH:mm) next to the message. For messages older than today, show date + time.

**Acceptance Criteria:**
- [x] Hovering over a message shows timestamp on the message edge (right side for user, left side for assistant)
- [x] Format: "HH:mm" for today's messages, "MMM DD, HH:mm" for older messages
- [x] Timestamp uses smaller font (11px), muted color (var(--text-tertiary))
- [x] Fade-in animation on hover, fade-out on mouse leave (150ms transition)
- [x] Does not interfere with existing message action toolbar

### Feature 3: AI Typing Status Indicator

Replace the current thinking indicator with a more informative typing status shown in the chat area footer (above the input). Shows contextual status: "Thinking...", "Reading file...", "Running command...", "Writing response..." based on the current stream-json event type.

**Acceptance Criteria:**
- [x] Status line appears between message list and input when AI is processing
- [x] Shows contextual verb based on latest event: `toolUse` → "Using [tool name]...", `textDelta` → "Writing...", default → "Thinking..."
- [x] Animated dots or subtle pulse animation
- [x] Disappears when streaming ends (result event)
- [x] Compact single-line, does not push layout

### Feature 4: Empty State for Session List

When there are no sessions yet (fresh install or after deleting all), show a friendly empty state in the session list sidebar instead of a blank panel.

**Acceptance Criteria:**
- [x] Shows centered illustration placeholder (chat bubble icon) + "No conversations yet" text
- [x] "Start a new chat" button that triggers new session creation
- [x] Helpful subtitle: "Your conversation history will appear here"
- [x] Matches the app's visual style (dark/light theme aware)

## Out of Scope

- Message reactions/emoji responses (too complex for this batch)
- Read receipts or "seen" indicators
- Animated avatar during AI response

## Technical Notes

- Scroll-to-Bottom FAB goes in `MessageList.tsx` or as a sibling in `ChatPanel.tsx` — uses the existing scroll ref
- Timestamp on hover modifies `Message.tsx` — add a hover state and absolute-positioned timestamp element
- Typing status can extend the existing `ThinkingIndicator.tsx` or replace it with a smarter component that reads `chatStore.currentToolName`
- Empty state is a pure UI component in `SessionList.tsx`

## File Impact Estimate

- **New files**: `ScrollToBottomFab.tsx`, `TypingStatus.tsx`
- **Modified**: `MessageList.tsx` (scroll detection), `Message.tsx` (timestamp hover), `SessionList.tsx` (empty state), `ChatPanel.tsx` (typing status placement)
- **Store**: Minor — may read from `chatStore` for streaming state, no new store fields needed
- **i18n**: `en.json`, `zh-CN.json` (new keys: chat.scrollToBottom, chat.noMessagesYet, chat.typingStatus.*, session.emptyState.*)

## Priority

P2 — UX polish, no new capabilities but significant perceived quality improvement
