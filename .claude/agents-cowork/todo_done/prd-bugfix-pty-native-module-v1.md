# PRD: Fix node-pty Native Module Crash (P0 Bug)

**Priority**: P0 (Critical user-facing bug)
**Author**: aipa-pm (auto-generated from feedback.md)
**Date**: 2026-03-28

---

## Problem

The terminal panel opens blank with no content when clicking the Terminal button in the NavRail or status bar. The error is:

```
Error: Cannot find module '../build/Release/pty.node'
Error: Cannot find module '../build/Debug/pty.node'
```

This has been reported multiple times by the user. Previous fix attempts in Iteration 108 (startProcess argument count) and Iteration 110 (useConpty: false) addressed different symptoms but did not fix the root cause: the native `.node` binary may not be compiled for the user's platform/Electron version.

## Root Cause

1. `node-pty` requires a platform-specific compiled native module (`pty.node`)
2. The binary in the repo is compiled for Linux; Windows users need a Windows-compiled binary
3. `electron-builder install-app-deps` (postinstall) should rebuild, but may fail silently
4. When the binary is missing, `require('../build/Release/pty.node')` throws, and the error propagates unhandled, leaving the terminal panel blank with no user-facing feedback

## Solution

Three-layer graceful error handling:

1. **pty-manager.ts (main process)**: Lazy-load `node-pty` with try-catch. If the native module fails to load, `create()` throws a descriptive `PTY_NATIVE_UNAVAILABLE` error with platform-specific rebuild instructions.

2. **usePty.ts (renderer hook)**: Catch the error from `ptyCreate` IPC call. Display the error message directly in the xterm.js terminal using ANSI color codes (red error, yellow instructions).

3. **TerminalPanel.tsx**: Show error state in the toolbar (red Terminal icon, "Terminal Error" label, hide reconnect button).

4. **i18n**: Add terminal error message keys to both en.json and zh-CN.json.

## Acceptance Criteria

- [ ] Terminal panel shows a clear error message when node-pty native module is unavailable
- [ ] Error message includes rebuild instructions (platform-specific)
- [ ] App does not crash -- error is contained to the terminal panel
- [ ] Toolbar shows error state (red icon, error label)
- [ ] i18n keys for terminal error state (en + zh-CN)
- [ ] Build passes on all three targets
