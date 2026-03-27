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
