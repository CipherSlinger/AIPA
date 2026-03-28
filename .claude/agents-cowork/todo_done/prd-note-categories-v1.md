# PRD: Note Categories

**Version**: v1
**Author**: aipa-pm
**Date**: 2026-03-28
**Iteration**: 124
**Priority**: P1

---

## Background

AIPA's Notes panel (Iterations 120-122) currently stores all notes in a flat list. As users accumulate notes (up to 100), finding and organizing them becomes difficult. The search feature helps, but users need a way to categorize notes into meaningful groups -- similar to folders or tags.

This directly supports the "personal assistant" product direction: a capable assistant helps users organize information, not just store it.

## Feature Description

Add a category system to the Notes panel. Users can:

1. Create, rename, and delete categories
2. Assign a note to a category (one category per note; default: "Uncategorized")
3. Filter the notes list by category
4. View category counts

## User Stories

1. As a user, I want to create categories (e.g., "Work", "Personal", "Ideas") so I can organize my notes.
2. As a user, I want to assign a note to a category so I can group related notes together.
3. As a user, I want to filter notes by category so I can quickly find what I need.
4. As a user, I want to rename or delete categories so I can evolve my organization system.

## Design Constraints

- **No new dependencies**: Use existing React + Zustand + electron-store stack
- **Persistence**: Categories stored in electron-store prefs (same pattern as session tags, custom templates)
- **Max categories**: 10 (prevents UI clutter)
- **Default category**: "Uncategorized" (cannot be deleted or renamed)
- **Category assignment**: One category per note (simpler than multi-tag; can upgrade later)

## Data Model

```typescript
// Add to app.types.ts
interface NoteCategory {
  id: string        // UUID
  name: string      // Max 20 chars
  color: string     // CSS color from a preset palette (6-8 colors)
  createdAt: number  // timestamp
}

// Extend existing Note interface
interface Note {
  // ... existing fields ...
  categoryId?: string  // References NoteCategory.id; undefined = "Uncategorized"
}
```

## UI Requirements

### 1. Category Filter Bar (above notes list)
- Horizontal scrollable row of category pills (same visual pattern as session tag filters)
- "All" pill (default, shows all notes) + user-created category pills
- Each pill shows name + count
- Active pill is highlighted
- Category color dot on each pill

### 2. Category Management
- "Manage" button at the right end of the category filter bar (gear icon or "..." icon)
- Opens an inline management section (same pattern as session tag editing in Settings)
- Add new category: text input + color picker (6 preset colors) + "Add" button
- Edit: inline rename on click
- Delete: two-click confirmation (same pattern as note deletion)
- Reorder: not needed for v1

### 3. Note Category Assignment
- In note editor view, a small dropdown/selector above the note content
- Shows current category with color dot
- Click to change category
- "Uncategorized" option always present

### 4. Visual Indicators
- Color dot next to note title in the note list (same pattern as session tags)
- Category name shown as subtitle text under note title in list view

## Acceptance Criteria

1. [ ] User can create up to 10 categories with name (max 20 chars) and color
2. [ ] User can rename a category (inline edit)
3. [ ] User can delete a category (two-click confirmation); notes in deleted category move to "Uncategorized"
4. [ ] User can assign any note to a category via dropdown in the editor view
5. [ ] Category filter bar shows all categories with counts
6. [ ] Clicking a category pill filters notes to that category only
7. [ ] "All" pill shows all notes (default state)
8. [ ] Category data persists across app restarts (electron-store)
9. [ ] Note's categoryId persists across app restarts
10. [ ] Color dots appear on note list items and category pills
11. [ ] Category name appears as subtitle in note list items
12. [ ] i18n: All UI strings in both en.json and zh-CN.json
13. [ ] No new npm dependencies
14. [ ] Build succeeds (`npm run build` from electron-ui/)
15. [ ] Deleting a category with assigned notes reassigns them to "Uncategorized"

## Out of Scope

- Multi-category assignment (future enhancement)
- Drag-and-drop reordering of categories
- Note drag-and-drop between categories
- Category nesting (sub-categories)
- Category export/import

## Technical Notes

- Follow the same persistence pattern as `customPromptTemplates` and `sessionTags` in the prefs store
- Category filter bar should use same visual style as session tag filter bar in SessionList
- Use `crypto.randomUUID()` for category IDs (available in renderer context)
- Preset color palette: same 6 colors as session tags for visual consistency
