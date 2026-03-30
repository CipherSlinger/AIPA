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

### Iterations 53-315 Summary (2026-03-26 to 2026-03-30)
- **Total**: 315 iterations completed
- **Product**: Desktop AI personal assistant (Electron + React + Claude Code CLI)
- **Current version**: 1.0.315
- **Architecture milestones**:
  - It.53: WeChat-style three-column UI redesign
  - It.80-97: Full i18n (English + Chinese)
  - It.111: ChatPanel decomposition (1587->409 lines)
  - It.118: node-pty lazy loading fix (P0 crash)
  - It.120-124: Notes system (CRUD + Markdown + search + categories)
  - It.125: NotesPanel decomposition (1151->205 lines)
  - It.189-198: React.lazy code-splitting, ARIA accessibility
  - It.200-204: AI Personas system
  - It.228-295: Continuous iteration mode (62 features without leader oversight)
  - It.296-305: Multi-model provider architecture (Claude + OpenAI + DeepSeek + Ollama)
  - It.306-315: Systematic decomposition sprint (all 6 >683-line files resolved)

### Retrospective: Iteration 306-315 (2026-03-30)

**10 iterations. Pure decomposition sprint + 1 stability fix + 1 small feature.**

Key stats:
- 6 decomposition refactors: ChatInput (992->576), WorkflowPanel (892->289), MemoryPanel (893->295), SchedulePanel (771->216), StatusBar (714->292), CommandPalette (683->320)
- React #185 root-cause elimination (useMessageListScroll deep-layer fix)
- UX consolidation: Templates merged into Personas, MemoryPanel crash fix, emoji features removed
- TypeScript strict zero-error achieved (It.311) and maintained through It.315
- System theme auto-detection feature added (It.312)
- 29 new extracted files created
- 0 build failures, 0 TypeScript errors introduced
- Zero files above 636 lines at end of block (vs. 6 files above 683 at start)

Outstanding tech debt: InputToolbar.tsx (636) is the only WARNING candidate. No URGENT items.

Improvements: Previous retro's tech debt list was 100% resolved. New retro mandates feature development resume.

Next forced retro: after Iteration 325.
