# PRD: Chat Input & Message Polish

_Author: agent-leader (acting as PM) | Date: 2026-04-03_

## Objective

Polish the chat input experience and message display with several small but impactful UX improvements that reinforce AIPA's quality feel. These are refinements to existing features, not new capabilities.

## In Scope

### 1. Sort Dropdown for Session List (replace cycle-click)

Currently the session sort button cycles through 4 options (newest/oldest/alpha/messages) on click, requiring up to 3 clicks to reach the desired sort. Replace with a dropdown popover that shows all 4 options at once.

**Implementation**:
- In `SessionListHeader.tsx`, replace the `onClick={onSortChange}` button with a dropdown-trigger button
- On click, show a small popover with 4 radio-style options
- Active option highlighted; click selects and closes
- Close on outside click
- Popover positioned below the sort button

### 2. Message Timestamp Relative/Absolute Toggle

Currently messages show relative timestamps ("2 min ago"). Add a click handler so clicking the timestamp toggles between relative and absolute ("14:23:07") format. This toggle should be per-session (not persisted).

**Implementation**:
- In `Message.tsx`, the timestamp area should toggle a local state `showAbsoluteTime`
- Already partially implemented via `toggleShowAbsoluteTime` from `messageUtils.ts` — verify and ensure clicking the timestamp itself triggers the toggle
- If already working, skip this item

### 3. Input Character Count Indicator

Show a subtle character count in the bottom-right corner of the ChatInput textarea when the message exceeds 500 characters. This helps users gauge message length without being intrusive for short messages.

**Implementation**:
- In `ChatInput.tsx`, add a `<span>` positioned at the bottom-right of the textarea container
- Show `{charCount}` only when `input.length > 500`
- Style: `fontSize: 10, color: var(--text-muted), opacity: 0.5`
- When `input.length > 10000`, change color to `var(--warning)` to indicate very long messages

### 4. Empty State for Session List

When there are no sessions (fresh install or after bulk delete), show a friendly empty state instead of blank space.

**Implementation**:
- In `SessionList.tsx`, after the filter/search section, if `sessions.length === 0 && !filter`, render an empty state with:
  - A large `MessageSquare` icon (muted)
  - Text: "No conversations yet" / "没有对话记录"
  - Subtitle: "Start a new conversation to see it here" / "开始新对话后会显示在这里"
- If `sessions.length === 0 && filter`, show "No matching sessions" / "没有匹配的会话"

## Out of Scope

- No changes to the chat streaming logic
- No changes to the store layer
- No changes to IPC or main process

## Acceptance Criteria

- [ ] Sort dropdown shows all 4 options; single click selects
- [ ] Sort dropdown closes on outside click
- [ ] Character count appears when input > 500 chars
- [ ] Character count turns warning color at > 10000 chars
- [ ] Empty state shown when session list is empty
- [ ] Empty state distinguishes "no sessions" from "no search results"
- [ ] i18n keys for en.json and zh-CN.json for all new strings
- [ ] `npm run build` succeeds

## Files Affected

- `electron-ui/src/renderer/components/sessions/SessionListHeader.tsx` — sort dropdown
- `electron-ui/src/renderer/components/chat/ChatInput.tsx` — character count
- `electron-ui/src/renderer/components/sessions/SessionList.tsx` — empty state
- `electron-ui/src/renderer/i18n/locales/en.json` — new keys
- `electron-ui/src/renderer/i18n/locales/zh-CN.json` — new keys

**High-risk shared files**: `en.json`, `zh-CN.json` (i18n)
