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

### Iterations 322-331 (2026-03-30, leader-driven)
- **It.322**: Vite bundle splitting (1282->432 kB main chunk), quick reply chips overhaul, dynamic About version, GitHub URL fix
- **It.323**: CSS cleanup (removed 16 stale iteration comments)
- **It.324**: Store defaults alignment for quick reply chips
- **It.325**: Window position/size persistence across restarts
- **It.326**: Theme-aware startup (no dark flash), off-screen guard
- **It.327**: Double-click titlebar to maximize/restore
- **It.328**: Persist sidebar tab across restarts
- **It.329**: Ctrl+Shift+M model cycling shortcut
- **It.330**: Ctrl+Shift+T always-on-top pin window
- **It.331**: Fix Ctrl+Shift+F shortcut conflict (focus mode -> Ctrl+Shift+O)

### Iterations 332-341 (2026-03-30)
- **It.332**: Shortcut registry (single source of truth for 50+ shortcuts, collision detection)
- **It.333**: App.tsx decomposition (413->218 lines, extracted useAppShortcuts.ts)
- **It.334**: Shortcut consistency cleanup
- **It.335**: ipc/index.ts decomposition (784->478 lines, extracted skills + provider handlers)
- **It.336**: Dynamic tray menu + clipboard quick-action + session count tooltip
- **It.337**: README: tray, global hotkeys documentation
- **It.338**: Command palette: added missing "Open Skills" entry
- **It.339**: App menu bar: recent sessions, export, focus mode, always-on-top
- **It.340**: Bug fix: Feishu connect button + About menu + shortcuts polish
- **It.341**: Settings modal overlay (full-screen modal, Escape/click-outside close)

### Iterations 342-351 (2026-03-30)
- **It.342**: Type centralization (SidebarTab/NavItem extracted, 6 duplications eliminated) + settings modal polish
- **It.343**: Menu bar polish (Settings in Edit menu, Keyboard Shortcuts in Help menu)
- **It.344**: Status bar settings gear icon + SettingsModal position fix
- **It.345**: Terminal entry point redesign Phase 1 (chat header button with session context)
- **It.346**: Terminal entry point redesign Phase 2 (remove NavRail/StatusBar terminal buttons, delete date insert)
- **It.347**: Bug fix: non-reactive terminal button store access + command palette terminal context
- **It.348**: Resume last session on startup toggle
- **It.349**: i18n hardcoded string fixes + Settings About streamline (single "View All Shortcuts" button)
- **It.350**: Skills marketplace: remove dead ClawhHub fetch button (-169 lines) + quick reply chips i18n fix
- **It.351**: Session card action buttons gradient background to prevent text overlap
- **Current version**: 1.1.30
- **Build status**: Clean (tsc zero errors, build SUCCESS)
- **Next forced retro**: After Iteration 361
- **Retro**: retro-2026-03-30-iterations-342-351.md

### Iterations 352-361 (2026-03-30)
- **It.352**: Dead code cleanup: ClawhHub fetch remnants removed from README, skillMarketplace.ts, and 7 orphaned i18n keys
- **It.353**: i18n: Localized relative timestamps (date-fns zhCN locale) in session list and global search
- **It.354**: Session date groups enhancement: added "This Month" category, auto-localized month names
- **It.355**: i18n: Error boundaries localized via standalone getT() function for class components
- **It.356**: Sequential sidebar shortcuts (removed Ctrl+5 gap from Settings modal move)
- **It.357**: Removed Schedule tab, migrated 3 presets to Workflows (5 files deleted, 36 i18n keys removed)
- **It.358**: Removed Prompt History feature entirely (3 files deleted, 36 i18n keys removed, 12 files modified)
- **It.359**: New session appears immediately in sidebar on send (pending placeholder pattern)
- **It.360**: Skills marketplace filter dropdowns (replaced pills with compact selects)
- **It.361**: Built-in Skill Creator marketplace skill (47 total skills)
- **Current version**: 1.1.40
- **i18n key count**: 1125 (both en.json and zh-CN.json aligned)
- **Build status**: Clean (tsc zero errors, build SUCCESS)
- **Next forced retro**: After Iteration 371
- **Retro**: retro-2026-03-30-iterations-352-361.md

### Outstanding Tech Debt
- skillMarketplace.ts (~1845 lines) is data-only, exempted from 800-line rule
- No component files above 600 lines -- codebase is well-structured
- All feedback items resolved (feedback.md is empty)
- SidebarTab type: 7 tabs (history, files, notes, skills, memory, workflows, channel)
- Sidebar shortcuts: Ctrl+1-7 (history through channel)
- Settings: Ctrl+, opens modal overlay (removed from sidebar)
