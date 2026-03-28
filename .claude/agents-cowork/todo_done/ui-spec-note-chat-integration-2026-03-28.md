# UI Spec: Note-Chat Integration

**Date**: 2026-03-28
**PRD**: `prd-note-chat-integration-v1.md`
**Author**: aipa-ui

---

## Overview

Two lightweight integration points between the existing Notes panel and Chat panel:
1. "Send to Chat" button on each note in the list view
2. "Save as Note" option in the assistant message context menu

Both follow existing visual patterns and require no new visual components -- just additions to existing ones.

---

## Feature 1: "Send to Chat" Button in Notes List

### Placement
- Each note item in the list view already has a delete (Trash2) button on the right side
- Add a "Send to Chat" icon button **to the left of the delete button**, in the same row
- Uses `MessageSquareShare` icon from lucide-react (16px, consistent with other sidebar icons)

### Visual Spec

```
Note item layout:
┌──────────────────────────────────────────────┐
│ [Title or preview text]              [>] [X] │
│ 2m ago                                       │
└──────────────────────────────────────────────┘
                                        ↑   ↑
                                  Send   Delete
                                 to Chat
```

- Icon size: 14px (matches Trash2)
- Default color: `var(--text-muted)`, opacity 0.4
- Hover color: `var(--accent)`, opacity 1
- Cursor: pointer
- Padding: 4px (matches Trash2 button)
- No text label (icon-only to save space)
- `aria-label` and `title` set to translated string: "Send to Chat" / "发送到聊天"

### Behavior
- Click: dispatches the note's content via the existing `quotedText` store mechanism
- Format: `[Note: {title}]\n{content}` -- the `>` quote prefix is already applied by ChatInput's quotedText handler
- After dispatch: focus moves to chat input, sidebar stays on Notes tab (user may want to send multiple notes)
- Shows a brief toast: "Sent to chat" / "已发送到聊天" (success, 2s duration)

### Edge Cases
- Empty note (no title, no content): button is still visible but disabled (opacity 0.3, cursor default)
- Note with title but no content: sends `[Note: {title}]` only
- Note with content but no title: sends `[Untitled Note]\n{content}`

---

## Feature 2: "Save as Note" in Message Context Menu

### Placement
- New menu item in `MessageContextMenu.tsx`
- Position: after "Copy as Markdown" (for assistant messages), before the separator that precedes rating
- Only shown for assistant messages (same condition as "Copy as Markdown")

### Visual Spec

```
Context menu for assistant message:
┌────────────────────────────────┐
│ Copy                   Ctrl+C  │
│ Copy as Markdown               │
│ Save as Note                   │  <-- NEW
│ Bookmark                  ☆    │
│ Collapse                       │
│────────────────────────────────│
│ Thumbs up                      │
│ Thumbs down                    │
│────────────────────────────────│
│ Rewind to here                 │
└────────────────────────────────┘
```

- Same `itemStyle` as all other menu items (fontSize 12, padding `6px 12px`)
- No keyboard shortcut displayed (not a frequent enough action)
- No icon in the menu item (consistent with other text-only items)

### Behavior
- Click: creates a new Note in the prefs store
  - `id`: auto-generated (same `generateId()` pattern as NotesPanel)
  - `title`: first 50 characters of the message text, truncated with "..." if longer
  - `content`: full plain text content of the message
  - `createdAt` / `updatedAt`: `Date.now()`
- Prepends the new note to the `notes` array (newest first)
- Shows toast: "Saved to Notes" / "已保存到笔记" (success, 2s duration)
- Closes the context menu after action

### Edge Cases
- Message with only tool use blocks (no text content): do not show "Save as Note" option
- Notes at max limit (100): show toast warning "Notes limit reached" / "笔记数量已达上限" instead of saving, do not show error

---

## i18n Keys

### English (`en.json`)

Add to the `notes` section:
```json
"sendToChat": "Send to Chat",
"sentToChat": "Sent to chat"
```

Add to the `message` section:
```json
"saveAsNote": "Save as Note",
"savedToNotes": "Saved to Notes",
"notesLimitReached": "Notes limit reached"
```

### Chinese (`zh-CN.json`)

Add to the `notes` section:
```json
"sendToChat": "发送到聊天",
"sentToChat": "已发送到聊天"
```

Add to the `message` section:
```json
"saveAsNote": "保存为笔记",
"savedToNotes": "已保存到笔记",
"notesLimitReached": "笔记数量已达上限"
```

---

## Implementation Notes

1. **"Send to Chat" uses the existing `quotedText` mechanism** from `useUiStore`. No new events or IPC needed. Simply call `setQuotedText(formattedContent)` and ChatInput will handle the rest (prepending `>` prefix, focusing the textarea).

2. **"Save as Note" needs access to `usePrefsStore` and `useUiStore`** (for toast). The `onSaveAsNote` callback should be added to the `MessageContextMenu` props, with the actual store logic handled by the parent component (`Message.tsx` or `MessageList.tsx`).

3. **No changes to the NavRail, Sidebar routing, or AppShell**. Both features modify existing components only.

---

## Theme Compatibility

Both features use only existing CSS variables:
- `var(--text-muted)`, `var(--accent)` for icon colors
- `var(--popup-item-hover)` for context menu hover
- Toast uses existing `addToast()` with `type: 'success'`

No new CSS variables or theme adjustments needed.
