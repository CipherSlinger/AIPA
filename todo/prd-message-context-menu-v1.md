# PRD: Message Context Menu

**Author**: aipa-pm
**Date**: 2026-03-26
**Priority**: P1
**Status**: Draft

## Problem

Currently, message actions (copy, rate, rewind) only appear as small hover buttons positioned absolutely on the right side of each message. This has multiple UX issues:
1. Actions are not discoverable -- users don't know they can copy, rate, or rewind messages
2. The absolute positioning causes overlap with message content on narrow windows
3. There's no way to select message text without accidentally triggering hover actions
4. Rewind button text ("回滚") is cryptic without explanation

## Solution

Add a right-click context menu to messages with clearly labeled actions. Keep the hover copy button as a quick-access shortcut but move other actions (rate, rewind) into the context menu exclusively.

## Acceptance Criteria

1. Right-clicking an assistant message shows a context menu with: Copy Text, Rate Up, Rate Down, Rewind to Here
2. Right-clicking a user message shows a context menu with: Copy Text
3. Context menu appears at cursor position with proper viewport boundary clamping
4. Context menu closes on: click outside, Escape key, selecting an action
5. Menu items show keyboard shortcut hints where applicable
6. Hover copy button remains as a quick shortcut for assistant messages
7. Rate/rewind buttons are removed from hover overlay (moved to context menu only)
8. Context menu respects theme CSS variables for consistent styling
9. Menu items have hover highlighting
10. Context menu does not appear during text selection (only on right-click without selection)

## Out of Scope

- Custom key bindings for individual message actions
- Context menu on permission/plan cards
- Multi-message selection

## Dependencies

- Existing `rateMessage` action in useChatStore
- Existing `onRewind` callback in MessageList
