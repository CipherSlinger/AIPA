# PRD: File Drag-and-Drop to Chat

**Version**: v1
**Priority**: P0
**Author**: aipa-pm
**Date**: 2026-03-26
**Status**: Ready for Design

---

## 1. Problem Statement

AIPA positions itself as a "doer" -- an agent that works with your files. Currently, the only way to reference a file in a conversation is to type an `@` mention and navigate the file browser popup. Users cannot simply drag a file from their OS file explorer (Windows Explorer, Nautilus, etc.) into the chat to have the agent work with it.

This is a fundamental UX gap. Every modern chat application supports drag-and-drop. For an AI assistant that operates on files, this is the most natural interaction pattern.

## 2. Target Users

- **All users** -- drag-and-drop is a universal interaction pattern
- **Developers** who have file explorers and IDEs open alongside AIPA and want to quickly feed files to the agent
- **Non-technical users** who find @-mention file browsing unintuitive

## 3. Solution Overview

Add a drag-and-drop zone to the ChatPanel. When the user drags files from the OS into the chat area:
- **Image files** (.png, .jpg, .gif, .webp, .bmp) are attached as image attachments (same as paste)
- **Non-image files** insert their absolute path as an `@` mention in the input text (e.g., `@/home/user/project/file.ts`)

A visual drop overlay appears when files are dragged over the chat area, providing clear feedback that dropping is supported.

## 4. Functional Requirements

### FR-1: Drop Zone Area
- The ENTIRE ChatPanel area (not just the input box) acts as a drop zone
- This includes the message list area and the input area
- Drop detection via standard HTML5 Drag and Drop API (`dragenter`, `dragover`, `dragleave`, `drop`)

### FR-2: Visual Drop Overlay
- When a file is dragged over the ChatPanel, show a semi-transparent overlay
- The overlay should cover the entire ChatPanel
- Content: an upload/file icon and text "Drop files here"
- Background: semi-transparent accent color with dashed border
- The overlay disappears when the drag leaves the area or a drop occurs

### FR-3: Image File Handling
- Image files (detected by extension: .png, .jpg, .jpeg, .gif, .webp, .bmp, .svg) are read as data URLs
- Attach them using the same mechanism as image paste (the `useImagePaste` hook's attachment system)
- Multiple images can be dropped at once
- Maximum file size: 10MB per image (show error toast if exceeded)

### FR-4: Non-Image File Handling
- Non-image files are NOT read -- only their absolute path is captured
- The path is inserted into the input textarea as `@<absolute-path>`
- If multiple files are dropped, insert all paths separated by spaces: `@/path/a @/path/b`
- The text cursor moves to the end of the inserted paths

### FR-5: Mixed File Handling
- If the user drops a mix of image and non-image files in one action:
  - Images are attached as image attachments
  - Non-image paths are inserted as @mentions
  - Both happen simultaneously

### FR-6: Error Handling
- If a dropped file cannot be read (permission error, file too large), show an error toast
- If no files are present in the drop event (e.g., dragging text), ignore silently
- Prevent default browser behavior (opening the file) on all drag events over the chat area

## 5. Non-Functional Requirements

- Image reading must not block the UI thread (use async FileReader)
- Maximum 10 files in a single drop event (show warning toast if exceeded, process first 10)
- Must work on Windows (primary platform) with standard file explorer drag
- No new npm dependencies

## 6. Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|--------------|
| AC-1 | Drop overlay appears when dragging files over ChatPanel | Visual inspection |
| AC-2 | Drop overlay disappears on drag leave | Visual inspection |
| AC-3 | Dropping an image file adds it as an attachment preview | Functional test |
| AC-4 | Dropping a .ts/.js/etc. file inserts @path in input | Functional test |
| AC-5 | Dropping multiple files handles each by type correctly | Functional test |
| AC-6 | Files larger than 10MB show error toast | Size limit test |
| AC-7 | Drop overlay has clear visual design (icon, text, border) | Visual inspection |
| AC-8 | Browser default open-file behavior is prevented | Functional test |
| AC-9 | Build succeeds (tsc main + tsc preload + vite build) | Build verification |

## 7. Technical Notes

- **Drag event source**: `DataTransferItem.getAsFile()` provides a `File` object with `.path` property (Electron-specific -- standard browsers don't expose full path, but Electron does)
- **Image reading**: Use `FileReader.readAsDataURL()` -- same approach as `useImagePaste.ts`
- **Input insertion**: Set textarea value and trigger React's onChange
- **Existing infrastructure**: The `useImagePaste` hook already manages attachments with `addAttachment()`; the drag-drop handler should reuse this
- **DragEvent in Electron**: `event.dataTransfer.files` provides `FileList` with full paths via `file.path`

## 8. Out of Scope

- Drag-and-drop from the sidebar file browser (internal drag, different mechanism)
- Folder drag-and-drop (only individual files in v1)
- File content preview before sending
- Drag-and-drop to the terminal panel
