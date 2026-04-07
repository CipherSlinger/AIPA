# PRD：剪贴板即时动作增强
_版本：v1 | 状态：Draft | PM：aipa-pm | 日期：2026-04-03_

## 一句话定义
增强粘贴时的内容感知能力：自动检测剪贴板内容类型（代码、URL、图片），弹出针对性的快速动作气泡，让用户无需手动组织 prompt 就能一键完成常见操作。

## 背景与动机
AIPA 已有两套剪贴板相关功能：
1. **ClipboardActionsMenu**（输入工具栏按钮）：点击粘贴图标 → 弹出固定的 5 项动作菜单（summarize/translate/rewrite/explain/grammar），对剪贴板文本执行预设 prompt
2. **usePasteDetection + ChatInputPasteChips**：粘贴时检测 URL 和长文本，在输入框上方显示 action chips（summarize/explain/translate）

**痛点**：
- 现有检测不区分**代码**和**普通文本**，粘贴一段 Python 代码时显示的"summarize/translate"动作与用户意图不匹配
- 粘贴图片时只有 useImagePaste 处理（插入 base64），缺乏"描述这张图"、"OCR 提取文字"等快速动作
- ClipboardActionsMenu 和 PasteChips 是两套独立系统，动作定义分散在 `chatInputConstants.ts` 和 `usePasteDetection.ts`，缺乏统一的内容类型路由

**产品方向对齐**：此 PRD 属于"个人助手"方向 — 将 AIPA 从"被动等待 prompt"升级为"主动提供最佳动作建议"。

## 目标用户
- **主要**：跨应用工作的用户 — 从浏览器/IDE/文档工具复制内容到 AIPA，需要快速处理
- **次要**：开发者用户 — 频繁复制代码片段，需要 review/explain/refactor 动作

## 用户故事
作为一个在多个应用间切换工作的用户，
我希望粘贴内容到 AIPA 时，它能自动识别我粘贴的是代码、URL 还是图片，并提供最相关的快速操作，
以便我一键完成处理而不需要手动编写 prompt。

## 功能范围

### In Scope（本版本包含）
1. **内容类型检测引擎**：统一的剪贴板内容分类逻辑，区分 code/URL/image/long-text/short-text 五种类型
2. **类型感知动作气泡**：根据检测到的内容类型，显示不同的快速动作选项（替代当前的通用 chips）
3. **代码类型专用动作**：粘贴代码时显示 review/explain/refactor/find-bugs 动作
4. **动作系统统一**：合并 ClipboardActionsMenu 和 PasteChips 的动作定义到统一的注册表

### Out of Scope（本版本不包含）
- **全局快捷键 Ctrl+Shift+G 重构**：当前快捷键直接发送剪贴板到聊天，重构为打开动作面板是独立功能，推迟
- **图片 OCR 提取**：需要 OCR 引擎集成，复杂度高
- **自定义动作**：允许用户自定义快速动作模板，推迟到 v2
- **语言/框架自动检测**：粘贴代码时自动识别编程语言（如 Python/JavaScript），推迟到 v2

## 功能详述

### 功能模块 1：内容类型检测引擎

**描述**：在 `usePasteDetection` hook 中增加统一的内容类型分类逻辑，将粘贴内容归类为五种类型之一。

**分类规则**（按优先级顺序判断）：

| 类型 | 检测条件 | 说明 |
|------|----------|------|
| `image` | `clipboardData.files` 包含图片文件 | 已有 useImagePaste 处理 |
| `url` | 文本匹配 URL 正则且长度 < 500 字符 | 已有检测逻辑 |
| `code` | 文本包含代码特征（见下方规则） | 新增 |
| `long-text` | 纯文本且长度 > 500 字符 | 已有检测逻辑 |
| `short-text` | 以上均不匹配 | 默认类型，不触发动作气泡 |

**代码检测启发规则**（满足 2 项以上判定为代码）：
- 包含常见语法关键词：`function`、`class`、`import`、`const`、`let`、`var`、`def`、`return`、`if`、`for`、`while`
- 包含编程符号组合：`() =>`、`{}` 成对出现、`===`、`!==`、`//`、`/*`、`#include`、`::`
- 缩进模式：连续 2+ 行以空格或 tab 缩进开头
- 行尾分号或花括号比例 > 30%

**边界条件**：
- 混合内容（代码 + 自然语言注释）：按代码类型处理（代码特征权重更高）
- URL 内嵌在长文本中：优先归类为 `url`（显示 URL 动作），长文本动作作为次要选项
- 空字符串或仅空白字符：不触发任何动作

**验收标准**：
- [ ] 粘贴 `const x = () => { return 42 }` 识别为 `code` 类型
- [ ] 粘贴 `https://example.com/path` 识别为 `url` 类型
- [ ] 粘贴一段 800 字的中文散文识别为 `long-text` 类型
- [ ] 粘贴 `hello world`（短文本）不触发动作气泡
- [ ] 粘贴图片文件识别为 `image` 类型

### 功能模块 2：类型感知动作气泡

**描述**：根据检测到的内容类型，在输入框上方显示不同的快速动作选项。替代当前 ChatInputPasteChips 中的通用 action chips。

**各类型对应的动作列表**：

| 内容类型 | 动作选项 |
|----------|----------|
| `code` | Review / Explain / Refactor / Find Bugs |
| `url` | Summarize / Explain / Translate（保持现有） |
| `long-text` | Summarize / Rewrite / Key Points（保持现有 + 新增 Key Points） |
| `image` | Describe / Extract Text（图片已插入输入框后显示） |

**交互逻辑**：
1. 用户粘贴内容 → 内容类型检测 → 在输入框上方显示对应类型的动作 chips
2. 动作 chips 样式与现有 PasteChips 一致（蓝色描边药丸形状）
3. 内容类型标签（小字）显示在 chips 行左侧，如 `Code detected` / `URL detected`
4. 点击动作 → 将动作对应的 prompt 模板 + 粘贴内容组合为完整 prompt → 发送到聊天
5. 动作 chips 在 10 秒后自动消失，或在用户发送消息后消失

**边界条件**：
- 连续快速粘贴多次：以最后一次粘贴的类型为准，重置计时器
- 用户手动编辑粘贴内容后再点击动作：使用编辑后的完整输入框内容
- 粘贴在非空输入框中：仍然检测并显示动作（对新粘贴的部分）

**验收标准**：
- [ ] 粘贴代码后，显示 Review / Explain / Refactor / Find Bugs 四个动作 chips
- [ ] 粘贴 URL 后，显示 Summarize / Explain / Translate 三个动作 chips
- [ ] 粘贴长文本后，显示 Summarize / Rewrite / Key Points 三个动作 chips
- [ ] chips 左侧显示内容类型标签（如 "Code detected"）
- [ ] 点击 "Review" 动作后，输入框内容被替换为 review prompt + 代码，并发送
- [ ] 动作 chips 在 10 秒后自动消失
- [ ] 发送消息后动作 chips 消失

### 功能模块 3：动作注册统一

**描述**：将 ClipboardActionsMenu 和 PasteChips 中分散的动作定义合并到 `chatInputConstants.ts` 的统一动作注册表中。

**交互逻辑**：
- 在 `chatInputConstants.ts` 中定义 `PASTE_ACTIONS` 注册表，每个动作包含：
  - `id`: 唯一标识
  - `labelKey`: i18n 键
  - `icon`: Lucide 图标组件
  - `contentTypes`: 适用的内容类型数组
  - `template` / `templateEn` / `templateZh`: prompt 模板
- ClipboardActionsMenu 和 PasteChips 都从这个注册表读取动作
- ClipboardActionsMenu 按钮点击时，先检测剪贴板内容类型，仅显示匹配的动作

**边界条件**：
- 向后兼容：现有 `CLIPBOARD_ACTIONS` 常量保留为别名，确保不破坏已有引用

**验收标准**：
- [ ] `chatInputConstants.ts` 中存在统一的 `PASTE_ACTIONS` 注册表
- [ ] ClipboardActionsMenu 的动作列表从 `PASTE_ACTIONS` 读取
- [ ] PasteChips 的动作列表从 `PASTE_ACTIONS` 按 `contentTypes` 过滤
- [ ] 新增代码类动作（review/explain/refactor/find-bugs）在注册表中定义
- [ ] 现有的剪贴板功能（summarize/translate/rewrite/explain/grammar）不受影响

## 非功能需求
- **性能**：内容类型检测在粘贴事件回调中同步完成（纯字符串分析，无网络请求），不阻塞输入
- **安全**：prompt 模板中用户内容使用 `{text}` 占位符替换，不进行代码执行
- **可访问性**：动作 chips 可通过 Tab 键聚焦，Enter 键触发；类型标签使用 `aria-label` 标注
- **兼容性**：Windows 10/11，Electron 39+

## 成功指标
- 粘贴代码时，用户可一键触发 review/explain 而非手动编写 prompt
- 动作气泡的内容与粘贴内容类型匹配率 > 90%
- ClipboardActionsMenu 和 PasteChips 的动作定义归一，消除重复

## 优先级
- **P0**：内容类型检测引擎 + 类型感知动作气泡 — 核心用户价值
- **P1**：动作注册统一 — 代码架构优化，减少维护成本
- **P2**：图片类型动作（Describe / Extract Text）— 依赖图片粘贴流程改造

## 技术备注

**涉及文件清单**：
| 文件 | 变更类型 | 风险等级 |
|------|----------|----------|
| `src/renderer/components/chat/usePasteDetection.ts` | 增加代码检测逻辑，返回内容类型 | 中 |
| `src/renderer/components/chat/chatInputConstants.ts` | 新增 `PASTE_ACTIONS` 统一注册表 + 代码类动作模板 | 中 |
| `src/renderer/components/chat/ChatInputPasteChips.tsx` | 根据内容类型过滤显示不同动作 | 中 |
| `src/renderer/components/chat/ClipboardActionsMenu.tsx` | 改为从 `PASTE_ACTIONS` 读取动作 | 低 |
| `src/renderer/i18n/locales/en.json` | 新增 `paste.*` 命名空间 | 低 |
| `src/renderer/i18n/locales/zh-CN.json` | 对应中文翻译 | 低 |

**需要新增的 i18n 键**（`paste` 命名空间）：
- `paste.codeDetected` — "Code detected"
- `paste.urlDetected` — "URL detected"（复用现有 `chat.urlAction.*` 也可，但建议统一命名）
- `paste.longTextDetected` — "Long text detected"
- `paste.imageDetected` — "Image detected"
- `paste.review` — "Review"
- `paste.explain` — "Explain"
- `paste.refactor` — "Refactor"
- `paste.findBugs` — "Find Bugs"
- `paste.keyPoints` — "Key Points"
- `paste.describe` — "Describe"
- `paste.extractText` — "Extract Text"

**i18n 注意**：本 PRD 涉及 i18n 文件修改，若与其他 PRD 并行执行，i18n 条目需由 leader 统一合并。

**不涉及 IPC / 后端变更**（纯前端功能）。

## 依赖与风险
| 依赖项 | 负责方 | 风险等级 |
|--------|--------|----------|
| 现有 usePasteDetection hook | 前端 | 低（扩展现有逻辑） |
| 现有 chatInputConstants.ts | 前端 | 低（新增常量） |
| 现有 useImagePaste hook | 前端 | 低（图片检测协调） |

## 开放问题
- [ ] 代码检测的误判率可接受到多少？建议：宁可漏检也不误判（误将邮件判为代码比漏检代码体验更差）
- [ ] 是否需要在设置中提供「关闭粘贴动作检测」的开关？建议 v1 不提供，根据用户反馈决定。

## 执行顺序建议
- P0 内容类型检测 + 类型感知气泡：核心功能，应优先实现
- P1 动作注册统一：可与 P0 同步实现（主要是代码重构）
- P2 图片动作：依赖图片粘贴流程，可推迟
- 预估总改动量：约 150-250 行代码变更，2-3 次迭代完成
