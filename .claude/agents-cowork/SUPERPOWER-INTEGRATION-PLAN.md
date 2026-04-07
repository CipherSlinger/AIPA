# AIPA Superpower Plan — CLI 功能全量集成路线图

**制定日期**：2026-04-07
**负责人**：agent-leader
**目标**：将 Claude Code CLI 中所有尚未集成到 AIPA 的功能，按优先级分批实现，最终让 AIPA 成为 Claude Code CLI 完整的图形驾驶舱。

---

## 战略背景

Claude Code CLI 拥有大量 AIPA 尚未集成的能力。根据功能分析，按照「用户价值 × 实现难度」矩阵，将所有功能分为 6 个阶段交付：

```
高价值 + 低难度 → Phase 1（立即交付，1-3次迭代）
高价值 + 中难度 → Phase 2（核心功能，4-8次迭代）
高价值 + 高难度 → Phase 3（复杂系统，8-15次迭代）
中价值 + 低/中难度 → Phase 4（增强体验，按需排期）
低价值 / 高难度 → Phase 5（探索性，远期规划）
基础设施改造 → Phase 0（各 Phase 的前置依赖）
```

---

## Phase 0 — 基础设施（前置依赖，穿插执行）

这些改造是后续所有功能的基础，需要先于或随 Phase 1 同步完成。

### P0-1：stream-bridge 事件扩展
**现状**：stream-bridge 仅处理 assistant/tool_use/result/permissionRequest 等基础事件。
**目标**：扩展 handleStreamEvent，支持以下新事件类型：
- `system_prompt` — 系统提示词变更通知
- `hook_event` — Hook 执行事件（为 Phase 2 Hooks UI 做准备）
- `compact_result` — 压缩完成事件（携带 token 节省数据）
- `context_usage` — 上下文 token 使用量实时更新
- `plan_mode_change` — Plan Mode 状态变更

**涉及文件**：`src/main/pty/stream-bridge.ts`、`src/preload/index.ts`、`src/main/ipc/index.ts`

### P0-2：CLI 启动参数统一管理
**现状**：`stream-bridge.ts` 和 `pty-manager.ts` 各自硬编码 CLI 参数。
**目标**：抽取 `src/main/pty/cliArgs.ts`，统一管理所有 CLI 启动参数，支持运行时注入：
- `--effort [low|medium|high|max]`
- `--max-turns N`
- `--system-prompt / --append-system-prompt`
- `--allowedTools / --disallowedTools`
- `--verbose`

**涉及文件**：`src/main/pty/stream-bridge.ts`、`src/main/pty/pty-manager.ts`（新建 `cliArgs.ts`）

### P0-3：settings.json 读写 IPC
**现状**：`config:read/write` 读写 Electron Store，但 CLI 的 `~/.claude/settings.json`（Hooks、Permissions 等）是独立文件。
**目标**：新增 `config:readCLISettings` / `config:writeCLISettings` IPC，读写 `~/.claude/settings.json`，为 Hooks/Permissions UI 提供数据层。

**涉及文件**：`src/main/ipc/index.ts`、`src/preload/index.ts`（新建 `src/main/config/cli-settings-manager.ts`）

---

## Phase 1 — 高价值 × 低难度（立即交付）

预计 3-4 个迭代完成。

### Phase 1.1：Effort 控制

**PRD 文件**：`todo/prd-effort-control-v1.md`

**功能**：
1. 聊天输入栏右侧增加 Effort 选择器（Low / Medium / High / Max），默认 auto
2. 每次发送消息时将 `--effort` 参数注入 CLI
3. 设置页增加默认 Effort 选项
4. StatusBar 显示当前 Effort 等级

**技术路径**：
- 扩展 `StreamBridgeArgs` 增加 `effort?: string`
- `stream-bridge.ts` 将 effort 注入 `--effort` 参数
- `prefsStore` 新增 `defaultEffort` 字段
- UI：`ChatInput.tsx` 新增 EffortPicker，`StatusBar.tsx` 显示当前值

**验收标准**：
- [ ] 用户可在发送消息前选择 Effort 等级
- [ ] 选择后通过 CLI `--effort` 参数生效
- [ ] StatusBar 实时显示当前 effort

---

### Phase 1.2：Token 上下文可视化

**PRD 文件**：`todo/prd-context-usage-v1.md`

**功能**：
1. StatusBar 右侧显示 token 使用进度条（已用/总量）
2. 点击进度条展开上下文占用详情（系统提示/对话/工具结果分占比例）
3. 颜色预警：>70% 黄色，>90% 红色
4. 颜色网格可视化弹窗（参考 `/context` 命令的彩色网格实现）

**技术路径**：
- 解析 CLI result 事件中的 `usage` 字段（input_tokens / output_tokens）
- stream-bridge 新增 `contextUsage` 事件
- `useChatStore` 新增 `tokenUsage` 状态
- StatusBar 新增 ContextBar 组件

**验收标准**：
- [ ] 每次 AI 回复后 token 用量更新
- [ ] 进度条颜色随用量变化
- [ ] 点击展开详细占用分析

---

### Phase 1.3：/export 会话导出

**PRD 文件**：`todo/prd-session-export-v1.md`

**功能**：
1. 聊天区顶部工具栏增加「导出」按钮
2. 支持导出格式：Markdown、纯文本、JSON
3. 可选导出到剪贴板或文件
4. 导出内容包含完整对话（含工具调用详情可选）

**技术路径**：
- `fs:writeFile` IPC 已存在，直接使用
- 新建 `src/renderer/utils/sessionExporter.ts`
- 导出格式转换逻辑（message list → Markdown/Text/JSON）

**验收标准**：
- [ ] 支持三种格式导出
- [ ] 导出到文件弹出保存对话框
- [ ] 导出到剪贴板后 toast 提示

---

### Phase 1.4：/model 聊天内切换

**PRD 文件**：合并到 Phase 1.1

**功能**：聊天输入栏现有 model picker 已在 StatusBar 实现；补充支持在输入框直接输入 `/model claude-opus-4-6` 切换，无需打开设置。

---

## Phase 2 — 高价值 × 中难度（核心功能）

预计 8-12 个迭代完成。

### Phase 2.1：/compact 上下文压缩

**PRD 文件**：`todo/prd-compact-v1.md`

**功能**：
1. 聊天区顶部工具栏「压缩」按钮（带 Token 节省预估）
2. 点击后向 CLI 发送 `/compact` 命令（通过 PTY write 或 stream-json）
3. 压缩进行中显示 loading，完成后 toast 显示节省的 token 数
4. 支持自定义压缩指令（高级选项）
5. 自动压缩提示：token 用量 >85% 时 StatusBar 提示用户压缩

**技术路径**：
- 通过 PTY 发送 `/compact` 指令（PTY 模式）
- 或通过 stream-bridge 内置发送控制消息（stream-json 模式）
- 监听 compact_result 事件更新 UI

**验收标准**：
- [ ] 一键触发上下文压缩
- [ ] 显示压缩前后 token 对比
- [ ] >85% 自动提示

---

### Phase 2.2：Plan Mode

**PRD 文件**：`todo/prd-plan-mode-v1.md`

**功能**：
1. ChatInput 工具栏增加「Plan Mode」开关（切换时 CLI 启动参数改变 or 发送 `/plan`）
2. Plan Mode 激活时输入框边框变色（紫色/蓝色）+ 标识文字
3. Plan Mode 下 AI 仅输出计划，不执行任何工具调用
4. StatusBar 显示当前 Plan Mode 状态
5. 退出 Plan Mode 时确认对话框

**技术路径**：
- CLI 通过 `EnterPlanModeTool` / `ExitPlanModeTool` 工具进入/退出
- stream-bridge 监听 `plan_mode_change` 事件
- `useChatStore` 新增 `isPlanMode` 状态

**验收标准**：
- [ ] 一键切换 Plan Mode
- [ ] Plan Mode 有明显视觉指示
- [ ] Plan Mode 下 Claude 不执行工具调用

---

### Phase 2.3：权限规则管理 UI

**PRD 文件**：`todo/prd-permissions-ui-v1.md`

**功能**：
1. 设置页新增「权限规则」Tab
2. 展示当前 `~/.claude/settings.json` 中的 `permissions.allow` / `permissions.deny` 列表
3. 支持添加规则（如 `Bash(git *)`, `Read(**/*.ts)`）
4. 支持删除规则
5. 权限弹窗新增「始终允许此工具」快捷操作（自动写入 allow 规则）
6. 权限弹窗新增「始终拒绝此工具」快捷操作

**技术路径**：
- `config:readCLISettings` / `config:writeCLISettings`（Phase 0-3）
- 规则格式解析（`permissionRuleParser.ts` 已在 CLI 中实现，参考其格式）
- 新建 `PermissionsSettingsPanel.tsx`

**验收标准**：
- [ ] 规则列表正确展示和持久化
- [ ] 添加/删除规则即时生效
- [ ] 权限弹窗有「始终允许/拒绝」快捷操作

---

### Phase 2.4：Hooks 配置 UI

**PRD 文件**：`todo/prd-hooks-ui-v1.md`

**功能**：
1. 设置页新增「Hooks」Tab
2. 按事件类型展示现有 Hook 配置（PreToolUse/PostToolUse/Stop 等 14 种事件）
3. 支持添加 Hook：选择事件 → 选择类型（command/prompt/http）→ 填写参数
4. 支持删除/禁用 Hook
5. 聊天中显示 Hook 执行进度（`cli:hookEvent` 事件）

**技术路径**：
- `config:readCLISettings` / `config:writeCLISettings`（Phase 0-3）
- stream-bridge 扩展 `hook_event` 处理
- 新建 `HooksSettingsPanel.tsx`、`HookProgressBubble.tsx`

**验收标准**：
- [ ] 可视化添加/删除 Hook
- [ ] Hook 执行时在聊天中显示进度
- [ ] 配置写入 settings.json 后立即生效

---

### Phase 2.5：MCP 服务器完整管理

**PRD 文件**：`todo/prd-mcp-manager-v1.md`

**功能**：
1. MCP 设置页升级：现有仅有 enable/disable，增加「添加」「删除」「重连」
2. 添加向导：选择类型（stdio/http/sse）→ 填写参数 → 测试连接
3. MCP 工具列表：展示每个 MCP server 提供的工具（参考 `MCPToolListView`）
4. MCP 资源浏览器：展示 MCP 资源列表和内容
5. MCP OAuth 授权流程（弹出浏览器授权）

**技术路径**：
- 新增 `mcp:add` / `mcp:remove` / `mcp:reconnect` IPC
- MCP 配置读写（`~/.claude/settings.json` 的 `mcpServers` 节点）
- 新建 `MCPManagerPanel.tsx`、`MCPAddWizard.tsx`

**验收标准**：
- [ ] 可通过 UI 添加/删除 MCP 服务器
- [ ] 显示每个服务器的工具列表
- [ ] OAuth 授权弹窗正常工作

---

### Phase 2.6：/diff 代码变更视图

**PRD 文件**：`todo/prd-diff-view-v1.md`

**功能**：
1. 侧边栏新增「Changes」Tab（文件变更图标）
2. 显示当前会话中 Claude 修改过的文件列表
3. 点击文件展开 diff 视图（统一 diff 格式）
4. 支持按「会话轮次」过滤变更
5. 一键 git diff 查看所有未提交变更

**技术路径**：
- 监听 `toolUse(FileEditTool/FileWriteTool)` 事件，记录修改文件
- 新增 `fs:gitDiff` IPC（调用 `git diff` 命令）
- 引入轻量 diff 渲染库（react-diff-viewer 或手写）
- 新建 `ChangesPanel.tsx`

**验收标准**：
- [ ] 实时追踪 Claude 修改的文件
- [ ] diff 视图正确高亮增删行
- [ ] 支持 git diff 查看未提交变更

---

## Phase 3 — 高价值 × 高难度（复杂系统）

预计 15-25 个迭代完成。

### Phase 3.1：会话 Branch（Fork）

**PRD 文件**：`todo/prd-session-branch-v1.md`

**功能**：
1. 每条消息气泡右键菜单增加「从此处分叉」
2. 分叉创建新会话，内容从选定消息点截断
3. 分叉会话在侧边栏显示父会话关系（树形缩进或图标标注）
4. 支持给分叉会话命名

**技术路径**：
- `session:fork` IPC 已存在，重用
- 需要解决分叉点消息截断的 JSONL 写入逻辑
- SessionList 树形展示（父子关系存入 session metadata）

---

### Phase 3.2：多 Agent 任务系统

**PRD 文件**：`todo/prd-agent-tasks-v1.md`

**功能**：
1. 侧边栏新增「Tasks」Panel，展示 Claude 创建的任务列表（TaskCreate/TaskUpdate 工具输出）
2. 实时更新任务状态（pending → in_progress → completed）
3. Agent 工具调用卡片（AgentTool）显示子 Agent 详情和进度
4. 支持停止特定子 Agent（TaskStop）

**技术路径**：
- 解析 `toolUse(TaskCreateTool/TaskUpdateTool)` 事件
- 新建 `AgentTasksPanel.tsx`
- AgentTool toolUse 卡片展开子 Agent 执行流

---

### Phase 3.3：Git Worktree 隔离

**PRD 文件**：`todo/prd-worktree-v1.md`

**功能**：
1. 设置页增加「Worktree 模式」开关
2. 开启后，每次会话在独立 git worktree 中运行（安全隔离）
3. 会话结束后提示合并或丢弃变更
4. 显示当前 worktree 路径

**技术路径**：
- 监听 `EnterWorktreeTool` / `ExitWorktreeTool` 工具事件
- 新增 `fs:gitWorktreeCreate` / `fs:gitWorktreeMerge` IPC

---

### Phase 3.4：Insights 会话分析报告

**PRD 文件**：`todo/prd-insights-v1.md`

**功能**：
1. 设置页新增「Insights」入口
2. 分析历史 JSONL 会话文件，生成统计报告：
   - 总 token 消耗 / 成本估算
   - 最常用工具 Top 10
   - 会话时长分布
   - 高效/低效会话模式
3. 图表可视化（bar chart, timeline）

**技术路径**：
- 读取 `~/.claude/projects/` JSONL 文件
- 引入轻量图表库（recharts 或 chart.js）
- 新建 `InsightsPanel.tsx` + `session-analyzer.ts`

---

### Phase 3.5：Remote/Bridge 模式（远程控制）

**PRD 文件**：`todo/prd-remote-bridge-v1.md`

**功能**：
1. 设置页增加「Remote Access」开关
2. 开启后生成 QR 码，手机扫描后可远程查看/操作 AIPA 会话
3. 显示已连接的远程客户端列表
4. 支持手机端发消息到当前会话

**技术路径**：
- 研究 CLI 的 `bridge/bridgeMain.ts` 实现
- 需要 WebSocket 服务器在主进程中运行
- QR 码生成（qrcode 库）

---

## Phase 4 — 中价值功能（增强体验）

按需排期，每个功能 1-2 个迭代。

| # | 功能 | PRD | 优先级 |
|---|------|-----|--------|
| 4.1 | `/stats` 使用统计面板 | `prd-stats-panel-v1.md` | P1 |
| 4.2 | `/memory` 内存文件编辑器 | `prd-memory-editor-v1.md` | P1 |
| 4.3 | `--max-turns` 控制 | 合并到 Settings | P2 |
| 4.4 | `--system-prompt` 自定义 | `prd-system-prompt-v1.md` | P1 |
| 4.5 | `--allowedTools/--disallowedTools` | `prd-tool-filter-v1.md` | P2 |
| 4.6 | `/doctor` 环境诊断 | 合并到 Diagnostics | P2 |
| 4.7 | `/tag` 会话标签 | 合并到 SessionItem | P2 |
| 4.8 | 插件系统（Plugin install/list）| `prd-plugin-manager-v1.md` | P2 |
| 4.9 | NotebookEdit 专属渲染 | `prd-notebook-render-v1.md` | P2 |
| 4.10 | LSP 工具诊断结果展示 | `prd-lsp-display-v1.md` | P3 |

---

## Phase 5 — 远期探索

| # | 功能 | 说明 |
|---|------|------|
| 5.1 | Voice 模式 | 需要音频捕获 API，探索性 |
| 5.2 | Chrome 扩展集成 | `claudeInChrome` skill，需要浏览器插件配合 |
| 5.3 | ScheduleCronTool UI | Agent 定时任务调度面板 |
| 5.4 | RemoteTriggerTool UI | 远程 Agent 触发器管理 |
| 5.5 | UltraReview / SecurityReview | 代码安全审查专属工作流 |

---

## 执行策略

### 并行执行规则
- Phase 0（基础设施）与 Phase 1 并行启动
- Phase 2 中无文件冲突的 PRD 可并行（如 diff 视图 vs MCP 管理）
- Phase 3 必须串行（依赖 Phase 2 的基础能力）

### 文件冲突风险
以下文件在多个 PRD 中都会被修改，需要严格串行：
- `stream-bridge.ts` — P0-1 完成后冻结接口，其他 Phase 只添加不修改
- `preload/index.ts` — 每个新 IPC 都要改，建议模块化拆分
- `src/main/ipc/index.ts` — 同上
- `i18n/locales/*.json` — 每个 PRD 都要改，由 leader 统一合并

### 技术债控制
- 每 5 个迭代做一次组件分解 retro（维持单文件 <400行）
- 引入新依赖前评估 bundle size 影响
- 不引入 CSS-in-JS 之外的样式方案

---

## 执行顺序（当前已有 todo）

**当前 todo 中已有**：
1. `prd-actionable-codeblocks-v1.md`（已完成，待清理）
2. `prd-conversation-tabs-v1.md`（待执行）

**下一批执行顺序**：
1. `prd-conversation-tabs-v1.md`（高价值，已有 PRD）
2. Phase 0 基础设施（P0-1 stream-bridge 扩展 + P0-2 CLI 参数统一）
3. Phase 1.1 Effort 控制
4. Phase 1.2 Token 上下文可视化
5. Phase 2.1 Compact
6. Phase 2.2 Plan Mode
7. Phase 2.3 权限规则管理
8. Phase 2.4 Hooks UI
9. Phase 2.5 MCP 完整管理
10. Phase 2.6 Diff 视图
11. Phase 1.3 导出功能
12. Phase 3.x 复杂系统（按顺序）
13. Phase 4.x 增强体��（按优先级）

---

## 成功标准

完成所有 Phase 后，AIPA 应满足：

- CLI 的每一个用户可见功能，都有对应的 GUI 操作入口
- 无需用户打开终端，仅通过 AIPA 界面即可完成 Claude Code 的所有操作
- GUI 操作与 CLI 操作的结果完全一致（通过 IPC 调用 CLI，不重新实现逻辑）
- 功能覆盖率：CLI 功能 100% 可访问，80%+ 有专属优化 UI

---

_计划状态：ACTIVE | 下次更新：每 10 个迭代后由 agent-leader 修订_
