---
name: clawd-bridge IPC channels
description: IPC channels added for Clawd desktop pet integration (Iteration 615)
type: project
---

# Clawd Desktop Pet IPC Channels

Added in Iteration 615 — 2026-04-16.

## New IPC channels

| Channel | Direction | Returns |
|---------|-----------|---------|
| `clawd:launch` | renderer → main (invoke) | `{ success: boolean; alreadyRunning?: boolean; error?: string }` |
| `clawd:isRunning` | renderer → main (invoke) | `{ running: boolean }` |

## New preload API surface

- `window.electronAPI.clawdLaunch()` — launches Clawd if not running
- `window.electronAPI.clawdIsRunning()` — health-checks Clawd HTTP server

## New pref

- `ClaudePrefs.clawdEnabled?: boolean` — persisted via electron-store, default `false`

## Key file

- `electron-ui/src/main/clawd-bridge.ts` — fire-and-forget bridge module

**Why:** Bridge state notifications so existing channels remain unchanged.
**How to apply:** Do not create duplicate channels for these; they are already registered via `safeHandle`.
