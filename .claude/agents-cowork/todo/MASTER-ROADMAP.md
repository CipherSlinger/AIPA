# AIPA Master Roadmap

**Last Updated**: 2026-03-26
**Maintained by**: aipa-pm

---

## Completed Iterations

### Sprint 1 (2026-03-26)
- Security hardening (CSP, safeStorage, IPC validation, path sandboxing, env sanitization)
- Engineering quality (shared CLI path, structured logging, error boundaries)
- Performance (RAF batching, React.memo, resize throttle)
- UX foundations (Toast system, Skeleton components)
- Feature prep (Save dialog IPC, export IPC, session search store state)

### Sprint 1 Bugfix (2026-03-26)
- 6 code quality and security fixes from test report

---

## Current Sprint: Sprint 2

### In Progress

| Feature | PRD | Priority | Status |
|---------|-----|----------|--------|
| Conversation Export | `prd-conversation-export-v1.md` | P0 | DONE (Iteration 1) |
| File Drag-and-Drop | `prd-file-dragdrop-v1.md` | P0 | DONE (Iteration 1) |
| Command Palette | `prd-command-palette-v1.md` | P1 | DONE (Iteration 2) |
| Session Title Auto-Refresh | `prd-session-title-refresh-v1.md` | P1 | DONE (Iteration 2) |

### Sprint 3 (2026-03-26)

| Feature | Priority | Status |
|---------|----------|--------|
| Session Auto-Title | P1 | DONE (Sprint 2 Iteration 2) |
| Command Palette | P1 | DONE (Sprint 2 Iteration 2) |
| Wire Skeleton loaders | P1 | DONE (Sprint 2 Iteration 1 - SessionList) |
| Session search polish | P1 | DONE (Sprint 2 Iteration 1 - highlighting) |
| Global Keyboard Shortcuts | P2 | DONE (Sprint 2 Iteration 4) |
| Message Context Menu | P1 | DONE (Iteration 5) |
| File Browser in Sidebar | P1 | DONE (Iteration 7) |

### Queued for Sprint 4

| Feature | Priority | Notes |
|---------|----------|-------|
| Settings About section | P2 | DONE (Iteration 16) |
| Array-based content accumulation | P0-perf | DONE (Iteration 17) - RAF-throttled streaming buffer |
| Conversation branching UI | P1 | Backend fork/rewind exists; need visual branch tree |
| Message virtualization | P1-perf | DONE (Iteration 18) - @tanstack/react-virtual |
| Double RAF fix + elapsed timer | P1-fix | DONE (Iteration 19) |
| Cumulative session cost | P1 | DONE (Iteration 20) |
| Conversation search (Ctrl+F) | P1 | DONE (Iteration 21) |
| Session sort options | P2 | DONE (Iteration 22) |
| Draft auto-save + char count | P2 | DONE (Iteration 23) |
| Input history navigation | P2 | DONE (Iteration 24) |
| External links + Markdown headings | P1 | DONE (Iteration 25) |
| Completion sound + relative timestamps | P2 | DONE (Iteration 26) |
| GFM checkboxes + message bookmarks | P2 | DONE (Iteration 27) |
| Word count tooltip + compact mode | P2 | DONE (Iteration 28) |
| Delete confirmation + scroll memory | P2 | DONE (Iteration 29) |
| Copy as Markdown + shortcut cheatsheet | P2 | DONE (Iteration 30) |
| System message styling + typing indicator | P2 | DONE (Iteration 31) |
| Session count badge + welcome quick actions | P2 | DONE (Iteration 32) |
| Collapsible code blocks + line count | P2 | DONE (Iteration 33) |
| Date separators + focus mode | P2 | DONE (Iteration 34) |
| Bookmarks dropdown panel | P2 | DONE (Iteration 35) |
| Unread count badge + double-click copy | P2 | DONE (Iteration 36) |
| Session pinning / starring | P2 | DONE (Iteration 37) |
| Message collapse / expand | P2 | DONE (Iteration 38) |
| Conversation statistics panel | P2 | DONE (Iteration 39) |
| Collapse all/expand all + raw markdown toggle | P2 | DONE (Iteration 40) |
| Collapse/expand all shortcut + message count | P2 | DONE (Iteration 41) |
| Scroll progress indicator + session navigation | P2 | DONE (Iteration 42) |
| Image lightbox + window title notification | P2 | DONE (Iteration 43) |
| Ctrl+K clear + streaming spinner | P2 | DONE (Iteration 44) |
| Enhanced tables + responsive sidebar | P2 | DONE (Iteration 45) |
| Persistent sort + clear confirmation | P2 | DONE (Iteration 46) |
| Message animation + session keyboard nav | P2 | DONE (Iteration 47) |
| Status bar enhancements + input actions | P2 | DONE (Iteration 48) |

### Iteration 53 -- UI Redesign (WeChat-style)

| Feature | PRD | Priority | Status |
|---------|-----|----------|--------|
| 三栏布局骨架 (AppShell + NavRail) | `prd-ui-redesign-wechat-v1.md` | P0 | DONE (Iteration 53) |
| 左侧图标导航栏 NavRail | `prd-ui-redesign-wechat-v1.md` | P0 | DONE (Iteration 53) |
| 消息气泡样式重构 | `prd-ui-redesign-wechat-v1.md` | P0 | DONE (Iteration 53) |
| 会话列表头像图标增强 | `prd-ui-redesign-wechat-v1.md` | P0 | DONE (Iteration 53) |

### Iteration 54 -- UI Redesign Phase 2

| Feature | PRD | Priority | Status |
|---------|-----|----------|--------|
| 输入区工具栏重设计 | `prd-ui-redesign-wechat-v1.md` | P1 | DONE (Iteration 54) |
| 标题栏重设计 | `prd-ui-redesign-wechat-v1.md` | P1 | DONE (Iteration 54) |
| Tool use 卡片视觉简化 | `prd-ui-redesign-wechat-v1.md` | P1 | DONE (Iteration 54) |
| 色彩统一修缮 | `prd-ui-redesign-wechat-v1.md` | P1 | DONE (Iteration 54) |

### Iteration 55+ -- UI Redesign Phase 3 (Planned)

| Feature | Priority | Notes |
|---------|----------|-------|
| 其余组件色彩统一 | P1 | DONE (Iteration 55) -- All popup/card/action components unified |
| 动效系统 | P2 | DONE (Iteration 55) -- Direction-aware bubbles, sidebar slide, NavRail scale, tool card grid |
| 浅色主题方案 | P2 | 双主题 CSS 变量系统 |
| 消息状态指示 | P2 | DONE (Iteration 57) -- Clock icon while streaming, check icon when sent |

### Iteration 56 -- Quick Reply Templates

| Feature | PRD | Priority | Status |
|---------|-----|----------|--------|
| Quick Reply Chips | `ui-spec-quick-reply-templates-2026-03-26.md` | P2 | DONE (Iteration 56) |

### Iteration 57-58 -- UI Polish

| Feature | Priority | Status |
|---------|----------|--------|
| Message Status Indicators | P2 | DONE (Iteration 57) -- Clock/check icons on user bubbles |
| Thinking Indicator Bubble | P2 | DONE (Iteration 58) -- WeChat-style mini bubble with avatar, wave dots, elapsed timer |

### Iteration 59 -- Session List Enhancement

| Feature | Priority | Status |
|---------|----------|--------|
| Session List Date Group Headers | P2 | DONE (Iteration 59) -- Today/Yesterday/This Week/Earlier sticky headers |
| Session Active Streaming Indicator | P2 | DONE (Iteration 60) -- Green pulsing dot on avatar during streaming |
| NavRail Custom Tooltips | P2 | DONE (Iteration 61) -- Styled tooltips with popup variables and delay |
| New Message Highlight Glow | P2 | DONE (Iteration 62) -- Subtle blue glow on new messages |

### Iteration 80 -- i18n Multi-Language Support

| Feature | PRD | Priority | Status |
|---------|-----|----------|--------|
| i18n framework (custom I18nProvider) | `prd-i18n-v1.md` | P1 | DONE (Iteration 80) |
| English + Chinese translation files | `prd-i18n-v1.md` | P1 | DONE (Iteration 80) |
| System locale detection | `prd-i18n-v1.md` | P1 | DONE (Iteration 80) |
| Language selector in Settings | `prd-i18n-v1.md` | P1 | DONE (Iteration 80) |

### Iteration 81 -- Light Theme Support

| Feature | Priority | Status |
|---------|----------|--------|
| Light theme CSS variables (~70 props) | P1 | DONE (Iteration 81) |
| Light theme selector in Settings | P1 | DONE (Iteration 81) |
| Light scrollbar + code block overrides | P1 | DONE (Iteration 81) |

### Iteration 87 -- Message Edit & Resend + Chat Zoom

| Feature | Priority | Status |
|---------|----------|--------|
| Message edit & resend (inline textarea + truncate + re-send) | P1 | DONE (Iteration 87) |
| Chat zoom controls (Ctrl+=/-/0, 70%-150%) | P2 | DONE (Iteration 87) |
| i18n for edit UI (en + zh-CN) | P1 | DONE (Iteration 87) |

### Iteration 89 -- System Prompt Templates

| Feature | Priority | Status |
|---------|----------|--------|
| System prompt template selector (6 roles) | P1 | DONE (Iteration 89) |
| i18n for templates (en + zh-CN) | P1 | DONE (Iteration 89) |

### Iteration 90 -- Session Preview Tooltip

| Feature | Priority | Status |
|---------|----------|--------|
| Session hover preview tooltip (title, project, time, prompt) | P2 | DONE (Iteration 90) |
| i18n for tooltip labels (en + zh-CN) | P1 | DONE (Iteration 90) |

### Iteration 91 -- Copy Conversation + Shortcut Cheatsheet i18n

| Feature | Priority | Status |
|---------|----------|--------|
| Copy conversation to clipboard (Ctrl+Shift+X) | P1 | DONE (Iteration 91) |
| Shortcut cheatsheet full i18n migration | P1 | DONE (Iteration 91) |

### Iteration 92 -- Task Queue i18n + CSS Variables

| Feature | Priority | Status |
|---------|----------|--------|
| Task Queue Panel i18n (all strings translated) | P1 | DONE (Iteration 92) |
| Task Queue CSS variable system (7 vars, 4 themes) | P1 | DONE (Iteration 92) |
| Queue entry button i18n | P1 | DONE (Iteration 92) |

### Iteration 93 -- Complete i18n for SearchBar, QuickReplyChips, ToolUseBlock

| Feature | Priority | Status |
|---------|----------|--------|
| SearchBar i18n (placeholder, match labels, button titles) | P1 | DONE (Iteration 93) |
| QuickReplyChips i18n (form labels, actions, context menu) | P1 | DONE (Iteration 93) |
| ToolUseBlock Cancel button i18n | P1 | DONE (Iteration 93) |

### Iteration 94 -- Desktop Notifications Polish

| Feature | Priority | Status |
|---------|----------|--------|
| Desktop notifications preference toggle | P2 | DONE (Iteration 94) |
| Notification branding (AIPA title) | P2 | DONE (Iteration 94) |
| Queue completion desktop notification | P2 | DONE (Iteration 94) |
| i18n for notification settings (en + zh-CN) | P1 | DONE (Iteration 94) |

### Iteration 95 -- Complete i18n for PermissionCard + CommandPalette

| Feature | Priority | Status |
|---------|----------|--------|
| PermissionCard i18n (buttons, subtitle, tool descriptions) | P1 | DONE (Iteration 95) |
| CommandPalette i18n (commands, descriptions, placeholder) | P1 | DONE (Iteration 95) |

### Iteration 96 -- Complete i18n for MessageContent, ToolUseBlock, TerminalPanel, FileBrowser

| Feature | Priority | Status |
|---------|----------|--------|
| MessageContent i18n (copy, word wrap, show more/less) | P1 | DONE (Iteration 96) |
| ToolUseBlock tool labels i18n (reuses permission keys) | P1 | DONE (Iteration 96) |
| TerminalPanel i18n (title, reconnect) | P1 | DONE (Iteration 96) |
| FileBrowser i18n (tooltips, empty state) | P1 | DONE (Iteration 96) |

### Iteration 97 -- Final i18n Sweep: SlashCommandPopup, PlanCard, ImageLightbox

| Feature | Priority | Status |
|---------|----------|--------|
| SlashCommandPopup descriptionKey i18n | P1 | DONE (Iteration 97) |
| PlanCard i18n (all 5 strings) | P1 | DONE (Iteration 97) |
| ImageLightbox i18n (tooltips + alt text) | P1 | DONE (Iteration 97) |

### Iteration 109 -- Session Tags

| Feature | PRD | Priority | Status |
|---------|-----|----------|--------|
| Tag data model + persistence (6 preset tags) | `prd-session-tags-v1.md` | P0 | DONE (Iteration 109) |
| Right-click tag assignment (toggle tags on sessions) | `prd-session-tags-v1.md` | P0 | DONE (Iteration 109) |
| Tag color dot indicators on session items | `prd-session-tags-v1.md` | P0 | DONE (Iteration 109) |
| Tag filter bar (pill buttons below search) | `prd-session-tags-v1.md` | P1 | DONE (Iteration 109) |
| Tag name editing in Settings | `prd-session-tags-v1.md` | P1 | DONE (Iteration 109) |
| i18n for tag UI (en + zh-CN) | `prd-session-tags-v1.md` | P2 | DONE (Iteration 109) |

### Iteration 110 -- Bug Fixes: PTY ConPTY, React #185, Light Theme Title Bar

| Feature | Priority | Status |
|---------|----------|--------|
| PTY ConPTY crash fix (useConpty: false) | P0-fix | DONE (Iteration 110) |
| React error #185 Zustand selector fix | P0-fix | DONE (Iteration 110) |
| Light theme title bar overlay colors | P1-fix | DONE (Iteration 110) |

### Iteration 111 -- ChatPanel Decomposition Refactor

| Feature | PRD | Priority | Status |
|---------|-----|----------|--------|
| Extract ChatHeader component | `prd-chatpanel-refactor-v1.md` | P1-eng | DONE (Iteration 111) |
| Extract ChatInput component | `prd-chatpanel-refactor-v1.md` | P1-eng | DONE (Iteration 111) |
| Extract useConversationSearch hook | `prd-chatpanel-refactor-v1.md` | P1-eng | DONE (Iteration 111) |
| Extract useStreamingTimer hook | `prd-chatpanel-refactor-v1.md` | P1-eng | DONE (Iteration 111) |
| Extract useChatZoom hook | `prd-chatpanel-refactor-v1.md` | P1-eng | DONE (Iteration 111) |
| Extract useConversationStats hook | `prd-chatpanel-refactor-v1.md` | P1-eng | DONE (Iteration 111) |

### Iteration 112 -- Remove Emoji Reactions + UX Cleanup

| Feature | PRD | Priority | Status |
|---------|-----|----------|--------|
| Remove emoji reaction system | `prd-remove-emoji-reactions-v1.md` | P0-ux | DONE (Iteration 112) |

### Iteration 113 -- Fix User Bubble Background Color

| Feature | PRD | Priority | Status |
|---------|-----|----------|--------|
| Fix user bubble dark theme readability | `prd-fix-user-bubble-color-v1.md` | P0-ux | DONE (Iteration 113) |

### Iteration 114 -- Welcome Screen Personal Assistant Repositioning

| Feature | PRD | Priority | Status |
|---------|-----|----------|--------|
| Welcome Screen & placeholder personal assistant alignment | `prd-welcome-personal-assistant-v1.md` | P1 | DONE (Iteration 114) |

### Iteration 115 -- System Prompt Templates Personal Assistant Update

| Feature | PRD | Priority | Status |
|---------|-----|----------|--------|
| Personal assistant prompt templates | `prd-prompt-templates-update-v1.md` | P1 | DONE (Iteration 115) |

### Iteration 116 -- Final Product Positioning Sweep

| Feature | Priority | Status |
|---------|----------|--------|
| Onboarding subtitle alignment | P1 | DONE (Iteration 116) |
| Quick reply defaults alignment | P1 | DONE (Iteration 116) |

### Iteration 117 -- Smart Welcome Suggestions

| Feature | PRD | Priority | Status |
|---------|-----|----------|--------|
| Auto-activate prompt template on welcome suggestions | `prd-smart-welcome-suggestions-v1.md` | P1 | DONE (Iteration 117) |

### Iteration 118 -- Fix node-pty Native Module Crash

| Feature | PRD | Priority | Status |
|---------|-----|----------|--------|
| Lazy-load node-pty with graceful error handling | `prd-bugfix-pty-native-module-v1.md` | P0-fix | DONE (Iteration 118) |
| Terminal panel error state UI + rebuild instructions | `prd-bugfix-pty-native-module-v1.md` | P0-fix | DONE (Iteration 118) |
| i18n for terminal error messages (en + zh-CN) | `prd-bugfix-pty-native-module-v1.md` | P1 | DONE (Iteration 118) |

### Iteration 119 -- Custom Prompt Templates

| Feature | PRD | Priority | Status |
|---------|-----|----------|--------|
| Custom template CRUD (create/edit/delete) | `prd-custom-prompt-templates-v1.md` | P1 | DONE (Iteration 119) |
| Templates tab in Settings panel | `prd-custom-prompt-templates-v1.md` | P1 | DONE (Iteration 119) |
| Unified template selector (built-in + custom) | `prd-custom-prompt-templates-v1.md` | P1 | DONE (Iteration 119) |
| Persistence via electron-store prefs | `prd-custom-prompt-templates-v1.md` | P1 | DONE (Iteration 119) |
| i18n for all template UI (en + zh-CN) | `prd-custom-prompt-templates-v1.md` | P1 | DONE (Iteration 119) |

### Iteration 120 -- Quick Notes Sidebar Panel

| Feature | PRD | Priority | Status |
|---------|-----|----------|--------|
| Notes tab in NavRail (NotebookPen icon) | `prd-quick-notes-v1.md` | P0 | DONE (Iteration 120) |
| Note CRUD (create/edit/delete) | `prd-quick-notes-v1.md` | P0 | DONE (Iteration 120) |
| Note list view with relative timestamps | `prd-quick-notes-v1.md` | P0 | DONE (Iteration 120) |
| Note editor with auto-save (1s debounce) | `prd-quick-notes-v1.md` | P1 | DONE (Iteration 120) |
| Persistence via electron-store prefs | `prd-quick-notes-v1.md` | P0 | DONE (Iteration 120) |
| Two-click delete confirmation | `prd-quick-notes-v1.md` | P1 | DONE (Iteration 120) |
| Character count + timestamps | `prd-quick-notes-v1.md` | P1 | DONE (Iteration 120) |
| i18n for all notes UI (en + zh-CN) | `prd-quick-notes-v1.md` | P1 | DONE (Iteration 120) |

### Iteration 121 -- Note-Chat Integration

| Feature | PRD | Priority | Status |
|---------|-----|----------|--------|
| "Send to Chat" button on notes | `prd-note-chat-integration-v1.md` | P1 | DONE (Iteration 121) |
| "Save as Note" in message context menu | `prd-note-chat-integration-v1.md` | P1 | DONE (Iteration 121) |
| i18n for integration UI (en + zh-CN) | `prd-note-chat-integration-v1.md` | P1 | DONE (Iteration 121) |

### Iteration 122 -- Notes Markdown Preview & Search

| Feature | PRD | Priority | Status |
|---------|-----|----------|--------|
| Markdown preview toggle (Edit/Preview) | `prd-notes-markdown-search-v1.md` | P1 | DONE (Iteration 122) |
| Notes full-text search bar | `prd-notes-markdown-search-v1.md` | P1 | DONE (Iteration 122) |
| Note title auto-generation from headings | `prd-notes-markdown-search-v1.md` | P1 | DONE (Iteration 122) |
| i18n for search + preview (en + zh-CN) | `prd-notes-markdown-search-v1.md` | P1 | DONE (Iteration 122) |

### Iteration 123 -- Quick Clipboard Actions

| Feature | PRD | Priority | Status |
|---------|-----|----------|--------|
| "Paste & Ask" button in ChatInput toolbar | `prd-clipboard-actions-v1.md` | P1 | IN PROGRESS |
| Dropdown with 5 preset actions (Summarize, Translate, Rewrite, Explain, Grammar) | `prd-clipboard-actions-v1.md` | P1 | IN PROGRESS |
| Auto-detect target language for Translate action | `prd-clipboard-actions-v1.md` | P1 | IN PROGRESS |
| i18n for all clipboard UI (en + zh-CN) | `prd-clipboard-actions-v1.md` | P1 | IN PROGRESS |

### Backlog (Sprint 5+)

| Feature | Priority | Notes |
|---------|----------|-------|
| Daily office skills (PPT, weekly reports) | P1 | Agent skill system -- reference Doubao for skill capabilities |
| Multi-model support | P1-arch | Reference OpenClaw and Claude Code official agent patterns |
| Multi-tab conversations | P2 | Major architectural addition |
| TypeScript strict mode | P1-eng | Substantial type error fixing |
| Vitest test foundation | P1-eng | Requires npm install + config |
| GitHub Actions CI | P1-eng | Build + lint pipeline |
| ARIA accessibility audit | P1-ux | Screen reader support |
| Inline styles -> Tailwind migration | P2-eng | ~8h effort |
| Node.js runtime bundling | P2-dist | Bundle Node.js for zero-dep install |
| Auto-update | P2-dist | electron-updater + GitHub Releases |
| macOS/Linux builds | P2-dist | Cross-platform electron-builder config |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-26 | Sprint 2 focuses on Export + Drag-and-Drop | Both complete the "doer" loop (files in, output out). Both have backend support ready. Highest user-facing value per effort. |
| 2026-03-26 | electron-store stays at v8 | v10+ is ESM-only, breaks main process CJS require chain |
| 2026-03-26 | No new npm dependencies in Sprint 2 | Both features can be built with existing APIs |
| 2026-03-27 | Iteration 109: Session Tags | Power users need session organization beyond search and pinning. Tags are more flexible than folders (multi-label per session) and can leverage existing electron-store prefs system with zero new dependencies. |
| 2026-03-27 | Iteration 111: ChatPanel Decomposition | ChatPanel.tsx at 1587 lines is a maintainability bottleneck. Decomposing into ChatHeader + ChatInput + 4 hooks reduces bug surface, improves render performance, and makes future feature development faster. Prioritized over new features because all 100+ existing features depend on this file. |
| 2026-03-27 | Iteration 112: Remove Emoji Reactions | Direct user feedback: emoji reactions on AI messages provide no value in an AI assistant context. Removing reduces UI clutter and simplifies the message component. |
| 2026-03-27 | Backlog: Daily office skills + Multi-model | User feedback requests Doubao-style skills (PPT, weekly reports) and OpenClaw/Claude Code agent patterns. Added to backlog as strategic direction for future sprints. |
| 2026-03-28 | Iteration 118: Lazy-load node-pty | Critical recurring bug: hard `import` of node-pty crashed entire main process when native binary missing. Changed to lazy `require()` with try-catch so terminal gracefully shows error with rebuild instructions instead of blank panel. |
| 2026-03-28 | Iteration 119: Custom Prompt Templates | Users need reusable workflows beyond the 6 built-in templates. Custom templates support the "personal assistant" direction by letting users build a library of prompts (meeting notes, email drafts, weekly reports). Uses existing electron-store prefs system, no new dependencies. |
| 2026-03-28 | Iteration 120: Quick Notes | Core personal assistant capability: users need to jot down notes alongside conversations. Every major assistant app (Notion AI, Doubao, macOS Notes) has integrated note-taking. Uses proven electron-store prefs pattern, zero new dependencies. |
| 2026-03-28 | Iteration 121: Note-Chat Integration | Notes and Chat exist in isolation. Users must copy-paste between them. Bridging these two features with "Send to Chat" and "Save as Note" makes AIPA feel like a cohesive assistant rather than separate tools. Zero new dependencies, renderer-side only. |
| 2026-03-28 | Iteration 122: Notes Markdown Preview & Search | Plain-text notes are insufficient for structured content (meeting notes, reports). Markdown preview reuses existing react-markdown stack (zero new deps). Search is essential with 100-note limit. Title auto-generation reduces friction. All renderer-side, continuing the notes enhancement arc (120 -> 121 -> 122). |
| 2026-03-28 | Iteration 123: Quick Clipboard Actions | Core personal assistant workflow: users copy text from other apps and want to quickly ask the AI to summarize/translate/rewrite/explain it. Reducing this from a multi-step paste-and-type workflow to two clicks. Reference Doubao's clipboard integration. Zero new dependencies, renderer-side only. |
