<p align="center">
  <h1 align="center">AIPA</h1>
  <p align="center">
    <strong>AI Personal Assistant — your always-on desktop agent</strong><br/>
    Ask anything. Automate anything. Get things done.
  </p>
  <p align="center">
    <img src="https://img.shields.io/badge/platform-Windows-blue" alt="Platform" />
    <img src="https://img.shields.io/badge/Electron-39-47848F" alt="Electron" />
    <img src="https://img.shields.io/badge/React-18-61DAFB" alt="React" />
    <img src="https://img.shields.io/badge/TypeScript-strict-3178c6" alt="TypeScript" />
    <img src="https://img.shields.io/badge/i18n-EN%20%7C%20%E4%B8%AD%E6%96%87-brightgreen" alt="i18n" />
  </p>
</p>

---

AIPA is not a chat window. It's a **desktop agent** that lives alongside you — reads and writes your files, runs shell commands, browses the web, chains tasks into workflows, and remembers context across sessions. Under the hood it drives the [Claude Code](https://claude.ai/code) CLI as its execution engine, wrapped in a polished Electron + React cockpit with support for Claude, OpenAI, DeepSeek, Ollama, and any OpenAI-compatible provider.

> **The Claude Code CLI is the engine. AIPA is the cockpit.**

---

## What AIPA Can Do

| | |
|---|---|
| **Chat & Execute** | Full conversational AI with tool-use visualization — watch the agent read files, run code, and browse the web in real time |
| **Memory** | Persistent memory across sessions — preferences, facts, instructions, and context automatically injected into every conversation |
| **Workflows** | Chain prompts into reusable multi-step pipelines with preset templates for common tasks |
| **Notes** | Markdown notepad with categories, templates, and one-click save from any chat response |
| **Multi-Model** | Switch between Claude, GPT-4, DeepSeek, or local Ollama models mid-session; Qwen via QR code quick setup |
| **Always Available** | System tray with quick actions, global hotkeys (`Ctrl+Shift+Space` toggle, `Ctrl+Shift+G` clipboard ask), and desktop notifications |
| **Tasks & Reminders** | Quick todo list with **3-state status** (pending/in_progress/completed) + 5s hide-delay, one-shot timed reminders + **cron recurring reminders** (5-field expressions, human-readable frequency labels, preset picker), daily briefing |
| **Channel** | Connect Feishu and WeChat messaging channels via OpenClaw — configure, test, and manage from the sidebar |

---

## Highlights

### Conversation
- **Stream-JSON chat** with live tool-use cards — see every file read, command run, and web fetch as it happens
- **Tool Use Summary Labels** — consecutive tool calls auto-grouped with human-readable operation summaries
- **Structured Diff View** — file edits and writes shown in LCS-based unified diff format with color-coded add/delete lines and collapsible large diffs
- **Custom System Prompt** — Settings → Advanced tab to configure a persistent append prompt (2000-char limit, 6 presets); ChatHeader button for per-session temporary override; effective prompt priority: temp > persistent, injected via `--append-system-prompt`
- **Extended thinking** blocks, collapsible and auto-expanding during generation; one-click toggle in StatusBar
- **Output Styles** — three response modes (default/explanatory/learning), quick-switch from toolbar
- **Auto-Compaction** — automatically summarizes older messages when context window nears capacity (threshold configurable 60%-90%); **Microcompact** pre-processing trims long messages before summarization to reduce input tokens; **Time-gap microcompact** clears stale tool results across sessions idle for 30+ minutes
- **Context Suggestions** — when context usage exceeds 70%, shows per-tool optimization tips (bash output, file reads, web fetches) with estimated token savings in a lightbulb popover
- **Away Summary** — when you return after 5+ minutes away, automatically injects a purple summary card into the conversation showing what was happening
- **Conversation Rewind** — roll back to any message, syncing both in-memory state and persisted session
- **Keyboard message navigation** — `Ctrl+Up/Down` to step through messages, `Ctrl+Home/End` to jump to first/last, with visual focus indicator
- **Edit & regenerate** any message; pick a different model before regenerating
- **Read Aloud** via Web Speech API; **Quote Reply** by selecting text
- **Permission prompts** — friendly allow/deny cards before any destructive tool use
- **System Diagnostics** — one-click health checks for CLI, API key, network, disk space, and system load
- **Startup Protection** — IPC pre-registration eliminates race conditions, non-blocking menu construction, 10s hard splash timeout, renderer error recovery, preferences reset for bulletproof launches

### Input Power Tools
- **Slash commands** (`/`), **@mention** file picker
- **Text snippets** — `::keyword` expands reusable blocks
- **Text transforms** — make formal, casual, shorter, longer, or fix grammar with one click
- **Inline calculator** — type `= 42 * 1.18`, press Tab to insert the result
- **Task queue** — queue multiple prompts for sequential auto-execution

### Session Management
- Browse, search, tag, pin, and bulk-delete past sessions
- **Cross-session search** (`Ctrl+Shift+F`) across all JSONL history files
- **Session Changes Panel** -- view files modified during the current session
- **Collapsible date groups** -- sessions auto-grouped by time period (Today/Yesterday/This Week/Older) with collapse toggles and per-group counts
- **Compact view** -- toggle compact mode to hide avatars and previews, showing only titles for maximum density
- **Sort dropdown** -- single-click sort selection (Newest/Oldest/A-Z/Most Messages) via dropdown popover
- **Context window monitor** -- progress bar + percentage badge + detail popover showing token usage, with one-click "start new session" when nearing the limit
- **Streaming cursor** -- animated blinking cursor during AI response streaming, disappears on completion
- **Session count badge** -- History nav tab shows total session count; pulsing activity dot when AI is streaming from another tab
- **Session Fork** — right-click any message → "Fork from here", name the branch, new session starts with history up to that point; fork appears in sidebar
- Export conversations as Markdown, HTML, or JSON

### Personas & Memory
- Up to 10 custom AI personas with name, emoji, model, system prompt, and badge color
- **Preset localization** — 5 built-in persona names automatically switch with system language
- Memory auto-injected into every conversation — pinned items + 10 most recent
- **Auto-Memory Extraction** — optionally extracts durable memories (preferences, facts, instructions) from conversations automatically
- **Memory Type Tags** — 4 semantic types (user/feedback/project/reference) with color badges, aligned with Claude Code's memory taxonomy
- **Project Memory Partition** — Memory panel "Project" tab reads/writes `.claude/MEMORY.md` directly, syncing with Claude Code's project memory system
- **Advisor Model** — configure a separate lighter model for background tasks (auto-compaction, memory extraction, away summaries) to keep costs low
- **Remember This** — one-click save any response from the hover toolbar
- **Contextual Tips** — smart feature discovery tips on the Welcome Screen, personalized to your usage patterns
- **Prompt Suggestions** — AI-predicted follow-up suggestions after each response, shown as ghost text in the input field (Tab to accept)
- **Speculative Execution** — pre-executes the predicted next prompt in an isolated sandbox; shows a collapsible preview card with response content, tool actions, and changed files; accept to inject the result into the conversation, reject to silently discard — the main session is never touched (opt-in in Settings)
- **Thinking Depth** — low/medium/high effort levels controlling AI thinking investment
- **Per-Model Cost Breakdown** — click cost in StatusBar to see token usage and cost breakdown by model

### Workflows
- Build multi-step prompt pipelines with the visual workflow editor
- **Canvas Mode** — workflow steps displayed as a node graph with drag, pan, and zoom; real-time execution highlighting shows active/completed/pending nodes with a progress bar; zoom toward cursor, +/- buttons with keyboard shortcuts (+/−/0), status-colored edges (green=done, accent=active, muted=idle), moving dot-grid background, real AI output text in node sidebar; flowing dash animation on active edges; collapsible nodes (per-node or collapse-all/expand-all); right-click context menu with copy prompt/output; step list syncs live execution status; Run button disabled during execution; step search filter with canvas dim for non-matching nodes; per-step execution duration shown on nodes and sidebar
- 6 preset workflows to get started instantly (weekly reports, code reviews, daily summaries, and more)
- **Preset localization** — workflow names and descriptions automatically switch with system language

### Skills Marketplace
- 47 curated skills from Anthropic, OpenClaw, ClawhHub, and community contributors
- One-click install from the built-in marketplace; filter by source and category
- Built-in Skill Creator for designing custom skills interactively through chat

### Channel (Feishu & WeChat)
- Connect your **Feishu** workspace bot via webhook URL + App credentials
- Connect your **WeChat** via the official Tencent OpenClaw WeChat CLI plugin (`@tencent-weixin/openclaw-weixin-cli`)
- Configure, test, and manage both channels from the sidebar `Radio` icon (`Ctrl+7`)
- Powered by OpenClaw integration

### CLI Integration & Automation
- **Hooks Configuration** — Settings → Hooks tab to visually manage all Claude Code CLI hooks (28 event types: PreToolUse, PostToolUse, Stop, etc.); multi-step add wizard supporting command/prompt/HTTP hook types; live hook execution progress shown in the chat panel
- **MCP Server Manager** — Settings → MCP tab for full MCP server management (stdio/http/sse); add/delete/reconnect servers; expand tool lists per server; tool-use blocks auto-badge MCP-sourced tools with `[serverName]`
- **Tool Access Control** — Settings → Advanced tab with 4 preset modes (All Tools / Read Only / No Network / Analysis Only); per-tool checkboxes grouped by category; disabled tools injected via `--disallowedTools`

### System Tray & Global Access
- Minimize to system tray — AIPA stays ready in the background
- `Ctrl+Shift+Space` toggles the window from any application
- `Ctrl+Shift+G` reads clipboard and opens AIPA with the text pre-filled for instant analysis
- Right-click tray icon for quick actions: new chat, recent sessions, theme toggle, clipboard ask
- Desktop notifications when responses complete while the window is unfocused

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New conversation |
| `Ctrl+Shift+P` | Command palette |
| `Ctrl+F` | Search current conversation |
| `Ctrl+Shift+F` | Global cross-session search |
| `Ctrl+Shift+R` | Regenerate response |
| `Ctrl+Shift+E` | Export conversation |
| `Ctrl+Shift+K` | Compact conversation context |
| `Ctrl+Shift+C` | Collapse/expand all messages |
| `Ctrl+Shift+B` | Toggle bookmarks panel |
| `Ctrl+Shift+S` | Toggle stats panel |
| `Ctrl+Shift+D` | Cycle theme (Dark / Light / System) |
| `Ctrl+Shift+L` | Toggle language (en/zh-CN) |
| `Ctrl+Shift+M` | Cycle model (Sonnet / Opus / Haiku) |
| `Ctrl+Shift+T` | Pin window on top (always-on-top) |
| `Ctrl+Shift+O` | Focus mode (hide sidebar + terminal) |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+,` | Open Settings |
| `Ctrl+1–4` | History, Files, Notes, Skills |
| `Ctrl+5–7` | Memory, Workflows, Channel |
| `Ctrl+8` | Tasks |
| `Ctrl+/` | Shortcut cheatsheet |
| `Ctrl+Up/Down` | Step through messages (with focus indicator) |
| `Ctrl+Home/End` | Jump to first/last message |
| `Alt+Up/Down` | Jump to previous/next user message |
| `PageUp/Down` | Page scroll in message list |
| `Ctrl+Shift+Space` | Toggle AIPA window (global, works from any app) |
| `Ctrl+Shift+G` | Clipboard quick action (global: reads clipboard, opens AIPA, sends to chat) |

---

## Quick Start

```bash
git clone https://github.com/CipherSlinger/AIPA.git
cd AIPA/electron-ui
npm install
npm run build
node_modules/.bin/electron dist/main/index.js
```

Open **Settings** (`Ctrl+,`) on first launch and enter your Anthropic API key.

### Dev Mode (Hot Reload)

```bash
# Terminal 1
npm run build:main && npm run build:preload && npx vite

# Terminal 2
NODE_ENV=development node_modules/.bin/electron dist/main/index.js
```

### Build Installer

```bash
npm run dist:win   # → release/ directory
```

---

## Requirements

- Windows 10/11 x64
- Node.js 18+ on PATH
- Anthropic API key ([console.anthropic.com](https://console.anthropic.com/))
- _Optional:_ OpenAI key, DeepSeek key, or local [Ollama](https://ollama.ai/) instance

---

## Architecture

```
AIPA/
  package/          # Bundled Claude Code CLI (vendored, read-only)
  electron-ui/
    src/
      main/         # Node.js: PTY manager, stream-bridge, IPC, sessions, config
      preload/      # contextBridge → window.electronAPI
      renderer/     # React + Vite + Zustand + i18n
    dist/           # Compiled output (not committed)
```

The CLI is bridged in two modes:

| Mode | Panel | Mechanism |
|------|-------|-----------|
| **PTY** (node-pty) | Terminal | Raw ConPTY I/O → xterm.js |
| **Stream-JSON** | Chat | NDJSON events → typed React state |

---

## Security

- API keys encrypted with OS keychain (`electron.safeStorage` / DPAPI)
- Strict Content Security Policy — no XSS, no unauthorized external loads
- Sandboxed renderer — no direct Node.js access
- IPC path validation — file system handlers check against an allowed-directory list
- Sanitized CLI environment — child processes receive only an explicit env allowlist

---

## License

MIT
