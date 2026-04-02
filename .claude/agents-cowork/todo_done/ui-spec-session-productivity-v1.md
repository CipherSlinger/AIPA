# UI Spec: Session Productivity Enhancements

_Author: aipa-ui (agent-leader acting) | Date: 2026-04-02_
_Source PRD: prd-session-productivity-v1.md_

## 1. Session Folders

### Visual Design

**Folder header row** in SessionList:
- Height: 32px
- Layout: `[ChevronRight/Down 12px] [FolderOpen 14px] [Folder Name] [count badge] [+ button on hover]`
- Font: 11px, weight 600, color `var(--text-muted)`
- Background: transparent, hover `var(--list-item-hover)`
- Click chevron or row to expand/collapse
- Below the folder header, indented sessions (left padding +16px from normal)

**"Create Folder" button**:
- Appears at top of session list, above all folders
- Small "+ Folder" text button, icon `FolderPlus`, 11px, muted
- Clicking opens inline text input to name the folder
- Max 10 folders -- hide button when limit reached

**"All Sessions"** pseudo-folder:
- Always first, cannot be deleted or renamed
- Shows unfiled sessions count
- Default expanded

**Drag to folder**:
- When dragging a session (existing drag), show folder drop zones highlighted with blue dashed border
- Drop indicator: folder row gets `background: var(--accent-bg)` and `border: 2px dashed var(--accent)`

**Assign via context menu**:
- Right-click session -> "Move to Folder" -> submenu with folder list + "Remove from Folder"

### Data Model

```ts
// In usePrefsStore
sessionFolders: Array<{ id: string; name: string; order: number }>
sessionFolderAssignments: Record<string, string> // sessionId -> folderId
```

Stored in electron-store, not in JSONL session files.

## 2. Session Duplicate

### Visual Design

- New context menu item in SessionItem: between "Fork" and "Export"
- Icon: `Copy` (lucide)
- Label: "Duplicate" / "复制会话"
- Clicking creates a new session immediately and opens it
- Toast: "Session duplicated" / "会话已复制"

## 3. Session Auto-Title

### Visual Design

- No visible UI change -- the auto-title happens transparently
- New context menu item: "Regenerate Title" / "重新生成标题" with `RefreshCw` icon
- Placed after "Rename" in context menu

### Logic

Title generation heuristic (no LLM call needed):
1. Take first user message, strip markdown, take first 80 chars
2. Remove leading filler words: "hey", "hi", "please", "can you", "help me", "I need"
3. Capitalize first letter
4. If result is < 5 chars, fall back to current behavior (first message truncation)

## I18n Keys

```
session.createFolder / session.folderName / session.allSessions
session.moveToFolder / session.removeFromFolder / session.maxFoldersReached
session.duplicate / session.duplicated
session.regenerateTitle / session.titleRegenerated
```
