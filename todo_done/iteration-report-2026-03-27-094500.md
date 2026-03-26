# Iteration Report: Unread Count Badge + Double-Click Copy

**Date**: 2026-03-27 09:45
**Iteration**: 36
**Status**: COMPLETE
**Build**: PASS (Vite)

## Changes

### Enhancement: Unread Message Count on Scroll Button

When the user scrolls up and new messages arrive:
- The scroll-to-bottom button now shows a count of unread/new messages
- Button expands from a circle to a pill shape when count is shown (e.g., "[arrow] 3")
- Count tracks messages that arrived since the user scrolled away from bottom
- Resets when user scrolls back to near-bottom position
- Tooltip updates to show "3 new messages" instead of just "Scroll to bottom"

### Enhancement: Double-Click to Copy Message

- Double-clicking any message copies its text content to clipboard
- Works on both user and assistant messages
- Reuses the existing "Copied" visual feedback
- Provides a faster alternative to right-click > Copy text
- Does not trigger for permission or plan card messages

### Modified Files
- `electron-ui/src/renderer/components/chat/MessageList.tsx`
  - Added `lastSeenCountRef` and `unreadCount` state
  - Updated auto-scroll effect to track unread messages when scrolled up
  - Updated `handleScroll` to reset unread count when near bottom
  - Updated scroll-to-bottom button with count badge, pill shape, and dynamic tooltip
- `electron-ui/src/renderer/components/chat/Message.tsx`
  - Added `handleDoubleClick` callback for quick copy
  - Wired `onDoubleClick` handler to message container div
