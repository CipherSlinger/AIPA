# PRD: UI/UX Fixes Batch

_Author: agent-leader (acting as PM) | Date: 2026-04-02_

## Context

User feedback collected 8 items. This PRD covers the 4 independent UI/UX improvements that can be implemented without deep architectural changes.

## In Scope

### 1. Remove Terminal Session Switching
**Problem**: When switching sessions, the terminal follows and switches context. Users find this confusing.
**Solution**: Remove the terminal panel entirely. AIPA should be a pure GUI experience -- users interact through the chat panel only.
**Impact**: Remove TerminalPanel, PTY-related IPC calls from the renderer, terminal toggle shortcuts, terminal-related UI (toggle button in toolbar, Ctrl+` shortcut, terminal nav item).
**Note**: Keep the main process PTY infrastructure (pty-manager.ts) since stream-bridge.ts uses child_process separately. Only remove the renderer-side terminal UI.

### 2. Sidebar Badge Count Logic Fix
**Problem**: The History button in NavRail currently shows a badge with the total session count, which is not useful information. Badges should indicate *unread/new* items, not total counts.
**Solution**: Remove the permanent count badge from the History button. Badges on sidebar buttons should only appear when there are new/unread items (e.g., a new message arrived while viewing another panel). For now, simply remove the always-visible count badge since the "unread" concept doesn't exist yet in the session store.
**Impact**: NavRail.tsx badge rendering logic.

### 3. Avatar/Settings Button Position Swap + Avatar Presets
**Problem**: The avatar button and settings button are in unintuitive positions.
**Solution**:
- Swap the positions of the avatar button and settings button in NavRail (avatar goes to where settings was, settings goes to where avatar was)
- Add a set of Luo Xiaohei (罗小黑) style avatar presets in the avatar selection UI. Since we can't bundle actual copyrighted images, create 6-8 simple SVG emoji-style cat avatars in different poses/colors that evoke the Luo Xiaohei aesthetic (black cat theme).
**Impact**: NavRail.tsx button ordering, avatar picker component.

### 4. Chat Input Permission Skip Toggle + Manual Compact Button
**Problem**: Users want quick access to "skip permissions" and "compact context" without opening Settings.
**Solution**: Add two small icon buttons near the chat input area:
- A shield icon toggle for `dangerously-skip-permissions` (with a warning color when active)
- A compress/shrink icon button to manually trigger context compaction (same as Ctrl+Shift+K)
- Place these in the input toolbar area (where voice input, attach files etc. already live)
**Impact**: ChatPanel input toolbar area, store (skipPermissions toggle), compact action.

## Out of Scope
- Provider migration to Channel sidebar (deferred to next batch)
- Persona per-session architecture (separate PRD)
- Workflow prompt i18n (separate PRD)

## Success Criteria
- Terminal panel fully removed from UI, no terminal-related buttons/shortcuts visible
- NavRail shows no permanent count badges
- Avatar and settings buttons are swapped in NavRail
- Chat input area has working permission skip toggle and compact button
- Build succeeds
- All i18n keys added for new UI elements
