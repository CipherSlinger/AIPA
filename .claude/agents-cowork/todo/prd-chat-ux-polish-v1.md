# PRD: Copy Flash Feedback & Keyboard-Driven Message Actions

_Version: 1 | Date: 2026-04-03 | Author: agent-leader (acting as PM)_

## Problem

Two micro-friction points remain in the chat message interaction:

1. **Copy feedback is only on the toolbar button**: When copying a message via toolbar or context menu, the only visual feedback is the small clipboard icon changing to a checkmark. Users sometimes miss this and copy again. A brief border flash on the message bubble would provide unmissable feedback.

2. **No keyboard shortcut for copying the focused message**: While keyboard navigation exists (Ctrl+Up/Down to navigate messages), there's no keyboard shortcut to copy the currently focused message content. Users must use mouse to click the copy button.

## In Scope (2 improvements)

### 1. Copy flash feedback on message bubble

When `copied` becomes true (from `useMessageActions`), briefly flash the message bubble's border with accent color for 300ms. Implementation:
- In `Message.tsx`, derive a `justCopied` flag from the `copied` state
- Apply a highlight border style when `justCopied` is true
- Auto-reset after 300ms via useEffect

### 2. Keyboard copy for focused message (Ctrl+C with no text selection)

When a user presses `Ctrl+C` while navigating messages with `Ctrl+Up/Down` (message has visual focus indicator), and there is no text selection, copy the focused message content to clipboard. This is additive -- if there IS a text selection, normal browser copy behavior applies.

Implementation in `useMessageNavigation.ts`: add a Ctrl+C handler that checks `window.getSelection()?.toString()` -- if empty and a message is focused, copy it.

Add i18n key for toast: `message.copiedViaKeyboard` = "Message copied to clipboard"

## Out of Scope

- Changes to the context menu
- Changes to existing toolbar copy behavior
- Changes to the message content rendering

## Acceptance Criteria

- [ ] Message bubble border flashes accent color briefly (300ms) after copy
- [ ] Ctrl+C copies focused message when no text selection exists
- [ ] Toast notification confirms keyboard copy
- [ ] i18n keys added for both en.json and zh-CN.json
- [ ] `npm run build` succeeds with zero TypeScript errors

## Dedup Check

- No existing copy flash on bubble (confirmed -- only toolbar icon changes via `copied` state)
- No existing Ctrl+C handler in useMessageNavigation (confirmed via grep)
- `message.copiedViaKeyboard` i18n key does not exist (confirmed)

## File Impact

| File | Action |
|------|--------|
| `src/renderer/components/chat/Message.tsx` | MODIFY (copy flash border) |
| `src/renderer/components/chat/useMessageNavigation.ts` | MODIFY (Ctrl+C handler) |
| `src/renderer/i18n/locales/en.json` | MODIFY (add key) |
| `src/renderer/i18n/locales/zh-CN.json` | MODIFY (add key) |
