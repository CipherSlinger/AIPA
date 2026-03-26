# Iteration Report: Task List Checkboxes + Message Bookmarks

**Date**: 2026-03-27 07:00
**Iteration**: 27
**Status**: COMPLETE
**Build**: PASS (Vite)

## Changes

### Enhancement: GFM Task List / Checkbox Rendering

Markdown task lists (`- [x] done`, `- [ ] todo`) now render as styled visual checkboxes instead of raw bracket text:
- Checked items show a filled accent-colored checkbox with a checkmark
- Unchecked items show an outlined checkbox
- Task list items use a flexbox layout without bullet points for clean alignment
- Read-only (no interaction) -- purely visual rendering

### New Feature: Message Bookmarks

Users can bookmark important messages for visual reference via the right-click context menu:
- Right-click any user or assistant message and select "Bookmark"
- Bookmarked messages display a filled star icon next to the timestamp
- Bookmarked state toggles on/off
- Context menu shows "Remove bookmark" for already-bookmarked messages
- Bookmark state stored in Zustand (session-scoped, not persisted across app restarts)

### Modified Files
- `electron-ui/src/renderer/components/chat/MessageContent.tsx`
  - Added `li` task-list-item detection and styled rendering
  - Added `input[type=checkbox]` component override for styled checkboxes
- `electron-ui/src/renderer/components/chat/Message.tsx`
  - Added `onBookmark` prop and `Bookmark` icon import
  - Added bookmark indicator (filled star) next to timestamps
  - Passed `onBookmark` to MessageContextMenu
  - Updated memo comparison to include `bookmarked`
- `electron-ui/src/renderer/components/chat/MessageContextMenu.tsx`
  - Added `onBookmark` prop
  - Added "Bookmark" / "Remove bookmark" menu item with star indicator
- `electron-ui/src/renderer/components/chat/MessageList.tsx`
  - Wired `toggleBookmark` from store into Message component
- `electron-ui/src/renderer/store/index.ts`
  - Added `toggleBookmark` action to ChatState
- `electron-ui/src/renderer/types/app.types.ts`
  - Added `bookmarked?: boolean` to StandardChatMessage
