# PRD: Conversation Branching & Forking

_Author: aipa-pm (via agent-leader) | Date: 2026-04-03 | Version: v1_

## Problem Statement

Users frequently want to explore alternative AI responses without losing the current conversation thread. Currently, the only option is to edit a message and regenerate, which overwrites the original response. Power users need the ability to branch conversations at any point, creating parallel exploration paths while preserving all history.

## In Scope (3 features)

### Feature 1: Fork at Any Message
- Right-click or toolbar button on any user message to "Fork from here"
- Creates a new branch starting from that message, preserving the original conversation intact
- The forked branch opens as a new session with a title suffix like "(Fork from [original title])"
- The original session's messages up to the fork point are copied into the new session

### Feature 2: Branch Indicator Badge
- When a session has been forked, show a small branch icon (git-branch style) on the message where the fork occurred
- Hovering the badge shows a tooltip: "Forked to: [session title]" with a clickable link to jump to the forked session
- The forked session also shows a "Forked from: [original title]" indicator at the top

### Feature 3: Compare Responses Side-by-Side
- After forking, user can open a "Compare" view that shows two branches side by side
- Accessible from the branch indicator badge context menu: "Compare with fork"
- Split-pane layout: left = original branch messages, right = forked branch messages
- Messages before the fork point are shown once (shared), diverging messages are shown in parallel columns

## Out of Scope
- Multi-level branching (fork of a fork) -- defer to future iteration
- Automatic model switching on fork -- user manually changes model if desired
- Merging branches back together

## User Flow
1. User is in a conversation, sees an AI response they want to explore alternatives for
2. User right-clicks the message above the response -> "Fork from here"
3. System creates a new session with messages copied up to that point
4. User types a different prompt or the same prompt to get an alternative response
5. Original session shows a branch badge on the fork point message
6. User can click badge -> "Compare" to see both branches side by side

## Technical Notes
- Fork operation is purely a session-level copy: read messages from JSONL up to fork point, write them to a new session
- Branch metadata stored in session's electron-store preferences (map of messageId -> forkedSessionId)
- Compare view is a new component `CompareView.tsx` that renders two `MessageList` instances
- No store changes needed -- use existing session switching + a local React state for compare mode

## Acceptance Criteria
- [x] "Fork from here" appears in message context menu for user messages
- [x] Forking creates a new session with correct message history
- [x] Branch badge appears on fork point messages
- [x] Badge tooltip shows forked session title with clickable link
- [x] Compare view shows shared prefix + diverging responses in split pane
- [x] All new UI text has i18n keys (en + zh-CN)
- [x] `npm run build` succeeds

## Primary Files (estimated)
- NEW: `src/renderer/components/chat/CompareView.tsx`
- NEW: `src/renderer/components/chat/BranchBadge.tsx`
- MODIFY: `src/renderer/components/chat/MessageContextMenu.tsx` (add Fork option)
- MODIFY: `src/renderer/components/chat/MessageActionToolbar.tsx` (add Fork button)
- MODIFY: `src/renderer/components/chat/ChatPanel.tsx` (compare mode toggle)
- MODIFY: i18n files (append-only)

_Implemented as Iteration 457 (2026-04-03). All acceptance criteria met._
