# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Rules
- Never use co-author-by line while git commit
- Update `README.md` and `README_CN.md` for every important commit
- After every code change, run `npm run check` (from `electron-ui/`) to catch TypeScript and ESLint errors. Fix all errors before committing. Do not commit broken code.

## Project Overview

> **Read `README.md` for the full product vision and ultimate goal.**

AIPA is a desktop AI personal assistant — not merely a GUI wrapper. The OpenAI Codex CLI is the primary execution engine; the Electron + React app is the cockpit that makes the agent's power accessible to everyday users. See `README.md` → *Vision* section for the north star this project is built toward.

The repo has these top-level concerns:

- `codex/` — sparse checkout of OpenAI Codex (protocol reference; runtime binary from `@openai/codex` npm package).
- `package/` — legacy Claude Code CLI (kept as fallback during migration). Will be removed.
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

1. **PTY mode** (`src/main/pty/pty-manager.ts`) — spawns `codex` in interactive mode via `node-pty` with ConPTY. Used for the interactive terminal panel (xterm.js in the renderer). Raw terminal I/O, no JSON parsing.

2. **App-Server mode** (`src/main/codex/codex-bridge.ts`) — spawns `codex app-server --stdio` via `child_process.spawn`. Speaks JSON-RPC 2.0 over stdio (newline-delimited JSON). Sends `initialize` → `thread/start` → `turn/start` requests, receives `turn/started`, `item/*`, `turn/completed` notifications. Used for the structured chat panel. Legacy StreamBridge (`src/main/pty/stream-bridge.ts`) remains as fallback for Claude CLI.

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

- **node-pty** uses v1.1.0 with official Node-API prebuilds (no Visual Studio C++ toolchain required). If you need to rebuild from source, use `npm run rebuild-pty` and target Electron v39+.
- **electron-store must stay at v8** (CJS). v10+ is ESM-only and breaks the main process.
- **Codex CLI resolution**: `codex-resolver.ts` walks candidate paths to locate the codex binary (npm `@openai/codex` package → platform-specific native binary). Override with `CODEX_CLI_PATH` env var. The Codex binary is a Rust-compiled native executable, not a Node.js script.
- **Session IDs**: There are two kinds — the internal `bridgeId` used within a single `CodexBridge` lifetime, and the `codexThreadId` (Codex thread ID) from the `thread/start` or `turn/completed` events. Codex uses `thread/resume` (not `--resume`) to continue sessions.
- **API Keys**: Primary key is `OPENAI_API_KEY` (for Codex). Legacy `ANTHROPIC_API_KEY` is still supported via the StreamBridge fallback.
- **Codex protocol**: JSON-RPC 2.0 over stdio (newline-delimited JSON, `"jsonrpc":"2.0"` header omitted on wire). See `codex/codex-rs/app-server/README.md` for the full protocol specification.
- Do **not** set `NODE_ENV=development` when launching the built app — it makes Electron load `localhost:5173` instead of the built renderer files.
