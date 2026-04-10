# AIPA — AI Personal Assistant

**AIPA** is a desktop AI assistant built with Electron + React, powered by the Claude Code CLI as its execution engine. It provides a powerful, customizable AI workbench for everyday users.

> **Version**: v1.1.148 · **Platform**: Windows / macOS / Linux · **Language**: English / 简体中文

---

## Philosophy

AIPA is not a simple chat UI wrapper. The Claude Code CLI is the true execution engine; the Electron application is the cockpit that makes AI capabilities accessible:

- Complete **conversation management** — multi-tab, history, search, bookmarks, fork
- Structured **workflow automation** — single-agent task chains and multi-persona team collaboration
- Persistent **memory system** — cross-session personal preferences and project-level MEMORY.md
- **Department workspace** — organize all sessions by project directory, like folders for AI work
- **Multi-model providers** — Claude official API, AI gateways/proxies, third-party compatible APIs (DeepSeek, Qwen, OpenAI, Ollama, etc.)

---

## Feature Overview

### Departments & Session Management

- **Department Workspace**: Each "department" maps to a working directory; all related sessions are displayed in a card grid for quick access
- **Auto-import historical sessions**: On first launch, existing sessions are automatically sorted into departments by their project directory
- **Session operations**: Rename, pin, archive, color label, folder grouping, bulk delete
- **Global search** (Ctrl+Shift+F): Search message content across all sessions
- **Quick switcher** (Ctrl+K): Jump to sessions by title or content
- **Session fork**: Create a branch from any message, with side-by-side comparison view

### Chat Interface

- **Real-time streaming**: Incremental text rendering with RAF-throttled performance optimization
- **Multi-tab conversations**: Maintain up to 8 independent sessions in one window
- **Auto-save drafts**: Saves on blur, restores when you return
- **Input history** (↑/↓): Browse previously sent messages
- **Message editing**: Modify and re-send user messages
- **Message collapse/expand**: Fold long responses for a cleaner view
- **Rewind**: Restore conversation and file state to a checkpoint before any message

**Message interactions:**
- Bookmarks (Ctrl+Shift+B), pin to header, reactions (👍/👎/❤️/💡/🔖)
- Annotations (private notes), quote reply, read aloud (TTS)
- Copy as plain text / Markdown / rich text
- Save to notes, translate, share

**Content rendering:**
- Code blocks with syntax highlighting, one-click copy, run in terminal, save to file
- Full Markdown rendering (GFM support) with raw Markdown toggle
- Image Lightbox viewer (zoom, rotate)
- Tool use cards (collapsible execution details)
- File diff viewer
- Extended Thinking blocks display

### Input Toolbar

- **File attachments**: Drag-and-drop or click to select; images as attachments, text files via @path reference
- **@file mentions**: Auto-complete file paths within the working directory
- **/ slash commands**: Quickly insert preset prompts
- **Screenshot capture**: One-click screenshot attached to message
- **Voice input**: Web Speech API speech-to-text (up to 2 minutes)
- **Text transforms**: Formal/casual tone, shorten/expand, grammar fix
- **Format toolbar**: Bold, italic, code block shortcuts
- **Paste detection**: Smart suggestions when pasting long text, code, or URLs
- **Focus timer** (Pomodoro) and stopwatch

### Workflows

- **Visual canvas**: Drag-and-drop node arrangement with auto-layout (vertical/horizontal toggle)
- **Direct canvas editing**: Double-click node title or prompt to edit inline — no sidebar popup required
- **Node types**: Standard prompt, conditional branch (Yes/No), parallel execution
- **Step reordering**: Drag handle to rearrange steps
- **Execution tracking**: Real-time running/completed/failed status with progress bars and timers
- **History replay**: Review past runs and per-step outputs
- **Team workflows**: Multi-persona collaboration mode simulating PM/Design/Engineering/Marketing team roles
- **Preset workflows**: Weekly report, code review, research summary, product launch, incident response, content pipeline, and more
- **Import/export**: Share workflows as JSON
- **Task queue integration**: Workflow steps are automatically queued and executed sequentially

### Memory System

- **Personal memory**: electron-store persistence with categories (preference, fact, instruction, context)
- **Project memory**: Inline editor for `~/.claude/memory/` Markdown files — fully compatible with Claude Code CLI's memory system
- **Auto-extract memories**: Automatically identify and save important information from conversations
- **Memory retrieval**: Keyword search, pin, category filter

### Notes

- Create, edit, delete, and duplicate notes
- Category management (up to 10 categories with custom colors)
- Toggle between Markdown preview and edit modes
- Search and sort (by modified/created/alphabetical)
- Templates: meeting notes, to-do list, journal, idea capture
- Pin to chat header / send to chat input
- Bulk export as Markdown / import from files

### Skills

- Browse and install skills (similar to Claude Code custom slash commands)
- Category marketplace: productivity, writing, code, research, creative, devops, design
- Create custom skills (name + system prompt, saved as `.md` files)
- One-click activate skill into chat input

### Tasks & Reminders

- Quick task list (Enter to add, three-state status management)
- Clear completed items, task count badge
- **Reminders**: Fire at fixed intervals (5/15/30 min, 1/2 hours)
- **Recurring reminders**: Cron expression support (every morning at 9am, weekdays, etc.)

### Changes Tracking

- Automatically tracks files edited/created by Claude in the current session
- Grouped by conversation turn
- Expandable diff view per file
- Full `git diff HEAD` modal view

### Model Providers

| Type | Description |
|------|-------------|
| **Anthropic Official** | Direct API connection using API Key |
| **AI Gateway/Proxy** | Auth Token access (Vercel AI Gateway, etc.) |
| **Compatible APIs** | DeepSeek, Qwen, OpenAI, Ollama, and others |

- Health check (healthy / degraded / down)
- Enable/disable toggle
- Add/remove custom providers
- Aliyun Qwen QR code quick setup

### MCP Servers

- Three connection types: stdio / HTTP / SSE
- Visual tool list (enumerated when server is running)
- Reconnect, remove, add wizard

### Hooks

- Run shell commands, send AI prompts, or call webhooks on CLI events
- Supports tool lifecycle, session lifecycle, user interaction, and more event types
- Visual configuration wizard

### Permission Management

- Tool use authorization (Allow / Deny / Always Allow)
- Custom rules (`Bash(git *)`, `Read(**/*.ts)` glob syntax)
- Session-level always-allow rules

### AI Channels

- **Feishu**: Enterprise group bot Webhook integration
- **WeChat**: Connect via the OpenClaw CLI plugin

### Settings

| Tab | Contents |
|-----|----------|
| General | API key pool, model selection, system prompt, working dir, theme, font, language |
| Providers | Multi-model provider config (see above) |
| Permissions | Tool access rules |
| Personas | AI assistant persona management |
| MCP Servers | Model Context Protocol servers |
| Stats | Usage, session trends, top tool calls |
| Hooks | Event hook handlers |
| Memory | Memory file (Settings Memory) management |
| Plugins | Plugin install and management |
| Advanced | System prompt presets, grouped tool access control |
| About | Version info, shortcuts, reset defaults |

### Personas / Agents

- Create custom assistant personas (name, emoji, color, model, system prompt)
- Preset personas: Writing Coach, Research Analyst, Creative Partner, Study Tutor, Productivity Coach
- Set as default persona (auto-activated for new sessions)
- Import/export persona configs

### Text Snippets

- Define `::keyword` shortcuts that expand inline
- Up to 50 snippets
- Trigger expansion in real-time within the chat input

### Additional Features

- **Focus mode** (Ctrl+Shift+O): Hide sidebar and terminal
- **Always-on-top** (Ctrl+Shift+T): Pin window above others
- **Context compaction** (Ctrl+Shift+K): Auto-summarize older messages to free up token space
- **Cost tracking**: Real-time per-turn and session total cost display
- **Context window usage**: Percentage progress bar with detailed token breakdown
- **Output styles**: Default / Explanatory (with insight modules) / Learning (with practice questions)
- **AI thinking depth**: Auto / Low / Medium / High / Max
- **Plan mode**: Claude plans only without executing tools; run after approval
- **Daily briefing**: Task summary with productivity tips
- **Idle return dialog**: Ask whether to continue or start fresh after 30+ minutes away
- **Completion sound** + **desktop notifications**
- **Wake lock**: Prevent system sleep during streaming
- **Data backup/restore**: Export personas, workflows, notes, memories, snippets, and settings

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New conversation |
| `Ctrl+1~9` | Switch sidebar panels |
| `Ctrl+,` | Open settings |
| `Ctrl+K` | Command palette / session quick switch |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+`` ` | Toggle terminal |
| `Ctrl+F` | Search in conversation |
| `Ctrl+Shift+F` | Global search |
| `Ctrl+Shift+K` | Compact context |
| `Ctrl+Shift+Q` | Add to task queue |
| `Ctrl+Shift+B` | Bookmarks panel |
| `Ctrl+Shift+S` | Stats panel |
| `Ctrl+Shift+O` | Focus mode |
| `Ctrl+Shift+T` | Pin window (always-on-top) |
| `Ctrl+Shift+D` | Toggle theme |
| `Ctrl+Shift+L` | Toggle language |
| `Ctrl+Shift+E` | Export conversation |
| `Ctrl+/` | Keyboard shortcut cheatsheet |
| `Tab` | Accept AI ghost text suggestion |
| `Esc` | Close modal / clear input |

Full shortcut list available in-app via `Ctrl+/`.

---

## Architecture

```
Renderer (React/Vite)  ←→  Preload (contextBridge)  ←→  Main (Node.js)
                                                              ├── pty-manager   (node-pty / xterm.js)
                                                              ├── stream-bridge (stream-json mode)
                                                              ├── session-reader
                                                              ├── config-manager
                                                              └── provider-manager
```

- **Frontend**: React 18 + TypeScript + Vite; Zustand for state management
- **Electron**: v39, strict main/renderer process separation via contextBridge IPC
- **CLI integration**: Two modes — PTY interactive terminal (node-pty) + Stream-JSON structured chat (child_process)
- **Persistence**: electron-store (settings/sessions/memory) + localStorage (departments/UI state) + filesystem (MEMORY.md / Skills)
- **Code splitting**: All panels and editor pages are lazy-loaded via `React.lazy()`

---

## Build & Run

### Requirements

- Node.js 18+
- Windows (verified) / macOS / Linux

### Development Mode

```bash
cd electron-ui

# Install dependencies
npm install

# Build main process
npm run build:main
npm run build:preload

# Start renderer (Vite HMR)
npm run dev:renderer

# In another terminal, start Electron (dev mode)
NODE_ENV=development npx electron dist/main/index.js
```

### Production Build

```bash
cd electron-ui

# Full build (main + preload + renderer)
npm run build

# Launch the built app
npx electron dist/main/index.js

# Package as Windows installer
npm run dist:win
```

### Rebuild node-pty (terminal native module)

```bash
cd electron-ui
npm run rebuild-pty
```

> The terminal feature requires the node-pty native module. If the terminal shows "basic mode", run this command.

---

## Project Structure

```
agents-a76b2932f5/               ← Project root (= electron-ui/)
├── src/
│   ├── main/                    ← Electron main process
│   │   ├── ipc/                 ← IPC handlers (implementations of all electronAPI.*)
│   │   ├── pty/                 ← PTY manager + Stream-Bridge
│   │   ├── session-reader.ts    ← Reads ~/.claude/projects/ JSONL sessions
│   │   └── config-manager.ts   ← API key & config management
│   ├── preload/
│   │   └── index.ts             ← contextBridge exposes window.electronAPI
│   └── renderer/
│       ├── components/
│       │   ├── chat/            ← All chat interface components
│       │   ├── departments/     ← Department workspace (Panel/Dashboard/SessionCard)
│       │   ├── workflows/       ← Workflows (Canvas/Editor/Detail/Node)
│       │   ├── settings/        ← Settings tab pages
│       │   ├── notes/           ← Notes panel
│       │   ├── skills/          ← Skills panel + marketplace
│       │   ├── memory/          ← Memory panel
│       │   ├── tasks/           ← Tasks & reminders
│       │   ├── changes/         ← Change tracking
│       │   ├── layout/          ← AppShell / NavRail / Sidebar
│       │   ├── onboarding/      ← Onboarding wizard (2 steps)
│       │   └── ui/              ← Shared UI components (Toggle / QR / Dialog, etc.)
│       ├── store/               ← Zustand stores (chat/ui/prefs/session/department)
│       ├── i18n/                ← Internationalization (en.json / zh-CN.json)
│       └── types/               ← TypeScript type definitions
├── package.json
├── tsconfig.main.json           ← Main process compile config (CommonJS)
├── tsconfig.preload.json
└── vite.config.ts               ← Renderer build config
```

---

## Internationalization

AIPA supports **English** and **简体中文** (Simplified Chinese). Switch instantly in Settings → General or via `Ctrl+Shift+L` — no restart required.

---

## License

This project is for personal use only. The Claude Code CLI under `package/` is owned by Anthropic and subject to its original license.
