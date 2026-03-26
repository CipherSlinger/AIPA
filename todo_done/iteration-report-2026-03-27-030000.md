# Iteration Report: Smart Auto-Scroll & Scroll-to-Bottom Button

**Date**: 2026-03-27 03:00
**Iteration**: 15
**Status**: COMPLETE
**Build**: PASS (Vite)

## Changes

### Modified Files
- `electron-ui/src/renderer/components/chat/MessageList.tsx`
  - **Smart auto-scroll**: Auto-scroll to bottom only when user is already near the bottom (within 80px). If the user has scrolled up to read earlier messages, new messages don't force them back to the bottom.
  - **Scroll-to-bottom button**: A floating circular button with a down-arrow icon appears when the user scrolls up. Clicking it smoothly scrolls back to the latest message. Button uses `position: sticky` with accent color background and subtle shadow.
  - Added `ArrowDown` icon import from lucide-react
  - Added `scrollContainerRef` for tracking scroll position
  - Added `showScrollBtn` state and `isNearBottomRef` for scroll awareness
  - Added `handleScroll`, `scrollToBottom`, `checkIfNearBottom` callbacks

## UX Impact

- **Before**: Every new message forced an auto-scroll to the bottom, even if the user was reading earlier messages in a long conversation. This was particularly annoying during long streaming responses with many tool uses.
- **After**: Auto-scroll respects user intent. If they've scrolled up, new messages don't yank them away. A visible scroll-to-bottom button provides an easy way to jump back.
