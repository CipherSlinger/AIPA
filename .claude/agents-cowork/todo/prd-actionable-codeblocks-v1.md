# PRD: 可执行代码块 — AI 输出一键行动

_版本：v1 | 状态：Draft | PM：aipa-pm | 日期：2026-04-06_

## 一句话定义

让 AI 回复中的代码块和 Shell 命令从"只读文本"变成"一键可执行"，用户可以直接运行命令、保存代码到文件、或复制文件路径。

## 背景与动机

AIPA 的核心定位是"驾驶舱" -- 底层 Claude Code CLI 具备读文件、写文件、执行命令的全套能力。但目前 AI 回复中的代码块仅有 Copy 和 Preview（HTML/SVG）两个动作按钮，用户看到一段 Shell 命令后，仍然需要：

1. 复制命令 → 切换到终端面板 → 粘贴 → 回车
2. 复制代码 → 打开文件管理器 → 新建文件 → 粘贴 → 保存

这与 AIPA "随需随做" 的产品承诺相矛盾。Cursor 和 VS Code Claude 插件均提供"Apply"按钮将代码变更直接写入文件。ChatGPT Desktop 虽然不支持执行，但 AIPA 拥有桌面原生 + CLI 执行引擎的独特优势 -- 这是最能体现差异化的功能方向。

此外，I462 产品方向备忘录中已明确识别"actionable response blocks"为关键差异化方向，但至今未实现。

## 目标用户

**主要**：开发者 -- 日常与 CLI 命令和代码片段打交道，执行效率是核心诉求
**次要**：技术运维人员 -- 需要快速执行诊断命令和脚本

## 用户故事

作为一个使用 AIPA 进行开发工作的用户，
我希望能够一键运行 AI 建议的 Shell 命令、一键将代码保存到指定文件，
以便不中断思路地完成 AI 辅助的工作流。

## 功能范围

### In Scope（本版本包含）

1. **Shell 命令运行按钮**：bash/sh/zsh/powershell/cmd 代码块显示 "Run" 按钮
2. **代码保存到文件按钮**：所有代码块显示 "Save" 按钮，可选择保存路径
3. **文件路径快捷操作**：AI 回复中提到的文件路径（如 `/home/user/project/src/index.ts`）可点击打开

### Out of Scope（本版本不包含，说明原因）

- **代码 Apply/Diff 合并**：将代码变更直接 Apply 到已有文件的 diff 合并 -- 需要复杂的 AST 或行级匹配逻辑，属于独立 PRD
- **多命令批量执行**：一次性运行多个代码块 -- 安全风险较高，暂不支持
- **代码块内编辑**：在代码块内修改代码后再执行 -- 增加 UI 复杂度，v2 考虑

## 功能详述

### 功能 1：Shell 命令运行按钮

**描述**：当代码块的语言标记为 `bash`、`sh`、`zsh`、`shell`、`powershell`、`cmd` 时，在代码块头部的操作栏中显示一个 "Run" 按钮（Play 图标）。

**交互逻辑**：
- 点击 Run → 弹出确认对话框："即将在 [workingDir] 中执行此命令，确认？"（显示完整命令预览）
- 确认后 → 通过 `pty:create` + `pty:write` 将命令发送到终端面板执行
- 执行期间 → 按钮变为 Spinner 状态，终端面板自动展开（如果关闭的话）
- 执行完成 → 按钮恢复，显示绿色 Check 图标 2 秒

**边界条件**：
- 无工作目录设置 → 提示用户先在设置中配置 workingDir
- 多行命令（含 `&&` 或 `\` 续行）→ 整体作为一条命令发送
- 命令执行失败 → 终端中显示错误输出，Run 按钮显示红色 X 图标 2 秒
- 危险命令检测（`rm -rf`、`format`、`del /f`）→ 确认对话框显示红色警告文案

**验收标准**：
- [ ] bash/sh/zsh/shell/powershell/cmd 代码块显示 Run 按钮
- [ ] 其他语言代码块不显示 Run 按钮
- [ ] 点击 Run 弹出确认对话框，显示命令内容和执行目录
- [ ] 确认后命令在终端面板中执行
- [ ] 终端面板自动展开（如果之前关闭）
- [ ] 危险命令（rm -rf、format 等）显示红色警告

### 功能 2���代码保存到文件

**描述**：所有代码块在操作栏中显示 "Save" 按钮（Download 图标）。点击后弹出保存对话框，让用户选择保存路径和文件名。

**交互逻辑**：
- 点击 Save → 打开系统原生"保存文件"对话框（通过 `dialog.showSaveDialog` IPC）
- 文件名默认值：根据语言标记推断扩展名（如 `python` → `.py`，`javascript` → `.js`）
- 保存成功 → toast 提示 "已保存到 [路径]"
- 如果代码块上方的 AI 文本中提到了文件路径（如 "create `src/utils/helper.ts`"）→ 自动填入该路径作为默认值

**边界条件**：
- 用户取消保存对话框 → 无操作
- 写入权限不足 → 显示错误 toast
- 文件已存在 → 系统对话框原生处理覆盖确认

**验收标准**：
- [ ] 所有代码块显示 Save 按钮
- [ ] 点击 Save 打开系统保存对话框
- [ ] 文件名默认扩展名匹配代码语言
- [ ] 保存成功后显示 toast 提示（含完整路径）
- [ ] 保存失败时显示错误 toast

### 功能 3：文件路径可点击

**描述**：在 AI 回复的正文文本中，自动识别文件路径模式并渲染为可点击链接。

**交互逻辑**：
- 识别模式：
  - 绝对路径：`/home/...`、`C:\...`、`D:/...`
  - 相对路径（在反引号内）：`` `src/components/App.tsx` ``、`` `./package.json` ``
- 点击路径 → 通过 `shell:openExternal` 或 `shell:showItemInFolder` 在系统文件管理器中打开
- 路径样式：带下划线 + 文件图标，hover 时显示 "在文件管理器中打开"

**边界条件**：
- 路径不存在 → 点击后显示 toast "文件不存在"
- URL（http/https）不触发此功能 → 已有 URLPreviewCard 处理
- 代码块内的路径不触发 → 仅处理正文文本中的路径

**验收标准**：
- [ ] AI 回复正文中的绝对路径自动变为可点击链接
- [ ] 反引号内的相对路径自动变为可点击链接
- [ ] 点击路径在系统文件管理器中打开对应位置
- [ ] 路径不存在时显示错误提示
- [ ] 代码块内的路径不受影响

## 非功能需求

- **安全**：Shell 命令执行必须经过用户确认，不可静默执行
- **安全**：危险命令模式检测需覆盖常见破坏性命令（rm -rf、format、del /f/s、dd if=）
- **性能**：文件路径正则匹配不应导致渲染卡顿（需避免在每次 render 时重复执行复杂正则）
- **可访问性**：所有按钮需有 aria-label

## 成功指标

- Run 按钮使用频率（代表用户信任度和执行效率提升）
- Save 按钮使用频率
- 文件路径点击率

## 优先级

- **P0**：Shell 命令 Run 按钮 + 确认对话框 + 终端执行
- **P0**：代码保存到文件（Save 按钮 + 保存对话框）
- **P1**：文件路径可点击
- **P1**：危险命令警告

## 涉及文件与风险

| 文件 | 变更类型 | 风险 |
|------|---------|------|
| `components/chat/CodeBlock.tsx` | 修改 -- 添加 Run/Save 按钮 | **中** -- 需要重构操作栏布局 |
| `components/chat/RunConfirmDialog.tsx` | **新建** -- 命令确认对话框 | 低 |
| `components/chat/MessageContent.tsx` | 修改 -- 文件路径识别和渲染 | 中 |
| `preload/index.ts` | 修改 -- 暴露 `fs:saveFile` IPC | **高** -- 共享文件 |
| `main/ipc/index.ts` | 修改 -- 添加 `fs:saveFile` handler | **高** -- 共享文件 |
| `i18n/locales/en.json` | 修改 | 低 |
| `i18n/locales/zh-CN.json` | 修改 | 低 |

**注意**：本 PRD 涉及 `preload/index.ts` 和 `main/ipc/index.ts`，与同批次其他 PRD 存在潜在冲突。**不应与涉及 ipc/preload 的其他 PRD 并行执行**。

## 后端需求

本 PRD 需要主进程修改：

1. **新增 `fs:saveFile` IPC channel**：
   - 输入：`{ filePath: string, content: string }`
   - 行为：使用 `fs.writeFile` 写入文件内容
   - 输出：`{ success: boolean, error?: string }`

2. **新增 `fs:showSaveDialog` IPC channel**（如果尚不存在）：
   - 输入：`{ defaultPath?: string, filters?: { name: string, extensions: string[] }[] }`
   - 行为：调用 `dialog.showSaveDialog`
   - 输出：`{ filePath?: string, canceled: boolean }`

3. **新增 `fs:pathExists` IPC channel**：
   - 输入：`{ filePath: string }`
   - 行为：检查路径是否存在
   - 输出：`boolean`

4. **使用已有 `pty:create` + `pty:write`** 执行 Shell 命令（无需新增 channel）

## 依赖与风险

| 依赖项 | 负责方 | 风险等级 |
|--------|--------|----------|
| 新增 3 个 IPC channel | 工程（后端） | 中 |
| 终端面板自动展开 | 工程（前端） | 低 -- uiStore 已有 terminalOpen 状态 |
| 文件路径正则准确性 | 工程 | 中 -- 需覆盖 Windows/Linux 路径格式 |

## 开放问题

- [ ] Run 按钮执行的命令是否也应记入会话历史？暂不记入，仅在终端面板中执行
- [ ] 是否需要"在新 PTY 中执行"vs"在已有 PTY 中执行"的选择？初版使用已有 PTY，若无则创建新 PTY

## 实现建议

1. **CodeBlock.tsx 扩展**：在现有的 CopyButton 旁添加 RunButton（条件渲染，仅 shell 语言）和 SaveButton（所有语言）。建议将操作栏提取为独立的 `CodeBlockActions.tsx` 组件。

2. **RunConfirmDialog**：复用现有的对话框样式（参考 RewindDialog.tsx），显示命令预览 + 工作目录 + 确认/取消按钮。

3. **文件路径识别**：在 MessageContent.tsx 的 Markdown 渲染后处理中，对文本节点应用路径正则，将匹配项替换为 `<a>` 标签。建议使用 `useMemo` 缓存正则结果。

---

_执行顺序建议：本 PRD 的 P0 功能（Run + Save 按钮）可与 prd-conversation-tabs-v1 并行执行，因为涉及的文件无重叠（本 PRD 主要在 CodeBlock/MessageContent，tabs PRD 主要在 ChatPanel/chatStore）。但需注意 i18n 文件只能由一份 PRD 持有 -- 建议本 PRD 持有 i18n 更新权，tabs PRD 的 i18n 条目由 leader 统一合并。_
