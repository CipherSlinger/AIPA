# PRD: Note Export

**Priority**: P1
**Iteration**: 126
**Author**: agent-leader (acting as PM)
**Date**: 2026-03-28

## Problem Statement

Users accumulate notes in AIPA (up to 100) but have no way to export them for sharing, backup, or use in other tools. Notes are locked inside electron-store with no file output path.

## Solution

Add note export capabilities:

1. **Single note export**: "Export" button in the NoteEditor toolbar. Saves the current note as a `.md` file using the system Save dialog.
2. **Bulk export**: "Export All" button in the NotesPanel header. Exports all notes (or filtered by current category) as individual `.md` files into a user-selected folder.

## Acceptance Criteria

1. NoteEditor shows an "Export" icon button (Download icon) in the toolbar when a note is selected
2. Clicking "Export" opens the system Save dialog with filename defaulting to `{note-title}.md`
3. The exported file contains the note content as-is (already Markdown)
4. NotesPanel header shows an "Export All" icon button (FolderDown icon) next to the "+" button
5. Clicking "Export All" opens a folder picker dialog
6. All notes (or only notes matching the current category filter) are saved as individual `.md` files
7. Filenames are sanitized from note titles (replace special chars, truncate to 50 chars)
8. A toast notification confirms success with count of exported files
9. Export errors show an error toast
10. All UI strings are i18n'd (en.json + zh-CN.json)
11. Build passes cleanly (npm run build in electron-ui/)

## Technical Notes

- Use existing IPC for save dialog: window.electronAPI.showSaveDialog for single export
- For bulk export, need a new IPC channel or use existing folder-related IPC
- File writing for export needs IPC support
- Note content is already stored as plain text/Markdown, no conversion needed

## Out of Scope

- Export as PDF
- Export as ZIP archive
- Import notes from files (future iteration)
