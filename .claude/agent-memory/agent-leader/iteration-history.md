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

### Iterations 53-321 Summary (2026-03-26 to 2026-03-30)
- **Total**: 321 iterations completed before leader resumed
- **Product**: Desktop AI personal assistant (Electron + React + Claude Code CLI)
- **Architecture milestones**:
  - It.53: WeChat-style three-column UI redesign
  - It.80-97: Full i18n (English + Chinese)
  - It.111: ChatPanel decomposition (1587->409 lines)
  - It.118: node-pty lazy loading fix (P0 crash)
  - It.120-124: Notes system (CRUD + Markdown + search + categories)
  - It.125: NotesPanel decomposition (1151->205 lines)
  - It.189-198: React.lazy code-splitting, ARIA accessibility
  - It.200-204: AI Personas system
  - It.228-295: Continuous iteration mode (62 features)
  - It.296-305: Multi-model provider architecture
  - It.306-315: Systematic decomposition sprint (all 6 >683-line files resolved)
  - It.316-321: Feedback items (node-pty stderr, Channel panel, SchedulePanel merge, README)

### Iterations 322-324 (2026-03-30, leader-driven)
- **It.322**: Vite bundle splitting (1282->432 kB main chunk), quick reply chips overhaul, dynamic About version, GitHub URL fix
- **It.323**: CSS cleanup (removed 16 stale iteration comments)
- **It.324**: Store defaults alignment for quick reply chips
- **Current version**: 1.1.3
- **Build status**: Clean (tsc zero errors, build SUCCESS)
- **Next forced retro**: After Iteration 331

### Outstanding Tech Debt
- InputToolbar.tsx: Resolved (295 lines after It.317 decomposition)
- No files above 800-line red line
- ipc/index.ts (763 lines) is the largest file but is well-organized by handler groups
- skillMarketplace.ts (1781 lines) is data-only, fine as-is
