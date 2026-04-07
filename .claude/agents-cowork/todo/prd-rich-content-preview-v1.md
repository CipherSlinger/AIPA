# PRD：富内容预览增强
_版本：v1 | 状态：Draft | PM：aipa-pm | 日期：2026-04-03_

## 一句话定义
增强聊天面板中的内容呈现能力：为 ToolUseBlock 添加文件类型图标、支持图片附件内联预览与放大查看、URL 链接显示预览卡片，让 AI 的工具调用结果和聊天内容从纯文本升级为可视化的富媒体体验。

## 背景与动机
AIPA 当前的聊天内容呈现以纯文本为主，AI 工具调用的文件路径只显示为文本字符串，图片附件无法预览，消息中的 URL 链接也是纯文本。对比 Claude Desktop 的 Artifact 渲染、ChatGPT 的链接预览和文件预览，AIPA 在内容可视化方面存在明显差距。

**产品方向对齐**：此 PRD 属于"个人助手"方向的第三个支柱 — 丰富的多模态输入输出。通过让 AI 的操作结果更加可视化，降低用户理解工具调用结果的认知负荷。

## 目标用户
- **主要**：日常使用 AIPA 进行文件管理、网页查询的用户 — 文件操作和 URL 交互是最高频场景
- **次要**：开发者用户 — 代码文件的类型识别和 diff 查看已有支持，本次增强补齐图片/文档类文件的预览

## 用户故事
作为 AIPA 的日常用户，
我希望 AI 读取文件或访问网页后，能直接在聊天中看到文件类型图标、图片预览和网页摘要卡片，
以便快速理解 AI 的操作结果，而不用离开 AIPA 去手动打开文件或浏览器。

## 功能范围

### In Scope（本版本包含）
1. **ToolUseBlock 文件类型图标增强**：根据工具操作涉及的文件扩展名，在工具摘要行显示对应的文件类型图标
2. **图片附件内联预览与放大**：当工具结果包含图片路径（.png/.jpg/.gif/.svg/.webp）时，在 ToolUseBlock 展开区域内显示缩略图，点击可放大查看
3. **URL 链接预览卡片**：在 AI 回复的 Markdown 内容中，将独立成行的 URL 渲染为预览卡片（标题 + 描述 + favicon），其余内联 URL 保持为普通超链接

### Out of Scope（本版本不包含）
- **PDF/Office 文档预览**：需要额外的渲染引擎，复杂度高，推迟到后续版本
- **视频/音频预览**：使用场景不够高频，优先级低
- **截图捕获（Ctrl+Shift+X）**：需要新增 IPC 通道和主进程权限，独立为另一个 PRD
- **URL 元数据后端缓存**：首版通过主进程代理请求即可，不做独立缓存服务

## 功能详述

### 功能模块 1：ToolUseBlock 文件类型图标

**描述**：在 ToolUseBlock 头部的工具摘要行（目前显示 Icon + summaryLabel），根据涉及文件的扩展名显示更精确的文件类型图标，替代当前笼统的 `FileEdit` 图标。

**交互逻辑**：
- 从 `tool.input` 中提取文件路径（`file_path`、`path`、`command` 中的路径）
- 根据文件扩展名映射到对应图标：
  - `.ts/.tsx/.js/.jsx` → 代码文件图标（保留现有 Terminal/FileEdit）
  - `.md/.txt/.json/.yaml/.toml` → 文档图标
  - `.png/.jpg/.gif/.svg/.webp` → 图片图标
  - `.css/.scss/.less` → 样式图标
  - `.html` → 网页图标
  - 其他 → 默认文件图标
- 图标显示在工具名称左侧，替换当前的 `TOOL_ICONS` 映射中的通用图标

**边界条件**：
- 工具输入中无法提取文件路径时：回退到现有的 `TOOL_ICONS` 映射
- 路径包含多个文件时（如 MultiEdit）：显示主文件的图标
- 文件扩展名未知时：显示默认文件图标

**验收标准**：
- [ ] Read/Write/Edit 操作 `.ts` 文件时，显示代码文件图标
- [ ] Read 操作 `.png` 文件时，显示图片文件图标
- [ ] Read 操作 `.md` 文件时，显示文档图标
- [ ] 无法��取文件路径的工具操作，图标显示不受影响（回退到默认）
- [ ] Bash/WebFetch 等非文件操作工具的图标不受影响

### 功能模块 2：图片附件内联预览

**描述**：当 ToolUseBlock 的工具结果（tool.result）或工具输入（tool.input）涉及图片文件时，在展开的工具详情区域底部显示图片缩略图。点击缩略图可弹出全尺寸预览。

**交互逻辑**：
1. 检测工具输入/结果中的图片路径（匹配 `.png/.jpg/.jpeg/.gif/.svg/.webp` 扩展名）
2. 在 ToolUseBlock 展开区域底部渲染 `<img>` 缩略图：
   - 最大宽度 300px，最大高度 200px，保持比例
   - 使用 `file://` 协议加载本地图片（Electron 环境支持）
   - 加载失败时显示占位符（broken image 图标 + 文件名文本）
3. 点击缩略图 → 弹出全屏遮罩层 Lightbox：
   - 居中显示原始尺寸图片（受视口 90% 约束）
   - 点击遮罩或按 Escape 关闭
   - 底部显示文件名

**边界条件**：
- 图片文件不存在或已删除：显示加载失败占位符
- 图片尺寸极大（>10MB）：不自动加载，显示「点击加载」按钮
- 工具结果中包含多张图片：横向排列缩略图，最多显示 4 张，超出显示「+N more」
- GIF 动图：缩略图中播放动画，Lightbox 中同样播放

**验收标准**：
- [ ] AI 执行 Read 操作读取一个 `.png` 文件后，ToolUseBlock 展开区域显示该图片的缩略图
- [ ] 缩略图尺寸不超过 300x200px
- [ ] 点击缩略图弹出 Lightbox，显示完整图片
- [ ] Lightbox 可通过点击遮罩或 Escape 关闭
- [ ] 图片加载失败时显示占位符而非破碎页面
- [ ] 非图片文件的 ToolUseBlock 不显示预览区域

### 功能模块 3：URL 链接预览卡片

**描述**：AI 回复内容中独立成行的 URL（如 WebFetch/WebSearch 结果中引用的链接），渲染为带标题、描述和 favicon 的预览卡片。

**交互逻辑**：
1. 在 Markdown 渲染阶段，检测独立成行的 URL（行内仅包含一个 URL，不混杂其他文本）
2. 通过主进程 IPC 通道请求 URL 的 Open Graph 元数据（title, description, image, favicon）
3. 渲染预览卡片：
   - 卡片宽度 100%（受消息气泡宽度约束）
   - 左侧 favicon（16x16），右侧标题（一行）+ 描述（最多两行截断）+ 域名文本
   - 卡片可点击，使用 `shell.openExternal()` 在默认浏览器中打开
   - 加载元数据期间显示带 shimmer 动画的骨架屏
4. 元数据获取失败时：降级为普通超链接样式（带域名文本 + 外链图标）

**边界条件**：
- URL 的 Open Graph 元数据为空：显示域名 + URL 路径作为标题
- 同一条消息中有多个独立 URL：每个渲染独立卡片，但总数超过 5 个时折叠为列表
- 元数据请求超时（3秒）：降级为普通链接
- 内联 URL（混在文字中间）：保持现有渲染行为，不转换为卡片

**验收标准**：
- [ ] AI 回复中独立成行的 URL 显示为预览卡片（带标题和描述）
- [ ] 卡片加载过程中显示骨架屏动画
- [ ] 点击卡片在默认浏览器中打开 URL
- [ ] 元数据获取失败时降级为普通链接样式
- [ ] 内联 URL 不受影响，保持为普通超链接
- [ ] 卡片在深色和浅色主题下样式正确

## 非功能需求
- **性能**：图片缩略图使用懒加载，仅在视口内时加载；URL 元数据请求使用简单的内存缓存（Map），同一 URL 不重复请求
- **安全**：URL 元数据请求通过主进程代理（避免 CORS），不发送 Cookie 或身份信息；图片加载仅允许 `file://` 和 `https://` 协议
- **可访问性**：图片缩略图带 `alt` 文本（文件名）；预览卡片使用 `<a>` 标签确保键盘可达；Lightbox 有 `aria-modal` 和 focus trap
- **兼容性**：Windows 10/11，Electron 39+

## 成功指标
- ToolUseBlock 中涉及图片的工具操作有缩略图预览
- AI 回复中的独立 URL 有预览卡片
- 文件类型图标正确反映操作的文件类型

## 优先级
- **P0**：文件类型图标增强 — 改动最小，收益直观
- **P0**：图片附件内联预览 — 用户感知明显的体验升级
- **P1**：URL 链接预览卡片 — 需要新增 IPC 通道，改动较大

## 技术备注

**涉及文件清单**：
| 文件 | 变更类型 | 风险等级 |
|------|----------|----------|
| `src/renderer/components/chat/ToolUseBlock.tsx` | 增加文件类型图标映射 + 图片预览区域 | 中 |
| `src/renderer/components/chat/MessageBubbleContent.tsx` | URL 卡片渲染逻辑 | 中 |
| `src/main/ipc/index.ts` | 新增 `url:fetchMeta` IPC 通道 | 中 |
| `src/preload/index.ts` | 暴露 `urlFetchMeta` API | 低 |
| `src/renderer/i18n/locales/en.json` | 新增 `preview.*` 命名空间 | 低 |
| `src/renderer/i18n/locales/zh-CN.json` | 对应中文翻译 | 低 |

**需要新增的 i18n 键**（`preview` 命名空间）：
- `preview.loadingMeta` — "Loading preview..."
- `preview.openInBrowser` — "Open in browser"
- `preview.imageLoadFailed` — "Image could not be loaded"
- `preview.clickToLoad` — "Click to load image"
- `preview.moreImages` — "+{count} more"
- `preview.close` — "Close preview"

**i18n 注意**：本 PRD 涉及 i18n 文件修改，若与其他 PRD 并行执行，i18n 条目需由 leader 统一合并。

**涉及后端（主进程）变更**：
- 新增 IPC 通道 `url:fetchMeta`：接收 URL 字符串，主进程通过 `https` 模块请求目标页面的 HTML（限制 response body 前 50KB），解析 `<title>`、`og:title`、`og:description`、`og:image`、favicon link，返回结构化元数据对象
- 请求超时 3 秒，失败返回 `null`

## 依赖与风险
| 依赖项 | 负责方 | 风险等级 |
|--------|--------|----------|
| 新增 `url:fetchMeta` IPC 通道 | aipa-backend / frontend | 中（需主进程配合） |
| Electron `file://` 协议图片加载 | 前端 | 低（Electron 标准能力） |
| `shell.openExternal` API | 前端 | 低（已在项目中广泛使用） |

## 开放问题
- [ ] URL 元数据是否需要持久化缓存（写入 electron-store）？建议首版使用内存缓存，后续根据使用频率决定。
- [ ] 图片预览是否需要支持拖拽保存到桌面？建议推迟到后续版本。

## 执行顺序建议
- P0 文件类型图标：纯前端改动，无依赖，可立即执行
- P0 图片预览：纯前端，依赖 `file://` 协议加载能力（Electron 内置）
- P1 URL 卡片：需先由 aipa-backend 实现 `url:fetchMeta` IPC 通道，再由 frontend 消费
- 建议拆为两次迭代：第一次完成图标 + 图片预览，第二次完成 URL 卡片
