# PRD: Notes Markdown Preview & Search

**Author**: aipa-pm (executed by agent-leader)
**Date**: 2026-03-28
**Priority**: P1
**Iteration**: 122
**Category**: Feature Enhancement (Personal Assistant)

---

## Background

The Quick Notes panel (Iteration 120) and Note-Chat Integration (Iteration 121) established a solid note-taking foundation. However, the current notes are plain-text only and have no search capability. Users who accumulate 20+ notes cannot find specific content, and formatted content (meeting notes, reports, lists) looks unstructured.

This iteration upgrades the Notes panel to support **Markdown rendering** and **full-text search**, making it a legitimate document workspace rather than a simple scratch pad.

## Goals

1. Users can write notes in Markdown and see a live preview
2. Users can search across all notes by title and content
3. The notes panel feels like a mini document tool, not just a textarea

## Non-Goals

- Rich text editor (WYSIWYG) -- too complex, Markdown is sufficient
- Note categories/folders -- future iteration
- Note export to file -- future iteration
- Collaborative notes -- out of scope

---

## Feature Specification

### Feature 1: Markdown Preview Toggle

**Description**: Each note's editor gains a preview/edit toggle button. When in preview mode, the note content renders as Markdown (same renderer used in chat messages). When in edit mode, the raw Markdown textarea is shown.

**Acceptance Criteria**:
1. A toggle button (Eye/Pencil icon) appears in the note editor header
2. Clicking toggle switches between raw textarea (edit) and rendered Markdown (preview)
3. Preview mode uses the same Markdown renderer as assistant chat messages (react-markdown + rehype/remark plugins)
4. Preview mode supports: headings, bold/italic, lists, code blocks, links, tables, checkboxes
5. Preview mode is read-only (no editing)
6. Default mode is Edit (textarea)
7. Toggle state is per-note and resets when switching notes
8. i18n: toggle button tooltip in en + zh-CN

### Feature 2: Notes Search Bar

**Description**: A search input at the top of the Notes panel filters notes in real-time by matching against note title and content.

**Acceptance Criteria**:
1. A search input with magnifying glass icon appears at the top of the notes list (below the "New Note" button area)
2. Typing filters the note list to show only notes whose title or content contains the search string (case-insensitive)
3. Search is instant (no debounce needed for filtering a local list of max 100 items)
4. When search is active and has matches, show match count (e.g., "3 notes found")
5. When search finds no matches, show an empty state message ("No matching notes")
6. Clearing the search input (X button or Backspace to empty) restores the full note list
7. Search input has a clear (X) button when non-empty
8. i18n: placeholder text and labels in en + zh-CN

### Feature 3: Note Title Auto-Generation

**Description**: When creating a new note, instead of "Untitled Note", auto-generate a title from the first line of content (if it starts with a Markdown heading).

**Acceptance Criteria**:
1. If the first line of note content starts with `# `, `## `, or `### `, use that text (without the `#` prefix) as the note title
2. Title auto-generation only triggers when the title is still the default "Untitled Note" / "New Note"
3. If the user has manually edited the title, auto-generation does not override it
4. Auto-generation updates on the same 1-second debounce as content auto-save

---

## Technical Notes

- Markdown rendering: reuse existing `react-markdown` + `rehype-highlight` + `remark-gfm` already in the project
- Search: simple `String.includes()` on title + content, no need for fuzzy matching
- No new dependencies required
- All changes are renderer-side only (NotesPanel.tsx + possibly a new NotePreview.tsx component)
- Existing electron-store persistence is unchanged

## i18n Keys Required

**English (en.json)**:
- `notes.search.placeholder`: "Search notes..."
- `notes.search.results`: "{{count}} notes found"
- `notes.search.noResults`: "No matching notes"
- `notes.preview.toggle`: "Toggle preview"
- `notes.preview.edit`: "Edit"
- `notes.preview.preview`: "Preview"

**Chinese (zh-CN.json)**:
- `notes.search.placeholder`: "搜索笔记..."
- `notes.search.results`: "找到 {{count}} 条笔记"
- `notes.search.noResults`: "没有匹配的笔记"
- `notes.preview.toggle`: "切换预览"
- `notes.preview.edit`: "编辑"
- `notes.preview.preview`: "预览"
