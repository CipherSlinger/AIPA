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

### Iterations 53-441 Summary
- Covered in ITERATION-LOG.md with full details
- Key milestones: WeChat-style UI (53), i18n (80-97), ChatPanel decomposition (111), Notes (120-125), AI Personas (200-204), Multi-model (296-305), Decomposition sprint (306-315), Workflow Canvas (401-402), Store decomposition (440)

### Iterations 441-470 Summary
- Covered by retros: retro-2026-04-03-iterations-441-450.md through retro-2026-04-03-iterations-461-470.md
- Key wins: All decomposition debt resolved, conversation branching, welcome adaptive layout, daily planner, focus timer, workflow editor+canvas
- Version: v1.1.117 -> v1.1.146

### Iterations 471-509 (2026-04-06) -- COMPENSATORY RETRO
- **Retro**: retro-2026-04-06-iterations-471-509.md
- **471-479**: Workflow canvas polish (dot-grid bg, collapsible nodes, context menu, dash animation, step search, duration tracking)
- **488**: Mega-bundle of 12 sourcemap features (BAD: violated one-feature-per-iteration)
- **489**: Speculative execution
- **490-509**: Sourcemap utility porting + application sprint (prompt keywords, memory monitor, circular buffer, formatUtils, stringUtils, arrayUtils, hashUtils, setUtils, objectGroupBy, sequential, withResolvers)
- **Dead code**: setUtils.ts, objectGroupBy.ts, sequential.ts, useTimeout.ts (zero consumers)
- **Issues**: 39 iterations without retro (4x limit), 8 skipped iteration numbers (480-487), zero tester checkpoints (6th consecutive retro flagging)
- **Version**: v1.1.146 -> v1.1.158 (estimated)
- **Next forced retro**: After Iteration 519

### File Size Watch List (as of Iter 509)

| File | Current | Status |
|------|---------|--------|
| skillMarketplace.ts | 1860 | ACCEPTED (data file) |
| WorkflowCanvas.tsx | 713 | P1 DECOMPOSE |
| TasksPanel.tsx | 689 | P1 DECOMPOSE |
| WorkflowDetailPage.tsx | 633 | P1 DECOMPOSE |
| useStreamJson.ts | 601 | P2 WATCH |
| MemoryPanel.tsx | 591 | P2 WATCH |
| ChatPanel.tsx | 575 | P2 WATCH |
| StatusBar.tsx | 556 | P2 MONITOR |
| ChatInput.tsx | 508 | OK |

### Recurring Issues (track across retros)

1. **Tester non-invocation**: Flagged in 6 consecutive retros (432-509). Only 1 actual checkpoint (Iter 445) in 70+ iterations. The structural fix (hard gate at leader level) has never been enforced because leader was not invoked.
2. **PRD archival**: Historically flagged. Cleaned up manually by leader in retro-2026-04-06.
3. **Iteration number discipline**: New issue in 471-509. 8 numbers skipped, mega-bundle at 488.
4. **Dead code from utility porting**: New issue. 4 files with zero consumers shipped.

### Key Architectural Decisions (latest)

- **Per-session unread tracking**: `unreadCounts: Record<string, number>` in uiStore
- **Workflow detail view**: `mainView: 'workflow-detail'` -> WorkflowDetailPage in main panel
- **Conversation branching**: Fork via `session:fork` IPC, metadata in `prefs.forkMap`
- **Utility library**: stringUtils, formatUtils, arrayUtils, hashUtils, CircularBuffer, wordSlug, formatBriefTimestamp
- **Speculative execution**: Isolated sandbox for predicted prompts
- **Prompt keyword detection**: Keep-going banner + negative hint toast
