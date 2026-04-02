# PRD: Message Display & Input UX Polish

_Author: aipa-pm (agent-leader acting) | Date: 2026-04-02_

## Context

AIPA's chat interface is feature-rich but lacks several small UX refinements that desktop users expect. These are low-risk, high-polish improvements that make daily use more pleasant.

## In Scope

### 1. Message Timestamps Display

**Problem**: Messages don't show their timestamps in the chat view. Users can't tell when a message was sent without checking session details. For long conversations spanning hours or days, this is disorienting.

**Solution**:
- Show a small, subtle timestamp below each message bubble (format: "HH:mm" for today, "MMM D, HH:mm" for older)
- Timestamps are visible by default but can be toggled off via Settings > General
- Use `date-fns` (already a dependency) for formatting
- Respect locale: Chinese dates for zh-CN, English for en
- Group consecutive messages within 2 minutes: only show timestamp on the first message of the group

**Impact**: Message.tsx or MessageBubbleContent.tsx (timestamp rendering), usePrefsStore (toggle), SettingsGeneral.tsx (toggle control), en.json + zh-CN.json

### 2. Input Character & Token Counter

**Problem**: Users composing long prompts have no feedback on input length. When approaching token limits, they're surprised by truncation or errors.

**Solution**:
- Show a character count in the bottom-right corner of the input area (e.g., "1,234 chars")
- When character count exceeds a warning threshold (configurable, default 10,000), change color to orange
- When exceeding a danger threshold (default 50,000), change color to red
- Display is always visible but unobtrusive (small text, muted color)
- Format with locale-aware number separators

**Impact**: ChatInput.tsx (counter display), chatInputConstants.ts (thresholds), en.json + zh-CN.json

### 3. Enhanced Message Copy

**Problem**: The "Copy" action on messages copies raw markdown. Users often want plain text or formatted HTML for pasting into other apps.

**Solution**:
- Expand the message action toolbar "Copy" button into a small dropdown with 3 options:
  - "Copy as Text" (strips markdown, default -- single click behavior)
  - "Copy as Markdown" (raw markdown source)
  - "Copy Code Blocks Only" (extracts all code blocks, separated by newlines)
- Single click on the Copy button copies as text (current behavior preserved)
- Click on the dropdown arrow reveals the other options
- Add a toast notification confirming what was copied

**Impact**: MessageActionToolbar.tsx (dropdown), messageUtils.ts (copy formatters), en.json + zh-CN.json

### 4. Conversation Word & Token Count in StatsPanel

**Problem**: StatsPanel shows messages count and cost but not the total word/character count of the conversation. Users writing reports or summaries want to know how much content they've generated.

**Solution**:
- Add to StatsPanel: total word count, total character count, average words per message
- Separate counts for user messages vs assistant messages
- Show estimated token count (words * 1.3 rough estimate)
- Update in real-time during streaming

**Impact**: StatsPanel.tsx (new stats rows), useConversationStats.ts (word counting logic), en.json + zh-CN.json

## Out of Scope

- Message reactions/emoji responses
- Message threading (reply to specific message)
- Rich text editor (WYSIWYG) input
- Real-time collaboration on messages

## Success Criteria

- Timestamps appear below messages, respecting locale and grouping
- Character counter shows in input area with color thresholds
- Copy dropdown offers 3 format options
- StatsPanel shows word/character/token counts
- Build succeeds
- All i18n keys added (en + zh-CN)
