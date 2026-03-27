# AIPA Tester Memory

## Build Status
- All three targets (main, preload, renderer) compile clean as of 2026-03-26
- Vite bundle: ~977 kB (gzip ~276 kB) after Iteration 53 -- single chunk warning is expected
- Node warning: postcss.config.js needs `"type": "module"` in package.json (cosmetic)
- 2384 modules transformed, build time ~7.4s

## High-Frequency Issues
1. **Residual console.log**: Even after structured logging migration, stray console.log statements survive (found in stream-bridge.ts:92). Always grep for `console.log` in `src/main/` after logging changes.
2. **Imported-but-unused validators**: `validateFlags()` and `validateModelName()` imported in ipc/index.ts but never called in `cli:sendMessage` handler. Pattern: validation functions get written but not wired into handlers.
3. **Inconsistent path sandboxing**: Most fs handlers use `safePath()` but `fs:listCommands` does not. Check ALL fs-related handlers when path sandboxing is added.
4. **Empty catch blocks in session-reader.ts**: Pre-existing (not part of iteration changes). Multiple empty catch blocks at lines 104, 110, 112, 114, 253, 290.

## Security Checklist for IPC Reviews
- [ ] All fs handlers validate paths with safePath()
- [ ] cli:sendMessage validates flags and model name
- [ ] sanitizeEnv overrides are restricted to known keys
- [ ] BrowserWindow.fromWebContents null-checked before use with dialog APIs
- [ ] No hardcoded encryption keys in config-manager.ts (was fixed, verify stays fixed)

## Build Command
```
cd /home/osr/AIPA/electron-ui && npm run build
```
Build includes `clear-prefs` step that deletes the prefs JSON file before building.

## Iteration 53 Notes (WeChat UI Redesign)
- Three-column layout introduced: NavRail.tsx (new), AppShell.tsx, Sidebar.tsx restructured
- Message.tsx has dead code: `bubblePadding` variable (line ~145) computed but unused
- Sidebar.tsx has redundant `borderRight` that overlaps with AppShell's resize handle
- No new npm dependencies -- all icons come from existing lucide-react
