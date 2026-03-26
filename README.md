# AIPA — AI Personal Assistant

> Your always-on desktop companion. Ask anything, automate anything, get things done — powered by Claude.

AIPA is a desktop AI personal assistant built with Electron + React. The goal is not merely a chat window — it is a capable agent that lives on your desktop, understands your files and environment, writes and runs code, browses the web, and handles real-world tasks end-to-end. Under the hood it drives the [Claude Code](https://claude.ai/code) CLI as its execution engine.

![Platform](https://img.shields.io/badge/platform-Windows-blue)
![Electron](https://img.shields.io/badge/Electron-39-47848F)
![React](https://img.shields.io/badge/React-18-61DAFB)

## Vision

Most AI tools are answer machines. AIPA is built to be a *doer*.

- You describe what you need — it figures out how to do it.
- It can read, write, and edit files on your machine.
- It can run shell commands and scripts.
- It can browse the web and fetch information.
- It remembers your sessions and picks up where you left off.
- It surfaces every decision it makes, so you stay in control.

The Claude Code CLI is the engine. AIPA is the cockpit.

## Features

- **Chat panel** — structured conversation with Claude via stream-JSON protocol, with tool-use visualization
- **Terminal panel** — full interactive PTY terminal running Claude Code directly (xterm.js)
- **Session history** — browse and resume past sessions from `~/.claude/projects/`, with search highlighting and skeleton loaders
- **File browser** — navigate the working directory from the sidebar
- **Settings** — configure API key, model, font, working directory, CLI flags, and MCP servers
- **Onboarding wizard** — guided setup on first launch
- **Message rating** — thumbs up/down on assistant messages
- **Thinking blocks** — collapsible extended thinking display
- **Token usage & cost** — live context usage and cost shown in status bar
- **Permission prompts** — friendly allow/deny cards for tool permission requests (Bash, Write, Edit, WebFetch, etc.)
- **Slash commands** — `/` popup with available commands in the input box
- **@mention popup** — mention files or contexts with `@`
- **Plan cards** — structured plan visualization in chat
- **Image paste** — paste images directly into the chat input
- **File drag-and-drop** — drag files from the OS file explorer into the chat; images are attached, other files are referenced via `@path`
- **Conversation export** — export conversations as Markdown or JSON via toolbar button or `Ctrl+Shift+E`
- **Command palette** — `Ctrl+Shift+P` to access all actions and slash commands in a fuzzy-search modal
- **Session auto-title** — conversations are automatically titled after the first exchange, with live sidebar refresh
- **System prompt** — inject a custom system prompt per session

## Security

AIPA follows Electron security best practices:

- **safeStorage encryption** — API keys are encrypted using the OS keychain (DPAPI on Windows, Keychain on macOS) via `electron.safeStorage`; no hardcoded keys
- **Content Security Policy** — strict CSP headers prevent XSS and unauthorized external resource loading
- **Sandboxed renderer** — `sandbox: true` enabled; renderer has no direct Node.js access
- **IPC input validation** — all file system IPC handlers validate paths against an allowlist of permitted directories
- **Environment sanitization** — CLI child processes only receive an explicit allowlist of environment variables (no secret leakage)

## Requirements

- Windows 10/11 x64
- [Node.js](https://nodejs.org/) 18 or later (must be on PATH)
- An [Anthropic API key](https://console.anthropic.com/)

## Getting Started

```bash
# 1. Clone the repo
git clone https://github.com/CipherSlinger/AIPA.git
cd AIPA/electron-ui

# 2. Install dependencies
npm install

# 3. Build
npm run build

# 4. Launch
node_modules/.bin/electron dist/main/index.js
```

On first launch, open **Settings** (sidebar → gear icon) and enter your Anthropic API key.

## Development (with Hot Reload)

```bash
# Terminal 1 — start Vite dev server
npm run build:main && npm run build:preload
npx vite

# Terminal 2 — launch Electron pointed at Vite
NODE_ENV=development node_modules/.bin/electron dist/main/index.js
```

## Build Installer (Windows)

```bash
npm run dist:win
# Output: electron-ui/release/
```

## Updating the Bundled CLI

The `package/` directory contains the bundled Claude Code CLI. Two helper scripts are included to check and update it:

```bash
# Bash (Linux / macOS / Git Bash on Windows)
bash update-cli.sh

# Windows Command Prompt
update-cli.bat
```

Both scripts compare the current version in `package/package.json` against the latest release on npm, and prompt you to confirm before downloading and replacing `package/`.

## Project Structure

```
AIPA/
├── package/          # Bundled Claude Code CLI (read-only, vendored)
└── electron-ui/      # Electron app
    ├── src/
    │   ├── main/     # Main process (Node.js): PTY, IPC, sessions, config
    │   ├── preload/  # Context bridge (exposes electronAPI to renderer)
    │   └── renderer/ # React UI (Vite + Tailwind)
    └── dist/         # Compiled output (generated, not committed)
```

## Architecture

The app bridges Claude Code in two modes:

| Mode | Used for | How |
|------|----------|-----|
| **PTY** (node-pty) | Terminal panel | Spawns `node cli.js` in a ConPTY, streams raw terminal I/O to xterm.js |
| **Stream-JSON** | Chat panel | Spawns `node cli.js --input-format stream-json --output-format stream-json --print`, parses NDJSON events |

All IPC between renderer and main process goes through `window.electronAPI` (defined in `src/preload/index.ts`).

## License

MIT
