# PRD: 自定义系统提示词

_版本：v1 | 状态：Draft | PM：aipa-pm | 日期：2026-04-07_

## 一句话定义

让用户通过设置页或会话内快速选择预设/自定义系统提示词来影响 Claude 的行为风格，无需使用命令行参数。

## 背景与动机

Claude Code CLI 支持 `--system-prompt`（完全替换系统提示词）和 `--append-system-prompt`（在默认提示词后追加）两个参数，但 AIPA 尚未将其暴露给用户。当前用户如果想让 Claude 以特定风格回复（如"简洁模式"、"教学模式"），只能通过 Persona 功能间接实现，而 Persona 需要预先配置，缺乏灵活性。

此功能属于 Superpower Integration Plan Phase 4.4。与 Persona 功能互补——Persona 是重量级的身份预设，系统提示词是轻量级的行为调整。

注意：AIPA 已有 Persona 系统（`SettingsPersonas.tsx`），每个 Persona 有 `systemPrompt` 字段。本 PRD 的系统提示词功能独立于 Persona：
- Persona 的 systemPrompt 通过 Persona 选择器激活
- 本功能的系统提示词通过设置页高级选项或会话内快捷操作设置
- 两者可叠加（Persona prompt + append system prompt）

## 目标用户

**主要**：开发者——想快速调整 Claude 的行为（如"只解释不改代码"、"用中文回复"）
**次要**：知识工作者——想让 Claude 以特定专业角色回复（如"法律顾问"、"写作编辑"）

## 用户故事

作为一个频繁切换任务类型的开发者，
我希望能快速选择预设的系统提示词（如"简洁回复"或"代码审查专家"），
以便让 Claude 的回复风格适配我当前的工作需求，无需每次都在消息中说明。

## 功能范围

### In Scope（本版本包含）

1. **设置页高级 Tab 系统提示词配置**：持久化的 append-system-prompt 文本域
2. **常用预设快速选择**：预置 5-8 个常用系统提示词模板
3. **当前会话临时覆盖**：聊天区顶部可临时设置本次会话的系统提示词
4. **CLI 参数注入**：将配置的系统提示词注入 StreamBridge 的 CLI 启动参数

### Out of Scope（本版本不包含，说明原因）

- **完全替换系统提示词**（`--system-prompt`）：风险较高，可能破坏 Claude Code 核心功能，仅支持 append 模式
- **系统提示词版本历史**：记录每次修改——低频需求，v2
- **从文件加载系统提示词**：从 `.md` 文件导入——可通过复制粘贴实现，v2
- **与 Persona 的合并逻辑 UI**：当 Persona + 系统提示词同时生效时的可视化——v2

## 功能详述

### 功能 1：设置页系统提示词配置

**描述**：设置页新增「Advanced」Tab（或在现有 General Tab 增加「System Prompt」区域），包含一个多行文本域用于输入持久化的 append-system-prompt。

**交互逻辑**：
- 设置页 → Advanced Tab（新增）→「System Prompt (Append)」区域
- 多行文本域（textarea，最少 4 行高）
- 实时字符计数（右下角显示 "N / 2000 chars"，上限 2000 字符）
- 修改后点击 Save 按钮持久化到 electron-store（`prefs.appendSystemPrompt`）
- 清空文本域 = 不追加任何系统提示词

**边界条件**：
- 超过 2000 字符 → 阻止输入，提示字数限制
- 输入包含 markdown / 特殊字符 → 原样传递给 CLI
- 文本域为空 → 不传递 `--append-system-prompt` 参数

**验收标准**：
- [ ] 设置页出现「Advanced」Tab，包含系统提示词文本域
- [ ] 输入的提示词持久化到 electron-store
- [ ] 字符计数实时显示
- [ ] 超过字数限制时阻止输入

### 功能 2：常用预设快速选择

**描述**：文本域上方提供一排预设按钮（Chips），点击快速填入。

**交互逻辑**：
- 预设列表（可配置）：
  1. **简洁回复**：「Always be concise. Answer in 1-3 sentences unless asked for detail.」
  2. **代码审查专家**：「Act as a senior code reviewer. Focus on bugs, performance issues, and best practices.」
  3. **教学模式**：「Explain concepts step by step, as if teaching a junior developer. Use analogies.」
  4. **中文回复**：「Always respond in Chinese (Simplified). Use technical terms in English.」
  5. **只分析不执行**：「Analyze and explain what you would do, but do NOT execute any tools or make any changes.」
  6. **安全审计**：「Focus on security vulnerabilities, injection risks, and auth issues in the code.」
- 点击预设 → 替换文本域内容（若已有内容，确认是否替换）
- 预设按钮支持自定义（设置页可添加/删除自定义预设）→ P2，本版本先用硬编码预设

**边界条件**：
- 文本域已有内容时点击预设 → 弹出确认「Replace current prompt with preset?」
- 多次点击不同预设 → 每次替换

**验收标准**：
- [ ] 文本域上方显示 6 个预设按钮
- [ ] 点击预设填入对应文本
- [ ] 已有内容时点击预设弹出替换确认

### 功能 3：当前会话临时覆盖

**描述**：在 ChatHeader 或 ChatInput 工具栏增加一个「Prompt Override」指示器，允许为当前会话临时设置系统提示词（不保存到设置）。

**交互逻辑**：
- ChatHeader 增加小图标按钮（MessageSquare + 笔 图标）
- 点击 → 弹出浮层，包含同样的文本域和预设按钮
- 设置后图标变色（蓝色），tooltip 显示当前临时提示词预览
- 临时提示词优先于设置页的持久化提示词
- 清空临时提示词 → 恢复使用设置页的持久化提示词
- 关闭/切换会话 → 临时提示词自动清除

**边界条件**：
- 同时存在持久化和临时提示词 → 临时提示词优先
- 会话切换 → 清除临时提示词
- 应用关闭重启 → 临时提示词丢失（预期行为）

**验收标准**：
- [ ] ChatHeader 显示系统提示词临时覆盖按钮
- [ ] 设置临时提示词后图标变色指示
- [ ] 临时提示词优先于持久化配置
- [ ] 切换会话时自动清除临时提示词

### 功能 4：CLI 参数注入

**描述**：将生效的系统提示词注入 StreamBridge 的 CLI 启动参数。

**交互逻辑**：
- `CliSendMessageArgs` 增加 `appendSystemPrompt?: string` 字段
- `stream-bridge.ts` 的 `sendMessage` 方法中，若 `appendSystemPrompt` 非空，追加 `--append-system-prompt` 参数
- 优先级：临时覆盖 > 设置页持久化 > 无（不传参）
- renderer 在调用 `cliSendMessage` 时从 prefsStore 和 chatStore 中取出生效的 prompt

**边界条件**：
- 系统提示词包含引号或换行 → CLI 参数需正确转义（使用 spawn 的 args 数组，无需 shell 转义）
- prompt 过长 → CLI 自身会处理截断，UI 层已限制 2000 字符

**验收标准**：
- [ ] 设置持久化系统提示词后，每次发送消息 CLI 接收到 `--append-system-prompt`
- [ ] 设置临时覆盖后，CLI 使用临时提示词而非持久化提示词
- [ ] 未设置任何提示词时，不传递该参数
- [ ] 包含特殊字符的提示词正确传递

## 非功能需求

- **性能**：无额外性能开销，仅增加一个 CLI 启动参数
- **安全**：系统提示词内容不应包含 API key 等敏感信息（UI 层不做强制校验，但在帮助文本中提醒）
- **可访问性**：文本域支持 Tab 导航，预设按钮有 aria-label
- **兼容性**：Windows / macOS / Linux

## 成功指标

- 用户可通过预设按钮 2 秒内切换 Claude 的行为风格
- 系统提示词在下次会话中自动生效，无需每次手动设置
- 临时覆盖不影响持久化设置

## 优先级

- **P0**：设置页文本域 + CLI 参数注入（核心功能闭环）
- **P1**：常用预设快速选择
- **P1**：当前会话临时覆盖
- **P2**：自定义预设管理

## 涉及文件

| 文件路径 | 操作 | 说明 |
|---------|------|------|
| `src/main/pty/stream-bridge.ts` | 修改 | CliSendMessageArgs 增加 appendSystemPrompt，注入 CLI 参数 |
| `src/renderer/components/settings/SettingsPanel.tsx` | 修改 | 新增 Advanced Tab |
| `src/renderer/components/settings/SettingsAdvanced.tsx` | 新建 | 系统提示词配置面板 |
| `src/renderer/components/chat/ChatHeader.tsx` | 修改 | 增加临时覆盖按钮 |
| `src/renderer/store/index.ts` | 修改 | prefsStore 增加 appendSystemPrompt；chatStore 增加 tempSystemPrompt |
| `src/renderer/hooks/useStreamJson.ts` | 修改 | 发送消息时注入 appendSystemPrompt 参数 |
| `i18n/locales/en.json` | 修改 | 新增 systemPrompt 相关翻译键 |
| `i18n/locales/zh-CN.json` | 修改 | 新增 systemPrompt 相关翻译键 |

## 后端需求

本功能的后端修改量较小：

1. **`stream-bridge.ts` 参数扩展**：
   - `CliSendMessageArgs` 增加 `appendSystemPrompt?: string`
   - `sendMessage` 方法中将其注入 `--append-system-prompt` 参数
   - 这是 Superpower Plan P0-2（CLI 启动参数统一管理）的一部分

2. **无需新增 IPC**：系统提示词通过 electron-store 的 `prefs:set/get` 管理，临时覆盖存在 renderer 内存中

## 冲突分析

| 冲突资源 | 冲突方 | 策略 |
|---------|--------|------|
| `stream-bridge.ts` | prd-effort-control, prd-compact, prd-tool-filter | **串行执行**：每个 PRD 各自向 CliSendMessageArgs 增加新字段，需依次合并 |
| `store/index.ts` | 多个 PRD | prefsStore 增加字段（低冲突），chatStore 增加 tempSystemPrompt |
| `SettingsPanel.tsx` | prd-permissions-ui (Permissions Tab), prd-hooks-ui (Hooks Tab) | **不冲突**：本 PRD 增加 Advanced Tab，各自独立 Tab |
| `ChatHeader.tsx` | 无已知冲突 | 独立增加按钮 |
| `i18n/locales/*.json` | 所有 PRD | **i18n 条目需由 leader 统一合并** |

## 依赖与风险

| 依赖项 | 负责方 | 风险等级 |
|--------|--------|----------|
| CLI `--append-system-prompt` 参数 | CLI 团队 | 低 — 参数已稳定 |
| stream-bridge CliSendMessageArgs 扩展 | 工程 | 低 — 增加一个可选字段 |
| Persona systemPrompt 共存 | 工程 | 中 — 需明确两者优先级 |

## 开放问题

- [ ] 当 Persona 的 systemPrompt 和本功能的 appendSystemPrompt 同时生效时，优先级如何？建议：Persona prompt 通过 `--system-prompt` 传入，本功能通过 `--append-system-prompt` 传入，两者叠加
- [ ] 是否需要支持 `--system-prompt`（完全替换）？建议 v1 仅支持 append 模式，降低用户误操作风险

## 执行顺序建议

1. **P0 - stream-bridge 参数扩展**（CliSendMessageArgs + CLI 参数注入）
2. **P0 - 设置页 Advanced Tab**（文本域 + 持久化）
3. **P1 - 预设按钮**（Chips 组件 + 预设数据）
4. **P1 - 会话临时覆盖**（ChatHeader 按钮 + chatStore tempSystemPrompt）

可与 prd-permissions-ui 并行执行（不同 Tab，不同文件）。但需注意与 prd-effort-control、prd-tool-filter 的 stream-bridge.ts 串行。
