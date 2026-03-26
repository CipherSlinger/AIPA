# Iteration Report: Collapse All/Expand All + Raw Markdown Toggle

**Date**: 2026-03-27 10:45
**Iteration**: 40
**Status**: COMPLETE
**Build**: PASS (Vite)

## Changes

### Enhancement: Collapse All / Expand All

Bulk collapse/expand actions for managing long conversations:
- "Collapse all" and "Expand all" buttons added to the conversation statistics popover
- `collapseAll()` and `expandAll()` actions added to `useChatStore`
- Both actions skip permission and plan messages
- Closes the stats popover after action

### Enhancement: Raw Markdown Toggle

Assistant messages can now be viewed as raw markdown source:
- Code icon button (`Code2`) appears on hover alongside the Copy button
- Clicking toggles between rendered markdown and raw source view
- Raw view uses monospace font, pre-wrap, and subtle border styling
- Toggle state is per-message (local component state)
- Button highlights with accent color when raw mode is active

### Modified Files
- `electron-ui/src/renderer/store/index.ts`
  - Added `collapseAll` and `expandAll` to ChatState interface
  - Implemented both actions (maps all messages setting `collapsed` to true/false)
- `electron-ui/src/renderer/components/chat/ChatPanel.tsx`
  - Added "Collapse all" and "Expand all" buttons to stats popover
  - Buttons styled with hover effects and consistent sizing
- `electron-ui/src/renderer/components/chat/Message.tsx`
  - Added `Code2` icon import
  - Added `showRawMarkdown` local state
  - Added raw markdown `<pre>` rendering when toggled
  - Replaced single copy button with button group (raw toggle + copy)
  - Raw toggle button uses accent background when active
