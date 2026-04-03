# PRD: SessionList Decomposition & Search Polish

_Author: agent-leader (acting as PM) | Date: 2026-04-03_

## Objective

Reduce SessionList.tsx (627 lines) to under 550 lines by extracting the date group header logic, and polish the global search results display.

## In Scope

### 1. SessionList Decomposition

Extract the date group header rendering logic (collapsible headers with chevron, count, click handler) into a standalone `DateGroupHeader.tsx` component.

**Implementation**:
- Create `DateGroupHeader.tsx` in `sessions/` directory
- Props: `group: string`, `count: number`, `isCollapsed: boolean`, `onToggle: () => void`
- Move the date header JSX from the inline `dateHeader` variable in `SessionList.tsx` (around line 483-510) into this component
- SessionList.tsx should import and use `<DateGroupHeader />`
- Target: SessionList.tsx ≤ 550 lines

### 2. Global Search Results Enhancement

Currently, global search results show session title, snippet, and timestamp. Enhance with:
- **Match count per session** — show "(3 matches)" next to each session result
- **Keyboard navigation** — arrow keys to navigate results, Enter to open

**Implementation**:
- In `GlobalSearchResults.tsx`, add keyboard navigation:
  - Track `focusedIndex` state
  - ArrowUp/ArrowDown changes focused index
  - Enter opens the focused result
  - Focused result gets highlighted background
- Add match count display if the search backend provides per-session match counts (check IPC response format)

### 3. Session Folder Filter Keyboard Support

The folder filter buttons (already present) should be navigable with Left/Right arrow keys when focused.

**Implementation**:
- Add `onKeyDown` handler to the folder filter container
- ArrowLeft/ArrowRight cycles through folder options
- Enter/Space activates the focused folder

## Out of Scope

- No changes to the global search IPC backend
- No changes to the search indexing logic
- No new i18n keys unless adding match count display

## Acceptance Criteria

- [ ] DateGroupHeader.tsx extracted and working
- [ ] SessionList.tsx ≤ 550 lines
- [ ] Global search results navigable with arrow keys
- [ ] Enter opens focused search result
- [ ] `npm run build` succeeds

## Files Affected

- `electron-ui/src/renderer/components/sessions/SessionList.tsx` — decompose date header
- `electron-ui/src/renderer/components/sessions/DateGroupHeader.tsx` — NEW
- `electron-ui/src/renderer/components/sessions/GlobalSearchResults.tsx` — keyboard navigation

**High-risk shared files**: None (no i18n changes expected)
