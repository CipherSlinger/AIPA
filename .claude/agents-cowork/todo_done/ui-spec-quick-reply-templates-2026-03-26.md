# UI Spec: Quick Reply Templates
_Iteration 56 | Designer: aipa-ui | Date: 2026-03-26_

## Design Goal

Add a horizontal row of configurable quick-reply chip buttons above the input area. Each chip inserts its associated prompt text into the input field on click, enabling one-click access to frequently used prompts. Users can add, edit, and remove chips through a simple management interface.

---

## Layout

```
+------------------------------------------------------+
| [Toolbar: @, /cmd, Mic, Queue]                       |
| [Quick Reply Chips: "Explain" "Review" "Summarize" +]|
| [Input field...                              ] [Send]|
+------------------------------------------------------+
```

The quick reply row sits between the toolbar icon row and the input row.

## Chip Design

### Default State
- Pill shape: `border-radius: 14px`
- Background: `var(--action-btn-bg)`
- Border: `1px solid var(--action-btn-border)`
- Text: `font-size: 11px`, `color: var(--text-muted)`, `font-weight: 500`
- Padding: `4px 12px`
- Height: auto (single line)
- Max text display: 20 characters, truncated with ellipsis
- Horizontal scroll if chips overflow (no wrap)

### Hover State
- Background: `var(--action-btn-hover)`
- Color: `var(--text-primary)`
- Cursor: pointer

### "Add" Button (last chip)
- Displays `+` icon (Plus from lucide-react), no text
- Background: transparent
- Border: `1px dashed var(--action-btn-border)`
- Hover: `var(--action-btn-hover)` with solid border
- Click opens an inline add form

### Chip Tooltip
- On hover, show full prompt text as native title tooltip
- Show after 300ms delay (browser default)

## Chip Management

### Adding a New Chip
- Click the `+` button
- The `+` button transforms into an inline edit form:
  - Two fields in a row: "Label" (max 20 chars) and "Prompt" (max 500 chars)
  - Save button (Check icon) and Cancel button (X icon)
  - Fields: `font-size: 11px`, `background: var(--input-field-bg)`, `border: 1px solid var(--input-field-border)`, `border-radius: 6px`, `padding: 3px 8px`
  - The form replaces the `+` button in the chip row (no modal/popup)

### Editing a Chip
- Right-click a chip to show edit/delete options
- Or: long-press / double-click opens inline edit form (same as add, pre-filled)

### Deleting a Chip
- Right-click -> "Remove" option
- Or: when editing, click a "Delete" button

### Persistence
- Quick reply templates stored via electron-store (`prefsSet`/`prefsGetAll`)
- Key: `quickReplies` -- array of `{ label: string, prompt: string }`
- Default templates (shipped with app, user can modify/delete):
  1. `{ label: "Explain this", prompt: "Please explain this in detail:" }`
  2. `{ label: "Review code", prompt: "Please review this code for bugs, performance issues, and best practices:" }`
  3. `{ label: "Summarize", prompt: "Please summarize the above concisely:" }`
  4. `{ label: "Fix bug", prompt: "Please identify and fix the bug in:" }`

## Behavior on Click

1. User clicks a chip
2. The chip's `prompt` text is inserted into the textarea
3. Focus moves to textarea
4. Cursor is positioned at the end of the inserted text
5. If textarea already has content, the prompt is appended with a newline separator

## CSS Variables

No new CSS variables needed -- reuses `--action-btn-bg`, `--action-btn-border`, `--action-btn-hover`, `--input-field-bg`, `--input-field-border` from Iteration 55.

## Animations

- Chip hover: `transition: background 0.15s ease, color 0.15s ease`
- New chip appears: fade in (reuse popup-enter animation)
- Row scroll: native horizontal scroll with `overflow-x: auto`, hidden scrollbar

## Accessibility

- Each chip button has `aria-label` with full prompt text
- Add button has `aria-label="Add quick reply template"`
- Keyboard: Tab focuses chips, Enter/Space activates

## Acceptance Criteria

- [ ] Quick reply chip row visible between toolbar and input field
- [ ] Default 4 chips shipped on first launch
- [ ] Clicking a chip inserts its prompt text into the textarea
- [ ] Focus moves to textarea after chip click
- [ ] "+" button to add new chip with inline label/prompt form
- [ ] Chips persist across app restarts (electron-store)
- [ ] Chips show full prompt as tooltip on hover
- [ ] Chip text truncated at 20 characters with ellipsis
- [ ] Horizontal scroll when chips overflow
- [ ] Right-click chip shows edit/delete options
- [ ] Build passes with zero errors

## Implementation Checklist (for aipa-frontend)
- [ ] Create `QuickReplyChips.tsx` component
- [ ] Add `quickReplies` to preferences store (usePrefsStore)
- [ ] Load default templates if `quickReplies` is not set
- [ ] Integrate QuickReplyChips into ChatPanel between toolbar and input row
- [ ] Wire click handler to insert prompt into textarea
- [ ] Implement inline add/edit form
- [ ] Implement right-click context menu for edit/delete
- [ ] Persist via `window.electronAPI.prefsSet`
