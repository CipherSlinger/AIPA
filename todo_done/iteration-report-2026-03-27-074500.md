# Iteration Report: Copy as Markdown + Shortcut Cheatsheet

**Date**: 2026-03-27 07:45
**Iteration**: 30
**Status**: COMPLETE
**Build**: PASS (Vite)

## Changes

### Enhancement: Copy as Markdown in Context Menu

The right-click context menu on assistant messages now includes a "Copy as Markdown" option:
- Copies the raw Markdown source text (preserving formatting, code blocks, links, etc.)
- "Copy text" remains available as the default option (copies plain text)
- Only shown for assistant messages (user messages are plain text)

### New Feature: Keyboard Shortcut Cheatsheet (Ctrl+/)

A new floating overlay that displays all available keyboard shortcuts, organized by section:
- **General**: Ctrl+N, Ctrl+B, Ctrl+`, Ctrl+L, Ctrl+,, Ctrl+Shift+P, Ctrl+/
- **Chat**: Enter, Shift+Enter, Up/Down, @, /
- **Conversation**: Ctrl+F, Ctrl+Shift+E, Right-click
- Triggered by `Ctrl+/` (toggles on/off)
- Closes with Escape key or clicking outside
- Portal-rendered for proper z-index stacking
- Styled consistently with the existing theme

### New Files
- `electron-ui/src/renderer/components/shared/ShortcutCheatsheet.tsx`

### Modified Files
- `electron-ui/src/renderer/App.tsx`
  - Added ShortcutCheatsheet import and state
  - Added `Ctrl+/` keyboard handler
  - Rendered ShortcutCheatsheet overlay
- `electron-ui/src/renderer/components/chat/MessageContextMenu.tsx`
  - Added `onCopyMarkdown` prop
  - Added "Copy as Markdown" menu item for assistant messages
- `electron-ui/src/renderer/components/chat/Message.tsx`
  - Added `handleCopyMarkdown` callback
  - Passed `onCopyMarkdown` to context menu
