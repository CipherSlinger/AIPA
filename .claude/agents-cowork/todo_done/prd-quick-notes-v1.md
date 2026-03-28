# PRD: Quick Notes Sidebar Panel
_Version: v1 | Status: Approved | PM: aipa-pm | Date: 2026-03-28_

## One-line Definition
Add a persistent notepad panel in the sidebar so users can take notes alongside their AI conversations, reinforcing AIPA's role as a personal desktop assistant.

## Background & Motivation
AIPA has matured as a conversational AI interface with 119 iterations of features. However, a fundamental personal assistant capability is missing: the ability to quickly jot down notes while working. Users frequently need to:
- Copy key points from AI responses to reference later
- Draft to-do items that emerge during conversations
- Keep scratch notes that persist across sessions

Every major desktop assistant (Notion AI, Doubao, macOS Notes) provides integrated note-taking. AIPA should too.

## Target Users
- **Primary**: Office professionals using AIPA for daily tasks (email drafting, report writing, research)
- **Secondary**: Anyone who uses AIPA as a thinking partner and needs to capture ideas

## User Stories
1. As a user, I want to open a Notes panel in the sidebar so I can take notes without leaving AIPA.
2. As a user, I want my notes to persist across app restarts so I don't lose my work.
3. As a user, I want to create multiple notes with titles so I can organize my thoughts.
4. As a user, I want to quickly copy text from an AI response into my notes.

## Scope

### In Scope (This Version)
- New "Notes" tab in the sidebar NavRail (notebook icon)
- Simple note editor with title + content textarea
- Multiple notes support with list view
- Notes persisted via electron-store
- Create / Edit / Delete notes
- Basic text formatting (plain text, not rich text -- keep it simple)
- Timestamps on notes (created, last modified)
- i18n support (en + zh-CN)

### Out of Scope (Reasons)
- Rich text / Markdown editor: Adds complexity, can be v2
- Note sharing / export: Future iteration
- AI-powered note summarization: Requires backend changes
- Drag-and-drop from chat to notes: Complex interaction, v2
- Note search: Can be added later when note count grows
- Note categories / folders: Too complex for v1, tags system could extend later

## Feature Details

### Notes Tab in NavRail
**Description**: Add a new icon (StickyNote or NotebookPen from lucide-react) to the NavRail sidebar, positioned after the Files tab.
**Interaction**: Click to switch sidebar to Notes panel.
**Acceptance Criteria**:
- [ ] NavRail shows Notes icon below Files icon
- [ ] Clicking the icon switches sidebar to show Notes panel
- [ ] Icon uses the same styling pattern as other NavRail icons
- [ ] Icon has tooltip with translated label

### Notes List View
**Description**: When the Notes panel is open and no note is being edited, show a list of all notes sorted by last modified date (newest first).
**Interaction**: Each note item shows title (or first line if untitled), last modified time, and a delete button on hover.
**Acceptance Criteria**:
- [ ] Notes are listed with title preview and relative timestamp
- [ ] Clicking a note opens it for editing
- [ ] A "New Note" button at the top creates a fresh note
- [ ] Empty state shows a message like "No notes yet. Click + to create one."
- [ ] Delete button appears on hover with confirmation (two-click pattern, same as session delete)

### Note Editor View
**Description**: Simple edit view with a title input and a content textarea.
**Interaction**: Back button to return to list. Auto-save on blur or after 1 second of inactivity.
**Acceptance Criteria**:
- [ ] Title input at top (placeholder: "Untitled Note")
- [ ] Content textarea fills remaining space (placeholder: "Start typing...")
- [ ] Changes auto-save after 1 second debounce
- [ ] Back button returns to note list
- [ ] Created/modified timestamps shown at bottom
- [ ] Character count shown at bottom right

### Data Persistence
**Description**: Notes stored in electron-store under a `notes` key.
**Data Model**:
```typescript
interface Note {
  id: string        // nanoid or timestamp-based
  title: string
  content: string
  createdAt: number  // epoch ms
  updatedAt: number  // epoch ms
}
```
**Acceptance Criteria**:
- [ ] Notes survive app restart
- [ ] Maximum 100 notes (warn user when approaching limit)
- [ ] Total storage doesn't exceed 1MB (enforce per-note content limit of 10,000 characters)

### Backend Requirements
**IPC needed**: Yes, minor -- notes stored via existing `prefs:get` / `prefs:set` pattern using electron-store. No new IPC channels required if we store notes in the prefs store under a `notes` key. However, if the prefs object grows too large, a dedicated `notes:*` IPC namespace may be needed.

**Decision**: Use existing prefs pattern for v1 (same approach as custom prompt templates and session tags). Evaluate dedicated storage if note count grows large.

## Non-functional Requirements
- **Performance**: Note list should render instantly (< 50ms) for up to 100 notes
- **Storage**: electron-store is file-based; 100 notes at max 10KB each = 1MB max, well within limits
- **Accessibility**: All interactive elements need keyboard navigation and aria labels
- **Compatibility**: Works on all supported platforms (Windows primary)

## Success Metrics
- Feature is accessible via NavRail
- Notes persist across sessions
- Build succeeds with no new warnings

## Priority
- **P0**: Notes tab in NavRail, note CRUD, persistence
- **P1**: Auto-save, timestamps, character count
- **P2**: Empty state message, note limit warning

## Dependencies & Risks
| Dependency | Owner | Risk Level |
|------------|-------|------------|
| electron-store prefs | Existing | Low -- proven pattern from custom templates |
| NavRail modification | Frontend | Low -- simple icon addition |
| i18n strings | Frontend | Low -- established pattern |

## Open Questions
- [x] Rich text vs plain text? --> Plain text for v1 (decided)
- [x] Storage approach? --> electron-store prefs key (decided)
