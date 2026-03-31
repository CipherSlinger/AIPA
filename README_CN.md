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
| **终端直达** | 内置 PTY 终端（xterm.js）与聊天并排 — 无需切换窗口 |
| **持久记忆** | 跨会话的持久记忆 — 偏好、事实、指令、上下文自动注入每次对话 |
| **工作流** | 将提示词串联成可复用的流水线；支持每日、每周、每月定时执行 |
| **笔记** | Markdown 笔记本，带分类、模板和一键从聊天保存 |
| **多模型** | 会话中途随时切换 Claude、GPT-4、DeepSeek 或本地 Ollama 模型 |
| **随时待命** | 系统托盘快捷操作、全局快捷键（`Ctrl+Shift+Space` 唤起、`Ctrl+Shift+G` 剪贴板提问）、桌面通知 |
| **通道** | 通过 OpenClaw 接入飞书和微信消息通道 — 从侧边栏配置、测试和管理 |

---

## 功能亮点

### 对话
- **Stream-JSON 聊天**，带实时工具调用卡片 — 每次文件读取、命令执行、网页请求都一目了然
- **扩展思考**块，可折叠，流式传输时自动展开
- **编辑与重新生成**任意消息；重新生成前可切换模型
- **朗读**（Web Speech API）；**引用回复**（选中文本即可引用）
- **权限提示** — 任何破坏性工具操作前显示友好的允许/拒绝卡片

### 输入增强工具
- **Slash 命令**（`/`）、**@提及**文件选择器、**内联自动补全**（来自提示历史）
- **文本片段** — `::关键词` 触发展开可复用文本块
- **文本变换** — 一键变正式、随意、更短、更长或修正语法
- **内联计算器** — 输入 `= 42 * 1.18`，按 Tab 插入结果
- **任务队列** — 排队多条指令依次自动执行

### 会话管理
- 浏览、搜索、标签、置顶、批量删除历史会话
- **跨会话搜索**（`Ctrl+Shift+F`）扫描所有 JSONL 历史文件
- 导出为 Markdown、HTML 或 JSON

### 角色与记忆
- 最多 10 个自定义 AI 角色，每个有名称、Emoji、模型、系统提示词和标记颜色
- 记忆自动注入每次对话 — 置顶条目 + 最近 10 条
- **记住此内容** — 从悬停工具栏一键保存任意回复

### 工作流与定时
- 可视化工作流编辑器，构建多步提示流水线
- 支持定时触发（每日/每周/每月，类似 cron）
- 内置预设工作流，开箱即用

### 技能市场
- 来自 Anthropic、OpenClaw、ClawhHub 和社区的 46+ 个精选技能
- 一键安装；从 ClawhHub.ai 实时浏览

### 通道（飞书 & 微信）
- 通过 Webhook URL + App 凭证接入**飞书**自定义机器人
- 通过 Token + App 凭证接入**微信公众号**
- 侧边栏 `Radio` 图标（`Ctrl+9`）配置、测试和管理两个通道
- 由 OpenClaw 集成提供支持

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
| `Ctrl+Shift+F` | 全局跨会话搜索 |
| `Ctrl+Shift+R` | 重新生成回复 |
| `Ctrl+Shift+E` | 导出对话 |
| `Ctrl+Shift+D` | 切换主题（深色 / 浅色 / 跟随系统） |
| `Ctrl+Shift+M` | 切换模型（Sonnet / Opus / Haiku） |
| `Ctrl+Shift+T` | 置顶窗口（始终在最前） |
| `Ctrl+Shift+O` | 专注模式（隐藏侧边栏和终端） |
| `Ctrl+B` | 切换侧边栏 |
| `Ctrl+`` ` `` | 切换终端 |
| `Ctrl+,` | 打开设置 |
| `Ctrl+1–4` | 历史、文件、笔记、技能 |
| `Ctrl+5–9` | 设置（弹窗）、记忆、工作流、提示历史、通道 |
| `Ctrl+/` | 快捷键速查表 |
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

## 安全

- API 密钥通过系统密钥链加密（`electron.safeStorage` / DPAPI）
- 严格内容安全策略 — 阻止 XSS 和未授权外部资源
- 沙箱化渲染进程 — 无直接 Node.js 访问
- IPC 路径验证 — 文件系统处理器检查允许目录白名单
- 净化 CLI 环境 — 子进程仅接收显式环境变量白名单

---

## 许可证

MIT
