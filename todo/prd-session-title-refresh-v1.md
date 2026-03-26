# PRD: Session Title Auto-Refresh

**Version**: v1
**Priority**: P1
**Author**: aipa-pm
**Date**: 2026-03-26
**Status**: Ready for Design

---

## 1. Problem Statement

AIPA already auto-generates session titles after the first assistant response (via `sessionGenerateTitle` in `useStreamJson.ts`). However, the sidebar session list does not refresh to show the new title until the user manually clicks the refresh button. This makes the auto-title feature invisible to users.

## 2. Solution

After auto-generating a title, trigger a sidebar session list refresh so the new title appears immediately. This is a small enhancement -- no new UI component needed.

## 3. Functional Requirements

### FR-1: Auto-Refresh After Title Generation
- After `sessionRename` completes in `useStreamJson.ts`, emit or trigger a session list reload
- The `useSessionStore` should update its sessions list to reflect the new title

### FR-2: Title Display in Toolbar
- The ChatPanel toolbar currently shows `Session: abc123...` (truncated session ID)
- After title generation, show the generated title instead of the raw session ID
- Store the current session title in `useChatStore`

## 4. Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|--------------|
| AC-1 | Sidebar shows new title within 1 second of generation | Visual inspection |
| AC-2 | ChatPanel toolbar shows session title instead of raw ID | Visual inspection |
| AC-3 | Build succeeds | Build verification |

## 5. Technical Notes

- Add `currentSessionTitle: string | null` to `useChatStore`
- After `sessionRename` succeeds in useStreamJson, call `setSessionTitle(title)`
- In SessionList, add a `session:titleUpdated` listener or poll mechanism
- Simplest approach: after rename, call `sessionList()` to reload the list
