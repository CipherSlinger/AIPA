# PRD: Conversation Export

**Version**: v1
**Priority**: P0
**Author**: aipa-pm
**Date**: 2026-03-26
**Status**: Ready for Design

---

## 1. Problem Statement

Users have no way to save or share their AIPA conversations. When a user completes a complex task (debugging, code generation, analysis), the output lives only in the session history. If the user wants to share the conversation with a colleague, paste it into documentation, or archive it for future reference, they must manually copy-paste from the chat -- a tedious and lossy process.

AIPA's vision is to be a "doer." A doer produces deliverables. Deliverables need to be exportable.

## 2. Target Users

- **Power users** who use AIPA for code review, debugging, and analysis -- they need to share findings with team members
- **Documentation-oriented users** who want to archive important conversations as part of their knowledge base
- **All users** who want a safety net for preserving valuable conversation output

## 3. Solution Overview

Add an "Export" button to the ChatPanel toolbar. When clicked, it opens a native Save dialog where the user can choose to export the current conversation as **Markdown** (.md) or **JSON** (.json). The export captures all messages, tool uses, and thinking blocks in a structured format.

## 4. Functional Requirements

### FR-1: Export Button in Toolbar
- Add an Export/Download button to the ChatPanel toolbar (the top bar with session info and "new conversation" button)
- The button should be DISABLED when there are no messages (empty conversation)
- Icon: use `Download` from lucide-react
- Tooltip: "Export conversation"

### FR-2: Export Format Selection
- When clicked, show a native "Save As" dialog via `window.electronAPI.fsShowSaveDialog()`
- Default filename: `aipa-conversation-YYYY-MM-DD-HHmmss` (based on current timestamp)
- File type filter options:
  - Markdown (.md) -- DEFAULT
  - JSON (.json)

### FR-3: Markdown Export Format
```markdown
# AIPA Conversation Export
_Exported: YYYY-MM-DD HH:mm:ss_
_Session: [session-id or "New conversation"]_

---

## User
[user message content]

## Assistant
[assistant message content]

### Tool Use: [tool-name]
**Input:**
```json
{tool input}
```
**Result:**
```
{tool result}
```

> **Thinking:** [collapsed thinking content]

---
[next message pair...]
```

### FR-4: JSON Export Format
- Export the raw `ChatMessage[]` array as pretty-printed JSON
- Include all fields: id, role, content, thinking, toolUses, timestamp, attachments, rating

### FR-5: Write File via IPC
- Use `window.electronAPI.fsWriteFile(filePath, content)` to write the exported content
- Show a success toast notification on completion: "Conversation exported successfully"
- Show an error toast if the write fails

### FR-6: Keyboard Shortcut
- `Ctrl+Shift+E` triggers the export action (same as clicking the button)
- Only active when ChatPanel has messages

## 5. Non-Functional Requirements

- Export must complete in under 1 second for conversations with up to 200 messages
- No new npm dependencies required
- Uses existing IPC infrastructure (no main-process changes needed)

## 6. Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|--------------|
| AC-1 | Export button visible in toolbar when messages exist | Visual inspection |
| AC-2 | Export button disabled/hidden when no messages | Visual inspection |
| AC-3 | Clicking Export opens native Save dialog | Functional test |
| AC-4 | Markdown export contains all user/assistant messages | Content verification |
| AC-5 | Markdown export contains tool use blocks with input and result | Content verification |
| AC-6 | JSON export is valid, parseable JSON matching ChatMessage[] shape | Parse test |
| AC-7 | Success toast shown after export | Visual inspection |
| AC-8 | Error toast shown if write fails | Error simulation |
| AC-9 | Ctrl+Shift+E keyboard shortcut works | Keyboard test |
| AC-10 | Build succeeds (tsc main + tsc preload + vite build) | Build verification |

## 7. Technical Notes

- **Existing IPC**: `fs:showSaveDialog` and `fs:writeFile` handlers already exist in `ipc/index.ts`
- **Existing preload API**: `fsShowSaveDialog()` and `fsWriteFile()` already exposed
- **Messages source**: `useChatStore.getState().messages`
- **Toast system**: `useUiStore.getState().addToast('success', message)` already available
- **No main-process changes needed** -- this is a renderer-only feature

## 8. Out of Scope

- Exporting to PDF (would require new dependency)
- Exporting selected messages only (full conversation only in v1)
- Auto-export on session end
- Export including embedded images (images are data URLs; v1 exports text only)
