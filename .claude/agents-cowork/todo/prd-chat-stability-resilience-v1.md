# PRD: Chat Panel Stability & Crash Resilience
_Version: v1 | Status: Draft | PM: aipa-pm | Date: 2026-03-29_

## 一句话定义

彻底解决聊天面板反复崩溃的 React #185 错误，并建立多层防御机制，让用户再也不会在对话中途看到"Something went wrong"。

## 背景与动机

### 用户真实反馈（直接引用）

> "会话框无法正常显示对话：Something went wrong in chat panel. Minified React error #185."
>
> "之前出现过这个bug，仔细检查对应原因，避免重复犯错。"
>
> **投诉**："提过很多次这个bug，但一直修不好，leader需要好好审查前端和测试的工作。"

这是用户在 feedback.md 中**最强烈的投诉**——不仅提到了 bug 本身，还对修复质量表达了不信任。Iteration 291 和 301 都尝试修复过此问题（分别修了 useMessageListScroll 的 deps 数组和 requestAnimationFrame 节流），但用户反馈表明**问题仍然存在**。

### 竞品对比

| 产品 | 崩溃恢复能力 |
|------|-------------|
| Claude.ai Web | 浏览器原生刷新，对话不丢失（服务端持久化） |
| ChatGPT Desktop | 对话全部服务端同步，客户端崩溃无感知 |
| Cursor | 编辑器架构，VS Code 级别的进程隔离和恢复 |
| **AIPA** | ErrorBoundary 自动重试 3 次后显示错误页面，**对话状态可能丢失** |

AIPA 作为桌面应用，对话状态存在于客户端 Zustand store 中。一旦 React 渲染层崩溃，虽然 ErrorBoundary 会捕获，但：
1. 自动恢复成功率不可靠（取决于根因是否已消除）
2. 恢复失败时用户只能点击 Reload App，**当前会话的未保存状态丢失**
3. 无法定位具体是哪个组件/消息导致崩溃

### 市场空白

桌面 AI 助手类产品普遍忽视客户端稳定性工程。AIPA 如果能做到"永不崩溃，即使崩溃也不丢数据"，将成为桌面端体验的差异化优势。

## 目标用户

**主要**: 日常重度使用者（Persona: 知识工作者 Alex）
- 每天与 AIPA 进行 5-10 轮长对话
- 对话中途崩溃导致上下文断裂是最大痛点
- 信任感一旦被破坏，用户会降级为"每次对话前先手动导出"的防御性行为

**次要**: 所有 AIPA 用户
- 任何用户都可能触发渲染异常
- 崩溃体验直接影响口碑传播意愿

## 用户故事

**US-1**: 作为一个正在与 AI 进行深度对话的用户，我希望**聊天面板永远不会崩溃**，以便我可以专注于对话内容而非担心应用稳定性。

**US-2**: 作为一个遇到应用异常的用户，我希望**应用能自动恢复且不丢失我的对话**，以便我不需要重新开始。

**US-3**: 作为一个反复遇到同一个 bug 的用户，我希望**开发团队能一次性彻底修复问题**，以便我重新信任这个产品。

## 功能范围

### In Scope（本版本包含）

1. **React #185 根因彻底修复** — 对引发 "Maximum update depth exceeded" 的所有代码路径进行系统性审计和修复
2. **消息级错误隔离** — 单条消息渲染失败不应导致整个聊天面板崩溃
3. **崩溃恢复状态保护** — ErrorBoundary 恢复时保持 Zustand store 中的对话状态完整
4. **崩溃诊断日志** — 记录崩溃时的组件堆栈和触发条件，帮助定位复现路径

### Out of Scope（本版本不包含，说明原因）

- **服务端持久化**：需要后端基础设施，不在桌面应用短期路线图内
- **多进程渲染隔离**：Electron 的 webview 方案开销过大，投入不成比例
- **自动化测试框架**：虽然长期必要，但不应阻塞本次关键 bug 修复
- **性能优化（虚拟列表调��）**：已经使用 @tanstack/react-virtual，性能不是本次重点

## 功能详述

### 功能模块 1: React #185 系统性根因修复

**描述**：React error #185 的本质是 "Maximum update depth exceeded"——即组件在一次渲染周期中触发了过多的状态更新，导致 React 的安全阈值（50 次）被突破。Iteration 291 和 301 分别修复了 useMessageListScroll 中的两个触发路径，但问题仍然存在，说明**还有其他代码路径可以触发此错误**。

**需要审计的高风险代码路径**：

| 文件 | 风险点 | 原因 |
|------|--------|------|
| `useMessageListScroll.ts` | handleScroll + auto-scroll effect 循环 | 已修复两次但仍复发，说明可能存在边缘条件 |
| `ChatPanel.tsx` (505 lines) | useEffect 链依赖 messages/streaming 状态 | 多个 effect 可能形成 setState 环 |
| `MessageList.tsx` (491 lines) | virtualizer + scroll 事件 + message 变更 | 虚拟列表与状态更新的交互可能产生循环 |
| `Message.tsx` (585 lines) | 单条消息的状态（collapsed、bookmarked、reactions 等） | 大量内联状态可能在父组件重渲染时触发级联 |
| `ChatInput.tsx` (720 lines) | 输入框状态与多个弹出层的交互 | 复杂状态耦合 |
| `useStreamJson.ts` (hook) | streaming textDelta 高频更新 | 每秒几十次的增量更新可能在特定条件下绕过节流 |

**交互逻辑**：
- 对上述文件中所有 useEffect 依赖链进行审计
- 识别任何可能导致 `setState A -> effect -> setState B -> effect -> setState A` 循环的模式
- 对所有高频更新路径（streaming、scroll、resize）确保使用 ref 或节流，而非直接 setState
- 特别关注 virtualizer.scrollToIndex 后触发 onScroll 事件反向更新状态的场景

**边界条件**：
- 超长对话（200+ 条消息）的滚动
- streaming 过程中用户快速滚动
- streaming 过程中切换会话
- 窗口尺寸变化（resize）期间的 streaming
- 网络不稳定导致 textDelta 突发大量积压

**验收标准**：
- [ ] 在 200+ 条消息的会话中，streaming 期间反复快速滚动，不触发 React #185 错误
- [ ] 在 streaming 期间切换会话再切回，不触发崩溃
- [ ] 在 streaming 期间调整窗口大小，不触发崩溃
- [ ] DevTools console 中无 "Maximum update depth exceeded" 警告
- [ ] 连续运行 30 分钟重度使用（多次对话、频繁切换、大量滚动）无崩溃

### 功能模块 2: 消息级错误隔离

**描述**：当前 ErrorBoundary 包裹的是整个 ChatPanel。如果单条消息（比如一个畸形的 markdown 表格或一个超大的代码块）导致渲染失败，整个聊天面板都会崩溃。应该让每条消息有独立的错误边界，坏的消息只影响自己，不影响其他消息。

**交互逻辑**：
- 在 `MessageList.tsx` 中为每个 `<Message>` 组件包裹一个轻量级 ErrorBoundary
- 失败的消息显示一个最小化的错误占位符（例如："此消息渲染失败 [展开详情] [复制原文]"）
- 占位符提供"复制原始内容"按钮，让用户不会丢失 AI 回复的文本
- ErrorBoundary 不需要自动重试（消息内容不变，重试也不会成功），而是提供手动重试按钮

**边界条件**：
- 消息包含畸形 HTML/Markdown（未闭合标签、深度嵌套）
- 消息包含超大内容（10MB+ 的代码块贴入）
- 消息包含非法 Unicode 字符
- 虚拟列表回收的消息在重新渲染时的 edge case

**验收标准**：
- [ ] 手动注入一条包含畸形 Markdown 的消息，该消息显示错误占位符，其余消息正常渲染
- [ ] 错误占位符包含"复制原文"按钮，点击可将原始 Markdown 复制到剪贴板
- [ ] 错误占位符包含"重试"按钮，点击可尝试重新渲染
- [ ] 单条消息崩溃不会导致整个 ChatPanel 的 ErrorBoundary 触发

### 功能模��� 3: 崩溃恢复状态保护

**描述**：当 ChatPanel 级别的 ErrorBoundary 触发时（即消息级隔离也未能拦截的全局错误），需要确保恢复后对话状态不丢失。

**交互逻辑**：
- ErrorBoundary 的 `componentDidCatch` 中将当前 Zustand store 的 messages 数组序列化到 sessionStorage
- Retry/Dismiss 时检查 sessionStorage，如果存在备份则恢复到 store
- Reload App 时也检查 sessionStorage，在应用初始化时恢复
- 备份数据在成功恢复后清除，避免无限恢复循环

**边界条件**：
- messages 数组非常大（500+ 条消息，可能超过 sessionStorage 限制）
- 崩溃由 store 数据本身引起（畸形消息），此时恢复会再次崩溃
- 多个 ErrorBoundary 嵌套时的恢复优先级

**验收标准**：
- [ ] ChatPanel ErrorBoundary 触发后，点击 Retry，对话内容完整恢复
- [ ] ChatPanel ErrorBoundary 触发后，点击 Reload App，重新打开后对话可通过 session history 恢复
- [ ] 如果恢复的数据导致再次崩溃，ErrorBoundary 不进入无限恢复循环（最多重试 3 次后停止，并提示用户"开始新对话"）

### 功能模块 4: 崩溃诊断增强

**描述**：当前 ErrorBoundary 只在 console.error 中输出错误信息。应该收集更多上下文信息，帮助开发者快速定位复现路径。

**交互逻辑**：
- 崩溃时收集：错误消息、组件堆栈、当前会话消息数量、是否在 streaming、最后一条消息类型、视口尺寸、内存使用量
- 将诊断信息显示在 ErrorBoundary 的"Copy Error"按钮输出中
- 诊断信息格式化为易读的文本，方便用户在反馈中粘贴

**验收标准**：
- [ ] 点击"Copy Error"按钮，剪贴板内容包含结构化诊断信息（消息数量、streaming 状态、视口大小等）
- [ ] 诊断信息不包含用户对话内容（隐私保护），只包含元数据

## 非功能需求

- **性能**：消息级 ErrorBoundary 的额外开销 < 每条消息 0.5ms 渲染时间
- **安全**：诊断信息不泄露对话内容或 API 密钥
- **兼容性**：Windows 10/11 x64，Electron 39
- **可维护性**：修复应有清晰的代码注释说明"为什么这样做"，避免后续迭代再次引入相同问题

## 成功指标

1. **零崩溃率**：在 30 分钟重度使用场景中（连续对话、快速滚动、会话切换、streaming），React #185 错误出现次数从 >0 降为 0
2. **用户信任恢复**：下次用户反馈中不再提及崩溃问题
3. **诊断效率**：如果有新的崩溃路径被发现，通过诊断日志可在 5 分钟内定位到具体组件

## 优先级

- **P0**（必须在本版本完成，否则不发布）：
  - React #185 根因系统性修复（模块 1）
  - 消息级错误隔离（模块 2）
- **P1**（强烈建议完成）：
  - 崩溃恢复状态保护（模块 3）
- **P2**（可以推迟到下个版本）：
  - 崩溃诊断增强（模块 4）

## 依赖与风险

| 依赖项 | 负责方 | 风险等级 |
|--------|--------|----------|
| @tanstack/react-virtual 虚拟列表与 ErrorBoundary 的兼容性 | 工程 | 中 — 虚拟列表的回收机制可能与消息级 ErrorBoundary 产生交互 |
| Zustand store 序列化到 sessionStorage | 工程 | 低 — 标准 Web API，需注意 5MB 大小限制 |
| useStreamJson streaming 节流改造 | 工程 | 中 — 可能影响消息渲染实时性，需要平衡节流力度与用户体验 |

## 后端需求

本 PRD **不涉及后端/主进程修改**。所有功能变更都在 renderer 进程（React 组件 + hooks）内完成。无需新增 IPC channel。

## 开放问题

- [ ] useMessageListScroll 在 I291 和 I301 分别修复后仍复发——需要确认是否是完全相同的错误路径，还是有新的触发路径
- [ ] 消息级 ErrorBoundary 在虚拟列表中的行为——被回收再重新渲染的消息��其 ErrorBoundary 状态是否会被正确重置
- [ ] sessionStorage 5MB 限制对于大型对话（500+ 消息）是否足够——可能需要只备份最近 100 条消息

## 执行顺序建议

| 步骤 | 功能 | 优先级 | 预估迭代数 | 备注 |
|------|------|--------|-----------|------|
| 1 | React #185 系统性审计与修复 | P0 | 1 | 最高优先级，直接解决用户投诉 |
| 2 | 消息级 ErrorBoundary | P0 | 1 | 与步骤 1 可在同一迭代完成 |
| 3 | 崩溃恢复状态保护 | P1 | 1 | 依赖模块 1/2 完成后验证 |
| 4 | 崩溃诊断增强 | P2 | 0.5 | 快速收益，可与模块 3 合并 |

**总预估**：2-3 次迭代可完成全部 P0+P1 内容。

---

_PRD 审阅检查：_
- [x] 每个功能模块的验收标准可测试
- [x] Out of Scope 明确且有理由
- [x] 优先级基于用户价值（用户反复投诉的崩溃 > 新功能）
- [x] 无"功能堆砌"——每个模块都服务于同一个用户目标：稳定可靠的对话体验
