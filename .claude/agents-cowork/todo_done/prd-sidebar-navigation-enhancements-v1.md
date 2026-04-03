# PRD: Sidebar & Navigation Enhancements

_Author: agent-leader (acting as PM) | Date: 2026-04-03_

## Objective

Improve sidebar navigation with session count badges, keyboard navigation hints, and a "recent sessions" quick-access section. These changes make the sidebar more informative and easier to navigate.

## In Scope

### 1. Session Count Badge on History Tab

Show the total number of sessions as a small count badge on the History sidebar tab icon. This gives users an at-a-glance sense of their history size.

**Implementation**:
- In the sidebar tab buttons (likely in `Sidebar.tsx` or the layout component rendering tabs), add a count badge next to the History icon
- Badge shows total session count from `useSessionStore`
- Style: small rounded pill (fontSize: 8, background: var(--accent), color: white, borderRadius: 8, padding: 0 4px)
- Only show when count > 0
- When in compact/collapsed sidebar, badge overlays the icon as a small dot

### 2. Keyboard Shortcut Hints in Sidebar Tabs

Add keyboard shortcut hints (e.g., "Ctrl+1") as tooltips on each sidebar tab button. Currently the shortcuts exist but aren't discoverable from the sidebar itself.

**Implementation**:
- Each sidebar tab button should have a `title` attribute showing: `{tab name} (Ctrl+{number})`
- History: Ctrl+1, Files: Ctrl+2, Notes: Ctrl+3, Skills: Ctrl+4, Memory: Ctrl+5, Workflows: Ctrl+6, Channel: Ctrl+7
- These tooltips are the native browser `title` attribute, no custom tooltip needed

### 3. Active Session Indicator in Sidebar

When a conversation is actively streaming (AI is responding), show a subtle pulse indicator on the History tab to signal activity. This is useful when the user is on a different tab (Notes, Skills, etc.) and wants to know the AI is still working.

**Implementation**:
- In the sidebar History tab button, when `isStreaming` is true, add a small pulsing dot (same style as the streaming dot on SessionItem avatar)
- Use CSS animation `pulse` already defined in globals.css
- The dot sits at top-right corner of the History tab icon

### 4. Sidebar Resize Handle Polish

If the sidebar has a resize handle, ensure it has a proper hover cursor and visual feedback. If no resize handle exists, add a 4px draggable edge between sidebar and main content that allows resizing.

**Implementation**:
- Check if sidebar width is resizable — if not, this is a new feature:
  - Add a 4px transparent div at the right edge of the sidebar
  - On hover: show `col-resize` cursor and a 2px accent-colored line
  - On drag: update sidebar width (min: 200px, max: 400px)
  - Persist width in preferences
- If already resizable, just ensure proper cursor and hover styling

## Out of Scope

- No changes to the chat panel or message rendering
- No changes to IPC or main process
- No changes to the store structure (may read from existing stores)

## Acceptance Criteria

- [ ] Session count badge visible on History tab
- [ ] Badge hidden when count is 0
- [ ] All sidebar tabs have keyboard shortcut tooltips
- [ ] Streaming pulse dot visible on History tab when AI is responding
- [ ] Pulse dot disappears when streaming ends
- [ ] Sidebar resize handle (if implemented) has proper cursor and visual feedback
- [ ] i18n keys for en.json and zh-CN.json for any new strings
- [ ] `npm run build` succeeds

## Files Affected

- `electron-ui/src/renderer/components/layout/Sidebar.tsx` (or equivalent) — badges, tooltips, indicators
- `electron-ui/src/renderer/i18n/locales/en.json` — new keys (if any beyond native title attributes)
- `electron-ui/src/renderer/i18n/locales/zh-CN.json` — new keys

**High-risk shared files**: `en.json`, `zh-CN.json` (i18n)

**Note**: This PRD shares i18n files with `prd-chat-input-message-polish-v1.md`. If executing in parallel, serialize these two PRDs.
