# PRD: MCP 服务器完整管理

_版本：v1 | 状态：Draft | PM：aipa-pm | 日期：2026-04-07_

## 一句话定义

将 MCP 设置页从仅支持 enable/disable 升级为完整的 MCP 服务器管理面板，支持添加、删除、重连服务器，并展示每个服务器提供的工具列表。

## 背景与动机

MCP（Model Context Protocol）是 Claude Code 连接外部工具和数据源的核心协议。AIPA 当前的 MCP 管理能力极为基础——`SettingsMcp.tsx` 仅列出已配置的服务器并提供 enable/disable 开关，用户必须手动编辑 `~/.claude/settings.json` 才能添加或删除 MCP 服务器。这对于 AIPA「无需打开终端」的产品定位是不可接受的短板。

此功能属于 Superpower Integration Plan Phase 2.5。随着 MCP 生态的快速扩展（Zapier、Notion、Linear 等 MCP 服务器涌现），用户对 MCP 管理的需求日益迫切。

## 目标用户

**主要**：开发者——需要连接数据库、API、开发工具等 MCP 服务器
**次要**：高级知识工作者——想通过 MCP 连接 Notion、Google Drive 等生产力工具

## 用户故事

作为一个需要连接多个 MCP 工具的开发者，
我希望能在 AIPA 设置页中直接添加和管理 MCP 服务器，
以便无需手动编辑 JSON 配置文件即可扩展 Claude 的能力。

## 功能范围

### In Scope（本版本包含）

1. **MCP 添加向导**：三步式引导添加新 MCP 服务器（选类型 → 填参数 → 测试连接）
2. **服务器操作按钮**：每个服务器增加「删除」「重连」操作
3. **工具列表展示**：展开服务器卡片，显示其提供的工具名称和描述
4. **ToolUse 卡片来源标注**：聊天中 MCP 工具调用显示来源服务器名称

### Out of Scope（本版本不包含，说明原因）

- **MCP OAuth 授权流程**：需要浏览器弹窗和回调处理，复杂度高，v2 迭代
- **MCP 资源浏览器**：展示 MCP 资源（resources）列表和内容——超出工具管理范畴，v2
- **MCP 服务器市场/目录**：预置常见服务器列表供一键安装——需维护服务器目录数据，v2
- **项目级 MCP 配置**：`.claude/settings.json` per-project 配置——v2

## 功能详述

### 功能 1：MCP 添加向导（MCPAddWizard）

**描述**：在 MCP 设置页新增「Add Server」按钮，点击后打开三步添加向导。

**交互逻辑**：
- Step 1 — 选择类型：三个卡片选择（stdio / HTTP Streamable / SSE Legacy），每个带简短说明
  - stdio：「Run a local command（e.g., npx, uvx, docker）」
  - HTTP Streamable：「Connect to a remote HTTP endpoint」
  - SSE Legacy：「Connect via Server-Sent Events (legacy)」
- Step 2 — 填写参数：
  - stdio：`command`（必填）+ `args`（可选，逗号分隔）+ `env`（可选，key=value）
  - HTTP/SSE：`url`（必填）+ `headers`（可选，key=value 对）
- Step 3 — 服务器名称（必填，用作 mcpServers 的 key）+ 测试连接按钮
  - 「Test Connection」→ 调用 `mcp:add` 后尝试列出工具（`mcp:getTools`）
  - 成功 → 显示绿色勾和工具数量
  - 失败 → 显示错误信息，允许返回修改参数
- 确认 → 调用 `mcp:add` 写入配置并关闭向导

**边界条件**：
- 服务器名称已存在 → 提示「Server name already exists」，阻止添加
- command 字段为空 → 阻止进入下一步
- 测试连接超时（10秒）→ 允许仍然保存（可能是服务器启动慢）

**验收标准**：
- [ ] 可通过三步向导添加 stdio 类型 MCP 服务器
- [ ] 可通过三步向导添加 HTTP/SSE 类型 MCP 服务器
- [ ] 服务器名称唯一性校验
- [ ] 测试连接显示成功/失败状态

### 功能 2：服务器操作按钮（删除 / 重连）

**描述**：现有 MCP 服��器列表中每个服务器卡片增加操作按钮。

**交互逻辑**：
- 「Delete」按钮（红色，右侧）：
  - 点击 → 确认对话框「Remove [server name]? This will delete it from settings.json.」
  - 确认 → 调用 `mcp:remove` 移除配置
  - 列表实时更新
- 「Reconnect」按钮（图标按钮）：
  - 点击 → 调用 `mcp:reconnect`，显示 loading spinner
  - 成功 → Toast「Reconnected to [server name]」
  - 失败 → Toast 错误信息

**边界条件**：
- 删除最后一个服务器 → 列表显示空状态
- 重连期间再次点击 → 忽略（按钮 disabled）

**验收标准**：
- [ ] 可删除 MCP 服务器，配置从 `settings.json` 移除
- [ ] 可重连 MCP 服务器
- [ ] 删除有确认对话框

### 功能 3：工具列表展示

**描述**：服务器卡片可展开，显示该服务器提供的工具列表。

**交互逻辑**：
- 每个服务器卡片增加展开箭头（ChevronDown/ChevronRight）
- 展开 → 调用 `mcp:getTools`（传入 serverName）→ 显示工具列表
- 每个工具显示：工具名（粗体）+ 描述（灰色次要文字）
- 工具数量显示为角标（如 "5 tools"）

**边界条件**：
- 服务器未连接 → 显示「Server not connected. Click reconnect to try again.」
- 获取工具列表失败 → 显示错误信息
- 工具列表为空 → 显示「No tools available」

**验收标准**：
- [ ] 展开服务器卡片后显示工具列表
- [ ] 工具名和描述正确显示
- [ ] 服务器角标显示工具数量

### 功能 4：ToolUse 卡片 MCP 来源标注

**描述**：当 Claude 调用 MCP 工具时，`ToolUseBlock` 在工具名旁显示来源服务器。

**交互逻辑**：
- MCP 工具调用的 `toolUse` 事件中包含 `server_name` 字段（或通过工具名前缀判断）
- `ToolUseBlock.tsx` 中对 MCP 工具显示 `[server_name]` 角标
- 角标使用不同颜色区分 MCP 工具和内置工具

**边界条件**：
- 工具名在已知内置工具列表中（Bash/Read/Write/Edit/Glob/Grep/WebFetch/WebSearch）→ 不显示来源标注
- `server_name` 字段不存在 → 不显示标注

**验收标准**：
- [ ] MCP 工具调用显示来源服务器名称
- [ ] 内置工具不显示来源标注
- [ ] 来源标注视觉上与内置工具有区分

## 非功能需求

- **性能**：MCP 服务器列表加载应在 200ms 内完成；工具列表获取允许 5 秒超时
- **安全**：MCP 添加向导中的 env 变量值不在日志中打印；删除操作需确认
- **可访问性**：向导步骤支持 Tab 导航，每步有 aria-label
- **兼容性**：Windows / macOS / Linux

## 成功指标

- 用户无需编辑 JSON 即可添加和管理 MCP 服务器
- MCP 工具调用在聊天中有清晰的来源标识
- 服务器连接问题可通过重连按钮快速解决

## 优先级

- **P0**：MCP 添加向导 + 删除操作（核心 CRUD）
- **P0**：工具列表展示（验证连接成功的关键反馈）
- **P1**：重连操作 + ToolUse 来源标注
- **P2**：测试连接功能（Step 3）

## 涉及文件

| 文件路径 | 操作 | 说明 |
|---------|------|------|
| `src/main/ipc/index.ts` | 修改 | 注册 `mcp:add`、`mcp:remove`、`mcp:reconnect`、`mcp:getTools` handler |
| `src/preload/index.ts` | 修改 | 暴露 4 个新 MCP API |
| `src/renderer/components/settings/SettingsMcp.tsx` | 大幅修改 | 升级为完整管理面板（或重命名为 MCPManagerPanel） |
| `src/renderer/components/chat/ToolUseBlock.tsx` | 修改 | 新增 MCP 来源标注 |
| `i18n/locales/en.json` | 修改 | 新增 MCP 管理相关翻译键 |
| `i18n/locales/zh-CN.json` | 修改 | 新增 MCP 管理相关翻译键 |

## 后端需求

本功能涉及 4 个新 IPC handler，需 aipa-backend 或 aipa-frontend 在主进程实现：

1. **`mcp:add`**：接受 `{ name, type, config }` 参数
   - 读取 `~/.claude/settings.json`
   - 在 `mcpServers` 节点写入新服务器配置
   - stdio 格式：`{ "command": "...", "args": [...], "env": {...} }`
   - HTTP/SSE 格式：`{ "url": "...", "headers": {...} }`
   - 原子写入（writeFileSync 到 tmp + renameSync）

2. **`mcp:remove`**：接受 `{ name }` 参数
   - 从 `mcpServers` 节点删除指定服务器
   - 原子写入

3. **`mcp:reconnect`**：接受 `{ name }` 参数
   - 实现方案：通过 PTY 发送 `/mcp` 命令，或重启包含该 MCP 的 StreamBridge
   - 返回重连结果（成功/失败+错误信息）

4. **`mcp:getTools`**：接受 `{ name }` 参数
   - 从 CLI 读取指定 MCP 服务器的工具列表
   - 返回 `{ tools: { name: string; description: string }[] }`
   - 实现方案：通过 CLI 的 `--print` 模式发送查询，或直接读取 MCP 服务器元数据

## 冲突分析

| 冲突资源 | 冲突方 | 策略 |
|---------|--------|------|
| `src/main/ipc/index.ts` | prd-permissions-ui, prd-hooks-ui | **串行执行**：本 PRD 新增 mcp:* handler，与 permissions/hooks 的 config:* handler 互不冲突 |
| `src/preload/index.ts` | prd-permissions-ui, prd-hooks-ui | **串行执行**：追加新 API，不修改已有 |
| `ToolUseBlock.tsx` | prd-actionable-codeblocks | 修改位置不同（新增 MCP 标注 vs CodeBlock 操作），可并行 |
| `i18n/locales/*.json` | 所有 PRD | **i18n 条目需由 leader 统一合并** |
| `SettingsMcp.tsx` | 无已知冲突 | 独立大幅修改 |

## 依赖与风险

| 依赖项 | 负责方 | 风险等级 |
|--------|--------|----------|
| `~/.claude/settings.json` mcpServers 格式 | CLI 团队 | 低 — 格式已稳定 |
| MCP 工具列表获取机制 | 工程 | 中 — 需研究 CLI 如何暴露 MCP 工具列表 |
| mcp:reconnect 实现路径 | 工程 | 中 — PTY /mcp 命令 vs 重启 bridge 需要评估 |

## 开放问题

- [ ] `mcp:getTools` 最佳实现方式？直接 MCP 协议交互 vs 通过 CLI 间接获取
- [ ] `mcp:reconnect` 是否需要重启整个 StreamBridge？还是可以热重连单个 MCP 服务器
- [ ] MCP 工具调用的 toolUse 事件是否包含 `server_name` 字段？需要检查 stream-json 输出格式

## 执行顺序建议

1. **P0 - 后端 IPC**（`mcp:add` + `mcp:remove` + `mcp:getTools`）
2. **P0 - SettingsMcp 升级**（添加向导 + 删除 + 工具列表展示）
3. **P1 - mcp:reconnect**（重连机制）
4. **P1 - ToolUseBlock 来源标注**（需先确认 toolUse 事件格式）

本 PRD 可与 prd-permissions-ui 并行执行（操作不同文件），但需注意 `ipc/index.ts` 和 `preload/index.ts` 的串行写入。
