# AIPA 架构详细笔记

## 进程模型
- Main (CJS, tsconfig.main.json) → Preload (contextBridge) → Renderer (Vite/React)
- 两种 CLI 模式：PTY (node-pty + xterm.js) 和 Stream-JSON (child_process.spawn + NDJSON)
- 所有 IPC 通过 ipcMain.handle / ipcRenderer.invoke

## 文件地图

### Main 进程 (src/main/)
```
index.ts               - BrowserWindow 创建、app menu、生命周期
ipc/index.ts           - registerAllHandlers() - 所有 IPC handler 注册入口
pty/pty-manager.ts     - PtyManager class (EventEmitter)，创建 node-pty 进程
pty/stream-bridge.ts   - StreamBridge class (EventEmitter)，NDJSON 协议处理
sessions/session-reader.ts - JSONL 文件读取器（~/.claude/projects/），也处理 MCP servers
config/config-manager.ts   - electron-store v8 封装，API key 存储
main/utils/cli-path.ts     - getCliPath(), getNodePath() — 统一 CLI 路径解析
main/utils/cli-env.ts      - sanitizeEnv() — 基于白名单的环境变量过滤
main/utils/logger.ts       - createLogger(module) — 结构化日志 → ~/.claude/aipa.log
main/utils/validate.ts     - safePath(), validateApiKey(), validateModelName(), validateFlags()
```

### Renderer (src/renderer/)
```
App.tsx                    - 根组件，加载 prefs，显示 onboarding
store/index.ts             - 4 个 Zustand store
hooks/useStreamJson.ts     - CLI 事件路由、消息发送、permission 处理
hooks/usePty.ts            - xterm.js 终端初始化
hooks/useImagePaste.ts     - 剪贴板图片处理
```

## 组件树
```
AppShell
  ├── Sidebar (tabs: history | settings)
  │     ├── SessionList
  │     └── SettingsPanel (tabs: general | mcp)
  ├── ChatPanel
  │     ├── Toolbar (session ID, model, working dir, new button)
  │     ├── MessageList / WelcomeScreen
  │     │     └── Message (avatar, content, tools, thinking, rating, rewind)
  │     │           ├── MessageContent (react-markdown)
  │     │           ├── ToolUseBlock
  │     │           └── PermissionCard / PlanCard
  │     ├── ThinkingIndicator
  │     └── Input (textarea, @mention, /slash, speech, image preview, send/abort)
  ├── TerminalPanel (xterm.js)
  └── StatusBar (sidebar toggle, dir, context bar, tokens, cost, model, terminal toggle)
```

## IPC Channel 注册表（已验证）
- PTY: pty:create, pty:write, pty:resize, pty:destroy
- PTY push: pty:data, pty:exit
- CLI: cli:sendMessage, cli:abort, cli:respondPermission, cli:endSession
- CLI push: cli:assistantText, cli:thinkingDelta, cli:toolUse, cli:toolResult, cli:messageEnd, cli:result, cli:error, cli:processExit, cli:permissionRequest
- Session: session:list, session:load, session:delete, session:fork, session:rename, session:generateTitle, session:rewind
- Config: config:read, config:write, config:getEnv, config:setApiKey
- Prefs: prefs:get, prefs:set, prefs:getAll
- FS: fs:listDir, fs:showOpenDialog, fs:getHome, fs:ensureDir, fs:listCommands
- MCP: mcp:list, mcp:setEnabled
- Feedback: feedback:rate
- Menu push: menu:newSession, menu:openFolder, menu:toggleSidebar, menu:toggleTerminal, menu:about

## Stream-JSON 事件类型
1. `assistant` - text + tool_use blocks
2. `user` - tool_result blocks
3. `message_start` / `message_stop` / `message_delta`
4. `content_block_start` / `content_block_delta` / `content_block_stop`
5. `tool_use` / `tool_result`
6. `system`
7. `result` - 包含 session_id，用于 --resume
8. `control_request` (subtype: can_use_tool) - permission 请求
9. `permission_request` - 备用 permission 格式

## 双 Session ID 机制
- `bridgeId`：StreamBridge 内部生命周期标识
- `claudeSessionId`：CLI result 事件返回，用于跨次会话 --resume

## 依赖说明
- `@tanstack/react-virtual` — 已安装但完全未使用
- `@radix-ui/*` (dialog, dropdown-menu, scroll-area, tabs, tooltip) — 已安装但基本未使用
- 虚拟列表推荐使用 react-virtuoso（处理动态高度更好）
