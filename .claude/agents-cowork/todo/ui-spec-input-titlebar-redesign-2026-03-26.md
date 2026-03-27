# UI Spec: Input Area + Title Bar + Tool Use Cards + Color Unification (Iteration 54)

_Version: 1.0 | Designer: aipa-ui | Date: 2026-03-26_
_PRD Reference: `todo/prd-ui-redesign-wechat-v1.md` (P1 scope)_
_Depends on: Iteration 53 (WeChat P0 layout completed)_

---

## 1. Design Goal

Complete the WeChat-style visual transformation by redesigning the two remaining "old-style" regions in the ChatPanel: the top toolbar (title bar) and the bottom input area. Also simplify tool use cards to feel native inside AI bubbles, and unify all hardcoded colors to use the CSS variable system established in Iteration 53.

### Design Principles

1. **Seamless integration** -- Input area and title bar should feel like natural parts of the chat panel, not separate chrome.
2. **Icon-driven** -- Replace text labels with recognizable lucide-react icons; tooltips provide discoverability.
3. **Reduced visual noise** -- Fewer borders, subtler backgrounds, cleaner hierarchy.
4. **Color consistency** -- Every color must come from a CSS variable; no hardcoded hex outside `:root`.

---

## 2. CSS Variable Additions

Add to `:root` in `globals.css`, after the existing Iteration 53 variables:

```css
:root {
  /* === NEW (Iteration 54): Input area === */
  --input-bar-bg:         #2a2a2a;   /* Same as --bg-chat for seamless feel */
  --input-field-bg:       #333333;   /* Input textarea background */
  --input-field-border:   #444444;   /* Input field border */
  --input-field-focus:    #007acc;   /* Focus ring color */
  --input-toolbar-icon:   #6b6b6b;   /* Toolbar icon default */
  --input-toolbar-hover:  #a0a0a0;   /* Toolbar icon hover */

  /* === NEW (Iteration 54): Chat header === */
  --chat-header-bg:       #1a1a1a;   /* Same as --bg-nav */
  --chat-header-title:    #e0e0e0;   /* Session title color */
  --chat-header-icon:     #6b6b6b;   /* Header action icon default */
  --chat-header-icon-hover: #a0a0a0; /* Header action icon hover */

  /* === NEW (Iteration 54): Tool use cards (in-bubble) === */
  --tool-card-bg:         rgba(0, 0, 0, 0.15);  /* Overlay on bubble */
  --tool-card-border:     rgba(255, 255, 255, 0.06); /* Subtle border */
  --tool-card-header-bg:  rgba(0, 0, 0, 0.08);  /* Header area background */
}
```

### Theme Overrides

For `[data-theme="modern"]`:
```css
[data-theme="modern"] {
  --input-bar-bg:         #161b22;
  --input-field-bg:       #1c2128;
  --input-field-border:   #30363d;
  --input-field-focus:    #2f81f7;
  --input-toolbar-icon:   #484f58;
  --input-toolbar-hover:  #7d8590;

  --chat-header-bg:       #0d1117;
  --chat-header-title:    #e6edf3;
  --chat-header-icon:     #484f58;
  --chat-header-icon-hover: #7d8590;

  --tool-card-bg:         rgba(0, 0, 0, 0.20);
  --tool-card-border:     rgba(255, 255, 255, 0.04);
  --tool-card-header-bg:  rgba(0, 0, 0, 0.10);
}
```

For `[data-theme="minimal"]`:
```css
[data-theme="minimal"] {
  --input-bar-bg:         #181818;
  --input-field-bg:       #1e1e1e;
  --input-field-border:   #2a2a2a;
  --input-field-focus:    #a855f7;
  --input-toolbar-icon:   #444444;
  --input-toolbar-hover:  #777777;

  --chat-header-bg:       #0a0a0a;
  --chat-header-title:    #eeeeee;
  --chat-header-icon:     #444444;
  --chat-header-icon-hover: #777777;

  --tool-card-bg:         rgba(0, 0, 0, 0.25);
  --tool-card-border:     rgba(255, 255, 255, 0.03);
  --tool-card-header-bg:  rgba(0, 0, 0, 0.12);
}
```

---

## 3. Chat Header (Title Bar) Redesign

### 3.1 Layout

```
+------------------------------------------------------------------+
|  [Session Title]                    [icons...] [elapsed] [+ New]  |
+------------------------------------------------------------------+
   ^                                  ^
   Left: Session name                 Right: Action icons
   13px, weight 600                   Grouped, 16px icons, 8px gap
```

### 3.2 Container Style

```js
style={{
  height: 44,                              // Slightly taller than before (was 36)
  display: 'flex',
  alignItems: 'center',
  padding: '0 16px',
  gap: 8,
  borderBottom: '1px solid var(--border)',
  background: 'var(--chat-header-bg)',
  flexShrink: 0,
}}
```

### 3.3 Left Section -- Session Title

```js
// Session title (prominent)
style={{
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--chat-header-title)',
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}}
```

Display logic:
- If `currentSessionTitle` exists: show title text
- If only `currentSessionId`: show `Session: {id.slice(0,8)}...`
- If neither (new conversation): show model name (e.g., `claude-3.5-sonnet`)

### 3.4 Right Section -- Action Icons

All action buttons use this base style:

```js
// Action icon button base
style={{
  background: 'none',
  border: 'none',
  color: 'var(--chat-header-icon)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  borderRadius: 6,
  flexShrink: 0,
  transition: 'background 150ms, color 150ms',
}}
// onMouseEnter: color -> var(--chat-header-icon-hover), background -> rgba(255,255,255,0.06)
// onMouseLeave: reset
// Active state (e.g., bookmarks open): background -> var(--accent), color -> #fff
```

Icon size: 15px for all action icons.

Action buttons from left to right:
1. **Search** (Search icon) -- toggles search bar (Ctrl+F)
2. **Export** (Download icon) -- export conversation
3. **Bookmarks** (Bookmark icon) -- bookmarks dropdown (badge count if > 0)
4. **Stats** (BarChart3 icon) -- stats popover
5. **Focus** (Maximize2/Minimize2 icon) -- toggle focus mode
6. **New** (Plus icon) -- new conversation

### 3.5 Elapsed Timer (when streaming)

```js
// Stays on the right, before the New button
style={{
  fontSize: 10,
  color: 'var(--success)',
  fontFamily: 'monospace',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  flexShrink: 0,
}}
```

### 3.6 Removed from Header

- Working directory display (move to StatusBar if not already there)
- Message count display (available in Stats popover)

---

## 4. Input Area Redesign

### 4.1 Layout

```
+------------------------------------------------------------------+
| [+] [@] [/] [mic]                              [Queue badge]     |  <- Toolbar row
+------------------------------------------------------------------+
| [                    Textarea                    ] [Send button]  |  <- Input row
+------------------------------------------------------------------+
```

### 4.2 Outer Container

```js
style={{
  padding: '8px 16px 12px',
  background: 'var(--input-bar-bg)',       // #2a2a2a -- same as chat bg
  flexShrink: 0,
  // NO borderTop -- seamless with chat area
}}
```

### 4.3 Toolbar Row

```js
style={{
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  marginBottom: 6,
  paddingLeft: 4,
}}
```

Toolbar icon buttons use this style:

```js
// Toolbar icon button
style={{
  background: 'none',
  border: 'none',
  color: 'var(--input-toolbar-icon)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  borderRadius: 6,
  flexShrink: 0,
  transition: 'color 150ms, background 150ms',
}}
// onMouseEnter: color -> var(--input-toolbar-hover), background -> rgba(255,255,255,0.06)
// onMouseLeave: reset
```

Toolbar items (left to right):
1. **Plus** (Plus icon, 16px) -- Insert @mention (replaces "Clear" and "@file" text buttons)
2. **AtSign** (AtSign icon, 16px) -- trigger @ file mention
3. **Terminal** (TerminalSquare icon, 16px) -- trigger / slash command
4. **Mic** (Mic/MicOff icon, 16px) -- voice input toggle
   - When recording: background -> `var(--error)`, color -> `#fff`

Right side of toolbar:
5. **Queue** (ListPlus icon, 16px) -- add to task queue
   - Badge (if queue.length > 0): same style as current, positioned top-right of button

### 4.4 Input Row

```js
// Input row container
style={{
  display: 'flex',
  gap: 8,
  alignItems: 'flex-end',
}}
```

### 4.5 Input Field (Textarea wrapper)

```js
// Wrapper around textarea + attachment previews
style={{
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
  background: 'var(--input-field-bg)',
  borderRadius: 10,                        // Larger radius for modern feel
  padding: '8px 14px',
  border: '1px solid var(--input-field-border)',
  transition: 'border-color 200ms',
}}
// On focus (when textarea is focused):
// border-color -> var(--input-field-focus)
```

### 4.6 Textarea

```js
style={{
  flex: 1,
  background: 'none',
  border: 'none',
  outline: 'none',
  color: 'var(--text-primary)',
  resize: 'none',
  fontFamily: 'inherit',
  fontSize: 13,
  lineHeight: 1.5,
  minHeight: 20,
  maxHeight: 160,
  overflow: 'auto',
}}
placeholder="Message AIPA..."          // Shorter, cleaner placeholder
```

### 4.7 Send Button

```js
style={{
  background: isStreaming ? 'var(--error)' : 'var(--accent)',
  border: 'none',
  borderRadius: 10,                        // Match input field radius
  width: 36,
  height: 36,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#fff',
  cursor: (isStreaming || input.trim() || attachments.length > 0) ? 'pointer' : 'not-allowed',
  opacity: (!isStreaming && !input.trim() && attachments.length === 0) ? 0.4 : 1,
  flexShrink: 0,
  transition: 'background 150ms, opacity 150ms',
  alignSelf: 'flex-end',
}}
```

Icon inside send button: `Send` (14px) or `Square` (14px) when streaming.

### 4.8 Image Attachment Preview

```js
// Displayed inside the input wrapper, above the textarea
// Each image thumbnail:
style={{
  width: 52,
  height: 52,
  objectFit: 'cover',
  borderRadius: 8,                         // More rounded
  border: '1px solid var(--input-field-border)',
}}
```

### 4.9 Removed Elements

- Bottom hint text row (`@ files | Enter send | Shift+Enter newline...`)
- Character count display (keep the logic, just don't display unless > 5000 chars)
- Text-based quick action buttons (Clear, @file, /cmd) -- replaced by icons

### 4.10 Character Count (conditional)

Only show when input > 5000 characters, as a subtle indicator above the toolbar:

```js
// Only visible when input.length > 5000
style={{
  fontSize: 10,
  color: input.length > 10000 ? 'var(--error)' : 'var(--warning)',
  fontWeight: input.length > 10000 ? 600 : 400,
  textAlign: 'right',
  padding: '0 4px 2px',
}}
```

---

## 5. Tool Use Card Simplification

### 5.1 Container (in-bubble)

```js
style={{
  background: 'var(--tool-card-bg)',       // rgba overlay instead of solid
  border: '1px solid var(--tool-card-border)',
  borderRadius: 6,                         // Slightly more rounded
  marginBottom: 4,
  overflow: 'hidden',
}}
```

### 5.2 Header

```js
style={{
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '5px 8px',
  background: isRunning ? 'var(--tool-card-header-bg)' : 'none',
  border: 'none',
  cursor: 'pointer',
  textAlign: 'left',
  color: 'var(--text-primary)',
}}
```

- Tool icon: 12px (was 13px)
- Tool label: `fontSize: 11`, `fontWeight: 500` (was 600)
- Primary input text: `fontSize: 10` (was 11)
- Status icon: 11px (was 12px)
- Running border animation: remove (was `border-color: var(--warning)`)

### 5.3 Detail Section (expanded)

```js
// Input section
style={{
  padding: '6px 8px',
  fontSize: 10,     // Reduced from 11
}}

// Output section (Bash)
style={{
  margin: 0,
  padding: '4px 8px 6px',
  fontFamily: 'monospace',
  fontSize: 10,     // Reduced from 11
  background: 'rgba(0, 0, 0, 0.2)',  // Instead of #0d0d0d
  color: '#4ade80',
  maxHeight: 200,   // Reduced from 300
  overflowY: 'auto',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  borderRadius: '0 0 6px 6px',
}}
```

---

## 6. Color Unification Audit

### Changes Required

| Location | Current | Target | Reason |
|----------|---------|--------|--------|
| ChatPanel outer div | `background: var(--bg-primary)` | `background: var(--bg-chat)` | Chat area should use chat bg |
| ChatPanel toolbar | `background: var(--bg-secondary)` | `background: var(--chat-header-bg)` | New header variable |
| ChatPanel input outer | `background: var(--bg-secondary)` | `background: var(--input-bar-bg)` | Seamless with chat |
| ChatPanel input inner | `background: var(--bg-input)` | `background: var(--input-field-bg)` | New input variable |
| ToolUseBlock container | `background: var(--bg-primary)` | `background: var(--tool-card-bg)` | In-bubble overlay |
| ToolUseBlock bash output | `background: #0d0d0d` | `background: rgba(0,0,0,0.2)` | No hardcoded hex |
| WelcomeScreen buttons | `background: var(--bg-secondary)` | `background: var(--input-field-bg)` | Consistent dark card |
| Bookmarks dropdown | `background: var(--bg-secondary)` | `background: var(--input-field-bg)` | Consistent popup bg |
| Stats popover | `background: var(--bg-secondary)` | `background: var(--input-field-bg)` | Consistent popup bg |

---

## 7. Component Architecture

No new components. All changes are modifications to existing components:

| Component | Changes |
|-----------|---------|
| `ChatPanel.tsx` | Restructure toolbar -> header, restructure input area, replace text buttons with icon buttons |
| `ToolUseBlock.tsx` | Update container, header, and detail section styles |
| `globals.css` | Add new CSS variables for all three themes |
| `AppShell.tsx` | No changes needed (title bar already uses --bg-nav) |

---

## 8. Acceptance Criteria

### Chat Header
- [ ] Header background is `--chat-header-bg` (#1a1a1a in default theme)
- [ ] Session title displayed at 13px, semi-bold, on the left
- [ ] Action buttons (search, export, bookmarks, stats, focus, new) aligned right with icon-only buttons
- [ ] Each action button has hover state (background highlight + icon color change)
- [ ] Bookmarks button shows count badge when bookmarks exist
- [ ] Stats popover opens correctly from the icon button
- [ ] Focus mode toggle works correctly
- [ ] Elapsed streaming timer still displays during streaming
- [ ] Working directory and message count removed from header
- [ ] Header height is 44px

### Input Area
- [ ] Input area background seamlessly blends with chat area (same `--bg-chat` / `--input-bar-bg`)
- [ ] No border-top line separating input from chat
- [ ] Toolbar row with icon-only buttons: Plus, AtSign, Terminal, Mic, and Queue (right)
- [ ] All toolbar icons have hover state
- [ ] Input field has 10px border-radius and subtle border
- [ ] Input field border turns accent blue on focus
- [ ] Send button is round (10px radius), 36x36px, brand blue
- [ ] Send button changes to red square icon when streaming
- [ ] Mic button turns red background when recording
- [ ] Queue button shows count badge when queue has items
- [ ] Image attachments display as rounded thumbnails above textarea
- [ ] Hint text row removed
- [ ] Character count only shows when > 5000 chars
- [ ] Placeholder text is "Message AIPA..."
- [ ] All existing functionality preserved (@ mentions, / commands, paste, drag-drop, voice, history)

### Tool Use Cards
- [ ] Tool card background uses rgba overlay instead of solid color
- [ ] Card border is subtle (rgba-based)
- [ ] Reduced font sizes (labels 11px, detail 10px)
- [ ] Running state uses subtle header background instead of border color change
- [ ] Card feels visually subordinate to the bubble it sits in
- [ ] Expand/collapse still works
- [ ] Abort button still appears for long-running tools
- [ ] Bash output uses rgba background instead of #0d0d0d

### Color Unification
- [ ] No hardcoded hex colors remain in ChatPanel.tsx (except in CSS variable definitions)
- [ ] No hardcoded hex colors remain in ToolUseBlock.tsx (except #4ade80 for bash output text -- acceptable)
- [ ] ChatPanel background is var(--bg-chat)
- [ ] All three themes (default, modern, minimal) render consistently
- [ ] Popup backgrounds (bookmarks, stats) use consistent variable

---

## 9. Visual Reference

### Before (Current State)
```
+----------------------------------------------+
| [title] [dir] [msgs] [icons...] [+]          |  <- bg-secondary, cluttered
+----------------------------------------------+
|                                               |
|    Messages...                                |  <- bg-primary (wrong)
|                                               |
+----------------------------------------------+
| Quick actions: Clear @file /cmd       Queue   |
| [textarea                        ] [mic] [>]  |  <- bg-secondary, bordered
| @ files | Enter send | Shift+Enter            |
+----------------------------------------------+
```

### After (Target State)
```
+----------------------------------------------+
| Session Title              [icons...] [+]     |  <- bg-nav (#1a1a1a), clean
+----------------------------------------------+
|                                               |
|    Messages...                                |  <- bg-chat (#2a2a2a)
|                                               |
|  [+] [@] [/] [mic]                   [Queue]  |  <- seamless bg-chat
|  [  textarea (rounded)           ] [  > ]     |  <- input-field-bg, rounded
+----------------------------------------------+
```
