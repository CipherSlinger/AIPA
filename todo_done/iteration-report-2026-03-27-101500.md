# Iteration Report: Message Collapse/Expand

**Date**: 2026-03-27 10:15
**Iteration**: 38
**Status**: COMPLETE
**Build**: PASS (Vite)

## Changes

### Enhancement: Message Collapse/Expand

Individual messages can now be collapsed to reduce visual clutter in long conversations:
- Small chevron toggle (right/down) appears before the sender name
- Collapsed messages show a single-line content preview (first 100 chars)
- All message content (tool uses, thinking blocks, images, text) hidden when collapsed
- Collapse state tracked via `collapsed` field on `StandardChatMessage`
- Right-click context menu includes "Collapse message" / "Expand message" option
- `toggleCollapse` action added to `useChatStore`
- Collapse state included in React.memo comparison for efficient re-renders

### Modified Files
- `electron-ui/src/renderer/types/app.types.ts`
  - Added `collapsed?: boolean` to `StandardChatMessage`
- `electron-ui/src/renderer/store/index.ts`
  - Added `toggleCollapse` action to ChatState interface and implementation
- `electron-ui/src/renderer/components/chat/Message.tsx`
  - Added `Minus` icon import (unused, kept `ChevronDown`/`ChevronRight`)
  - Added `onCollapse` prop and `isCollapsed` state reading
  - Added collapse toggle button before sender name
  - Wrapped tool uses, thinking, images, text in conditional `<>` fragment
  - Added one-line content preview when collapsed
  - Added `collapsed` to memo comparison
- `electron-ui/src/renderer/components/chat/MessageContextMenu.tsx`
  - Added `onCollapse` prop
  - Added `isCollapsed` state reading
  - Added "Collapse message" / "Expand message" menu item
- `electron-ui/src/renderer/components/chat/MessageList.tsx`
  - Wired `toggleCollapse` from store to Message via `onCollapse` prop
  - Added `toggleCollapse` to renderMessage dependency array
