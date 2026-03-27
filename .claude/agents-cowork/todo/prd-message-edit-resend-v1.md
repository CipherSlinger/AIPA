# PRD: Message Edit & Resend

**Author**: aipa-pm (via agent-leader)
**Date**: 2026-03-27
**Priority**: P1
**Status**: Ready for Development
**Iteration**: 87

---

## Problem Statement

Users want to edit a previously sent message and resend it, similar to ChatGPT's edit feature. This allows correcting typos, refining prompts, or trying different approaches without starting a new conversation. Partial implementation exists in code (Message.tsx edit UI + store method) but is incomplete.

## Current State (WIP)

The following partial implementation already exists in unstaged changes:

1. **Message.tsx**: Pencil icon edit button in hover toolbar (user messages only), inline textarea with Cancel / "Save & Send" buttons, Enter to submit, Escape to cancel
2. **store/index.ts**: `editMessageAndTruncate(msgId, newContent)` -- currently buggy: truncates messages up to (but not including) the edited message, then discards it. Should truncate messages AFTER the edited one and update the edited message's content.

## Requirements

### Must Have (P0)

1. **Edit button**: Pencil icon in the user message hover toolbar (already implemented in WIP)
2. **Inline edit UI**: Replace message content with a textarea, Cancel + "Save & Send" buttons (already implemented in WIP)
3. **Store fix**: `editMessageAndTruncate` must:
   - Find the message by ID
   - Update its content to the new text
   - Remove all messages AFTER it (truncate subsequent conversation)
   - This effectively "rewinds" the conversation to the edited message
4. **ChatPanel wiring**: Pass `onEdit` handler from ChatPanel to MessageList to Message. The handler should:
   - Call `editMessageAndTruncate(msgId, newContent)` from the store
   - Then send the edited content as a new message to the CLI via the stream-json bridge
5. **Disable during streaming**: Edit button must not appear while the assistant is actively streaming (already implemented in WIP via `!globalIsStreaming` check)

### Should Have (P1)

6. **i18n**: Translate "Cancel", "Save & Send", and "Edit message" tooltip to Chinese
7. **Visual feedback**: Brief highlight animation on the edited message when edit is saved

### Won't Have (this iteration)

- Multi-message editing (only the most recent user message can be meaningfully edited since truncation removes subsequent context)
- Edit history tracking
- Undo/redo for edits

## Acceptance Criteria

- [ ] Pencil icon appears in user message hover toolbar (not during streaming)
- [ ] Clicking edit replaces message content with editable textarea
- [ ] Textarea pre-populated with current message content
- [ ] Cancel button dismisses edit mode without changes
- [ ] "Save & Send" updates message content, truncates conversation after it, and sends edited content to CLI
- [ ] Enter (without Shift) submits the edit
- [ ] Escape cancels the edit
- [ ] Conversation after the edited message is removed
- [ ] New assistant response streams in after edited message is sent
- [ ] Build passes with zero errors

## Technical Notes

- The `editMessageAndTruncate` store method needs to be fixed: keep messages[0..idx], update messages[idx].content, discard messages[idx+1..end]
- ChatPanel.tsx needs an `onEdit` handler that calls the store method and then triggers `handleSend` logic with the new content
- The existing `prepareRegeneration` method in the store is similar (it truncates and returns content) -- can use as reference pattern
