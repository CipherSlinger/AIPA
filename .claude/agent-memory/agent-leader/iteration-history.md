---
name: iteration-history
description: Track of all completed iterations, features delivered, and issues found during testing
type: project
---

## Completed Iterations

### Iteration 1 (2026-03-26)
- **Features**: Conversation Export (P0), File Drag-and-Drop (P0)
- **Files**: ChatPanel.tsx (main), globals.css
- **Tester found**: Double-processing bug (textarea onDrop + parent onDrop both firing for image drops). Fixed by removing textarea-level onDrop handler.
- **Key decision**: Export uses CustomEvent pattern for cross-component communication

### Iteration 2 (2026-03-26)
- **Features**: Command Palette (P1), Session Title Auto-Refresh (P1)
- **Files**: CommandPalette.tsx (new), store/index.ts, App.tsx, ChatPanel.tsx, useStreamJson.ts
- **Tester found**: Unused imports (Mic, usePrefsStore). Fixed.
- **Key decision**: CommandPalette communicates with ChatPanel via window CustomEvents (aipa:export, aipa:slashCommand) since they are in different component trees

**Why:** Track these decisions so we don't re-introduce the same bugs or reinvent communication patterns in future iterations.
**How to apply:** When modifying ChatPanel drag-and-drop, check for handler conflicts. When adding cross-component actions, use the CustomEvent pattern established in Iteration 2.

### Iterations 53-391 Summary
- Covered in ITERATION-LOG.md with full details
- Key milestones: WeChat-style UI (53), i18n (80-97), ChatPanel decomposition (111), Notes (120-125), AI Personas (200-204), Multi-model (296-305), Decomposition sprint (306-315)

### Iterations 392-401 (2026-04-01 to 2026-04-02)
- **Retro**: retro-2026-04-02-iterations-392-401.md
- **i18n milestone**: Zero remaining hardcoded English aria-labels (It.398-399)
- **Major feature**: Workflow Canvas Mode Phase 1 (It.401) -- visual node graph with pan/zoom/drag
- **Current version at retro**: 1.1.78
- **Next forced retro**: After Iteration 411

### Iteration 402 (2026-04-02)
- **Feature**: Workflow Canvas Execution Monitor (Phase 2) -- node status coloring, progress bar, auto-pan, sidebar
- **Files created**: useWorkflowExecution.ts, CanvasProgressBar.tsx, CanvasNodeSidebar.tsx
- **Files modified**: WorkflowCanvas.tsx (352->451), CanvasNode.tsx (128->184)
- **Architecture**: Execution state derived from existing taskQueue observation (no store changes needed)
- **Current version**: 1.1.79
- **Build**: SUCCESS (2525 modules)

### Outstanding Tech Debt (as of It.402)
- skillMarketplace.ts (~1860 lines) -- data-only, exempted from 800-line rule
- ChatHeader.tsx (558 lines) -- monitor, decompose at 600
- store/index.ts (605 lines) at comfort limit
- MessageList.tsx (683 lines) approaching 800-line threshold
- WorkflowCanvas.tsx (451 lines) -- healthy
