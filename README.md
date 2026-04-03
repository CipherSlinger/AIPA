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
| **任务与提醒** | 快速待办列表、定时提醒（5/15/30/60/120 分钟）、每日简报（任务统计 + 下一个提醒 + 轮换生产力贴士） |
| **通道** | 通过 OpenClaw 接入飞书和微信消息通道 — 从侧边栏配置、测试和管理 |

---

## 功能亮点

### 对话
- **Stream-JSON 聊天**，带实时工具调用卡片 — 每次文件读取、命令执行、网页请求都一目了然
- **工具使用摘要标签** — 连续工具调用自动分组，折叠显示人类可读的操作摘要
- **结构化 Diff 视图** — 文件编辑和写入操作以 LCS 统一 Diff 格式展示，色彩编码增/删行，可折叠大型差异
- **扩展思考**块，可折叠，流式传输时自动展开；StatusBar 一键开关
- **输出风格** — 三种回复风格（默认/详细解释/教学模式），工具栏快速切换
- **自动压缩** — 上下文窗口接近容量上限时自动摘要较早消息，保持对话流畅（阈值可调 60%-90%）
- **对话回滚** — 将对话回退到任意消息位置，同时同步持久化存储
- **消息键盘导航** — `Ctrl+Up/Down` 逐条浏览消息，`Ctrl+Home/End` 跳转首尾，带视觉焦点指示器
- **编辑与重新生成**任意消息；重新生成前可切换模型
- **朗读**（Web Speech API）；**引用回复**（选中文本即可引用）
- **权限提示** — 任何破坏性工具操作前显示友好的允许/拒绝卡片
- **系统诊断** — 一键检查 CLI、API 密钥、网络、磁盘空间和系统负载
- **启动保护** — IPC 预注册消除竞态、非阻塞菜单构建、10 秒硬性闪屏超时、渲染器错误恢复、偏好设置重置，全方位杜绝卡死

### 输入增强工具
- **Slash 命令**（`/`）、**@提及**文件选择器
- **文本片段** — `::关键词` 触发展开可复用文本块
- **文本变换** — 一键变正式、随意、更短、更长或修正语法
- **内联计算器** — 输入 `= 42 * 1.18`，按 Tab 插入结果
- **任务队列** — 排队多条指令依次自动执行

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
- 导出为 Markdown、HTML 或 JSON

### 角色与记忆
- 最多 10 个自定义 AI 角色，每个有名称、Emoji、模型、系统提示词和标记颜色
- **预设角色国际化** — 5 个内置角色名称跟随系统语言自动切换
- 记忆自动注入每次对话 — 置顶条目 + 最近 10 条
- **自动记忆提取** — 开启后自动从对话中提取偏好、事实、指令等持久记忆
- **记住此内容** — 从悬停工具栏一键保存任意回复
- **情境化功能提示** — 欢迎页面智能推荐功能技巧，基于使用模式个性化展示
- **提示建议** — 每次 AI 回复后自动预测用户下一条消息，以虚影文字显示在输入框中，按 Tab 接受
- **思考深度调节** — 低/中/高三档，控制 AI 的思考投入度
- **按模型成本明细** — StatusBar 点击费用即可查看各模型的 Token 用量和费用占比

### 工作流
- 可视化工作流编辑器，构建多步提示流水线
- **Canvas 画布模式** — 工作流步骤以节点图形式呈现，支持拖拽、平移、缩放；运行时实时高亮当前执行节点，进度条显示整体进度
- 6 个内置预设工作流，开箱即用（周报、代码审查、每日总结等）
- **预设工作流国际化** — 名称和描述跟随系统语言自动切换

### 技能市场
- 来自 Anthropic、OpenClaw、ClawhHub 和社区的 47 个精选技能
- 内置市场一键安装；按来源和分类筛选
- 内置技能创建器，通过对话交互式设计自定义技能

### 通道（飞书 & 微信）
- 通过 Webhook URL + App 凭证接入**飞书**自定义机器人
- 通过腾讯官方 OpenClaw 微信 CLI 插件（`@tencent-weixin/openclaw-weixin-cli`）接入**微信**
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
| `Ctrl+8` | 通知 |
| `Ctrl+9` | 任务 |
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

## 安全

- API 密钥通过系统密钥链加密（`electron.safeStorage` / DPAPI）
- 严格内容安全策略 — 阻止 XSS 和未授权外部资源
- 沙箱化渲染进程 — 无直接 Node.js 访问
- IPC 路径验证 — 文件系统处理器检查允许目录白名单
- 净化 CLI 环境 — 子进程仅接收显式环境变量白名单

---

## 许可证

MIT
