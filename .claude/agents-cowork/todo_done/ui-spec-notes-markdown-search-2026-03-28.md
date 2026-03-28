# UI Spec: Notes Markdown Preview & Search

**Author**: aipa-ui (executed by agent-leader)
**Date**: 2026-03-28
**PRD Reference**: `prd-notes-markdown-search-v1.md`
**Iteration**: 122

---

## 1. Search Bar (List View)

**Location**: Between the header (title + New Note button) and the note list.

**Layout**:
```
[Search icon (14px)] [Input: "Search notes..." ]  [X clear button]
```

**Specifications**:
- Height: 32px, full width with 14px horizontal padding from container
- Background: `var(--sidebar-bg)` (same as sidebar background for subtle contrast)
- Border: `1px solid var(--border)`, border-radius 6px
- Search icon (Search from lucide-react, 14px): positioned inside left of input, `color: var(--text-muted)`
- Input text: 12px, `color: var(--text-primary)`, placeholder `color: var(--text-muted)`
- Clear button (X from lucide-react, 12px): only visible when input is non-empty, `color: var(--text-muted)`, hover `color: var(--text-primary)`
- Margin: 8px top, 8px bottom (between header border and note list start)

**Results indicator**: When search is active, show below the search bar:
- Text: "N notes found" or "No matching notes"
- Font: 11px, `color: var(--text-muted)`, padding 0 14px, margin-bottom 4px

**Empty search state**: When no results, the empty area shows "No matching notes" centered, same style as the existing "emptyState" display.

---

## 2. Markdown Preview Toggle (Editor View)

**Location**: In the editor header bar, between the back button and character count.

**Layout**:
```
[<- Back]     [Edit | Preview]     [234 characters]
```

**Toggle button group**:
- Two-segment toggle: "Edit" / "Preview"
- Each segment: padding 4px 10px, font-size 11px, border-radius 4px
- Active segment: `background: var(--accent)`, `color: white`
- Inactive segment: `background: transparent`, `color: var(--text-muted)`, hover `color: var(--text-primary)`
- Container: `border: 1px solid var(--border)`, border-radius 6px, `background: var(--card-bg)`
- Gap between segments: 0 (they share the container border)

**Preview area** (replaces textarea when in Preview mode):
- Same dimensions as the textarea (flex: 1, full width)
- Same padding: 10px 14px
- Content rendered with ReactMarkdown + remarkGfm + rehypeHighlight (same plugins as chat messages)
- Overflow: auto (scrollable)
- Typography inherits existing Markdown styles from globals.css (headings, code blocks, lists, tables, etc.)
- If content is empty, show placeholder text: "Nothing to preview" in `color: var(--text-muted)`, centered

**Behavior**:
- Default: Edit mode (textarea visible)
- Toggling to Preview: saves current content (triggers auto-save immediately), hides textarea, shows rendered Markdown
- Toggling back to Edit: shows textarea with current content
- Preview mode: read-only, no text editing possible
- Toggle state resets when navigating to a different note

---

## 3. Note Title Auto-Generation

**No visual changes required** -- this is purely behavioral:
- When note title is empty (or matches default placeholder) and content first line starts with `# `, `## `, or `### `, extract the heading text as the title
- Updates on the same 1s debounce as content auto-save
- Does not override a user-manually-set title

---

## 4. i18n Keys

Already defined in the PRD. No visual implications beyond text content.

---

## 5. Design Constraints

- No new CSS variables needed -- reuse existing `var(--border)`, `var(--text-primary)`, `var(--text-muted)`, `var(--accent)`, `var(--card-bg)`, `var(--sidebar-bg)`, `var(--action-btn-hover)`
- No new npm dependencies -- react-markdown, remark-gfm, rehype-highlight already installed
- All inline styles (matching existing NotesPanel.tsx pattern, no CSS modules)
- Component stays in the existing `notes/NotesPanel.tsx` file (no need for a separate NotePreview component -- the preview rendering is simple enough to inline)
