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
- **Session history** — browse and resume past sessions from `~/.claude/projects/`, with search highlighting, skeleton loaders, and active session indicator
- **File browser** — navigate the working directory from the sidebar
- **Settings** — configure API key, model, font, working directory, CLI flags, and MCP servers
- **Onboarding wizard** — guided setup on first launch
- **Message rating** — thumbs up/down on assistant messages via right-click context menu
- **Message context menu** — right-click any message for quick actions: copy, rate, rewind to checkpoint
- **Thinking blocks** — collapsible extended thinking display
- **Token usage & cost** — live context usage bar, per-turn token counts, and cumulative session cost in status bar
- **Permission prompts** — friendly allow/deny cards for tool permission requests (Bash, Write, Edit, WebFetch, etc.)
- **Slash commands** — `/` popup with available commands in the input box
- **@mention popup** — mention files or contexts with `@`
- **Plan cards** — structured plan visualization in chat
- **Image paste** — paste images directly into the chat input
- **File drag-and-drop** — drag files from the OS file explorer into the chat; images are attached, other files are referenced via `@path`
- **Conversation export** — export conversations as Markdown or JSON via toolbar button or `Ctrl+Shift+E`
- **Command palette** — `Ctrl+Shift+P` to access all actions and slash commands in a fuzzy-search modal
- **Keyboard shortcuts** — `Ctrl+N` new conversation, `Ctrl+B` toggle sidebar, `Ctrl+`` toggle terminal, `Ctrl+L` focus input, `Ctrl+,` settings, `Ctrl+Shift+E` export, `Ctrl+F` search in conversation, `Ctrl+/` shortcut cheatsheet
- **Session auto-title** — conversations are automatically titled after the first exchange, with live sidebar refresh
- **System prompt** — inject a custom system prompt per session
- **Smart auto-scroll** — auto-scroll respects user intent; scroll-to-bottom button appears when reading earlier messages
- **Streaming elapsed timer** — real-time timer shows how long Claude has been working
- **Settings About tab** — version info, external links, keyboard shortcut reference, runtime info, reset to defaults
- **Virtual message list** — uses `@tanstack/react-virtual` for smooth performance with 100+ messages
- **Conversation search** — `Ctrl+F` to search within current conversation with match highlighting and navigation
- **Input history** — press Up/Down arrows to cycle through previously sent messages, like a terminal shell
- **Draft auto-save** — unsent input is preserved across page refreshes within the session
- **External links** — markdown links open in the system browser, not inside the Electron window
- **Completion sound** — configurable audio chime when Claude finishes responding (Settings > Completion Sound)
- **Relative timestamps** — messages show "2m ago", "1h ago" etc., live-updating, with absolute time on hover
- **GFM task list checkboxes** — `- [x]` and `- [ ]` render as styled visual checkboxes
- **Message bookmarks** — right-click to bookmark important messages for quick visual reference
- **Word/token count** — hover over assistant messages to see word count and approximate token estimate
- **Compact mode** — reduce spacing for a denser view (Settings > Compact Mode)
- **Session delete confirmation** — two-click confirmation prevents accidental session deletion
- **Scroll position memory** — scroll positions are remembered when switching between sessions
- **Copy as Markdown** — right-click assistant messages to copy raw Markdown source
- **Shortcut cheatsheet** — `Ctrl+/` opens a floating overlay showing all keyboard shortcuts
- **System message styling** — error and system messages have distinct red-tinted appearance
- **Contextual typing indicator** — shows what Claude is doing: "Thinking...", "Running command...", "Reading file...", etc.
- **Session count badge** — sidebar History tab shows total number of sessions
- **Collapsible code blocks** — long code blocks auto-collapse with "Show more/less" toggle
- **Code block line count** — code blocks display line count in the header
- **Date separators** — messages grouped by day with "Today", "Yesterday", or date headers
- **Focus mode** — `Ctrl+Shift+F` hides sidebar and terminal for distraction-free work
- **Bookmarks panel** — toolbar dropdown lists all bookmarked messages with jump-to navigation
- **Unread count badge** — scroll-to-bottom button shows count of new messages when scrolled up
- **Double-click copy** — double-click any message to copy its text to clipboard
- **Session pinning** — star/pin sessions in the sidebar for quick access; pinned sessions sort to top
- **Message collapse** — collapse individual messages to reduce visual clutter, with content preview
- **Conversation stats** — toolbar popover showing message counts, word totals, tool uses, and session cost
- **Collapse all/expand all** — bulk collapse or expand all messages via the stats panel or `Ctrl+Shift+C`
- **Raw markdown toggle** — view assistant messages as raw markdown source with a toggle button
- **Message count in toolbar** — toolbar shows total message count for the current conversation
- **Scroll progress indicator** — thin progress bar at top of message list showing scroll position
- **Quick session navigation** — `Ctrl+[` / `Ctrl+]` to switch between sessions without using the sidebar
- **Image lightbox** — click any image attachment to open a full-screen preview with zoom, rotate, and keyboard controls
- **Window title notification** — window title shows session name and flashes (*) when Claude finishes responding
- **Ctrl+K clear** — alternative shortcut to clear conversation, matching terminal conventions
- **Streaming spinner** — animated spinner in toolbar next to elapsed timer during active streaming
- **Enhanced table styling** — markdown tables with rounded borders, accent header, hover highlights
- **Responsive sidebar** — sidebar auto-collapses when window width drops below 600px
- **Persistent sort order** — session sort preference (newest/oldest/alpha) is remembered across restarts
- **Clear confirmation** — Ctrl+N/K requires double-press within 1.5s when conversation has 3+ messages
- **Message entrance animation** — new messages slide in with a subtle fade animation
- **Session keyboard navigation** — Up/Down arrow keys to navigate sessions in the sidebar list
- **Status bar streaming indicator** — pulsing green dot and "Streaming" label during active responses
- **Input quick actions** — small "Clear", "@file", "/cmd" buttons above the textarea for quick access
- **Task queue** — queue multiple prompts for sequential auto-execution; pause, resume, or clear the queue at any time
- **Multi-language (i18n)** — supports English and Simplified Chinese; defaults to system locale, switchable in Settings
- **Dark & Light themes** -- clean Dark and Light themes; switchable in Settings
- **System tray** — minimize to system tray; global hotkey `Ctrl+Shift+Space` to summon the window from anywhere
- **Response regeneration** — regenerate the last AI response with a single click or `Ctrl+Shift+R`; removes the previous response and re-sends your prompt
- **Message editing** — edit any previously sent message; the conversation is truncated at that point and the edited message is re-sent for a fresh response
- **Chat zoom** — `Ctrl+=` to zoom in, `Ctrl+-` to zoom out, `Ctrl+0` to reset; zoom level indicator appears and can be clicked to reset
- **Prompt templates** — pre-configured system prompt roles (Writing Assistant, Research Analyst, Tutor, Code Reviewer, Creative Writer, Productivity Coach) selectable from Settings dropdown; create your own custom templates (up to 20) for reusable workflows like meeting notes, email drafts, or weekly reports
- **Copy conversation** — copy the entire conversation as Markdown to clipboard with `Ctrl+Shift+X` or toolbar button; instant clipboard access without file dialogs
- **ARIA accessibility** — landmark roles (`application`, `banner`, `main`, `complementary`, `navigation`, `status`, `log`), `aria-live` regions, `aria-label` on all interactive elements for screen reader support
- **Zero TypeScript errors** — clean `tsc --noEmit` with full strict mode; SpeechRecognition Web API type declarations included
- **Session tags** — color-coded tag system (Work, Personal, Research, Debug, Docs, Archive) for organizing sessions; assign via hover menu, filter by tag in sidebar, customize tag names in Settings
- **Quick notes** — built-in notepad in the sidebar for jotting down ideas, to-dos, or key points alongside conversations; notes auto-save, persist across restarts, and support up to 100 entries
- **Note-chat integration** — send any note to the chat input with one click ("Send to Chat"); save any assistant response as a note via right-click menu ("Save as Note"); seamlessly bridge note-taking and AI conversation
- **Notes Markdown preview** — toggle between raw editing and rendered Markdown preview; supports headings, bold, italic, lists, code blocks, tables, and GFM checkboxes
- **Notes search** — instant full-text search across all notes by title and content, with match count and clear button
- **Note title auto-generation** — notes automatically pick up their title from the first Markdown heading (`#`, `##`, `###`)
- **Clipboard quick actions** — "Paste & Ask" button in the chat toolbar reads clipboard text and offers one-click actions: Summarize, Translate, Rewrite, Explain, Grammar Check; auto-detects target language for translation

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
