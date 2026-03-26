# UI Spec: File Drag-and-Drop to Chat

**Date**: 2026-03-26
**PRD**: `todo/prd-file-dragdrop-v1.md`
**Author**: aipa-ui

---

## 1. Drop Zone Scope

The entire ChatPanel component is the drop zone. This means dragging a file anywhere over the chat area (messages, input, toolbar) activates the overlay.

## 2. Drop Overlay Design

When files are dragged over the ChatPanel, a full-panel overlay appears:

### Overlay Spec

| Property | Value |
|----------|-------|
| Position | absolute, covering entire ChatPanel (`inset: 0`) |
| Z-index | 50 (above messages, below modals) |
| Background | `rgba(0, 122, 204, 0.15)` (accent color with 15% opacity) |
| Border | `3px dashed var(--accent)` |
| Border-radius | 8px (with 8px margin inset from edges) |
| Pointer-events | `none` on child content (overlay captures all events) |

### Overlay Content (Centered)

```
     +------------------------------------------+
     |                                          |
     |              [Upload Icon]               |
     |           Drop files here                |
     |     Images will be attached,             |
     |     other files referenced via @path     |
     |                                          |
     +------------------------------------------+
```

| Element | Spec |
|---------|------|
| Icon | `Upload` from lucide-react, size 48, color `var(--accent)` |
| Primary text | "Drop files here" -- fontSize 18, fontWeight 600, color `var(--text-bright)` |
| Secondary text | "Images attached, other files referenced via @path" -- fontSize 12, color `var(--text-muted)` |
| Layout | `flexDirection: column, alignItems: center, justifyContent: center, gap: 12, height: 100%` |

### CSS Animation

```css
@keyframes drop-zone-pulse {
  0%, 100% { border-color: var(--accent); }
  50% { border-color: var(--accent-hover); }
}
```

Apply to overlay border: `animation: drop-zone-pulse 1.5s ease-in-out infinite`

## 3. Drag State Management

The drag state tracks whether files are currently being dragged over the panel:

```
dragCounter: number (increment on dragenter, decrement on dragleave)
showOverlay: dragCounter > 0
```

Using a counter (not a boolean) because dragenter/dragleave fire for child elements. The counter approach is the standard solution.

### Event handlers on the ChatPanel root div:

| Event | Action |
|-------|--------|
| `onDragEnter` | `e.preventDefault(); dragCounter++; setShowOverlay(true)` |
| `onDragOver` | `e.preventDefault()` (required to allow drop) |
| `onDragLeave` | `dragCounter--; if (dragCounter <= 0) setShowOverlay(false)` |
| `onDrop` | `e.preventDefault(); dragCounter = 0; setShowOverlay(false); handleDrop(e)` |

## 4. File Processing Logic

```
For each file in e.dataTransfer.files:
  |
  Is it an image? (.png, .jpg, .jpeg, .gif, .webp, .bmp, .svg)
  |
  YES --> file.size > 10MB?
  |         YES --> toast error: "File too large: [name] (max 10MB)"
  |         NO  --> FileReader.readAsDataURL(file) --> add to attachments
  |
  NO --> Get file.path (Electron provides full path)
      --> Append "@<path>" to input text
```

## 5. Image Attachment Preview

Reuse the existing attachment preview in ChatPanel's input area. When images are added via drag-and-drop, they appear in the same preview row as pasted images -- small 60x60px thumbnails with an X remove button.

No new component is needed. The `useImagePaste` hook's `attachments` state and `handleDrop` already provide the foundation; the drag-and-drop handler should call the same `addAttachment` function.

## 6. @Path Insertion in Textarea

When non-image files are dropped:

| Behavior | Spec |
|----------|------|
| Insertion point | End of current input text |
| Format | `@/absolute/path/to/file.ext` |
| Multiple files | Space-separated: `@/path/a.ts @/path/b.ts` |
| Existing text | Preserved. If input has text, add a space before the first @path |
| Focus | Textarea receives focus after insertion |

## 7. Error States

| Scenario | Feedback |
|----------|----------|
| File > 10MB | Toast error: "[filename] is too large (max 10MB)" |
| > 10 files dropped | Toast warning: "Too many files (max 10). First 10 processed." |
| Permission error reading image | Toast error: "Cannot read [filename]" |
| No actual files in drag event | No feedback (silently ignore) |

## 8. CSS Additions

Add to `globals.css`:

```css
@keyframes drop-zone-pulse {
  0%, 100% { border-color: var(--accent); }
  50% { border-color: var(--accent-hover); }
}
```

## 9. Interaction Flow

```
User starts dragging file(s) from OS file explorer
    |
    v
File enters ChatPanel area
    |
    v
Drop overlay appears (fade in, 150ms transition)
    |
    v
User continues dragging over panel -- overlay stays visible
    |
    v
User drops files OR drags away
    |
    DROP                          LEAVE
    |                               |
    v                               v
Process files by type           Overlay disappears
    |
    +-- Images --> attach as thumbnails
    |
    +-- Non-images --> insert @paths in textarea
    |
    v
Show any error toasts if needed
Overlay disappears
Textarea gets focus
```

## 10. Responsive Behavior

The drop overlay covers whatever size the ChatPanel currently is. No special handling needed for sidebar open/closed or terminal panel open/closed -- the overlay uses `position: absolute; inset: 0` relative to the ChatPanel container.
