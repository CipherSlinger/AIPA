# Iteration Report: Completion Sound + Relative Timestamps

**Date**: 2026-03-27 06:30
**Iteration**: 26
**Status**: COMPLETE
**Build**: PASS (Vite)

## Changes

### New Feature: Completion Sound Notification

When Claude finishes responding, a subtle two-tone chime (C5-E5, 350ms) plays via the Web Audio API. This is especially useful when the user switches to another application while waiting for a long response.

- Configurable via Settings > General > "Completion Sound" toggle (on by default)
- Uses Web Audio API oscillator -- no external audio files required
- Volume is very low (0.08 gain) with exponential decay to avoid being intrusive
- Stored as `notifySound` preference in electron-store

### Enhancement: Always-Visible Relative Timestamps

Message timestamps are now always visible (not just on hover) and show human-friendly relative times:
- "just now" (< 5s), "30s ago", "5m ago", "2h ago", "yesterday", "3d ago"
- Hovering shows the full absolute date/time as a tooltip
- Timestamps live-update every 30 seconds via a lightweight interval

### Modified Files
- `electron-ui/src/renderer/hooks/useStreamJson.ts`
  - Added `playCompletionSound()` function using Web Audio API
  - Wired into `cli:result` handler, respects `notifySound` preference
- `electron-ui/src/renderer/components/chat/Message.tsx`
  - Added `relativeTime()` utility function
  - Timestamps always visible with relative format + absolute tooltip
  - 30-second live-update interval for relative times
- `electron-ui/src/renderer/components/settings/SettingsPanel.tsx`
  - Added "Completion Sound" toggle in General settings
  - Added `notifySound: true` to reset defaults
- `electron-ui/src/renderer/types/app.types.ts`
  - Added `notifySound?: boolean` to ClaudePrefs
- `electron-ui/src/renderer/store/index.ts`
  - Added `notifySound: true` to DEFAULT_PREFS
