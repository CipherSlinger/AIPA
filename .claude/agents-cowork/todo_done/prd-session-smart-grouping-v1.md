# PRD: Session Smart Grouping & View Modes
_Date: 2026-04-03 | Author: aipa-pm_

## Background
As sessions accumulate, the flat list becomes hard to navigate. Smart grouping and alternative view modes help users find sessions faster.

## In Scope

### 1. Collapsible Date Group Headers
Group sessions by time period with collapsible sections.

**Acceptance Criteria**:
- Groups: "Today", "Yesterday", "This week", "Last week", "Older"
- Each group has a header row: label + session count + chevron toggle
- Groups can be collapsed/expanded (state persisted in localStorage)
- Already-implemented date grouping logic in `getDateGroup()` (sessionUtils.ts) should be reused
- i18n keys: `session.group.today`, `session.group.yesterday`, `session.group.thisWeek`, `session.group.lastWeek`, `session.group.older`

### 2. Tag Filter Chips
Quick-filter bar showing the user's most-used tags.

**Acceptance Criteria**:
- Horizontal scrollable row of tag chips below the search bar (only visible when sessions have tags)
- Shows up to 8 most-used tags; clicking one filters the list to sessions with that tag
- Active tag chip highlighted; clicking again deactivates filter
- "All" chip always first, resets filter
- i18n key: `session.tagFilter.all`

### 3. Compact View Toggle
Toggle between normal and compact session list density.

**Acceptance Criteria**:
- Icon button in session list header (list-collapse icon)
- Compact mode: reduce session row height by ~30%, hide subtitle/date (show only title)
- State persisted in `usePrefsStore` under `sessionListCompact: boolean`
- i18n key: `session.compactView.toggle`, `session.compactView.tooltip`

## Out of Scope
- Kanban/grid view
- Drag-to-reorder groups
- Saved filter presets

## Technical Notes
- High-risk files: `SessionList.tsx`, `SessionListHeader.tsx` (new from It.441), `SessionItem.tsx`, `sessionUtils.ts`, i18n files, `store/index.ts` (prefsStore)
- Reuse `getDateGroup()` from `sessionUtils.ts` — do NOT rewrite
