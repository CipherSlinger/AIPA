# PRD: 工具过滤（Tool Access Control）

_版本：v1 | 状态：Draft | PM：aipa-pm | 日期：2026-04-07_

## 一句话定义

让用户通过设置页控制 Claude 可以使用哪些内置工具，提供「只读模式」「无网络」等预设方案，通过 CLI 的 `--allowedTools` / `--disallowedTools` 参数实现精确的工具访问控制。

## 背景与动机

Claude Code CLI 支持 `--allowedTools` 和 `--disallowedTools` 参数来限制 AI 可用的工具集，但 AIPA 尚未将此能力暴露给用户。在以下场景中，工具过滤是刚需：

1. **安全审查**：审查敏感代码时，禁止 Claude 执行 Bash 命令或写入文件，避免意外修改
2. **只读分析**：让 Claude 只分析代码但不做任何修改（禁用 Write/Edit/Bash）
3. **离线模式**：在无网络环境下禁用 WebFetch/WebSearch，避免请求超时卡顿
4. **教学场景**：限制 Claude 只能读文件和解释代码，不能直接修改

此功能属于 Superpower Integration Plan Phase 4.5，与 prd-permissions-ui 互补——权限规则管理是"如何使用工具"，工具过滤是"能否使用工具"。

## 目标用户

**主要**：开发者——需要在不同场景下限制 Claude 的操作权限
**次要**：团队 Lead——想为团队成员设置安全基线

## 用户故事

作为一个在生产环境中使用 AIPA 审查代码的开发者，
我希望能一键切换到「只读模式」禁止所有写操作，
以便安全地让 Claude 分析代码而不担心意外修改。

## 功能范围

### In Scope（本版本包含）

1. **工具开关列表**：设置页列出所有 CLI 内置工具，每个工具一个开关
2. **预设方案**：「只读模式」「无网络」等预设一键应用
3. **CLI 参数注入**：将过滤配置注入 StreamBridge 的 `--allowedTools` / `--disallowedTools` 参数
4. **状态指示**：StatusBar 或 ChatHeader 显示当前工具过滤状态

### Out of Scope（本版本不包含，说明原因）

- **MCP 工具过滤**：MCP 工具的启用/禁用已在 `SettingsMcp.tsx` 中处理，本 PRD 仅覆盖 CLI 内置工具
- **按项目/会话配置**：不同项目不同工具配置——复杂度高，v2
- **工具参数级过滤**：例如"允许 Bash 但只能执行 git 命令"——由 permissions 规则覆盖
- **工具使用配额**：限制某个工具的最大使用次数——低需求，v2

## 功能详述

### 功能 1：工具开关列表

**描述**：在设置页新增「Tools」区域（可放在 Advanced Tab 或独立 Tab），列出所有 CLI 内置工具，每个工具一个 Toggle 开关。

**交互逻辑**：
- 工具列表（按功能分组）：
  - **执行类**：Bash（Terminal 图标）
  - **文件写入类**：Write、Edit、MultiEdit（FileEdit 图标）
  - **文件读取类**：Read、Glob、Grep、LS（Search 图标）
  - **网络类**：WebFetch、WebSearch（Globe 图标）
  - **其他**：NotebookEdit、TodoRead、TodoWrite
- 每个工具显示：图标 + 工具名 + 简短描述 + Toggle 开关
- Toggle 默认全部开启（不限制任何工具）
- 关闭 Toggle → 该工具加入 `disallowedTools` 列表
- 配置持久化到 electron-store（`prefs.disallowedTools: string[]`）

**边界条件**：
- 禁用所有工具 → 警告提示「All tools disabled. Claude can only chat without taking actions.」
- 工具名变更（CLI 更新）→ 无效的 disallowedTools 条目被 CLI 自动忽略

**验收标准**：
- [ ] 设置页显示所有内置工具列表，每个有 Toggle 开关
- [ ] 关闭 Toggle 后工具加入禁用列表
- [ ] 配置持久化，下次启动仍生效
- [ ] 禁用所有工具时显示警告

### 功能 2：预设方案

**描述**：工具列表上方提供预设按钮，一键应用常见工具过滤方案。

**交互逻辑**：
- 预设列表（水平排列的 Chip 按钮）：
  1. **All Tools**（默认）：全部启用
  2. **Read Only**：禁用 Bash、Write、Edit、MultiEdit、NotebookEdit（仅保留读和搜索）
  3. **No Network**：禁用 WebFetch、WebSearch
  4. **Analysis Only**：仅保留 Read、Glob、Grep、LS（纯分析，无执行）
- 点击预设 → 批量设置 Toggle 状态
- 当前生效的预设高亮显示
- 用户手动调整 Toggle 后，预设标识消失（变为 "Custom"）

**边界条件**：
- 预设名称国际化
- 用户在预设基础上微调 → 不影响预设按钮功能

**验收标准**：
- [ ] 显示 4 个预设按钮
- [ ] 点击预设批量设置工具开关
- [ ] 当前预设高亮显示
- [ ] 手动调整后标识变为 Custom

### 功能 3：CLI 参数注入

**描述**：将工具过滤配置注入 StreamBridge 的 CLI 启动参数。

**交互逻辑**：
- `CliSendMessageArgs` 增加 `disallowedTools?: string[]` 字段
- `stream-bridge.ts` 的 `sendMessage` 方法中：
  - 若 `disallowedTools` 非空 → 注入 `--disallowedTools Bash,Write,Edit,...`（逗号分隔）
- renderer 在调用 `cliSendMessage` 时从 prefsStore 读取 `disallowedTools`

**边界条件**：
- `disallowedTools` 为空数组 → 不传递参数（等同于全部允许）
- CLI 不认识某个工具名 → CLI 自行忽略

**验收标准**：
- [ ] 禁用工具后，CLI 接收到 `--disallowedTools` 参数
- [ ] 禁用的工具在会话中不可被 Claude 调用
- [ ] 全部允许时不传递参数

### 功能 4：状态指示

**描述**：当工具过滤非默认（即有工具被禁用）时，在 ChatHeader 或 StatusBar 显示提示。

**交互逻辑**：
- 若 `disallowedTools` 非空 → StatusBar 显示 Shield 图标 + 文字（如 "Read Only" 或 "3 tools disabled"）
- 点击 → 弹出浮层显示当前禁用的工具列表 + 「Manage」链接（跳转设置页）

**边界条件**：
- 全部允许 → 不显示任何提示
- 仅禁用 1 个工具 → 显示 "1 tool disabled"

**验收标准**：
- [ ] 有工具被禁用时 StatusBar 显示提示
- [ ] 提示可点击展开详情
- [ ] 全部允许时无提示

## 非功能需求

- **性能**：无额外性能开销，仅增加 CLI 启动参数
- **安全**：工具过滤是安全增强功能，应默认全部允许，避免影响新用户体验
- **可访问性**：工具列表支持 Tab 键导航，Toggle 有 aria-label
- **兼容性**：Windows / macOS / Linux

## 成功指标

- 用户可通过预设方案 2 秒内切换工具访问模式
- 只读模式下 Claude 不执行任何写操作
- 工具过滤配置在下次启动后仍生效

## 优先级

- **P0**：工具开关列表 + CLI 参数注入（核心功能闭环）
- **P1**：预设方案
- **P2**：状态指示（StatusBar 提示）

## 涉及文件

| 文件路径 | 操作 | 说明 |
|---------|------|------|
| `src/main/pty/stream-bridge.ts` | 修改 | CliSendMessageArgs 增加 disallowedTools，注入 CLI 参数 |
| `src/renderer/components/settings/SettingsAdvanced.tsx` | 修改 | 新增 Tool Access Control 区域（若 Advanced Tab 已由 prd-system-prompt 创建）|
| `src/renderer/components/settings/SettingsPanel.tsx` | 修改 | 若 Advanced Tab 未创建，新增；否则复用 |
| `src/renderer/store/index.ts` | 修改 | prefsStore 增加 disallowedTools: string[] |
| `src/renderer/hooks/useStreamJson.ts` | 修改 | 发送消息时注入 disallowedTools 参数 |
| `src/renderer/components/chat/ChatHeader.tsx` 或 StatusBar | 修改 | 工具过滤状态指示 |
| `i18n/locales/en.json` | 修改 | 新增 toolFilter 相关翻译键 |
| `i18n/locales/zh-CN.json` | 修改 | 新增 toolFilter 相关翻译键 |

## 后端需求

本功能的后端修改量较��：

1. **`stream-bridge.ts` 参数扩展**：
   - `CliSendMessageArgs` 增加 `disallowedTools?: string[]`
   - `sendMessage` 方法中将其注入 `--disallowedTools tool1,tool2,...` 参数
   - 这是 Superpower Plan P0-2（CLI 启动参数统一管理）的一部分

2. **无需新增 IPC**：工具过滤配置通过 electron-store 的 `prefs:set/get` 管理

## 冲突分析

| 冲突资源 | 冲突方 | 策略 |
|---------|--------|------|
| `stream-bridge.ts` | prd-system-prompt, prd-effort-control | **串行执行**：每个 PRD 各自向 CliSendMessageArgs 增加新字段 |
| `SettingsAdvanced.tsx` | prd-system-prompt | **串行执行**：prd-system-prompt 先创建 Advanced Tab，本 PRD 在其中新增 Tool Access Control 区域 |
| `store/index.ts` | 多个 PRD | prefsStore 增加字段（低冲突） |
| `useStreamJson.ts` | prd-system-prompt | 串行：各自追加不同参数 |
| `i18n/locales/*.json` | 所有 PRD | **i18n 条目需由 leader 统一合并** |

**关键依赖**：
- **必须在 prd-system-prompt 之后执行**（复用 Advanced Tab 和 SettingsAdvanced.tsx）
- **必须在 prd-permissions-ui 之后执行**（若决定将工具过滤放在 Permissions Tab 而非 Advanced Tab）

## 依赖与风险

| 依赖项 | 负责方 | 风险等级 |
|--------|--------|----------|
| CLI `--disallowedTools` 参数 | CLI 团队 | 低 — 参数已稳定 |
| stream-bridge CliSendMessageArgs 扩展 | 工程 | 低 — 增加一个可选字段 |
| prd-system-prompt (Advanced Tab) | PM pipeline | 中 — 本 PRD 依赖 Advanced Tab 已创建 |
| permissions 规则优先级 | CLI 内部 | 低 — disallowedTools 与 permissions 规则独立作用 |

## 开放问题

- [ ] 工具过滤放在 Advanced Tab 还是 Permissions Tab？建议 Advanced Tab（因为 Permissions Tab 管理的是规则模式匹配，工具过滤是全量开关，逻辑不同）
- [ ] 是否同时支持 `--allowedTools`（白名单模式）？建议 v1 仅支持 `--disallowedTools`（黑名单模式），更符合用户心智模型（默认全开，逐个关闭）
- [ ] CLI 内置工具的完整列表？需要从 CLI 源码确认，避免遗漏

## 执行顺序建议

1. **P0 - stream-bridge 参数扩展**（CliSendMessageArgs + CLI 参数注入）
2. **P0 - 工具开关列表 UI**（SettingsAdvanced.tsx 新增区域）
3. **P1 - 预设方案**（Chips + 批量 Toggle）
4. **P2 - StatusBar 状态指示**

**执行前提**：prd-system-prompt 已完成（Advanced Tab 已存在）。若 prd-system-prompt 尚未完成，本 PRD 需自行创建 Advanced Tab。
