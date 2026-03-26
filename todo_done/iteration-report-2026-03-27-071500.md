# Iteration Report: Word Count Tooltip + Compact Mode

**Date**: 2026-03-27 07:15
**Iteration**: 28
**Status**: COMPLETE
**Build**: PASS (Vite)

## Changes

### Enhancement: Message Word/Token Count Tooltip

Hovering over an assistant message's content area now displays a tooltip showing the approximate word count and token estimate:
- Format: "234 words (~312 tokens)"
- Token estimate uses ~0.75 words/token ratio (typical for English)
- Only displayed for assistant messages (user messages don't get this tooltip)
- Implemented as a native `title` attribute for zero-overhead rendering

### New Feature: Compact Mode

A new "Compact Mode" toggle in Settings > General that reduces visual spacing for power users who want to see more conversation on screen:
- Reduces message padding from 8px/20px to 4px/16px
- Reduces gap between avatar and content from 12px to 8px
- Shrinks avatar size from 28px to 22px (icons from 14px to 11px)
- Stored as `compactMode` preference in electron-store
- Off by default; toggle in Settings > General

### Modified Files
- `electron-ui/src/renderer/components/chat/Message.tsx`
  - Added word count / token estimate tooltip on assistant message content
  - Added `usePrefsStore` import to read compact mode preference
  - Applied compact-mode conditional styles to padding, gap, avatar size
- `electron-ui/src/renderer/components/settings/SettingsPanel.tsx`
  - Added "Compact Mode" toggle in General settings
  - Added `compactMode: false` to reset defaults
- `electron-ui/src/renderer/types/app.types.ts`
  - Added `compactMode?: boolean` to ClaudePrefs
- `electron-ui/src/renderer/store/index.ts`
  - Added `compactMode: false` to DEFAULT_PREFS
