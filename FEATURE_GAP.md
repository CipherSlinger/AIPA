# AIPA x Claude Code CLI — 功能差距文档

> 更新日期：2026-04-19（Iteration 678）
> CLI 版本：claude-code 2.1.81（BUILD_TIME: 2026-03-20T21:25:42Z）
> 分析目的：指导 AIPA UI 逐步对齐 CLI 全部能力

---

## 一、工具系统（Tools）

### CLI 支持的工具

| 工具名 | 功能描述 | AIPA 是否有 UI |
|--------|----------|----------------|
| `Bash` | 执行 shell 命令，支持沙箱、权限检查 | ✅ PTY 终端可执行，但无结构化工具 UI |
| `FileRead` | 读取文件，支持行范围限制 | ✅ `FileReadCard`：文件路径展示（目录淡色+文件名高亮）、行范围徽标（offset/limit）、代码块预览（前20行可展开）、复制按钮、读取中状态（Iteration 637） |
| `FileEdit` | 精确字符串替换编辑文件 | ✅ `FileEditCard`：橙色主题（左边框/图标/徽标）、Before/After 双面板 diff 展示（各前10行可展开）、replace_all 徽标、"Edit applied" 确认徽标，兼容 `old_string`/`old_str` 字段变体（Iteration 643） |
| `FileWrite` | 创建/覆盖文件 | ✅ `FileWriteCard`：绿色主题、文件路径展示（目录淡色+文件名高亮）、内容预览（前20行可展开）、复制按钮、"File written" 确认徽标（Iteration 639） |
| `Glob` | 文件模式匹配搜索 | ✅ 结构化展示：文件路径列表，目录部分淡色，文件名加粗，超过10条折叠（Iteration 540） |
| `Grep` | 正则内容搜索（ripgrep 封装） | ✅ 结构化展示：file:line:content 格式，可折叠展开（Iteration 540） |
| `WebFetch` | 抓取 URL 内容并 AI 处理 | ✅ URL chip 可点击，内容前200字符预览，可展开全文（Iteration 540） |
| `WebSearch` | 网络搜索 | ✅ URL chip 可点击（标注 Sources），内容前200字符预览，可展开全文（Iteration 540） |
| `NotebookEdit` | 编辑 Jupyter notebook 单元格 | ✅ `NotebookEditCard`：文件名 header、单元格类型色标（code=蓝/markdown=紫）、可展开源代码预览、结果徽标（Iteration 559） |
| `TodoWrite` | 写待办列表（结构化任务管理） | ✅ `TodoListView.tsx` 组件已实现，pending/in_progress/completed 状态，high/medium/low 优先级色标 |
| `Agent` (子代理) | 产生并行/串行子代理 | ✅ `AgentToolCard`：indigo 左边框、subagent_type 徽标、前台/后台徽标（Foreground/Background chip）、Worktree 隔离徽标、description 展示、prompt 预览（可展开）、result 预览（可展开）（Iteration 638） |
| `TaskOutputTool` | 读取后台任务输出 | ⚠️ 有 TaskDashboard 组件但连接不完整 |
| `TaskStopTool` | 停止后台任务 | ✅ `TaskStopBadge`：red/inline 徽标，接入 ToolUseBlock（Iteration 678） |
| `TaskCreate/Get/Update/List` | 异步任务 CRUD（isTodoV2Enabled） | ✅ TaskCreate/TaskUpdate 渲染内联 badge；TaskList/TaskGet 结果渲染 TaskDashboardCard（Kanban/列表视图，含状态徽章、owner、blocked-by，Iteration 546） |
| `EnterPlanMode` / `ExitPlanMode` | 进入/退出计划模式 | ✅ 有 PlanModeBanner（含批准/拒绝按钮，Iteration 541）；PlanCard 深度控制已实现 |
| `EnterWorktree` / `ExitWorktree` | Git worktree 沙箱隔离 | ⚠️ 有 WorktreeDialog 但为独立 CRUD，未与会话绑定 |
| `SkillTool` | 加载和调用 skills 片段 | ✅ `SkillToolCard`：green 主题、Zap 图标、skill name/args 展示、Skill executed 徽标、输出预览（Iteration 678） |
| `AskUserQuestion` | 代理主动询问用户 | ✅ 有专用 `AskUserQuestionCard`：展示问题文本、可点击选项按钮、自由文本输入框，通过 `aipa:sendMessage` 事件回复 CLI（Iteration 541） |
| `LSPTool` | LSP 语言服务（ENABLE_LSP_TOOL） | ❌ 无 LSP 集成 |
| `ListMcpResources` / `ReadMcpResource` | 读取 MCP 服务器资源 | ⚠️ 有结果卡片（ListMcpResources→URI chips，ReadMcpResource→内容预览+复制）；输入展示用通用 JSON（Iteration 555） |
| `ToolSearchTool` | 延迟工具搜索 | ✅ `ToolSearchToolCard`：cyan 主题、查询文本、工具 chip 网格（超12个折叠）、N tools found 徽标（Iteration 678） |
| `BriefTool` | 读取 /brief 简报 | ✅ `BriefToolCard`：slate 主题、路径展示、结果前300字符预览（可展开）、复制按钮、"Brief loaded" 确认徽标（Iteration 672） |
| `SendMessageTool` | 跨代理消息传递 | ✅ `SendMessageCard`：indigo 左边框、to/message 字段、Delivered/Failed 状态徽标（Iteration 567） |
| `TeamCreate/Delete` | 多代理团队管理（AGENT_SWARMS） | ✅ `TeamCreateCard`：rose 主题、team name、members chip 列表、team_id、Team created 徽标、结果可折叠预览（Iteration 678） |
| `SleepTool` | 代理主动等待（PROACTIVE/KAIROS） | ✅ `SleepToolCard`：紫色主题、Moon 图标、duration 格式化、reason 字段、"Woke up"/"Sleeping..." 状态徽标（Iteration 673） |
| `ScheduleCronTool` / `CronCreate/Delete/List` | 定时任务（AGENT_TRIGGERS） | ✅ `CronCard`：cron 表达式 chip、prompt 预览、recurring/one-shot 徽标、job ID；`CronList` 结果显示任务行列表（Iteration 565） |
| `RemoteTriggerTool` | 远程触发代理（AGENT_TRIGGERS_REMOTE） | ✅ `RemoteTriggerCard`：action chip（list/get/create/update/run 色标）、trigger_id、prompt 预览、action 感知结果展示（Iteration 566） |
| `PowerShellTool` | Windows PowerShell 支持 | ✅ 通过 Bash 工具 BASH_TOOLS 路由渲染 PowerShell 卡片（Iteration 564） |
| `REPLTool` | 安全 REPL VM 环境（ant-only） | ❌ |
| `WebBrowserTool` | 浏览器操作（WEB_BROWSER_TOOL） | ✅ `WebBrowserInputCard`（action badge/URL/selector/text）+ `WebBrowserResultCard`（截图缩略图或文本预览）（Iteration 564） |
| `ConfigTool` | 读写配置（ant-only） | ❌ |
| MCP 工具（动态） | 来自外部 MCP 服务器的工具 | ⚠️ 能列出 MCP 服务器，无动态工具 UI 渲染 |

### 差距 & 优先级

**最高优先：** ✅ **P0-3 已实现** — `FileDiffView.tsx` 通过 LCS 算法渲染 FileEdit/FileWrite 的文件内容差异预览，`ToolUseBlock` 已接入，用户批准前可查看变更内容。

**P2-7 已实现：** ✅ **TodoWrite + Glob/Grep + WebSearch/WebFetch 结构化展示** — `TodoListView.tsx` 组件展示结构化待办列表（pending/in_progress/completed，high/medium/low 优先级）；Glob 工具结果以目录淡色+文件名加粗的路径列表展示；Grep 工具结果以 `file:line:content` 格式展示；WebSearch/WebFetch 结果提取 URL 渲染为可点击 chip，内容截取 200 字符预览可展开（Iteration 540）。

**中优先：** Agent 子代理需要嵌套展示（当前只显示 toolUse 名称）。

**新发现（2026-04-13）：**
- ✅ `StructuredOutput` 工具：`StructuredOutputCard.tsx` 新增，渲染 JSON Schema 折叠预览 + 语法着色结果树 + 复制按钮；`ToolUseBlock` 已接入（Iteration 617）
- ✅ `DreamTask`（`dream` 类型后台任务）：`DreamTaskCard.tsx` 已存在，`ChatPanel` 已接入渲染（Iteration 617）
- ✅ `plan_approval_request/response`：`PlanApprovalCard.tsx` 已存在，`useStreamJson` 订阅 `onPlanApprovalRequest`，`ChatPanel` 渲染并接入 `cliRespondPlanApproval`（Iteration 617）
- ✅ `FileRead` 工具：`FileReadCard.tsx` 新增，渲染文件路径（目录淡色+文件名高亮）、行范围徽标（offset/limit 字段）、代码块预览（前20行，可展开）、复制按钮（Iteration 637）
- ✅ `Agent` 工具：`AgentToolCard.tsx` 增强，新增 indigo 左边框、subagent_type 徽标、前台/后台 badge、worktree 隔离 badge、prompt 可展开预览、result 可展开预览（Iteration 638）
- ✅ `FileWrite` 工具：`FileWriteCard.tsx` 新增，绿色主题，内容预览（前20行，可展开），"File written" 确认徽标，复制按钮（Iteration 639）
- ✅ `FileEdit` 工具：`FileEditCard.tsx` 新增，橙色主题，Before（红色调）/After（绿色调）双面板 diff 展示（各前10行可展开），replace_all 徽标，"Edit applied" 确认徽标，兼容多种字段名（old_string/old_str/new_string/new_str）（Iteration 643）

---

## 二、会话管理（Session）

### CLI 能力

- 所有会话以 **JSONL 格式** 保存在 `~/.claude/projects/<project-hash>/` 下
- 支持 `--resume <session_id>` 继续任意历史会话
- 支持 `--resume` 无参数继续最近会话
- `result` 事件携带 `session_id`（真实 Claude session ID），用于下次 `--resume`
- `/clear` 命令清除当前会话历史
- `/compact [instructions]` 压缩会话上下文（多种压缩策略：session memory compact、传统 compact、reactive compact）
- `/rewind <n>` 回溯到第 n 条消息（支持"rewind"操作）
- `/fork` 派生会话分支
- `/export` 导出会话为 Markdown
- 会话有 `cleanupPeriodDays` 配置（默认30天自动清理）
- `session_id` 有两层：bridgeId（单次连接内部 ID）和 claudeSessionId（`result` 事件返回，跨次 `--resume`）

### AIPA 当前实现

- ✅ `session:list` — 列出 `~/.claude/projects/` 下所有 JSONL 会话
- ✅ `session:load` — 加载历史会话消息
- ✅ `session:delete` — 删除会话
- ✅ `session:fork` — 按消息索引派生分支（`forkSession`）
- ✅ `session:rename` — 重命名会话（写入 JSONL 文件头部元数据）
- ✅ `session:rewind` — 回溯（删除指定时间戳后的消息）
- ✅ `session:search` — 全文搜索会话
- ✅ `session:generateTitle` — AI 生成会话标题
- ✅ `session:getStats` — 获取会话统计（消息数、token 用量等）
- ✅ `resumeLastSession` 偏好项 — 重启时自动恢复
- ✅ `cli:generateAwaySummary` — 生成"离开摘要"
- ✅ `/compact` — ✅ **P0-4 已实现** — `TokenUsageBar` 在 75%/90% token 使用率时显示 COMPACT 按钮，点击后向 CLI stdin 发送 `/compact` 命令
- ✅ `cleanupPeriodDays` UI 设置入口 — SettingsGeneral 数字输入，读写 ~/.claude/settings.json（Iteration 642）
- ✅ 会话本地导出（Iteration 541）：`useConversationExport.ts` 已完整实现 — 支持 Markdown/HTML/JSON 三种格式，包含工具输入/输出（`<details>` 折叠块），ChatHeader 下载按钮已接入 `exportConversation`

### 差距 & 优先级

P0：会话压缩（`/compact`）✅ **已实现** — `TokenUsageBar` 75%/90% 触发 COMPACT 按钮，发送 `/compact` 到 CLI stdin，并处理 `PreCompact`/`PostCompact` hook 事件。

---

## 三、权限系统（Permissions）

### CLI 能力

CLI 定义了 5 种权限模式（`ExternalPermissionMode`）：

| 模式 | 描述 |
|------|------|
| `default` | 默认：危险操作需确认 |
| `acceptEdits` | 自动接受文件编辑，命令仍需确认 |
| `bypassPermissions` | 绕过所有权限（危险，需 bypassPermissionsMode 可用） |
| `dontAsk` | 不询问，自动允许 |
| `plan` | 计划模式，只分析不执行 |
| `auto` | 自动模式（依赖 TRANSCRIPT_CLASSIFIER feature gate） |

权限规则体系（`settings.json` 的 `permissions` 字段）：
- `allow` — 白名单规则（如 `Bash(git *)` 允许所有 git 命令）
- `deny` — 黑名单规则
- `ask` — 总是询问的规则
- `additionalDirectories` — 额外工作目录

权限决策流程：`validateInput` → `checkPermissions` → `canUseTool` → `PreToolUse` hook → UI 弹窗（仅 interactive 模式）

**control_request 协议**：CLI 通过 `--permission-prompt-tool stdio` 将权限请求序列化为 JSON 通过 stdout 发出 `control_request` 事件，AIPA 通过 stdin 回写 `control_response`。

### AIPA 当前实现

- ✅ `control_request.can_use_tool` — 收到权限请求，通过 `permissionRequest` IPC 发送到渲染器
- ✅ `PermissionCard.tsx` — 显示权限请求卡片，用户可允许/拒绝
- ✅ `cli:respondPermission` — 回写 `control_response` 给 CLI
- ✅ `--dangerously-skip-permissions` 标志 — 通过 `skipPermissions` 偏好控制
- ⚠️ 偏好中有 `skipPermissions: true` 默认值 — 实际默认绕过了所有权限（相当于 `bypassPermissions`）
- ✅ allow/deny/ask 规则列表编辑器已实现 — 标签式 UI + 行内输入 + 冲突检测（Iteration 665）
- ✅ 权限模式选择器已实现（default/acceptEdits/autoEdit/plan）（Iteration 665）
- ✅ additionalDirectories UI 管理已实现 — 文件夹选择器 + 手动路径输入 + 列表管理（Iteration 666）
- ✅ 权限决策历史已展示 — PermissionsSettingsPanel 新增 SessionPermissionHistory 子组件，从 useChatStore.messages 筛选 role==='permission' 条目，展示最近20条工具权限决策（工具名、decision 状态、时间戳）（Iteration 645）

### 差距 & 优先级

✅ **P0 已实现**：`PermissionsSettingsPanel.tsx` 提供 5 级权限模式选择器（default/acceptEdits/bypassPermissions/dontAsk/plan），通过 `--permission-mode` 参数正确传递给 CLI。allow/deny 规则列表编辑器已实现（标签式 UI + 行内输入 + 冲突检测），写入 `~/.claude/settings.json`。

---

## 四、配置系统（Config）

### CLI 支持的核心配置键（`settings.json`）

| 配置键 | 类型 | 描述 | AIPA 是否有 UI |
|--------|------|------|----------------|
| `model` | string | 覆盖默认模型 | ✅（ModelPicker + prefsStore.model） |
| `permissions.defaultMode` | enum | 默认权限模式 | ✅（PermissionsSettingsPanel，Iteration 665） |
| `permissions.allow` | array | 允许规则 | ✅（PermissionsSettingsPanel allow/deny/ask 规则列表，Iteration 665） |
| `permissions.deny` | array | 拒绝规则 | ✅（同上） |
| `permissions.ask` | array | 总是询问规则 | ✅（同上） |
| `permissions.additionalDirectories` | array | 额外工作目录 | ✅（AdditionalDirectoriesSection，Iteration 666） |
| `env` | Record | 会话环境变量 | ✅（SettingsAdvanced 键值对编辑器，读写 ~/.claude/settings.json） |
| `hooks` | HooksSettings | 钩子配置 | ⚠️ 能读写 CLI settings.json，无可视化 hooks 编辑器 |
| `mcpServers` | Record | MCP 服务器配置 | ✅（mcp:add/remove/list）|
| `cleanupPeriodDays` | number | 会话保留天数 | ✅（SettingsGeneral 数字输入，读写 ~/.claude/settings.json） |
| `language` | string | 响应语言偏好 | ✅（SettingsGeneral AI 回复语言下拉，读写 ~/.claude/settings.json） |
| `attribution.commit/pr` | string | commit/PR 署名 | ✅（SettingsGeneral Git Workflow 区块，文本输入，Iteration 669） |
| `includeCoAuthoredBy` | boolean | 是否包含 Co-authored-by | ✅（同上，布尔开关，Iteration 669） |
| `includeGitInstructions` | boolean | 是否包含 git workflow 指令 | ✅（同上，布尔开关，Iteration 669） |
| `availableModels` | array | 企业模型白名单 | ❌ |
| `worktree.symlinkDirectories` | array | worktree 符号链接目录 | ❌ |
| `worktree.sparsePaths` | array | sparse checkout 路径 | ❌ |
| `disableAllHooks` | boolean | 禁用所有 hooks | ✅ — HooksSettingsPanel 顶部红色开关，写入 ~/.claude/settings.json，开启时规则列表置灰并显示橙色警告 banner（Iteration 648） |
| `defaultShell` | enum | bash/powershell | ✅ — Settings → General，bash/powershell 下拉选择器，读写 ~/.claude/settings.json（Iteration 648） |
| `outputStyle` | string | 输出样式控制 | ✅ — Settings → AI Engine 标签页，auto/text/json 下拉选择器，读写 ~/.claude/settings.json（Iteration 656） |
| `statusLine` | object | 自定义状态栏命令 | ✅ — Settings → General，statusLine.command 文本输入，读写 ~/.claude/settings.json（Iteration 675） |
| `enabledPlugins` | Record | 启用插件列表 | ⚠️ 有 plugin:list/setEnabled IPC |
| `apiKeyHelper` | string | 自定义 API key 脚本 | ✅ — Settings → AI Engine，脚本路径文本输入，读写 ~/.claude/settings.json（Iteration 674） |
| `fileSuggestion` | object | @ 提及文件建议命令 | ✅ — Settings → General，fileSuggestion.command 文本输入，读写 ~/.claude/settings.json（Iteration 675） |
| `respectGitignore` | boolean | 文件选择器是否遵守 .gitignore | ✅ — Settings → General，布尔开关（默认 true），读写 ~/.claude/settings.json（Iteration 648） |

### AIPA 当前自有偏好（electron-store，非 CLI settings.json）

AIPA 有独立的 `ClaudePrefs` 存储（electron-store），与 CLI settings.json 分离：

| 偏好键 | 描述 |
|--------|------|
| `apiKey` | Anthropic API Key |
| `model` | 默认模型 |
| `workingDir` | 工作目录 |
| `skipPermissions` | 跳过权限确认 |
| `verbose` | 详细日志模式 |
| `thinkingLevel` | 思考深度（off/auto/high） |
| `systemPrompt` / `appendSystemPrompt` | 自定义系统提示 |
| `maxTurns` / `maxBudgetUsd` | 最大轮次/预算 |
| `effortLevel` | 努力等级 |
| `disallowedTools` | 禁用工具列表 |
| `quickReplies` | 快捷回复模板 |
| `compactMode` | 紧凑显示模式 |
| `preventSleep` | 防止系统休眠 |

AIPA 还实现了 `config:readCLISettings` / `config:writeCLISettings` IPC，可直接读写 `~/.claude/settings.json`，但 UI 层仅在 Settings 面板部分字段可视化。

### 差距 & 优先级

✅ P0：permissions.defaultMode/allow/deny/ask/additionalDirectories 均已实现 UI（Iterations 665-666）。
P1：`env` 环境变量编辑器 ✅ 已实现（Iteration 539）。
P1：`hooks` 钩子配置 UI（列表编辑器，各 hook 事件支持 command/http/prompt/agent 类型）。
P2：`attribution`、`language` ✅ 已实现、`cleanupPeriodDays` ✅ 已实现 等次要配置字段的 UI 暴露。

---

## 五、流式输出事件（Streaming Events）

### CLI 发出的事件类型

| 事件类型 | 数据结构要点 | AIPA 是否处理 |
|----------|-------------|---------------|
| `system`（init）| `tools[]`, `mcp_servers[]`, `model`, `permissionMode`, `session_id`, `skills[]`, `plugins[]` | ⚠️ 接收但未完整消费（`tools[]` 未渲染到 UI） |
| `assistant` | `message.content[]` (text/tool_use/thinking blocks) | ✅ 处理 text 和 tool_use |
| `user` | `message.content[]` (tool_result blocks) | ✅ 处理 tool_result |
| `result`（success）| `session_id`, `total_cost_usd`, `duration_ms`, `num_turns`, `usage`, `modelUsage`, `permission_denials` | ✅ 完整消费：session_id、cost、usage、modelUsage、permission_denials（toast 提醒）、numTurns、durationMs 全部存入 store（Iteration 539） |
| `result`（error） | `subtype`（error_max_turns/error_max_budget_usd 等）, `errors[]` | ✅ 触发 `cli:error` |
| `control_request.can_use_tool` | `tool_name`, `input`, `tool_use_id`, `request_id`, `title`, `description`, `permission_suggestions` | ✅ 完整处理，发送到 PermissionCard |
| `control_request.hook_callback` | `callback_id`, `input`, `tool_use_id`, `request_id` | ✅ 通过 `cli:hookCallback` 处理 |
| `control_request.elicitation` | `mcp_server_name`, `message`, `mode`, `url`, `requested_schema` | ✅ 通过 `cli:elicitation` / ElicitationCard 处理 |
| `hook_event` | `data`（hook 进度数据）| ✅ 通过 `cli:hookEvent` 转发 |
| `message_start` | `message`（包含 model, usage）| ✅ 触发 `messageStart` |
| `content_block_start` | block type（text/tool_use） | ⚠️ 忽略（`break`） |
| `content_block_delta.text_delta` | `text` | ✅ 触发 `textDelta` |
| `content_block_delta.thinking_delta` | `thinking` | ✅ 触发 `thinkingDelta` |
| `content_block_stop` | — | ✅ 触发 `contentBlockStop` |
| `message_stop` | — | ✅ 触发 `messageStop` |
| `message_delta` | `stop_reason`, `usage` | ✅ 触发 `messageDelta` |
| `permission_request`（legacy） | `tool_name`, `action_data`/`input` | ✅ 处理为 `permissionRequest` |

### 未处理的 CLI 事件信息

- `system.init.tools[]`：初始化时 CLI 报告当前会话可用工具列表，AIPA 未将其渲染到 UI（可用于工具可见性指示器）
✅ **P0 已实现**：`system.init` 事件在 `stream-bridge.ts` 中完整解析，通过 `cli:systemInit` IPC 发送到渲染器，`ChatHeader` 组件消费并展示 `permissionMode`、模型名称、可用工具数量。
- `system.init.mcp_servers[]`：MCP 服务器连接状态，✅ 已消费——`activeMcpServers` store + `SettingsMcp.tsx` 连接状态点（Iteration 542）
- `result.permission_denials[]`：被拒绝的权限请求记录，AIPA 未展示
- `result.total_cost_usd` / `usage`：费用和 token 用量，AIPA 有 `TokenUsageBar` 但未在 result 事件中完整更新

### 第二次扫描新发现（2026-04-14，P4 级差距）

CLI 2.1.81 中发现以下事件类型 AIPA 未处理：

| 事件类型 | 含义 | 处理状态 |
|----------|------|----------|
| `overloaded_error` | API 服务过载错误 | ✅ **P4-1 已实现** — stream-bridge 转发为 `apiError`，渲染器显示 toast |
| `authentication_error` | API 认证失败（token 过期/无效 key） | ✅ **P4-1 已实现** — 同上，error 级 toast |
| `custom-title` | CLI 自动生成会话标题 | ✅ **P4-2 已实现** — stream-bridge 转发为 `customTitle`，渲染器更新 sessionTitle |
| `worktree-state` | worktree 状态变更通知 | ✅ **P4-6 已实现** — preload 已订阅 `cli:worktreeState`，渲染器更新 `chatStore.activeWorktree`（Iteration 539） |
| `task_completed` | 后台任务完成通知 | ✅ **P4-6 已实现** — preload 已订阅 `cli:taskCompleted`，渲染器显示完成 toast（Iteration 539） |
| `result.modelUsage` | 每个模型的 token/cost 分项用量 | ✅ **P0-5 已实现** — stream-bridge 转发 `modelUsage` 字段，存入 chatStore.modelUsage（Iteration 539） |
| `result.uuid` | 结果 UUID 字段 | ✅ 已消费 — stream-bridge 提取并存入 chatStore.lastResultUuid（Iteration 676） |
| `result.fast_mode_state` | API fast mode 状态（企业功能） | ✅ 已消费 — 存入 chatStore.fastModeState，ChatHeader 在 fast_mode_state='on' 时显示 Zap 黄色 "Fast" 徽标（Iteration 676） |
| `result` subtype: `error_max_structured_output_retries` | 结构化输出超出重试次数 | ❌ 未处理（只处理了 error_max_turns/budget） |

**新发现的 CLI 设置字段（settings.json）**：

| 配置段 | 字段 | 含义 | AIPA UI 状态 |
|--------|------|------|--------------|
| `sandbox.network` | `allowedDomains`, `allowManagedDomainsOnly`, `allowUnixSockets` | 沙箱网络访问控制 | ✅ `SandboxSettingsPanel.tsx` 标签式路径编辑器（Iteration 545） |
| `sandbox.filesystem` | `allowWrite`, `denyWrite`, `denyRead`, `allowRead` | 沙箱文件系统路径控制 | ✅ `SandboxSettingsPanel.tsx` 标签式路径编辑器（Iteration 545） |
| `sandbox.autoAllowBashIfSandboxed` | boolean | 沙箱内自动允许 Bash | ✅ Toggle 开关（Iteration 545） |
| `sandbox.allowUnsandboxedCommands` | boolean | 允许通过参数绕过沙箱 | ✅ Toggle 开关（Iteration 545） |
| `sandbox.ignoreViolations` | Record | 特定工具违规豁免 | ❌ 无 UI |
| `plugins.enabledPlugins` | Record | 插件市场插件启用/禁用 | ⚠️ 有 plugin:list/setEnabled IPC，无市场 UI |

**Copy Session ID 功能**：
✅ **P4-3 已实现** — `ChatHeader` 中添加了 session ID 徽章，点击后复制完整 session ID 到剪贴板，可用于 `--resume` 手动恢复会话。显示 8 位前缀，复制成功后显示 "copied!" 反馈。

---

## 六、MCP 集成

### CLI 能力

- 支持 4 种 MCP 服务器连接类型：`stdio`、`sse`、`http`（streaming HTTP）、`websocket`
- 配置位置：`~/.claude/settings.json`（`mcpServers`）、`.mcp.json`（项目级）
- 服务器管理：`/mcp` 命令，`claude mcp add/remove/list/get-tools/reset-project-choices`
- 支持企业级 `allowedMcpServers` / `deniedMcpServers` 白/黑名单
- `enableAllProjectMcpServers` — 自动批准 .mcp.json 中的服务器
- `enabledMcpjsonServers` / `disabledMcpjsonServers` — 项目级 MCP 审批记录
- `ListMcpResourcesTool` / `ReadMcpResourceTool` — 读取 MCP 资源
- OAuth/XAA 集成（MCP 服务器 OAuth 流程）
- MCP Elicitation（服务器主动请求用户输入，控制协议 `elicitation` 子类型）

### AIPA 当前实现

- ✅ `mcp:list` — 列出 `~/.claude/settings.json` 中的 `mcpServers`
- ✅ `mcp:add` / `mcp:remove` — 写入 `settings.json`
- ✅ `mcp:setEnabled` — 切换服务器启用状态
- ✅ `cli:elicitation` — MCP elicitation 请求处理（`ElicitationCard.tsx`）
- ✅ `cli:respondElicitation` — 回写 elicitation 响应
- ✅ `mcp:getTools` — 从 `system.init` 工具名中按 `mcp__serverName__toolName` 前缀推断，缓存在 main 进程返回（Iteration 542）
- ⚠️ `mcp:reconnect` — 已有 IPC 但返回 `error: 'Reconnect not supported'`
- ✅ MCP 服务器连接状态实时展示 — `SettingsMcp.tsx` 每个服务器行显示彩色状态点（绿=已连接/红=断开/灰=未知）和工具数徽标，tooltip 显示工具列表（Iteration 542）
- ✅ `.mcp.json` 项目级配置查看/编辑 UI（Settings → MCP → 'mcp' 子标签，读写项目 `.mcp.json`，Iteration 562）
- ❌ MCP OAuth 认证流程 UI
- ⚠️ MCP 资源浏览器（ListMcpResources→URI chips，ReadMcpResource→内容预览，Iteration 555；无专用侧边栏面板）

### 差距 & 优先级

~~P1：`mcp:getTools` 实现真实工具枚举（需建立 MCP 客户端连接，或解析 CLI `system.init.mcp_servers` 事件）。~~ ✅ 已实现（Iteration 542）
~~P1：MCP 服务器连接状态实时展示（connected/disconnected/error）。~~ ✅ 已实现（Iteration 542）
~~P2：`.mcp.json` 项目级管理。~~ ✅ 已实现（Iteration 562）

---

## 七、记忆系统（Memory / CLAUDE.md）

### CLI 能力

CLI 有两套记忆机制，概念不同：

**1. CLAUDE.md 文件系统（指令记忆）**
- `~/.claude/CLAUDE.md` — 全局个人指令
- `.claude/CLAUDE.md` — 项目级指令（随项目检入 git）
- `.claude/CLAUDE.local.md` — 本地私有指令（不检入 git）
- `~/.claude/agent-memory/<agentType>/` — 代理专属记忆
- 嵌套扫描：CLI 递归扫描父目录寻找 CLAUDE.md（`loadedNestedMemoryPaths`）
- `/memory` 命令 — 交互式编辑记忆文件

**2. memdir 结构化记忆系统**
- 存储在 `~/.claude/memdir/`（全局）或 `.claude/memdir/`（项目）
- 每条记忆是一个 Markdown 文件，含 YAML frontmatter：`name`、`description`、`type`、内容体
- 记忆类型（`MEMORY_TYPES`）：`user`（用户画像）、`feedback`（行为反馈）、`project`（项目上下文）、`reference`（外部资源指针）
- 有记忆衰减机制（`memoryAge.ts`）
- 支持私有/团队记忆作用域（`TYPES_SECTION_COMBINED`）
- `findRelevantMemories.ts` — 关联记忆检索

### AIPA 当前实现

- ✅ `memory:list` — 列出全局/项目记忆文件（按 scope 过滤）
- ✅ `memory:read` — 读取记忆文件内容
- ✅ `memory:write` — 写入记忆文件
- ✅ `memory:create` — 创建新记忆（含 frontmatter 模板：name、description、type）
- ✅ `memory:delete` — 删除记忆文件
- ✅ IPC 完整，渲染器可通过 `window.electronAPI.memoryList/Read/Write/Create/Delete` 操作
- ⚠️ UI 侧：有记忆管理界面但与 CLAUDE.md 文件区分不清晰
- ❌ 无嵌套 CLAUDE.md 扫描可视化（用户不知道哪些 CLAUDE.md 被 CLI 加载）
- ✅ 记忆衰减/过期指示器 — MemoryItemCard 显示 Fresh/Aging/Old/Stale 色点徽标及相对时间（Iteration 677）
- ✅ 记忆类型视觉区分 — 按 user/feedback/project/reference 类型设置 indigo/amber/green/blue 左边框 + 对应图标（Iteration 677）
- ✅ CLAUDE.md 文件编辑器（`/memory` 命令等价 UI）与 memdir 结构化记忆 UI 概念区分已实现（2026-04-15）

### 差距 & 优先级

✅ P1：CLAUDE.md 文件（指令记忆）与 memdir 结构化记忆（`user/feedback/project/reference` 类型）在 UI 中有明确的概念区分——Tab 切换时显示说明 banner，指令文件 Tab 顶部有路径状态汇总。（2026-04-15）
✅ P2：嵌套 CLAUDE.md 加载路径可视化——指令文件 Tab 内置"CLI 当前加载的 CLAUDE.md 文件"折叠面板，显示三个路径（全局/项目/本地）的存在状态，不存在的路径可一键创建。（2026-04-15）
P2：记忆类型过滤器（仅显示 `feedback` 类型等）。

---

## 八、其他 CLI 特性

### 8.1 Hooks 系统

CLI 支持 `settings.json` 中配置 `hooks` 字段，在以下 **27 种事件** 上触发：

`PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `Notification`, `UserPromptSubmit`, `SessionStart`, `SessionEnd`, `Stop`, `StopFailure`, `SubagentStart`, `SubagentStop`, `PreCompact`, `PostCompact`, `PermissionRequest`, `PermissionDenied`, `Setup`, `TeammateIdle`, `TaskCreated`, `TaskCompleted`, `Elicitation`, `ElicitationResult`, `ConfigChange`, `WorktreeCreate`, `WorktreeRemove`, `InstructionsLoaded`, `CwdChanged`, `FileChanged`

每个事件可配置多个 hook，支持 4 种 hook 类型：
- `command`（bash 命令）：支持 `async`/`asyncRewake`/`once`/`timeout`/`if` 条件过滤
- `prompt`（LLM 评估）：支持 `model`/`timeout`/`if`
- `http`（HTTP POST）：支持 `headers`/`allowedEnvVars`/`timeout`/`if`
- `agent`（子代理验证）：支持 `model`/`timeout`/`if`

AIPA 状态：
- ✅ 接收 `hook_event` 流事件（`cli:hookEvent` IPC），有 `HookProgressCard.tsx`
- ✅ 接收 `hook_callback` 并响应（`HookCallbackCard.tsx`）
- ✅ 可通过 `config:writeCLISettings` 写入 hooks 配置
- ✅ **P1-1 已实现** — `HooksSettingsPanel.tsx` + `HookAddWizard.tsx` 三步向导（事件选择 → 类型配置 → 命令编写），支持行内编辑（Pencil 按钮 + InlineEditor 子组件 + 保存/取消），`disableAllHooks` 红色开关 + 橙色警告 banner
- ✅ hook 事件触发历史 — `HookEventHistory` 折叠面板实时记录本次会话 Hook 触发（事件类型 badge、时间戳，最多50条，Iteration 671）

### 8.2 斜杠命令系统（/commands）

CLI 提供了 **60+ 内置斜杠命令**，包括：
`/compact`, `/clear`, `/model`, `/memory`, `/mcp`, `/status`, `/config`, `/diff`, `/cost`, `/skills`, `/hooks`, `/init`, `/logout`, `/login`, `/help`, `/resume`, `/rewind`, `/export`, `/context`, `/branch`, `/commit`, `/pr`, `/review`, `/vim`, `/keybindings`, `/effort`, `/fast`, `/plan`, `/worktree`, `/voice` 等

AIPA 状态：
- ✅ 有 `SlashCommandPopup.tsx` 组件
- ✅ `fs:listCommands` 扫描 `.claude/commands/` 目录（��户自定义命令）
- ⚠️ 仅扫描了用户自定义命令，未暴露 CLI 内置斜杠命令列表
- ❌ 无完整内置命令映射到 UI 操作（如 `/compact` 按钮）

### 8.3 上下文感知（Context / @ 提及）

CLI 支持 `@` 语法将文件/URL/git diff 等内容注入消息：
- `@<filepath>` — 附加文件内容
- `@url` — 抓取 URL 内容

AIPA 状态：
- ✅ `AtMentionPopup.tsx` — @ 提及弹窗
- ✅ `ChatInputAttachments.tsx` — 附件管理
- ✅ `ContextIndicator.tsx` — 上下文指示器
- ✅ 支持图片粘贴（`usePasteDetection.ts`）
- ⚠️ 文件 @ 提及是否正确转换为 CLI content array 格式（`[{type:'text', text:'@file...'}]`）需验证

### 8.4 计划模式（Plan Mode）

- CLI 在 `plan` 权限模式下，工具调用被拦截，Claude 只能分析不能执行
- `/plan` 命令进入计划模式，`EnterPlanModeTool` 是代理自发进入的机制

AIPA 状态：
- ✅ `PlanCard.tsx` — 计划展示卡片
- ✅ `PlanModeBanner.tsx` — 计划模式横幅
- ⚠️ 计划模式与权限模式 `plan` 的关联是否正确设置待验证

### 8.5 Speculation（推测执行）

AIPA 有自研的推测执行功能（`speculation-bridge.ts`，`SpeculationCard.tsx`），在用户输入时提前运行轻量级预测。这是 **AIPA 独有功能**，CLI 无对应能力。

### 8.6 代理 / Swarms

CLI 支持：
- `AgentTool` — 同步子代理
- `TeamCreate/TeamDelete` — 并行多代理团队（AGENT_SWARMS feature）
- tmux/in-process 后端（`utils/swarm/`）
- 代理间通信（`SendMessageTool`，`LeaderPermissionBridge`）

AIPA 状态：❌ 无多代理拓扑 UI

### 8.7 Compact（上下文压缩）

CLI 有 4 种压缩策略：
1. Session Memory Compact — 写入 MEMORY.md 保留摘要
2. 传统 Compact — 用 Claude 总结并截断历史
3. Reactive Compact — 响应式触发（上下文快满时自动触发）
4. Micro-compact — 轻量级压缩

✅ AIPA 状态：ChatHeader 中新增 /compact 触发按钮（Iteration 667），TokenUsageBar 75%/90% 触发 COMPACT 按钮（Iteration 542）

---

## 九、实现路线图

### P0（高优先级，核心体验）

1. ✅ **权限模式选择器**：`PermissionsSettingsPanel.tsx` 已实现 5 级权限模式选择器（default/acceptEdits/bypassPermissions/dontAsk/plan），修复了 `skipPermissions: true` 默认值安全问题，通过 `--permission-mode` 参数传递
2. ✅ **FileEdit/FileWrite 差异对比 UI**：`FileDiffView.tsx` 通过 LCS 算法实现行级 diff 渲染，`ToolUseBlock` 已接入，用户批准前可预览变更内容
3. ✅ **会话压缩（/compact）入口**：`TokenUsageBar` 在 75%/90% token 使用率时显示 COMPACT 按钮，向 CLI stdin 发送 `/compact`，处理 `PreCompact`/`PostCompact` hook 事件
3. ✅ **会话压缩（/compact）ChatHeader 按钮**：ChatHeader 新增专用 Compact 按钮，点击直接向 CLI stdin 发送 /compact 命令，无需等待 token 使用率触发（Iteration 667）
4. ✅ **system.init 事件完整消费**：`stream-bridge.ts` 完整解析 `system.init`，通过 `cli:systemInit` IPC 更新 ChatHeader 的权限模式指示器、模型名称、可用工具数
5. ✅ **result 事件完整消费**：从 `result` 事件中读取 `total_cost_usd`、`usage`（input/output tokens）、`permission_denials[]`、`modelUsage`、`numTurns`、`durationMs`，全部存入 store；permission_denials > 0 时显示 warning toast（Iteration 539）

### P1（中优先级，增强体验）

1. ✅ **Hooks 配置 UI**：`HooksSettingsPanel.tsx` + `HookAddWizard.tsx` 三步向导，支持 command/http/prompt/agent 类型，行内编辑，`disableAllHooks` 开关
2. ✅ **权限规则管理 UI**：`PermissionsSettingsPanel.tsx` 中 allow/deny 规则列表编辑器，标签式 UI + 行内输入 + 冲突检测，写入 `~/.claude/settings.json`
3. ✅ **MCP getTools 真实实现**：通过解析 `system.init` 工具名按 `mcp__serverName__toolName` 前缀推断，缓存在 main 进程并通过 `mcp:getTools` IPC 返回（Iteration 542）
4. ✅ **MCP 服务器连接状态**：在 MCP 管理 UI 中显示每个服务器的实时连接状态点（绿=已连接/红=断开/灰=未知），tooltip 显示工具列表（Iteration 542）
5. ✅ **CLAUDE.md vs memdir 概念分离**：Memory 管理 UI 中明确区分"指令文件（CLAUDE.md）"和"结构化记忆（memdir）"，Tab 切换时显示概念说明 banner（2026-04-15）

### P2（低优先级，锦上添花）

1. ✅ **内置斜杠命令映射**：`SlashCommandPopup` 展示所有 CLI 内置命令（`/compact`、`/model`、`/clear` 等）并提供说明（2026-04-15）
2. ✅ **记忆类型过滤器**：Memory 面板 memdir tab 支持按 `user/feedback/project/reference` 类型过滤（2026-04-15）
3. ✅ **多代理可视化**：当 `AgentTool` 被调用时，渲染专用 `AgentToolCard` 组件，显示子代理调用的嵌套结构（描述预览、subagent_type chip、prompt 展开/折叠、结果输出、状态指示器 running/done/error、elapsed timer）（Iteration 544）
4. **会话 Cleanup 设置**：在 Settings 中添加 `cleanupPeriodDays` 数字输入（0 = 禁用）
5. **语言偏好设置**：在 Settings 中添加 `language` 字段（对应 `settings.json`）
6. ✅ **嵌套 CLAUDE.md 可视化**：Memory 面板"指令文件"Tab 内置"CLI 当前加载的 CLAUDE.md 文件"折叠区，显示全局/项目/本地三个路径的存在状态（✓绿/○灰），不存在的文件有一键创建按钮（2026-04-15）
7. ✅ **TodoWrite 面板**：当 Claude 调用 `TodoWrite` 工具时，渲染结构化待办列表（Iteration 以前已完成）；**Glob/Grep 结构化展示**：路径列表高亮 + 折叠（Iteration 540）；**WebSearch/WebFetch 富化展示**：URL chip + 内容预览（Iteration 540）
8. ✅ **Canvas 连接端口与动态边线**：节点悬停时显示连接端口指示点；运行中边线（sourceStatus=running）显示流动虚线动画（Iteration 547）

### P4（第二次扫描发现，微优化）

1. ✅ **overloaded_error / authentication_error 事件**：stream-bridge 已处理，渲染器 toast 展示
2. ✅ **custom-title 事件**：CLI 自动生成标题时同步到 sessionTitle store
3. ✅ **Copy Session ID 按钮**：ChatHeader 中点击复制完整 session ID 用于 `--resume`
4. ✅ **Sandbox 设置 UI**：`SandboxSettingsPanel.tsx` 实现 `sandbox.network`（allowedDomains 标签式编辑器）和 `sandbox.filesystem`（allowWrite/denyWrite/allowRead/denyRead 路径列表）的可视化编辑器，以及 `autoAllowBashIfSandboxed` 和 `allowUnsandboxedCommands` Toggle 开关（Iteration 545）
5. ✅ **result.modelUsage 存储**：stream-bridge 转发 `modelUsage` 字段，`setLastCost` 存入 chatStore.modelUsage 分项（Iteration 539）
6. ✅ **worktree-state / task_completed 事件消费**：preload 订阅两个 channel，渲染器更新 `activeWorktree` 状态并显示 toast（Iteration 539）

---

## 附：IPC 事件完整映射表

| CLI 事件/协议 | AIPA IPC 通道 | 实现状态 |
|--------------|---------------|----------|
| stdout: `{"type":"assistant",...}` | `cli:assistantText`（text）, `cli:toolUse`（tool_use block）| ✅ |
| stdout: `{"type":"user",...}` 含 tool_result | `cli:toolResult` | ✅ |
| stdout: `{"type":"result",...}` | `cli:result` | ⚠️ 仅提取 session_id，cost/usage 未消费 |
| stdout: `{"type":"system","subtype":"init",...}` | `cli:unknown`（丢弃？）| ❌ 未消费 |
| stdout: `{"type":"control_request","request":{"subtype":"can_use_tool",...}}` | `cli:permissionRequest` | ✅ |
| stdout: `{"type":"control_request","request":{"subtype":"hook_callback",...}}` | `cli:hookCallback` | ✅ |
| stdout: `{"type":"control_request","request":{"subtype":"elicitation",...}}` | `cli:elicitation` | ✅ |
| stdout: `{"type":"hook_event",...}` | `cli:hookEvent` | ✅ |
| stdout: `{"type":"content_block_delta","delta":{"type":"text_delta",...}}` | `cli:assistantText`（textDelta） | ✅ |
| stdout: `{"type":"content_block_delta","delta":{"type":"thinking_delta",...}}` | `cli:thinkingDelta` | ✅ |
| stdout: `{"type":"message_stop",...}` | `cli:messageEnd` | ✅ |
| stdout: `{"type":"overloaded_error",...}` | `cli:apiError`（errorType: overloaded） | ✅ 已实现（2026-04-14）|
| stdout: `{"type":"authentication_error",...}` | `cli:apiError`（errorType: authentication） | ✅ 已实现（2026-04-14）|
| stdout: `{"type":"custom-title",...}` | `cli:customTitle` | ✅ 已实现（2026-04-14）|
| stdout: `{"type":"worktree-state",...}` | `cli:worktreeState` | ✅ 已实现（Iteration 539）— 渲染器更新 activeWorktree |
| stdout: `{"type":"task_completed",...}` | `cli:taskCompleted` | ✅ 已实现（Iteration 539）— 渲染器显示 toast |
| stderr 任意内容 | `cli:error` | ✅ |
| 进程退出 | `cli:processExit` | ✅ |
| stdin: `{"type":"user","message":{...}}` | `cli:sendMessage` → bridge.sendMessage() | ✅ |
| stdin: `{"type":"control_response","response":{"subtype":"success",...}}` | `cli:respondPermission` / `cli:respondHookCallback` / `cli:respondElicitation` | ✅ |
| stdin: `{"type":"control_cancel_request",...}` | `cli:cancelRequest` | ✅ |
| stdin: `{"type":"keep_alive"}` | 内部心跳（25s） | ✅ |
| stdin: `{"type":"update_environment_variables",...}` | `cli:updateEnv` | ✅ |
| CLI flag: `--permission-mode` | 通过 `args.flags` 传入，但无 UI 选择器 | ⚠️ |
| CLI flag: `--resume <session_id>` | `args.resumeSessionId` | ✅ |
| CLI flag: `--model` | `args.model` | ✅ |
| CLI flag: `--dangerously-skip-permissions` | `skipPermissions → args.flags` | ✅（但默认开启有安全隐患）|
| CLI flag: `--max-turns` | 通过 `args.flags` 可传 | ⚠️ 无 UI 但 prefsStore.maxTurns 存在 |
| CLI flag: `--append-system-prompt` | 通过 `args.flags` 可传 | ⚠️ prefsStore.appendSystemPrompt 存在 |

---

## 十一、最新实现记录（2026-04-14）

### 第二次 CLI 源码扫描 — 新事件支持

**P4-1：overloaded_error / authentication_error 处理**

- `stream-bridge.ts` 新增 `overloaded_error` 和 `authentication_error` case，转为 `apiError` 事件
- IPC 层通过 `cli:apiError` 转发到渲染器
- `preload/index.ts` 新增 `onApiError` 订阅方法
- `useStreamJson.ts` 监听 `cli:apiError`，对 `overloaded` 显示 warning toast，对 `authentication` 显示 error toast（8s）
- 解决了之前这两种错误静默丢失的问题

**P4-2：custom-title 事件处理**

- `stream-bridge.ts` 新增 `custom-title` case，转为 `customTitle` 事件
- IPC 层通过 `cli:customTitle` 转发到渲染器
- `preload/index.ts` 新增 `onCustomTitle` 订阅方法
- `useStreamJson.ts` 监听 `cli:customTitle`，在会话尚无标题时自动设置 CLI 生成的标题
- CLI 自动生成的会话摘要标题现在会同步到 AIPA UI

**P4-3：Copy Session ID 按钮（ChatHeader）**

- `ChatHeader` 订阅 `useChatStore(s => s.currentSessionId)`
- 在 title 列底部添加 session ID 徽章（8 位前缀显示）
- 点击后调用 `navigator.clipboard.writeText(sessionId)`，带 fallback textarea 方案
- 复制成功后显示 "copied!" 绿色反馈，1.8s 后恢复
- tooltip 显示完整 session ID 及用途提示（for --resume）

**同步处理（stream-bridge 已转发，渲染器待实现）**：

- `worktree-state` → `cli:worktreeState`（渲染器可订阅 worktree 变更）
- `task_completed` → `cli:taskCompleted`（渲染器可订阅后台任务完成）

---

## 十、最新实现记录（2026-04-12）

### ToolApprovalDialog（工具确认弹窗）

- 监听 `cli:permissionRequest` IPC 事件
- 全屏模态覆盖（`position: fixed`, `inset: 0`, `zIndex: 9999`），玻璃态背景
- 展示工具名称、操作描述、输入参数（JSON 格式化）
- Allow / Deny 两个按钮，分别回写 `cli:respondPermission`（success / deny）
- 支持 `permission_suggestions`（预设建议选项）

### HooksSettingsPanel 行内编辑（inline edit）

- 每条已有 hook 规则显示 Pencil 铅笔按钮
- 点击后展开 `InlineEditor` 子组件（命令/URL/条件字段）
- 保存触发 `config:writeCLISettings` 写入 `~/.claude/settings.json`
- 取消恢复原始值，无 dirty state 残留

### disableAllHooks toggle

- `HooksSettingsPanel` 顶部红色开关（`background: rgba(239,68,68,...)` CTA 变体）
- 开启后显示橙色警告 banner：`rgba(251,146,60,0.12)` 背景 + `rgba(251,146,60,0.25)` 边框
- 写入 `~/.claude/settings.json` 的 `disableAllHooks: true` 字段
- 开关状态与规则列表联动（禁用时规则列表置灰）

---

## 十二、最新实现记录（2026-04-15，Iterations 541-555）

### Iteration 540 — 工具结果富化展示

- **Glob**：结果以目录部分淡色 + 文件名加粗的路径列表展示，超过 10 条折叠
- **Grep**：结果以 `file:line:content` 格式展示，可折叠展开
- **WebSearch / WebFetch**：URL chip 可点击（标注 Sources），内容前 200 字符预览，可展开全文

### Iteration 541 — PlanModeBanner 批准/拒绝 + AskUserQuestion 卡片

- `PlanModeBanner.tsx`：计划模式横幅新增批准/拒绝按钮，通过 `cli:respondPermission` 回写 CLI
- `AskUserQuestionCard.tsx`：展示代理提问文本、可点击选项按钮、自由文本输入框，通过 `aipa:sendMessage` 事件回复 CLI

### Iteration 542 — Canvas 边线删除按钮 + 工具栏全屏切换

- 画布边线悬停时显示删除按钮（`×`），点击删除该连接
- `CanvasToolbar.tsx` 新增全屏切换按钮，通过 `document.requestFullscreen` 进入原生全屏

### Iteration 543 — MCP 真实工具枚举 + 实时连接状态

- `mcp:getTools` 通过解析 `system.init` 中 `mcp__serverName__toolName` 前缀推断各服务器工具列表
- `SettingsMcp.tsx` 服务器卡片显示实时状态点（绿=连接/红=断开/灰=未知）+ 工具数徽标 + tooltip

### Iteration 544 — AgentToolCard 子代理可视化

- `AgentToolCard.tsx`：Claude 调用 Agent 工具时渲染专用卡片
- 实时计时器（running/done/error 三态）、任务描述摘要（前 120 字符）
- 可折叠展开完整提示词和输出结果
- subagent_type chip（task/background/sync 样式区分）

### Iteration 545 — Sandbox 设置 UI

- `SandboxSettingsPanel.tsx`：`sandbox.network` 和 `sandbox.filesystem` 的可视化编辑器
- `allowedDomains`、`allowWrite`/`denyWrite`/`allowRead`/`denyRead`：标签式路径/域名编辑器（回车添加，×删除）
- `autoAllowBashIfSandboxed` 和 `allowUnsandboxedCommands`：Toggle 开关
- 写入 `~/.claude/settings.json` 对应字段

### Iteration 546 — TaskCreate/Update/List/Get 内联卡片 UI

- `TaskDashboardCard.tsx`：Kanban 3 列（pending/in_progress/completed）+ 平铺列表两种视图模式
- `ToolUseBlock.tsx` 早返回：`TaskCreate` 渲染绿色 badge，`TaskUpdate` 渲染靛蓝 badge
- `TaskList`/`TaskGet` 结果解析 JSON 数组或单对象，渲染 `TaskDashboardCard`
- 状态徽章：灰色=待办、蓝色脉冲=进行中、绿色=已完成

### Iteration 547 — Canvas 连接端口 + 动态边线动画

- 节点悬停时显示连接端口指���点（输入/输出端）
- 运行中边线（`sourceStatus=running`）显示流动虚线动画（CSS `stroke-dashoffset` 动画）
- `WorkflowCanvas.tsx` 将 `sourceStatus={srcStatus}` 正确传入 `CanvasEdge`

### Iterations 548-554 — 浅色主题 CSS 变量全面迁移

将所有硬编码的 RGBA 颜色替换为 CSS 变量，使浅色主题正常渲染：

**Iteration 548**（布局 / 会话组件）：
- `StatusBar.tsx`、`StatusBarModelPicker.tsx`、`statusBarConstants.ts`、`SessionTooltip.tsx`

**Iteration 549**（Chat 组件，29 个文件）：
- `ToolUseBlock.tsx`、`MessageContent.tsx`、`ContextUsageMeter.tsx`、`CompactButton.tsx`、`SpeculationCard.tsx`、`TaskDashboard.tsx`、`CompareView.tsx`、`DailySummaryCard.tsx`、`CodeBlock.tsx`、`DiffView.tsx`、`FileDiffView.tsx`、`MessageList.tsx`、`TodoListView.tsx`、`AgentToolCard.tsx`、`HookCallbackCard.tsx`、`ToolBatchBlock.tsx`、`TaskQueuePanel.tsx`、`PlanCard.tsx`、`MarkdownImage.tsx`、`TypingStatus.tsx`、`URLPreviewCard.tsx`、`HookProgressCard.tsx`、`TaskDashboardCard.tsx`、`PlanApprovalCard.tsx`、`ElicitationCard.tsx`、`WelcomeQuickActions.tsx`、`ForkDialog.tsx`、`TemplatesSection.tsx`、`ChatInputPasteChips.tsx`

**Iteration 550**（Settings / 弹窗组件）：
- SettingsAbout.tsx、SettingsAdvanced.tsx、KeyboardShortcutsModal.tsx 等

**Iteration 551**（Memory / Sidebar / 对话框）：
- `MemoryPanel.tsx`、`MemoryAddForm.tsx`、`MemoryItemCard.tsx`、`ElicitationCard.tsx`、`ForkDialog.tsx`、`PlanApprovalCard.tsx`、`WelcomeQuickActions.tsx`、`ReminderSection.tsx`

**Iteration 552**（Bug 修复）：
- `ReminderSection.tsx` 修复 onMouseEnter 语句误放入 style 对象内的语法错误

**Iteration 553**（HookAddWizard / WorkflowPersonasSection）：
- `HookAddWizard.tsx`、`WorkflowPersonasSection.tsx`

**Iteration 554**（Workflow 组件）：
- `CanvasToolbar.tsx`、`CanvasNodeSidebar.tsx`、`CanvasProgressBar.tsx`、`WorkflowDetailHeader.tsx`、`WorkflowRunHistory.tsx`、`WorkflowStepEditor.tsx`

迁移后，浅色主题（`Ctrl+Shift+D`）下所有卡片、面板、弹窗均正确显示为浅色背景，文字为深色，无硬编码暗色残留。

---

## 十三、最新实现记录（2026-04-16，Iterations 556-567）

### Iteration 555-558 — LSP 工具卡片 + MCP 资源内联卡片

- **LSPTool**：专用内联卡片，展示语言服务器协议操作（`hover`/`definition`/`references` 等类型 chip、文件路径+行列坐标、结果预览）
- **ListMcpResources**：URI chips 列表展示
- **ReadMcpResource**：内容预览 + 复制按钮（Iteration 555）
- `FEATURE_GAP.md` 同步更新

### Iteration 559 — NotebookEdit 单元格展示卡片

- **`NotebookEditCard`**：增强的 Jupyter notebook 编辑展示
  - 文件名 header（Notebook 图标 + basename）
  - 单元格类型色标：`code` = 蓝色、`markdown` = 紫色
  - 可展开的源代码预览（前 8 行折叠，点击展开全部）
  - 结果徽标：edit_mode chip（replace/insert/delete）+ cell_number
- `ToolUseBlock.tsx` 新增 `NotebookEdit` 早返回路由

### Iteration 560 — uiStore pendingSettingsTab 类型修复

- 将 `'sandbox'` 添加到 `pendingSettingsTab` 严格联合类型
- 修复 `/memory` 斜杠命令触发 `openSettingsAt('memory')` 时类型校验失败的 bug
- 根因：uiStore 未包含所有有效 Settings 标签值

### Iteration 561 — CanvasNode 子代理计数徽标

- 当 `AgentTool` 运行中时，画布节点右上角显示 Users 图标徽标 + 子代理数量
- 徽标使用 indigo 背景，随代理状态实时更新

### Iteration 562 — .mcp.json 项目级 MCP 配置查看器

- Settings → MCP 新增 `mcp` 子标签，专门读写项目 `.mcp.json` 文件
- 支持查看、编辑项目级 MCP 服务器配置（与全局 `~/.claude/settings.json` 的 `mcpServers` 分离）
- IPC：`mcp:readProjectConfig` / `mcp:writeProjectConfig`

### Iteration 563 — CanvasEdge sourceStatus 6 态样式

- 6 种边线状态样式：
  - `running` = indigo 动画流动虚线（`stroke-dashoffset` CSS 动画）
  - `success` = 绿色实线
  - `error` = 红色实线
  - `skipped` = 灰色虚线
  - `pending` = 浅灰色实线
  - 默认 = 中性灰
- `CanvasEdge.tsx` 按 `sourceStatus` prop 动态切换颜色和 dash 样式

### Iteration 564 — WebBrowserTool + PowerShell 内联卡片

- **WebBrowserInputCard**：action badge（navigate/click/type/screenshot/scroll 等）、URL 展示、selector/text 字段
- **WebBrowserResultCard**：截图 base64 缩略图预览（最大 320px），或文本内容预览（前 300 字符可展开）
- **PowerShellTool**：通过 `BASH_TOOLS` 类型路由到 Bash 卡片渲染，支持 Windows PowerShell 命令展示
- `ToolUseBlock.tsx` 新增 `WebBrowserTool` 和 `PowerShellTool` 路由分支

### Iteration 565 — CronCreate/CronDelete/CronList 内联卡片

- **`CronCard`**（输入展示）：
  - cron 表达式 chip（灰底等宽字体）
  - prompt 预览（前 80 字符）
  - `recurring` / `one-shot` 徽标区分重复/一次性任务
  - job ID 展示
- **CronList 结果**：解析任务数组，每行显示 job_id + cron expression + prompt 摘要
- `ToolUseBlock.tsx` 新增 `CronCreate`/`CronDelete`/`CronList` 三个路由分支

### Iteration 566 — RemoteTrigger 内联卡片

- **`RemoteTriggerCard`**：
  - action chip：`list`=灰、`get`=蓝、`create`=绿、`update`=琥珀、`run`=indigo（带 Play 图标）
  - trigger_id 和 body.prompt 预览
  - 结果展示按 action 类型区分：list 显示 ID 列表；get/create/update 显示详情；run 显示绿色 "Triggered" 徽标
- `TOOL_ICONS` 新增 `RemoteTrigger` → `Send` 图标映射

### Iteration 567 — SendMessage 跨代理消息展示卡片

- **`SendMessageCard`**：
  - indigo 左边框（`rgba(99,102,241,0.5)`），与其他代理相关卡片风格一致
  - `to` 字段展示收件人（Users 图标 + 名称/ID）
  - 消息文本预览（前 120 字符，超出可展开）
  - 结果：绿色 "Delivered" 徽标（Check 图标）或红色 "Failed" 徽标（X 图标）
- `ToolUseBlock.tsx` 新增 `SendMessage` 早返回路由（SendMessage 已存在于 `TOOL_ICONS`）

---

## 十四、CSS 变量迁移全记录（Iterations 568-634）

### Iteration 568-596 — CSS 变量迁移第一阶段（白色 rgba 值）

将 renderer 所有组件中硬编码的 `rgba(255,255,255,...)` 白色值全面替换为 CSS 自定义属性，实现浅色/深色主题动态切换。

**映射规则：**
- `rgba(255,255,255,0.03-0.08)` → `var(--glass-bg-low)`（超低透明度玻璃背景）或 `var(--border)`（边框）或 `var(--bg-hover)`（悬停状态）
- `rgba(255,255,255,0.10-0.18)` → `var(--bg-input)`（输入框背景）或 `var(--bg-hover)`
- `rgba(255,255,255,0.25-0.35)` → `var(--text-faint)`（极浅文字）或 `var(--border)`
- `rgba(255,255,255,0.45-0.65)` → `var(--text-muted)`（次要文字）
- `rgba(255,255,255,0.70-0.80)` → `var(--text-secondary)`（辅助文字）或 `var(--text-primary)`
- `rgba(255,255,255,0.85-0.95)` → `var(--text-primary)`（主文字）或 `var(--text-bright)`（非彩色按钮上的高亮文字）
- `rgba(255,255,255,1)` → `var(--text-bright)`（纯白文字）

**保留豁免（不迁移）：**
- `box-shadow` 属性值中的所有 rgba — 始终跳过
- indigo accent `rgba(99,102,241,...)` — 保留语义色彩
- 状态色（green、red、amber、orange 系）— 保留
- 彩色/渐变按钮上的 `rgba(255,255,255,0.85-0.95)` — 保留（白字在彩色背景上是语义，不是主题色）
- `var(--x, rgba(...))` 回退值内部 — 保留（由变量定义侧控制）
- 语义调色板色（cyan、purple、teal 等工作流节点类型色）— 保留

**覆盖范围：** 约 30+ 个 renderer 组件文件，涵盖 ChatPanel、MessageList、Message、ToolUseBlock、各 ToolCard 组件、WorkflowCanvas、TasksPanel、MemoryPanel、SettingsGeneral、SettingsPersonas、SessionList 等所有核心 UI 层。

### Iteration 597-614 — 功能迭代与 CSS 迁移并行

此阶段在持续推进 CSS 迁移的同时，完成了若干功能增强：
- P3 功能差距项（PlanApprovalCard、DreamTaskCard、StructuredOutputCard）接入（Iteration 617）
- clawd-on-desk 桌宠集成（Iteration 615，详见下节）
- CSS 迁移范围扩展至 Workflow 编辑器、Settings 面板等剩余组件

### Iteration 615 — clawd-on-desk 桌宠集成

将 clawd-on-desk 桌面宠物与 AIPA 事件桥接，实现 AI 助手状态的可爱视觉化反馈。

**新增文件：**
- `electron-ui/src/main/clawd-bridge.ts`：fire-and-forget HTTP 桥接模块，500ms 防抖，仅在 `clawdEnabled` 开启时发送通知

**IPC 扩展：**
- `clawd:launch`：启动 clawd-on-desk 进程
- `clawd:isRunning`：查询 clawd 是否正在运行

**事件映射（CLI 事件 → Clawd 状态）：**
- `textDelta` → `thinking`（思考中）
- `toolUse` → `working`（工具调用中）
- `result` → `happy`（完成）

**偏好设置：**
- `clawdEnabled` 字段加入 `ClaudePrefs`，默认值 `false`
- Settings → General 新增开关 toggle
- `prefsStore` 中 `clawdEnabled: false` 作为默认值

### Iteration 616-634 — CSS 变量迁移第二阶段（黑色 rgba 值与近黑色变体）

将 renderer 所有组件中硬编码的 `rgba(0,0,0,...)` 及近黑色变体（`rgba(8-20,8-20,16-30,...)`）全面替换为 CSS 自定义属性。

**映射规则：**
- `rgba(0,0,0,0.50-0.70)` 背景遮罩/overlay → `var(--glass-overlay)`
- `rgba(0,0,0,0.18-0.35)` 代码/内容区域背景 → `var(--code-bg)`
- `rgba(10,10,20,0.85-0.90)` 近黑色面板 → `var(--glass-bg-mid)` 或 `var(--glass-bg-low)`
- `rgba(12,12,22,0.60-0.96)` 近黑色容器 → `var(--code-bg)` 或 `var(--glass-bg-deep)`
- `rgba(14,14,24,0.96-0.97)` 深色面板 → `var(--glass-bg-deep)` 或 `var(--glass-bg-high)`
- `rgba(15,15,25,0.85-0.90)` 中层玻璃背景 → `var(--glass-bg-low)`
- `rgba(18,18,30,0.97)` 最深层上下文 → `var(--glass-bg-deep)`
- `rgba(20,20,20,0.70-0.80)` overlay 标签背景 → `var(--glass-overlay)` 或 `var(--glass-bg-low)`
- `rgba(8,8,16,1)` 完全不透明画布背景 → `var(--bg-primary)`
- SVG fill 中的灰色/禁用色 → `var(--text-faint)`
- `rgba(0,0,0,0.75)` 文字颜色 → `var(--text-primary)`

**Iteration 633 — globals.css 深色主题变量补全**

向 `globals.css` 深色 `:root` 块追加 9 个缺失变量，实现与浅色主题的完整对等：
- `--accent-bg`、`--accent-border`、`--accent-muted`（accent 色系背景/边框/柔和变体）
- `--color-error: #f87171`（红色错误）
- `--color-success: #4ade80`（绿色成功）
- `--color-warning: #fbbf24`（琥珀色警告）
- `--color-violet: #a78bfa`（紫罗兰辅助色）

**Iteration 634 — 迁移完成最终审计**

对所有 renderer 组件进行最终扫描，确认：
- 所有剩余 rgba 值均属于以下豁免类别：`box-shadow`、indigo 语义 accent 色（`rgba(99,102,241,...)`）、状态色（green/red/amber）、渐变/彩色按钮配色
- 无漏网的主题相关 rgba 值
- CSS 变量迁移全面完成，浅色/深色主题切换（`Ctrl+Shift+D`）在所有组件下均正确响应

---

## 十五、最新实现记录（2026-04-16，Iterations 635-638）

### Iteration 635 — FEATURE_GAP.md 文档更新（迭代 568-634）
更新 FEATURE_GAP.md 顶部日期行至 Iteration 634；新增第十四节，完整记录 CSS 变量迁移第一阶段（568-596，白色 rgba）、第二阶段（618-634，黑色 rgba 及近黑色变体）、clawd-on-desk 集成（615）及 globals.css 完整性审计（633）。

### Iteration 636 — formatHtml.ts CSS 变量迁移
将 `formatHtml.ts` CSS 模板字符串中的 12 个 `rgba(255,255,255,...)` 白色值迁移为 CSS 变量（border×8、glass-bg-low×4）；保留 3 个语义状态色（蓝色用户消息边框、红色系统消息边框、绿色计划消息边框）。将已完成的 clawd api-spec 文档从 todo/ 移入 todo_done/。

### Iteration 637 — FileReadCard 文件读取内联卡片
新增 `FileReadCard.tsx` 组件，渲染 CLI `Read` 工具调用：文件路径（目录淡色+文件名高亮）、行范围徽标（offset/limit）、前20行代码预览（可展开）、复制按钮、读取中状态指示。`ToolUseBlock` 已接入 `'Read'` 和 `'read_file'` 路由。

### Iteration 638 — AgentToolCard 子代理可视化增强
增强已有 `AgentToolCard.tsx`：新增 indigo 左边框（`rgba(99,102,241,0.5)`）、subagent_type 徽标、前台（绿色）/后台（橙色）chip、Worktree 隔离（蓝色）chip、description 显示、prompt 可展开预览（>150 字符）、result 内嵌框（可展开，>200 字符）。

---

## 十六、最新实现记录（2026-04-16，Iterations 639-642）

### Iteration 639 — FileWriteCard 文件写入内联卡片
新增 `FileWriteCard.tsx` 组件，渲染 CLI `Write` 工具调用：绿色主题（左边框/图标/徽标），文件路径展示（目录淡色+文件名绿色加粗），内容前20行代码预览（可展开），复制按钮，写入中状态（"Writing..."），"File written" 确认徽标。`ToolUseBlock` 已接入 `'Write'` 路由。

### Iteration 640 — FEATURE_GAP.md 文档更新（迭代 635-638）
更新 FEATURE_GAP.md 日期行至 Iteration 638；将 `FileRead`（637）和 `Agent`（638）在工具表格中标记为 ✅；在优先级小节追加两条新发现 bullet；新增第十五节记录迭代 635-638 详情。

### Iteration 641 — Light Theme CSS 变量完整性审计
对 `globals.css` 进行系统性审计：:root 中定义的 80 个变量中，70 个颜色/透明度变量全部在 `[data-theme="light"]` 中有覆盖（core palette 18/18、glass-morphism 15/15、task queue 8/8 等），10 个 z-index 变量正确继承。结论：变量覆盖已完整，无需修改。

### Iteration 642 — cleanupPeriodDays UI 设置（已实现确认）
确认 `cleanupPeriodDays` 设置 UI 已在早期迭代（518+）完整实现（IPC `config:readCLISettings` / `config:writeCLISettings`，Settings → General 数字输入框）。本次迭代增强 min/max 验证（1-365范围），更新 i18n 提示文字，将 FEATURE_GAP.md 对应条目标记为 ✅。

---

## 十七、最新实现记录（2026-04-16，Iterations 639-646）

### Iteration 643 — FileEditCard 文件编辑内联卡片
新增 `FileEditCard.tsx` 组件，渲染 CLI `Edit` 工具调用（字符串替换操作）：橙色主题（左边框/图标/徽标），Before（红色调）/After（绿色调）双面板 diff 展示，各前10行可展开，独立复制按钮，replace_all 徽标，"Edit applied" 确认徽标。兼容 `old_string`/`old_str`/`new_string`/`new_str` 多种字段名变体。`ToolUseBlock` 接入 `'Edit'`、`'str_replace_editor'`、`'str_replace_based_edit_tool'` 三个路由。

### Iteration 644 — FEATURE_GAP.md 文档更新（迭代 639-642）
更新 FEATURE_GAP.md 日期行至 Iteration 642；将 FileWrite（639）标记为 ✅；新增 FileWrite 优先级 bullet；新增第十六节记录迭代 639-642。

### Iteration 645 — 会话权限历史展示（PermissionsSettingsPanel）
在 `PermissionsSettingsPanel.tsx` 新增 `SessionPermissionHistory` 子组件，从 `useChatStore.messages` 中筛选 `role === 'permission'` 的 PermissionMessage 条目，展示最近20条权限决策（工具名、decision 状态、时间戳），最新在前，解决 FEATURE_GAP.md 中 `❌ 无权限决策历史展示` 差距。

### Iteration 646 — README 文档更新至 Iteration 642
更新 `README.md`（中文）和 `README_EN.md`（英文）：扩展 AgentToolCard 条目描述（subagent_type/前台后台/Worktree 徽标）；新增 FileReadCard 和 FileWriteCard 子弹点；Design System 章节重写为语义化 CSS 变量体系说明和 clawd-on-desk 集成描述。

---

## 十八、最新实现记录（2026-04-16，Iterations 647-653）

### Iteration 647 — FEATURE_GAP.md 文档更新（迭代 643-646）
更新 FEATURE_GAP.md 日期行至 Iteration 646；将 FileEdit（643）在工具表格中标记为 ✅，附 FileEditCard 描述；新增 FileEdit 优先级 bullet；新增第十七节记录迭代 643-646。

### Iteration 648 — CLI Settings 新增字段 UI（defaultShell / respectGitignore）
在 SettingsGeneral 新增两个 CLI settings 字段 UI：`defaultShell`（bash/powershell 下拉）和 `respectGitignore`（布尔开关，默认 true）。确认 `disableAllHooks` 已在 HooksSettingsPanel 中实现（跳过）。同步更新 i18n（en.json + zh-CN.json）。

### Iteration 649 — Session 列表 UX 改进
改进会话列表搜索体验：Escape 键现在可同时清除 filter 文本（原逻辑只清 global results）；非交互的匹配数文字提示替换为可点击的 X 清除按钮；计数 badge 过滤时显示 "N/总数" 格式（如 "3/47"，紫色），让用户知道总会话数量。

### Iteration 650 — ChatHeader 工具调用计数徽标
在 ChatHeader 新增 Wrench 图标 + 计数 chip，实时显示当前会话已执行的工具调用总数（从 useChatStore.messages 聚合 toolUses 数组长度）。仅在 toolUseCount > 0 时显示，tooltip 显示中文描述。

### Iteration 651 — 修复：部门空状态"新建会话"按钮无响应
根因：PendingSessionCard 只在 sessions.length > 0 的 else 分支渲染，当部门无会话时点击后 pendingNewDeptId 被设置，但渲染仍停在 sessions.length === 0 分支，PendingSessionCard 永远不显示。修复：在空状态分支内嵌套 pendingNewDeptId === dept.id 判断，命中时显示 PendingSessionCard。

### Iteration 652 — AI引擎设置迁移至专属标签页
将 API Key、模型选择、思考模式（thinking mode）、Max Turns、Budget Limit、AI回复语言等 AI 引擎相关设置从"常规（General）"标签页迁移至"AI引擎（AI Engine）"专属标签页。SettingsGeneral 缩减约154行，SettingsAIEngine 扩展为完整的 AI 引擎配置页。SettingsPanel 传参更新。

### Iteration 653 — 修复：Windows 启动 IPC 双重加载超时
根因：AppShell.tsx 在挂载时独立发起 prefsGetAll() IPC 调用（仅读 sidebarWidth），与 App.tsx 已成功的第一次批量加载形成竞争。Windows IPC 延迟较高，第二次调用超过 3000ms 超时。修复：AppShell 改为从 Zustand prefsStore 响应式读取 sidebarWidth（prefsLoaded 为 true 后同步），不再发独立 IPC。

---

## 十九、最新实现记录（2026-04-16，Iterations 654-658）

### Iteration 654 — FEATURE_GAP.md 文档更新（迭代 647-653）
更新日期至 Iteration 653；权限决策历史、defaultShell、respectGitignore 标记为 ✅；追加第十八节（647-653 记录）。

### Iteration 655 — UI 小项优化（ChatHeader、Department、Session）
评估了4个优化项：①工具调用计数重置（已正确工作，跳过）；②部门取消按钮（已正确工作，跳过）；③会话搜索键盘提示（新增 "/" 快捷键提示到 session.search i18n 键，同时修复17个 SessionListHeader 缺失的 i18n 键）；④会话空状态（SessionEmptyState.tsx 已在 Iter 461 实现，跳过）。

### Iteration 656 — outputStyle CLI 设置 UI
在 AI Engine 标签页新增 `outputStyle` 设置下拉（auto/text/json），读写 `~/.claude/settings.json`。使用 `cliOutputStyle*` i18n 前缀区分已有的 UI 层 outputStyle 概念。同步更新 en.json 和 zh-CN.json。

### Iteration 657 — clawd 桌宠运行状态指示器
增强 SettingsGeneral 中的 clawd 开关：新增 checking/running/stopped 三态状态点（橙色脉冲/绿色/灰色），enabled 时每5秒轮询 `clawdIsRunning()`，开启时显示2秒启动确认反馈，运行/未运行状态文本提示。

### Iteration 658 — 会话搜索 i18n 修复与 UI 微调
修复 SessionListHeader 中17个缺失的 i18n 键（en.json + zh-CN.json）。session.search 占位符新增 "(/) " 键盘快捷键提示（"/" 是聚焦会话搜索的全局快捷键）。其余3个 polish 项（工具计数重置、部门取消、会话空状态）均已正常工作，跳过。

---

## 二十、最新实现记录（2026-04-17，Iterations 659-663）

### Iteration 659 — FEATURE_GAP.md 文档更新（迭代 654-658）
更新 FEATURE_GAP.md 日期行至 Iteration 658；`outputStyle` 在配置表格中标记为 ✅；追加第十九节（654-658 记录）。

### Iteration 660 — Toast 通知改善（会话标题生成提示）
在 `useStreamJson.ts` 新增 info toast（2s）：收到 `cli:customTitle` 事件时或 `session.generateTitle` 本地调用成功时触发，提示用户会话标题已自动生成。新增 i18n 键 `session.titleGenerated`（en.json + zh-CN.json）。

### Iteration 661 — MemoryItemCard 复制按钮
在 `MemoryItemCard.tsx` 悬停操作栏新增 Copy 按钮：点击后将 `mem.content` 写入系统剪贴板，按钮图标切换为绿色 Check 图标并保持 1.5s，之后恢复原 Copy 图标。

### Iteration 662 — WorkflowDetailPage 运行统计汇总栏
在 `WorkflowDetailPage.tsx` 新增 `RunStatsBar` 子组件：展示总运行次数、成功率（≥80% 绿色 / ≥50% 琥珀色 / <50% 红色）、最后运行时间相对时间戳及 OK/ERR 状态徽标。工作流无运行记录时隐藏该栏。

### Iteration 663 — 修复：clawd Windows 启动失败（launch.js 不存在）
根因：`launchClawd()` 依赖 `launch.js` 作为 Electron 入口脚本，但该文件在 clawd 包中不存在（不同构建版本路径差异），导致 Windows 下报 "Cannot find module launch.js" 错误。修复：重写 `clawd-bridge.ts` 中的 `launchClawd()` 函数，完全绕过 `launch.js`——优先尝试 clawd 自带 electron 二进制（`node_modules/.bin/electron[.cmd]` 或 `node_modules/electron/dist/electron[.exe]`），回退至 AIPA 自身 `process.execPath` 并以 `CLAWD_DIR` 为 app 参数；同时删除子进程环境中的 `ELECTRON_RUN_AS_NODE` 变量（防止 Electron 以 Node.js 模式运行）。

---

## 二十一、最新实现记录（2026-04-18，Iterations 664-667）

### Iteration 664 — FEATURE_GAP.md 文档更新（迭代 659-663）
更新 FEATURE_GAP.md 日期行至 Iteration 663；追加第二十节（659-663 记录）。

### Iteration 665 — 权限规则 UI（allow/deny/ask/defaultMode）
在 `PermissionsSettingsPanel.tsx` 新增完整权限规则管理：
- **默认模式选择器**：`default`/`acceptEdits`/`autoEdit`/`plan` 下拉选择器
- **规则列表编辑器**：allow/deny/ask 三组规则各有独立列表，支持行内添加/删除，计数徽标，冲突检测（同一规则同时出现在 allow 和 deny 时高亮警告）
- **会话权限历史**：`SessionPermissionHistory` 子组件展示最近权限决策记录
- 写入 `~/.claude/settings.json` 的 `permissions` 字段

### Iteration 666 — additionalDirectories UI 管理
在 `PermissionsSettingsPanel.tsx` 新增 `AdditionalDirectoriesSection`：
- 文件夹选择器（调用 `fsShowOpenDialog`）用于图形化选择路径
- 手动路径文本输入框
- 已添加路径列表，每项带删除按钮
- 写入 `~/.claude/settings.json` 的 `permissions.additionalDirectories` 数组

### Iteration 667 — ChatHeader /compact 触发按钮
在 `ChatHeader` 新增专用压缩按钮（通过 `CompactButton.tsx` 组件）：
- 点击直接向 CLI stdin 发送 `/compact` 命令
- 支持带指令的变体（`/compact [instruction]`）
- 与现有 TokenUsageBar 75%/90% 触发的 COMPACT 按钮互补，允许用户随时主动压缩上下文

---

## 二十二、最新实现记录（2026-04-18，Iterations 668-677）

### Iteration 668 — FEATURE_GAP.md 文档更新（迭代 664-667）
更新日期行至 Iteration 667；权限规则 UI、additionalDirectories、/compact ChatHeader 按钮在对应表格中标记为 ✅；新增第二十一节。

### Iteration 669 — Git Workflow 设置 UI（attribution/coAuthor/gitInstructions）
在 `SettingsGeneral.tsx` 新增 Git Workflow 区块（Settings2 图标）：
- `attribution.commit` / `attribution.pr` 文本输入（嵌套对象，整体写入 settings.json）
- `includeCoAuthoredBy` 布尔开关（默认 true）
- `includeGitInstructions` 布尔开关（默认 false）
- 9 个 i18n 键（en.json + zh-CN.json）

### Iteration 670 — 权限模式完整性修复（dontAsk/bypassPermissions）
在 `PermissionsSettingsPanel.tsx` 补全缺失的两个权限模式：
- `dontAsk` — 正常样式
- `bypassPermissions` — 红色⚠危险样式（激活时红色边框 + 背景 + 文字，含 ⚠ 前缀）
- 扩展 `PermissionDefaultMode` 联合类型；i18n 双语键补充

### Iteration 671 — Hook 触发历史 UI（HooksSettingsPanel）
在 `HooksSettingsPanel.tsx` 底部新增 `HookEventHistory` 折叠子组件：
- 订阅 `window.electronAPI.onHookEvent`，本地累积最多 50 条
- 展示事件类型 badge、"fired" 状态、格式化时间戳
- 空状态文案："No hook events in this session"
- i18n：`hooks.hookHistory` / `hooks.hookHistoryEmpty`

### Iteration 672 — BriefToolCard 简报工具内联卡片
新增 `BriefToolCard.tsx`：slate/灰色主题（`rgba(100,116,139,0.5)` 左边框）、FileText 图标、路径展示（目录淡色+文件名高亮）、结果前 300 字符预览（可展开）、复制按钮、"Brief loaded" 确认徽标。`ToolUseBlock` 接入 `'BriefTool'`/`'brief'` 路由。

### Iteration 673 — SleepToolCard 等待工具内联卡片
新增 `SleepToolCard.tsx`：紫色主题（`rgba(139,92,246,0.5)` 左边框）、Moon 图标、duration_ms/seconds 格式化展示、可选 reason 字段、"Woke up"（绿色 Check）/"Sleeping..."（紫色脉冲）双态徽标。`ToolUseBlock` 接入 `'SleepTool'`/`'sleep'` 路由。

### Iteration 674 — apiKeyHelper 设置 UI
在 `SettingsAIEngine.tsx` API Key 区块后新增 `apiKeyHelper` 文本输入（脚本路径），读写 `~/.claude/settings.json`。i18n 双语键。

### Iteration 675 — statusLine + fileSuggestion 设置 UI
在 `SettingsGeneral.tsx` 新增两个 CLI 配置字段：
- `statusLine.command` — 自定义状态栏 Shell 命令
- `fileSuggestion.command` — @ 文件建议命令
均写入 `~/.claude/settings.json` 嵌套对象。

### Iteration 676 — result.uuid + fast_mode_state 消费
- `stream-bridge.ts` 提取 `uuid` 和 `fast_mode_state` 并随 result 事件转发
- `chatStore` 新增 `lastResultUuid` 和 `fastModeState` 字段
- `useStreamJson.ts` 在 result 事件时写入两者
- `ChatHeader.tsx` 在 `fastModeState === 'on'` 时显示 Zap 图标 + 黄色 "Fast" chip

### Iteration 677 — 记忆衰减指示器 + 作用域视觉区分
- `memory-manager.ts` 在 `MemoryFile` 中新增 `mtime: number`（fs.statSync 获取）
- `MemoryItemCard.tsx` 按 `updatedAt` 计算衰减状态（Fresh <7d 绿/Aging <30d 黄/Old <90d 橙/Stale >90d 红），显示色点徽标 + 相对时间
- 按 `memoryType`（user/feedback/project/reference）设置 indigo/amber/green/blue 左边框 + 对应 lucide 图标
- i18n：`memory.fresh/aging/old/stale`（en + zh-CN）

---

## 二十三、最新实现记录（2026-04-19，Iteration 678）

### Iteration 678 — ToolSearchTool / TeamCreate / SkillTool / TaskStop 内联卡片

**ToolSearchTool 工具搜索卡片**（原 ❌）：
- 新增 `ToolSearchToolCard.tsx`：cyan/青色主题（`rgba(6,182,212,...)` 左边框）、Search 图标
- 查询文本展示 + limit 字段
- 结果解析：工具列表以 chip 网格展示（Wrench 图标 + 工具名，超12个折叠展开）
- "N tools found" / "No tools found" 徽标
- 原始文本回退（非 JSON 数组结果）：前200字符预览 + 展开
- `ToolUseBlock` 接入 `'ToolSearchTool'`/`'tool_search'` 路由

**TeamCreate/TeamDelete 团队管理卡片**（原 ❌）：
- 新增 `TeamCreateCard.tsx`：rose/pink 主题（`rgba(244,63,94,0.5)` 左边框）、Users 图标
- team name 展示（兼容 `name`/`team_name`/`teamName` 字段）
- members/agents 成员 chip 列表
- description 字段（斜体）
- 完成后提取 `team_id`/`id` 展示
- "Team created" 绿色确认徽标
- 结果可折叠 JSON 预览（Copy 按钮）
- `ToolUseBlock` 接入 `'TeamCreate'`/`'team_create'`/`'TeamDelete'`/`'team_delete'` 路由

**SkillTool 调用追踪卡片**（原 ⚠️）：
- 新增 `SkillToolCard.tsx`：green 主题（`rgba(34,197,94,...)` 左边框）、Zap 图标
- skill name（兼容 `skill`/`skill_name` 字段）展示
- args 参数预览（code 块）
- "Skill executed" 绿色确认徽标
- 输出预览（前200字符折叠，可展开）+ Copy 按钮
- `ToolUseBlock` 接入 `'Skill'`/`'skill'` 路由

**TaskStop Badge**（原 ⚠️）：
- `TaskBadgeCard.tsx` 新增 `TaskStopBadge` 组件（red 主题，red 左边框）
- 展示 task_id 短前缀 + running/done 状态
- `ToolUseBlock` 接入 `TASK_STOP_TOOLS`（`'TaskStop'`/`'task_stop'`）路由
