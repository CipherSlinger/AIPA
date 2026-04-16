# AIPA x Claude Code CLI — 功能差距文档

> 更新日期：2026-04-16（Iteration 567）
> CLI 版本：claude-code 2.1.81（BUILD_TIME: 2026-03-20T21:25:42Z）
> 分析目的：指导 AIPA UI 逐步对齐 CLI 全部能力

---

## 一、工具系统（Tools）

### CLI 支持的工具

| 工具名 | 功能描述 | AIPA 是否有 UI |
|--------|----------|----------------|
| `Bash` | 执行 shell 命令，支持沙箱、权限检查 | ✅ PTY 终端可执行，但无结构化工具 UI |
| `FileRead` | 读取文件，支持行范围限制 | ❌ Chat 面板无独立文件读取操作 UI |
| `FileEdit` | 精确字符串替换编辑文件 | ❌ 无差异对比/批准 UI |
| `FileWrite` | 创建/覆盖文件 | ❌ 无独立文件写入 UI |
| `Glob` | 文件模式匹配搜索 | ✅ 结构化展示：文件路径列表，目录部分淡色，文件名加粗，超过10条折叠（Iteration 540） |
| `Grep` | 正则内容搜索（ripgrep 封装） | ✅ 结构化展示：file:line:content 格式，可折叠展开（Iteration 540） |
| `WebFetch` | 抓取 URL 内容并 AI 处理 | ✅ URL chip 可点击，内容前200字符预览，可展开全文（Iteration 540） |
| `WebSearch` | 网络搜索 | ✅ URL chip 可点击（标注 Sources），内容前200字符预览，可展开全文（Iteration 540） |
| `NotebookEdit` | 编辑 Jupyter notebook 单元格 | ✅ `NotebookEditCard`：文件名 header、单元格类型色标（code=蓝/markdown=紫）、可展开源代码预览、结果徽标（Iteration 559） |
| `TodoWrite` | 写待办列表（结构化任务管理） | ✅ `TodoListView.tsx` 组件已实现，pending/in_progress/completed 状态，high/medium/low 优先级色标 |
| `Agent` (子代理) | 产生并行/串行子代理 | ❌ AIPA 无子代理拓扑可视化 |
| `TaskOutputTool` | 读取后台任务输出 | ⚠️ 有 TaskDashboard 组件但连接不完整 |
| `TaskStopTool` | 停止后台任务 | ⚠️ 部分实现 |
| `TaskCreate/Get/Update/List` | 异步任务 CRUD（isTodoV2Enabled） | ✅ TaskCreate/TaskUpdate 渲染内联 badge；TaskList/TaskGet 结果渲染 TaskDashboardCard（Kanban/列表视图，含状态徽章、owner、blocked-by，Iteration 546） |
| `EnterPlanMode` / `ExitPlanMode` | 进入/退出计划模式 | ✅ 有 PlanModeBanner（含批准/拒绝按钮，Iteration 541）；PlanCard 深度控制已实现 |
| `EnterWorktree` / `ExitWorktree` | Git worktree 沙箱隔离 | ⚠️ 有 WorktreeDialog 但为独立 CRUD，未与会话绑定 |
| `SkillTool` | 加载和调用 skills 片段 | ⚠️ 有 skillsList/Read/Install IPC，无 Skill 调用追踪 UI |
| `AskUserQuestion` | 代理主动询问用户 | ✅ 有专用 `AskUserQuestionCard`：展示问题文本、可点击选项按钮、自由文本输入框，通过 `aipa:sendMessage` 事件回复 CLI（Iteration 541） |
| `LSPTool` | LSP 语言服务（ENABLE_LSP_TOOL） | ❌ 无 LSP 集成 |
| `ListMcpResources` / `ReadMcpResource` | 读取 MCP 服务器资源 | ⚠️ 有结果卡片（ListMcpResources→URI chips，ReadMcpResource→内容预览+复制）；输入展示用通用 JSON（Iteration 555） |
| `ToolSearchTool` | 延迟工具搜索 | ❌ 无 UI |
| `BriefTool` | 读取 /brief 简报 | ❌ 无 UI |
| `SendMessageTool` | 跨代理消息传递 | ✅ `SendMessageCard`：indigo 左边框、to/message 字段、Delivered/Failed 状态徽标（Iteration 567） |
| `TeamCreate/Delete` | 多代理团队管理（AGENT_SWARMS） | ❌ 无 UI |
| `SleepTool` | 代理主动等待（PROACTIVE/KAIROS） | ❌ 无 UI |
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
- `StructuredOutput` 工具：CLI 可在调用时按 JSON Schema 约束返回结构化数据，AIPA 无专用 UI
- `DreamTask`（`dream` 类型后台任务）：自动记忆整合子代理，AIPA 无 UI
- `plan_approval_request/response`：多代理计划审批协议，AIPA 无 UI

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
- ❌ 无 `cleanupPeriodDays` UI 设置入口（仅在 CLI settings.json 层面）
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
- ❌ 无规则级别权限 UI（用户不能在 UI 中添加/编辑 allow/deny/ask 规则列表）
- ❌ 无权限模式切换 UI（无法在 UI 中从 `default` 切换到 `acceptEdits` 等模式）
- ❌ 无 `additionalDirectories` UI 管理
- ❌ 无权限决策历史展示

### 差距 & 优先级

✅ **P0 已实现**：`PermissionsSettingsPanel.tsx` 提供 5 级权限模式选择器（default/acceptEdits/bypassPermissions/dontAsk/plan），通过 `--permission-mode` 参数正确传递给 CLI。allow/deny 规则列表编辑器已实现（标签式 UI + 行内输入 + 冲突检测），写入 `~/.claude/settings.json`。

---

## 四、配置系统（Config）

### CLI 支持的核心配置键（`settings.json`）

| 配置键 | 类型 | 描述 | AIPA 是否有 UI |
|--------|------|------|----------------|
| `model` | string | 覆盖默认模型 | ✅（ModelPicker + prefsStore.model） |
| `permissions.defaultMode` | enum | 默认权限模式 | ❌ |
| `permissions.allow` | array | 允许规则 | ❌ |
| `permissions.deny` | array | 拒绝规则 | ❌ |
| `permissions.ask` | array | 总是询问规则 | ❌ |
| `permissions.additionalDirectories` | array | 额外工作目录 | ❌ |
| `env` | Record | 会话环境变量 | ✅（SettingsAdvanced 键值对编辑器，读写 ~/.claude/settings.json） |
| `hooks` | HooksSettings | 钩子配置 | ⚠️ 能读写 CLI settings.json，无可视化 hooks 编辑器 |
| `mcpServers` | Record | MCP 服务器配置 | ✅（mcp:add/remove/list）|
| `cleanupPeriodDays` | number | 会话保留天数 | ✅（SettingsGeneral 数字输入，读写 ~/.claude/settings.json） |
| `language` | string | 响应语言偏好 | ✅（SettingsGeneral AI 回复语言下拉，读写 ~/.claude/settings.json） |
| `attribution.commit/pr` | string | commit/PR 署名 | ❌ |
| `includeCoAuthoredBy` | boolean | 是否包含 Co-authored-by | ❌ |
| `includeGitInstructions` | boolean | 是否包含 git workflow 指令 | ❌ |
| `availableModels` | array | 企业模型白名单 | ❌ |
| `worktree.symlinkDirectories` | array | worktree 符号链接目录 | ❌ |
| `worktree.sparsePaths` | array | sparse checkout 路径 | ❌ |
| `disableAllHooks` | boolean | 禁用所有 hooks | ❌ |
| `defaultShell` | enum | bash/powershell | ❌ |
| `outputStyle` | string | 输出样式控制 | ❌ |
| `statusLine` | object | 自定义状态栏命令 | ❌ |
| `enabledPlugins` | Record | 启用插件列表 | ⚠️ 有 plugin:list/setEnabled IPC |
| `apiKeyHelper` | string | 自定义 API key 脚本 | ❌ |
| `fileSuggestion` | object | @ 提及文件建议命令 | ❌ |
| `respectGitignore` | boolean | 文件选择器是否遵守 .gitignore | ❌ |

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

P0：`permissions.defaultMode` 需要 UI 选择器（dropdown）。
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
| `result.uuid` | 结果 UUID 字段 | ❌ 未消费 |
| `result.fast_mode_state` | API fast mode 状态（企业功能） | ❌ 未消费 |
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
- ❌ 无记忆衰减/过期指示器
- ❌ 无团队记忆 vs 私有记忆视觉区分
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
- ❌ 无 hook 事件触发历史展示

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

AIPA 状态：❌ 无任何 compact 触发 UI

---

## 九、实现路线图

### P0（高优先级，核心体验）

1. ✅ **权限模式选择器**：`PermissionsSettingsPanel.tsx` 已实现 5 级权限模式选择器（default/acceptEdits/bypassPermissions/dontAsk/plan），修复了 `skipPermissions: true` 默认值安全问题，通过 `--permission-mode` 参数传递
2. ✅ **FileEdit/FileWrite 差异对比 UI**：`FileDiffView.tsx` 通过 LCS 算法实现行级 diff 渲染，`ToolUseBlock` 已接入，用户批准前可预览变更内容
3. ✅ **会话压缩（/compact）入口**：`TokenUsageBar` 在 75%/90% token 使用率时显示 COMPACT 按钮，向 CLI stdin 发送 `/compact`，处理 `PreCompact`/`PostCompact` hook 事件
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
