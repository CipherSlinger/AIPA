# PRD: Enhanced Notes Integration & Quick Capture

_Version: 1.0 | Date: 2026-04-02 | Author: agent-leader (acting as PM)_

## Background

AIPA has a full notes system with categories, templates, search, and markdown editing. However, notes feel isolated from the main conversation experience. A personal assistant should make it seamless to capture, reference, and reuse notes during conversations.

## In Scope

### 1. Quick Capture Floating Button

**Problem**: Saving content to notes requires multiple steps: select text, click "Save as Note" in context menu, then edit in the notes panel. Users want a faster way to jot down quick thoughts without leaving the conversation.

**Solution**:
- Add a small floating "+" button in the bottom-right corner of the chat area (above the status bar, right side)
- Clicking opens a compact inline capture card (not a modal):
  - Text area (3 lines height, auto-expand up to 6 lines)
  - Category selector dropdown (reuse existing categories)
  - "Save" button (Enter also saves)
  - "Cancel" (Escape dismisses)
- Saved content creates a new note with auto-generated title (first 30 chars of content)
- Toast confirmation: "Note saved to [category]"
- Keyboard shortcut: `Ctrl+Shift+N` opens the capture card
- The capture card appears anchored to the bottom-right, overlaying the chat

**Impact**: ChatPanel.tsx (floating button + capture card), useNotesCRUD.ts (quick create), en.json + zh-CN.json

### 2. Note Reference in Chat Input

**Problem**: Users can't easily reference or insert note content into a conversation. Notes and chat are separate worlds.

**Solution**:
- Extend the existing `@mention` popup to include notes: typing `@note:` shows a filtered list of notes
- Each note entry shows: title, category emoji, first 40 chars of content
- Selecting a note inserts the full note content into the input (as a blockquote)
- Limit to 10 most recent notes in the popup, with a search filter
- The note content is inserted as: `> [Note: Title]\n> content...`

**Impact**: useInputPopups.ts (extend @mention to handle notes), ChatInput.tsx (note insertion), en.json + zh-CN.json

### 3. Note Pinning to Chat Header

**Problem**: Users sometimes want to keep a reference note visible during a conversation (e.g., a checklist, a specification, or meeting agenda) without switching to the notes panel.

**Solution**:
- Add "Pin to Chat" action in note editor header and note context menu
- Pinned note appears as a slim expandable strip below the ChatHeader (similar to PinnedMessagesStrip)
- Strip shows: note title + category emoji, click to expand and see full content (read-only)
- Maximum 1 pinned note per conversation (pinning another replaces the current)
- Pinned note reference stored per session (in session store, not globally)
- "Unpin" button in the strip header
- If the pinned note is edited in the notes panel, the strip content updates

**Impact**: ChatHeader.tsx (pinned note strip), NotesPanel.tsx (pin action), useChatStore (pinnedNoteId per session), en.json + zh-CN.json

## Out of Scope

- Note syncing across devices
- Note versioning / history
- Collaborative notes
- Note export (already exists via notes panel)
- AI-powered note generation from conversation (already exists as "Save as Note")

## Acceptance Criteria

- [ ] Quick capture button visible in chat area, opens inline card
- [ ] Ctrl+Shift+N opens quick capture
- [ ] @note: in chat input shows note list with search
- [ ] Selecting a note inserts its content as blockquote
- [ ] Pin to Chat shows note content below ChatHeader
- [ ] Maximum 1 pinned note at a time
- [ ] All new UI text has i18n entries (en + zh-CN)
- [ ] Build succeeds with zero TypeScript errors
