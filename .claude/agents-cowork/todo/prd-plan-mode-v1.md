# PRD: Plan Mode — 规划模式切换

_版本：v1 | 状态：Draft | PM：aipa-pm | 日期：2026-04-07_

---

## 一句话定义

为 AIPA 添加 Plan Mode 开关，让用户控制 Claude 是"仅规划不执行"还是"规划+执行"，通过 CLI 的 `/plan` slash command 实现模式切换，并在 UI 上提供明显的视觉反馈。

## 背景与动机

Claude Code CLI 原生支持 Plan Mode：
- 用户输入 `/plan` 进入 Plan Mode（Claude 只输出计划，不执行任何工具调用）
- 再次输入 `/plan` 退出 Plan Mode
- Plan Mode 对于复杂任务的预览和审查非常有价值

当前 AIPA 完全没有暴露 Plan Mode 功能。用户如果想让 Claude 先规划再执行，只能在输入中手动写"先列出计划，不要执行"这样的提示词，既不方便也不可靠。

CLI 内部通过 `EnterPlanModeTool` / `ExitPlanModeTool` 工具实现 Plan Mode 切换，但这些是 AI 自主调用的工具（不是用户可以直接触发的）。用户侧的入口是 `/plan` slash command。AIPA 应通过 PTY write 或消息发送路径向 CLI 发送 `/plan` 命令。

## 目标用户

**主要**：开发者用户 — 在执行复杂重构、多文件修改前，希望先看到完整计划再批准执行。
**次要**：谨慎型用户 — 不希望 AI 自动执行操作，希望逐步审查和确认。

## 用户故事

作为一个谨慎的开发者，
我希望能一键切换到 Plan Mode，让 Claude 只输出修改计划而不实际执行，
以便在批准执行前充分审查计划的合理性和影响范围。

---

## 功能范围

### In Scope（本版本包含）

1. **ChatInput 工具栏 Plan Mode 开关** — 切换按钮，明确的开/关状态
2. **Plan Mode 视觉指示** — 激活时输入框边框变色 + 标识文字
3. **通过 `/plan` 命令切换** — 发送 `/plan` slash command 实现模式切换
4. **StatusBar Plan Mode 状态** — 显示当前是否在 Plan Mode

### Out of Scope（本版本不包含）

- Plan Mode 下的计划审批工作流（如"批准执行此计划"按钮）— 属于高级功能，推迟到 v2
- 计划版本对比（多个计划方案的 diff 对比）— 复杂度过高
- 通过 EnterPlanModeTool/ExitPlanModeTool 直接切换（这些是 AI 工具，不是用户可触发的）— 使用 `/plan` slash command 更直接

---

## 功能详述

### 1. ChatInput 工具栏 Plan Mode 开关

**描述**：在 InputToolbar 中新增一个 Plan Mode 切换按钮。

**交互逻辑**：
- 按钮图标使用 `ClipboardList` 或 `Lightbulb` 或 `Map`（表达"规划"语义）
- 默认状态（Plan Mode OFF）：按钮普通样式，tooltip 显示"进入 Plan Mode"
- 激活状态（Plan Mode ON）：按钮高亮（紫色/蓝色背景），tooltip 显示"退出 Plan Mode"
- 点击切换：
  - 如果当前不在 Plan Mode：发送 `/plan` 命令到 CLI，将 `isPlanMode` 设为 true
  - 如果当前在 Plan Mode：发送 `/plan` 命令到 CLI，将 `isPlanMode` 设为 false
- `/plan` 通过已有的消息发送路径（`onSend('/plan')`）发送

**边界条件**：
- 流式响应进行中时不能切换 Plan Mode（按钮禁用）
- 新会话开始时 `isPlanMode` 重置为 false
- 如果 CLI 对 `/plan` 命令返回错误，回退状态

**验收标准**：
- [ ] InputToolbar 中显示 Plan Mode 切换按钮
- [ ] 点击发送 `/plan` 命令并切换本地状态
- [ ] 按钮在 Plan Mode ON 时明显高亮
- [ ] 流式响应进行中按钮禁用

### 2. Plan Mode 视觉指示

**描述**：当 Plan Mode 激活时，在 ChatInput 区域提供明显的视觉提示。

**交互逻辑**：
- Plan Mode ON 时：
  - ChatInput 的 textarea 外边框变为紫色/���色（2px solid）
  - textarea 上方显示一行标识文字："Plan Mode - Claude will only plan, not execute"
  - 标识行背景为浅紫色/蓝色半透明
  - 标识行右侧有一个小 "x" 按钮可直接退出 Plan Mode
- Plan Mode OFF 时：
  - 恢复正常边框
  - 标识行隐藏

**边界条件**：
- 视觉指示不应影响 textarea 的高度计算和自动扩展

**验收标准**：
- [ ] Plan Mode ON 时 textarea 边框变为紫色/蓝色
- [ ] Plan Mode ON 时显示标识文字条
- [ ] 标识条上的 "x" 按钮可退出 Plan Mode
- [ ] 不影响 textarea 的正常功能

### 3. StatusBar Plan Mode 状态

**描述**：在 StatusBar 中显示 Plan Mode 的当前状态。

**交互逻辑**：
- Plan Mode ON 时：在 StatusBar 中间区域显示 "PLAN" 标识（紫色/蓝色背景色块）
- Plan Mode OFF 时：不显示
- 点击 StatusBar 的 "PLAN" 标识可切换 Plan Mode（与工具栏按钮行为一致）

**边界条件**：
- StatusBar 空间有限，"PLAN" 标识应紧凑（约 40px 宽）

**验收标准**：
- [ ] Plan Mode ON 时 StatusBar 显示 "PLAN" 色块
- [ ] Plan Mode OFF 时 "PLAN" 色块不显示
- [ ] 点击 "PLAN" 色块可切换模式

### 4. chatStore 状态管理

**描述**：在 chatStore 中添加 `isPlanMode` 状态字段。

**交互逻辑**：
- `isPlanMode: boolean`：默认 false
- `setPlanMode: (v: boolean) => void`：设置方法
- 在 `clearMessages()` 或新会话时重置为 false
- 在切换会话（`setSessionId`）时重置为 false

**边界条件**：
- Plan Mode 状态不持久化到本地存储（仅运行时状态）
- 恢复历史会话时不恢复 Plan Mode（总是从 OFF 开始）

**验收标准**：
- [ ] chatStore 有 isPlanMode 字段
- [ ] 新会话/切换会话时 isPlanMode 重置为 false

---

## 涉及文件

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/renderer/components/chat/InputToolbar.tsx` | 修改 | 新增 Plan Mode 切换按钮 |
| `src/renderer/components/chat/PlanModeBanner.tsx` | **新建** | Plan Mode 标识条组件 |
| `src/renderer/components/chat/ChatInput.tsx` | 修改 | 集成 PlanModeBanner，条件渲染边框样式 |
| `src/renderer/components/layout/StatusBar.tsx` | 修改 | 添加 PLAN 状态标识 |
| `src/renderer/store/chatStore.ts` | 修改 | 新增 isPlanMode 字段 |
| `src/renderer/i18n/locales/en.json` | 修改 | 新增 plan mode 相关 i18n key |
| `src/renderer/i18n/locales/zh-CN.json` | 修改 | 新增 plan mode 相关 i18n key |

### 新增 i18n key

```json
{
  "plan.toggle": "Plan Mode",
  "plan.enterHint": "Enter Plan Mode — Claude will only plan, not execute tools",
  "plan.exitHint": "Exit Plan Mode — Resume normal execution",
  "plan.banner": "Plan Mode — Claude will only plan, not execute",
  "plan.bannerExit": "Exit",
  "plan.statusLabel": "PLAN",
  "plan.enabled": "Plan Mode enabled",
  "plan.disabled": "Plan Mode disabled"
}
```

---

## 非功能需求

- **性能**：Plan Mode 切换是纯 UI 状态变更 + 发送一条消息，无性能影响
- **安全**：Plan Mode 仅控制 AI 行为模式，不涉及权限或数据安全
- **可访问性**：
  - Plan Mode 按钮需有 `aria-pressed` 属性反映开关状态
  - 标识条需有 `role="alert"` 以便屏幕阅读器播报

## 成功指标

- 用户能在 1 次点击内切换 Plan Mode
- Plan Mode 激活时有 3 处视觉提示（按钮高亮 + 标识条 + StatusBar），不可能被忽视
- Plan Mode 下 Claude 确实不执行工具调用（由 CLI 保证，非 AIPA 职责）

## 优先级

- **P0**：InputToolbar Plan Mode 切换按钮（核心入口）
- **P0**：chatStore isPlanMode 状态（数据基础）
- **P1**：ChatInput Plan Mode 视觉指��（标识条 + 边框变色）
- **P1**：StatusBar PLAN 状态标识

## 依赖与风险

| 依赖项 | 负责方 | 风险等级 |
|--------|--------|----------|
| CLI `/plan` slash command 支持 | 外部 CLI | 低（已确认支持） |
| `/plan` 命令通过消息路径可达 | 工程 | 低（与 `/compact` 相同路径） |

## 开放问题

- [ ] `/plan` 命令发送后，CLI 是否返回确认信息（如 "Plan mode enabled"）？如果是，可以用此确认来同步 isPlanMode 状态
- [ ] stream-bridge 是否能监听到 `plan_mode_change` 事件？如果能，用 CLI 事件驱动状态变更比本地 toggle 更可靠
- [ ] 退出 Plan Mode 时是否需要确认对话框？当前方案是一键切换，无确认。如果用户经常误触，v2 可考虑加确认

---

## 后端需求

**需要修改主进程**：否。Plan Mode 通过已有的消息发送路径发送 `/plan` 命令，不需要新增 IPC channel。如果未来 CLI 支持 `plan_mode_change` 事件，需要在 stream-bridge 中添加对应的事件处理并通过 IPC 传递到 renderer。

---

## 执行顺序建议

1. **P0** 在 chatStore 添加 isPlanMode 字段
2. **P0** 在 InputToolbar 添加 Plan Mode 按钮（发送 `/plan`，toggle isPlanMode）
3. **P1** 新建 PlanModeBanner，集成到 ChatInput
4. **P1** 在 StatusBar 添加 PLAN 标识

**文件冲突注意**：本 PRD 涉及 `InputToolbar.tsx`、`ChatInput.tsx`、`StatusBar.tsx`、`chatStore.ts`、`i18n/locales/*.json`。与 PRD-1（effort-control）在 `InputToolbar.tsx`、`StatusBar.tsx` 有冲突，与 PRD-2（context-token-usage）在 `StatusBar.tsx`、`chatStore.ts` 有冲突，与 PRD-3（compact）在 `chatStore.ts` 有冲突。**建议 4 个 PRD 严格串行执行**（effort → token → compact → plan），或至少 PRD-1 和 PRD-4 不并行。i18n 条目需由 leader 统一合并。
