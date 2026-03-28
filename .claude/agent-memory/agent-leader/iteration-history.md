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
