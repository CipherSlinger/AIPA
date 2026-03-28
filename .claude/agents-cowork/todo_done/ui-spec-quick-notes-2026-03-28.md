# UI Spec: Quick Notes Sidebar Panel
_Date: 2026-03-28 | Source PRD: prd-quick-notes-v1.md | Designer: aipa-ui_

## Overview
Add a "Notes" tab to the NavRail and sidebar, providing a simple persistent notepad alongside conversations.

## NavRail Icon
- Icon: `NotebookPen` from lucide-react (size 20)
- Position: Between Files and Terminal icons
- Active state: Same as other icons (left accent bar, active color)
- Tooltip: "Notes" (en) / "Notes" (zh-CN)
- No keyboard shortcut for v1

## Notes Panel Layout

### List View (default)
```
+------------------------------------+
| Notes                    [+ New]   |
+------------------------------------+
| > Meeting notes            2m ago  |
| > Project ideas           1h ago   |
| > Shopping list       Yesterday    |
|                                    |
|   (empty state when no notes)      |
+------------------------------------+
```

- Header: "Notes" title left, "+ New" button right
- Each note item: title (or first 30 chars of content if untitled), relative timestamp right
- Hover: show delete icon (Trash2, 14px) on the right, same two-click pattern as sessions
- Click: opens note editor
- Empty state: centered text "No notes yet" with faded icon

### Editor View
```
+------------------------------------+
| [<- Back]          [chars: 128]    |
+------------------------------------+
| Title: [________________]          |
+------------------------------------+
|                                    |
| (textarea, full remaining height)  |
|                                    |
+------------------------------------+
| Created: Mar 28  Modified: Mar 28 |
+------------------------------------+
```

- Back arrow button top-left returns to list
- Character count top-right
- Title input: border-bottom only, 15px, font-weight 600
- Content textarea: no border, full-width, flex-grow, 13px
- Timestamps at bottom in muted text, 11px

## Styling
- Uses existing CSS variables: --bg-sessionpanel, --card-bg, --card-border, --text-primary, --text-muted, --accent
- Note item hover: same pattern as session list items
- Consistent with SettingsPanel and SessionList visual language
- No new CSS variables needed

## i18n Keys (under "notes" namespace)
- `notes.title`: "Notes" / "Notes"
- `notes.newNote`: "New Note" / "New Note"
- `notes.untitled`: "Untitled Note" / "Untitled Note"
- `notes.emptyState`: "No notes yet" / "No notes yet"
- `notes.startTyping`: "Start typing..." / "Start typing..."
- `notes.deleteConfirm`: "Click again to delete" / "Click again to delete"
- `notes.characters`: "chars" / "chars"
- `notes.created`: "Created" / "Created"
- `notes.modified`: "Modified" / "Modified"
- `nav.notes`: "Notes" / "Notes"

## Data Flow
1. Notes stored in electron-store via `prefsSet('notes', notesArray)`
2. Loaded on app start via `prefsGetAll()` (already loads all prefs)
3. Auto-save: 1 second debounce after typing stops
4. Store update: `setPrefs({ notes: updatedArray })`
