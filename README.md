# AIPA

A desktop GUI wrapper for the [Claude Code](https://claude.ai/code) CLI, built with Electron + React.

![Platform](https://img.shields.io/badge/platform-Windows-blue)
![Electron](https://img.shields.io/badge/Electron-39-47848F)
![React](https://img.shields.io/badge/React-18-61DAFB)

## Features

- **Chat panel** — structured conversation with Claude via stream-JSON protocol, with tool-use visualization
- **Terminal panel** — full interactive PTY terminal running Claude Code directly (xterm.js)
- **Session history** — browse and resume past Claude sessions from `~/.claude/projects/`
- **File browser** — navigate the working directory from the sidebar
- **Settings** — configure API key, model, font, working directory, and CLI flags

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
