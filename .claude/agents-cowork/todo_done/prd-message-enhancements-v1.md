# PRD: Message Enhancements & Conversation Polish

_Author: aipa-pm | Date: 2026-04-02_

## Context

AIPA's core conversation experience is solid, but several UX polish items would make daily interactions smoother. Users need better ways to find, organize, and reference content within conversations.

## In Scope

### 1. Message Search Highlights Enhancement

**Problem**: When using Ctrl+F to search within a conversation, matched messages scroll into view, but the search term highlighting within message content could be more prominent and easier to navigate.

**Solution**:
- Add "N of M matches" counter in the search bar
- Add up/down arrow buttons (or Enter/Shift+Enter) to cycle through matches
- Currently matched result gets a distinct highlight (e.g., orange background) vs other matches (yellow background)
- Close search with Escape resets highlights

**Impact**: SearchBar.tsx, MessageContent.tsx, en.json + zh-CN.json

### 2. Message Pin Enhancements

**Problem**: Messages can be bookmarked, but pinned messages could be more visible. A pinned message strip already exists but could show more context.

**Solution**:
- Enhance PinnedMessagesStrip to show pin count as a badge on the strip header
- Add "Unpin All" action in the strip header for quick cleanup
- Pinned messages in the strip show a preview (first 40 chars) instead of just the icon
- Keyboard shortcut Ctrl+Shift+P to toggle pin strip visibility (avoid conflict with command palette -- use Ctrl+Shift+J instead)

**Impact**: PinnedMessagesStrip.tsx, en.json + zh-CN.json

### 3. Copy Message Improvements

**Problem**: Users often need to copy just the AI response text (without tool use blocks, thinking, etc). The current copy only does the full message.

**Solution**:
- Add "Copy Text Only" option in message context menu (alongside existing Copy)
- "Copy Text Only" strips thinking blocks, tool use blocks, and code block markers -- copies just the prose
- Add "Copy as Markdown" option that preserves markdown formatting
- Toast feedback: "Text copied" / "Markdown copied"

**Impact**: MessageContextMenu.tsx, messageUtils.ts (new helper), en.json + zh-CN.json

## Out of Scope

- Message threading / replies between messages
- Message tagging
- Message export to specific formats
- Search across multiple sessions (already exists)

## Success Criteria

- Search match counter shows "N of M" and allows cycling
- Pin strip shows preview text and unpin-all action
- Copy Text Only works, stripping tool/thinking blocks
- Build succeeds
- All i18n keys added (en + zh-CN)
