# PRD: Message Interaction Enhancements

## Context
Messages are the core interaction unit in AIPA. Several small but impactful improvements would make working with messages more efficient and pleasant.

## In Scope (3 features)

### 1. Copy Code Block Button Enhancement
- Currently code blocks have a copy button, but the visual feedback is minimal
- After clicking copy: change icon to a checkmark for 2 seconds, show "Copied!" text briefly
- Add a "Copy as Markdown" option that preserves the code fence markers
- Add copy button to inline code spans (appears on hover)

### 2. Message Word/Character Count
- Show word count and character count in the message action toolbar (on hover)
- For assistant messages, also show estimated token count (chars / 4 approximation)
- Small, unobtrusive display that doesn't clutter the UI
- Useful for users drafting content with AI who need to track length

### 3. Expand/Collapse Long Messages
- Messages longer than a configurable threshold (default: 2000 chars) auto-collapse with "Show more" button
- Collapsed view shows first ~500 chars with a gradient fade
- "Show more" expands to full content with smooth animation
- "Show less" button at the bottom of expanded content to re-collapse
- This is per-message, independent of the existing "collapse all" feature (which collapses to just the role label)
- Threshold configurable in Settings > Behavior

## Out of Scope
- Message reactions / emoji picker
- Message threading
- Rich formatting toolbar for user messages

## Success Criteria
- Code copy feedback is clearly visible and confirms the action
- Word/char/token counts are accurate and unobtrusive
- Auto-collapse works smoothly with readable truncation point

## Files Likely Touched
- CodeBlock.tsx (enhanced copy feedback, copy as markdown)
- MessageBubbleContent.tsx or MessageContent.tsx (word count, auto-collapse)
- MessageActionToolbar.tsx (word count display)
- SettingsGeneral.tsx (collapse threshold setting)
- i18n (en.json, zh-CN.json)
- store/index.ts (possibly collapse threshold pref)
