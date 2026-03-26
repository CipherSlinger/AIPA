# Iteration Report: Settings About Tab & Shell Open External

**Date**: 2026-03-27 03:30
**Iteration**: 16
**Status**: COMPLETE
**Build**: PASS (Vite)

## Changes

### New Features
- `electron-ui/src/renderer/components/settings/SettingsPanel.tsx`
  - **About tab**: New third tab in settings panel with app identity (AIPA v1.0.0, CLI v2.1.81), external links (GitHub, Anthropic Console, API docs, API key management), keyboard shortcuts reference table, runtime version info (Electron, Node.js, Chromium), and "Reset to Defaults" button.
  - Restructured conditional rendering from two-way (general/MCP) to three-way (general/MCP/about) using chained ternary.

- `electron-ui/src/preload/index.ts`
  - Added `shellOpenExternal(url)` IPC bridge for opening URLs in default browser.
  - Added `versions` object exposing Electron, Node.js, and Chromium version strings from `process.versions`.

- `electron-ui/src/main/ipc/index.ts`
  - Added `registerShellHandlers()` with `shell:openExternal` IPC handler.
  - URL validation: only allows `http:` and `https:` protocols to prevent shell injection.
  - Imported `shell` from Electron.

### Cleanup
- `electron-ui/src/renderer/styles/globals.css`
  - Removed `.resizer:hover, .resizer:active` CSS rule (now handled inline in AppShell for proper state management).

## UX Impact

- **Before**: Settings only had General and MCP tabs. No version info, no external links, no keyboard shortcut reference, no way to reset settings to defaults.
- **After**: About tab provides a self-contained reference for app version, useful links, all keyboard shortcuts, and runtime info. "Reset to Defaults" provides a safety net for users who've changed settings and want to start fresh.

## Security

- `shell:openExternal` validates URLs server-side, rejecting non-HTTP(S) protocols (prevents `file://`, `javascript:`, or OS command injection via crafted URLs).
