# PRD: NotesPanel Decomposition Refactor

**Version**: v1
**Date**: 2026-03-28
**Priority**: P1-eng
**Iteration**: 125

---

## Problem

`NotesPanel.tsx` has grown to **1151 lines** -- a single React component containing:
- Note CRUD logic (create, edit, delete, auto-save)
- Search/filter functionality
- Markdown preview toggle
- Category management (create, rename, delete)
- Category filter bar
- Category assignment dropdown
- Two full views (list view + editor view) in one render function

This mirrors the `ChatPanel.tsx` bloat that triggered Iteration 111's refactor (1587 -> 409 lines). The same pattern applies: a monolithic component with 17 pieces of state, 12+ handler functions, and deeply nested JSX makes bugs harder to spot, re-renders harder to control, and future enhancements harder to add.

## Goal

Decompose `NotesPanel.tsx` into smaller, focused components and hooks without changing any user-visible behavior. The refactor is purely structural.

## Proposed Decomposition

### Components to extract:

1. **`NoteEditor.tsx`** (~300 lines)
   - Title input, content textarea, Markdown preview toggle
   - Auto-save timer logic
   - Category assignment dropdown
   - "Send to Chat" button
   - Back button + delete button in header
   - Props: `note`, `onSave`, `onDelete`, `onBack`, `onSendToChat`, `categories`, `onSetCategory`

2. **`NoteList.tsx`** (~200 lines)
   - Filtered note list rendering
   - Note item rows (title, timestamp, category dot, delete button)
   - Empty state
   - Props: `notes`, `onOpen`, `onDelete`, `onSendToChat`, `categories`

3. **`CategoryFilterBar.tsx`** (~100 lines)
   - "All" + per-category pill buttons with counts
   - Category manager gear button
   - Props: `categories`, `activeFilter`, `onFilterChange`, `counts`, `onOpenManager`

4. **`CategoryManager.tsx`** (~250 lines)
   - Category list with inline rename
   - Add new category form (name input + color picker)
   - Two-click delete confirmation
   - Category limit messaging
   - Props: `categories`, `onAdd`, `onRename`, `onDelete`, `onClose`

### Hooks to extract:

5. **`useNotesCRUD.ts`** (~80 lines)
   - `persistNotes`, `persistCategories` callbacks
   - `handleCreateNote`, `handleDeleteNote`
   - `handleOpenNote`, `handleBack`
   - Encapsulates note array mutations + electron-store persistence

6. **`useNotesSearch.ts`** (~30 lines)
   - `searchQuery` state
   - `filteredNotes` memoized computation
   - `categoryCounts` memoized computation

### Files after refactor:

```
src/renderer/components/notes/
  NotesPanel.tsx          (~200 lines, orchestrator)
  NoteEditor.tsx          (~300 lines)
  NoteList.tsx            (~200 lines)
  CategoryFilterBar.tsx   (~100 lines)
  CategoryManager.tsx     (~250 lines)
  useNotesCRUD.ts         (~80 lines)
  useNotesSearch.ts       (~30 lines)
```

## Acceptance Criteria

1. `NotesPanel.tsx` is reduced to under 250 lines (from 1151)
2. At least 4 sub-components are extracted into separate files
3. At least 1 custom hook is extracted
4. All existing functionality is preserved (zero user-visible changes):
   - Note CRUD (create, edit, delete, auto-save)
   - Search + filter by category
   - Markdown preview toggle
   - Category management (create, rename, delete)
   - Category filter bar
   - "Send to Chat" integration
   - i18n for all strings
5. Build succeeds with no TypeScript errors: `npm run build`
6. No new dependencies added
7. No changes to external interfaces (store types, IPC, CSS classes)

## Out of Scope

- New features (this is purely structural)
- CSS changes
- Store refactoring
- New tests

## Rationale

This follows the exact precedent of Iteration 111 (ChatPanel decomposition), which was successful and improved subsequent development velocity for iterations 112-124. The notes system is the next area of active feature development, so decomposing it now prevents the same maintainability cliff.
