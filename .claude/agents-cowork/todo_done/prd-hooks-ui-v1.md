# PRD: Hooks 配置与执行可视化

_版本：v1 | 状态：Draft | PM：aipa-pm | 日期：2026-04-07_

## 一句话定义

让用户通过图形界面配置 Claude Code 的 Hooks（事件钩子），并在聊天中实时展示 Hook 执行状态，将 CLI 的自动化扩展能力完整暴露给桌面用户。

## 背景与动机

Claude Code 的 Hooks 系统是其最强大的扩展机制之一：用户可以在 28 种生命周期事件（PreToolUse、PostToolUse、Stop、SessionStart 等）上挂载 shell 命令、LLM prompt 或 HTTP 调用，实现自动化工作流（如：每次执行 rm 前运行安全检查脚本、每次提交前自动 lint、会话结束时发送通知）。

当前这些配置只能通过手动编辑 `~/.claude/settings.json` 完成，且 Hook 的执行状态在 AIPA 中完全不可见。这与 AIPA 作为「完整驾驶舱」的定位严重矛盾。

此功能属于 Superpower Integration Plan Phase 2.4。它依赖 Phase 2.3（PRD-1 权限规则 UI）建立的 `config:readCLISettings` / `config:writeCLISettings` IPC。

## 目标用户

**主要**：高级开发者——需要自定义工作流自动化、安全策略、CI/CD 集成的 power user
**次要**：团队 Lead——需要为团队配置统一的代码安全检查 Hook

## 用户故事

作为一个使用 AIPA 进行日常编码的高级开发者，
我希望能在设置页直观地添加和管理 Hooks，并在聊天中看到 Hook 的执行状态，
以便构建自动化工作流（安全检查、代码格式化、通知推送等），无需离开 AIPA 编辑配置文件。

## 功能范围

### In Scope（本版本包含）

1. **Hooks 设置面板**（HooksSettingsPanel）：设置页新增「Hooks」Tab，按事件类型分组展示已配置的 Hook
2. **Hook 添加向导**：选择事件类型 → 选择 Hook 类型（command/prompt/http）→ 填写参数
3. **Hook 删除/编辑**：删除已有 Hook，编辑 Hook 参数
4. **Hook 执行状态卡片**：聊天消息列表中展示 Hook 执行进度和结果

### Out of Scope（本版本不包含，说明原因）

- **Agent 类型 Hook 配置**：`agent` 类型 Hook 参数复杂（model 选择、prompt 设计），v2 迭代
- **Hook 执行日志持久化**：Hook 执行历史的查询和回放——需要独立存储，v2
- **Hook 模板市场**：预置 Hook 模板（lint checker、security scanner 等）——v2 作为增值功能
- **Hook 测试/调试**：在 UI 中模拟触发 Hook 测试——需要 CLI 支持 dry-run，远期

## 功能详述

### 功能 1：Hooks 设置面板（HooksSettingsPanel）

**描述**：设置页新增「Hooks」Tab。面板按事件类型分组（可折叠手风琴），每组显示已配置的 Hook 列表。

**交互逻辑**：
- 进入面板 → 调用 `config:readCLISettings` → 解析 `hooks` 字段
- 事件类型列表按分类分组展示：
  - **工具生命周期**：PreToolUse、PostToolUse、PostToolUseFailure
  - **会话生命周期**：SessionStart、SessionEnd、Stop、StopFailure
  - **用户交互**：UserPromptSubmit、Notification、PermissionRequest、PermissionDenied
  - **上下文管理**：PreCompact、PostCompact
  - **任务系统**：SubagentStart、SubagentStop、TaskCreated、TaskCompleted
  - **高级事件**：Setup、Elicitation、ElicitationResult、ConfigChange、WorktreeCreate、WorktreeRemove、InstructionsLoaded、CwdChanged、FileChanged、TeammateIdle
- 每个事件类型行显示：事件名称 + 已配置 Hook 数量角标 + 展开箭头
- 展开后显示该事件下的 Matcher 列表，每个 Matcher 显示：
  - matcher 条件（如 `Bash`，或无条件）
  - hooks 数组中每个 hook 的类型图标（Terminal=command、MessageSquare=prompt、Globe=http）+ 关键参数预览
  - 删除按钮（每个 hook 独立删除）

**边界条件**：
- 无任何 Hook 配置 → 显示空状态引导「No hooks configured. Hooks let you run custom actions on Claude events.」
- settings.json 中 hooks 字段格式异常 → 显示错误提示，不渲染（避免 crash）
- 事件类型无已配置 Hook → 该行不显示角标，折叠状态显示「No hooks」

**验收标准**：
- [ ] 设置页出现「Hooks」Tab，点击显示 HooksSettingsPanel
- [ ] 正确读取并按事件类型分组展示所有已配置的 Hook
- [ ] 每个 Hook 显示类型图标和关键参数预览
- [ ] 可删除单个 Hook，删除后立即持久化到 settings.json
- [ ] 空状态有引导提示

### 功能 2：Hook 添加向导

**描述**：点击「Add Hook」按钮，弹出添加向导（内联面板或 modal），分步引导用户配置 Hook。

**交互逻辑**：
- **Step 1 - 选择事件**：下拉选择事件类型（带分类分组的 select），每种事件附带一行描述
- **Step 2 - 选择 Hook 类型**：三张卡片选择（command / prompt / http），各附说明
  - command：「Run a shell command」
  - prompt：「Evaluate with LLM」
  - http：「Send HTTP POST request」
- **Step 3 - 填写参数**：根据 Hook 类型显示不同表单
  - **command**：command（必填 textarea）、timeout（可选 number）、shell（可选 select: bash/powershell）、if 条件（可选 input）、statusMessage（可选）
  - **prompt**：prompt（必填 textarea，提示可用 $ARGUMENTS 占位符）、model（可选 input）、if 条件、timeout
  - **http**：url（必填 input，需 URL 格式校验）、headers（可选 key-value 对）、if 条件、timeout
- **Step 4 - 可选 Matcher**：matcher 字段（可选 input，如 `Write` 只匹配写文件工具）
- 点击「Save Hook」→ 写入 settings.json

**边界条件**：
- 必填字段为空 → 「Save」按钮 disabled
- URL 格式不合法 → 输入框下方显示校验错误
- timeout 负数 → 校验提示
- 同一事件已有相同 matcher+hook 配置 → 允许（用户自行管理），但 Toast 提示「Similar hook already exists」

**验收标准**：
- [ ] 添加向导支持 command、prompt、http 三种 Hook 类型
- [ ] 必填字段有校验，不允许保存不完整的配置
- [ ] URL 字段有格式校验
- [ ] 保存后 Hook 出现在对应事件类型的列表中
- [ ] 保存后 settings.json 文件内容正确更新

### 功能 3：Hook 执行状态卡片

**描述**：当 CLI 触发 Hook 执行时，在聊天消息列表中插入一张小型状态卡片，展示 Hook 的执行过程和结果。

**交互逻辑**：
- stream-bridge 新增对 `hook_event` 类型事件的处理：
  - `hook_started`：Hook 开始执行，卡片出现，显示 spinner + 事件名 + Hook 类型
  - `hook_progress`：Hook 执行中的中间输出（如 command 的 stdout）
  - `hook_response`：Hook 执行完成，卡片更新为完成状态
- 卡片 UI：
  - 宽度：消息列表宽度 80%，居中
  - 背景：半透明，区别于普通消息气泡
  - 内容：左侧图标（Zap）+ 事件名 + Hook 类型 + 状态（running/success/error）
  - 折叠展开：默认折叠，点击展开显示详细输出（command stdout、HTTP response 等）
- 卡片不参与消息列表的持久化（仅在当前会话中展示）

**边界条件**：
- CLI 未发送 hook_event 事件（旧版 CLI 或未配置 hooks）→ 不显示任何卡片
- Hook 执行超时 → 卡片状态变为 timeout，显示超时秒数
- Hook 执行错误 → 卡片状态变为 error，显示错误信息，红色边框

**验收标准**：
- [ ] stream-bridge 正确解析 `hook_event` 类型事件并转发到 renderer
- [ ] Hook 执行时聊天中出现状态卡片，显示事件名和 Hook 类型
- [ ] Hook 完成后卡片更新为 success/error 状态
- [ ] 卡片可折叠/展开查看详细输出
- [ ] 未配置 Hooks ��不显示任何卡片

## 非功能需求

- **性能**：Hook 配置面板加载不超过 200ms；状态卡片渲染不阻塞消息列表滚动
- **安全**：command 类型 Hook 的命令内容在卡片中完整展示（用户配置的，不需隐藏），但 HTTP hook 的 headers 中的 token 值掩码展示（`Bearer ****`）
- **可访问性**：向导步骤可键盘导航（Tab/Enter）；卡片有 aria-label 描述当前状态
- **兼容性**：依赖 CLI 版本支持 stream-json 中的 `hook_event` 事件——如不支持则功能 3 静默降级

## 成功指标

- 用户可通过 UI 完成 Hook 全生命周期管理（添加、查看、删除），无需编辑文件
- Hook 执行时用户能在聊天中看到进度，理解 Claude 的行为
- 设置页 Hook 配置与 `~/.claude/settings.json` 文件内容双向同步

## 优先级

- **P0**：HooksSettingsPanel 基本展示和删除
- **P0**：Hook 添加向导（command 类型优先）
- **P1**：Hook 添加向导（prompt、http 类型）
- **P1**：Hook 执行状态卡片
- **P2**：HTTP hook headers 掩码、卡片折叠展开

## 涉及文件

| 文件路径 | 操作 | 说明 |
|---------|------|------|
| `src/main/pty/stream-bridge.ts` | 修改 | handleStreamEvent 新增 `hook_event` case |
| `src/main/ipc/index.ts` | 修改 | 注册 `cli:hookEvent` 推送事件转发（在 registerCliHandlers 中） |
| `src/preload/index.ts` | 修改 | onCliEvent channels 数组添加 `cli:hookEvent` |
| `src/renderer/components/settings/HooksSettingsPanel.tsx` | 新建 | Hooks 配置管理面板 |
| `src/renderer/components/settings/HookAddWizard.tsx` | 新建 | Hook 添加向导组件 |
| `src/renderer/components/chat/HookProgressCard.tsx` | 新建 | Hook 执行状态卡片 |
| `src/renderer/components/settings/SettingsPanel.tsx` | 修改 | 新增 `hooks` Tab |
| `src/renderer/store/chatStore.ts` | 修改 | 新增 hookEvents 状态追踪 |
| `i18n/locales/en.json` | 修改 | 新增 hooks 相关翻译键 |
| `i18n/locales/zh-CN.json` | 修改 | 新增 hooks 相关翻译键 |

## 后端需求

1. **stream-bridge.ts 扩展**：在 `handleStreamEvent` 的 switch 中新增 `hook_event` case：
   - 解析事件子类型：`hook_started`、`hook_progress`、`hook_response`
   - emit 对应事件到 `cli:hookEvent` channel
   - 事件数据结构：`{ sessionId, hookEvent, hookType, eventType, data }`

2. **IPC 转发**：在 `registerCliHandlers` 中，将 bridge 的 `hookEvent` emit 转发为 `win.webContents.send('cli:hookEvent', data)`

3. **复用 PRD-1 IPC**：`config:readCLISettings` / `config:writeCLISettings` 已在 PRD-1 中建立，本 PRD 直接使用。写入时操作 `hooks` 字段。

## 冲突分析

| 冲突资源 | 冲突方 | 策略 |
|---------|--------|------|
| `src/main/ipc/index.ts` | PRD-1 (Permissions UI) | **必须在 PRD-1 之后执行**：PRD-1 建立 readCLISettings/writeCLISettings IPC |
| `src/preload/index.ts` | PRD-1 | 串行执行，PRD-1 先添加 config API，本 PRD 仅添加 hookEvent channel |
| `src/main/pty/stream-bridge.ts` | PRD-3 (Diff View) 无冲突 | stream-bridge 仅本 PRD 修改 |
| `SettingsPanel.tsx` | PRD-1 | 串行执行：PRD-1 加 permissions Tab，本 PRD 加 hooks Tab |
| `i18n/locales/*.json` | PRD-1, PRD-3 | **i18n 条目需由 leader 统一合并** |
| `chatStore.ts` | PRD-3 (Diff View) | 不同字段（hookEvents vs changedFiles），冲突风险低 |

## 依赖与风险

| 依赖项 | 负责方 | 风险等级 |
|--------|--------|----------|
| PRD-1 `config:readCLISettings` / `config:writeCLISettings` | 工程 | 高 — 硬依赖，必须先完成 |
| CLI stream-json 中 hook_event 事件格式 | CLI 团队 | 中 — 需确认 CLI 当前版本是否在 stream-json 模式下发送 hook_event |
| Hook 事件类型完整列表稳定性 | CLI 团队 | 低 — 28 种事件已在 SDK 中定义稳定 |

## 开放问题

- [ ] CLI 当前 stream-json 输出是否包含 `hook_event` 类型？需验证。如不包含，功能 3 推迟到 CLI 支持后
- [ ] 是否需要支持 `once` 字段的 UI 展示（一次性 Hook 标记）？建议 v1 支持展示，v2 支持设置
- [ ] `async` / `asyncRewake` 字段是否在 UI 中暴露？建议 v1 仅展示，不支持配置

## 执行顺序建议

1. **P0 - HooksSettingsPanel 展示和删除**（依赖 PRD-1 的 IPC 已就绪）
2. **P0 - HookAddWizard command 类型**（最常用的 Hook 类型）
3. **P1 - HookAddWizard prompt/http 类型**（扩展向导）
4. **P1 - HookProgressCard**（需要 stream-bridge 扩展）
5. **P2 - 体验优化**（掩码、折叠、动画）

**与 PRD-1 的串行关系**：本 PRD **必须在 PRD-1 之后执行**。PRD-1 建立的 `config:readCLISettings` / `config:writeCLISettings` IPC 是本 PRD 的硬依赖。建议 leader 调度时将 PRD-1 和 PRD-2 分配给同一个 frontend，保证执行顺序。
