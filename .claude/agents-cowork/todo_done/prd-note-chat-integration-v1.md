# PRD: Note-Chat Integration

**Version**: v1
**Date**: 2026-03-28
**Author**: aipa-pm
**Priority**: P1
**Iteration**: 121

---

## Background

AIPA now has two core features that exist in isolation: the **Chat panel** (structured AI conversation) and the **Notes panel** (personal notepad). Users cannot easily bridge between them -- if they want to ask Claude about something in their notes, they must manually copy-paste. If Claude produces a useful answer, they must copy-paste it into a note.

For a personal assistant, notes and conversation should be seamlessly connected. A user should be able to say "analyze this note" or "save that answer to my notes" without leaving their workflow.

## User Stories

1. **As a user, I want to send a note to chat** so I can ask Claude to analyze, edit, or expand on my note content without copy-pasting.
2. **As a user, I want to save an assistant message as a note** so I can preserve useful responses for future reference without copy-pasting.

## Scope (Single Iteration)

This iteration focuses on two specific, achievable actions:

### Feature 1: "Send to Chat" from Notes Panel

- In the Notes panel, each note in the note list gets a small **"Send to Chat"** icon button (e.g., `Send` or `MessageSquareShare` from lucide-react)
- When clicked: the note's title and content are inserted into the chat input box as a quoted block, prefixed with a short prompt like "Here is my note:"
- The user can then type their question below it and send
- Format in input: `[Note: {title}]\n{content}\n\n`
- The chat input should receive focus after insertion

### Feature 2: "Save as Note" from Message Context Menu

- In the existing message right-click context menu (`MessageContextMenu.tsx`), add a **"Save as Note"** option for assistant messages
- When clicked: creates a new note with:
  - Title: first 50 characters of the message text (truncated with "...")
  - Content: full message text (plain text, not markdown)
- Shows a toast confirmation: "Saved to Notes" / "已保存到笔记"
- The note appears immediately in the Notes panel if it's open

## Non-Goals

- No drag-and-drop between notes and chat (future iteration)
- No inline note references (@note syntax) -- too complex for one iteration
- No note editing from chat context
- No bidirectional sync between notes and messages

## Acceptance Criteria

1. [ ] Notes panel shows a "Send to Chat" icon button on each note item in the list view
2. [ ] Clicking "Send to Chat" inserts the note content into the chat input with proper formatting
3. [ ] Chat input receives focus after note content is inserted
4. [ ] Assistant message context menu shows "Save as Note" option
5. [ ] "Save as Note" creates a new note with auto-generated title from message content
6. [ ] Toast notification confirms the save action
7. [ ] Newly saved note appears in Notes panel immediately
8. [ ] Both actions have i18n support (en + zh-CN)
9. [ ] Build succeeds with no TypeScript errors
10. [ ] Both light and dark themes render correctly

## Technical Notes

- "Send to Chat" requires the Notes panel to communicate with ChatInput. Use the existing `window.dispatchEvent(new CustomEvent(...))` pattern established in Iteration 2 (Command Palette -> ChatPanel communication).
- "Save as Note" requires MessageContextMenu to call the store's note creation function. The `usePrefsStore` already has the notes array; add an `addNote` action if not already present.
- No new dependencies required. No new IPC channels needed -- everything is renderer-side.

## i18n Keys

```
en:
  "notes.sendToChat": "Send to Chat"
  "notes.savedToNotes": "Saved to Notes"
  "message.saveAsNote": "Save as Note"

zh-CN:
  "notes.sendToChat": "发送到聊天"
  "notes.savedToNotes": "已保存到笔记"
  "message.saveAsNote": "保存为笔记"
```
