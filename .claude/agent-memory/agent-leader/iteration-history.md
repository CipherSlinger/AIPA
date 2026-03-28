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
