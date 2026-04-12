<p align="center">
  <h1 align="center">AIPA</h1>
  <p align="center">
    <strong>AI 个人助手 — 你的全天候桌面智能代理</strong><br/>
    随问随答，随需随做，事事搞定。
  </p>
  <p align="center">
    <img src="https://img.shields.io/badge/平台-Windows-blue" alt="平台" />
    <img src="https://img.shields.io/badge/Electron-39-47848F" alt="Electron" />
    <img src="https://img.shields.io/badge/React-18-61DAFB" alt="React" />
    <img src="https://img.shields.io/badge/TypeScript-strict-3178c6" alt="TypeScript" />
    <img src="https://img.shields.io/badge/i18n-EN%20%7C%20%E4%B8%AD%E6%96%87-brightgreen" alt="i18n" />
  </p>
</p>

---

AIPA 不是一个聊天窗口，而是一个真正驻留在你桌面上的**智能代理** — 读写你的文件，执行 Shell 命令，浏览网页，将任务串联成工作流，并跨会话记住上下文。底层通过驱动 [Claude Code](https://claude.ai/code) CLI 作为执行引擎，外包一层精心打磨的 Electron + React 驾驶舱，支持 Claude、OpenAI、DeepSeek、Ollama 以及任意 OpenAI 兼容提供商。

> **Claude Code CLI 是引擎，AIPA 是驾驶舱。**

---

## AIPA 能做什么

| | |
|---|---|
| **对话与执行** | 全功能对话 AI，带工具调用可视化 — 实时看到代理读取文件、运行代码、浏览网页的每一步 |
| **持久记忆** | 跨会话的持久记忆 — 偏好、事实、指令、上下文自动注入每次对话 |
| **工作流** | 将提示词串联成可复用的多步骤流水线，内含常用任务的预设模板 |
| **笔记** | Markdown 笔记本，带分类、模板和一键从聊天保存 |
| **多模型** | 会话中途随时切换 Claude、GPT-4、DeepSeek 或本地 Ollama 模型，千问通过二维码扫码快速接入 |
| **随时待命** | 系统托盘快捷操作、全局快捷键（`Ctrl+Shift+Space` 唤起、`Ctrl+Shift+G` 剪贴板提问）、桌面通知 |
| **任务与提醒** | 快速待办列表（**三状态**：待办/进行中/已完成，全部完成后 5 秒自动隐藏）、一次性定时提醒 + **Cron 循环提醒**（5 字段表达式，人类可读频率标签，带预设选择器）、每日简报 |
| **通道** | 通过 OpenClaw 接入飞书和微信消息通道 — 从侧边栏配置、测试和管理 |

---

## 功能亮点

### 对话
- **Stream-JSON 聊天**，带实时工具调用卡片 — 每次文件读取、命令执行、网页请求都一目了然
- **工具使用摘要标签** — 连续工具调用自动分组，折叠显示人类可读的操作摘要
- **结构化 Diff 视图** — 文件编辑和写入操作以 LCS 统一 Diff 格式展示，色彩编码增/删行，可折叠大型差异
- **自定义系统提示词** — 设置 → 高级 Tab 配置持久追加提示词（2000 字符上限，6 个预设），ChatHeader 一键设置会话临时覆盖；有效提示词优先级：临时 > 持久，通过 `--append-system-prompt` 注入 CLI
- **扩展思考**块，可折叠，流式传输时自动展开；StatusBar 一键开关
- **输出风格** — 三种回复风格（默认/详细解释/教学模式），工具栏快速切换
- **自动压缩** — 上下文窗口接近容量上限时自动摘要较早消息，保持对话流畅（阈值可调 60%-90%）；压缩前先通过 **Microcompact** 预处理截断过长内容，减少输入 Token；**时间差 Microcompact** 自动清理空闲 30 分钟以上的过期工具调用结果
- **上下文压缩按钮（Context Compact）** — TokenUsageBar 在上下文使用率 ≥ 75% 时显示橙色 COMPACT 按钮，≥ 90% 时切换为红色警示；点击直接向 CLI stdin 发送 `/compact` 命令，防止因 context 满额导致对话中断
- **上下文建议** — 上下文使用率超过 70% 时，通过灯泡图标弹窗显示各工具（Shell 输出、文件读取、网页请求）的优化建议及预计节省 Token 数
- **离开摘要** — 离开 5 分钟以上后返回，自动在对话中注入当前上下文的紫色摘要卡片
- **对话回滚** — 右键助手消息 → "回退到此处"，将对话裁剪至该时间点并同步持久化存储；确认对话框防止误操作
- **消息键盘导航** — `Ctrl+Up/Down` 逐条浏览消息，`Ctrl+Home/End` 跳转首尾，带视觉焦点指示器
- **编辑与重新生成**任意消息；重新生成前可切换模型
- **朗读**（Web Speech API）；**引用回复**（选中文本即可引用）
- **权限提示** — 任何破坏性工具操作前显示友好的允许/拒绝卡片
- **权限建议** — 权限卡片内嵌 CLI 推送的"始终允许（规则）"/"始终拒绝"快捷按钮，一键创建持久权限规则，无需进入设置
- **权限模式选择器（Permission Mode）** — 取代默认的全量跳过权限模式，设置中提供 5 级权限控制（Default / Accept Edits / Don't Ask / Plan Only / Bypass Permissions），通过 `--permission-mode` 参数正确传递给 CLI，让用户精确掌控工具执行风险
- **工具审批对话框（Tool Approval Dialog）** — 感知权限模式的实时工具审批弹窗，监听 Zustand store 中待处理的 PermissionMessage；bypassPermissions/dontAsk 模式下自动通过，其他模式下以对话框形式请求用户允许/拒绝
- **钩子回调审批** — PreToolUse/PostToolUse 钩子脚本需要用户介入时，在聊天中内联显示批准/阻止卡片；支持可选原因文本框；响应实时回传给 CLI
- **MCP 信息采集** — MCP 服务器请求用户输入时，在聊天中内联显示表单卡片；支持 Schema 驱动的结构化字段或自由文本，以及浏览器 URL 跳转流程；提交/拒绝/取消均实时回传给服务器
- **会话初始化感知** — 解析 CLI `system.init` 事件，ChatHeader 实时显示实际生效模型名、MCP 连接状态（绿点=已连接/红点=失败）及可用工具列表，通过新增 IPC 通道 `cli:systemInit` 从主进程推送至渲染器；渲染器 store 同步更新 `activeModel` 和 `activeMcpServers` 字段
- **CLI 通知 Toast** — 订阅 `cli:notification` IPC 通道，将 CLI stream-JSON `notification` 事件实时呈现为应用内 info toast 弹窗
- **系统诊断** — 一键检查 CLI、API 密钥、网络、磁盘空间和系统负载
- **关于页版本信息** — 同时显示 App 版本和 CLI 版本双徽章，并展示构建日期与 Git Commit Hash；Runtime 区新增 App 和 CLI 版本行，版本信息通过 Vite `define` 在编译期注入
- **启动保护** — IPC 预注册消除竞态、非阻塞菜单构建、10 秒硬性闪屏超时、渲染器错误恢复、偏好设置重置，全方位杜绝卡死

### 输入增强工具
- **Slash 命令**（`/`）含客户端命令：`/vim` 切换 Vim 编辑模式、`/fast` 切换至 Haiku 快速模型、`/output-style` 循环切换回复风格、`/statusline` 切换状态栏显示；**@提及**文件选择器
- **文本片段** — `::关键词` 触发展开可复用文本块
- **文本变换** — 一键变正式、随意、更短、更长或修正语法
- **内联计算器** — 输入 `= 42 * 1.18`，按 Tab 插入结果
- **任务队列** — 排队多条指令依次自动执行
- **Vim 模态编辑** — 通过 `/vim` 指令激活；输入框支持 Vim 插入/普通模式；方向键 `h/j/k/l`、单词跳转 `w/b`、行首尾 `0/$`、删除 `x`/`dd`、撤销 `u`、插入 `i`/`a`/`I`/`A`；输入区显示 NORMAL/INSERT 模式标识

### 会话管理
- 浏览、搜索、标签、置顶、批量删除历史会话
- **会话快速切换器**（`Ctrl+K`）— 模糊搜索最近会话，键盘操作快速跳转
- **会话固定备注** — 每个会话可添加置顶备注，显示在聊天顶部
- **跨会话搜索**（`Ctrl+Shift+F`）扫描所有 JSONL 历史文件
- **会话变更面板** — 查看当前会话中修改的文件
- **可折叠日期分组** — 会话按时间自动分组（今天/昨天/本周/更早），支持折叠展开，每组显示会话数量
- **紧凑视图** — 一键切换紧凑模式，隐藏头像和预览，仅显示标题，提升信息密度
- **排序下拉菜单** — 弹出式菜单一键选择排序方式（最新/最旧/字母/消息数），替代循环点击
- **上下文窗口监控** — 进度条 + 百分比标签 + 详情弹窗，实时显示上下文使用量，接近上限时一键新建会话
- **流式光标** — AI 回复流式输出时显示闪烁光标，回复结束即消失
- **会话计数标记** — 历史导航标签显示总会话数，AI 流式回复时从其他标签页可看到活动脉冲指示器
- **会话分叉** — 右键任意消息 → "从此处分叉"，弹出命名对话框，新会话包含该消息前的完整历史；分叉会话显示在侧边栏并标记来源
- 导出为 Markdown、HTML 或 JSON

### 角色与记忆
- 最多 10 个自定义 AI 角色，每个有名称、Emoji、模型、系统提示词和标记颜色
- **预设角色国际化** — 5 个内置角色名称跟随系统语言自动切换
- 记忆自动注入每次对话 — 置顶条目 + 最近 10 条
- **自动记忆提取** — 开启后自动从对话中提取偏好、事实、指令等持久记忆
- **记忆类型标签** — 4 种语义类型（用户/反馈/项目/参考）与颜色徽章，对齐 Claude Code 记忆分类体系
- **项目记忆分区** — 记忆面板新增"项目"标签页，直接读写 `.claude/MEMORY.md`，与 Claude Code 项目记忆系统互通
- **记住此内容** — 从悬停工具栏一键保存任意回复
- **情境化功能提示** — 欢迎页面智能推荐功能技巧，基于使用模式个性化展示
- **提示建议** — 每次 AI 回复后自动预测用户下一条消息，以虚影文字显示在输入框中，按 Tab 接受
- **投机执行（Speculative Execution）** — 在隔离沙箱中预执行预测的下一条提示词，以可折叠卡片预览回复内容、工具操作及受影响文件；接受即将结果注入对话，拒绝即静默丢弃，全程不污染主会话（设置中可选开启）
- **思考深度调节** — 低/中/高三档，控制 AI 的思考投入度
- **按模型成本明细** — StatusBar 点击费用即可查看各模型的 Token 用量和费用占比

### 工作流
- 可视化工作流编辑器，构建多步提示流水线
- **Canvas 画布模式** — 工作流步骤以节点图形式呈现，支持拖拽、平移、缩放；运行时实时高亮当前执行节点，进度条显示整体进度；鼠标位置为中心缩放、+/- 按钮与键盘快捷键（+/−/0）、状态色彩边（绿=完成/强调=进行中/灰=待机）、随画布移动的点阵背景、侧边栏显示真实 AI 输出；执行中边线流动动画；节点可折叠/展开（单节点按钮或全部折叠/展开），节点右键菜单支持复制提示词/输出；左侧步骤列表实时同步执行状态色彩，Run 按钮执行中自动禁用并显示进度；步骤搜索过滤（非匹配节点在画布中降低透明度）；节点和侧边栏显示每步执行耗时
  - **错误感知**（Direction 1）— 步骤执行失败/中止时，节点显示红色徽章和红色左边框；侧边栏状态区显示"执行失败"及错误提示；工具栏中止后可查看失败步骤详情
  - **节点位置持久化**（Direction 2）— 拖拽重排后节点坐标自动写入工作流存储（`canvasPos` 字段），重新打开画布时恢复上次布局，无需重新整理
  - **键盘导航**（Direction 3）— 在画布中使用 ↑↓ / Tab / Shift+Tab 在节点间移动焦点，无需鼠标点击即可逐步检查执行结果
  - **侧边栏实时流式输出**（Direction 4）— 执行中点击节点，侧边栏实时显示当前步骤的 AI 流式输出，末尾闪烁光标；完成后自动切换为最终结果
  - **节点标题内联编辑**（Direction 5）— 双击节点标题即可原地重命名，Enter 确认，Escape 取消，无需打开编辑器
  - **执行历史回放**（Direction 6）— 每次运行结果自动保存到本地（每工作流最多 10 条），画布左下角🕐按钮可选择历史记录，所有节点输出和耗时即时切换为历史数据
  - **起止节点视觉分化**（Direction 7）— 第一个节点左侧靛蓝边框 + ▶ 标记，最后一个节点琥珀色边框 + ⚑ 标记，流程起止一目了然
  - **视口裁剪**（Direction 8）— 画面外节点以轻量占位替代全渲染，大型工作流（50+ 步骤）滚动时帧率显著提升
  - **上下文感知工具栏**（Direction 9）— 执行中工具栏左侧出现红色"⏹ 中止"按钮；全部完成后显示绿色"▶ 再次运行"按钮；按钮随状态自动出现/消失
- 6 个内置预设工作流，开箱即用（周报、代码审查、每日总结等）
- **预设工作流国际化** — 名称和描述跟随系统语言自动切换

### 技能市场
- 来自 Anthropic、OpenClaw、ClawhHub 和社区的 47 个精选技能
- 内置市场一键安装；按来源和分类筛选
- 内置技能创建器，通过对话交互式设计自定义技能

### CLI 集成与自动化
- **钩子配置** — 设置 → 钩子 Tab 可视化管理所有 Claude Code CLI 钩子（PreToolUse、PostToolUse、Stop 等 27 种事件类型）；多步添加向导支持命令/HTTP/提示词/Agent 四种钩子类型；内联编辑、禁用全部钩子开关（disableAllHooks）；钩子触发次数徽章实时显示执行计数；钩子执行进度实时显示在聊天面板
- **MCP 服务器管理** — 设置 → MCP Tab 全面管理 MCP 服务器（stdio/http/sse 三种类型）；一键添加/删除/重连；工具列表展开查看；工具调用块自动显示 `[serverName]` 来源徽章
- **工具访问控制** — 设置 → 高级 Tab 的工具访问控制区域，4 种预设模式（全部工具/只读/无网络/仅分析）；按分类（执行、文件写入、文件读取、网络等）精细化启用/禁用每个工具；通过 `--disallowedTools` 注入 CLI
- **钩子回调审批** — PreToolUse/PostToolUse 钩子脚本需要用户介入时，在聊天中内联显示批准/阻止卡片；支持可选原因文本框；响应实时回传给 CLI
- **MCP 信息采集** — MCP 服务器请求用户输入时，在聊天中内联显示表单卡片；支持 Schema 驱动的结构化字段或自由文本，以及浏览器 URL 跳转流程；提交/拒绝/取消均实时回传给服务器

### 系统托盘与全局访问
- 最小化到系统托盘 — AIPA 在后台随时待命
- `Ctrl+Shift+Space` 在任意应用中切换窗口显示
- `Ctrl+Shift+G` 读取剪贴板并打开 AIPA，自动填入文本进行即时分析
- 右键托盘图标：新建对话、最近会话、主题切换、剪贴板提问
- 窗口失焦时回复完成后推送桌面通知

---

## 键盘快捷键

| 快捷键 | 操作 |
|--------|------|
| `Ctrl+N` | 新建对话 |
| `Ctrl+Shift+P` | 命令面板 |
| `Ctrl+F` | 搜索当前对话 |
| `Ctrl+Shift+F` | 全局跨会话搜索 |
| `Ctrl+Shift+R` | 重新生成回复 |
| `Ctrl+Shift+E` | 导出对话 |
| `Ctrl+Shift+K` | 压缩对话上下文 |
| `Ctrl+Shift+C` | 全部折叠/展开消息 |
| `Ctrl+Shift+B` | 切换书签面板 |
| `Ctrl+Shift+S` | 切换统计面板 |
| `Ctrl+Shift+D` | 切换主题（深色 / 浅色 / 跟随系统） |
| `Ctrl+Shift+L` | 切换语言（中/英） |
| `Ctrl+Shift+M` | 切换模型（Sonnet / Opus / Haiku） |
| `Ctrl+Shift+T` | 置顶窗口（始终在最前） |
| `Ctrl+K` | 会话快速切换器 |
| `Ctrl+Shift+O` | 专注模式（隐藏侧边栏和终端） |
| `Ctrl+B` | 切换侧边栏 |
| `Ctrl+,` | 打开设置 |
| `Ctrl+1–4` | 历史、文件、笔记、技能 |
| `Ctrl+5–7` | 记忆、工作流、通道 |
| `Ctrl+8` | 任务 |
| `Ctrl+/` | 快捷键速查表 |
| `Ctrl+Up/Down` | 逐条浏览消息（带焦点指示器） |
| `Ctrl+Home/End` | 跳转到首/末条消息 |
| `Alt+Up/Down` | 跳转到上/下一条用户消息 |
| `PageUp/Down` | 按页滚动消息列表 |
| `Ctrl+Shift+Space` | 切换 AIPA 窗口（全局快捷键，任意应用中可用） |
| `Ctrl+Shift+G` | 剪贴板快捷操作（全局：读取剪贴板，打开 AIPA，发送至对话） |

---

## 快速开始

```bash
git clone https://github.com/CipherSlinger/AIPA.git
cd AIPA/electron-ui
npm install
npm run build
node_modules/.bin/electron dist/main/index.js
```

首次启动后，按 `Ctrl+,` 打开**设置**，填入你的 Anthropic API 密钥。

### 开发模式（热更新）

```bash
# 终端 1
npm run build:main && npm run build:preload && npx vite

# 终端 2
NODE_ENV=development node_modules/.bin/electron dist/main/index.js
```

### 打包安装包

```bash
npm run dist:win   # → release/ 目录
```

---

## 环境要求

- Windows 10/11 x64
- Node.js 18+（需在 PATH 中）
- Anthropic API 密钥（[console.anthropic.com](https://console.anthropic.com/)）
- _可选：_ OpenAI 密钥、DeepSeek 密钥，或本地 [Ollama](https://ollama.ai/) 实例

---

## 项目结构

```
AIPA/
  package/          # 内置 Claude Code CLI（只读，已打包）
  electron-ui/
    src/
      main/         # Node.js：PTY 管理、stream-bridge、IPC、会话、配置
      preload/      # contextBridge → window.electronAPI
      renderer/     # React + Vite + Zustand + i18n
    dist/           # 编译产物（不提交）
```

CLI 通过两种模式桥接：

| 模式 | 面板 | 机制 |
|------|------|------|
| **PTY**（node-pty） | 终端 | 原始 ConPTY I/O → xterm.js |
| **Stream-JSON** | 对话 | NDJSON 事件 → 类型化 React 状态 |

---

## Design System

AIPA uses a unified glass-morphism design system:

- **Glass backgrounds**: `rgba(15,15,25,0.85–0.96)` with `backdropFilter: blur(12–20px)`
- **Text opacity ladder**: primary=0.82, secondary=0.60, muted=0.45, micro=0.38
- **Shadow system**: L1–L4 layered depth shadows
- **Indigo accent**: `#6366f1`/`#818cf8`/`#a5b4fc` throughout
- **Transitions**: Unified `0.15s ease` on all interactive elements
- **Tabular numbers**: All numeric displays use `fontVariantNumeric: tabular-nums`

---

## 安全

- API 密钥通过系统密钥链加密（`electron.safeStorage` / DPAPI）
- 严格内容安全策略 — 阻止 XSS 和未授权外部资源
- 沙箱化渲染进程 — 无直接 Node.js 访问
- IPC 路径验证 — 文件系统处理器检查允许目录白名单
- 净化 CLI 环境 — 子进程仅接收显式环境变量白名单

---

## 许可证

MIT
