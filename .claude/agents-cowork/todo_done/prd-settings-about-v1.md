# PRD: Settings About Section

**Author**: aipa-pm
**Date**: 2026-03-26
**Priority**: P2
**Status**: Draft

## Problem

The Settings panel has no "About" section. Users cannot see:
1. App version
2. Electron/Node.js versions
3. Bundled CLI version
4. Links to documentation or source code

Additionally, there is no "Reset to Defaults" option for preferences.

## Solution

Add a third tab "About" to the Settings panel with version information and useful links. Add a "Reset to Defaults" button at the bottom of the General settings tab.

## Acceptance Criteria

1. Settings panel has 3 tabs: General, MCP, About
2. About tab shows: app name, app version (from package.json), Electron version, Node.js version, bundled CLI version
3. About tab shows clickable links: GitHub repo, Anthropic Console
4. About tab shows OS platform and architecture
5. General tab has a "Reset to Defaults" button at the bottom (below Save)
6. Reset to Defaults asks for confirmation before resetting
7. All version info is fetched from main process via IPC (not hardcoded)

## Out of Scope

- Auto-update mechanism
- Changelog display
- License text display

## Dependencies

- `window.electronAPI` needs a new `getAppInfo()` IPC handler
- `package.json` version field
