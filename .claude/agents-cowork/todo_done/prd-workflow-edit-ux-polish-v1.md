# PRD: Workflow Editing UX Polish

**Author**: agent-leader (acting as PM)
**Date**: 2026-04-06
**Priority**: P1 (User Experience)
**Iteration Target**: 513-514

---

## Background

The user recently encountered a crash when navigating to the workflow detail page (fixed in Iteration 510). This brought attention to the workflow editing flow, which currently has several UX rough edges. The WorkflowDetailPage has a dual role (read-only step viewer + inline editor) that creates confusion and has duplicated code with WorkflowEditorPage.

Additionally, the ErrorBoundary's auto-recovery currently shows the raw "Auto-recovery failed after N attempts" message without actionable guidance. When recovery fails due to a permanent code error (not a transient glitch), the user sees confusing retry messages before landing on a dead-end error screen.

---

## In Scope

### 1. ErrorBoundary: Smarter Recovery Classification

Improve the ErrorBoundary to distinguish between transient errors (worth retrying) and permanent errors (skip retries, go straight to recovery UI):

- **Permanent errors** (skip auto-retry, show recovery immediately):
  - `ReferenceError: X is not defined` (code bug -- retry will always fail)
  - `TypeError: Cannot read properties of undefined` (missing data -- retry won't help)
  - `SyntaxError` (code corruption)
- **Transient errors** (keep current retry behavior):
  - `Maximum update depth exceeded` (React loop -- may self-resolve)
  - Network/timeout errors
  - Everything else

This prevents the user from waiting through 3 failed retries (500ms + 1500ms + 4500ms = 6.5s) when the error is clearly permanent.

### 2. ErrorBoundary: Better Recovery UI Copy

When auto-recovery fails or is skipped:
- Show the error in plain language, not just the raw message
- Add a "What happened?" expandable section with the technical details
- Replace "Retry" with "Try Again" when retry has already failed
- Add a "Report Bug" button that copies structured diagnostic info AND opens the GitHub issues page

### 3. WorkflowDetailPage: Separate View and Edit Modes

Currently WorkflowDetailPage mixes viewing and editing in one render. Split into:
- **View mode** (default): Shows workflow steps read-only with execution status, canvas visualization
- **Edit mode** (toggled by Edit button): Enables inline editing of step titles, prompts, workflow name, icon

This reduces the initial render complexity and prevents the kind of bug that caused Iteration 510 (missing edit state when the component is in view mode).

### 4. Workflow Detail: Unsaved Changes Protection

When navigating away from edit mode with unsaved changes:
- Show a clear modal dialog (not just a toast on double-press)
- Options: "Save & Leave", "Discard Changes", "Stay"
- Ctrl+S save indicator should be more prominent (brief green flash on the header)

---

## Out of Scope

- New workflow features (branching, conditions, parallel steps)
- Workflow template marketplace
- Changes to WorkflowCanvas visualization
- Changes to WorkflowPanel (list view)

---

## Acceptance Criteria

- [ ] ErrorBoundary skips retry for ReferenceError/TypeError/SyntaxError -- immediately shows recovery UI
- [ ] ErrorBoundary recovery UI has expandable technical details section
- [ ] WorkflowDetailPage has distinct view/edit modes
- [ ] Unsaved changes protection uses a modal dialog with 3 options
- [ ] Zero TypeScript errors
- [ ] Build succeeds
- [ ] All existing workflow functionality preserved (create, edit, run, duplicate, delete)
