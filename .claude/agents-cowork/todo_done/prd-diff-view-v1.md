# PRD: 代码变更视图（Changes Panel + Diff Viewer）

_版本：v1 | 状态：Draft | PM：aipa-pm | 日期：2026-04-07_

## 一句话定义

在侧边栏新增「Changes」面板，实时追踪 Claude 在当前会话中修改的文件，并提供 unified diff 视图，让用户随时审查 AI 的代码变更。

## 背景与动机

当前 AIPA 用户在 Claude 完成编码后，必须切换到终端或 IDE 手动运行 `git diff` 来审查变更。这造成严重的上下文切换成本，且用户经常忘记检查就直接继续对话，导致问题在多轮修改后才被发现。

代码审查是开发者使用 AI 编程工具的核心环节。所有竞品（Cursor、Windsurf、VS Code Claude）都内置了 diff 视图。AIPA 缺少这一能力是从「聊天工具」进化到「编程驾驶舱」的关键短板。

此功能属于 Superpower Integration Plan Phase 2.6，与 PRD-1（权限 UI）和 PRD-2（Hooks UI）无文件冲突，可并行执行。

## 目标用户

**主要**：开发者——使用 AIPA 进行代码生成和修改，需要审查每轮变更
**次要**：Code Reviewer——使用 AIPA 辅助代码审查，需要看到 AI 建议的变更

## 用户故事

作为一个使用 AIPA 进行编码的开发者，
我希望能在侧边栏直接看到 Claude 修改了哪些文件，并点击查看每个文件的 diff，
以便在不离开 AIPA 的情况下审查、理解和确认 AI 的每一处代码变更。

## 功能范围

### In Scope（本版本包含）

1. **NavRail「Changes」Tab**：侧边栏导航新增 Changes 入口，带变更文件计数角标
2. **ChangesPanel**：列出当前会话中 Claude 修改过的文件，按轮次分组
3. **Unified Diff 视图**：点击文件展开 diff 内容（增删行高亮）
4. **「View All Changes」按钮**：一键显示 `git diff HEAD` 全部未提交变更

### Out of Scope（本版本不包含，说明原因）

- **Side-by-side diff 视图**：需要双列布局，实现复杂，v2 迭代
- **Diff 中直接编辑**：需要完整的编辑器集成，不在 scope
- **暂存/提交操作**：`git add` / `git commit` UI——属于独立 Git 管理 PRD
- **非 git 项目支持**：仅支持 git 仓库内的项目，非 git 项目不显示 Changes Tab
- **文件历史版本对比**：比较两个 commit 之间的差异——属于 Phase 3 功能

## 功能详述

### 功能 1：NavRail「Changes」Tab

**描述**：在左侧 NavRail 新增「Changes」导航项，使用 GitBranch 图标（或 FileDiff 图标）。当会话中有文件变更时显示计数角标。

**交互逻辑**：
- 点击 Changes Tab → 侧边栏切换到 ChangesPanel
- 角标数字 = 当前会话中被 Claude 修改的文件数（去重）
- 无变更时 → 不显示角标（图标仍在，点击可进入面板查看空状态）
- 角标颜色：使用现有 NavItem 的 badge 机制（蓝色数字角标）

**边界条件**：
- 新建会话（无历史）→ 角标为 0，不显示
- 切换会话 → 角标更新为新会话的变更文件数
- 当前目录不是 git 仓库 → Tab 仍然显示，但 diff 功能不可用，显示提示

**验收标准**：
- [ ] NavRail 出现 Changes Tab，位于合适位置（建议在 History 和 Files 之间）
- [ ] 角标正确显示当前会话变更文件数
- [ ] 无变更时不显示角标
- [ ] 点击 Tab 切换到 ChangesPanel

### 功能 2：ChangesPanel 变更文件列表

**描述**：侧边栏面板，列出当前会话中 Claude 修改过的文件。文件来源为聊天中的 `toolUse` 事件（FileEditTool、FileWriteTool、Write 工具的 `file_path` 参数）。

**交互逻辑**：
- 数据来源：useChatStore 中新增 `changedFiles` 状态，由 useStreamJson hook 在接收到 FileEditTool/FileWriteTool/Write 类型的 toolUse 事件时自动记录
- changedFiles 数据结构：`Array<{ filePath: string; turnIndex: number; toolName: string; timestamp: number }>`
- 文件列表按「轮次」分组（同一轮 assistant 响应中的所有修改归为一组）：
  - 分组标题：「Turn N」（N = 用户消息序号）
  - 每个文件行：文件图标 + 文件名（basename）+ 路径（dirname，灰色小字）+ 工具类型标签（Edit/Write/Create）
- 点击文件行 → 展开/折叠该文件的 diff 视图
- 「View All Changes」按钮（面板底部）→ 展开全量 diff 视图

**边界条件**：
- 同一文件被多次修改 → 在最后一次修改的轮次中显示，标注修改次数（x2、x3）
- 文件被删除（如果 Claude 执行了 rm）→ 文件标记为 deleted，diff 显示全部删除
- 非 git 仓库 → 文件列表仍显示（来自 toolUse 事件），但 diff 功能不可用，文件行显示 tooltip「Git diff not available」
- 会话加载历史（session:load）→ 扫描历史消息中的 FileEditTool/FileWriteTool 重建 changedFiles

**验收标准**：
- [ ] 面板正确列出当前会话中 Claude 修改的所有文件
- [ ] 文件按轮次分组，每组有清晰的标题
- [ ] 每个文件行显示文件名、路径、工具类型
- [ ] 点击文件行展开/折叠 diff 视图
- [ ] 空状态显示引导提示「No file changes in this session yet.」

### 功能 3：Unified Diff 视图

**描述**：展开文件行后，显示该文件的 unified diff 内容。diff 通过新增的 `fs:gitDiff` IPC 从磁盘实时获取。

**交互逻辑**：
- 展开文件行 → 调用 `fs:gitDiff({ filePath })` → 返回 unified diff 文本
- diff 渲染：
  - 行号显示（旧行号 / 新行号双列）
  - 增加行：绿色背景（`#2ea04340`）+ 左侧 `+` 标记
  - 删除行：红色背景（`#f8514940`）+ 左侧 `-` 标记
  - 未变更行：正常背景，灰色文字
  - @@ hunk header：蓝色文字，独立行展示
- diff 区域使用等宽字体，支持横向滚动（长行不换行）
- diff 区域最大高度 400px，超出滚动

**边界条件**：
- 文件无 diff（已 commit 或 unstaged changes 被撤销）→ 显示「No changes (file matches HEAD)」
- 新建文件（untracked）→ diff 显示全部为增加行
- 二进制文件 → 显示「Binary file changed」
- `fs:gitDiff` 调用失败（非 git 仓库或文件不存在）→ 显示错误提示
- diff 内容超大（>1000 行）→ 截断到前 500 行 + 尾部提示「... N more lines (open in editor for full diff)」

**验收标准**：
- [ ] 点击文件展开后显示正确的 unified diff
- [ ] 增加行绿色背景，删除行红色背景
- [ ] 行号正确显示（旧/新行号）
- [ ] 长行横向滚动，不换行
- [ ] 新建文件显示为全增加
- [ ] 二进制文件显示提示而非乱码

### 功能 4：「View All Changes」全量 diff

**描述**：ChangesPanel 底部固定按钮「View All Changes」，点击后调用 `fs:gitDiff({})` 获取 `git diff HEAD` 全量输出，在面板中展开显示。

**交互逻辑**：
- 点击按钮 → 调用 `fs:gitDiff({})` → 返回全量 diff
- 全量 diff 显示在面板主内容区（替换文件列表视图）
- 顶部增加「Back to file list」返回按钮
- diff 渲染逻辑同功能 3
- 文件间分隔线 + 文件路径标题

**边界条件**：
- 无未提交变更 → 显示「Working tree clean. No uncommitted changes.」
- diff 超大（>3000 行）→ 截断 + 提示

**验收标准**：
- [ ] 「View All Changes」显示 git diff HEAD 全量输出
- [ ] 可通过「Back」按钮返回文件列表
- [ ] 无变更时显示 clean 提示

## 非功能需求

- **性能**：`fs:gitDiff` 单文件 diff 应在 200ms 内返回；全量 diff 最大等待 2s（超时截断）
- **安全**：`fs:gitDiff` / `fs:gitStatus` IPC 仅在 working directory 范围内执行，使用 safePath 校验
- **可访问性**：diff 区域支持键盘滚动；屏幕阅读器可读取增删标记
- **兼容性**：要求系统安装 git，未安装时 Tab 仍显示但 diff 功能不可用，显示提示

## 成功指标

- 用户在 AIPA 内即可完成代码变更审查，减少切换到终端/IDE 的次数
- 变更文件列表实时更新，每轮 Claude 修改后用户立即感知
- diff 渲染准确率 100%（与 `git diff` 命令行输出一致）

## 优先级

- **P0**：`fs:gitDiff` / `fs:gitStatus` IPC + ChangesPanel 文件列表
- **P0**：Unified diff 视图渲染
- **P1**：NavRail Changes Tab + 角标
- **P1**：按轮次分组 + View All Changes
- **P2**：diff 截断、二进制检测、大文件处理

## 涉及文件

| 文件路径 | 操作 | 说明 |
|---------|------|------|
| `src/main/ipc/fs-handlers.ts` | 修改 | 新增 `fs:gitDiff` / `fs:gitStatus` handler |
| `src/preload/index.ts` | 修改 | 暴露 `fsGitDiff` / `fsGitStatus` API |
| `src/renderer/components/sidebar/ChangesPanel.tsx` | 新建 | 变更文件列表 + diff 视图面板 |
| `src/renderer/components/sidebar/DiffViewer.tsx` | 新建 | Unified diff 渲染组件（纯前端） |
| `src/renderer/components/layout/NavRail.tsx` | 修改 | 新增 Changes Tab |
| `src/renderer/store/chatStore.ts` | 修改 | 新增 changedFiles 状态和 addChangedFile action |
| `src/renderer/hooks/useStreamJson.ts` | 修改 | 监听 FileEditTool/FileWriteTool toolUse 事件记录变更文件 |
| `i18n/locales/en.json` | 修改 | 新增 changes/diff 相关翻译键 |
| `i18n/locales/zh-CN.json` | 修改 | 新增 changes/diff 相关翻译键 |

## 后端需求

1. **`fs:gitDiff` IPC handler**（在 `fs-handlers.ts` 中）：
   - 参数：`{ filePath?: string; staged?: boolean }`
   - 逻辑：在 working directory 中执行 `git diff HEAD [filePath]`（如 staged=true 则 `git diff --cached`）
   - 返回：diff 文本字符串
   - 安全：filePath 需通过 safePath 校验；使用 `child_process.execSync` 执行，设置 timeout 5s
   - diff 输出最大 100KB，超出截断

2. **`fs:gitStatus` IPC handler**（在 `fs-handlers.ts` 中）：
   - 参数：无（使用当前 working directory）
   - 逻辑：执行 `git status --porcelain`
   - 返回：status 文本字符串（每行格式 `XY filename`）
   - 如 working directory 不是 git 仓库 → 返回 `{ error: 'not-git-repo' }`

## 冲突分析

| 冲突资源 | 冲突方 | 策略 |
|---------|--------|------|
| `src/main/ipc/fs-handlers.ts` | 无冲突 | 本 PRD 独占修改此文件 |
| `src/preload/index.ts` | PRD-1, PRD-2 | PRD-1 和 PRD-2 串行在前；本 PRD 可与其并行（添加不同的 API 方法） |
| `src/renderer/components/layout/NavRail.tsx` | 无冲突 | 本 PRD 独占修改此文件 |
| `src/renderer/store/chatStore.ts` | PRD-2 (hookEvents) | 不同字段，冲突风险低；建议由 leader 合并 |
| `src/renderer/hooks/useStreamJson.ts` | PRD-2 (hookEvent handler) | 不同 event case，冲突风险低 |
| `i18n/locales/*.json` | PRD-1, PRD-2 | **i18n 条目需由 leader 统一合并** |

**本 PRD 与 PRD-1、PRD-2 文件冲突极低，可并行执行。**

## 依赖与风险

| 依赖项 | 负责方 | 风险等级 |
|--------|--------|----------|
| 系统 git 可用 | 用户环境 | 低 — 目标用户是开发者，几乎都安装了 git |
| toolUse 事件中的 toolName 格式 | CLI | 低 — FileEditTool/FileWriteTool 名称已稳定 |
| chatStore changedFiles 与标签页（prd-conversation-tabs）交互 | 工程 | 中 — 如果 tabs PRD 先完成，changedFiles 需要 per-tab 隔离 |

## 开放问题

- [ ] diff 渲染是否引入第三方库（如 react-diff-viewer）？建议手写轻量组件，避免额外依赖增加 bundle size
- [ ] changedFiles 是否需要持久化到 session metadata？建议 v1 不持久化，仅从 toolUse 事件重建
- [ ] 是���需要支持 `git diff --staged`（仅暂存区变更）？建议 v1 仅支持 `git diff HEAD`，v2 扩展

## 执行顺序建议

1. **P0 - fs:gitDiff + fs:gitStatus IPC**（后端基础）
2. **P0 - DiffViewer 组件**（纯前端 diff 渲染）
3. **P0 - ChangesPanel 文件列表**（含 chatStore changedFiles 状态）
4. **P1 - NavRail Changes Tab + 角标**
5. **P1 - View All Changes + 按轮次分组**
6. **P2 - 大文件截断、二进制检测**
