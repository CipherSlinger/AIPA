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

### Iterations 441-450 (2026-04-03)
- **Retro**: retro-2026-04-03-iterations-441-450.md
- **Key wins**: ChatPanel 682->492, ChatHeader 679->455, SessionList 718->607, first tester checkpoint in 55+ iterations (Iter 445)
- **Version**: v1.1.117 -> v1.1.126

### Iterations 451-460 (2026-04-03)
- **Retro**: retro-2026-04-03-iterations-451-460.md
- **Key wins**: All decomposition debt resolved (Message 602->416, SessionList 607->469, ChatInput 562->453, MessageList 517->359, WelcomeScreen decomposed into 3 sub-components)
- **Major features**: Conversation branching (fork/badge/compare), Welcome adaptive layout, Per-session unread badges, Workflow detail view in main panel
- **Issues**: Zero tester checkpoints (4th consecutive retro flagging this), concurrent agent collision on Iter 458-460
- **Version**: v1.1.127 -> v1.1.136
- **Next forced retro**: After Iteration 470
- **Next mandatory tester checkpoint**: Iteration 465

### File Size Watch List (as of Iter 460)

| File | Current | Status |
|------|---------|--------|
| skillMarketplace.ts | 1860 | ACCEPTED (data file) |
| useStreamJson.ts | 590 | P2 WATCH (approaching 600) |
| ChatPanel.tsx | 542 | P2 MONITOR (grew from branching) |
| All others | <500 | RESOLVED |

### Recurring Issues (track across retros)

1. **Tester non-invocation**: Flagged in retros for 432-440, 441-450, 451-460. Only 1 actual checkpoint (Iter 445) in 30 iterations. New P0 action: hard blocking gate at N % 5 === 0.
2. **PRD archival**: Flagged 3x. Still manual.
3. **Concurrent agent collision**: First in 451-460. Two agents modified same files.

### Key Architectural Decisions (latest)

- **Per-session unread tracking**: `unreadCounts: Record<string, number>` in uiStore
- **Workflow detail view**: `mainView: 'workflow-detail'` -> WorkflowDetailPage in main panel
- **Conversation branching**: Fork via `session:fork` IPC, metadata in `prefs.forkMap`
