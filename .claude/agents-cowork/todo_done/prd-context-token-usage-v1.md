# PRD: Context & Token Usage 可视化增强

_版本：v1 | 状态：Draft | PM：aipa-pm | 日期：2026-04-07_

---

## 一句话定义

将 CLI result 事件中的 token usage 数据完整解析并可视化，让用户实时了解上下文窗口消耗情况，并在接近上限时主动提示优化措施。

## 背景与动机

当前 AIPA 已有基础的 context usage 显示：
- `chatStore.lastContextUsage`（`{ used, total }`）在 StatusBar 和 ChatInput 的 ContextUsageMeter 中展示
- `chatStore.lastUsage`（`{ inputTokens, outputTokens, cacheTokens }`）在 StatusBar 展示 token 用量

但存在以下不足：
1. **数据来源不清晰** — `lastContextUsage` 的 used/total 是从 CLI 的哪个事件解析的，需要确认并加固
2. **StatusBar 进度条缺失** — 目前只在 ChatInput 底部有 ContextUsageMeter，StatusBar 仅显示文字百分比，缺少视觉进度条
3. **详情展开不完整** — 点击 StatusBar 的 context 区域没有弹出详情面板
4. **阈值提示不够主动** — ContextUsageMeter 在 >85% 时显示压缩按钮，但没有 toast/notification 级别的主动提示

本 PRD 的目标是将 token usage 可视化做到 Claude Code CLI 的 `/context` 命令同等水平。

## 目标用户

**主要**：开发者用户 — 需要精确掌握 token 消耗以控制成本和避免上下文截断。
**次要**：高级用户 — 通过理解 token 分布优化与 AI 的交互方式。

## 用户故事

作为一个长时间进行 AI 辅助编程的开发者，
我希望随时看到当前会话的 token 消耗情况和占比细节，
以便在上下文接近上限前采取措施（压缩或开新会话），避免回复质量下降。

---

## 功能范围

### In Scope（本版本包含）

1. **StatusBar Token 进度条** — 紧凑的水平进度条，颜色随用量变化
2. **进度条点击展开详情面板** — 显示 input/output/cache token 分项、百分比、成本估算
3. **主动阈值提示** — >85% 时弹出 toast 提醒用户考虑 compact
4. **result 事件 usage 解析加固** — 确保从 CLI result 事件中可靠提取 usage 数据

### Out of Scope（本版本不包含）

- 彩色网格可视化（Claude Code `/context` 命令的 heatmap 视图）— 实现复杂，推迟到 v2
- Token 消耗历史图表 — 属于 Phase 3.4 Insights 范畴
- 实时逐字 token 计数（流式过程中） — 需要改造 stream-bridge，本版仅在 result 事件后更新

---

## 功能详述

### 1. StatusBar Token 进度条

**描述**：在 StatusBar 的中间区域（现有 context 百分比文字旁），添加一个紧凑的水平进度条。

**交互逻辑**：
- 进度条宽度 60-80px，高度 4px，与 StatusBar 文字对齐
- 填充百分比 = `lastContextUsage.used / lastContextUsage.total * 100`
- 颜色梯度：<60% 绿色、60-84% 黄色、>=85% 红色
- 进度条右侧显示百分比数字（复用现有 contextPct 计算）
- 无 usage 数据时不显示进度条

**边界条件**：
- `lastContextUsage` 为 null 时完全隐藏进度条区域
- total 为 0 时不渲染（避免除零）

**验收标准**：
- [ ] StatusBar 中显示 token 使用进度条
- [ ] 进度条颜色随使用百分比变化（绿/黄/红三段）
- [ ] 无数据时进度条区域不显示

### 2. 进度条点击展开详情面板

**描述**：点击 StatusBar 的 token 进度条/百分比区域，弹出一个紧凑的详情浮层。

**交互逻辑**：
- 浮层从 StatusBar 上方弹出（与现有 cost breakdown popup 类似的交互模式）
- 内容包含：
  - **Context Window**：已用 / 总量（如 "45,230 / 200,000 tokens"）
  - **Input Tokens**：本次请求的 input token 数
  - **Output Tokens**：本次回复的 output token 数
  - **Cache Tokens**：缓存命中的 token 数（如有）
  - **预估成本**：基于 MODEL_PRICING 计算本次 + 累计
  - **使用率进度条**（放大版，宽度占满浮层）
- 点击浮层外部关闭
- 浮层宽度约 240px

**边界条件**：
- 如果某些数据不可用（如 cacheTokens 为 0），对应行灰色显示或标注 "N/A"

**验收标准**：
- [ ] 点击 StatusBar token 区域弹出详情浮层
- [ ] 浮层显示 input/output/cache tokens 分项数据
- [ ] 点击外部关闭浮层
- [ ] 浮层样式与现有 cost breakdown popup 一致

### 3. 主动阈值提示

**描述**：当 context usage 超过 85% 时，自动弹出 toast 提醒。

**交互逻辑**：
- 在每次 result 事件更新 lastContextUsage 后检查百分比
- 首次达到 85% 时弹出 warning toast：「上下文窗口使用已达 {pct}%，建议压缩对话或开启新会话」
- toast 包含两个操作按钮："压缩" 和 "忽略"
- "压缩" 按钮触发 `/compact` 命令
- 同一会话内仅提示一次（避免反复打扰），用 state flag 控制
- 如果用户在设置中关闭了 autoCompact（`compactThreshold` 为 0），不弹出提示

**边界条件**：
- 压缩后 usage 下降，如果后续再次超过 85% 可以再次提示（重置 flag）
- 流式响应进行中不弹出提示（等 result 事件后再检查）

**验收标准**：
- [ ] context usage >85% 时自动弹出 toast 提醒
- [ ] toast 包含"压缩"操作按钮
- [ ] 同一会话内不重复提示（除非压缩后再次超过阈值）
- [ ] 用户关闭 autoCompact 时不提示

### 4. result 事件 usage 解析加固

**描述**：确认并加固从 CLI result 事件中提取 usage 数据的逻辑。

**交互逻辑**：
- CLI result 事件格式：`{"type": "result", "session_id": "...", "usage": {"input_tokens": N, "output_tokens": N}, ...}`
- stream-bridge 在 `handleStreamEvent` 的 `case 'result'` 中提取 usage 字段
- 通过现有的 IPC 事件链传递到 renderer

**边界条件**：
- result 事件中 usage 字段可能不存在（旧版 CLI） — 此时不更新 lastUsage
- result 事件可能包含 `context_window` 字段（总上下文窗口大小） — 如存在则用于更新 total

**验收标准**：
- [ ] result 事件中的 usage 数据被正确解析
- [ ] 缺少 usage 字段时不报错

---

## 涉及文件

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/renderer/components/layout/StatusBar.tsx` | 修改 | 添加 token 进度条和详情面板 |
| `src/renderer/components/layout/StatusBarTokenPopup.tsx` | **新建** | Token 详情浮层组件 |
| `src/renderer/store/chatStore.ts` | 修改 | 新增 contextUsageWarned flag |
| `src/renderer/hooks/useStreamJson.ts` | 修改 | 在 result 处理中加固 usage 解析，添加阈值检查逻辑 |
| `src/renderer/i18n/locales/en.json` | 修改 | 新增 token usage 相关 i18n key |
| `src/renderer/i18n/locales/zh-CN.json` | 修改 | 新增 token usage 相关 i18n key |

### 新增 i18n key

```json
{
  "token.contextWindow": "Context Window",
  "token.inputTokens": "Input Tokens",
  "token.outputTokens": "Output Tokens",
  "token.cacheTokens": "Cache Tokens",
  "token.estimatedCost": "Estimated Cost",
  "token.sessionTotal": "Session Total",
  "token.warningThreshold": "Context usage at {pct}%. Consider compacting or starting a new session.",
  "token.compactAction": "Compact",
  "token.dismiss": "Dismiss"
}
```

---

## 非功能需求

- **性能**：StatusBar 进度条必须使用 CSS transition 动画，不触发 JS 重绘
- **安全**：无敏感数据暴露
- **可访问性**：进度条需有 `aria-valuenow`、`aria-valuemin`、`aria-valuemax` 属性

## 成功指标

- 用户能在 StatusBar 一眼看到当前 context usage 百分比和颜色状态
- 用户在 context 接近上限时收到提示并有明确的操作路径

## 优先级

- **P0**：StatusBar token 进度条（核心可视化）
- **P0**：主动阈值提示 >85%（防止上下文溢出）
- **P1**：点击展开详情面板（深度信息）
- **P1**：result 事件 usage 解析加固（数据可靠性）

## 依赖与风险

| 依赖项 | 负责方 | 风险等级 |
|--------|--------|----------|
| CLI result 事件包含 usage 字段 | 外部 CLI | 低（已确认包含） |
| chatStore.lastContextUsage 数据源可靠 | 工程 | 低（已有数据流） |

## 开放问题

- [ ] CLI result 事件是否包含 `context_window` 字段（上下文窗口总大小）？如果不包含，total 值从哪里获取？

---

## 后端需求

**需要修改主进程**：可能需要。如果 stream-bridge 的 `case 'result'` 目前未提取 usage 字段，需要在 `handleStreamEvent` 中增加 usage 提取并通过 IPC 事件传递。需检查 `ipc/index.ts` 中 result 事件的转发逻辑。

---

## 执行顺序建议

1. **P0** 先在 StatusBar 添加 token 进度条（纯前端，利用现有数据）
2. **P0** 在 useStreamJson 的 result 处理中添加阈值检查 + toast
3. **P1** 新建 StatusBarTokenPopup 详情面板
4. **P1** 加固 result 事件 usage 解析

**文件冲突注意**：本 PRD 与 PRD-1（effort-control）都涉及 `StatusBar.tsx` 和 `i18n/locales/*.json`。建议**串行执行**，先完成 effort-control 再做本 PRD。i18n 条目需由 leader 统一合并。
