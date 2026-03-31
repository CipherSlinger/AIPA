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
| **Terminal Access** | Built-in PTY terminal (xterm.js) accessible from the chat header — opens with `--resume` to continue the current conversation context |
| **Memory** | Persistent memory across sessions — preferences, facts, instructions, and context automatically injected into every conversation |
| **Workflows** | Chain prompts into reusable pipelines; schedule them to run daily, weekly, or monthly |
| **Notes** | Markdown notepad with categories, templates, and one-click save from any chat response |
| **Multi-Model** | Switch between Claude, GPT-4, DeepSeek, or local Ollama models mid-session |
| **Always Available** | System tray with quick actions, global hotkeys (`Ctrl+Shift+Space` toggle, `Ctrl+Shift+G` clipboard ask), and desktop notifications |
| **Channel** | Connect Feishu and WeChat messaging channels via OpenClaw — configure, test, and manage from the sidebar |

---

## Highlights

### Conversation
- **Stream-JSON chat** with live tool-use cards — see every file read, command run, and web fetch as it happens
- **Extended thinking** blocks, collapsible and auto-expanding during generation
- **Edit & regenerate** any message; pick a different model before regenerating
- **Read Aloud** via Web Speech API; **Quote Reply** by selecting text
- **Permission prompts** — friendly allow/deny cards before any destructive tool use

### Input Power Tools
- **Slash commands** (`/`), **@mention** file picker, **inline autocomplete** from prompt history
- **Text snippets** — `::keyword` expands reusable blocks
- **Text transforms** — make formal, casual, shorter, longer, or fix grammar with one click
- **Inline calculator** — type `= 42 * 1.18`, press Tab to insert the result
- **Task queue** — queue multiple prompts for sequential auto-execution

### Session Management
- Browse, search, tag, pin, and bulk-delete past sessions
- **Cross-session search** (`Ctrl+Shift+F`) across all JSONL history files
- Export conversations as Markdown, HTML, or JSON

### Personas & Memory
- Up to 10 custom AI personas with name, emoji, model, system prompt, and badge color
- Memory auto-injected into every conversation — pinned items + 10 most recent
- **Remember This** — one-click save any response from the hover toolbar

### Workflows & Schedules
- Build multi-step prompt pipelines with the visual workflow editor
- Schedule workflows to fire on a cron-like schedule (daily, weekly, monthly)
- Preset workflows to get started instantly

### Skills Marketplace
- 46 curated skills from Anthropic, OpenClaw, ClawhHub, and community contributors
- One-click install from the built-in marketplace; filter by source and category

### Channel (Feishu & WeChat)
- Connect your **Feishu** workspace bot via webhook URL + App credentials
- Connect your **WeChat Official Account** via token + App credentials
- Configure, test, and manage both channels from the sidebar `Radio` icon (`Ctrl+9`)
- Powered by OpenClaw integration

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
| `Ctrl+Shift+F` | Global cross-session search |
| `Ctrl+Shift+R` | Regenerate response |
| `Ctrl+Shift+E` | Export conversation |
| `Ctrl+Shift+D` | Cycle theme (Dark / Light / System) |
| `Ctrl+Shift+M` | Cycle model (Sonnet / Opus / Haiku) |
| `Ctrl+Shift+T` | Pin window on top (always-on-top) |
| `Ctrl+Shift+O` | Focus mode (hide sidebar + terminal) |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+`` ` `` | Toggle terminal |
| `Ctrl+,` | Open Settings |
| `Ctrl+1–4` | History, Files, Notes, Skills |
| `Ctrl+5–8` | Memory, Workflows, Prompt History, Channel |
| `Ctrl+/` | Shortcut cheatsheet |
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
