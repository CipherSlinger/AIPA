# PRD: 权限规则管理 UI

_版本：v1 | 状态：Draft | PM：aipa-pm | 日期：2026-04-07_

## 一句话定义

让用户通过图形界面管理 Claude Code 的权限规则（allow/deny），并在权限弹窗中一键「始终允许/拒绝」，不再需要手动编辑 `~/.claude/settings.json`。

## 背景与动机

Claude Code CLI 通过 `~/.claude/settings.json` 中的 `permissions.allow` / `permissions.deny` 数组管理工具权限规则。当前 AIPA 用户每次遇到权限弹窗（permissionRequest）只能选择「本次允许」或「本次拒绝」，无法持久化决策。要配置永久规则，必须手动编辑 JSON 文件——这对非技术用户完全不可接受，对开发者也是不必要的摩擦。

此功能属于 Superpower Integration Plan Phase 2.3，是 AIPA 成为 Claude Code 完整图形驾驶舱的关键拼图。同时，它是 Phase 2.4 Hooks UI 的前置依赖（共享 `config:readCLISettings` / `config:writeCLISettings` IPC）。

## 目标用户

**主要**：开发者——频繁使用 Bash、FileEdit 等工具，需要为常用操作配置自动放行规则
**次要**：知识工作者——不理解工具权限概念，需要一键操作降低弹窗干扰

## 用户故事

作为一个每天使用 AIPA 进行编码的开发者，
我希望能在权限弹窗中一键「始终允许 git 命令」，并在设置页管理已有规则，
以便减少重复确认弹窗，提高工作流效率。

## 功能范围

### In Scope（本版本包含）

1. **settings.json 读写 IPC**（P0-3 基础设施）：新增 `config:readCLISettings` / `config:writeCLISettings` IPC 通道
2. **权限规则设置面板**（PermissionsSettingsPanel）：设置页新增「Permissions」Tab
3. **权限弹窗快捷按钮**：现有权限弹窗增加「Always Allow」「Always Deny」按钮
4. **规则格式说明**：面板内提供规则语法说明提示（tooltip / help text）

### Out of Scope（本版本不包含，说明原因）

- **项目级权限**（`.claude/settings.json` per-project）：需要 working directory 上下文管理，复杂度高，v2 迭代
- **规则优先级可视化**：allow 与 deny 冲突时的优先级展示——CLI 内部逻辑处理，UI 无需干预
- **权限规则导入/导出**：低频需求，可后续合并到 Backup & Restore
- **`ask` 行为规则**：CLI 支持 `ask` 类型规则但使用场景极少，暂不在 UI 中暴露

## 功能详述

### 功能 1：settings.json 读写 IPC（后端基础设施）

**描述**：在主进程新增两个 IPC handler，支持读写 `~/.claude/settings.json`。此为 Phase 0-3 基础设施，Hooks UI（PRD-2）也将复用。

**交互逻辑**：
- `config:readCLISettings`：读取 `~/.claude/settings.json`，如文件不存在返回空对象 `{}`
- `config:writeCLISettings`：接受一个 patch 对象，使用 merge 语义写入。仅允许修改 `permissions` 和 `hooks` 顶层字段。写入前校验 JSON 合法性。

**边界条件**：
- 文件不存在 → `readCLISettings` 返回 `{}`，`writeCLISettings` 自动创建文件
- 文件内容为非法 JSON → 返回错误，不覆写
- patch 包含 `mcpServers` 等受保护字段 → 忽略该字段，仅写入允许的字段，日志记录警告
- 并发写入（两个 renderer 窗口同时写）→ 使用文件锁（写前读、merge、原子写入）

**验收标准**：
- [ ] `config:readCLISettings` 正确读取 `~/.claude/settings.json` 并返回 JSON 对象
- [ ] `config:writeCLISettings` 以 merge patch 方式更新文件，不丢失无关字段
- [ ] 写入 `mcpServers` 字段时被过滤，不影响文件中已有的 `mcpServers` 配置
- [ ] 文件不存在时可正常创建并写入

### 功能 2：权限规则设置面板（PermissionsSettingsPanel）

**描述**：设置页新增「Permissions」Tab，展示和管理 `permissions.allow` / `permissions.deny` 规则列表。

**交互逻辑**：
- 进入设置页 → 加载 `config:readCLISettings` → 解析 `permissions.allow` 和 `permissions.deny` 数组
- 界面分上下两个区域：「Allow Rules」和「Deny Rules」，各自展示规则列表
- 每条规则显示为一行，格式如 `Bash(git *)` 或 `Read`（无参数），右侧有删除按钮（X）
- 「Add Rule」按钮：打开内联输入行，用户输入规则字符串（如 `Bash(npm install *)`），按 Enter 或点确认添加
- 添加/删除操作 → 立即调用 `config:writeCLISettings` 持久化
- 每个区域下方显示帮助文本：「Format: ToolName or ToolName(pattern). Examples: Bash(git *), Read(**/*.ts), Write」

**边界条件**：
- 用户输入空字符串 → 忽略，不添加
- 用户输入重复规则 → Toast 提示「Rule already exists」，不添加
- 规则包含特殊字符（括号）→ 按 CLI 的 escapeRuleContent 规则正确处理
- allow 和 deny 中有同一规则 → 允许（CLI 自行处理优先级），但展示时加注意图标

**验收标准**：
- [ ] 设置页出现「Permissions」Tab，点击显示 PermissionsSettingsPanel
- [ ] 正确读取并展示 `permissions.allow` 和 `permissions.deny` 列表
- [ ] 可添加新规则（allow 或 deny），添加后立即持久化到 `~/.claude/settings.json`
- [ ] 可删除已有规则，删除后立即持久化
- [ ] 空状态显示引导提示「No permission rules configured. Rules let you auto-allow or deny specific tool actions.」

### 功能 3：权限弹窗快捷按钮

**描述**：现有权限请求弹窗（在 chatStore 中以 `PermissionMessage` 形式展示，用户点击 Allow/Deny）增加两个快捷按钮：「Always Allow」和「Always Deny」。

**交互逻辑**：
- 权限弹窗展示当前请求的 toolName 和 toolInput
- 原有按钮保持不变：「Allow」（本次允许）、「Deny」（本次拒绝）
- 新增按钮区域（secondary actions）：
  - 「Always Allow This Tool」→ 自动将 `toolName` 写入 `permissions.allow`（如工具是 Bash 且 input 包含命令，则写入 `Bash(command_pattern *)`）
  - 「Always Deny This Tool」→ 自动将 `toolName` 写入 `permissions.deny`
- 写入规则后，同时响应当前权限请求（allow 或 deny）
- 规则粒度：
  - 默认按工具名写入（如 `Bash`、`Write`、`Read`）
  - 如果 toolInput 中有 `command` 字段（Bash 工具），提取命令前缀构造更精确的规则（如 `Bash(git *)` ）

**边界条件**：
- 快捷按钮点击后 → Toast 提示「Rule added: Bash(git *) → always allow」
- 规则已存在 → 仍然响应当前请求，不重复添加规则
- `config:writeCLISettings` 调用失败 → 仍然响应当前请求（仅本次），Toast 提示保存失败

**验收标准**：
- [ ] 权限弹窗显示「Always Allow」和「Always Deny」按钮
- [ ] 点击「Always Allow」后，规则被写入 `~/.claude/settings.json` 的 `permissions.allow`
- [ ] 点击「Always Deny」后，规则被写入 `permissions.deny`
- [ ] 写入后 Toast 确认提示显示具体规则内容
- [ ] 后续相同工具调用不再弹出权限请求（由 CLI 自动处理）

## 非功能需求

- **性能**：`readCLISettings` 读取文件应在 50ms 内完成；`writeCLISettings` 原子写入（先写 tmp 再 rename）
- **安全**：写入时过滤受保护字段（`mcpServers`、`env` 等），仅允许修改 `permissions` 和 `hooks`
- **可访问性**：规则列表项支持键盘导航（Tab/Enter/Delete），弹窗快捷按钮有 aria-label
- **兼容性**：Windows / macOS / Linux，`~/.claude/settings.json` 路径通过 `os.homedir()` 解析

## 成功指标

- 用户无需手动编辑 JSON 即可管理权限规则
- 权限弹窗快捷按钮使用后，后续同类工具调用自动通过
- 设置页规则列表与 `~/.claude/settings.json` 文件内容保持同步

## 优先级

- **P0**：`config:readCLISettings` / `config:writeCLISettings` IPC（后续 PRD 依赖）
- **P0**：PermissionsSettingsPanel 基本 CRUD
- **P1**：权限弹窗 Always Allow/Deny 快捷按钮
- **P2**：规则语法帮助文本和冲突提示

## 涉及文件

| 文件路径 | 操作 | 说明 |
|---------|------|------|
| `src/main/config/cli-settings-manager.ts` | 新建 | settings.json 读写逻辑，字段白名单校验 |
| `src/main/ipc/index.ts` | 修改 | 注册 `config:readCLISettings` / `config:writeCLISettings` handler |
| `src/preload/index.ts` | 修改 | 暴露 `configReadCLISettings` / `configWriteCLISettings` API |
| `src/renderer/components/settings/PermissionsSettingsPanel.tsx` | 新建 | 权限规则管理面板 |
| `src/renderer/components/settings/SettingsPanel.tsx` | 修改 | 新增 `permissions` Tab |
| `src/renderer/hooks/useStreamJson.ts` | 修改 | 权限弹窗快捷按钮调用 writeCLISettings |
| `i18n/locales/en.json` | 修改 | 新增 permissions 相关翻译键 |
| `i18n/locales/zh-CN.json` | 修改 | 新增 permissions 相关翻译键 |

## 后端需求

本功能涉及主进程修改，需 aipa-backend 或 aipa-frontend 实现：

1. **新建 `cli-settings-manager.ts`**：封装 `~/.claude/settings.json` 的读写逻辑
   - `readCLISettings()`: 读取并 parse JSON，文件不存在返回 `{}`
   - `writeCLISettings(patch)`: merge patch 写入，白名单字段过滤，原子写入（writeFileSync 到 tmp + renameSync）
   - 白名单字段：`permissions`、`hooks`（后续 PRD 扩展）

2. **注册 IPC handler**：在 `registerConfigHandlers()` 中新增两个 `safeHandle` 调用

## 冲突分析

| 冲突资源 | 冲突方 | 策略 |
|---------|--------|------|
| `src/main/ipc/index.ts` | PRD-2 (Hooks UI) | **串行执行**：本 PRD 先执行，建立 `readCLISettings/writeCLISettings` IPC；PRD-2 复用 |
| `src/preload/index.ts` | PRD-2 (Hooks UI) | **串行执行**：本 PRD 先暴露 API；PRD-2 无需重复添加 |
| `i18n/locales/*.json` | PRD-2, PRD-3 | **i18n 条目需由 leader 统一合并** |
| `SettingsPanel.tsx` | PRD-2 (Hooks UI) | **串行执行**：本 PRD 加 `permissions` Tab，PRD-2 加 `hooks` Tab |

## 依赖与风险

| 依赖项 | 负责方 | 风险等级 |
|--------|--------|----------|
| CLI settings.json 格式稳定性 | CLI 团队 | 低 — 格式已稳定多个版本 |
| 权限弹窗现有实现 | 工程 | 低 — 已有完整的 permissionRequest 流程 |
| 文件并发写入 | 工程 | 中 — 需要原子写入防止数据丢失 |

## 开放问题

- [ ] 是否需要支持项目级 settings（`.claude/settings.json` in project root）？建议 v2
- [ ] 规则语法是否需要前端侧验证？建议仅做基本格式检查（包含工具名），详细校验交给 CLI

## 执行顺序建议

1. **P0 - cli-settings-manager + IPC**（先做基础设施，PRD-2 也依赖）
2. **P0 - PermissionsSettingsPanel**（设置页面板）
3. **P1 - 权限弹窗快捷按钮**（增强现有弹窗）
4. **P2 - 帮助文本和冲突提示**（体验优化）
