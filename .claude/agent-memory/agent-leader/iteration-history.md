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

### Iteration 55 (2026-03-26)
- **Features**: Color Unification Completion + Animation System -- eliminated all var(--bg-secondary) from renderer, introduced popup/action-btn/card variable families, direction-aware bubble entrance animations, sidebar slide transition, NavRail hover scale, tool card grid animation, popup entrance animation
- **Files**: globals.css (15 new vars, 6 new keyframes/classes, reduced-motion query), Message.tsx, PlanCard.tsx, PermissionCard.tsx, SearchBar.tsx, SlashCommandPopup.tsx, AtMentionPopup.tsx, MessageContextMenu.tsx, MessageContent.tsx, MessageList.tsx, ToolUseBlock.tsx, CommandPalette.tsx, ShortcutCheatsheet.tsx, OnboardingWizard.tsx, TerminalPanel.tsx, SessionList.tsx, AppShell.tsx, NavRail.tsx
- **Key decisions**: Popup surfaces use dedicated var(--popup-bg/border/shadow) instead of --bg-secondary; action buttons use rgba overlays for theme adaptability; sidebar slide uses always-render + width:0 animation instead of conditional render; grid-template-rows trick for smooth tool card height animation
- **Color debt**: FULLY RESOLVED. Zero var(--bg-secondary) remaining. Only 2 var(--bg-primary) left (AppShell outer + body -- correct)
- **Tester result**: All 14 acceptance criteria passed, build success

### Iteration 56 (2026-03-26)
- **Features**: Quick Reply Templates -- horizontal chip row above input area with 4 default templates, inline add/edit/delete, right-click context menu, electron-store persistence
- **Files**: QuickReplyChips.tsx (new), ChatPanel.tsx (import + integration), app.types.ts (quickReplies field), store/index.ts (default prefs)
- **Key decisions**: Chips read from prefs.quickReplies with fallback to DEFAULT_QUICK_REPLIES constant; persist via both Zustand setPrefs and window.electronAPI.prefsSet; context menu uses fixed position with popup-in animation; inline form replaces chip in-place during edit
- **Tester result**: All 11 acceptance criteria passed, build success (2385 modules)

### Iteration 57 (2026-03-26)
- **Features**: Message Status Indicators -- WeChat-style check/clock icons on user message bubbles
- **Files**: Message.tsx (added Check/Clock icons, useChatStore import, msgStatus logic, flex timestamp layout)
- **Key decisions**: Status computed via Zustand selector (isStreaming + last-user-message detection); icons inherit parent div rgba color; no new CSS variables needed; used inline flex layout instead of separate row
- **Tester result**: All 6 acceptance criteria passed, build success

### Iteration 58 (2026-03-26)
- **Features**: Thinking Indicator Bubble -- WeChat-style mini bubble with AI avatar, wave-bouncing dots, contextual activity label, elapsed timer
- **Files**: globals.css (dot-wave keyframe), ChatPanel.tsx (Bot import, rewritten ThinkingIndicator with avatar, bubble, wave dots, timer, aria-live)
- **Key decisions**: Used var(--bubble-ai) and matching border-radius for visual consistency with assistant bubbles; wave bounce animation (translateY) chosen over pulse for more distinctive feel; elapsed timer resets when indicator mounts
- **Tester result**: All 8 acceptance criteria passed, build success

### Iteration 59 (2026-03-26)
- **Features**: Session List Date Group Headers -- Today/Yesterday/This Week/Earlier sticky headers in session list
- **Files**: SessionList.tsx (getDateGroup helper, showDateGroups flag, React.Fragment wrapper with date headers)
- **Key decisions**: Headers only shown for timestamp-based sorts (not alpha); disabled during search; pinned sessions excluded from grouping; sticky positioning for headers
- **Tester result**: All 6 acceptance criteria passed, build success

### Iteration 60 (2026-03-26)
- **Features**: Session Active Streaming Indicator -- green pulsing dot on session avatar during streaming
- **Files**: SessionList.tsx (isStreaming selector, relative wrapper on avatar, conditional green dot)
- **Key decisions**: Uses existing pulse animation; 10px dot with 2px border matching panel bg; only on active+streaming session
- **Tester result**: All 5 acceptance criteria passed, build success

### Iteration 61 (2026-03-26)
- **Features**: NavRail Custom Tooltips -- styled tooltips positioned to the right of icons with 400ms delay
- **Files**: NavRail.tsx (removed title attr, added showTooltip state with timer, styled tooltip div with popup vars and popup-in animation)
- **Key decisions**: 400ms delay to prevent flicker; positioned absolutely to right of button; timer cleanup on mouse leave to prevent stale tooltips
- **Tester result**: All 6 acceptance criteria passed, build success

### Iteration 62 (2026-03-26)
- **Features**: New Message Highlight Glow -- subtle box-shadow glow animation on new messages
- **Files**: globals.css (message-glow keyframe, message-new-glow class, reduced-motion), MessageList.tsx (added glow class to entrance animations)
- **Key decisions**: Glow uses accent color rgba; 1.5s duration for subtle effect; applied only to last message; added to reduced-motion disabled list
- **Tester result**: All 6 acceptance criteria passed, build success

### Iteration 63 (2026-03-26)
- **Features**: Message Reactions (Emoji Quick-React) -- hover-triggered emoji toolbar with 5 reactions, toggle badges below bubble
- **Files**: globals.css (7 new reaction vars), store/index.ts (reactions state + toggleReaction), Message.tsx (REACTION_EMOJIS, toolbar, badges)
- **Tester result**: All 13 acceptance criteria passed, build success

### Iteration 64 (2026-03-26)
- **Features**: Sidebar Search Enhancement -- result count badge, match context line with source indicator
- **Files**: SessionList.tsx (getMatchContext helper, result count badge, context line)
- **Tester result**: All 9 acceptance criteria passed, build success

### Iteration 65 (2026-03-26)
- **Features**: Status Bar Enhancement -- three-zone segmented layout, session duration, model badge pill, lucide token icons
- **Files**: StatusBar.tsx (full rewrite: Separator component, formatDuration, three-zone layout)
- **Tester result**: All 10 acceptance criteria passed, build success

### Iteration 66 (2026-03-26)
- **Features**: Session List Hover Polish -- translateX(2px) hover shift, action button opacity/transform transitions
- **Files**: SessionList.tsx (hover transforms, opacity transitions for action buttons)
- **Tester result**: All 7 acceptance criteria passed, build success

### Iteration 67 (2026-03-26)
- **Features**: NavRail Shortcut Hints -- keyboard shortcut badges in tooltip popups
- **Files**: NavRail.tsx (shortcut prop, styled badge in tooltip)
- **Tester result**: All 6 acceptance criteria passed, build success

### Iteration 68 (2026-03-26)
- **Features**: Onboarding Wizard Visual Redesign -- lucide icons (Sparkles/Key/FolderOpen/CheckCircle2) in 80px circles, animated progress bar replacing dots, step transition animations, popup-styled card, input field focus ring, hover scale buttons
- **Files**: OnboardingWizard.tsx (full rewrite), globals.css (onboard-fade-in + onboard-icon-in keyframes, reduced-motion update)
- **Key decisions**: Reuse popup variable system for card styling; onboard-fade-in and onboard-icon-in animations complement existing animation system; progress bar uses cubic-bezier width transition
- **Tester result**: All 13 acceptance criteria passed, build success

### Iteration 69 (2026-03-26)
- **Features**: Welcome Screen Visual Redesign -- Bot icon in 80px circle, lucide icons for suggestion cards (FolderSearch/Bug/Sparkles/FileCode2) in 44px circles, card-bg/card-border styled suggestion cards with scale hover, keyboard shortcuts in 2x3 grid card, quick action buttons with icons
- **Files**: ChatPanel.tsx (8 new lucide imports, WelcomeScreen function rewrite)
- **Key decisions**: Reuse onboard-icon animation for hero entrance; card-bg/card-border variables for suggestion cards; popup-bg/popup-border for kbd elements; title changed to "AIPA" branding
- **Tester result**: All 14 acceptance criteria passed, build success

### Iteration 112 (2026-03-27)
- **Features**: Removed emoji quick-react system from message bubbles per user feedback
- **Files**: Message.tsx (removed ~128 lines), store/index.ts (removed reactions state + toggleReaction), globals.css (removed 14 reaction CSS variables)
- **Key decisions**: Only removed the hover emoji reaction toolbar + badges; preserved the right-click rating (thumbs up/down) as it's a different feature. User clarified they want AIPA to be a "personal desktop AI assistant" not a "programming AI agent" -- important product direction signal.
- **Tester result**: Skipped (pure removal, build verified clean)
- **User feedback captured for backlog**: (1) Daily office skills like PPT/weekly reports (referencing Doubao), (2) Multi-model support (referencing OpenClaw/Claude Code agent), (3) New feedback about user bubble background color being too dark
