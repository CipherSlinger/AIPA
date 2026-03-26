# Iteration Report: Input History Navigation

**Date**: 2026-03-27 05:45
**Iteration**: 24
**Status**: COMPLETE
**Build**: PASS (Vite)

## Changes

### New Feature: Input History (Up/Down Arrow)

Like a terminal shell, users can now press Up/Down arrow keys in the chat input to cycle through previously sent messages:

- **Up Arrow** (when cursor is at position 0): Navigate backwards through input history
- **Down Arrow** (when cursor is at end): Navigate forwards through input history
- The current unsent text is preserved and restored when navigating past the most recent history entry
- History stores up to 50 most recent messages, deduplicating identical messages
- Only activates when the cursor is at the start/end of the input (doesn't interfere with normal multi-line editing)
- Does not interfere with @mention or slash command popups

### Implementation Details
- `inputHistoryRef`: stores sent messages in reverse chronological order
- `historyIdxRef`: tracks current position in history (-1 = not browsing history)
- `tempInputRef`: preserves the draft text while browsing history
- History navigation is suppressed when `atQuery` or `slashQuery` popups are open

### Modified Files
- `electron-ui/src/renderer/components/chat/ChatPanel.tsx`
  - Added `inputHistoryRef`, `historyIdxRef`, `tempInputRef` refs
  - Updated `handleSend` to push to input history
  - Updated `handleKeyDown` with Up/Down arrow handlers
