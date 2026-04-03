# PRD: Session List UX Enhancements

_Version: v1 | Date: 2026-04-03 | Author: aipa-pm_

## Background

The session list sidebar is a central navigation element used dozens of times daily. Currently it supports search, tags, pin, folders, and bulk delete. However, several small but impactful UX improvements can make session navigation faster and more informative.

## In Scope

### 1. Session Message Count Badge
- Display a small message count badge on each session item (e.g., "12 msgs")
- Positioned after the preview text, right-aligned, in muted color
- Count derived from the session's loaded message array length (already available from session metadata)
- Only show when count > 0

### 2. Session Duration Display
- Show how long ago the session was last active, using relative time (e.g., "2h ago", "3d ago", "1w ago")
- Replace or supplement the existing timestamp display
- Use a simple relative time formatter (no library needed -- simple thresholds: <1m -> "just now", <1h -> "Xm ago", <24h -> "Xh ago", <7d -> "Xd ago", else -> date)

### 3. Session Context Menu Enhancements
- Add "Duplicate Session" option to the right-click context menu -- creates a copy of the session (all messages) as a new session
- Add "Export Session" option -- triggers the export dialog for that specific session
- Add "Copy Session ID" option -- copies the internal session ID to clipboard (useful for debugging/power users)

### 4. Double-Click Session Title to Rename
- Double-clicking the session title in the session list should inline-edit the title
- Show a text input replacing the title, pre-filled with current title
- Enter confirms, Escape cancels
- Auto-focus and select-all on activation

## Out of Scope
- Drag-to-reorder sessions (complex, low priority)
- Session grouping by date (already implicitly sorted)
- Session archiving

## Acceptance Criteria
- [ ] Message count badge visible on each session item
- [ ] Relative time display ("2h ago") instead of or alongside absolute timestamp
- [ ] Right-click context menu has Duplicate, Export, Copy ID options
- [ ] Double-click title enables inline rename
- [ ] All new UI text has i18n (en + zh-CN)

## Priority
P2 -- Quality of life improvements
