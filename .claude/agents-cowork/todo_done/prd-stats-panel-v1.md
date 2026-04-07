# PRD: 使用统计面板（Stats Dashboard）

_版本：v1 | 状态：Draft | PM：aipa-pm | 日期：2026-04-07_

## 一句话定义

为用户提供一个统计面板，展示 Claude Code 的历史使用数据（会话数、消息数、token 消耗、常用工具），帮助用户了解自己的使用模式并优化工作流。

## 背景与动机

AIPA 当前已有 `StatsPanel.tsx`（Iteration 391+）用于展示**单次会话**的统计数据（消息数、字数、时长等），但缺乏**全局视角**的使用统计。用户无法知道：自己一共用了多少 token？最常调用哪些工具？过去一周的使用趋势如何？

Claude Code CLI 的 `/stats` 命令可输出使用统计，但仅显示文本格式。AIPA 作为图形驾驶舱，应提供可视化的统计面板，帮助用户：
1. 理解 token 消耗模式（优化成本）
2. 识别高频工具（优化工作流）
3. 跟踪使用趋势（建立使用习惯）

此功能属于 Superpower Integration Plan Phase 4.1。

## 目标用户

**主要**：开发者——关心 token 消耗成本，想了解工具使用模式
**次要**：团队 Lead——想了解团队 AI 辅助编程的使用情况

## 用户故事

作为一个按 token 付费的开发者，
我希望能看到总 token 消耗和使用趋势，
以便优化使用策略、控制成本。

## 功能范围

### In Scope（本版本包含）

1. **统计面板入口**：设置页新增「Stats」Tab
2. **总览卡片**：总会话数、总消息数、总 token 消耗估算
3. **工具使用排行**：最常用工具 Top 5（水平条形图）
4. **活跃趋势**：近 7 天 / 30 天会话活跃度（简单柱状图）
5. **后端统计聚合**：扫描 JSONL 会话文件，聚合计算统计数据

### Out of Scope（本版本不包含，说明原因）

- **成本估算（美元金额）**：不同 model 价格不同，需维护价目表——复杂度高，v2
- **实时图表交互**（缩放、拖拽、tooltip 详情）：v1 先用静态图表
- **导出统计报告**：导出 CSV/PDF——低频需求，v2
- **多用户统计对比**：AIPA 是单用户桌面应用，无此需求
- **复杂图表库引入**：v1 使用纯 CSS + 简单 SVG 渲染，不引入 recharts 等重量级图表库

## 功能详述

### 功能 1：统计面板入口（Settings Stats Tab）

**描述**：设置页新增「Stats」Tab，展示全局使用统计数据。

**交互逻辑**：
- 设置页 Tab 栏增加「Stats」（图标：BarChart3）
- 点击后加载 `session:getStats` IPC 获取统计数据
- 加载中显示 loading skeleton（因为需要扫描文件，可能需要 1-3 秒）
- 顶部显示数据时间范围：「Stats from [最早会话日期] to [今天]」

**边界条件**：
- 无任何会话记录 → 显示空状态「No usage data yet. Start chatting to see your stats!」
- 统计计算超时（>10 秒）→ 显示已获取的部分数据 + 提示

**验收标准**：
- [ ] 设置页出现「Stats」Tab
- [ ] 点击后显示统计面板
- [ ] 加载中有 skeleton/loading 指示
- [ ] 无数据时显示空状态

### 功能 2：总览卡片（Summary Cards）

**描述**：面板顶部显示 3-4 个统计总览卡片。

**交互逻辑**：
- 卡片网格布局（2 列 或 4 列取决于面板宽度）
- 卡片内容：
  1. **Total Sessions** — 总会话数（数字 + 图标）
  2. **Total Messages** — 总消息数（分 user / assistant / tool 三部分）
  3. **Total Tokens** — 总 token 消耗估算（input + output，格式化为 K/M 单位）
  4. **Average Session Length** — 平均会话消息数
- 每个卡片使用不同颜色强调数字

**边界条件**：
- token 数据缺失（旧版 JSONL 可能无 usage 字段）→ 显示「N/A」
- 数字过大 → 使用 K（千）、M（百万）格式化

**验收标准**：
- [ ] 显示 4 个总览卡片，数据正确
- [ ] 大数字格式化为 K/M 单位
- [ ] token 数据不可用时显示 N/A

### 功能 3：工具使用排行（Tool Usage Chart）

**描述**：展示最常用工具 Top 5 的使用次数，使用水平条形图。

**交互逻辑**：
- 标题「Top Tools」
- 水平条形图：每行显示工具名 + 使用次数 + 百分比条
- 条的颜色对应工具类型（terminal=蓝, file=绿, search=橙, web=紫）
- 使用纯 CSS 渲染（div 宽度百分比），不引入图表库

**边界条件**：
- 工具使用次数为 0 → 不显示该工具
- 所有工具使用次数相同 → 按字母排序
- MCP 工具与内置工具混合排列

**验收标准**：
- [ ] 显示 Top 5 工具的水平条形图
- [ ] 条长度按使用次数比例渲染
- [ ] 每条显示工具名和使用次数

### 功能 4：活跃趋势（Activity Chart）

**描述**：展示近 7 天或 30 天的每日会话/消息数量趋势。

**交互逻辑**：
- 标题「Activity」+ 切换按钮（7 Days / 30 Days）
- 简单柱状图：X 轴为日期，Y 轴为当日会话数
- 使用纯 CSS 渲染（垂直 div 条），不引入图表库
- 柱子上方 hover 显示具体数字（CSS tooltip）
- 默认显示 7 天视图

**边界条件**：
- 某天无数据 → 柱高为 0
- 仅有 1-2 天数据 → 仍然显示完整时间范围，空天为 0
- 30 天模式下数据较多 → 日期标签仅显示每隔 5 天

**验收标准**：
- [ ] 显示柱状图趋势
- [ ] 可切换 7 天 / 30 天视图
- [ ] hover 柱子显示具体数字
- [ ] 空天显示为 0 高度

### 功能 5：后端统计聚合（session:getStats IPC）

**描述**：新增 `session:getStats` IPC handler，扫描 `~/.claude/projects/` 目录下所有 JSONL 文件，聚合统计数据。

**交互逻辑**：
- 扫描所有 JSONL 文件（复用现有 `session-reader.ts` 的文件发现逻辑）
- 逐文件解析，提取：
  - 消息数（按 role 分类）
  - 工具使用次数（按 tool name 分类）
  - token 使用量（从 result 事件的 usage 字段提取）
  - 会话日期（从文件 mtime 或首条消息 timestamp）
- 返回结构化数据：

```typescript
interface SessionStats {
  totalSessions: number
  totalMessages: { user: number; assistant: number; tool: number }
  totalTokens: { input: number; output: number } | null
  toolUsage: { name: string; count: number }[]
  dailyActivity: { date: string; sessions: number; messages: number }[]
  averageSessionMessages: number
  dateRange: { from: string; to: string }
}
```

**边界条件**：
- JSONL 文件损坏（非法 JSON 行）→ 跳过该行，继续解析
- 文件数量极大（>1000 个）→ 限制扫描最近 90 天的文件
- 首次加载慢 → 异步处理，支持中间状态返回

**验收标准**：
- [ ] `session:getStats` 正确返回聚合统计数据
- [ ] 损坏的 JSONL 行不导致崩溃
- [ ] 大量文件时有合理的性能表现（<5 秒）

## 非功能需求

- **性能**：统计计算应在 5 秒内完成；结果可缓存 5 分钟（避免重复扫描）
- **安全**：仅读取 JSONL 文件，不修改
- **可访问性**：图表应有 aria-label 描述数据含义（如 "Bar chart showing top 5 tools"）
- **兼容性**：Windows / macOS / Linux

## 成功指标

- 用户可在统计面板中看到 token 使用总量和趋势
- 工具排行帮助用户了解 Claude 的工具使用模式
- 面板加载在 5 秒内完成

## 优先级

- **P0**：`session:getStats` IPC + 总览卡片（数据基础 + 核心展示）
- **P1**：工具使用排行（条形图）
- **P1**：活跃趋势图（柱状图）
- **P2**：缓存优化 + 数据范围限制

## 涉及文件

| 文件���径 | 操作 | 说明 |
|---------|------|------|
| `src/main/sessions/session-stats.ts` | 新建 | 统计聚合逻辑，扫描 JSONL 文件 |
| `src/main/ipc/index.ts` | 修改 | 注册 `session:getStats` handler |
| `src/preload/index.ts` | 修改 | 暴露 `sessionGetStats` API |
| `src/renderer/components/settings/SettingsStats.tsx` | 新建 | 统计面板 UI |
| `src/renderer/components/settings/SettingsPanel.tsx` | 修改 | 新增 Stats Tab |
| `i18n/locales/en.json` | 修改 | 新增 stats 相关翻译键 |
| `i18n/locales/zh-CN.json` | 修改 | 新增 stats 相关翻译键 |

## 后端需求

本功能涉及新的主进程模块：

1. **新建 `session-stats.ts`**：
   - `getSessionStats()`: 扫描 `~/.claude/projects/` JSONL 文件
   - 复用 `session-reader.ts` 的 `PROJECTS_DIR` 常量和文件发现逻辑
   - 逐文件 readline 解析 JSONL，提取统计字段
   - 聚合为 `SessionStats` 对象返回
   - 内置缓存（5 分钟 TTL）

2. **注册 IPC handler**：在 `registerSessionHandlers()` 中新增 `session:getStats` safeHandle

## 冲突分析

| 冲突资源 | 冲突方 | 策略 |
|---------|--------|------|
| `src/main/ipc/index.ts` | prd-permissions-ui, prd-mcp-manager | 本 PRD 仅在 registerSessionHandlers 中追加，与其他 PRD 的 handler 分区不冲突 |
| `src/preload/index.ts` | prd-permissions-ui, prd-mcp-manager | 追加新 API，低冲突 |
| `SettingsPanel.tsx` | prd-permissions-ui (Permissions), prd-system-prompt (Advanced) | **各自独立 Tab**，低冲突 |
| `i18n/locales/*.json` | 所有 PRD | **i18n 条目需由 leader 统一合并** |

## 依赖与风险

| 依赖项 | 负责方 | 风险等级 |
|--------|--------|----------|
| JSONL 文件格式稳定性 | CLI 团队 | 低 — JSONL 格式稳定 |
| 文件系统权限 | OS | 低 — 读取用户目录 |
| 大量 JSONL 文件性能 | 工程 | 中 — 需缓存 + 限制扫描范围 |

## 开放问题

- [ ] 是否需要引入 recharts 等图表库？建议 v1 先用纯 CSS 渲染简单图表，避免 bundle size 增加。若效果不佳，v2 引入 recharts
- [ ] 统计数据是否需要持久化缓存到磁盘？建议 v1 仅内存缓存，每次打开设置页重新计算
- [ ] token 数据在旧版 JSONL 中可能缺失，如何处理？建议显示 N/A 并提示

## 执行顺序建议

1. **P0 - session-stats.ts 后端模块**（数据层，其他功能的基础）
2. **P0 - SettingsStats.tsx + 总览卡片**（基本 UI）
3. **P1 - 工具使用排行**（CSS 条形图）
4. **P1 - 活跃趋势图**（CSS 柱状图 + 7/30 天切换）

本 PRD 与其他 PRD 文件冲突极低，可与任何 PRD 并行执行。
