# UI Spec: Conversation Export

**Date**: 2026-03-26
**PRD**: `todo/prd-conversation-export-v1.md`
**Author**: aipa-ui

---

## 1. Component Location

The export button is added to the **ChatPanel toolbar** -- the 36px-high bar at the top of the chat area. It sits between the working directory indicator and the "New Conversation" (+) button.

## 2. Toolbar Layout (Updated)

```
[session-info / model-name]  [working-dir]  [EXPORT-BTN]  [NEW-BTN]
```

### Export Button Spec

| Property | Value |
|----------|-------|
| Icon | `Download` from lucide-react, size 14 |
| Tooltip | "Export conversation" |
| Placement | Right side of toolbar, before the + (new conversation) button |
| Style (normal) | `background: none; border: none; color: var(--text-muted); cursor: pointer; display: flex; alignItems: center;` |
| Style (hover) | `color: var(--text-bright)` |
| Style (disabled) | `opacity: 0.3; cursor: not-allowed; pointer-events: none` |
| Disabled when | `messages.length === 0` |

### Visual Reference (ASCII)
```
+------------------------------------------------------------------+
| session: abc123... | folder-name  | [v] [+] |   <- 36px toolbar
+------------------------------------------------------------------+
|                                                                  |
|                     MESSAGE LIST                                 |
|                                                                  |
+------------------------------------------------------------------+
|  [input area]                                 [mic] [send/stop]  |
+------------------------------------------------------------------+
```

The `[v]` is the Download/Export icon. The `[+]` is the existing New Conversation button.

## 3. Save Dialog Behavior

The native OS save dialog is used (via `fsShowSaveDialog`). No custom modal is needed.

| Property | Value |
|----------|-------|
| Default filename | `aipa-export-YYYY-MM-DD-HHmmss` |
| Filters | `[{ name: 'Markdown', extensions: ['md'] }, { name: 'JSON', extensions: ['json'] }]` |
| Default filter | Markdown (.md) |

## 4. Toast Feedback

| Scenario | Toast type | Message |
|----------|-----------|---------|
| Export successful | `success` | "Conversation exported successfully" |
| Export cancelled by user | -- (no toast) | -- |
| Write error | `error` | "Export failed: [error message]" |

## 5. Markdown Output Format

Use monospace-safe formatting. The exported file should be readable in any Markdown viewer.

```markdown
# AIPA Conversation
_Exported: 2026-03-26 15:30:45_
_Session: abc123def_

---

**User** (15:28:30)

[user message text]

---

**Assistant** (15:28:35)

[assistant message text]

<details>
<summary>Tool: Read (/path/to/file)</summary>

**Input:**
```json
{"file_path": "/path/to/file"}
```

**Result:**
```
[tool result content, truncated to 500 chars if very long]
```
</details>

<details>
<summary>Thinking</summary>

[thinking block content]
</details>

---
```

Key formatting decisions:
- Use `---` horizontal rules between message pairs for visual separation
- Use `<details>` for tool uses and thinking blocks to keep the document scannable
- Include timestamps per message for traceability
- Tool results truncated to 500 characters in Markdown format (full data in JSON)

## 6. Keyboard Shortcut

`Ctrl+Shift+E` triggers export. Register via `useEffect` in ChatPanel with `keydown` listener.

## 7. Interaction Flow

```
User clicks [Export] or presses Ctrl+Shift+E
    |
    v
messages.length === 0? ----YES----> (nothing happens, button is disabled)
    |
    NO
    v
Determine file extension from dialog filter
    |
    v
Open native Save dialog (fsShowSaveDialog)
    |
    v
User cancels? ----YES----> (nothing happens)
    |
    NO
    v
Format conversation (Markdown or JSON based on file extension)
    |
    v
Write file (fsWriteFile)
    |
    v
Show success/error toast
```

## 8. No New CSS Required

The button follows existing toolbar button patterns. No new classes or keyframes needed.
