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
- **Files**: globals.css, store/index.ts, NavRail.tsx (new), AppShell.tsx, Sidebar.tsx, Message.tsx, MessageList.tsx, SessionList.tsx, Skeleton.tsx
- **Key decisions**: Brand blue (#264f78) for user bubbles, asymmetric border-radius for directional cues, CSS variable system for all layout backgrounds
- **Tester result**: All 4 plans passed, build success

### Iteration 54 (2026-03-26)
- **Features**: WeChat-style UI Redesign P1 -- Chat header redesign (44px, icon actions), input area redesign (icon toolbar, rounded field, seamless bg), tool card simplification (rgba overlays), color unification
- **Files**: globals.css (13 new vars), ChatPanel.tsx (header + input + color audit), ToolUseBlock.tsx (in-bubble style)
- **Key decisions**: Input area bg = --bg-chat for seamless feel; borderTop removed; input field focus ring uses accent color; tool cards use rgba overlays instead of solid colors to be subordinate to bubbles
- **Remaining color debt**: Other chat components (Message.tsx hover buttons, PlanCard, PermissionCard, SearchBar, SlashCommandPopup, AtMentionPopup, MessageContextMenu) still use var(--bg-primary) and var(--bg-secondary) -- acceptable for now, can unify in future pass
- **Tester result**: All criteria passed, build success
