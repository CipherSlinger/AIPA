# PRD: Enhanced Session Management

## Context
The session management experience can be improved with better organization tools. Users accumulate hundreds of sessions over time and need better ways to find, organize, and manage their conversation history.

## In Scope (3 features)

### 1. Session Folder Management Enhancement
- Sessions can already be moved to folders, but folder colors are not supported
- Add color picker for folders (8 preset colors) to visually distinguish categories
- Show folder session count badge on each folder tab
- Allow reordering folders via drag handles

### 2. Session Quick Preview on Hover
- When hovering over a session item in the sidebar, show a tooltip-style preview card
- Preview shows: first user message (truncated to 100 chars), total messages, duration, project name
- Delayed appearance (300ms hover) to avoid accidental triggers
- Only show on desktop (not touch devices)

### 3. Session Archive Mode
- Add "Archive" option to session context menu
- Archived sessions are hidden from the main list but accessible via "Show Archived" toggle
- Archive badge count shown next to the toggle
- Bulk archive for selected sessions

## Out of Scope
- Cloud sync / cross-device session sharing
- Session encryption

## Success Criteria
- Folders can have colors and show counts
- Hover preview provides useful at-a-glance information
- Archived sessions are hidden but recoverable

## Files Likely Touched
- SessionList.tsx (hover preview, archive toggle)
- SessionItem.tsx (hover preview card)
- i18n (en.json, zh-CN.json)
