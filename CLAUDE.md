# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Rules
- Never use co-author-by line while git commit
- Update `README.md` and `README_CN.md` for every important commit
- After every code change, run `npm run check` (from `electron-ui/`) to catch TypeScript and ESLint errors. Fix all errors before committing. Do not commit broken code.

## Project Overview

> **Read `README.md` for the full product vision and ultimate goal.**

AIPA is a desktop AI personal assistant — not merely a GUI wrapper. The Claude Code CLI is the execution engine; the Electron + React app is the cockpit that makes the agent's power accessible to everyday users. See `README.md` → *Vision* section for the north star this project is built toward.

The repo has two top-level concerns:

- `package/` — the bundled Claude Code CLI (`cli.js`, ESM, Node 18+). Treat as read-only vendored code.
- `electron-ui/` — the Electron + React app that wraps the CLI. All active development happens here.

## Commands (run from `electron-ui/`)

```bash
# Build all three targets (main, preload, renderer)
npm run build

# Build individual targets
npm run build:main      # tsc -p tsconfig.main.json  → dist/main/
npm run build:preload   # tsc -p tsconfig.preload.json → dist/preload/
npm run build:renderer  # vite build                  → dist/renderer/

# Launch the built app (production mode — loads dist/renderer/index.html)
node_modules/.bin/electron dist/main/index.js

# Dev mode (Vite HMR on localhost:5173)
npm run dev:renderer   # starts Vite
NODE_ENV=development node_modules/.bin/electron dist/main/index.js

# Rebuild node-pty native binary for current Electron version
npm run rebuild-pty     # electron-rebuild -f -w node-pty

# Package for distribution
npm run dist:win        # Windows x64 installer via electron-builder
```

There are no automated tests in this project.

## Architecture

### Process Boundary

The app has three isolated JS contexts connected via Electron IPC:

```
Renderer (React/Vite)  ←→  Preload (contextBridge)  ←→  Main (Node.js)
                                                              ├── pty-manager   (node-pty)
                                                              ├── stream-bridge (child_process)
                                                              ├── session-reader
                                                              └── config-manager
```

### Two CLI Modes

The main process wraps the CLI in two fundamentally different ways:

1. **PTY mode** (`src/main/pty/pty-manager.ts`) — spawns `node cli.js [--resume <id>]` via `node-pty` with ConPTY. Used for the interactive terminal panel (xterm.js in the renderer). Raw terminal I/O, no JSON parsing.

2. **Stream-JSON mode** (`src/main/pty/stream-bridge.ts`) — spawns `node cli.js --input-format stream-json --output-format stream-json --print` via `child_process.spawn`. Writes a user message JSON to stdin, parses NDJSON from stdout, emits typed events (`textDelta`, `toolUse`, `result`, etc.). Used for the structured chat panel.

### IPC Surface

All IPC is defined in `src/preload/index.ts` (exposed as `window.electronAPI`) and handled in `src/main/ipc/index.ts`. Channel namespaces:

- `pty:*` — PTY lifecycle (create, write, resize, destroy) + push events (pty:data, pty:exit)
- `cli:*` — stream-json send/abort + push events (cli:assistantText, cli:toolUse, cli:result, …)
- `session:*` — list/load/delete sessions from `~/.claude/projects/` JSONL files
- `config:*` / `prefs:*` — electron-store backed preferences and API key
- `fs:*` — directory listing, open dialog, home dir
- `menu:*` — push-only events from app menu to renderer

### Renderer State

Zustand stores in `src/renderer/store/index.ts`:
- `useChatStore` — messages, streaming state, tool use tracking, session ID
- `useSessionStore` — session list from sidebar
- `usePrefsStore` — user preferences (model, font, working dir, etc.)
- `useUiStore` — sidebar tab, open/closed state of sidebar + terminal panel

### TypeScript Config Split

The main process compiles separately as CommonJS (`tsconfig.main.json`); the renderer + preload use ESNext/bundler resolution via the root `tsconfig.json` (noEmit, bundled by Vite). Path alias `@/*` maps to `src/renderer/*`.

## Critical Platform Notes

- **node-pty binaries** are copied from VS Code's bundled node-pty (not built from source). If you need to rebuild, use `npm run rebuild-pty` and target Electron v39+.
- **electron-store must stay at v8** (CJS). v10+ is ESM-only and breaks the main process.
- **CLI path resolution**: `pty-manager.ts` and `stream-bridge.ts` each walk a list of candidate paths relative to `__dirname` to locate `package/cli.js`. Override with `CLAUDE_CLI_PATH` env var.
- **Session IDs**: There are two kinds — the internal `bridgeId` used within a single `StreamBridge` lifetime, and the real `claudeSessionId` from the CLI's `result` event (used to `--resume` across invocations).
- Do **not** set `NODE_ENV=development` when launching the built app — it makes Electron load `localhost:5173` instead of the built renderer files.
