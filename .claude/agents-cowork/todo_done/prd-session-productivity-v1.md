# PRD: Session Productivity Enhancements

_Author: aipa-pm (agent-leader acting) | Date: 2026-04-02_

## Context

AIPA's session management has grown to support search, tags, pins, fork, bulk delete, and export. However, as users accumulate many sessions, they lack ways to organize them into logical groups, and session creation could be smoother with better auto-naming and duplication.

## In Scope

### 1. Session Folders / Groups in Sidebar

**Problem**: Power users with 50+ sessions have a flat list that's hard to navigate even with tags and search. Tags help filter but don't provide persistent visual grouping.

**Solution**:
- Add a "folder" concept to sessions: users can create named folders (e.g., "Work", "Personal", "Research")
- Sessions can be dragged into folders or assigned via right-click context menu
- Folders appear as collapsible groups in the session list, above un-grouped sessions
- Folders are stored in electron-store preferences (not in JSONL files)
- Maximum 10 folders to keep UI clean
- "All Sessions" pseudo-folder always present at top
- Folder order is user-sortable via drag

**Impact**: SessionList.tsx (grouping logic), SessionItem.tsx (drag target), sessionUtils.ts (folder helpers), usePrefsStore (folder storage), en.json + zh-CN.json (i18n)

### 2. Session Duplication / Clone

**Problem**: Users sometimes want to start a new conversation that begins from the same context as an existing one, but "Fork" creates a CLI-level fork. There's no way to simply clone a session's messages into a new independent session.

**Solution**:
- Add "Duplicate" option to session context menu (alongside existing Fork, Rename, Export, Delete)
- Duplicating creates a new session with copied messages but a new session ID and timestamp
- The duplicate appears in the session list with title "[Original Title] (Copy)"
- Does NOT create a CLI-level fork -- it's purely a UI-level copy
- The duplicated session starts with no streaming state, as a read-only conversation that can be continued

**Impact**: SessionItem.tsx (new context menu action), useSessionListActions.ts (duplicate handler), session IPC or local copy logic

### 3. Session Auto-Title Improvement

**Problem**: Session titles are often just the first few words of the user's first message, which can be unhelpful (e.g., "Hey can you" or "Help me with").

**Solution**:
- After the AI's first response completes, auto-generate a more descriptive title using the first user message + first AI response summary
- Use a simple heuristic: extract the first noun phrase or action verb from the user message, combined with the topic
- Format: "[Action] [Topic]" (e.g., "Debug React Router" instead of "Help me debug this")
- Only auto-rename if the current title is still the default auto-generated one (don't override user renames)
- Add a "Regenerate Title" option in session context menu that re-runs the auto-naming logic

**Impact**: useStreamJson.ts or ChatPanel.tsx (auto-title trigger), SessionItem.tsx (regenerate title action), sessionUtils.ts (title generation logic)

## Out of Scope

- Nested folders (folders within folders)
- Session archiving (hide without delete)
- Session sharing/collaboration
- Server-side session sync

## Success Criteria

- Users can create up to 10 folders and drag sessions into them
- Folders collapse/expand and persist across app restarts
- Duplicate creates an independent copy with no CLI state
- Auto-titles are more descriptive than first-message truncation
- "Regenerate Title" works from context menu
- Build succeeds
- All i18n keys added (en + zh-CN)
