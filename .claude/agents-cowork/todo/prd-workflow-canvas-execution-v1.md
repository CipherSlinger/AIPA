# PRD: Workflow Canvas Execution Monitor (Phase 2)
_Version: v1 | Status: Approved | PM: aipa-pm | Date: 2026-04-02_

## One-Line Definition
Add real-time execution visualization to the Workflow Canvas, highlighting active/completed/pending/failed nodes during workflow runs, with click-to-view node I/O details.

## Background & Motivation
Phase 1 (separate PRD) provides the static canvas view. This Phase 2 makes the canvas come alive during workflow execution: users can watch their workflow progress step by step, see which node is currently running, and inspect individual node outputs. This addresses the user's core request for "runtime monitoring" on the canvas.

## Target Users
- **Primary**: Users running multi-step workflows who want to monitor progress visually
- **Secondary**: Users debugging workflow failures who need to see which step failed

## User Stories
As a workflow user running a multi-step workflow, I want to see the canvas highlight the currently executing step in real-time and show completed/pending status for other steps, so that I can monitor progress without reading raw text output.

## Feature Scope

### In Scope (This Version)
1. **Node Status Coloring** -- During workflow execution, each node gets a status-based visual: pending (default), running (accent pulse), completed (green check), failed (red X).
2. **Auto-Focus Active Node** -- Canvas automatically pans to keep the currently running node visible. Smooth animation, not jarring jumps.
3. **Execution Progress Bar** -- A thin progress bar at the top of the canvas showing "Step 2 of 5" with percentage fill.
4. **Node Output Sidebar** -- Click a completed/failed node during or after execution to open a slide-out sidebar showing that step's prompt (input) and response (output).

### Out of Scope (Future Phases)
- **Execution logs sidebar**: Full conversation log view on canvas
- **Re-run individual node**: Ability to re-execute a single step
- **Conditional branching visualization**: Requires Workflow type redesign
- **Canvas view as default during execution**: Canvas is optional; list view still works

## Feature Details

### 1. Node Status Coloring
**Description**: Extend the CanvasNode component (from Phase 1) with a `status` prop that controls visual styling.
**States**:
- `idle`: Default appearance (no workflow running)
- `pending`: Slightly dimmed, waiting to execute
- `running`: Accent border (var(--accent)) with subtle pulse animation (CSS keyframe), "running" spinner icon
- `completed`: Green left border (var(--success, #22c55e)), checkmark badge
- `failed`: Red left border (var(--error, #ef4444)), X badge, node slightly expanded to show error summary
**Acceptance Criteria**:
- [ ] All 4 status states visually distinct
- [ ] Status transitions are animated (smooth border color change)
- [ ] Works in both light and dark themes
- [ ] Idle state matches Phase 1 appearance exactly

### 2. Auto-Focus Active Node
**Description**: When a workflow step begins execution, the canvas smoothly pans to center the running node if it's not already visible in the viewport.
**Interaction**: Auto-pan only triggers when the active node is outside the current viewport bounds (with 50px margin). User can manually pan away; the next step change will auto-pan again.
**Acceptance Criteria**:
- [ ] Canvas auto-pans to running node on step transition
- [ ] Pan animation is smooth (300ms ease-out)
- [ ] Does not pan if node is already visible
- [ ] User manual pan is not blocked during execution

### 3. Execution Progress Bar
**Description**: A thin (3px) horizontal progress bar at the top of the canvas view, showing workflow completion percentage.
**Visual**: Uses var(--accent) for filled portion, var(--border) for unfilled. Label "Step N of M" shown as small text above the bar.
**Acceptance Criteria**:
- [ ] Progress bar visible at top of canvas during execution
- [ ] Updates as each step completes
- [ ] Shows "Step N of M" label
- [ ] Disappears (or shows 100%) when workflow completes
- [ ] i18n key for "Step N of M" pattern

### 4. Node Output Sidebar
**Description**: Clicking a completed or failed node during/after execution opens a narrow (300px) sidebar on the right side of the canvas. Shows the step's prompt (input) and the response text (output).
**Interaction**: Click node -> sidebar slides in from right. Click X or click elsewhere to close. Only one sidebar open at a time. Sidebar content: step title, "Input:" section with prompt text, "Output:" section with response text (markdown rendered if feasible, plain text otherwise).
**Edge case**: If clicked while the step is still running, show the prompt (input) and a "Running..." placeholder for output.
**Acceptance Criteria**:
- [ ] Sidebar opens on node click during/after execution
- [ ] Shows step title, input prompt, and output response
- [ ] Sidebar closable via X button or clicking outside
- [ ] Running step shows "Running..." for output
- [ ] Failed step shows error message in output section
- [ ] i18n keys for "Input", "Output", "Running...", "Error" labels

## Non-Functional Requirements
- **Performance**: Status updates must be near-real-time (within 100ms of step transition event)
- **Accessibility**: Status changes announced via aria-live region; sidebar focusable
- **Compatibility**: All platforms (Electron cross-platform)

## Implementation Notes
- **Data source**: Workflow execution status is currently tracked in the chat store (streaming state). The canvas needs to observe `useChatStore`'s workflow execution state to determine which step is active.
- **New files expected**: Extend `CanvasNode.tsx` with status prop, new `CanvasProgressBar.tsx`, new `CanvasNodeSidebar.tsx`. All in `components/workflows/`.
- **Store changes**: May need to add `workflowStepOutputs: Map<stepId, string>` to chat store to capture per-step outputs for the sidebar. Minimal store change.
- **IPC changes**: NONE.
- **i18n**: ~8 new keys (canvas execution labels). Both en.json and zh-CN.json.

## Priority
- **P0**: Node status coloring (core visual feedback)
- **P0**: Execution progress bar (progress awareness)
- **P1**: Auto-focus active node (convenience)
- **P1**: Node output sidebar (debugging aid)

## Dependencies & Risks
| Dependency | Owner | Risk |
|-----------|-------|------|
| Phase 1 Canvas Foundation (PRD-workflow-canvas-foundation) | Frontend | HIGH -- Must be completed first |
| Workflow execution state in chat store | Frontend | Medium -- Need to verify execution state granularity |
| Per-step output capture | Frontend | Medium -- May need store enhancement |

## Execution Order
This PRD **depends on** prd-workflow-canvas-foundation-v1.md. It MUST be executed after Phase 1 is complete and tested.
