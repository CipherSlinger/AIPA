# UI Spec: Session Changes Summary Panel

_Version: 1.0 | Date: 2026-04-01 | PRD: prd-session-changes-panel-v1.md_

## Design Philosophy

A quick-glance panel showing "what the AI changed" in the current session. Mirrors the StatsPanel pattern (floating popup from header button) but focuses on file-level change data.

## Component: ChatHeader Button

Add a new icon button in the ChatHeader toolbar row, positioned **before** the Stats button:

```
  ... [Changes] [Stats] [Bookmarks] [Focus] [New] ...
```

- Icon: `GitCompareArrows` from lucide-react (or `FileDiff` if available), 16px
- Badge: Small numeric badge (same style as bookmarks badge) showing total changed file count
  - Badge hidden when count is 0
  - Badge color: `var(--accent)` background, white text
- Tooltip: "Session Changes (Ctrl+Shift+G)"
- Keyboard shortcut: `Ctrl+Shift+G` (register in shortcutRegistry)

## Component: ChangesPanel (New)

Floating popup, positioned below the Changes button, same style as StatsPanel:

```
┌──────────────────────────────────────────────────┐
│  Session Changes                    [Copy] [X]   │
│  5 files changed  +142 lines  -38 lines          │
├──────────────────────────────────────────────────┤
│  Modified  store/index.ts          +42   -12     │
│  Created   utils/toolSummary.ts    +85           │
│  Modified  ToolUseBlock.tsx        +15   -26     │
│  Modified  MessageList.tsx         +8    -3      │
│  Modified  en.json                 +12           │
├──────────────────────────────────────────────────┤
│  ▼ Turn 1: "Add tool summary labels..."          │
│    Modified  ToolUseBlock.tsx      +15   -26     │
│    Created   toolSummary.ts        +85           │
│  ▶ Turn 2: "Fix the build error"                 │
│  ▶ Turn 3: "Add i18n translations"               │
└──────────────────────────────────────────────────┘
```

### Layout Details

**Header row**:
- Title: "Session Changes", `font-size: 13px`, `font-weight: 600`, `color: var(--text-primary)`
- Copy button: `ClipboardCopy` icon, 14px, `color: var(--text-muted)`, hover: `var(--popup-item-hover)`
- Close button: `X` icon, 14px, same styling as Copy

**Summary row**:
- `font-size: 12px`, `color: var(--text-secondary)`
- Format: `{N} files changed  {+X lines}  {-Y lines}`
- `+X` in `color: #4ade80` (green), `-Y` in `color: #f87171` (red)
- If no removals, omit the `-Y` part

**File list**:
- Each row: `height: 28px`, `padding: 0 12px`
- Status badge: `font-size: 10px`, `font-weight: 600`, `border-radius: 3px`, `padding: 1px 6px`
  - Created: `background: rgba(74, 222, 128, 0.15)`, `color: #4ade80`
  - Modified: `background: rgba(250, 204, 21, 0.15)`, `color: #facc15`
- File name: `font-size: 12px`, `color: var(--text-primary)`, show basename only
  - Full path shown in `title` attribute (native tooltip)
- Line counts: right-aligned, `font-size: 11px`, `font-family: monospace`
  - Added: `color: #4ade80`
  - Removed: `color: #f87171`
- Sorted by total changes (added + removed) descending

**Per-turn breakdown**:
- Separator: `1px solid var(--popup-border)` between file list and turns
- Turn header: `font-size: 11px`, `color: var(--text-muted)`, clickable to expand/collapse
  - Format: `Turn {N}: "{prompt preview}"` (first 40 chars of user prompt)
  - Expand/collapse: `ChevronRight` / `ChevronDown` icons, 12px
- Turn detail: Same file list format but indented `padding-left: 24px`
- First turn expanded by default, others collapsed

**Empty state**:
```
┌──────────────────────────────────────────────────┐
│  Session Changes                           [X]   │
│                                                  │
│       No file changes in this session            │
│                                                  │
└──────────────────────────────────────────────────┘
```
- Empty text: `font-size: 12px`, `color: var(--text-muted)`, centered

### Panel Styling

- `width: 380px`, `max-height: 420px`, `overflow-y: auto`
- Background: `var(--popup-bg)`
- Border: `1px solid var(--popup-border)`
- Box shadow: `var(--popup-shadow)`
- Border radius: `8px`
- Padding: `12px 0` (rows have their own horizontal padding)
- Position: Absolute, anchored below the Changes button, aligned right edge

### Scrollbar

- Custom scrollbar: `width: 4px`, `background: var(--popup-border)`, `border-radius: 2px`
- Same style as existing popups

## i18n Keys (new)

```json
{
  "changes.title": "Session Changes",
  "changes.filesChanged": "{{count}} files changed",
  "changes.fileChanged": "1 file changed",
  "changes.linesAdded": "+{{count}} lines",
  "changes.linesRemoved": "-{{count}} lines",
  "changes.statusCreated": "Created",
  "changes.statusModified": "Modified",
  "changes.turn": "Turn {{num}}: \"{{prompt}}\"",
  "changes.noChanges": "No file changes in this session",
  "changes.copied": "Changes summary copied",
  "changes.tooltip": "Session Changes"
}
```

## Keyboard & Interaction

- `Ctrl+Shift+G`: Toggle panel open/close
- `Escape`: Close panel
- Click outside: Close panel
- Copy button: Copy formatted text summary to clipboard, show success toast

## Accessibility

- Panel: `role="dialog"`, `aria-label="Session Changes"`
- File list: `role="list"`, each file `role="listitem"`
- Turn headers: `aria-expanded` attribute for collapse state
- Line count colors: Also use `+`/`-` prefix text, not color alone
