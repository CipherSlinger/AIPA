# PRD: Welcome Page Adaptive Layout + Session Unread Badge

_Author: aipa-pm | Date: 2026-04-03 | Version: v1 | Priority: P1_

## Problem Statement

Two user-facing UI issues degrade the polished feel of AIPA:

1. **Welcome page scrollbar**: When the window is not tall enough, a scrollbar appears on the welcome page, which looks unprofessional. The current adaptive layout (ResizeObserver-based section hiding) partially addresses this but doesn't fully prevent overflow.

2. **Session badge semantics**: The blue badge on session items currently shows total message count -- this is informational noise, not actionable. Users expect a badge to indicate *unread* messages (like WeChat/iMessage). The color should be red to signal attention.

## In Scope (3 features)

### Feature 1: Welcome Page No-Scroll Adaptive Layout
- The welcome page container must use `overflow: hidden` (already present) AND ensure inner content never exceeds container height
- Strengthen the existing ResizeObserver adaptive logic: tighten thresholds so sections hide more aggressively
- When space is extremely tight (< 350px), show only hero + suggestion cards (the two most essential elements)
- Remove the bottom spacer or make it shrink-to-zero so content stays vertically centered without overflow
- The templates section and daily summary card should also participate in adaptive hiding

### Feature 2: Session Item Unread Badge (Red)
- Replace the current blue `messageCount` badge with a red *unread count* badge
- Badge only appears when a session has unread messages (received new assistant messages while the session was not active)
- Badge disappears when the user opens that session (marks as read)
- Use the existing `unreadSessionCount` infrastructure in uiStore but extend it to per-session granularity
- Badge visual: red circle, white text, min-width 16px, font-size 10px, positioned right side of session item

### Feature 3: Per-Session Unread Tracking
- Add `unreadSessions: Record<string, number>` to uiStore (maps sessionId -> unread message count)
- When `cli:result` or `cli:assistantText` arrives for a session that is NOT the currently active session, increment that session's unread count
- When user switches to a session, clear its unread count
- The NavRail history badge should show the total of all unread counts (sum of all values)

## Out of Scope
- Session badge for pinned sessions (same behavior as regular sessions)
- Sound/notification on new message -- future iteration
- Welcome page content reordering -- just hide low-priority sections

## User Flow
1. User opens AIPA with a small window -> welcome page shows hero + suggestions only, no scrollbar
2. User resizes window larger -> more sections progressively appear (stats, personas, shortcuts, tips)
3. User has multiple sessions, sends a message in session A, switches to session B
4. Session A receives a response -> session A shows red badge with "1"
5. User clicks session A -> badge disappears, messages are marked as read

## Technical Notes
- WelcomeScreen.tsx already has ResizeObserver + threshold-based hiding (lines 120-140). Adjust thresholds and add TemplatesSection + DailySummaryCard to the adaptive system.
- uiStore.ts already has `unreadSessionCount` (line 211). Extend with per-session map.
- SessionItem.tsx currently shows `session.messageCount` as a blue badge (line 238-243). Replace with unread badge.
- The stream bridge IPC events (`cli:assistantText`, `cli:result`) in `useStreamJson.ts` can trigger the unread increment.

## Acceptance Criteria
- [ ] Welcome page never shows a scrollbar at any window height (min 300px)
- [ ] Sections hide/show progressively as window height changes
- [ ] Session items show red badge only when there are unread messages
- [ ] Badge count reflects per-session unread messages, not total message count
- [ ] Opening a session clears its unread badge
- [ ] NavRail history badge shows total unread count across all sessions
- [ ] All new UI text has i18n keys (en + zh-CN)
- [ ] `npm run build` succeeds

## Primary Files (estimated)
- MODIFY: `src/renderer/components/chat/WelcomeScreen.tsx` (adaptive thresholds)
- MODIFY: `src/renderer/components/sessions/SessionItem.tsx` (badge logic + color)
- MODIFY: `src/renderer/store/uiStore.ts` (per-session unread tracking)
- MODIFY: `src/renderer/components/layout/NavRail.tsx` (badge count source)
- MODIFY: `src/renderer/hooks/useStreamJson.ts` (trigger unread increment)
- MODIFY: i18n files (append-only, **i18n entries to be merged by leader**)
