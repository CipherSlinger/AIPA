---
name: electron-main-ipc-conventions
description: How aipa-backend structures new Electron main-process feature modules (koffi / native quirks, logging, IPC boundaries)
metadata:
  type: feedback
---

New main-process feature modules go under their own directory in `src/main/<feature>/` with zero IPC registration until the UI is actually being wired. Prototypes are kept runnable from Node/Electron directly so they can be verified without the app shell.

**Why:** The user explicitly scoped the WeChat prototype to "backend plumbing only, do not hook into UI, do not touch `src/main/ipc/index.ts`". Mixing IPC wiring into a feasibility spike makes it harder to throw away and forces renderer coordination before the design is settled.

**How to apply:**
- Put native/FFI work behind a one-shot lazy `initNative()` that returns null on unsupported platforms — never `require('koffi')` at module top level (reference: `src/main/clawd/src/mac-window.js`).
- koffi: declare `koffi.struct()` / `koffi.proto()` before the `func()` prototypes that reference them, or you get `Unknown or invalid type name`.
- Never call FFI from inside a WinEvent hook callback — defer with `setImmediate`.
- `createLogger('<module>')` from `src/main/utils/logger.ts` for all diagnostics; it writes to `~/.claude/aipa.log`.
- PowerShell/WinRT bridges: prefer a persistent worker (`-File`, paths over stdin) over per-request spawns when latency matters — see [[wechat-companion-constraints]].
- Verify with a throwaway script, capture the real output, then delete the script. Don't leave probe files behind.