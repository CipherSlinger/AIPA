# Iteration Report: Bookmarks Dropdown Panel

**Date**: 2026-03-27 09:30
**Iteration**: 35
**Status**: COMPLETE
**Build**: PASS (Vite)

## Changes

### Enhancement: Bookmarks Dropdown Panel

A toolbar dropdown in the chat panel that lists all bookmarked messages:
- Bookmark icon button in toolbar, with count badge when bookmarks exist
- Clicking opens a dropdown listing all bookmarked messages with role label and content preview
- Clicking a bookmarked entry scrolls the virtual message list to that message
- Empty state explains how to bookmark messages (right-click context menu)
- Click-outside to dismiss the dropdown
- Uses `scrollToMessageIdx` prop on MessageList to drive virtual scroll navigation

### Enhancement: Scroll-to-message API for MessageList

Added `scrollToMessageIdx` prop to MessageList component:
- Maps message index to virtual item index (accounting for date separators)
- Smoothly scrolls to the target message using the virtualizer
- Reusable by any parent component that needs to navigate to a specific message

### Modified Files
- `electron-ui/src/renderer/components/chat/ChatPanel.tsx`
  - Added `Bookmark` icon import
  - Added `showBookmarks` and `scrollToMessageIdx` state
  - Added `bookmarkedMessages` memoized computation
  - Added bookmarks dropdown UI with role labels and content previews
  - Added click-outside handler to close dropdown
  - Wired `scrollToMessageIdx` prop to MessageList
- `electron-ui/src/renderer/components/chat/MessageList.tsx`
  - Added `scrollToMessageIdx` prop to interface
  - Added useEffect to scroll to specific message index on prop change
  - Maps message index to virtual item index for correct scrolling
