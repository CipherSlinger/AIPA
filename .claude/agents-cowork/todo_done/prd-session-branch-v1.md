# PRD: 会话分叉（Session Branch / Fork）

_版本：v1 | 状态：Draft | PM：aipa-pm | 日期：2026-04-07_

## 一句话定义

让用户从任意消息点分叉出新会话，在不丢失原始对话的前提下探索替代路径，并在侧边栏可视化会话父子关系。

## 背景与动机

Claude Code 的对话往往在某个决策节点产生分歧——用户可能想"如果我问了另一个问题会怎样"或"这个方案行不通，我想从第 3 条消息重新开始"。当前 AIPA 已在 `MessageContextMenu` 中有基础的 `onFork` 回调（仅限 user 消息），且 `session:fork` IPC 和 `sessionFork` preload API 均已存在，但功能不完整：

1. 分叉后无法自动切换到新会话（缺少 conversation tabs 集成）
2. 侧边栏无法展示会话间的父子关系
3. 不支持给分叉会话命名
4. 分叉仅限 user 消息触发，assistant 消息也应支持"从这之后重新提问"

此功能属于 Superpower Integration Plan Phase 3.1，利用已有基础设施完成完整的分叉体验。

## 目标用户

**主要**：开发者——在调试和探索方案时频繁需要"试另一条路"
**次要**：知识工作者——在头脑风暴中想保留多条思路

## 用户故事

作为一个使用 AIPA 进行编码的开发者，
我希望能从任意消息处分叉会话并在新标签中继续，
以便在不丢失原始对话上下文的前提下探索替代方案。

## 功能范围

### In Scope（本版本包含）

1. **扩展消息右键菜单分叉入口**：所有消息（user + assistant）均可触发分叉
2. **分叉后自动跳转**：分叉完成后自动切到新会话（若 conversation tabs 已上线则切到新标签，否则切换当前会话）
3. **侧边栏父子关系展示**：分叉会话在 SessionItem 中显示分叉标识和来源父会话
4. **分叉会话命名**：分叉时可选输入会话名，默认生成 "[父会话名] (Fork)"

### Out of Scope（本版本不包含，说明原因）

- **多层分叉树形视图**：复杂度高，v2 迭代。本版本仅展示直接父子关系
- **分叉点消息对比**：对比两个分支的差异——属于 diff 功能，跨功能模块
- **合并分支**：将分叉会话内容合并回父会话——交互复杂度极高，远期探索

## 功能详述

### 功能 1：扩展消息右键菜单分叉入口

**描述**：当前 `MessageContextMenu` 中 `onFork` 仅在 `message.role === 'user'` 时显示。扩展为所有消息均可触发分叉。

**交互逻辑**：
- 右键任意消息 → 显示「从此处分叉 / Fork from here」选项
- 对于 assistant 消息，分叉点为该消息之前（即包含到该 assistant 消息之前的 user 消息为止）
- 点击后弹出轻量确认对话框，显示分叉点信息，可选输入会话名

**边界条件**：
- 正在流式响应的消息不可分叉（按钮置灰）
- 只有 1 条消息的会话（首条 user 消息）→ 分叉无意义，不显示分叉选项

**验收标准**：
- [ ] 所有 user 和 assistant 消息的右键菜单均显示「Fork from here」选项
- [ ] 流式响应中的消息分叉按钮置灰且不可点击
- [ ] 单消息会话不显示分叉选项

### 功能 2：分叉后自动跳转

**描述**：调用 `session:fork` IPC 后，获取返回的新 session ID，自动切换到新会话。

**交互逻辑**：
- 分叉操作触发 → 显示 loading → `session:fork` 返回新 session ID
- 若 conversation tabs 已就绪 → 在新标签页打开分叉会话
- 若 conversation tabs 未就绪 → 直接切换当前会话到分叉会话
- 切换完成后 Toast 提示「Forked from message #N」

**边界条件**：
- `session:fork` 返回 null（原会话不存在或文件损坏）→ Toast 错误提示
- 分叉过程中用户切换了会话 → 仍然完成分叉，但不自动跳转

**验收标准**：
- [ ] 分叉成功后自动切换到新会话
- [ ] 新会话包含截断点之前的所有消息
- [ ] Toast 显示分叉来源信息
- [ ] 分叉失败时有错误提示

### 功能 3：侧边栏父子关系展示

**描述**：在 `SessionItem` 中为分叉会话显示视觉标识，表明其来源。

**交互逻辑**：
- 分叉会话在 session metadata 中存储 `parentSessionId` 和 `forkMessageIndex`
- SessionItem 渲染时检测 `parentSessionId`：若存在，显示 GitBranch 图标和父会话名称片段
- 点击父会话名称 → 快速跳转到父会话

**边界条件**：
- 父会话已被删除 → 仍显示 GitBranch 图标，但不显示跳转链接，tooltip 提示「Parent session deleted」
- 分叉会话被重命名 → 不影响父子关系显示

**验收标准**：
- [ ] 分叉会话在侧边栏显示 GitBranch 图标标识
- [ ] 可快速跳转到父会话
- [ ] 父会话删除后不会报错

### 功能 4：分叉会话命名

**描述**：分叉时可自定义会话名称，默认使用 "[父名称] (Fork)" 格式。

**交互逻辑**：
- 分叉确认对话框包含一个可选的名称输入框
- 留空 → 使用默认名称「[父会话标题] (Fork)」
- 输入名称 → 使用自定义名称
- 分叉完成后调用 `session:rename` 设置名称

**边界条件**：
- 父会话无标题 → 默认名称使用「Forked Session」
- 名称过长（>100 字符）→ 截断

**验收标准**：
- [ ] 分叉时可自定义会话名称
- [ ] 留空时使用合理的默认名称
- [ ] 名称在侧边栏正确显示

## 非功能需求

- **性能**：`session:fork` 操作应在 500ms 内完成（复制 JSONL 文件子集）
- **安全**：分叉不应暴露原会话的 API key 或其他敏感信息（复用已有安全机制）
- **可访问性**：分叉确认对话框支持 Escape 关闭，Enter 确认
- **兼容性**：Windows / macOS / Linux

## 成功指标

- 用户能从任意消息点分叉出新会话并继续对话
- 侧边栏清晰展示会话间的父子关系
- 分叉操作不影响原始会话

## 优先级

- **P0**：扩展右键菜单 + 分叉后自动跳转（核心功能闭环）
- **P1**：侧边栏父子关系展示
- **P2**：分叉会话命名对话框

## 涉及文件

| 文件路径 | 操作 | 说明 |
|---------|------|------|
| `src/renderer/components/chat/MessageContextMenu.tsx` | 修改 | 移除 `message.role === 'user'` 限制，所有消息可分叉 |
| `src/renderer/components/chat/Message.tsx` 或 `MessageList.tsx` | 修改 | 传递 messageIndex 给 onFork，分叉后自动切换会话 |
| `src/renderer/components/sessions/SessionItem.tsx` | 修改 | 增加 parentSessionId 检测和 GitBranch 图标 |
| `src/renderer/store/index.ts` | 修改 | useChatStore 增加 forkFromMessage action |
| `i18n/locales/en.json` | 修改 | 新增 fork 相关翻译键 |
| `i18n/locales/zh-CN.json` | 修改 | 新增 fork 相关翻译键 |

## 后端需求

本功能主要工作在 UI 层。`session:fork` IPC 和 `forkSession` 函数已存在（`session-reader.ts`）。

可能需要的微调：
- `forkSession` 返回值中增加 `parentSessionId` 信息写入新 session 的 metadata
- 若当前 `forkSession` 未在 JSONL 中记录 parentSessionId，需在写入新会话文件时补充

## 冲突分析

| 冲突资源 | 冲突方 | 策略 |
|---------|--------|------|
| `MessageContextMenu.tsx` | 无已知冲突 | 独立修改 |
| `SessionItem.tsx` | 无已知冲突 | 独立修改 |
| `store/index.ts` | 其他 PRD 可能同时修改 useChatStore | **i18n 条目需由 leader 统一合并** |
| `i18n/locales/*.json` | 所有 PRD | **i18n 条目需由 leader 统一合并** |

## 依赖与风险

| 依赖项 | 负责方 | 风险等级 |
|--------|--------|----------|
| `session:fork` IPC 已存在 | 已完成 | 低 — 接口已稳定 |
| conversation-tabs 功能 | prd-conversation-tabs-v1 | 中 — 若未完成则降级为切换当前会话 |
| `session:rename` IPC 已存在 | 已完成 | 低 |

## 开放问题

- [ ] `forkSession` 是否已在新 JSONL 文件中记录 parentSessionId？需要检查实现
- [ ] conversation-tabs 是否已上线？若否，分叉后跳转降级为切换当前会话

## 执行顺序建议

1. **P0 - MessageContextMenu 扩展**（移除 role 限制，传递正确 messageIndex）
2. **P0 - 分叉后自动跳转**（调用 sessionFork + loadSession）
3. **P1 - SessionItem 父子关系展示**（读取 metadata，渲染 GitBranch 标识）
4. **P2 - 分叉命名对话框**（轻量 Dialog 组件）

依赖：建议在 `prd-conversation-tabs-v1` 之后执行，以获得最佳体验（新标签打开分叉）。若 conversation tabs 尚未完成，可先独立实现降级方案。
