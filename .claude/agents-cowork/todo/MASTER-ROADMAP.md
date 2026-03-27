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

### Backlog (Sprint 5+)

| Feature | Priority | Notes |
|---------|----------|-------|
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
