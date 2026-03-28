# UI Spec: Note Categories

**Date**: 2026-03-28
**PRD**: `prd-note-categories-v1.md`
**Author**: aipa-ui

---

## Overview

Add a color-coded category system to the Notes panel, enabling users to organize their notes into up to 10 custom categories. The design reuses proven patterns from the session tag system (filter bar, color dots, pill buttons) for visual consistency.

---

## Component Changes

### 1. NotesPanel.tsx -- Category Filter Bar

**Location**: Between the search bar and the note list (below search results count if present).

**Layout**:
```
[All (N)] [Work (3)] [Personal (5)] [Ideas (2)]  [+]
```

- Horizontal scrollable row of pill buttons (same pattern as SessionList tag filter bar)
- Each pill: `height: 20px`, `borderRadius: 10`, `padding: 0 8px`, `fontSize: 10`
- Color dot: 6x6px circle before category name
- Count in parentheses with `opacity: 0.6, fontSize: 9`
- "All" pill: always first, no color dot, shows total count, uses `var(--text-secondary)` as color
- "+" button: at the end of the row, same height, `fontSize: 10`, color `var(--text-muted)`, opens inline category management

**Active state** (same as session tags):
- Background: `${category.color}30`
- Border: `1px solid ${category.color}80`
- Color: `category.color`
- FontWeight: 600

**Inactive state**:
- Background: `${category.color}1a`
- Border: `1px solid ${category.color}40`
- Color: `var(--text-secondary)`
- FontWeight: 400

**Transition**: `background 0.15s ease, border-color 0.15s ease, color 0.15s ease`

**Visibility**: Only show the filter bar when at least one category exists.

### 2. Category Management Panel

**Trigger**: Click the "+" button at the end of the filter bar, OR click a "Manage Categories" button in the filter bar area.

**Layout**: Appears as a collapsible section between the filter bar and the note list.

```
┌────────────────────────────────────────────────┐
│ Category Management                     [Close]│
│                                                │
│ [  New category name  ] [color] [Add]          │
│                                                │
│  * Work          [edit] [delete]               │
│  * Personal      [edit] [delete]               │
│  * Ideas         [edit] [delete]               │
│                                                │
│ [10 max]                                       │
└────────────────────────────────────────────────┘
```

**Styling**:
- Background: `var(--card-bg)`
- Border: `1px solid var(--border)` top and bottom
- Padding: `10px 14px`
- Font size: 12px throughout

**Add category row**:
- Text input: `flex: 1`, same styling as note search input
- Color picker: 6 preset color circles (same colors as session TAG_PRESETS: #3b82f6, #22c55e, #f59e0b, #ef4444, #8b5cf6, #6b7280)
- Selected color: scale(1.3) + ring/outline `2px solid` of same color at 50% opacity
- Add button: `var(--accent)` text, disabled when name is empty or max reached

**Category list items**:
- Color dot (6px) + name text + action buttons (right-aligned)
- Edit: click name to enter inline edit mode (same pattern as session tag editing in Settings)
- Delete: two-click confirmation pattern (first click turns icon red, second click deletes)
- When deleting, show brief "Notes moved to Uncategorized" toast

### 3. Note List Items -- Category Indicator

**Location**: Below the note title, before the relative timestamp.

```
┌──────────────────────────────────────────��──────┐
│ Note Title                    [send] [delete]   │
│ * Work  |  2 hours ago                          │
└─────────────────────────────────────────────────┘
```

- Category color dot (6px) + category name in `fontSize: 11, color: var(--text-muted)`
- Separator `|` between category name and timestamp
- If note is uncategorized, do NOT show category indicator (keep current layout)
- Category name is truncated with ellipsis if too long (max 12ch)

### 4. Note Editor -- Category Selector

**Location**: Between the editor header (back button / edit-preview toggle) and the title input.

```
┌─────────────────────────────────────────────────┐
│ [< Back]              [Edit | Preview]    123ch │
│ Category: [* Work v]                            │ <-- new row
│ ─────────────────────────────────────────────── │
│ [Title input]                                   │
│ ─────────────────────────────────────────────── │
│ [Content textarea / Markdown preview]           │
└─────────────────────────────────────────────────┘
```

**Selector styling**:
- Padding: `6px 14px`
- Label: `fontSize: 11, color: var(--text-muted)`, text: "Category:"
- Dropdown button: inline, shows color dot + current category name
- Background: `var(--card-bg)`, border: `1px solid var(--border)`, borderRadius: 6
- Padding: `3px 8px`, fontSize: 11

**Dropdown menu** (appears on click):
- Positioned below the button, same width or wider
- Background: `var(--popup-bg)`, border: `1px solid var(--popup-border)`, borderRadius: 8
- Box-shadow: `var(--popup-shadow)`
- Animation: `popup-in 0.15s ease` (existing animation)
- Items: color dot + name, hover: `var(--action-btn-hover)` background
- "Uncategorized" always first, no color dot, regular text
- Active category has checkmark icon or bolder font weight

### 5. Data Model

**New type in app.types.ts**:
```typescript
export interface NoteCategory {
  id: string        // 'notecat-' + timestamp + random
  name: string      // max 20 characters
  color: string     // one of 6 preset hex colors
  createdAt: number
}
```

**Extend Note interface**:
```typescript
export interface Note {
  // existing fields...
  categoryId?: string  // references NoteCategory.id; undefined = uncategorized
}
```

**Extend ClaudePrefs**:
```typescript
export interface ClaudePrefs {
  // existing fields...
  noteCategories?: NoteCategory[]  // max 10
}
```

### 6. Preset Color Palette

Reuse the session tag color palette for consistency:

| Color | Hex | Usage |
|-------|-----|-------|
| Blue | #3b82f6 | Default first color |
| Green | #22c55e | |
| Amber | #f59e0b | |
| Red | #ef4444 | |
| Purple | #8b5cf6 | |
| Gray | #6b7280 | |

---

## i18n Keys

Add to both `en.json` and `zh-CN.json` under a new `"categories"` section inside the existing `"notes"` namespace:

```json
{
  "notes": {
    "allNotes": "All",
    "categories": "Categories",
    "manageCategories": "Manage",
    "addCategory": "Add",
    "newCategoryName": "New category name",
    "categoryDeleted": "Category deleted. Notes moved to Uncategorized.",
    "uncategorized": "Uncategorized",
    "maxCategories": "Maximum 10 categories",
    "categoryLabel": "Category",
    "categoryNameTooLong": "Max 20 characters"
  }
}
```

---

## Interaction Behavior

1. **Filter**: Click a category pill to filter. Click again to deselect (show all). Only one filter active at a time.
2. **Create category**: Open management panel, type name, pick color, click Add. Closes with animation.
3. **Assign category**: In note editor, click category dropdown, select category. Auto-saved immediately.
4. **Delete category**: In management panel, two-click pattern. All notes with that category become uncategorized. Toast notification.
5. **Rename category**: Click category name in management panel, inline edit mode, Enter to save, Escape to cancel.
6. **New note**: Created with no category (uncategorized) by default.

---

## Accessibility

- Filter bar: `role="radiogroup"`, each pill `role="radio"` with `aria-checked`
- Category dropdown in editor: `role="listbox"`, items `role="option"` with `aria-selected`
- Delete confirmation: `aria-label` changes on first click to indicate "Click again to confirm"
- Color picker circles: `aria-label` with color name, `role="radio"` within `role="radiogroup"`
