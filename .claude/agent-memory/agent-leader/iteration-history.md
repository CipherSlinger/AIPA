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

### Iteration 53 (2026-03-26)
- **Features**: WeChat-style UI Redesign P0 -- Three-column layout, NavRail, bubble messages, session list avatars
- **Key decisions**: Brand blue for user bubbles, asymmetric border-radius, CSS variable system for all layout backgrounds
- **Tester result**: All 4 plans passed, build success

### Iteration 54-112 (2026-03-26 to 2026-03-27)
- Multiple feature iterations including: color unification, animation system, quick reply templates, message status indicators, thinking indicator bubble, session list enhancements (date groups, streaming indicator, tooltips, hover polish), i18n (iterations 80, 93-97), light theme, message edit & resend, chat zoom, system prompt templates, session tags, ChatPanel decomposition refactor, emoji reaction removal
- Key architectural change (Iteration 111): ChatPanel.tsx reduced from 1587 to 409 lines, extracted ChatHeader.tsx, ChatInput.tsx, 4 hooks, 1 utility

### Iteration 113 (2026-03-27)
- **Features**: Fixed user bubble background color readability in dark theme
- **Changes**: --bubble-user from #264f78 to #3572a5, text to pure white, contrast ratio 6.0:1
- **Trigger**: Direct user feedback about text being hard to read

### Iteration 114 (2026-03-28)
- **Features**: Welcome Screen & input placeholder repositioning for personal assistant vision
- **Changes**: Replaced 4 code-focused suggestions with personal assistant tasks (email, document, report, concept). Updated subtitle. 6 of 8 placeholders now non-coding.
- **Trigger**: Product direction alignment per user's "personal assistant, not programming agent" feedback

### Iteration 115 (2026-03-28)
- **Features**: System prompt templates updated to personal assistant roles
- **Changes**: Replaced 5/6 developer-only templates with general-purpose roles (Writing Assistant, Research Analyst, Tutor, Creative Writer, Productivity Coach). Kept Code Reviewer.
- **Trigger**: Continuation of product repositioning effort

### Iteration 116-117 (2026-03-28)
- **Features**: Final product positioning sweep + smart welcome suggestions with auto prompt template activation
- **Changes**: Updated onboarding subtitle, quick reply defaults, extracted promptTemplates.ts shared utility

### Iteration 118 (2026-03-28) -- CRITICAL BUG FIX
- **Features**: Fix node-pty native module crash (P0)
- **Changes**: Lazy-load node-pty with try-catch instead of hard import. Three-layer error handling: main process, IPC, renderer. Terminal panel shows ANSI-colored error with rebuild instructions.
- **Trigger**: User feedback (reported multiple times). Previous fixes in 108/110 addressed wrong symptoms.
- **Lesson learned**: Native module imports MUST be lazy-loaded with try-catch in Electron apps because the native binary may not be compiled for the target platform. Hard `import * as pty from 'node-pty'` crashes the entire main process module if the .node binary is missing. This class of issue is NOT detectable by `tsc` or `vite build` -- it only manifests at runtime on specific platforms.
- **Process failure**: Frontend dev and tester could not catch this because: (1) builds always succeed on Linux where the binary exists, (2) there are no automated tests, (3) the tester does not have a Windows test environment. The fix is to make the code resilient to missing native modules rather than relying on testing.

### Iteration 119 (2026-03-28)
- **Features**: Custom Prompt Templates -- user-defined prompt templates with full CRUD management
- **Changes**: New "Templates" tab in Settings panel. Users can create/edit/delete up to 20 custom templates. Templates appear in the General tab's template selector alongside built-in ones. Persisted via electron-store prefs.
- **Files modified**: SettingsPanel.tsx (+283 lines), app.types.ts (+9), promptTemplates.ts (+23), en.json (+19), zh-CN.json (+19), README.md, README_CN.md
- **Trigger**: Backlog item aligned with "personal assistant" product direction. Users need reusable workflows beyond 6 built-in templates.
- **Pattern used**: Same CRUD pattern as session tags (inline edit, two-click delete confirmation, auto-save to electron-store).
- **No bugs found**: Build clean, all acceptance criteria met on first pass.

**Why:** Custom templates are a force multiplier for the "personal assistant" vision -- users build personal workflow libraries.
**How to apply:** Future template enhancements (categories, sharing, variables) should extend the `CustomPromptTemplate` interface in app.types.ts and the `customPromptTemplates` prefs key.

### Iteration 120 (2026-03-28)
- **Features**: Quick Notes Sidebar Panel -- built-in notepad in the sidebar
- **Changes**: New NotesPanel.tsx component (230 lines), NavRail Notes icon, Sidebar routing, store type extensions. Note CRUD with auto-save (1s debounce), two-click delete, 100-note limit, 10K char per note.
- **Files modified**: NotesPanel.tsx (new), NavRail.tsx, Sidebar.tsx, store/index.ts, app.types.ts, en.json (+18), zh-CN.json (+18), README.md, README_CN.md
- **Pattern used**: Same prefs persistence as custom templates and session tags. Same NavRail/Sidebar routing as Files and Settings tabs.
- **No bugs found**: Build clean, all 19 acceptance criteria met on first pass.
- **Pipeline note**: Sub-agent invocation via Skill tool failed ("Unknown skill: aipa-pm"). Leader executed all agent roles directly. This is a process issue to investigate -- agents defined in .claude/agents/ may need different invocation.

**Why:** Note-taking is a fundamental personal assistant capability. Every major desktop assistant has it. AIPA lacked any persistent note-taking feature.
**How to apply:** Future note enhancements (search, categories, Markdown) should extend the `Note` interface in app.types.ts and the `notes` prefs key. Same pattern as custom templates.

### Iteration 121 (2026-03-28)
- **Features**: Note-Chat Integration -- "Send to Chat" from Notes panel + "Save as Note" from assistant message context menu
- **Changes**: NotesPanel.tsx (+MessageSquareShare button per note), MessageContextMenu.tsx (+onSaveAsNote prop), Message.tsx (+handleSaveAsNote callback creating Note via prefs store), en.json/zh-CN.json (+5 keys each)
- **Pattern used**: Reused existing `quotedText` store mechanism for "Send to Chat" (same as Quote Reply). Note creation uses same prefs persistence pattern as existing CRUD.
- **No bugs found**: Build clean, all 10 acceptance criteria met on first pass.
- **Pipeline note**: Sub-agent invocation via Skill tool still fails. Leader executed all agent roles directly (same as Iteration 120).

**Why:** Notes and Chat existed in isolation. Users had to copy-paste between them. Integration makes AIPA feel like a cohesive assistant.
**How to apply:** Future note integrations (drag-and-drop, @note mentions, note search from chat) should use the same `setQuotedText` pattern for injecting text into chat input.

### Iteration 122 (2026-03-28)
- **Features**: Notes Markdown Preview & Search -- preview toggle, full-text search, title auto-generation
- **Changes**: NotesPanel.tsx (+231/-26 lines), en.json (+7 keys), zh-CN.json (+7 keys), README.md, README_CN.md
- **Pattern used**: Reused existing ReactMarkdown + remarkGfm + rehypeHighlight from MessageContent.tsx. Search uses useMemo with simple String.includes(). Title auto-gen uses regex on first line.
- **No bugs found**: Build clean, all 20 acceptance criteria met on first pass.
- **Pipeline note**: Sub-agent invocation via Skill tool still fails. Leader executed all agent roles directly (same as iterations 120-121).

**Why:** Plain-text notes are insufficient for meeting notes, reports, and structured content. Markdown preview is table-stakes for any note-taking tool. Search is essential as notes accumulate.
**How to apply:** Future note enhancements (note export, note categories, note sharing) should extend the same NotesPanel.tsx component. The Markdown rendering uses `className="markdown-body"` which inherits all chat message styling from globals.css.

### Iteration 123 (2026-03-28)
- **Features**: Quick Clipboard Actions -- "Paste & Ask" toolbar button with 5 preset actions
- **Changes**: ChatInput.tsx (+80 lines), en.json (+8 keys), zh-CN.json (+8 keys), README.md, README_CN.md
- **Pattern used**: Toolbar button + dropdown popup using existing CSS variables (--popup-bg, --popup-border, --popup-shadow). Clipboard API via `navigator.clipboard.readText()`. Translate auto-detects target language from `prefs.language`.
- **Bug found during testing**: Used non-existent `fadeIn` keyframe animation. Fixed to use existing `popup-in` animation from globals.css.
- **Pipeline note**: Sub-agent invocation via Skill tool still fails. Leader executed all agent roles directly (same as iterations 120-122).

**Why:** Core personal assistant workflow. Users copy text from other apps and want one-click AI processing (summarize, translate, rewrite, explain, grammar check). Reduces a multi-step paste-and-type workflow to two clicks.
**How to apply:** Future clipboard enhancements (custom actions, clipboard history, global hotkey) should extend the `CLIPBOARD_ACTIONS` array in ChatInput.tsx. The dropdown pattern can be reused for other toolbar buttons.

### Iteration 124 (2026-03-28)
- **Features**: Note Categories -- color-coded category system for notes
- **Changes**: NotesPanel.tsx (+575 lines, from 576 to 1151), app.types.ts (+9), en.json (+10 keys), zh-CN.json (+10 keys), README.md, README_CN.md
- **Pattern used**: Category filter bar reuses session tag pill button pattern (same colors, same border-radius, same hover transitions). Category management panel uses inline edit + two-click delete pattern. Category dropdown in editor uses popup-in animation and --popup-* CSS variables.
- **Bug found during testing**: `addToast` called with object argument instead of positional args. Fixed both the new call and the pre-existing one in the same file.
- **Pipeline note**: Sub-agent invocation via Skill tool still fails. Leader executed all agent roles directly (same as iterations 120-123).
- **Tech debt noted**: Main-process `StoreSchema` in config-manager.ts doesn't include newer prefs keys (notes, noteCategories, customPromptTemplates, sessionTags, tagNames, quickReplies). Works at runtime because IPC handler passes `any` typed args, but is not type-safe. Pre-existing issue, not introduced by this iteration.

**Why:** Notes (120-122) were in a flat list. As notes accumulate (up to 100), organization becomes essential. Categories extend the notes system to match the "personal assistant" product direction.
**How to apply:** Future note enhancements (note export by category, category-based search) should use the `NoteCategory` interface in app.types.ts and the `noteCategories` prefs key. The filter bar pattern can be reused in other list-based panels.

### Iteration 125 (2026-03-28)
- **Features**: NotesPanel Decomposition Refactor -- structural refactor, zero behavior changes
- **Changes**: NotesPanel.tsx reduced from 1151 to 205 lines (82% reduction). Extracted 7 files: NoteEditor.tsx (355), NoteList.tsx (160), CategoryFilterBar.tsx (165), CategoryManager.tsx (221), useNotesCRUD.ts (274), useNotesSearch.ts (39), notesConstants.ts (29).
- **Pattern used**: Same decomposition pattern as ChatPanel (Iteration 111). Orchestrator component + sub-components + hooks.
- **No bugs found**: Build clean, all 13 acceptance criteria verified.
- **Pipeline note**: Sub-agent invocation via Skill tool still fails. Leader executed all agent roles directly (same as iterations 120-124).

**Why:** NotesPanel.tsx at 1151 lines had the same bloat pattern that triggered the ChatPanel decomposition in Iteration 111. Notes is the active development area (4 features in iterations 120-124), so decomposing now prevents maintainability cliff.
**How to apply:** Future note features should add to the appropriate sub-component (NoteEditor for editor features, NoteList for list features, CategoryManager for category features). New state/logic goes in useNotesCRUD. New computed data goes in useNotesSearch. Constants go in notesConstants.ts.

## Retrospective: Iteration 119-178 (2026-03-28)

**60 iterations analyzed. Core finding: PRD granularity crisis.**

Key stats:
- Notes system: 14 iterations for what should have been 2-3 PRDs
- i18n cleanup: 14 iterations for what should have been 1 PRD
- 0 retrospectives held during this span (should have been 6)
- ITERATION-LOG format degraded to one-liners from Iteration 165 onward

Improvements landed:
1. aipa-pm.md: PRD granularity rules (2-4 features per PRD, aggregation principles, anti-patterns)
2. agent-leader.md: Batch feature requirement when calling PM, single-iteration scope constraints
3. aipa-frontend.md: ITERATION-LOG format enforcement (no one-liner regression)

Next forced retro: after Iteration 188.

## Retrospective: Iteration 189-198 (2026-03-28)

**10 iterations. Mostly engineering quality work.**

Key stats:
- 2 major decompositions: SessionList (1736->708), SettingsPanel (986->125)
- Bundle reduced 1,268 KB -> 1,127 KB via React.lazy code-splitting
- First accessibility work (focus trapping, ARIA attributes)
- ITERATION-LOG one-liner format accepted as valid for minor iterations

Improvements landed:
1. Accepted compact ITERATION-LOG format as valid (policy change)
2. MASTER-ROADMAP update cadence: every 10 iterations at retro time

## Retrospective: Iteration 199-207 (2026-03-28)

**9 iterations. Personas feature dominated (5 of 9).**

Key stats:
- Personas system: 5 iterations (200-204) for what should have been 1-2 PRDs
- No PRD written for the Personas feature (ad-hoc scope creep)
- 8 ITERATION-LOG entries missing (worst gap ever, recovered during retro)
- ChatHeader.tsx grew to 862 lines, ChatInput.tsx to 908, Message.tsx to 866
- SettingsPersonas.tsx born at 440 lines, grew to 643 over 5 iterations without decomposition

Improvements landed:
1. aipa-frontend.md: Component size monitoring rules (400/600/800 line thresholds)
2. aipa-frontend.md: ITERATION-LOG mandatory update after every commit
3. Known decomposition candidates listed: ChatHeader, ChatInput, Message, SettingsPersonas, WelcomeScreen

Next forced retro: after Iteration 217.

## Retrospective: Iteration 228-295 (2026-03-30)

**68 iterations analyzed. Core finding: Agent-leader bypassed for entire span.**

Key stats:
- 62 feature commits, 1 bug fix, 7 doc updates, 0 build failures
- Zero PRDs, zero UI specs, zero test reports, zero retros during span
- i18n perfect parity: 1,073 keys EN = 1,073 keys ZH-CN
- 1 runtime bug (Iteration 291 useMessageListScroll crash)
- Duplicate iteration numbers: 291 and 292 each used twice
- ChatInput.tsx grew to 992 lines (exceeds 800-line urgent threshold)
- 3 new panels born oversized: WorkflowPanel (892), MemoryPanel (887), SchedulePanel (771)

Improvements landed:
1. agent-leader.md: New "Continuous Iteration Mode" section with 5 mandatory constraints
2. agent-leader.md: New risk rows for detecting bypassed supervision
3. ITERATION-LOG: Missing entries for 292-295 backfilled

Outstanding tech debt: ChatInput.tsx (992), WorkflowPanel.tsx (892), MemoryPanel.tsx (887), SchedulePanel.tsx (771), InputToolbar.tsx (750), StatusBar.tsx (674) all need decomposition.

Next forced retro: after Iteration 305.
