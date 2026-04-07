# PRD: Context Compact — 上下文压缩完整体验

_版本：v1 | 状态：Draft | PM：aipa-pm | 日期：2026-04-07_

---

## 一句话定义

为 AIPA 提供完整的上下文压缩体验：一键触发 `/compact`、显示压缩进度和 token 节省数据、支持自定义压缩指令、>85% 自动提示，让用户轻松管理长会话的上下文窗口。

## 背景与动机

当前 AIPA 已有部分 compact 能力：
- `ChatInput.tsx` 中 ContextUsageMeter 有一个"压缩"按钮（`onCompact={() => onSend('/compact')}`）
- `chatStore` 有 `isCompacting` 和 `compactionCount` 状态
- 设置中有 `compactThreshold` 阈值配置

但体验不完整：
1. **压缩进度不可见** — 触发 `/compact` 后用户看不到进度，不知道何时完成
2. **节省数据不可见** — 压缩完成后没有显示"节省了多少 token"的反馈
3. **缺少专用入口** — 压缩按钮隐藏在 ContextUsageMeter 中，仅在 >60% 时可见。ChatPanel 顶部工具栏没有压缩入口
4. **无法自定义压缩指令** — `/compact [custom instruction]` 支持自定义压缩侧重点，但 AIPA 未暴露此能力
5. **自动提示体验** — 虽然有 compactThreshold 设置，但实际的自动提示逻辑需要与 PRD-2（context-token-usage）配合

## 目标用户

**主要**：开发者用户 — 进行长时间编程会话，需要频繁管理上下文窗口。
**次要**：日常用户 — 长对话后收到友好的压缩提示，一键操作。

## 用户故事

作为一个进行长时间编程会话的开发者，
我希望能一键压缩对话上下文并看到节省了多少 token，
以便延长会话寿命，避免因上下文溢出而丢失对话上下文。

---

## 功能范围

### In Scope（本版本包含）

1. **ChatPanel 顶部工具栏压缩按钮** — 始终可见的压缩入口
2. **压缩进度显示** — 触发后显示 loading 状态，完成后 toast 显示结果
3. **Token 节省反馈** — 压缩前后的 token 对比数据
4. **自定义压缩指令** — Shift+点击或长按打开输入框，允许用户输入自定义指令

### Out of Scope（本版本不包含）

- 自动压缩（无需用户确认直接压缩）— 风险过高，可能删除用户需要的上下文
- 压缩历史/撤销 — 复杂度过高，推迟到 v2
- 多种压缩策略选择（如保留最近 N 轮、只保留代码等）— 属于高级功能

---

## 功能详述

### 1. ChatPanel 工具栏压缩按钮

**描述**：在 ChatPanel 顶部工具栏（SessionActions 区域）新增一个「压缩上下文」按钮。

**交互逻辑**：
- 按钮图标使用 `Archive` 或 `Shrink`（与 ContextUsageMeter 保持一致）
- 按钮文字："Compact"
- 按钮右侧小字显示当前 context 使用百分比（如果有数据）
- 点击触发 `/compact` 命令（通过已有的 `onSend('/compact')` 路径）
- Shift+点击打开自定义压缩指令输入框
- 流式响应进行中时按钮禁用
- 无会话时按钮禁用

**边界条件**：
- 连续多次点击压缩应被防抖（debounce 2 秒）
- 如果 `isCompacting` 为 true，按钮显示 loading 状态

**验收标准**：
- [ ] ChatPanel 工具栏显示压缩按钮
- [ ] 点击发送 `/compact` 命令
- [ ] Shift+点击打开自定义指令输入
- [ ] 流式响应进行中按钮禁用
- [ ] isCompacting 时显示 loading

### 2. 压缩进度和反馈

**描述**：压缩触发后，提供清晰的进度指示和完成反馈。

**交互逻辑**：
- 触发压缩后：
  1. `isCompacting` 设为 true
  2. ChatPanel 工具栏的压缩按钮变为 loading 旋转图标
  3. StatusBar 显示 "Compacting..." 文字
- 压缩完成���（通过 CLI 回复检测）：
  1. `isCompacting` 设为 false
  2. `compactionCount` 加 1
  3. 弹出 success toast：「压缩完成。Token 使用从 {before}% 降至 {after}%」
- 检测压缩完成的方式：监听 AI 回复中包含 "compact" 或 "summary" 关键词（启发式），或者当 lastContextUsage 在一次 result 后显著下降（>20%）

**边界条件**：
- 如果压缩失败（CLI 报错），应显示 error toast
- 压缩过程中用户可以通过 abort 取消

**验收标准**：
- [ ] 压缩进行中工具栏按钮显示 loading 状态
- [ ] 压缩完成后弹出 toast 显示 token 节省数据
- [ ] StatusBar 在压缩期间显示 "Compacting..."

### 3. 自定义压缩指令

**描述**：允许用户在压缩时指定侧重点（如 "保留所有代码相关上下文" 或 "只保留最后 5 轮对话"）。

**交互逻辑**：
- Shift+点击压缩按钮时，弹出一个小输入框（inline popover，类似 rename 输入框）
- 输入框 placeholder：「可选：输入压缩侧重指令」
- Enter 确认发送 `/compact {custom instruction}`
- Escape 取消
- 空白输入等同于普通 `/compact`

**边界条件**：
- 输入框最大长度 200 字符
- 自定义指令中的特殊字符需要转义吗？— 不需要，直接拼接到 `/compact` 后面

**验收标准**：
- [ ] Shift+点击打开自定义指令输入框
- [ ] 输入自定义指令后发送 `/compact {instruction}`
- [ ] 空白输入发送 `/compact`
- [ ] Escape 取消

### 4. ContextUsageMeter 压缩按钮优化

**描述**：优化现有 ContextUsageMeter 中的压缩按钮，与新的工具栏按钮保持行为一致。

**交互逻辑**：
- 保留 ContextUsageMeter 中的压缩按钮（快捷入口）
- 确保两个压缩入口（工具栏 + ContextUsageMeter）使用相同的 onCompact 逻辑
- 压缩进行中时两个按钮同步显示 loading

**验收标准**：
- [ ] 两个压缩入口行为一致
- [ ] loading 状态同步

---

## 涉及文件

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/renderer/components/chat/ChatPanel.tsx` | 修改 | 工具栏添加压缩按钮 |
| `src/renderer/components/chat/CompactButton.tsx` | **新建** | 压缩按钮组件（含 loading + 自定义指令 popover） |
| `src/renderer/components/chat/ContextUsageMeter.tsx` | 修改 | 优化压缩按钮，同步 loading 状态 |
| `src/renderer/store/chatStore.ts` | 修改 | 添加 contextBeforeCompact 字段用于 before/after 对比 |
| `src/renderer/hooks/useStreamJson.ts` | 修改 | 在 result 处理中检测压缩完成，计算节省数据 |
| `src/renderer/i18n/locales/en.json` | 修改 | 新增 compact 相关 i18n key |
| `src/renderer/i18n/locales/zh-CN.json` | 修改 | 新增 compact 相关 i18n key |

### 新增 i18n key

```json
{
  "compact.button": "Compact",
  "compact.buttonHint": "Compress conversation context to free token space",
  "compact.inProgress": "Compacting...",
  "compact.success": "Compact complete. Usage: {before}% → {after}%",
  "compact.customPlaceholder": "Optional: enter custom compact instruction",
  "compact.customHint": "Shift+click for custom compact instruction",
  "compact.failed": "Compact failed. Please try again.",
  "compact.count": "Compacted {count} time(s)"
}
```

---

## 非功能需求

- **性能**：压缩操作依赖 CLI 处理，AIPA 端仅发送命令和显示反馈，无性能风险
- **用户体验**：loading 动画应平滑，不阻塞其他 UI 操作
- **可访问性**：压缩按钮需有 aria-label 描述当前状态（"Compact context" / "Compacting..."）

## 成功指标

- 用户在一次点击内触发压缩
- 压缩完成后用户能看到具体的 token 节省数据
- 长会话中用户主动使用 compact 的频���提升

## 优先级

- **P0**：ChatPanel 工具栏压缩按钮 + loading 状态（核心入口）
- **P0**：压缩完成后 toast 反馈（核心反馈）
- **P1**：自定义压缩指令（高级功能）
- **P2**：ContextUsageMeter 同步优化（一致性）

## 依赖与风险

| 依赖项 | 负责方 | 风险等级 |
|--------|--------|----------|
| `/compact` 命令 CLI 支持 | 外部 CLI | 无（已支持） |
| isCompacting 状态管理 | 工程 | 低（chatStore 已有字段） |
| PRD-2 阈值提示中的 "压缩" 按钮 | 本批次 | 中（需确保行为一致） |

## 开放问题

- [ ] 如何可靠检测压缩完成？目前是启发式（context usage 下降 >20%），是否有更可靠的 CLI 事件？
- [ ] CLI 是否支持 `compact_result` 事件（SUPERPOWER-PLAN 中提及但需验证）？

---

## 后端需求

**需要修改主进程**：否。compact 通过已有的消息发送路径（`onSend('/compact')`）触发，不需要新增 IPC channel。如果未来 CLI 支持 `compact_result` 事件，需要在 stream-bridge 中添加对应的事件处理。

---

## 执行顺序建议

1. **P0** 新建 CompactButton 组件，集成到 ChatPanel 工具栏
2. **P0** 在 useStreamJson 中添加压缩完成检测和 toast 反馈
3. **P1** 添加自定义压缩指令 popover
4. **P2** 同步 ContextUsageMeter 的 loading 状态

**文件冲突注意**：本 PRD 涉及 `ChatPanel.tsx`、`chatStore.ts`、`useStreamJson.ts`、`i18n/locales/*.json`。与 PRD-1、PRD-2 均有重叠文件。建议在 PRD-1 和 PRD-2 之后执行。i18n 条目需由 leader 统一合并。
