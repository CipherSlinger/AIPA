# PRD: Multi-Session Select & Bulk Delete

**Priority**: P2
**Iteration**: 165
**Author**: agent-leader (acting as PM)
**Date**: 2026-03-28

## Problem Statement

Users accumulate dozens or hundreds of sessions over time. Currently, deleting a session requires a two-click confirmation per session (click Trash, then confirm "Sure?"). Cleaning up old sessions is tedious when you need to remove 10+ at once.

## Solution

Add a multi-select mode to the session list that allows users to select multiple sessions and delete them all in one action.

## User Flow

1. User clicks a "Select" toggle button in the session list header (next to the sort button)
2. Session list enters selection mode: each row shows a checkbox on the left
3. User clicks checkboxes to select/deselect individual sessions
4. A "Select All" / "Deselect All" toggle appears in the header
5. A floating action bar appears at the bottom of the session list showing:
   - Selected count (e.g., "3 selected")
   - "Delete" button (red) with Trash icon
   - "Cancel" button to exit selection mode
6. Clicking "Delete" shows a confirmation ("Delete N sessions?") requiring one more click
7. On confirm, all selected sessions are deleted via the existing session:delete IPC
8. Selection mode exits after bulk delete

## Acceptance Criteria

1. A "Select" icon button (CheckSquare icon) appears in the session list header, next to the sort button
2. Clicking "Select" enters selection mode; button changes to active state
3. In selection mode, each session row shows a checkbox (left of the avatar)
4. Clicking a checkbox toggles selection (checked/unchecked)
5. A "Select All" checkbox appears in the header; toggles all visible sessions
6. Pinned sessions are included in selection (no special treatment)
7. Selected count is shown in a floating bar at the bottom of the session panel
8. "Delete Selected" button in the floating bar is red with Trash icon
9. Clicking "Delete Selected" shows a confirmation message with count
10. Confirming deletes all selected sessions via existing session:delete IPC
11. After bulk delete, selection mode exits and session list refreshes
12. Pressing Escape exits selection mode without deleting
13. The currently active session cannot be deleted (excluded from selection or shown as disabled)
14. All UI strings are i18n'd (en.json + zh-CN.json)
15. Build passes cleanly (npm run build in electron-ui/)

## Technical Notes

- Modify SessionList.tsx to add selection state (Set<string> of selected session IDs)
- Reuse existing session:delete IPC channel for each deletion (loop)
- No new IPC channels needed
- No new npm dependencies needed
- Selection mode is session-list-local state (not persisted)

## Out of Scope

- Bulk archive (future iteration)
- Bulk tag assignment (future iteration)
- Drag-to-select (too complex for this iteration)
