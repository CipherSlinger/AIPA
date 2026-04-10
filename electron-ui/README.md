# AIPA — AI 个人助手

**AIPA**（AI Personal Assistant）是一款基于 Electron + React 构建的桌面 AI 助手，以 Claude Code CLI 为执行引擎，为日常用户提供强大、可定制的 AI 工作台。

> **版本**: v1.1.148 · **平台**: Windows / macOS / Linux · **语言**: 简体中文 / English

---

## 核心理念

AIPA 不是一个简单的聊天界面封装。Claude Code CLI 是真正的执行引擎，Electron 应用是让 AI 能力触手可及的驾驶舱：

- 完整的 **对话管理** — 多标签、历史、搜索、书签、分叉
- 结构化 **工作流自动化** — 单人多步骤任务链，以及多角色团队协作
- 持久化 **记忆系统** — 跨会话的个人偏好与项目级 MEMORY.md
- **部门工作区** — 按项目目录管理所有会话，像文件夹一样组织 AI 工作
- **多模型提供商** — Claude 官方 API、AI 网关/代理、第三方兼容接口（DeepSeek、Qwen、OpenAI、Ollama 等）

---

## 功能总览

### 部门 & 会话管理

- **部门工作区**：每个"部门"对应一个工作目录，所有关联会话统一展示在卡片看板中，点击即进入对话
- **历史对话自动归档**：启动时按文件路径自动将现有会话归类到对应部门
- **会话操作**：重命名、置顶、归档、标签颜色、文件夹分组、批量删除
- **全局搜索**（Ctrl+Shift+F）：跨所有会话搜索消息内容
- **快速切换**（Ctrl+K）：按标题或内容快速跳转会话
- **会话分叉**：从任意消息点创建对话分支，支持分支对比视图

### 聊天界面

- **实时流式输出**：增量文本渲染，RAF 节流优化性能
- **多标签对话**：同一窗口维护多个独立会话（最多 8 个标签）
- **草稿自动保存**：失焦即保存，切回自动恢复
- **输入历史**（↑/↓）：浏览历史输入记录
- **消息编辑**：修改已发送的用户消息并重新发送
- **消息折叠/展开**：长回复支持折叠显示
- **回退**（Rewind）：将对话及文件状态恢复到某条消息之前的检查点

**消息互动：**
- 书签（Ctrl+Shift+B）、置顶、反应（👍/👎/❤️/💡/🔖）
- 批注（私人备注）、引用回复、朗读（TTS）
- 复制为纯文本 / Markdown / 富文本
- 保存到笔记、翻译、分享

**内容渲染：**
- 代码块语法高亮 + 一键复制 + 在终端运行 + 保存到文件
- Markdown 全量渲染（GFM 支持），支持切换原始 Markdown 视图
- 图片 Lightbox 查看器（缩放、旋转）
- 工具调用卡片（折叠/展开执行详情）
- 文件 Diff 查看器
- 深度思考块（Extended Thinking）展示

### 输入工具栏

- **文件附件**：拖放或点击选择，图片作为附件，文本文件通过 @路径 引用
- **@文件提及**：自动补全工作目录内的文件路径
- **/ 斜杠命令**：快速插入预设提示词
- **截图捕获**：一键截屏并附加到消息
- **语音输入**：Web Speech API 语音转文字（最长 2 分钟）
- **文本变换**：正式/随意语气、缩短/扩展文本、语法修正
- **格式工具栏**：加粗、斜体、代码块快捷插入
- **粘贴检测**：长文本、代码、URL 粘贴时智能提示处理方式
- **专注计时器**（番茄钟）和秒表

### 工作流

- **可视化画布**：节点拖拽排列，自动布局（垂直/水平可切换）
- **直接画布编辑**：双击节点标题或提示词内联编辑，无需弹出侧边栏
- **节点类型**：普通提示词、条件分支（Yes/No）、并行执行
- **步骤重排**：拖拽手柄直接调整步骤顺序
- **执行追踪**：实时显示运行中/已完成/失败状态，带进度条和计时器
- **历史回放**：查看历次运行记录及每步输出
- **团队工作流**：多角色协作模式，模拟 PM/设计/工程/市场团队分工
- **预设工作流**：周报生成、代码审查、调研总结、产品发布、故障响应、内容流水线等
- **导入/导出**：JSON 格式工作流分享
- **任务队列集成**：工作流步骤自动加入任务队列顺序执行

### 记忆系统

- **个人记忆**：Electron-store 持久化，支持分类（偏好/事实/指令/上下文）
- **项目记忆**：内联编辑 `~/.claude/memory/` 目录下的 Markdown 文件，与 Claude Code CLI 记忆系统完全兼容
- **自动提取记忆**：对话结束后自动识别重要信息并存入记忆
- **记忆检索**：关键词搜索、置顶、分类筛选

### 笔记

- 创建、编辑、删除、复制笔记
- 分类管理（最多 10 个分类，自定义颜色）
- Markdown 预览模式与编辑模式切换
- 搜索、排序（修改时间/创建时间/字母）
- 模板：会议记录、待办清单、日记、灵感记录
- 固定到聊天顶部 / 发送到聊天输入框
- 批量导出为 Markdown / 从文件导入

### 技能（Skills）

- 浏览并安装技能（类似 Claude Code 的自定义斜杠命令）
- 分类市场：效率、写作、代码、研究、创意、运维、设计
- 创建自定义技能（名称 + 系统提示词，保存为 `.md` 文件）
- 一键激活技能到聊天输入框

### 任务 & 提醒

- 快速任务清单（Enter 快速添加，三态状态管理）
- 完成项清除、任务计数
- **提醒**：固定时间触发（5分钟/15分钟/30分钟/1小时/2小时）
- **定期重复提醒**：Cron 表达式支持（每日早9点、工作日等）

### 变更追踪

- 自动追踪 Claude 在当前会话中编辑/创建的文件
- 按对话轮次分组展示
- 每个文件可展开查看 diff
- 全量 `git diff HEAD` 弹窗视图

### 模型提供商 (Providers)

| 类型 | 说明 |
|------|------|
| **Anthropic 官方** | 直连官方 API，使用 API Key |
| **AI 网关/代理** | 通过 Auth Token 访问（Vercel AI Gateway 等） |
| **兼容接口** | DeepSeek、Qwen、OpenAI、Ollama 等 |

- 健康检测（healthy / degraded / down）
- 启用/禁用切换
- 自定义提供商添加/删除
- 阿里云 Qwen QR 码快速配置

### MCP 服务器

- stdio / HTTP / SSE 三种连接类型
- 可视化工具列表（服务器运行时枚举）
- 重连、删除、添加向导

### Hooks（钩子）

- 在 CLI 事件触发时运行 Shell 命令、发送 AI 提示词或调用 Webhook
- 支持工具生命周期、会话生命周期、用户交互等多类事件
- 可视化配置向导

### 权限管理

- 工具使用授权（Allow / Deny / Always Allow）
- 自定义规则（`Bash(git *)`, `Read(**/*.ts)` 等 glob 语法）
- 会话级始终允许

### AI 通道 (Channels)

- **飞书**：企业群机器人 Webhook 集成
- **微信**：通过 OpenClaw CLI 插件连接

### 设置

| 标签页 | 主要内容 |
|--------|----------|
| 常规 | API 密钥池、模型选择、系统提示词、工作目录、主题、字体、语言 |
| 提供商 | 多模型提供商配置（详见上方） |
| 权限 | 工具访问规则 |
| 角色 | AI 助手角色（Personas）管理 |
| MCP 服务器 | Model Context Protocol 服务器 |
| 统计 | 使用量、会话趋势、工具调用排行 |
| 钩子 | Hooks 事件处理器 |
| 记忆 | 记忆文件（Settings Memory）管理 |
| 插件 | 插件安装与管理 |
| 高级 | 系统提示词预设、工具访问分组控制 |
| 关于 | 版本信息、快捷键、重置默认值 |

### 角色（Personas / Agents）

- 创建自定义助手角色（名称、Emoji、颜色、模型、系统提示词）
- 预设角色：写作教练、研究分析师、创意伙伴、学习导师、效率教练
- 设为默认角色（新会话自动激活）
- 导入/导出角色配置

### 文本片段（Snippets）

- 定义 `::关键词` 快捷展开的文本片段
- 最多 50 个片段
- 在聊天输入框内实时触发展开

### 其他功能

- **专注模式**（Ctrl+Shift+O）：隐藏侧边栏和终端
- **窗口置顶**（Ctrl+Shift+T）：Always-on-top
- **上下文压缩**（Ctrl+Shift+K）：自动摘要早期消息，释放 Token 空间
- **成本追踪**：实时显示每轮费用与会话总费用
- **上下文窗口用量**：百分比进度条 + 详细 Token 分解
- **输出风格**：默认 / 解释性（含见解模块）/ 步骤式（含练习题）
- **AI 思考深度**：自动 / 低 / 中 / 高 / 最大
- **规划模式**：Claude 仅规划不执行，批准后再运行
- **每日简报**：任务摘要 + 效率 Tips
- **空闲返回弹窗**：离开 30 分钟后返回时询问是否继续当前对话
- **完成提示音** + **桌面通知**
- **防休眠**：流式输出时阻止系统进入休眠
- **数据备份/恢复**：导出角色、工作流、笔记、记忆、片段、设置

---

## 快捷键速查

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+N` | 新建对话 |
| `Ctrl+1~9` | 切换侧边栏面板 |
| `Ctrl+,` | 打开设置 |
| `Ctrl+K` | 命令面板 / 会话快速切换 |
| `Ctrl+B` | 切换侧边栏 |
| `Ctrl+`` ` | 切换终端 |
| `Ctrl+F` | 对话内搜索 |
| `Ctrl+Shift+F` | 全局搜索 |
| `Ctrl+Shift+K` | 压缩上下文 |
| `Ctrl+Shift+Q` | 加入任务队列 |
| `Ctrl+Shift+B` | 书签面板 |
| `Ctrl+Shift+S` | 统计面板 |
| `Ctrl+Shift+O` | 专注模式 |
| `Ctrl+Shift+T` | 窗口置顶 |
| `Ctrl+Shift+D` | 切换主题 |
| `Ctrl+Shift+L` | 切换语言 |
| `Ctrl+Shift+E` | 导出对话 |
| `Ctrl+/` | 快捷键速查表 |
| `Tab` | 接受 AI 预测输入 |
| `Esc` | 关闭弹窗 / 清空输入 |

完整快捷键列表见应用内 `Ctrl+/`。

---

## 技术架构

```
Renderer (React/Vite)  ←→  Preload (contextBridge)  ←→  Main (Node.js)
                                                              ├── pty-manager   (node-pty / xterm.js)
                                                              ├── stream-bridge (stream-json 模式)
                                                              ├── session-reader
                                                              ├── config-manager
                                                              └── provider-manager
```

- **前端**：React 18 + TypeScript + Vite，状态管理用 Zustand
- **Electron**：v39，主进程与渲染进程严格分离，通过 contextBridge IPC 通信
- **CLI 集成**：两种模式 — PTY 交互终端（node-pty）+ Stream-JSON 结构化聊天（child_process）
- **持久化**：electron-store（设置/会话/记忆）+ localStorage（部门/UI状态）+ 文件系统（MEMORY.md / Skills）
- **代码分割**：所有面板和编辑器页面均通过 `React.lazy()` 懒加载

---

## 构建 & 运行

### 环境要求

- Node.js 18+
- Windows（已验证）/ macOS / Linux

### 开发模式

```bash
cd electron-ui

# 安装依赖
npm install

# 构建主进程
npm run build:main
npm run build:preload

# 启动渲染器 (Vite HMR)
npm run dev:renderer

# 在另一个终端启动 Electron（开发模式）
NODE_ENV=development npx electron dist/main/index.js
```

### 生产构建

```bash
cd electron-ui

# 完整构建（主进程 + 预加载 + 渲染器）
npm run build

# 启动构建产物
npx electron dist/main/index.js

# 打包为 Windows 安装包
npm run dist:win
```

### 重建 node-pty（终端原生模块）

```bash
cd electron-ui
npm run rebuild-pty
```

> 终端功能需��� node-pty 原生模块。如果终端显示"基本模式"，请运行此命令。

---

## 项目结构

```
agents-a76b2932f5/               ← 项目根目录 (即 electron-ui/)
├── src/
│   ├── main/                    ← Electron 主进程
│   │   ├── ipc/                 ← IPC 处理器（所有 electronAPI.* 的实现）
│   │   ├── pty/                 ← PTY 管理器 + Stream-Bridge
│   │   ├── session-reader.ts    ← 读取 ~/.claude/projects/ JSONL 会话
│   │   └── config-manager.ts   ← API 密钥与配置管理
│   ├── preload/
│   │   └── index.ts             ← contextBridge 暴露 window.electronAPI
│   └── renderer/
│       ├── components/
│       │   ├── chat/            ← 聊天界面全部组件
│       │   ├── departments/     ← 部门工作区（DepartmentPanel/Dashboard/SessionCard）
│       │   ├── workflows/       ← 工作流（Canvas/Editor/Detail/Node）
│       │   ├── settings/        ← 设置各标签页
│       │   ├── notes/           ← 笔记面板
│       │   ├── skills/          ← 技能面板 + 市场
│       │   ├── memory/          ← 记忆面板
│       │   ├── tasks/           ← 任务 & 提醒
│       │   ├── changes/         ← 变更追踪
│       │   ├── layout/          ← AppShell / NavRail / Sidebar
│       │   ├── onboarding/      ← 新手向导（2步）
│       │   └── ui/              ← 通用 UI 组件（Toggle / QR / Dialog 等）
│       ├── store/               ← Zustand stores（chat/ui/prefs/session/department）
│       ├── i18n/                ← 国际化（en.json / zh-CN.json）
│       └── types/               ← TypeScript 类型定义
├── package.json
├── tsconfig.main.json           ← 主进程独立编译配置（CommonJS）
├── tsconfig.preload.json
└── vite.config.ts               ← 渲染器构建配置
```

---

## 国际化

AIPA 支持 **简体中文** 和 **English** 双语，在设置的"常规"标签页或通过快捷键 `Ctrl+Shift+L` 即时切换，无需重启。

---

## 许可证

本项目仅供个人使用。`package/` 目录下的 Claude Code CLI 归 Anthropic 所有，适用其原始许可证。
