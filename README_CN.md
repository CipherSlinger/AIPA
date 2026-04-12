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
| **多模型** | 会话中途随时切换 Claude、GPT-4、DeepSeek 或本地 Ollama 模型 |
| **随时待命** | 系统托盘快捷操作、全局快捷键（`Ctrl+Shift+Space` 唤起）、桌面通知 |
| **任务与提醒** | 快速待办列表、定时提醒 + Cron 循环提醒、每日简报 |
| **通道** | 通过 OpenClaw 接入飞书和微信消息通道 |

---

## 功能亮点

### 对话
- **Stream-JSON 聊天**，带实时工具调用卡片
- **工具使用摘要标签** — 连续工具调用自动分组，折叠显示人类可读操作摘要
- **结构化 Diff 视图（File Diff View）** — `file_edit` / `file_write` 工具调用时以 LCS 统一 Diff 格式展示行级变更，删除行红色、新增行绿色，支持折叠超长 diff，让用户在批准前看清所有代码改动
- **自定义系统提示词** — 持久追加提示词，会话临时覆盖；有效优先级：临时 > 持久，通过 `--append-system-prompt` 注入 CLI
- **扩展思考**块，可折叠，流式传输时自动展开
- **自动压缩** — 上下文窗口接近容量上限时自动摘要较早消息（阈值可调 60%-90%）；Microcompact 预处理截断过长内容；时间差 Microcompact 自动清理空闲工具调用结果
- **上下文压缩按钮（Context Compact）** — TokenUsageBar 在上下文使用率 ≥ 75% 时显示橙色 COMPACT 按钮，≥ 90% 时切换为红色警示；点击直接发送 `/compact` 压缩会话，防止因 context 满额导致对话中断
- **上下文建议** — 使用率超 70% 时，灯泡图标弹窗显示各工具优化建议及预计节省 Token 数
- **离开摘要** — 离开 5 分钟以上后返回，自动注入紫色摘要卡片
- **对话回滚** — 右键助手消息回退到该时间点，确认对话框防止误操作
- **消息键盘导航** — `Ctrl+Up/Down` 逐条浏览，`Ctrl+Home/End` 跳转首尾
- **编辑与重新生成**任意消息；重新生成前可切换模型
- **朗读**（Web Speech API）；**引用回复**（选中文本即可引用）
- **权限提示** — 破坏性工具操作前显示允许/拒绝卡片
- **权限建议** — 卡片内嵌"始终允许"/"始终拒绝"快捷按钮，一键创建持久权限规则
- **权限模式选择器（Permission Mode）** — 设置中提供 5 级权限控制（Default / Accept Edits / Don't Ask / Plan Only / Bypass Permissions），通过 `--permission-mode` 正确传递给 CLI，精确掌控工具执行风险
- **工具审批对话框（Tool Approval Dialog）** — 感知权限模式的实时工具审批弹窗，监听 Zustand store 中待处理的 PermissionMessage；bypassPermissions/dontAsk 模式下自动通过，其他模式下以对话框形式请求用户允许/拒绝
- **钩子回调审批** — PreToolUse/PostToolUse 钩子脚本内联审批卡片，响应实时回传给 CLI
- **MCP 信息采集** — MCP 服务器请求用户输入时内联表单卡片，提交/拒绝/取消均实时回传
- **会话初始化感知（System Init）** — 解析 CLI `system.init` 事件，ChatHeader 实时显示实际生效模型名、MCP 连接状态（绿点=已连接/红点=失败）及可用工具列表；与配置模型对比显示，通过 `cli:systemInit` IPC 从主进程推送至渲染器；store 同步更新 `activeModel` 和 `activeMcpServers`
- **CLI 通知 Toast** — 订阅 `cli:notification` IPC 通道，将 CLI stream-JSON `notification` 事件实时呈现为应用内 info toast 弹窗
- **系统诊断** — 一键检查 CLI、API 密钥、网络、磁盘空间和系统负载
- **启动保护** — 消除竞态、硬性闪屏超时、渲染器错误恢复，全方位杜绝卡死

### 输入增强工具
- **Slash 命令**（`/`）含客户端命令；**@提及**文件选择器
- **文本片段** — `::关键词` 触发展开可复用文本块
- **文本变换** — 一键变正式、随意、更短、更长或修正语法
- **内联计算器** — 输入 `= 42 * 1.18`，按 Tab 插入结果
- **Vim 模态编辑** — 通过 `/vim` 指令激活

### 会话管理
- 浏览、搜索、标签、置顶、批量删除历史会话
- **会话快速切换器**（`Ctrl+K`）— 模糊搜索最近会话
- **跨会话搜索**（`Ctrl+Shift+F`）扫描所有 JSONL 历史文件
- **上下文窗口监控** — 进度条 + 百分比标签 + 详情弹窗，接近上限时一键新建会话
- **可折叠日期分组** — 会话按时间自动分组（今天/昨天/本周/更早），支持折叠展开
- **会话分叉** — 右键任意消息从此处分叉新会话
- 导出为 Markdown、HTML 或 JSON

### 角���与记忆
- 最多 10 个自定义 AI 角色，每个有名称、Emoji、模型、系统提示词和标记颜色
- **自动记忆提取** — 从对话中提取偏好、事实、指令等持久记忆
- **记忆类型标签** — 4 种语义类型与颜色徽章
- **项目记忆分区** — 直接读写 `.claude/MEMORY.md`

### 工作流
- 可视化工作流编辑器，构建多步提示流水线
- **Canvas 画布模式** — 工作流步骤以节点图形式呈现，支持拖拽、平移、缩放
- 6 个内置预设工作流，开箱即用（周报、代码审查、每日总结等）

### 技能市场
- 来自 Anthropic、OpenClaw、ClawhHub 和社区的 47 个精选技能
- 内置市场一键安装；内置技能创建器

### CLI 集成与自动化
- **钩子配置** — 设置 → 钩子 Tab 可视化管理所有 Claude Code CLI 钩子（PreToolUse、PostToolUse、Stop 等 27 种事件类型）；多步添加向导支持命令/HTTP/提示词/Agent 四种钩子类型；内联编辑、禁用全部钩子开关（disableAllHooks）；钩子触发次数徽章实时显示执行计数；钩子执行进度实时显示在聊天面板
- **MCP 服务器管理** — stdio/http/sse 三种类型，一键添加/删除/重连；工具列表展开查看；工具调用块自动显示 `[serverName]` 来源徽章
- **工具访问控制** — 4 种预设模式（全部工具/只读/无网络/仅分析）；按分类精细化启用/禁用每个工具；通过 `--disallowedTools` 注入 CLI
- **权限模式选择器** — 5 级权限控制（Default / Accept Edits / Don't Ask / Plan Only / Bypass Permissions），通过 `--permission-mode` 正确传递给 CLI
- **钩子回调审批** — PreToolUse/PostToolUse 钩子脚本内联审批卡片；响应实时回传给 CLI
- **MCP 信息采集** — MCP 服务器请求用户输入时内联表单卡片；提交/拒绝/取消均实时回传

### 系统托盘与全局访问
- 最小化到系统托盘 — AIPA 在后台随时待命
- `Ctrl+Shift+Space` 在任意应用中切换窗口显示
- `Ctrl+Shift+G` 读取剪贴板并打开 AIPA，自动填入文本

---

## 设计系统

AIPA 采用统一的玻璃态设计系统：

- **玻璃背景**：`rgba(15,15,25,0.85–0.96)` + `backdropFilter: blur(12–20px)`
- **文字透明度阶梯**：主要=0.82，次要=0.60，辅助=0.45，微标=0.38
- **阴影系统**：L1–L4 层次阴影
- **Indigo 主色调**：`#6366f1`/`#818cf8`/`#a5b4fc`
- **过渡动画**：所有交互元素统一 `0.15s ease`
- **等宽数字**：所有数字显示使用 `fontVariantNumeric: tabular-nums`

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
| `Ctrl+Shift+D` | 切换主题（深色 / 浅色 / 跟随系统） |
| `Ctrl+Shift+L` | 切换语言（中/英） |
| `Ctrl+Shift+M` | 切换模型（Sonnet / Opus / Haiku） |
| `Ctrl+Shift+T` | 置顶窗口（始终在最前） |
| `Ctrl+K` | 会话快速切换器 |
| `Ctrl+B` | 切换侧边栏 |
| `Ctrl+,` | 打开设置 |
| `Ctrl+1–4` | 历史、文件、笔记、技能 |
| `Ctrl+5–7` | 记忆、工作流、通道 |
| `Ctrl+/` | 快捷键速查表 |
| `Ctrl+Up/Down` | 逐条浏览消息（带焦点指示器） |
| `Ctrl+Home/End` | 跳转到首/末条消息 |
| `Ctrl+Shift+Space` | 切换 AIPA 窗口（全局快捷键） |
| `Ctrl+Shift+G` | 剪贴板快捷操作（全局） |

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

## 安全

- API 密钥通过系统密钥链加密（`electron.safeStorage` / DPAPI）
- 严格内容安全策略 — 阻止 XSS 和未授权外部资源
- 沙箱化渲染进程 — 无直接 Node.js 访问
- IPC 路径验证 — 文件系统处理器检查允许目录白名单
- 净化 CLI 环境 — 子进程仅接收显式环境变量白名单

---

## 许可证

MIT
