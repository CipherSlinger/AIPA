<p align="center">
  <h1 align="center">AIPA — AI Personal Assistant</h1>
  <p align="center">
    Your always-on desktop companion.<br/>
    Ask anything, automate anything, get things done.
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

AIPA is a desktop AI personal assistant built with Electron + React. It is not merely a chat window -- it is a capable agent that lives on your desktop, understands your files and environment, writes and runs code, browses the web, and handles real-world tasks end-to-end. Under the hood it drives the [Claude Code](https://claude.ai/code) CLI as its execution engine, with support for OpenAI, DeepSeek, Ollama, and any OpenAI-compatible provider.

## Vision

Most AI tools are answer machines. AIPA is built to be a *doer*.

- You describe what you need -- it figures out how to do it.
- It can read, write, and edit files on your machine.
- It can run shell commands and scripts.
- It can browse the web and fetch information.
- It remembers your sessions and picks up where you left off.
- It surfaces every decision it makes, so you stay in control.

**The Claude Code CLI is the engine. AIPA is the cockpit.**

---

## Feature Overview

### Conversation & Chat

| Feature | Description |
|---------|-------------|
| **Chat panel** | Structured conversation via stream-JSON protocol with tool-use visualization |
| **Terminal panel** | Full interactive PTY terminal (xterm.js) with auto-fallback to basic shell mode |
| **Message editing** | Edit any sent message; conversation truncates and re-sends for a fresh response |
| **Response regeneration** | Regenerate with `Ctrl+Shift+R`; split button lets you pick a different model first |
| **Follow-up suggestions** | 2-3 contextual chips appear after each response (e.g., "Explain this code", "Key takeaways") |
| **Thinking blocks** | Collapsible extended thinking display, auto-expands during streaming |
| **Message Read Aloud** | Web Speech API reads responses aloud; markdown stripped for clean speech |
| **Quote reply** | Select text and quote it into your next message with `>` markdown formatting |
| **Permission prompts** | Friendly allow/deny cards for tool permissions (Bash, Write, Edit, WebFetch, etc.) |
| **Plan cards** | Structured plan visualization in chat |

### Input & Composition

| Feature | Description |
|---------|-------------|
| **Slash commands** | `/` popup with available commands |
| **@mention popup** | Reference files and contexts with `@` |
| **Inline autocomplete** | Ghost text from prompt history appears as you type; press Tab to accept |
| **Text snippets** | `::keyword` trigger expands reusable text snippets |
| **Text transforms** | Make formal, casual, shorter, longer, or fix grammar via Wand button |
| **Response tone selector** | Pick a tone (Concise, Detailed, Professional, Casual, Creative) that modifies AI responses |
| **Inline calculator** | Type `= 42 * 1.18` to see instant results; Tab to accept |
| **Date/time insert** | Calendar button offers 7 locale-aware date/time formats |
| **Markdown shortcuts** | `Ctrl+B` bold, `Ctrl+I` italic, `Ctrl+Shift+U` case cycling |
| **Clipboard quick actions** | Paste & Ask: Summarize, Translate, Rewrite, Explain, Grammar Check |
| **URL paste detection** | Paste a URL to see quick action chips (Summarize, Explain, Translate) |
| **Long text paste detection** | Paste 500+ chars to see action chips; auto-dismiss after 12s |
| **Input history** | Up/Down arrows cycle previously sent messages; persists across restarts |
| **Task queue** | Queue multiple prompts for sequential auto-execution; pause, resume, or clear |
| **Image paste & drag-drop** | Paste images or drag files directly into the chat input |
| **Progress ring** | SVG ring around send button fills with color-coded progress as you type |

### Session Management

| Feature | Description |
|---------|-------------|
| **Session history** | Browse and resume past sessions with search, highlighting, and skeleton loaders |
| **Cross-session search** | `Ctrl+Shift+F` or press Enter in search bar to search all session files |
| **Session tags** | 6 color-coded tags (Work, Personal, Research, Debug, Docs, Archive) with filtering |
| **Session pinning** | Star sessions for quick access; pinned sessions sort to top |
| **Session project filter** | Filter by project path with pill-style buttons |
| **Multi-session bulk delete** | Select multiple sessions and delete at once with confirmation |
| **Session auto-title** | Conversations automatically titled after first exchange |
| **Session export** | Export as Markdown, HTML, or JSON; HTML produces a self-contained styled file |
| **Continue last conversation** | Welcome screen card to resume the most recent session with one click |
| **Sort options** | Sort by newest, oldest, alphabetical, or message count |

### Notes System

| Feature | Description |
|---------|-------------|
| **Quick notes** | Built-in notepad in sidebar; auto-save, up to 100 entries |
| **Note categories** | Up to 10 color-coded categories with filtering |
| **Markdown preview** | Toggle between raw editing and rendered Markdown |
| **Formatting toolbar** | Bold, Italic, Heading, Lists, Code, Link buttons |
| **Templates** | Meeting Notes, To-Do List, Journal Entry, Idea |
| **Note pinning & sorting** | Pin notes to top; sort by modified, created, or alphabetical |
| **Search & highlighting** | Full-text search with highlighted matches in context |
| **Export & import** | Individual or bulk export as Markdown; import .md/.txt files |
| **Save from chat** | Save input text or assistant responses as notes with one click |

### AI Personas

| Feature | Description |
|---------|-------------|
| **Custom personas** | Up to 10 profiles with name, emoji, model, system prompt, and badge color |
| **Quick switcher** | Switch personas from chat header, status bar, or Command Palette |
| **Persona avatars** | Messages display persona emoji; thinking indicator shows persona name |
| **Persona starters** | Welcome screen shows persona-specific suggestion cards |
| **Preset personas** | Assistant, Writer, Analyst, Tutor, Coder -- one-click install |
| **Export & import** | Share persona configurations as JSON files |

### Memory & Workflows

| Feature | Description |
|---------|-------------|
| **Persistent memory** | Brain icon (`Ctrl+6`): 4 categories (Preference, Fact, Instruction, Context), max 200 items |
| **Memory injection** | Pinned + 10 most recent memories auto-injected into every conversation |
| **Remember This** | One-click save any response as a context memory from hover toolbar |
| **Workflow builder** | Workflow icon (`Ctrl+7`): chain multiple prompts into reusable pipelines; includes scheduled prompts tab |
| **Scheduled prompts** | Built into Workflows panel — daily, weekly, monthly schedules with auto-execution |
| **Prompt history** | ListRestart icon (`Ctrl+8`): searchable history with frequency tracking and favorites |

### Multi-Model Support

| Feature | Description |
|---------|-------------|
| **Provider management** | Configure Claude, OpenAI, DeepSeek, Ollama, and custom OpenAI-compatible endpoints |
| **Model picker** | Grouped by provider with capability tags (Vision, Code, Reasoning) and health dots |
| **Auto-failover** | When a provider fails, auto-switch to next in the failover chain with toast notification |
| **API key pool** | Multiple API keys with automatic rotation when quota exhausted |

### Skills Marketplace

| Feature | Description |
|---------|-------------|
| **Skill browser** | Browse installed skills (personal + project) with search and detail view |
| **Curated marketplace** | 46+ skills from Anthropic, OpenClaw, ClawhHub, and community contributors |
| **Source filtering** | Filter by source (Anthropic/OpenClaw/ClawhHub/Community) and 7 categories |
| **One-click install** | Install skills with attribution and source links |
| **ClawhHub integration** | Live skill fetching from ClawhHub.ai API |

### Appearance & Themes

| Feature | Description |
|---------|-------------|
| **Dark, Light & System themes** | System mode follows OS preference in real-time; cycle with `Ctrl+Shift+D` |
| **Chat zoom** | `Ctrl+=` zoom in, `Ctrl+-` zoom out, `Ctrl+0` reset (70%-150% range) |
| **Compact mode** | Denser message layout via Settings |
| **Focus mode** | `Ctrl+Shift+F` hides sidebar and terminal |
| **Message animations** | Direction-aware slide-in with glow effect; respects `prefers-reduced-motion` |
| **Expandable NavRail** | Toggle between icon-only and icon+label sidebar navigation |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New conversation |
| `Ctrl+F` | Search in conversation |
| `Ctrl+Shift+F` | Global cross-session search |
| `Ctrl+Shift+P` | Command palette |
| `Ctrl+Shift+E` | Export conversation |
| `Ctrl+Shift+D` | Cycle theme |
| `Ctrl+Shift+L` | Toggle language |
| `Ctrl+Shift+R` | Regenerate response |
| `Ctrl+Home/End` | Jump to first/last message |
| `Alt+Up/Down` | Jump between user messages |
| `Ctrl+1-5` | Switch sidebar tabs |
| `Ctrl+6-8` | Memory, Workflows, Prompt History |
| `Ctrl+/` | Shortcut cheatsheet |
| `Escape` | Stop streaming |

### Accessibility & i18n

| Feature | Description |
|---------|-------------|
| **Multi-language** | English and Simplified Chinese; defaults to system locale |
| **ARIA landmarks** | `role="application"`, `role="navigation"`, `aria-live` regions, `aria-label` on all interactive elements |
| **Focus trapping** | Modal dialogs (Command Palette, Image Lightbox) trap Tab navigation |
| **Zero TypeScript errors** | Clean `tsc --noEmit` with full strict mode |

### Status Bar

| Feature | Description |
|---------|-------------|
| **Token usage & cost** | Live context bar, per-turn tokens, cumulative cost -- click to copy |
| **Streaming speed** | Characters/sec and estimated tokens/sec during active streaming |
| **Model switcher** | Click model badge for quick dropdown switch |
| **Persona switcher** | Quick-switch personas from the status bar |
| **Focus timer** | 25-minute Pomodoro countdown with completion notification |
| **Stopwatch** | Count-up timer; click to start/pause, double-click to reset |

---

## Security

- **safeStorage encryption** -- API keys encrypted using the OS keychain (DPAPI on Windows, Keychain on macOS) via `electron.safeStorage`
- **Content Security Policy** -- strict CSP headers prevent XSS and unauthorized external resource loading
- **Sandboxed renderer** -- `sandbox: true` enabled; renderer has no direct Node.js access
- **IPC input validation** -- all file system IPC handlers validate paths against an allowlist of permitted directories
- **Environment sanitization** -- CLI child processes only receive an explicit allowlist of environment variables

---

## Requirements

- Windows 10/11 x64
- [Node.js](https://nodejs.org/) 18 or later (must be on PATH)
- An [Anthropic API key](https://console.anthropic.com/) for Claude models
- Optional: OpenAI API key, DeepSeek API key, or local [Ollama](https://ollama.ai/) instance for multi-model support

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

On first launch, open **Settings** (sidebar gear icon) and enter your Anthropic API key.

## Development (with Hot Reload)

```bash
# Terminal 1 -- start Vite dev server
npm run build:main && npm run build:preload
npx vite

# Terminal 2 -- launch Electron pointed at Vite
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

## Architecture

```
AIPA/
  package/          # Bundled Claude Code CLI (read-only, vendored)
  electron-ui/      # Electron app
    src/
      main/         # Main process (Node.js): PTY, IPC, sessions, config, providers
      preload/      # Context bridge (exposes electronAPI to renderer)
      renderer/     # React UI (Vite + Zustand + i18n)
    dist/           # Compiled output (generated, not committed)
```

The app bridges Claude Code in two modes:

| Mode | Used for | How |
|------|----------|-----|
| **PTY** (node-pty) | Terminal panel | Spawns `node cli.js` in a ConPTY, streams raw terminal I/O to xterm.js |
| **Stream-JSON** | Chat panel | Spawns `node cli.js --input-format stream-json --output-format stream-json --print`, parses NDJSON events |

All IPC between renderer and main process goes through `window.electronAPI` (defined in `src/preload/index.ts`).

## License

MIT
