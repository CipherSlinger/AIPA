# UI Spec: Message Status Indicators
_Iteration 57 | Designer: aipa-ui | Date: 2026-03-26_

## Design Goal

Add WeChat-style status indicators (checkmarks) to user message bubbles. The indicator shows whether a message has been received by the AI and processed. This provides visual feedback that the system acknowledged the user's input.

---

## Status States

### 1. Sending (clock icon)
- Shown on the last user message while the assistant is actively streaming a response
- Visual: Small clock icon (`Clock` from lucide-react), 10px, `rgba(255,255,255,0.4)`
- Positioned inline after the timestamp text

### 2. Sent (single checkmark)
- Shown on all user messages that have been processed (assistant has responded)
- Visual: Small check icon (`Check` from lucide-react), 12px, `rgba(255,255,255,0.5)`
- Positioned inline after the timestamp text

### 3. No indicator
- System messages, assistant messages, permission messages, plan messages -- no indicator

## Layout

```
+------------------------------------------+
| User message bubble                       |
| ...content...                             |
|                      2m ago [check icon]  |
+------------------------------------------+
```

The status icon appears after the relative timestamp, separated by 4px gap, on the same line.

## Styling

### Timestamp + Status Row
- Container: `display: flex`, `justifyContent: 'flex-end'`, `alignItems: 'center'`, `gap: 4`
- Timestamp text: unchanged (existing styling)
- Status icon: inline with timestamp, same vertical alignment

### Clock Icon (Sending)
- Size: 10px
- Color: `rgba(255,255,255,0.4)`
- No animation (keep it subtle)

### Check Icon (Sent)
- Size: 12px
- Color: `rgba(255,255,255,0.5)`

## Implementation Notes

- Use `useChatStore` to access `isStreaming` state
- A user message is "sending" if: `isStreaming === true` AND this message is the last user message in the messages array
- All other user messages are "sent"
- Only show indicators on user messages (role === 'user')

## Acceptance Criteria

- [ ] User messages show a check icon after the timestamp when processed
- [ ] The last user message shows a clock icon while assistant is streaming
- [ ] Clock icon transitions to check icon when streaming completes
- [ ] No indicators on assistant/system/permission/plan messages
- [ ] Icons match the subtle rgba coloring of user bubble timestamps
- [ ] Build passes with zero errors
