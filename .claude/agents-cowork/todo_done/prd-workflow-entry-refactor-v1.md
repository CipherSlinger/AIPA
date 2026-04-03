# PRD: Workflow Entry Refactor -- Main Panel View

_Author: aipa-pm | Date: 2026-04-03 | Version: v1 | Priority: P1_

## Problem Statement

The current workflow UX has a confusing dual-entry pattern: clicking "Workflows" in the sidebar shows a workflow list in the sidebar panel, and then there's a separate "Canvas" toggle button within the sidebar that switches to a canvas view -- all crammed into the narrow sidebar. Users expect clicking a workflow to open it in the main content area (like how Settings works), not in the sidebar.

## In Scope (2 features)

### Feature 1: Remove Canvas Button from Sidebar Workflow Panel
- Remove the list/canvas view toggle buttons from the WorkflowPanel sidebar header
- The sidebar workflow panel should ONLY show the workflow list (no canvas view in sidebar)
- Keep the workflow list functionality (create, search, expand/collapse) intact

### Feature 2: Open Workflow in Main Panel
- When user clicks on a workflow item in the sidebar list, the main content area switches to show that workflow's detail/editor view (similar to how clicking Settings switches the main panel to SettingsPage)
- Use the existing `mainView` state in uiStore: add a new view value `'workflow-detail'`
- The workflow detail view shows: workflow name, description, steps editor, and the canvas visualization (moved from sidebar to main panel)
- Back button or Escape returns to the chat view (same pattern as persona-editor and workflow-editor)
- The sidebar workflow list remains visible alongside the main panel workflow view

## Out of Scope
- Workflow execution from the main panel view -- existing execution flow unchanged
- Redesigning the workflow step editor UI -- reuse existing WorkflowStepEditor
- Multi-workflow comparison view

## User Flow
1. User clicks "Workflows" in NavRail -> sidebar shows workflow list
2. User clicks a workflow in the list -> main panel switches from chat to workflow detail view
3. Workflow detail view shows: header (name + back button), step editor, and canvas visualization
4. User presses Escape or clicks back -> returns to chat view
5. Sidebar workflow list stays visible, user can click another workflow to switch

## Technical Notes
- uiStore.ts `mainView` currently supports: `'chat' | 'settings' | 'persona-editor' | 'workflow-editor'`. Add `'workflow-detail'`.
- AppShell.tsx renders different components based on `mainView`. Add the `'workflow-detail'` case.
- WorkflowPanel.tsx: remove `viewMode` state and canvas-related code. On workflow click, call `setMainView('workflow-detail')` + set `editingWorkflowId`.
- Create a new component `WorkflowDetailPage.tsx` that combines the step editor + canvas in a main-panel layout.
- The existing `WorkflowEditorPage` (used from settings) can be reused or extended.

## Acceptance Criteria
- [ ] Canvas toggle button is removed from sidebar workflow panel
- [ ] Clicking a workflow in sidebar opens its detail in the main panel
- [ ] Main panel shows workflow name, steps, and canvas visualization
- [ ] Escape or back button returns to chat view
- [ ] Sidebar workflow list remains visible and functional
- [ ] All new UI text has i18n keys (en + zh-CN)
- [ ] `npm run build` succeeds

## Primary Files (estimated)
- MODIFY: `src/renderer/components/workflows/WorkflowPanel.tsx` (remove canvas, add main panel navigation)
- MODIFY: `src/renderer/store/uiStore.ts` (add 'workflow-detail' to mainView union)
- MODIFY: `src/renderer/components/layout/AppShell.tsx` (render WorkflowDetailPage for new mainView)
- NEW: `src/renderer/components/workflows/WorkflowDetailPage.tsx` (main panel workflow view)
- MODIFY: i18n files (append-only, **i18n entries to be merged by leader**)
