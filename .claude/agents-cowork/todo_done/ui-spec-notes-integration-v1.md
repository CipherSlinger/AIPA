# UI Spec: Enhanced Notes Integration & Quick Capture

_Version: 1.0 | Date: 2026-04-02 | PRD: prd-notes-integration-v1.md_
_Author: agent-leader (acting as UI)_

## 1. Quick Capture Floating Button

### Visual Design

**Floating button** (anchored bottom-right of chat area):
- Position: `position: fixed`, bottom 48px (above StatusBar), right 24px
- Size: 36px circle
- Background: `var(--accent)`
- Icon: `Plus` (lucide), 18px, white
- Shadow: `0 2px 8px rgba(0,0,0,0.2)`
- Hover: scale 1.1, shadow deepens
- Only visible when chat panel is active (not on settings or editor pages)
- z-index: 50 (above chat, below modals)

**Capture card** (appears when button clicked):
- Position: above the floating button, right-aligned
- Width: 320px
- Background: `var(--card-bg)`
- Border: `1px solid var(--card-border)`
- Border-radius: 12px
- Shadow: `0 4px 16px rgba(0,0,0,0.15)`
- Padding: 12px

**Capture card content**:
```
┌──────────────────────────────┐
│ Quick Note          [X close]│
│ ┌──────────────────────────┐ │
│ │                          │ │
│ │ [textarea, 3-6 lines]   │ │
│ │                          │ │
│ └──────────────────────────┘ │
│ [Category ▼]        [Save]  │
└──────────────────────────────┘
```

- Title: "Quick Note" / "快速笔记", 12px weight 600
- Textarea: auto-focus, placeholder "Jot down a thought..." / "随手记下想法..."
- Category dropdown: reuse existing NoteCategorySelector styles, compact (11px)
- Save button: accent background, white text, 11px, border-radius 6px
- Animation: slide up + fade in (0.2s ease)

### Keyboard Flow
- `Ctrl+Shift+N` opens card (or focuses textarea if already open)
- `Enter` saves (when textarea has content)
- `Escape` closes without saving
- `Tab` moves focus from textarea to category, then to save

## 2. Note Reference in Chat Input (@note:)

### Visual Design

**@note: popup** (extends existing @mention popup):
- Triggered when user types `@note:` in input
- Same popup container as existing @mention (position, shadow, border)
- Each note entry:
  ```
  [Category emoji] Note Title
  First 40 chars of content...
  ```
- Entry height: 44px
- Title: 12px weight 500, `var(--text-primary)`
- Preview: 10px, `var(--text-muted)`, single line, ellipsis overflow
- Category emoji: 14px, left margin
- Highlighted/selected entry: `var(--popup-item-hover)` background
- Max 10 entries visible, scrollable
- Search filter: typing after `@note:` filters by title

### Inserted Content Format
When a note is selected, insert into input:
```
> **[Note Title]**
> note content line 1
> note content line 2
```

Markdown blockquote format, with title bolded.

## 3. Note Pin to Chat

### Visual Design

**Pin action** in note editor:
- New icon button in NoteEditorHeader: `Pin` icon (lucide), 14px
- Active state (note is pinned): filled accent color
- Tooltip: "Pin to current chat" / "固定到当前对话"

**Pinned note strip** (below ChatHeader):
- Height: collapsed 28px, expanded auto (max 200px with scroll)
- Background: `var(--bg-secondary)` with slight accent tint
- Border-bottom: `1px solid var(--border)`
- Collapsed layout: `[StickyNote icon 12px] [Note title truncated] [Expand ▶] [Unpin X]`
- Font: 11px, `var(--text-secondary)`
- Expanded: full note content in markdown-rendered read-only view, same font as chat messages but slightly smaller (12px)
- Click row to toggle expand/collapse
- Smooth height animation (0.2s ease)

**Pinned note strip behavior**:
- Only shows when the current session has a pinned note
- Switching sessions: strip shows the note pinned to that session (or hides if none)
- Maximum 1 pinned note per session
- Pinning a new note replaces the previous

### Data Model
```ts
// In useChatStore (per-session state)
pinnedNoteId: string | null  // note ID pinned to current session

// In usePrefsStore (persistent across restarts)
sessionPinnedNotes: Record<string, string>  // sessionId -> noteId
```

## I18n Keys

```
notes.quickCapture / notes.quickCaptureHint / notes.savedTo
notes.pinToChat / notes.unpinFromChat / notes.pinnedNote
notes.noteReference / notes.selectNote / notes.noNotesFound
notes.jotDown
```

## Animations

- Quick capture card: `transform: translateY(10px) -> translateY(0)` + `opacity: 0 -> 1`, 0.2s ease
- Pinned note strip expand: `max-height: 28px -> 200px`, 0.2s ease
- Floating button: `transform: scale(1) -> scale(1.1)` on hover, 0.15s
