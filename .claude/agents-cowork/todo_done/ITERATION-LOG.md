# AIPA Iteration Log

All iterations appended chronologically.

---

## Iteration 53 — WeChat 风格 UI 重构 P0

_Date: 2026-03-26 | Sprint UI Redesign_

### Summary
将 AIPA 从二栏开发者风格 UI 重构为三列式 WeChat 风格布局，引入独立图标导航栏（NavRail）、气泡式消息系统（AI 左灰 / User 右蓝）、会话列表彩色头像图标，以及完整的深色分层背景体系。所有 52 次迭代的现有功能（工具调用、书签、折叠、搜索高亮等）在新布局中保持正常工作。

### Files Changed
- `src/renderer/styles/globals.css` — 添加三列布局、气泡、NavRail、会话列表等全套新 CSS 变量，覆盖三个主题（default/modern/minimal）
- `src/renderer/store/index.ts` — `useUiStore` 添加 `activeNavItem` 状态和 `setActiveNavItem` action
- `src/renderer/components/layout/NavRail.tsx` — 新增：56px 宽左侧图标导航栏，含 6 个导航项、左侧选中指示条、History badge、底部头像
- `src/renderer/components/layout/AppShell.tsx` — 重构为三列布局（NavRail + SessionPanel + ChatPanel），title bar 改用 `--bg-nav`，侧边栏宽度上限调整为 400px，focus mode 同时隐藏 NavRail
- `src/renderer/components/layout/Sidebar.tsx` — 移除顶部 tab 栏（已由 NavRail 接管），保留纯内容容器
- `src/renderer/components/chat/Message.tsx` — 完整重构为气泡式布局：AI 左对齐灰色气泡（`2px 12px 12px 12px`）、User 右对齐蓝色气泡（`12px 2px 12px 12px`），头像 36px，时间戳内嵌气泡底部，工具调用内嵌气泡中，支持 `showAvatar` prop 实现连续消息头像合并
- `src/renderer/components/chat/MessageList.tsx` — 计算 `showAvatarMap`（连续同角色消息后续隐藏头像），将 `msgIdx` 传入 `renderMessage`
- `src/renderer/components/sessions/SessionList.tsx` — 会话 item 添加 36px 彩色圆角方形头像、标题行（标题+时间戳）、预览行（lastPrompt 前 50 字符），搜索框改为带 icon 的圆角现代样式，添加会话 ID 哈希颜色算法
- `src/renderer/components/ui/Skeleton.tsx` — `SkeletonSessionRow` 更新为方形头像 36px + 标题行 + 预览行结构

### Build
Status: SUCCESS

```
✓ 2384 modules transformed.
✓ built in 8.07s
```

### Acceptance Criteria
- [x] 三列骨架布局实现（NavRail 56px + SessionPanel 240px + ChatPanel flex）
- [x] 左侧图标导航栏（6 个图标 + 选中态 + hover + 历史 badge + 底部头像）
- [x] 消息气泡重构（AI `2px 12px 12px 12px` 灰色 / User `12px 2px 12px 12px` 品牌蓝）
- [x] 会话列表彩色圆角方形头像 + 预览行 + 现代搜索框

---

## Iteration 54 -- WeChat 风格 UI 重构 P1

_Date: 2026-03-26 | Sprint UI Redesign Phase 2_

### Summary
完成 WeChat 风格重构的 P1 范围：重新设计聊天区顶部标题栏（44px 高度、深色背景 `--chat-header-bg`、会话名突出显示、图标化操作按钮）；重新设计底部输入区（无边框线与聊天区融为一体、图标工具栏取代文字按钮、圆角输入框带蓝色聚焦环、36px 圆形发送按钮）；简化 Tool Use 卡片视觉（rgba 叠加背景代替实色、缩小字号、去除运行态边框高亮）；全面色彩统一审计（消除硬编码十六进制色值、popup 背景统一、聊天区背景改用 `--bg-chat`）。

### Files Changed
- `src/renderer/styles/globals.css` -- 新增 Iteration 54 CSS 变量：`--input-bar-bg`、`--input-field-bg`、`--input-field-border`、`--input-field-focus`、`--input-toolbar-icon`、`--input-toolbar-hover`、`--chat-header-bg`、`--chat-header-title`、`--chat-header-icon`、`--chat-header-icon-hover`、`--tool-card-bg`、`--tool-card-border`、`--tool-card-header-bg`，三个主题均有对应覆盖
- `src/renderer/components/chat/ChatPanel.tsx` -- 标题栏重构为 44px 高度 + 会话名左侧突出 + 右侧图标化操作按钮（Search/Export/Bookmarks/Stats/Focus/New）；输入区重构为无边框 + 图标工具栏 + 圆角10px输入框 + 蓝色聚焦环 + 36x36 圆形发送按钮；移除底部提示文字行；字符数仅在 >5000 时显示；所有 `var(--bg-primary)` 改为 `var(--bg-chat)`；popup 背景统一用 `var(--input-field-bg)`
- `src/renderer/components/chat/ToolUseBlock.tsx` -- 容器背景改为 `var(--tool-card-bg)` rgba 叠加、边框改为 `var(--tool-card-border)` 半透明、圆角 6px；标题栏 padding 缩小、图标/字号缩小（12px/11px/10px）；运行态使用微妙 header 背景而非边框变色；Bash 输出背景改为 `rgba(0,0,0,0.2)` 并限高 200px + 底部圆角

### Build
Status: SUCCESS

```
✓ 2384 modules transformed.
✓ built in 7.75s
```

### Acceptance Criteria
- [x] 标题栏背景 `--chat-header-bg` (#1a1a1a)，高度 44px
- [x] 会话标题 13px semi-bold 左对齐显示
- [x] 操作按钮图标化（Search/Export/Bookmarks/Stats/Focus/New）右对齐
- [x] 书签按钮有数量 badge
- [x] 输入区背景与聊天区融为一体（无 borderTop）
- [x] 图标工具栏取代文字按钮（@、/cmd、Mic）
- [x] 输入框圆角 10px + 蓝色聚焦环
- [x] 发送按钮 36x36 圆形蓝色
- [x] Tool use 卡片 rgba 叠加背景（无实色边框）
- [x] 色彩统一：聊天区用 `var(--bg-chat)`，popup 背景统一
- [x] 三个主题（default/modern/minimal）均有对应 CSS 变量覆盖

---

## Iteration 55 -- Color Unification Completion + Animation System

_Date: 2026-03-26 | Sprint UI Redesign Phase 3_

### Summary
Complete elimination of legacy CSS variable debt (`var(--bg-primary)` and `var(--bg-secondary)`) from all chat-related components. Introduced a unified popup/overlay surface variable system (`--popup-bg`, `--popup-border`, `--popup-shadow`, `--popup-item-hover`), inline action button variables (`--action-btn-bg`, `--action-btn-border`), and card surface variables (`--card-bg`, `--card-border`) across all 3 themes. Added a direction-aware message entrance animation system (AI bubbles slide from left, user bubbles slide from right), sidebar panel slide transition, NavRail icon hover/active scale micro-interactions, tool use card expand/collapse height animation, and popup entrance animations. All animations respect `prefers-reduced-motion`.

### Files Changed
- `src/renderer/styles/globals.css` -- Added 15 new CSS variables (popup, action-btn, card, input-focus-shadow) for all 3 themes; added `@keyframes bubble-in-left`, `bubble-in-right`, `popup-in`; added `.nav-icon-btn` hover/active scale; added `.tool-output-wrapper` grid height animation; added `prefers-reduced-motion` media query; updated `.skeleton` to use `--popup-bg`
- `src/renderer/components/chat/Message.tsx` -- Hover action buttons (raw markdown toggle, copy for assistant, copy for user) changed from `var(--bg-primary)` to `var(--action-btn-bg)`, border from `var(--border)` to `var(--action-btn-border)`
- `src/renderer/components/chat/PlanCard.tsx` -- Container background changed from `var(--bg-secondary)` to `var(--card-bg)`, border from `var(--accent)` to `var(--card-border)`
- `src/renderer/components/chat/PermissionCard.tsx` -- Container background changed from `var(--bg-secondary)` to `var(--card-bg)`, non-pending border to `var(--card-border)`, detail block background to `var(--action-btn-bg)`
- `src/renderer/components/chat/SearchBar.tsx` -- Background changed from `var(--bg-secondary)` to `var(--popup-bg)`
- `src/renderer/components/chat/SlashCommandPopup.tsx` -- Background/border/shadow unified to popup variables, item hover to `var(--popup-item-hover)`
- `src/renderer/components/chat/AtMentionPopup.tsx` -- Background/border/shadow unified to popup variables, item hover to `var(--popup-item-hover)`
- `src/renderer/components/chat/MessageContextMenu.tsx` -- Background/border/shadow unified to popup variables, all 7 hover handlers changed to `var(--popup-item-hover)`
- `src/renderer/components/chat/MessageContent.tsx` -- Search highlight text color changed from `var(--bg-primary)` to `#1a1a1a`; table header changed from `var(--bg-active, var(--bg-secondary))` to `var(--action-btn-bg)`
- `src/renderer/components/chat/MessageList.tsx` -- Direction-aware entrance classes: user messages get `message-enter-right`, assistant messages get `message-enter-left`
- `src/renderer/components/chat/ToolUseBlock.tsx` -- Expanded detail section wrapped in `.tool-output-wrapper` grid animation container
- `src/renderer/components/shared/CommandPalette.tsx` -- Modal background/border/shadow unified to popup variables; selected item background to `var(--popup-item-hover)`; kbd background to `var(--action-btn-bg)`
- `src/renderer/components/shared/ShortcutCheatsheet.tsx` -- Background/border/shadow unified to popup variables
- `src/renderer/components/onboarding/OnboardingWizard.tsx` -- Card background changed from `var(--bg-secondary)` to `var(--popup-bg)`
- `src/renderer/components/terminal/TerminalPanel.tsx` -- Toolbar background changed from `var(--bg-secondary)` to `var(--popup-bg)`
- `src/renderer/components/sessions/SessionList.tsx` -- Search highlight text color changed from `var(--bg-primary)` to `#1a1a1a`
- `src/renderer/components/layout/AppShell.tsx` -- Sidebar panel changed from conditional render to always-render with animated width/opacity transition (0.25s cubic-bezier)
- `src/renderer/components/layout/NavRail.tsx` -- NavItem buttons receive `nav-icon-btn` class for scale hover/active micro-interaction

### Build
Status: SUCCESS

```
2384 modules transformed.
built in 7.55s
```

### Acceptance Criteria
- [x] Zero remaining `var(--bg-secondary)` in renderer source
- [x] Only 2 remaining `var(--bg-primary)` (AppShell outer + globals.css body -- both correct)
- [x] All popup/overlay components use `var(--popup-bg/border/shadow)`
- [x] Message hover buttons use `var(--action-btn-bg/border)`
- [x] PlanCard and PermissionCard use `var(--card-bg/border)`
- [x] 15 new CSS variables defined across all 3 themes
- [x] AI messages slide in from left (bubble-in-left, 250ms spring)
- [x] User messages slide in from right (bubble-in-right, 250ms spring)
- [x] SessionPanel show/hide transitions smoothly (width + opacity, 250ms)
- [x] NavRail icons scale on hover (1.1x) and click (0.95x)
- [x] Tool use card output uses grid height animation
- [x] Popup entrance animation (popup-in, 150ms)
- [x] `prefers-reduced-motion` disables all animations
- [x] Build passes with zero errors

---

## Iteration 56 -- Quick Reply Templates

_Date: 2026-03-26 | Sprint UI Enhancement_

### Summary
Added a horizontal row of configurable quick-reply chip buttons between the toolbar and input field. Each chip is a pill-shaped button that inserts its associated prompt text into the textarea on click. Ships with 4 default templates ("Explain this", "Review code", "Summarize", "Fix bug"). Users can add new chips via an inline form (+ button), edit chips (double-click or right-click > Edit), and delete chips (right-click > Remove). Chips persist across app restarts via electron-store. The row scrolls horizontally when chips overflow.

### Files Changed
- `src/renderer/types/app.types.ts` -- Added `quickReplies?: { label: string; prompt: string }[]` to `ClaudePrefs` interface
- `src/renderer/store/index.ts` -- Added default `quickReplies` array (4 templates) to `DEFAULT_PREFS`
- `src/renderer/components/chat/QuickReplyChips.tsx` -- New component: chip row with add/edit/delete inline forms, right-click context menu, persistence via `prefsSet`, tooltip on hover, truncation at 20 chars
- `src/renderer/components/chat/ChatPanel.tsx` -- Imported `QuickReplyChips`, integrated between toolbar row and input row with `onInsert` callback that appends prompt text and focuses textarea

### Build
Status: SUCCESS

```
2385 modules transformed.
built in 7.69s
```

### Acceptance Criteria
- [x] Quick reply chip row visible between toolbar and input field
- [x] Default 4 chips shipped on first launch
- [x] Clicking a chip inserts its prompt text into the textarea
- [x] Focus moves to textarea after chip click
- [x] "+" button to add new chip with inline label/prompt form
- [x] Chips persist across app restarts (electron-store)
- [x] Chips show full prompt as tooltip on hover
- [x] Chip text truncated at 20 characters with ellipsis
- [x] Horizontal scroll when chips overflow
- [x] Right-click chip shows edit/delete options
- [x] Build passes with zero errors

---

## Iteration 57 -- Message Status Indicators

_Date: 2026-03-26 | Sprint UI Enhancement_

### Summary
Added WeChat-style message status indicators to user message bubbles. Each user message now shows a small check icon after the timestamp to indicate "sent" status. While the assistant is actively streaming a response, the last user message shows a clock icon instead, transitioning to a check once streaming completes. Non-user messages (assistant, system, permission, plan) show no indicator. Icons inherit the subtle rgba color of the timestamp text for visual consistency.

### Files Changed
- `src/renderer/components/chat/Message.tsx` -- Added `Check` and `Clock` imports from lucide-react; imported `useChatStore`; computed `msgStatus` ('sending' | 'sent' | null) using `isStreaming` and last-user-message detection; modified timestamp div from `textAlign: 'right'` to flex layout with inline status icon after timestamp text

### Build
Status: SUCCESS

```
2385 modules transformed.
built in 7.72s
```

### Acceptance Criteria
- [x] User messages show a check icon after the timestamp when processed
- [x] The last user message shows a clock icon while assistant is streaming
- [x] Clock icon transitions to check icon when streaming completes
- [x] No indicators on assistant/system/permission/plan messages
- [x] Icons match the subtle rgba coloring of user bubble timestamps
- [x] Build passes with zero errors

---

## Iteration 58 -- Thinking Indicator Bubble

_Date: 2026-03-26 | Sprint UI Enhancement_

### Summary
Redesigned the thinking/typing indicator from a flat dot+label layout to a WeChat-style mini bubble with AI avatar. The indicator now renders as a left-aligned mini bubble (matching assistant message bubble styling) with a 28px circular avatar, wave-bouncing dots, contextual activity label (Thinking/Writing/Running command/etc.), and a seconds elapsed timer. Uses `bubble-in-left` entrance animation and `aria-live="polite"` for accessibility.

### Files Changed
- `src/renderer/styles/globals.css` -- Added `@keyframes dot-wave` (wave bounce animation for dots: translateY(0) -> translateY(-4px))
- `src/renderer/components/chat/ChatPanel.tsx` -- Added `Bot` import from lucide-react; rewrote `ThinkingIndicator` component: 28px circular avatar with Bot icon, mini bubble with `--bubble-ai` background and `2px 12px 12px 12px` border-radius, 3 wave-bouncing dots (5px, dot-wave animation with 0.15s stagger), activity label, elapsed seconds timer, `message-enter-left` entrance animation, `aria-live="polite"`

### Build
Status: SUCCESS

```
2385 modules transformed.
built in 7.55s
```

### Acceptance Criteria
- [x] Thinking indicator renders as a left-aligned mini bubble with AI avatar
- [x] Bubble uses same background and border-radius as assistant message bubbles
- [x] 3 dots animate with wave bounce pattern
- [x] Activity label shows contextual text (Thinking/Writing/Running command/etc.)
- [x] Elapsed timer counts seconds while indicator is visible
- [x] Entrance animation uses existing bubble-in-left
- [x] `aria-live="polite"` for accessibility
- [x] Build passes with zero errors

---

## Iteration 59 -- Session List Date Group Headers

_Date: 2026-03-26 | Sprint UI Enhancement_

### Summary
Added date-based grouping headers to the session list. Sessions are now organized under sticky group headers ("Today", "Yesterday", "This Week", "Earlier") when sorted by newest or oldest timestamp. Group headers are not shown when using alphabetical sort or when a search filter is active. Pinned sessions retain their top position and are excluded from date grouping logic. Headers use a subtle uppercase style with sticky positioning.

### Files Changed
- `src/renderer/components/sessions/SessionList.tsx` -- Added `getDateGroup()` helper function (computes Today/Yesterday/This Week/Earlier from timestamp); added `showDateGroups` flag (disabled for alpha sort and search); modified `filtered.map()` to compute and render date group headers as sticky divs before the first session of each group; wrapped session items in `React.Fragment` to allow sibling header elements

### Build
Status: SUCCESS

```
2385 modules transformed.
built in 7.86s
```

### Acceptance Criteria
- [x] Sessions grouped under "Today", "Yesterday", "This Week", "Earlier" headers
- [x] Group headers have sticky positioning
- [x] Headers only shown when sorting by newest/oldest (not alphabetical)
- [x] Headers hidden when search filter is active
- [x] Pinned sessions excluded from date grouping
- [x] Build passes with zero errors

---

## Iteration 60 -- Session Active Streaming Indicator

_Date: 2026-03-26 | Sprint UI Enhancement_

### Summary
Added a small green pulsing dot on the session list avatar when the active session is streaming. The dot appears at the bottom-right corner of the 36px avatar with a 2px border matching the session panel background, providing a WeChat-style "online" indicator that shows at a glance which session is currently generating a response.

### Files Changed
- `src/renderer/components/sessions/SessionList.tsx` -- Added `isStreaming` selector from `useChatStore`; wrapped session avatar in `position: relative` container; added conditional 10px green pulsing dot (using existing `pulse` keyframe) at bottom-right of avatar when `isActive && isStreaming`

### Build
Status: SUCCESS

```
2385 modules transformed.
built in 8.11s
```

### Acceptance Criteria
- [x] Green pulsing dot on active session avatar during streaming
- [x] Dot positioned at bottom-right with 2px panel-colored border
- [x] Uses existing pulse animation
- [x] Only shows on active session during streaming
- [x] Build passes with zero errors

---

## Iteration 61 -- NavRail Custom Tooltips

_Date: 2026-03-26 | Sprint UI Enhancement_

### Summary
Replaced native `title` attribute tooltips on NavRail navigation items with custom-styled tooltips that appear to the right of the icon with a 400ms delay. Tooltips use the established popup styling system (`--popup-bg`, `--popup-border`, `--popup-shadow`) with the `popup-in` entrance animation, providing a polished and consistent tooltip experience. The timer-based approach prevents tooltip flicker during fast mouse movement across the nav rail.

### Files Changed
- `src/renderer/components/layout/NavRail.tsx` -- Removed `title={label}` from NavItem button; added `showTooltip` state with 400ms `setTimeout` on hover; added styled tooltip div positioned to the right of the button with popup variables and popup-in animation; cleanup timer on mouse leave to prevent stale tooltips

### Build
Status: SUCCESS

```
2385 modules transformed.
built in 7.64s
```

### Acceptance Criteria
- [x] Custom styled tooltips appear to the right of NavRail icons on hover
- [x] Tooltips use popup-bg/border/shadow variables for consistency
- [x] 400ms delay before tooltip appears (prevents flicker)
- [x] Tooltip disappears immediately on mouse leave
- [x] Tooltip uses popup-in entrance animation
- [x] Build passes with zero errors

---

## Iteration 62 -- New Message Highlight Glow

_Date: 2026-03-26 | Sprint UI Enhancement_

### Summary
Added a subtle blue glow animation on new messages when they first appear in the chat. When the last message enters (both user and assistant bubbles), a `box-shadow` glow briefly highlights the message for 1.5 seconds before fading out. This draws the user's eye to new content without being distracting. The animation is combined with the existing entrance slide animations. Respects `prefers-reduced-motion`.

### Files Changed
- `src/renderer/styles/globals.css` -- Added `@keyframes message-glow` (box-shadow pulse from accent color at 30% to transparent at 100%); added `.message-new-glow` class; added `.message-new-glow` to `prefers-reduced-motion` disabled list
- `src/renderer/components/chat/MessageList.tsx` -- Added `message-new-glow` class alongside existing entrance classes for the last message

### Build
Status: SUCCESS

```
2385 modules transformed.
built in 7.68s
```

### Acceptance Criteria
- [x] New messages show a subtle blue glow on first appearance
- [x] Glow fades out after 1.5 seconds
- [x] Applied to both user and assistant messages
- [x] Combined with existing entrance animations
- [x] Respects prefers-reduced-motion
- [x] Build passes with zero errors

---

## Iteration 63 -- Message Reactions (Emoji Quick-React)

_Date: 2026-03-26 | Sprint UI Enhancement_

### Summary
Added WeChat/Slack-style hover-triggered emoji quick-reaction buttons to message bubbles. When hovering over any message for 200ms, a floating pill-shaped reaction toolbar appears above the bubble with 5 emoji buttons (thumbs up, heart, laughing, surprised, thinking). Clicking an emoji toggles a reaction badge below the bubble. Badges show the emoji with a count and can be clicked to remove the reaction. Reactions are stored in Zustand (in-memory per session). The toolbar uses popup-in animation and existing CSS variable system. All 3 themes supported.

### Files Changed
- `src/renderer/styles/globals.css` -- Added 7 new CSS variables for reaction system (`--reaction-bar-bg`, `--reaction-bar-border`, `--reaction-bar-shadow`, `--reaction-badge-bg`, `--reaction-badge-border`, `--reaction-badge-active`, `--reaction-badge-active-border`) across all 3 themes (default/modern/minimal)
- `src/renderer/store/index.ts` -- Added `reactions: Record<string, string[]>` state and `toggleReaction(msgId, emoji)` action to `ChatState` interface and implementation
- `src/renderer/components/chat/Message.tsx` -- Added `REACTION_EMOJIS` constant (5 emojis), 200ms delayed reaction toolbar (positioned above bubble, opposite side from avatar), reaction badge row (below bubble, persistent once reactions exist), hover/press scale animations on emoji buttons, accessibility attributes (role="toolbar", aria-labels), compact mode support

### Build
Status: SUCCESS

```
2385 modules transformed.
built in 7.39s
```

### Acceptance Criteria
- [x] Reaction toolbar appears on message hover after 200ms delay
- [x] 5 emoji buttons: thumbs up, heart, laughing, surprised, thinking
- [x] Toolbar uses popup-in animation and popup styling variables
- [x] Toolbar positioned above bubble (top-right for AI, top-left for user)
- [x] Clicking emoji toggles reaction badge below bubble
- [x] Badge shows emoji + count in pill shape
- [x] Badge click removes reaction (toggle)
- [x] Reactions stored in Zustand (in-memory, per session)
- [x] CSS variables defined across all 3 themes
- [x] Compact mode uses smaller sizes (24px buttons, 20px badges)
- [x] Accessibility: role="toolbar", aria-labels on all buttons
- [x] REACTION_EMOJIS constant outside component (performance)
- [x] Build passes with zero errors

---

## Iteration 64 -- Sidebar Search Enhancement

_Date: 2026-03-26 | Sprint UI Enhancement_

### Summary
Enhanced the session list search with richer visual feedback. When a search filter is active, a result count badge appears on the right side of the search input ("N results" or "No results" in red). Additionally, each matching session now shows a match context line below the preview, indicating where the match was found ("in title", "in content", or "in project") with the matched keyword highlighted in context. The context snippet shows up to 30 characters before and after the match with ellipsis for truncation.

### Files Changed
- `src/renderer/components/sessions/SessionList.tsx` -- Added `getMatchContext()` helper function to determine match source and extract contextual snippet; added result count badge (positioned absolute right inside search input wrapper); added match context line below preview with source label in accent color and `HighlightText` highlighting
- `todo/ui-spec-search-preview-2026-03-26.md` -- UI specification for the feature

### Build
Status: SUCCESS

```
2385 modules transformed.
built in 7.42s
```

### Acceptance Criteria
- [x] Result count badge shows "N results" when filter is active
- [x] "No results" text displays in error color
- [x] Match context line shows below preview with source indicator
- [x] Source label ("in title"/"in content"/"in project") in accent color
- [x] Context snippet shows surrounding text with match highlighted
- [x] Ellipsis added when context is truncated
- [x] Match priority: title > content > project
- [x] No context line when filter is empty
- [x] Reuses existing HighlightText component
- [x] Build passes with zero errors

---

## Iteration 65 -- Status Bar Enhancement

_Date: 2026-03-26 | Sprint UI Enhancement_

### Summary
Redesigned the bottom status bar from a flat, cramped information row into a segmented three-zone layout with better visual hierarchy. The bar is now divided into Left (sidebar toggle + working directory), Center (streaming status, context window bar, session duration), and Right (token usage with lucide icons, cost, model badge pill, terminal toggle) zones separated by subtle vertical dividers. Added session duration indicator showing elapsed time since first message. Model name now displays as a pill-shaped badge. Context bar widened to 60px with "Ctx" label. Token arrows replaced with proper lucide ArrowUp/ArrowDown/Recycle icons.

### Files Changed
- `src/renderer/components/layout/StatusBar.tsx` -- Full rewrite: added `Separator` component (1px vertical divider), `formatDuration()` helper (seconds/minutes/hours formatting), three-zone segmented layout, session duration with Clock icon, model badge pill styling, lucide icons for token metrics (ArrowUp/ArrowDown/Recycle replacing text arrows and emoji), wider 60px context bar with "Ctx" label
- `todo/ui-spec-statusbar-enhancement-2026-03-26.md` -- UI specification

### Build
Status: SUCCESS

```
2385 modules transformed.
built in 7.70s
```

### Acceptance Criteria
- [x] Three-zone segmented layout with vertical separators
- [x] Left zone: sidebar toggle + working directory (max 120px, truncated)
- [x] Center zone: streaming indicator, message count, context bar, session duration
- [x] Right zone: token usage, cost, model badge, terminal toggle
- [x] Session duration shows elapsed time (s/m/h format)
- [x] Model badge styled as pill (rounded, semi-transparent background)
- [x] Token usage uses lucide icons instead of text arrows/emoji
- [x] Context bar widened to 60px with "Ctx" label
- [x] Vertical separators: 1px rgba(255,255,255,0.15), 14px tall
- [x] Build passes with zero errors

---

## Iteration 66 -- Session List Hover Polish

_Date: 2026-03-26 | Sprint UI Enhancement_

### Summary
Polished session list item hover interactions with smoother micro-animations. Non-active session items now subtly shift right (2px translateX) on hover for visual feedback. Action buttons (pin, rename, fork, delete) now use opacity+transform transitions (fade in + slide from right) instead of abrupt display toggling. All transitions use consistent 150ms ease timing. The border-left-color also transitions smoothly when items change state.

### Files Changed
- `src/renderer/components/sessions/SessionList.tsx` -- Updated session item hover handlers to add `translateX(2px)` on non-active items; replaced action button `display: none/flex` toggle with `opacity: 0/1` + `transform: translateX(4px/0)` transitions; added `transition: background 0.15s ease, transform 0.15s ease, border-left-color 0.15s ease` to item container; action buttons container changed from `display: none` initial to `display: flex; opacity: 0; transform: translateX(4px)` with `transition: opacity 0.15s ease, transform 0.15s ease`

### Build
Status: SUCCESS

```
2385 modules transformed.
built in 8.13s
```

### Acceptance Criteria
- [x] Non-active session items shift right 2px on hover
- [x] Action buttons fade in with slide-from-right animation
- [x] All transitions use 0.15s ease timing
- [x] Active items don't shift (only background intensifies)
- [x] Border-left-color transitions smoothly
- [x] Action buttons always rendered (opacity 0) instead of display toggled
- [x] Build passes with zero errors

---

## Iteration 67 -- NavRail Shortcut Hints

_Date: 2026-03-26 | Sprint UI Enhancement_

### Summary
Added keyboard shortcut hints to NavRail tooltip popups. When hovering over a navigation item, the tooltip now shows both the label and the associated keyboard shortcut in a styled badge (e.g., "New Chat `Ctrl+N`"). Shortcuts are displayed in a small pill-shaped badge with a subtle background, positioned to the right of the label text. Added shortcuts for New Chat (Ctrl+N), History (Ctrl+B), Terminal (Ctrl+`), and Settings (Ctrl+,). Files has no shortcut assigned.

### Files Changed
- `src/renderer/components/layout/NavRail.tsx` -- Added `shortcut?: string` prop to `NavItemProps` interface; destructured `shortcut` in `NavItem` component; extended tooltip render to include a styled shortcut badge (rgba background, 10px font, muted color) after the label; added `shortcut` prop to New Chat ("Ctrl+N"), History ("Ctrl+B"), Terminal ("Ctrl+\`"), and Settings ("Ctrl+,") NavItem instances

### Build
Status: SUCCESS

```
2385 modules transformed.
built in 8.14s
```

### Acceptance Criteria
- [x] NavItem tooltips show keyboard shortcut in styled badge
- [x] Badge uses subtle rgba background with muted text color
- [x] New Chat: Ctrl+N, History: Ctrl+B, Terminal: Ctrl+`, Settings: Ctrl+,
- [x] Files: no shortcut (prop omitted)
- [x] Shortcut prop is optional (no breaking changes)
- [x] Build passes with zero errors

---

## Iteration 68 -- Onboarding Wizard Visual Redesign

_Date: 2026-03-26 | Sprint UI Enhancement_

### Summary
Redesigned the OnboardingWizard from a plain emoji-based card into a polished, modern first-run experience matching the WeChat-style UI. Replaced raw emoji icons (robot, folder, checkmark) with lucide-react icons (Sparkles, Key, FolderOpen, CheckCircle2) inside 80px circular containers with accent-tinted backgrounds. Replaced step dots with an animated segmented progress bar with "Step N of 4" label. Added step transition animations (fade-in + translateY), icon entrance animations (scale 0.8->1.0), and card popup-in entrance animation. Upgraded card styling to use popup variables (border, shadow, radius 16px). API key input now uses the input-field CSS variable system with focus ring. Buttons upgraded to 42px height with hover scale effects and chevron/arrow icons. Overlay features a subtle radial gradient accent glow. Skip link refined to 11px with underline-on-hover. All animations respect prefers-reduced-motion.

### Files Changed
- `src/renderer/styles/globals.css` -- Added `@keyframes onboard-fade-in` (opacity + translateY transition) and `@keyframes onboard-icon-in` (opacity + scale transition); added `.onboard-step-content` and `.onboard-icon` classes; added both to `prefers-reduced-motion` disable list
- `src/renderer/components/onboarding/OnboardingWizard.tsx` -- Full visual overhaul: replaced emoji imports with lucide-react icons (Sparkles, Key, FolderOpen, CheckCircle2, Folder, ChevronLeft, ChevronRight, ArrowRight); replaced step dots with animated progress bar (200px track, accent fill with cubic-bezier transition, "Step N of 4" label); added 80px circular icon container with accent tint; upgraded card to popup-bg/border/shadow with 16px radius, 520px max-width; upgraded overlay with radial-gradient accent glow; input field uses input-field-bg/border/focus CSS variables with focus ring state; buttons upgraded to 42px height, 8px radius, font-weight 600, with hover scale/brightness effects; added chevron/arrow icons to navigation buttons; skip link refined to 11px with underline-on-hover

### Build
Status: SUCCESS

```
2385 modules transformed.
built in 8.32s
```

### Acceptance Criteria
- [x] Emoji icons replaced with lucide-react icons in 80px circular containers
- [x] Step dots replaced with animated progress bar + "Step N of 4" label
- [x] Step transitions use onboard-fade-in animation
- [x] Icon entrance uses onboard-icon-in animation (scale 0.8->1.0)
- [x] Card uses popup styling system (popup-border, popup-shadow, 16px radius)
- [x] Card entrance uses popup-in animation
- [x] API key input uses input-field CSS variable system with focus ring
- [x] Primary buttons 42px height with hover scale(1.02) + brightness(1.1) effect
- [x] Navigation buttons include chevron/arrow icons
- [x] Overlay has subtle radial gradient accent glow
- [x] Skip link styled as 11px text with underline on hover
- [x] Respects prefers-reduced-motion
- [x] Build passes with zero errors

---

## Iteration 69 -- Welcome Screen Visual Redesign

_Date: 2026-03-26 | Sprint UI Enhancement_

### Summary
Redesigned the WelcomeScreen (empty-state hero shown before first message in every session) from a plain emoji-based layout into a polished, modern hero matching the WeChat-style UI. Replaced the raw robot emoji with a Bot lucide icon inside an 80px accent-tinted circle (same style as the redesigned onboarding). Suggestion cards now use lucide icons (FolderSearch, Bug, Sparkles, FileCode2) inside 44px circular containers instead of raw emoji, with card-bg/card-border CSS variables, 12px border-radius, and hover effects (accent border + scale 1.03). Keyboard shortcuts section redesigned as a 2x3 grid inside a rounded card container with popup-bg/popup-border styled kbd elements. Quick action buttons upgraded with lucide icons (Settings, Terminal, FolderOpen, Keyboard) and larger sizing. Title updated to "Hello! I'm AIPA" with 28px/700 weight typography.

### Files Changed
- `src/renderer/components/chat/ChatPanel.tsx` -- Added 8 new lucide-react icon imports (FolderSearch, Bug, Sparkles, FileCode2, Settings, Terminal, FolderOpen, Keyboard); rewrote WelcomeScreen function: replaced robot emoji with Bot icon in 80px circle, suggestion cards use lucide icons in 44px circular containers with card-bg/card-border styling and hover scale(1.03) + accent border, keyboard shortcuts in 2x3 grid with card container and popup-styled kbd elements, quick action buttons with lucide icons and larger sizing

### Build
Status: SUCCESS

```
2385 modules transformed.
built in 8.48s
```

### Acceptance Criteria
- [x] Robot emoji replaced with Bot icon in 80px accent-tinted circle
- [x] Title updated to "Hello! I'm AIPA" with 28px/700 weight
- [x] Subtitle refined with 360px max-width and 1.7 line-height
- [x] Suggestion cards use lucide icons (FolderSearch, Bug, Sparkles, FileCode2)
- [x] Icons inside 44px circular containers with rgba accent background
- [x] Cards use card-bg/card-border CSS variable system
- [x] Card hover shows accent border + scale(1.03) transform
- [x] Cards have 12px border-radius matching modern design language
- [x] Keyboard shortcuts in 2x3 grid inside card container
- [x] kbd elements use popup-bg/popup-border styling
- [x] Quick action buttons have lucide icons (Settings, Terminal, FolderOpen, Keyboard)
- [x] Quick action buttons larger (12px font, 6px border-radius, icon+label)
- [x] Onboard-icon animation reused for hero Bot entrance
- [x] Build passes with zero errors

---

## Iteration 70 — Permission Card Visual Upgrade

_Date: 2026-03-27 | Sprint UI Enhancement_

### Summary
Fixed animation conflict in PermissionCard where `style.animation` (popup-in) was overriding the CSS class `permission-card-pending` (permission-glow). Refactored animation control entirely to CSS classes: non-pending cards get `permission-card-enter` (popup-in entry), pending cards get `permission-card-pending` (popup-in entry + permission-glow continuous via CSS animation list). Also added `permission-card-enter` to the prefers-reduced-motion disable list.

### Files Changed
- `electron-ui/src/renderer/components/chat/PermissionCard.tsx` — Removed `animation` from inline style, switched className to `permission-card-enter` (resolved) or `permission-card-pending` (pending)
- `electron-ui/src/renderer/styles/globals.css` — Added `.permission-card-enter` class; updated `.permission-card-pending` to use comma-separated dual animation (popup-in + permission-glow with 0.2s delay); added `permission-card-enter` to prefers-reduced-motion block

### Build
Status: SUCCESS — all three targets (main, preload, renderer via Vite) compiled with zero errors

### Acceptance Criteria
- [x] Tool-specific icon in 44px circle with rgba tint
- [x] Card max-width 420px, centered, border-radius 12px
- [x] Pending state has animated glow (permission-glow keyframe, 2s infinite)
- [x] Allow button: filled accent, 36px height, hover scale(1.02) + brightness(1.1)
- [x] Deny button: transparent with border, 36px height, hover popup-item-hover
- [x] Resolved state shows pill badge (Check/green or X/red)
- [x] Card uses popup-in entrance animation (via CSS class, no style conflict)
- [x] permission-glow in prefers-reduced-motion disable list
- [x] Build passes with zero errors

---

## Iteration 71 — Message Context Menu Visual Upgrade

_Date: 2026-03-27 | Sprint UI Redesign_

### Summary

Replaced the separate per-role hover copy buttons with a unified floating action toolbar that appears at the top-right corner of any message bubble on hover. The toolbar contains Copy (with "Copied!" feedback), Bookmark (with active fill state), and Quote Reply (inserts markdown blockquote into the input bar) buttons. The Raw Markdown toggle for assistant messages is also consolidated into this toolbar. The existing right-click context menu (MessageContextMenu.tsx) is preserved unchanged.

### Files Changed

- `src/renderer/store/index.ts` — Added `quotedText: string | null` and `setQuotedText` action to `useUiStore` for cross-component quote communication
- `src/renderer/components/chat/Message.tsx` — Replaced two separate hover button blocks (assistant + user) with a single unified floating toolbar using `popup-enter` animation; added `handleQuote` and `handleBookmarkAction` callbacks; imported `MessageSquareQuote` and `useUiStore`
- `src/renderer/components/chat/ChatPanel.tsx` — Added `quotedText`/`setQuotedText` selectors and a `useEffect` that converts quoted text to markdown blockquote format (`> line`) and prepends it to the input, then focuses the textarea

### Build

Status: SUCCESS (all three steps: tsc main, tsc preload, vite build)

### Acceptance Criteria

- [x] Hover any message shows floating action toolbar at top-right corner (top-left for user messages)
- [x] Toolbar uses `var(--popup-bg)`, `var(--popup-border)`, `var(--popup-shadow)` variable system
- [x] Toolbar appears with `popup-enter` (popup-in) fade-in animation
- [x] Copy button shows Check icon + "Copied!" text for 2s after click
- [x] Bookmark button shows filled warning-color icon when message is bookmarked
- [x] Quote button inserts `> content` markdown blockquote into input bar and focuses textarea
- [x] Raw markdown toggle preserved for assistant messages inside the same toolbar
- [x] Existing right-click context menu (MessageContextMenu) unchanged
- [x] Existing `onBookmark` prop wiring preserved; fallback to store `toggleBookmark`
- [x] Build passes with zero errors

---

## Iteration 72 -- Code Block Line Numbers

_Date: 2026-03-27 | Sprint UI Enhancement_

### Summary
Added line numbers to multi-line code blocks in assistant message markdown rendering. When a code block has more than 1 line, a line number gutter appears on the left side with muted styling (rgba(255,255,255,0.25)), right-aligned, separated from code by a subtle 1px border. Line numbers are marked `aria-hidden` and use `user-select: none` so they are excluded from clipboard when users copy code. The gutter width adapts automatically: 24px for <10 lines, 32px for 10-99, 40px for 100+. Single-line code blocks render without line numbers (unchanged behavior).

### Files Changed
- `src/renderer/components/chat/MessageContent.tsx` -- Modified the `code()` component renderer inside ReactMarkdown: added `showLineNumbers` flag for multi-line blocks; when active, wraps content in a flex container with a left-side line number gutter div (aria-hidden, user-select:none, monospace font at 11px, right-aligned with padding, adaptive min-width based on line count) and the code element set to `flex:1, display:block, overflowX:auto`; single-line blocks remain unchanged

### Build
Status: SUCCESS

```
2385 modules transformed.
built in 8.11s
```

### Acceptance Criteria
- [x] Multi-line code blocks show line numbers in left gutter
- [x] Line numbers use muted color (rgba(255,255,255,0.25))
- [x] Line numbers right-aligned with 12px right padding
- [x] Gutter separated by 1px rgba(255,255,255,0.08) border
- [x] Line numbers excluded from text selection (user-select: none)
- [x] Line numbers marked aria-hidden for accessibility
- [x] Gutter width adapts: 24px (<10 lines), 32px (10-99), 40px (100+)
- [x] Single-line code blocks unchanged (no line numbers)
- [x] Line number font matches code font (Cascadia Code/Fira Code/Consolas)
- [x] Compatible with existing CollapsiblePre collapse/expand
- [x] Build passes with zero errors

---

## Iteration 73 -- Compose Status Bar (Word/Char Counter)

_Date: 2026-03-27 | Sprint UI Enhancement_

### Summary
Added a compose status bar below the input textarea that shows word count and character count whenever the user is typing. Replaces the old >5000 char warning with an always-visible status indicator that uses muted color for normal input, warning color for >5000 chars, and error color for >10000 chars. The bar displays "N words | N chars" format with smooth color transitions. The old separate character count warning above the toolbar has been removed since the compose status provides the same information in a more integrated position.

### Files Changed
- `src/renderer/components/chat/ChatPanel.tsx` -- Removed the old >5000 char warning div that appeared above the toolbar; added compose status bar below the input row (after send button, before input bar closing div) showing word count and character count; status bar visible only when input is non-empty; color transitions from `var(--text-muted)` (normal) to `var(--warning)` (>5000) to `var(--error)` with bold weight (>10000); uses right-aligned flex layout matching existing input bar styling

### Build
Status: SUCCESS

```
2385 modules transformed.
built in 8.37s
```

### Acceptance Criteria
- [x] Word count displayed when user has typed text
- [x] Character count displayed alongside word count
- [x] Separator "|" between word and char counts
- [x] Muted color for normal input (<5000 chars)
- [x] Warning color for >5000 chars with "(long)" label
- [x] Error color with bold weight for >10000 chars with "(very long)" label
- [x] Status bar hidden when input is empty
- [x] Smooth color transition (200ms)
- [x] Old >5000 char warning removed (replaced by compose status)
- [x] Status bar positioned below input row, right-aligned
- [x] Build passes with zero errors

---

## Iteration 74 -- Code Block Language Badge Colors

_Date: 2026-03-27 | Sprint UI Enhancement_

### Summary
Added color-coded language indicators to code block headers. Each programming language now shows a colored dot next to the language name, and the language text itself is tinted with the same color. Covers 50+ languages including JavaScript (yellow), TypeScript (blue), Python (blue-gray), Rust (orange), Go (cyan), Java (orange), Ruby (red), PHP (purple), C/C++ (blue), and many more. Languages without a defined color fall back to the existing muted style. The colored dot is 8px with full border-radius, providing a quick visual cue for scanning code blocks.

### Files Changed
- `src/renderer/components/chat/MessageContent.tsx` -- Added `LANG_COLORS` constant mapping 50+ language identifiers to hex colors; added `getLangColor()` helper function; updated the code block header to use flex layout with colored dot indicator (8px circle) and color-tinted language name with fontWeight 500; line count label repositioned within flex gap

### Build
Status: SUCCESS

```
2385 modules transformed.
built in 8.72s
```

### Acceptance Criteria
- [x] Language dot indicator (8px colored circle) appears in code block header
- [x] Language name text colored with language-specific color
- [x] Language name uses fontWeight 500 when colored
- [x] 50+ languages covered (JS, TS, Python, Rust, Go, Java, Ruby, etc.)
- [x] Unknown languages fall back to muted style (no dot, normal weight)
- [x] Dot and text use same color for consistency
- [x] Line count label preserved after language badge
- [x] Flex layout with gap:6 for proper spacing
- [x] Build passes with zero errors

---

## Iteration 75 -- Enhanced Message Status Indicators (Read Receipts)

_Date: 2026-03-27 | Sprint UI Enhancement_

### Summary
Enhanced user message status indicators with a WhatsApp/WeChat-style three-state system. Previously, user messages showed either a Clock (sending) or single Check (sent) icon. Now the system distinguishes between "sent" (single check, message delivered but no reply yet) and "read" (double check marks in accent color, assistant has responded). The `CheckCheck` icon from lucide-react is used for the "read" state. The status is computed by checking if an assistant message exists after the current user message in the message array.

### Files Changed
- `src/renderer/components/chat/Message.tsx` -- Added `CheckCheck` import from lucide-react; added `hasAssistantReply` selector (searches for assistant message after current user message); updated `msgStatus` type to include `'read'` state; added read receipt rendering (CheckCheck icon, size 12, accent color) in timestamp section

### Build
Status: SUCCESS

```
2385 modules transformed.
built in 8.32s
```

### Acceptance Criteria
- [x] User messages show Clock icon when streaming (sending state)
- [x] User messages show single Check when sent but no reply yet
- [x] User messages show double CheckCheck when assistant has replied (read state)
- [x] Read receipt uses accent color for visual distinction
- [x] Status computed from message array (no new state needed)
- [x] Only applies to user messages (assistant messages unchanged)
- [x] Build passes with zero errors

---

## Iteration 76 -- Tool Use Duration Display

_Date: 2026-03-27 | Sprint UI Enhancement_

### Summary
Enhanced ToolUseBlock to show the final execution duration after a tool completes. Previously, the elapsed timer was only visible while the tool was actively running (and only after 2 seconds). Now, when a tool finishes (status transitions from "running" to "done" or "error"), the final duration is captured and displayed permanently in the tool header using a Timer icon with monospace font. The duration shows for any tool that took 1 second or more. Running tools still show the live elapsed timer in warning color, while completed tools show the final duration in muted color (or error color for failed tools).

### Files Changed
- `src/renderer/components/chat/ToolUseBlock.tsx` -- Added `Timer` import from lucide-react; added `finalDuration` state variable to capture elapsed time on completion; updated `useEffect` to set `finalDuration` when tool transitions from running to done; added `showFinalDuration` flag (shows when not running and duration >= 1s); added Timer icon + formatted duration display after status icon with muted opacity styling

### Build
Status: SUCCESS

```
2385 modules transformed.
built in 9.99s
```

### Acceptance Criteria
- [x] Final duration displayed after tool completion (>= 1s)
- [x] Timer icon (size 9) next to duration text
- [x] Monospace font for duration display
- [x] Muted color for successful tools
- [x] Error color for failed tools
- [x] Duration captured from live elapsed timer on state transition
- [x] Live elapsed timer still shows during execution (warning color, >= 2s)
- [x] Duration hidden for tools that complete in < 1s
- [x] Build passes with zero errors

---

## Iteration 77 -- Code Block Word Wrap Toggle

_Date: 2026-03-27 | Sprint UI Enhancement_

### Summary
Added a word wrap toggle button to code block headers. Each multi-line code block now shows a WrapText icon button next to the Copy button in the header bar. Clicking it toggles between horizontal scrolling (default) and word-wrapped display. The toggle state is per code block instance. When word wrap is enabled, the button appears brighter (highlighted state). The feature works with both single-line and multi-line code blocks, and is compatible with the existing line numbers, collapsible pre, and language badge features. Extracted the code block rendering from the inline `code()` render function into a proper `CodeBlockWithHeader` React component to support `useState` for the wrap state.

### Files Changed
- `src/renderer/components/chat/MessageContent.tsx` -- Added `WrapText` import from lucide-react; added `WrapToggleButton` component (toggle button with highlighted/muted states); added `CodeBlockWithHeader` component (proper React component with `wordWrap` useState, renders full code block header with language badge + wrap toggle + copy button, and body with conditional `whiteSpace: pre-wrap` / `wordBreak: break-word` / `overflowX: visible` when wrapped); replaced old inline code block rendering in ReactMarkdown's `code()` function with `<CodeBlockWithHeader>` call

### Build
Status: SUCCESS

```
2385 modules transformed.
built in 8.27s
```

### Acceptance Criteria
- [x] Wrap toggle button (WrapText icon) appears in code block header
- [x] Clicking toggle switches between horizontal scroll and word wrap
- [x] Wrapped mode uses pre-wrap whitespace and break-word
- [x] Toggle state is per code block (independent)
- [x] Button appears highlighted (brighter) when wrap is active
- [x] Works with line numbers (multi-line blocks)
- [x] Works with single-line code blocks
- [x] Compatible with CollapsiblePre collapse/expand
- [x] Compatible with language badge colors
- [x] Extracted to proper React component (CodeBlockWithHeader) for useState support
- [x] Build passes with zero errors

---

## Iteration 78 -- Rotating Input Placeholder Suggestions

_Date: 2026-03-27 | Sprint UI Enhancement_

### Summary
Added rotating placeholder text to the input textarea that cycles through helpful prompt suggestions every 4 seconds. Instead of the static "Message AIPA..." placeholder, the textarea now rotates through 8 different suggestions including "Ask me to analyze your code...", "Describe a bug to investigate...", "Try: \"Explain this function\"", and more. The rotation pauses when the user has typed any text (placeholder is not visible anyway), and resumes when the input is cleared. Provides subtle guidance to new users about what they can ask.

### Files Changed
- `src/renderer/components/chat/ChatPanel.tsx` -- Added `PLACEHOLDER_SUGGESTIONS` constant array (8 suggestions); added `placeholderIdx` state with `setInterval` rotation (4s cycle); timer pauses when `input.length > 0`; textarea `placeholder` prop changed from static string to `PLACEHOLDER_SUGGESTIONS[placeholderIdx]`

### Build
Status: SUCCESS

```
2385 modules transformed.
built in 9.32s
```

### Acceptance Criteria
- [x] Placeholder text rotates through 8 different suggestions
- [x] Rotation cycle is 4 seconds per suggestion
- [x] Rotation pauses when user has typed text
- [x] Rotation resumes when input is cleared
- [x] Default first suggestion is "Message AIPA..." (familiar)
- [x] Suggestions include actionable prompts (analyze, fix, explain, refactor, review)
- [x] No visual flicker during rotation (smooth text change)
- [x] Build passes with zero errors

---

## Iteration 79 -- Auto-Expand Thinking During Stream

_Date: 2026-03-27 | Sprint UI Enhancement_

### Summary
Added automatic expand/collapse behavior for thinking blocks in assistant messages. When a message is actively streaming and contains thinking content, the thinking block automatically expands so users can watch the AI's thought process in real-time. When streaming completes, the thinking block auto-collapses to keep the final response clean. The label changes from "Thinking" to "Thinking..." while streaming is active. Users can still manually toggle the thinking block at any time, and the auto behavior only triggers on streaming state transitions.

### Files Changed
- `src/renderer/components/chat/Message.tsx` -- Added `isMessageStreaming` variable from `StandardChatMessage.isStreaming`; added `prevStreamingRef` useRef to track streaming state transitions; added useEffect that auto-expands thinkingExpanded when streaming starts with thinking content, and auto-collapses when streaming ends; updated thinking button label to show "Thinking..." during active streaming

### Build
Status: SUCCESS

```
2385 modules transformed.
built in 8.20s
```

### Acceptance Criteria
- [x] Thinking block auto-expands when streaming starts with thinking content
- [x] Thinking block auto-collapses when streaming ends
- [x] Label shows "Thinking..." during active streaming
- [x] Label shows "Thinking" after streaming completes
- [x] Manual toggle still works (user can collapse during stream)
- [x] No effect on messages without thinking content
- [x] Uses ref-based prev state tracking to detect transitions
- [x] Build passes with zero errors

---

## Iteration 80 -- i18n Multi-Language Support

_Date: 2026-03-27 | Sprint Internationalization_

### Summary
Added a complete internationalization (i18n) system to AIPA with zero new npm dependencies. Created a custom React context-based I18nProvider with a `t(key, params?)` translation function, supporting English (en) and Simplified Chinese (zh-CN). The app defaults to the system locale (detected via Electron `app.getLocale()`) and allows manual language switching from a new "Language" dropdown in Settings. Language preference persists across restarts via electron-store. All major UI components have been migrated to use translation keys: Settings panel (~40 strings), NavRail (6 labels), StatusBar (5 labels), SessionList (date groups, search, match context), OnboardingWizard (15 strings), MessageContextMenu (10 menu items). Missing keys fall back to English gracefully.

### Files Changed
- `src/renderer/i18n/index.tsx` -- New: I18nProvider context, useI18n/useT hooks, t() function with dot-notation key lookup and {{param}} substitution, system locale resolution, persistence via prefsSet
- `src/renderer/i18n/locales/en.json` -- New: Complete English translation file with ~180 keys organized in 14 namespaces (nav, chat, welcome, message, session, settings, onboarding, toolbar, command, permission, taskQueue, terminal, fileBrowser, error, common, shortcutCheatsheet)
- `src/renderer/i18n/locales/zh-CN.json` -- New: Complete Simplified Chinese translation file matching all English keys
- `src/renderer/index.tsx` -- Wrapped App with I18nProvider
- `src/renderer/types/app.types.ts` -- Added `language?: 'en' | 'zh-CN' | 'system'` to ClaudePrefs
- `src/main/ipc/index.ts` -- Added `config:getLocale` IPC handler using `app.getLocale()`; imported `app` from electron
- `src/preload/index.ts` -- Added `configGetLocale` API method
- `src/renderer/components/settings/SettingsPanel.tsx` -- Added Language dropdown as first item in General tab; translated all labels, hints, tab names, about section using t()
- `src/renderer/components/layout/NavRail.tsx` -- Translated all 6 nav item labels and aria-labels using t()
- `src/renderer/components/layout/StatusBar.tsx` -- Translated streaming indicator, message count, toggle tooltips using t()
- `src/renderer/components/sessions/SessionList.tsx` -- Translated date group headers (Today/Yesterday/This Week/Earlier), search placeholder, result count, match source labels using t()
- `src/renderer/components/chat/MessageContextMenu.tsx` -- Translated all 8 menu items (Copy, Copy as Markdown, Bookmark, Collapse, Thumbs up/down, Rewind) using t()
- `src/renderer/components/onboarding/OnboardingWizard.tsx` -- Translated all 4 step titles, descriptions, button labels, progress label using t()

### Build
Status: SUCCESS

```
2388 modules transformed.
built in 7.35s
```

### Acceptance Criteria
- [x] I18nProvider context wraps the app, provides t() function
- [x] en.json contains all extracted UI strings (~180 keys in 14 namespaces)
- [x] zh-CN.json contains complete Chinese translations
- [x] App defaults to system locale on first launch (via app.getLocale())
- [x] Settings panel has a "Language / 语言" dropdown with System Default, English, 简体中文
- [x] Language preference persists across app restarts (electron-store via prefsSet)
- [x] Switching language updates all visible UI text without app restart
- [x] Missing translation keys fall back to English
- [x] No new npm dependencies added
- [x] Build passes with zero TypeScript errors
