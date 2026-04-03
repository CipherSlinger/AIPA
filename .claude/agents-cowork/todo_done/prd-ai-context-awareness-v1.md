# PRD: AI Context Awareness Indicators
_Date: 2026-04-03 | Author: aipa-pm_

## Background
Users have no visibility into how much context the AI has consumed or how close they are to the limit. This causes surprise truncation mid-conversation and no opportunity to start a fresh session proactively.

## In Scope

### 1. Context Window Progress Bar
A slim progress bar in the ChatHeader showing context usage.

**Acceptance Criteria**:
- Thin bar (3px height) at the bottom edge of ChatHeader
- Fill color: green (0–70%) → yellow (70–90%) → red (90–100%)
- Tooltip on hover: "Context used: X / Y tokens (Z%)"
- Only visible when a session is active and `lastContextUsage` is available
- i18n key: `chat.contextBar.tooltip`

### 2. Context Usage Badge
Small badge in the ChatHeader showing percentage as text.

**Acceptance Criteria**:
- Positioned near the model selector
- Format: "42%" in muted text, changes to amber at 80%, red at 95%
- Clicking it opens the context detail popover
- i18n key: `chat.contextBadge.label`

### 3. Context Detail Popover
On click, show a popover with breakdown.

**Acceptance Criteria**:
- Shows: total tokens used, tokens remaining, approximate messages remaining estimate
- "Start new session" button inside popover
- Popover closes on outside click
- i18n keys: `chat.contextPopover.*`

## Out of Scope
- Token-by-token breakdown per message
- Cost display (already handled elsewhere)

## Technical Notes
- `lastContextUsage` is already tracked in `useChatStore` (contextTokensUsed, contextTokensTotal)
- Add components to `ChatHeader.tsx` — be mindful it's already 558 lines, extract if needed
- High-risk files: `ChatHeader.tsx`, `chatStore.ts`, i18n `en.json` / `zh-CN.json`
