# PRD: Chat Experience Polish

## Context
Small quality-of-life improvements to the core chat experience that reduce friction and improve daily usability.

## In Scope (3 features)

### 1. Message Reactions
- Add emoji reaction buttons to assistant messages (beyond the existing thumbs up/down)
- Quick reactions: thumbs-up, heart, light-bulb, bookmark (4 preset emojis)
- Reactions are stored per-message and displayed as small chips below the message
- Click a reaction chip to toggle it on/off
- This enhances the existing rating system with more expressive feedback

### 2. Copy Conversation Summary
- Add "Copy Summary" button to the conversation stats panel (StatsPanel.tsx)
- Generates a brief summary of the conversation with key points
- Copies to clipboard in a formatted text block
- Useful for sharing conversation outcomes with colleagues

### 3. Input Field Enhancement: Smart Paste Detection
- When pasting long text (>500 chars) into the input, show a small info chip
- The chip shows character count and suggests: "Paste as attachment" vs "Paste inline"
- "Paste as attachment" wraps the text in a collapsible block within the message
- Prevents the input area from becoming unwieldy with large pastes
- Builds on existing longPaste detection (chat.longPaste key exists)

## Out of Scope
- Rich text editing in input (bold, italic, etc. beyond existing Ctrl+B/I)
- Message threading/branching

## Success Criteria
- Emoji reactions are visible and toggleable on assistant messages
- Copy Summary generates useful formatted text
- Long paste detection helps manage large text inputs

## Files Likely Touched
- MessageActionToolbar.tsx or Message.tsx (reactions)
- StatsPanel.tsx (copy summary button)
- ChatInput.tsx (smart paste detection)
- i18n (en.json, zh-CN.json)
