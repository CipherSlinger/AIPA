# PRD: Code Health — TypeScript Fixes & ChatHeader Decomposition

_Author: agent-leader (acting as PM) | Date: 2026-04-03_

## Objective

Eliminate all 8 pre-existing TypeScript `tsc --noEmit` errors and decompose ChatHeader.tsx (679 lines) to bring it under the 600-line attention threshold. This is a technical health iteration — no new user-facing features, but improves maintainability and CI readiness.

## In Scope

### 1. Fix TypeScript Errors (all 8)

| # | File | Error | Fix |
|---|------|-------|-----|
| 1 | `ChatInput.tsx:250` | `ghostText: string \| null` not assignable to `string` | Change `useChatInputKeyboard` interface to accept `string \| null` for `ghostText` and `calcResult`, add null guards in usage |
| 2 | `NotePopup.tsx:25` | `.emoji` not on `NoteCategory` | Add optional `emoji?: string` field to `NoteCategory` in `app.types.ts`, or remove `.emoji` access and use fallback icon |
| 3 | `PinnedNoteStrip.tsx:18` | `.emoji` not on `NoteCategory` | Same fix as #2 |
| 4 | `QuickCapture.tsx:190` | `.emoji` not on `NoteCategory` | Same fix as #2 |
| 5 | `SaveTemplateDialog.tsx:27` | `useClickOutside` expects 3 args, got 2 | Add missing `isOpen` boolean argument (always `true` since dialog is rendered only when open) |
| 6 | `SessionList.tsx:75` | `ClaudePrefs` to `Record<string, unknown>` cast error | Use `(prefs as unknown as Record<string, unknown>)` or access via typed getter |
| 7 | `SessionList.tsx:609` | `Archive` is not defined | Add `Archive` to lucide-react import statement |
| 8 | `SessionListHeader.tsx:56` | `RefObject<HTMLInputElement \| null>` incompatible | Use `as React.RefObject<HTMLInputElement>` cast or adjust ref creation |

**Preferred approach for #2-4**: Add `emoji?: string` to the `NoteCategory` interface since emoji per category is a natural extension. All access sites already use optional chaining or fallback.

### 2. ChatHeader Decomposition

Extract from `ChatHeader.tsx` (679 lines) into new files:

- **`ContextIndicator.tsx`** (~120 lines): Contains `ContextProgressBar` + `ContextBadge` + context detail popover. Receives `onNewConversation` callback from ChatHeader.
- **`CostBadge.tsx`** (~80 lines): Extract the per-model cost display + cost breakdown popover. Currently inline in ChatHeader.

Target: ChatHeader.tsx should be ≤550 lines after extraction.

### 3. SessionList Missing Import Fix

Add `Archive` to the lucide-react import in SessionList.tsx (error #7). This is a simple one-liner.

## Out of Scope

- No new user-facing features
- No i18n changes needed (decomposition is internal refactoring)
- No store changes

## Acceptance Criteria

- [ ] `npx tsc --noEmit` passes with 0 errors
- [ ] `npm run build` succeeds
- [ ] ChatHeader.tsx ≤ 550 lines
- [ ] ContextIndicator.tsx created and working
- [ ] CostBadge.tsx created and working
- [ ] All existing functionality preserved (no behavioral changes)

## Files Affected

**High-risk shared files**: `app.types.ts` (NoteCategory interface change)

**Component files**:
- `ChatHeader.tsx` (decompose)
- `ChatInput.tsx` (fix ghostText type)
- `useChatInputKeyboard.ts` (accept null types)
- `useInputCompletion.ts` (may need explicit return type annotation)
- `NotePopup.tsx`, `PinnedNoteStrip.tsx`, `QuickCapture.tsx` (fix emoji access)
- `SaveTemplateDialog.tsx` (fix useClickOutside call)
- `SessionList.tsx` (fix cast + missing import)
- `SessionListHeader.tsx` (fix ref type)

**New files**:
- `ContextIndicator.tsx`
- `CostBadge.tsx`
