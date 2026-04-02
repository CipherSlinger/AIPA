# UI Spec: Message Display & Input UX Polish

_Author: aipa-ui (agent-leader acting) | Date: 2026-04-02_
_Source PRD: prd-message-input-ux-v1.md_

## 1. Message Timestamps

### Visual Design

- Position: below the message bubble, aligned to the message side (left for assistant, right for user)
- Font: 10px, color `var(--text-muted)`, opacity 0.6
- Format: "HH:mm" for today, "MMM D, HH:mm" for older messages
- Grouping: if two consecutive messages from the same role are within 2 minutes, only show timestamp on the first
- Transition: fade in with `opacity 200ms`

### Settings Toggle

- Settings > General section
- Toggle label: "Show message timestamps" / "显示消息时间戳"
- Default: ON

## 2. Input Character Counter

### Visual Design

- Position: bottom-right corner of ChatInput area, inside the input container but not overlapping text
- Font: 10px monospace, color `var(--text-muted)`
- Format: locale-aware number (e.g., "1,234" or "1.234")
- Color states:
  - Default: `var(--text-muted)` (< 10,000 chars)
  - Warning: `var(--warning-color, #f0ad4e)` (10,000 - 49,999 chars)
  - Danger: `var(--danger-color, #d9534f)` (>= 50,000 chars)
- Only visible when input has content (hide when empty)
- Padding: 4px 8px from corner

## 3. Enhanced Message Copy

### Visual Design

**Split button** on MessageActionToolbar:
- Main button: Copy icon (unchanged) -- single click copies as plain text
- Small dropdown arrow (ChevronDown 8px) adjacent to copy button
- Dropdown menu (on arrow click):
  - "Copy as Text" (default, with checkmark if last used)
  - "Copy as Markdown"
  - "Copy Code Blocks" (only shown if message contains code blocks)
- Menu style: same as other popup menus (`var(--popup-bg)`, rounded 8px, shadow)
- Width: 160px

### Toast Feedback

- On any copy action, show toast: "Copied as [format]" / "已复制为[格式]"

## 4. Conversation Stats Enhancement

### Visual Design

Add new section to StatsPanel below existing stats:

```
Content Statistics
------------------
User words:       1,234
Assistant words:  5,678
Total words:      6,912
Total characters: 42,567
Est. tokens:      8,986
Avg words/msg:    345
```

- Same styling as existing stats rows
- Section divider before "Content Statistics"
- Numbers right-aligned, locale-formatted

## I18n Keys

```
settings.showTimestamps / message.timestamp.today / message.timestamp.older
input.charCount
copy.asText / copy.asMarkdown / copy.codeBlocksOnly / copy.copiedAs
stats.contentStats / stats.userWords / stats.assistantWords / stats.totalWords
stats.totalChars / stats.estTokens / stats.avgWordsPerMsg
```
