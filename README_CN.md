# AIPA

[Claude Code](https://claude.ai/code) CLI 的桌面图形界面，基于 Electron + React 构建。

![平台](https://img.shields.io/badge/平台-Windows-blue)
![Electron](https://img.shields.io/badge/Electron-39-47848F)
![React](https://img.shields.io/badge/React-18-61DAFB)

## 功能特性

- **对话面板** — 通过 stream-JSON 协议与 Claude 进行结构化对话，支持工具调用可视化
- **终端面板** — 基于 xterm.js 的完整 PTY 终端，直接运行 Claude Code
- **历史会话** — 浏览并恢复 `~/.claude/projects/` 中的历史对话
- **文件浏览器** — 在侧边栏中浏览工作目录
- **设置面板** — 配置 API 密钥、模型、字体、工作目录及 CLI 参数

## 环境要求

- Windows 10/11 x64
- [Node.js](https://nodejs.org/) 18 或更高版本（需在 PATH 中）
- [Anthropic API 密钥](https://console.anthropic.com/)

## 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/CipherSlinger/AIPA.git
cd AIPA/electron-ui

# 2. 安装依赖
npm install

# 3. 构建
npm run build

# 4. 启动
node_modules/.bin/electron dist/main/index.js
```

首次启动后，点击侧边栏齿轮图标进入**设置**，填入你的 Anthropic API 密钥。

## 开发模式（热更新）

```bash
# 终端 1 — 构建主进程 & 启动 Vite 开发服务器
npm run build:main && npm run build:preload
npx vite

# 终端 2 — 以开发模式启动 Electron
NODE_ENV=development node_modules/.bin/electron dist/main/index.js
```

## 打包安装包（Windows）

```bash
npm run dist:win
# 输出目录：electron-ui/release/
```

## 更新内置 CLI

`package/` 目录中包含内置的 Claude Code CLI。项目提供了两个辅助脚本，用于检测并更新它：

```bash
# Bash（Linux / macOS / Windows Git Bash）
bash update-cli.sh

# Windows 命令提示符
update-cli.bat
```

两个脚本均会将 `package/package.json` 中的当前版本与 npm 上的最新版本进行比对，并在下载替换 `package/` 前提示你确认。

## 项目结构

```
AIPA/
├── package/          # 内置的 Claude Code CLI（只读，已打包）
└── electron-ui/      # Electron 应用
    ├── src/
    │   ├── main/     # 主进程（Node.js）：PTY、IPC、会话、配置
    │   ├── preload/  # 上下文桥接（将 electronAPI 暴露给渲染进程）
    │   └── renderer/ # React 界面（Vite + Tailwind）
    └── dist/         # 编译产物（构建生成，不提交到 git）
```

## 架构说明

应用通过两种模式与 Claude Code CLI 交互：

| 模式 | 用途 | 原理 |
|------|------|------|
| **PTY**（node-pty） | 终端面板 | 通过 ConPTY 启动 `node cli.js`，将原始终端 I/O 流传输给 xterm.js |
| **Stream-JSON** | 对话面板 | 启动 `node cli.js --input-format stream-json --output-format stream-json --print`，解析 NDJSON 事件流 |

渲染进程与主进程之间的所有通信通过 `window.electronAPI` 进行（定义于 `src/preload/index.ts`）。

## 许可证

MIT
