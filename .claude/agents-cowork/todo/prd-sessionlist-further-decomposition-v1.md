# PRD: SessionList.tsx Further Decomposition

_Version: 1 | Date: 2026-04-03 | Author: agent-leader (acting as PM)_

## Problem

`SessionList.tsx` is at 607 lines -- improved from 718 but still above the 500-line target set in the retro. The file contains multiple extractable state management blocks: tag picker state (~50 lines), archive state (~30 lines), and filtering/sorting logic (~40 lines). Extracting these into hooks will bring the file well under 500 lines.

## In Scope (3 extraction targets)

### 1. Extract Tag Picker state into `useTagPicker.ts` hook

Lines 51-52 (tagPickerSessionId, tagPickerPos state), 97-131 (toggleSessionTag, openTagPicker, closeTagPicker, useEffect for Escape/click-outside) -- approximately 55 lines.

```typescript
export function useTagPicker(sessionTags: Record<string, string[]>, setPrefs: ...) {
  // tagPickerSessionId, tagPickerPos state
  // toggleSessionTag, openTagPicker, closeTagPicker
  // Escape/click-outside effect
  return { tagPickerSessionId, tagPickerPos, toggleSessionTag, openTagPicker, closeTagPicker }
}
```

### 2. Extract Archive logic into `useSessionArchive.ts` hook

Lines 56, 58 (showArchived, archivedSessions), 78-95 (toggleArchive, bulkArchive) -- approximately 30 lines.

```typescript
export function useSessionArchive(prefs: Prefs, setPrefs: ..., exitSelectMode: ...) {
  // showArchived state
  // archivedSessions derived
  // toggleArchive, bulkArchive handlers
  return { showArchived, setShowArchived, archivedSessions, toggleArchive, bulkArchive }
}
```

### 3. Extract Select-All bar JSX into `SelectAllBar.tsx` component

Lines 332-382 -- approximately 50 lines of JSX for the select-all checkbox bar.

```typescript
interface SelectAllBarProps {
  filtered: SessionListItem[]
  currentSessionId: string | null
  selectedIds: Set<string>
  onSetSelectedIds: (ids: Set<string>) => void
}
```

## Out of Scope

- No new features; this is pure refactoring
- No changes to SessionItem, SessionFilters, GlobalSearchResults, BulkDeleteBar, DateGroupHeader, or SessionListHeader
- No i18n changes
- The filtering/sorting useMemo (lines 228-247) stays in SessionList.tsx -- it's tightly coupled to multiple state variables and extracting it creates more complexity than it saves

## Acceptance Criteria

- [ ] `useTagPicker.ts` hook created and used in SessionList.tsx
- [ ] `useSessionArchive.ts` hook created and used in SessionList.tsx
- [ ] `SelectAllBar.tsx` component created and used in SessionList.tsx
- [ ] SessionList.tsx reduced from 607 to under 500 lines
- [ ] All tag, archive, and select-all functionality unchanged
- [ ] `npm run build` succeeds with zero TypeScript errors

## Dedup Check

- No existing `useTagPicker`, `useSessionArchive`, or `SelectAllBar` files (verified -- only `useSessionTooltip.ts` and `useSessionListActions.ts` exist as hooks).
- Tag picker state lives only in SessionList.tsx (confirmed).
- Archive logic lives only in SessionList.tsx (confirmed).

## File Impact

| File | Action |
|------|--------|
| `src/renderer/components/sessions/useTagPicker.ts` | NEW |
| `src/renderer/components/sessions/useSessionArchive.ts` | NEW |
| `src/renderer/components/sessions/SelectAllBar.tsx` | NEW |
| `src/renderer/components/sessions/SessionList.tsx` | MODIFY (reduce) |
| `src/renderer/i18n/locales/en.json` | NO CHANGE |
| `src/renderer/i18n/locales/zh-CN.json` | NO CHANGE |
