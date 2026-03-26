# Iteration Report: Locale Cleanup, Ctrl+N, Session Feedback

**Date**: 2026-03-27 01:30
**Iteration**: 12
**Status**: COMPLETE
**Build**: PASS (Vite)

## Changes

### Modified Files
- `electron-ui/src/renderer/components/sessions/SessionList.tsx`
  - Removed `zhCN` locale import from date-fns (saves ~6KB bundle size)
  - `formatDistanceToNow` now uses default English locale ("2 hours ago" instead of "2小时前")
  - Added `useUiStore` import and `addToast` for session delete/fork feedback
  - Delete session now shows "Session deleted" toast
  - Fork session now shows "Session forked" / "Failed to fork session" toast

- `electron-ui/src/renderer/index.html`
  - Changed `lang="zh-CN"` to `lang="en"`

- `electron-ui/src/renderer/components/chat/ChatPanel.tsx`
  - Speech recognition `lang` changed from hardcoded `'zh-CN'` to `navigator.language || 'en-US'` for system-adaptive speech input

- `electron-ui/src/renderer/App.tsx`
  - Added `Ctrl+N` keyboard shortcut for new conversation

## UX Impact

- **Locale consistency**: All date/time displays now use English. HTML document language is `en`.
- **Keyboard shortcut**: `Ctrl+N` creates a new conversation -- a standard shortcut users expect from desktop apps.
- **Feedback**: Session delete and fork operations now provide toast notifications instead of silent completion.
- **Bundle size**: Removed unused `zhCN` locale, saving approximately 6KB from the bundle.

## Full Keyboard Shortcut Map (Updated)

| Shortcut | Action |
|----------|--------|
| Ctrl+N | New conversation |
| Ctrl+L | Focus chat input |
| Ctrl+, | Open settings |
| Ctrl+B | Toggle sidebar |
| Ctrl+` | Toggle terminal |
| Ctrl+Shift+P | Command palette |
| Ctrl+Shift+E | Export conversation |
| Enter | Send message |
| Shift+Enter | New line |
