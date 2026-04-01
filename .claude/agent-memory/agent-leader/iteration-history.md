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
- skillMarketplace.ts (~1860 lines) is data-only, exempted from 800-line rule
- ChatInput.tsx (570) and store/index.ts (567) approaching 600-line threshold
- useStreamJson.ts (499 lines) accumulating post-response hook integrations -- consider extracting usePostResponseEffects
- prd-prompt-suggestions-v1.md still in todo/ queue awaiting implementation

### Iterations 362-371 (2026-03-31)
- **It.362**: Skills panel "Create Skill" button (launches Skill Creator)
- **It.363**: i18n completeness (5 remaining hardcoded strings localized)
- **It.364**: UX polish (resize reset, Toast ARIA, Escape clear input)
- **It.365**: SettingsGeneral decomposition (extracted SettingsApiKeyPool)
- **It.366**: WeChat channel: OpenClaw CLI plugin instead of Official Account
- **It.367**: Structured Diff View -- LCS-based unified diff for file edits/writes (DiffView.tsx, 195 lines)
- **It.368**: Auto-Compaction -- context window monitoring + auto-summary (useAutoCompact.ts)
- **It.369**: Contextual Tips -- behavior-based feature discovery on WelcomeScreen (tipRegistry.ts, useTips.ts, 16 tips)
- **It.370**: Auto-Memory Extraction -- background memory extraction from conversations (useAutoMemory.ts)
- **It.371**: Token Usage Progress Bar -- 3px color-coded progress bar below ChatHeader, tooltip with token breakdown
- **Source**: Iterations 367-371 inspired by studying Claude Code official source code
- **Current version**: 1.1.48
- **i18n key count**: ~1162 (both en.json and zh-CN.json aligned)
- **Build status**: Clean (tsc zero errors, build SUCCESS)
- **Retro**: retro-2026-03-31-iterations-362-371.md
- **Next forced retro**: After Iteration 381

### Iteration 372 (2026-03-31)
- **It.372**: Prompt Suggestions -- AI-predicted ghost text after each response (usePromptSuggestion.ts + CLI --print mode)
- **Architecture**: New IPC channel cli:generateSuggestion -> generatePromptSuggestion() in session-reader.ts
- **Integration**: useInputCompletion.ts now accepts optional promptSuggestion param; ChatInput renders italic ghost text when input is empty
- **Settings**: promptSuggestionsEnabled in ClaudePrefs (default: true), toggle in Settings > Behavior
- **Current version**: 1.1.49
- **i18n key count**: ~1164 (both en.json and zh-CN.json aligned)
- **Build status**: Clean (2514 modules, tsc zero errors, build SUCCESS)
- **Next forced retro**: After Iteration 381

### Iterations 373-376 (2026-03-31 to 2026-04-01)
- **It.373**: Idle Return Dialog -- welcome back UX after 30+ min inactivity (useIdleReturn.ts, IdleReturnDialog.tsx)
- **It.374**: Screenshot Capture to Chat + Context Health Warnings -- desktopCapturer IPC, Camera button in toolbar, useContextHealth.ts
- **It.375**: Effort Level Selector + Prevent Sleep -- effortLevel pref ('low'/'medium'/'high') with system prompt injection; Electron powerSaveBlocker prevents idle sleep during streaming
- **It.376**: Per-Model Cost Breakdown + Model Pricing Display -- modelUsage map in ChatStore for per-model token/cost tracking; cost popup shows breakdown by model; model picker shows pricing tiers
- **Architecture**: Effort level follows same system prompt injection pattern as responseTone (useStreamJson.ts); modelUsage accumulates per-model data via enhanced setLastCost()
- **New IPC**: window:preventSleep for powerSaveBlocker start/stop
- **Current version**: 1.1.54
- **i18n key count**: ~1186 (both en.json and zh-CN.json aligned)
- **Build status**: Clean (2517 modules, tsc zero errors, build SUCCESS)

### Iterations 377-378 (2026-04-01)
- **It.377**: System Diagnostics Panel + Conversation Rewind -- DiagnosticsPanel.tsx with 5 health checks; rewindToMessage() store method + session:rewind IPC
- **It.378**: Output Styles + Extended Thinking Toggle -- Replaced responseTone (6 flat tones) with outputStyle (3 structured modes: default/explanatory/learning); InputToolbarStyleSelector.tsx popup; Extended thinking toggle with Brain icon in StatusBar, --thinking-budget 10000 to CLI
- **Architecture**: outputStyle replaces responseTone everywhere (personas, settings, system prompt injection). Extended thinking passed via --thinking-budget CLI flag.
- **Current version**: 1.1.57
- **i18n key count**: 1190 (both en.json and zh-CN.json aligned)
- **Build status**: Clean (tsc zero errors, build SUCCESS)
- **Next forced retro**: After Iteration 381
