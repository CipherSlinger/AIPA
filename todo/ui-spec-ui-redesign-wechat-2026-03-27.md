# UI Spec: WeChat-Style Interface Redesign (Iteration 53)

_Version: 1.0 | Designer: aipa-ui | Date: 2026-03-27_
_PRD Reference: `todo/prd-ui-redesign-wechat-v1.md`_

---

## 1. Design Goal

Transform AIPA from a developer-tool aesthetic into a refined chat-app experience that feels immediately familiar to users of WeChat, Telegram, or iMessage -- while preserving the deep-dark palette the existing codebase already uses. The redesign introduces three-column layout, bubble-based messages, and an icon navigation rail, reducing cognitive load for non-technical users and establishing clear visual hierarchy.

### Design Principles for This Iteration

1. **Layered depth via background graduation** -- three distinct background luminance levels create spatial separation without heavy borders.
2. **Asymmetric bubble corners** -- the single small-radius corner acts as a directional cue ("who is speaking") without adding arrow shapes.
3. **Minimal color palette** -- only two hue families (brand blue `#007acc` for user actions, brand purple `#5a3f8a` for AI identity), everything else is neutral.
4. **Inline style consistency** -- all values specified as CSS property:value pairs and CSS variable names, matching the project's `style={{}}` convention. Tailwind class names are listed only as reference annotations.

---

## 2. CSS Variable Additions

Add to `:root` in `globals.css`, **after** the existing variables (do not remove any existing variables):

```css
:root {
  /* --- Existing variables remain unchanged --- */

  /* === NEW: Three-column layout backgrounds === */
  --bg-nav:               #1a1a1a;   /* NavRail -- darkest */
  --bg-sessionpanel:      #212121;   /* Session list panel */
  --bg-chat:              #2a2a2a;   /* Chat main area */

  /* === NEW: Bubble system === */
  --bubble-ai:            #333333;   /* AI bubble fill */
  --bubble-ai-text:       #e0e0e0;   /* AI bubble text */
  --bubble-ai-border:     #3d3d3d;   /* AI bubble subtle border */
  --bubble-user:          #264f78;   /* User bubble fill (brand blue dark) */
  --bubble-user-text:     #e8e8e8;   /* User bubble text */
  --bubble-user-border:   #2e5f8f;   /* User bubble subtle border */

  /* === NEW: NavRail === */
  --nav-icon-default:     #6b6b6b;   /* Unselected nav icon */
  --nav-icon-hover:       #a0a0a0;   /* Hovered nav icon */
  --nav-icon-active:      #ffffff;   /* Selected nav icon */
  --nav-indicator:        #007acc;   /* Left accent bar on selected item */

  /* === NEW: Session item === */
  --session-active-bg:    rgba(0, 122, 204, 0.12);  /* Selected session bg */
  --session-hover-bg:     rgba(255, 255, 255, 0.04); /* Hovered session bg */

  /* === NEW: Avatar === */
  --avatar-ai:            #5a3f8a;   /* AI avatar background (purple) */
  --avatar-user:          #007acc;   /* User avatar background (blue) */
}
```

### Theme Overrides

For `[data-theme="modern"]`:
```css
[data-theme="modern"] {
  --bg-nav:             #0d1117;
  --bg-sessionpanel:    #131920;
  --bg-chat:            #161b22;
  --bubble-ai:          #1c2128;
  --bubble-ai-text:     #e6edf3;
  --bubble-ai-border:   #21262d;
  --bubble-user:        #1f3a5f;
  --bubble-user-text:   #e6edf3;
  --bubble-user-border: #264f78;
  --nav-icon-default:   #484f58;
  --nav-icon-hover:     #7d8590;
  --nav-icon-active:    #ffffff;
  --nav-indicator:      #2f81f7;
  --session-active-bg:  rgba(47, 129, 247, 0.12);
  --avatar-ai:          #553098;
  --avatar-user:        #2f81f7;
}
```

For `[data-theme="minimal"]`:
```css
[data-theme="minimal"] {
  --bg-nav:             #0a0a0a;
  --bg-sessionpanel:    #111111;
  --bg-chat:            #181818;
  --bubble-ai:          #1e1e1e;
  --bubble-ai-text:     #eeeeee;
  --bubble-ai-border:   #262626;
  --bubble-user:        #1e1033;
  --bubble-user-text:   #eeeeee;
  --bubble-user-border: #2a1745;
  --nav-icon-default:   #444444;
  --nav-icon-hover:     #777777;
  --nav-icon-active:    #ffffff;
  --nav-indicator:      #a855f7;
  --session-active-bg:  rgba(168, 85, 247, 0.12);
  --avatar-ai:          #6b21a8;
  --avatar-user:        #a855f7;
}
```

---

## 3. Typography System (unchanged, documented for reference)

| Level       | Size | Weight | Line-height | CSS Variable   | Usage                        |
|-------------|------|--------|-------------|----------------|------------------------------|
| Display     | 16px | 600    | 1.4         | --             | Chat header session title    |
| Body        | 13px | 400    | 1.6         | --             | Message text, UI labels      |
| Caption     | 11px | 400    | 1.4         | --             | Timestamps, badges, metadata |
| Tiny        | 10px | 400    | 1.3         | --             | Session timestamps, hints    |
| Code        | 12px | 400    | 1.5         | --             | Code blocks, inline code     |

Font stack (already in `globals.css`):
- UI: `-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`
- Code: `'Cascadia Code', 'Fira Code', Consolas, monospace`

---

## 4. Three-Column Layout (AppShell Restructure)

### 4.1 Layout Structure

```
+----------+-----------------+-----------------------------------+
| NavRail  |  SessionPanel   |          ChatPanel                |
| 56px     |  240px default  |          flex: 1                  |
| fixed    |  resizable      |                                   |
+----------+-----------------+-----------------------------------+
```

### 4.2 Outer Container

The root flex container remains `flex flex-col h-full overflow-hidden`. The content area below the title bar changes from a two-child flex row to a three-child (or four-child when terminal is open) flex row.

```
style={{
  display: 'flex',
  flexDirection: 'row',
  flex: 1,
  overflow: 'hidden',
}}
```

### 4.3 NavRail Container

```
style={{
  width: 56,
  flexShrink: 0,
  background: 'var(--bg-nav)',
  borderRight: '1px solid var(--border)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  paddingTop: 12,
  paddingBottom: 12,
  userSelect: 'none',
  overflow: 'hidden',
}}
```

**Visibility rules:**
- Always visible by default.
- Hidden when `focusMode === true`.
- Remains visible when SessionPanel is collapsed via `Ctrl+B`.
- On window width < 600px: SessionPanel auto-collapses; NavRail stays visible.

### 4.4 SessionPanel Container

```
style={{
  width: sidebarWidth,       /* default 240, range 180-400 */
  flexShrink: 0,
  background: 'var(--bg-sessionpanel)',
  borderRight: '1px solid var(--border)',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
}}
```

**Visibility:** controlled by `sidebarOpen` state (same as current). `Ctrl+B` toggles this panel. Clicking a NavRail panel-item (history/files/settings) while SessionPanel is closed should open it.

### 4.5 Resize Handle (between SessionPanel and ChatPanel)

Same as current implementation. 4px wide, `var(--border)` background, accent on hover.

### 4.6 ChatPanel Container

```
style={{
  flex: 1,
  overflow: 'hidden',
  background: 'var(--bg-chat)',
  display: 'flex',
  flexDirection: 'column',
}}
```

### 4.7 Title Bar Update

The title bar spans the full window width (all three columns). No structural change. Background should use `var(--bg-nav)` (darkest) for continuity with the NavRail.

```
style={{
  height: 32,
  background: 'var(--bg-nav)',     /* changed from --bg-sidebar */
  borderBottom: '1px solid var(--border)',
  /* ... rest unchanged ... */
}}
```

### 4.8 Visual Depth Gradient (Key Design Decision)

Background luminance flows from darkest on the left to lightest on the right:

```
NavRail  #1a1a1a  (L=10)
   |
SessionPanel  #212121  (L=13)
   |
ChatPanel  #2a2a2a  (L=17)
```

This creates a natural left-to-right depth perception where the chat content area -- the primary workspace -- is the brightest surface, drawing the eye. Borders between columns are `#404040` (existing `--border` value), providing subtle but sufficient delineation.

---

## 5. NavRail Component (New: `components/layout/NavRail.tsx`)

### 5.1 Item Layout

Items are arranged vertically, centered horizontally within the 56px rail.

```
+--------+
|        |
| [chat] |   <-- 40x40 hit area, icon 20px
|        |
| [hist] |
|        |
| [file] |
|        |
| [term] |
|        |
|  ...   |   <-- flex: 1 spacer
|        |
| [sett] |
|        |
| [avatar]|   <-- 36px circle at bottom
|        |
+--------+
```

### 5.2 Navigation Items Definition

| Order | Key        | lucide-react Icon    | Icon Size | Behavior on Click                            |
|-------|------------|----------------------|-----------|----------------------------------------------|
| 1     | `chat`     | `MessageSquarePlus`  | 20px      | New conversation (`Ctrl+N` equivalent)       |
| 2     | `history`  | `History`            | 20px      | Show SessionList in SessionPanel             |
| 3     | `files`    | `FolderOpen`         | 20px      | Show FileBrowser in SessionPanel             |
| 4     | `terminal` | `TerminalSquare`     | 20px      | Toggle TerminalPanel (right side)            |
| --    | spacer     | --                   | --        | `flex: 1` pushes remaining items to bottom   |
| 5     | `settings` | `Settings`           | 20px      | Show SettingsPanel in SessionPanel           |
| 6     | `avatar`   | `User`               | 18px      | No action in v1 (future: account menu)       |

### 5.3 Nav Item Visual Spec

Each item is a `<button>` element.

**Shared wrapper:**
```
style={{
  width: 40,
  height: 40,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 8,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  position: 'relative',
  marginBottom: 4,
  transition: 'background 0.15s ease',
}}
```

**States:**

| State    | background                        | icon color                  |
|----------|-----------------------------------|-----------------------------|
| Default  | `transparent`                     | `var(--nav-icon-default)` `#6b6b6b` |
| Hover    | `rgba(255,255,255,0.06)`          | `var(--nav-icon-hover)` `#a0a0a0`   |
| Active   | `rgba(255,255,255,0.08)`          | `var(--nav-icon-active)` `#ffffff`   |
| Focused  | standard focus ring (`outline: 2px solid var(--accent)`) | unchanged |

**Selected Indicator (left accent bar):**

When the item corresponds to the active `sidebarTab`, render a pseudo-element or sibling `<div>`:

```
style={{
  position: 'absolute',
  left: 0,
  top: '50%',
  transform: 'translateY(-50%)',
  width: 3,
  height: 20,
  borderRadius: '0 2px 2px 0',
  background: 'var(--nav-indicator)',  /* #007acc */
  transition: 'opacity 0.15s ease',
}}
```

Only `history`, `files`, `settings` items display this indicator. `chat` and `terminal` do not have a "selected" state (they trigger actions, not panel switches).

### 5.4 History Badge

The `history` nav item displays a session count badge when `sessionCount > 0`.

```
/* Badge container -- positioned at top-right of the 40x40 hit area */
style={{
  position: 'absolute',
  top: 4,
  right: 2,
  minWidth: 16,
  height: 16,
  borderRadius: 8,
  background: 'var(--accent)',   /* #007acc */
  color: '#ffffff',
  fontSize: 9,
  fontWeight: 600,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 4px',
  lineHeight: 1,
}}
```

Display `99+` when count exceeds 99.

### 5.5 Bottom Avatar

Circular avatar placeholder at the bottom of the rail.

```
style={{
  width: 36,
  height: 36,
  borderRadius: '50%',
  background: 'var(--avatar-ai)',  /* #5a3f8a */
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'default',              /* no action in v1 */
  marginTop: 8,
}}
```

Icon: `<User size={18} color="#ffffff" />`

### 5.6 Tooltip

Each nav item should have a `title` attribute for native tooltip. Values: "New Chat", "History", "Files", "Terminal", "Settings". No custom tooltip component needed in v1.

### 5.7 Accessibility

```html
<nav role="navigation" aria-label="Main navigation">
  <button aria-label="New Chat" aria-current={undefined}>
  <button aria-label="History" aria-current={isHistoryActive ? "page" : undefined}>
  <!-- ... -->
</nav>
```

Keyboard: Tab focuses the nav, Arrow Up/Down moves between items. Each item is a focusable `<button>`.

---

## 6. Message Bubble System (Message.tsx Restructure)

### 6.1 Core Layout Change

**Before:** All messages use the same left-aligned row layout with avatar + content.

**After:** Messages use role-dependent alignment:
- `assistant` messages: left-aligned with bubble
- `user` messages: right-aligned with bubble
- `system` messages: centered, no bubble, no avatar
- `permission` / `plan` messages: centered, no bubble wrap (keep current card style)

### 6.2 Message Row Container

**AI message (assistant):**
```
style={{
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'flex-start',
  gap: 12,
  padding: compact ? '6px 20px' : '8px 20px',
  maxWidth: '100%',
  position: 'relative',
  animation: 'message-in 0.2s ease-out',
}}
```

**User message:**
```
style={{
  display: 'flex',
  flexDirection: 'row-reverse',      /* key: reverses avatar to right */
  alignItems: 'flex-start',
  gap: 12,
  padding: compact ? '6px 20px' : '8px 20px',
  maxWidth: '100%',
  position: 'relative',
  animation: 'message-in 0.2s ease-out',
}}
```

**System message:**
```
style={{
  display: 'flex',
  justifyContent: 'center',
  padding: '4px 20px',
}}
/* Inner span: */
style={{
  background: 'rgba(244, 71, 71, 0.08)',
  borderRadius: 4,
  padding: '4px 12px',
  fontSize: 12,
  color: 'var(--text-muted)',
}}
```

**Permission / Plan message:**
```
/* No bubble wrap. Render centered with current card style unchanged. */
style={{
  display: 'flex',
  justifyContent: 'center',
  padding: '8px 20px',
}}
```

### 6.3 Avatar (Bubble Layout)

**Size:** 36px (up from current 28px for better visual balance with bubbles).

**AI Avatar:**
```
style={{
  width: 36,
  height: 36,
  borderRadius: '50%',
  background: 'var(--avatar-ai)',   /* #5a3f8a */
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  marginTop: 2,
}}
/* Icon: <Bot size={18} color="#ffffff" /> */
```

**User Avatar:**
```
style={{
  width: 36,
  height: 36,
  borderRadius: '50%',
  background: 'var(--avatar-user)',  /* #007acc */
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  marginTop: 2,
}}
/* Icon: <User size={18} color="#ffffff" /> */
```

**Compact mode:** Avatar shrinks to 28px, icon size 14px.

### 6.4 Consecutive Same-Role Messages (Avatar Grouping)

When multiple consecutive messages share the same role:
- **First message:** Show avatar normally.
- **Subsequent messages:** Hide the avatar but preserve the spacing (a transparent spacer of the same width) so bubbles align.

Implementation hint: The parent `MessageList` should pass a `showAvatar: boolean` prop. Logic:

```typescript
const showAvatar = (index: number): boolean => {
  if (index === 0) return true
  const prev = messages[index - 1]
  const curr = messages[index]
  return prev.role !== curr.role
}
```

**Spacer (when avatar hidden):**
```
style={{
  width: 36,        /* same as avatar */
  flexShrink: 0,
}}
```

### 6.5 Bubble Wrapper

**AI Bubble:**
```
style={{
  background: 'var(--bubble-ai)',           /* #333333 */
  borderRadius: '2px 12px 12px 12px',       /* top-left small = directional cue */
  padding: '10px 14px',
  maxWidth: 'min(85%, 720px)',
  minWidth: 60,
  color: 'var(--bubble-ai-text)',           /* #e0e0e0 */
  border: '1px solid var(--bubble-ai-border)',  /* #3d3d3d */
  wordBreak: 'break-word',
  position: 'relative',
  boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
}}
```

**User Bubble:**
```
style={{
  background: 'var(--bubble-user)',          /* #264f78 */
  borderRadius: '12px 2px 12px 12px',        /* top-right small = directional cue */
  padding: '10px 14px',
  maxWidth: 'min(85%, 720px)',
  minWidth: 60,
  color: 'var(--bubble-user-text)',          /* #e8e8e8 */
  border: '1px solid var(--bubble-user-border)', /* #2e5f8f */
  wordBreak: 'break-word',
  position: 'relative',
  boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
}}
```

### 6.6 Border-Radius Detail (Four-Corner Breakdown)

CSS `border-radius` shorthand is `top-left / top-right / bottom-right / bottom-left`.

| Bubble | top-left | top-right | bottom-right | bottom-left | Mnemonic |
|--------|----------|-----------|--------------|-------------|----------|
| AI     | 2px      | 12px      | 12px         | 12px        | Small corner at "tail" side (left, pointing toward avatar) |
| User   | 12px     | 2px       | 12px         | 12px        | Small corner at "tail" side (right, pointing toward avatar) |

The 2px corner creates a subtle directional cue without using a triangular tail arrow. This matches the WeChat aesthetic.

### 6.7 Timestamp Inside Bubble

Rendered as the last element inside the bubble, right-aligned:

```
style={{
  fontSize: 11,
  color: isUser
    ? 'rgba(255,255,255,0.5)'       /* semi-transparent white on blue */
    : 'var(--text-muted)',          /* #858585 on grey */
  textAlign: 'right',
  marginTop: 6,
  lineHeight: 1,
}}
```

Content: `relativeTime(message.timestamp)` with `title` attribute showing full date/time.

### 6.8 Streaming Indicator

When `isStreaming === true`, display below the timestamp line inside the AI bubble:

```
/* Three animated dots */
style={{
  display: 'flex',
  gap: 4,
  marginTop: 4,
}}
/* Each dot: */
style={{
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: 'var(--success)',     /* #4ec9b0 */
  animation: 'pulse 1.4s ease-in-out infinite',
  /* stagger: animationDelay: i * 0.2s */
}}
```

Also display "Generating..." text:
```
style={{
  fontSize: 11,
  color: 'var(--success)',
  marginLeft: 4,
}}
```

### 6.9 Role Label Removal

In the bubble layout, the role label ("You" / "Claude") is **removed**. The bubble color + direction + avatar already convey the role. This reduces visual noise.

If needed for accessibility, add `aria-label` to the message row:
- AI: `aria-label="Claude said: [first 100 chars of content]"`
- User: `aria-label="You said: [first 100 chars of content]"`

### 6.10 Hover Actions (Copy / Raw Markdown)

Move the hover action buttons to the **bottom-right outside the bubble** rather than top-right of the entire row. This prevents them from occluding bubble content.

```
/* Container for hover actions, positioned below the bubble */
style={{
  display: hovered ? 'flex' : 'none',
  gap: 4,
  marginTop: 4,
  justifyContent: isUser ? 'flex-end' : 'flex-start',
}}
/* Each button: */
style={{
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '2px 6px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 11,
  color: 'var(--text-muted)',
  lineHeight: 1.4,
  transition: 'background 0.15s ease',
}}
/* Hover state: */
onMouseEnter: background -> 'var(--bg-hover)'
```

### 6.11 Tool Use Inside Bubble

ToolUseBlock components render inside the AI bubble, separated by a subtle divider:

```
/* Divider above tool use area */
style={{
  borderTop: '1px solid var(--bubble-ai-border)',
  marginTop: 8,
  paddingTop: 8,
}}
```

The ToolUseBlock itself keeps its current internal structure. Its background adjusts:
```
/* ToolUseBlock background within a bubble context */
style={{
  background: 'rgba(0, 0, 0, 0.15)',
  borderRadius: 6,
  /* ... rest of existing tool use styles ... */
}}
```

### 6.12 Image Attachments Inside Bubble

User image attachments render inside the user bubble before the text content:

```
/* Image container inside bubble */
style={{
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  marginBottom: 6,
}}
/* Each image: */
style={{
  maxWidth: 200,
  maxHeight: 150,
  borderRadius: 6,    /* increased from 4 to match bubble radius family */
  border: 'none',     /* no border needed inside bubble */
  objectFit: 'cover',
  cursor: 'pointer',
}}
```

### 6.13 Thinking Block Inside Bubble

Remains inside the AI bubble. The expand/collapse toggle and background panel style stays the same, but the panel background becomes:
```
background: 'rgba(0, 0, 0, 0.2)'   /* slightly darker than bubble */
```
instead of `var(--bg-primary)`.

### 6.14 Bookmark Indicator

Move from the role label area to the top-right corner of the bubble:

```
style={{
  position: 'absolute',
  top: -6,
  right: -6,       /* for AI bubble; left: -6 for user bubble */
}}
/* Icon: <Bookmark size={14} fill="var(--warning)" color="var(--warning)" /> */
```

### 6.15 Compact Mode Adjustments

When `compactMode === true`:
- Bubble padding: `8px 12px` (from `10px 14px`)
- Message row padding: `4px 20px` (from `8px 20px`)
- Avatar: 28px (from 36px), icon 14px (from 18px)
- Timestamp font-size: 10px (from 11px)
- Max bubble width: unchanged

---

## 7. Session List Item Enhancement

### 7.1 New Item Structure

```
+------+----------------------------------------------+
|      |  Session Title              2 hours ago      |
| icon |  Last message preview text truncated...       |
|      |                                               |
+------+----------------------------------------------+
```

Height: `auto` (min ~56px). Padding: `10px 12px`.

### 7.2 Session Avatar (Colored Square Icon)

```
style={{
  width: 36,
  height: 36,
  borderRadius: 8,
  background: avatarColor,     /* from color palette below */
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}}
/* Icon: <MessageSquare size={18} color="#ffffff" /> */
/* Pinned: <Star size={18} color="#ffffff" /> */
```

### 7.3 Color Palette for Session Avatars

8-color deterministic palette. Selection: `hash(sessionId) % 8`.

```typescript
const SESSION_AVATAR_COLORS = [
  '#4a90d9',  // blue
  '#50b86e',  // green
  '#e67e22',  // orange
  '#9b59b6',  // purple
  '#e74c3c',  // red
  '#1abc9c',  // teal
  '#f39c12',  // amber
  '#34495e',  // slate
]
```

Hash function (simple, stable):
```typescript
function hashSessionId(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function getSessionAvatarColor(sessionId: string): string {
  return SESSION_AVATAR_COLORS[hashSessionId(sessionId) % SESSION_AVATAR_COLORS.length]
}
```

### 7.4 Item Text Layout

**Title row (flex row):**
```
style={{
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  marginBottom: 4,
}}
```

**Title text:**
```
style={{
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--text-primary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
}}
```

**Timestamp (right side of title row):**
```
style={{
  fontSize: 10,
  color: 'var(--text-muted)',
  flexShrink: 0,
  whiteSpace: 'nowrap',
}}
```

**Preview line:**
```
style={{
  fontSize: 11,
  color: 'var(--text-muted)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  lineHeight: 1.4,
  paddingRight: 16,     /* leave space for potential badge */
}}
```

Preview content: `session.lastPrompt` truncated to 50 characters. If empty, show "(no content)" in italic.

### 7.5 Item States

**Default:**
```
style={{
  padding: '10px 12px',
  display: 'flex',
  gap: 10,
  alignItems: 'center',
  cursor: 'pointer',
  borderBottom: '1px solid var(--border)',
  borderLeft: '3px solid transparent',
  background: 'transparent',
  transition: 'background 0.12s ease',
}}
```

**Hover:**
```
background: 'var(--session-hover-bg)'    /* rgba(255,255,255,0.04) */
```

**Active (selected session):**
```
background: 'var(--session-active-bg)'   /* rgba(0, 122, 204, 0.12) */
borderLeft: '3px solid var(--accent)'    /* #007acc */
```

**Active + Hover:**
```
background: 'rgba(0, 122, 204, 0.18)'
```

### 7.6 Search Input (SessionPanel Top)

Update the search input to have a rounder, more modern feel:

```
style={{
  flex: 1,
  background: 'var(--bg-input)',
  border: '1px solid transparent',       /* no border by default */
  borderRadius: 6,                       /* increased from 3 */
  padding: '6px 10px 6px 30px',          /* left padding for search icon */
  color: 'var(--text-primary)',
  fontSize: 12,
  outline: 'none',
  transition: 'border-color 0.15s ease',
}}
/* On focus: */
borderColor: 'var(--accent)'
```

Consider prepending a `<Search size={14} />` icon inside the input wrapper, positioned absolutely at left: 10px.

### 7.7 Skeleton Loader Update

`SkeletonSessionRow` should match the new layout:

```
/* Updated skeleton row */
style={{
  display: 'flex',
  gap: 10,
  padding: '10px 12px',
  alignItems: 'center',
}}
/* Avatar skeleton: 36x36, borderRadius 8 (square, not circle) */
/* Text area: two lines -- 70% width x 12px, then 50% width x 10px */
```

---

## 8. Zustand Store Changes (`useUiStore`)

### 8.1 New State Fields

```typescript
interface UiState {
  // ... existing fields ...

  // NEW: NavRail active item tracking
  activeNavItem: 'chat' | 'history' | 'files' | 'terminal' | 'settings'
  setActiveNavItem: (item: UiState['activeNavItem']) => void
}
```

Note: `activeNavItem` mirrors the semantics of `sidebarTab` but adds `chat` and `terminal` as transient action triggers. The store should sync `activeNavItem` with `sidebarTab` when a panel-type item is selected:

```typescript
setActiveNavItem: (item) => set((s) => {
  if (item === 'history' || item === 'files' || item === 'settings') {
    return { activeNavItem: item, sidebarTab: item, sidebarOpen: true }
  }
  return { activeNavItem: item }
})
```

---

## 9. Animation Specifications

### 9.1 Message Entrance (existing, keep unchanged)

```css
@keyframes message-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.message-enter { animation: message-in 0.2s ease-out; }
```

### 9.2 NavRail Indicator Slide

When the selected nav item changes, the left indicator bar should transition smoothly. Since the indicator is rendered per-item (not a shared element), use opacity transition:

```
transition: 'opacity 0.15s ease'
/* Default: opacity: 0 */
/* Active: opacity: 1 */
```

### 9.3 SessionPanel Slide (for Ctrl+B toggle)

Optional P1 enhancement. For now, SessionPanel toggles instantly (matching current behavior). If adding animation later:

```css
transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.15s ease;
```

### 9.4 Bubble Hover Lift (subtle, optional)

On hover, the bubble can subtly increase shadow depth:

```
/* Default: */
boxShadow: '0 1px 3px rgba(0,0,0,0.12)'
/* Hover: */
boxShadow: '0 2px 6px rgba(0,0,0,0.18)'
transition: 'box-shadow 0.15s ease'
```

---

## 10. Globals.css Additions

New keyframe (if not already present -- currently it is, so no change):
```css
/* Already defined -- verify these exist: */
@keyframes message-in { ... }
@keyframes pulse { ... }
```

New class for NavRail-specific styling:
```css
/* NavRail tooltip delay */
.nav-item[title] {
  /* Native title attribute is sufficient for v1 */
}
```

---

## 11. Component File Impact Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `globals.css` | Modify | Add new CSS variables (Section 2) |
| `components/layout/AppShell.tsx` | Modify | Add NavRail as first child in content row; change title bar bg |
| `components/layout/NavRail.tsx` | **New** | Icon navigation rail component (Section 5) |
| `components/layout/Sidebar.tsx` | Modify | Remove tab bar at top; keep only content area (SessionList / FileBrowser / SettingsPanel) |
| `components/chat/Message.tsx` | Modify | Restructure to bubble layout (Section 6) |
| `components/chat/MessageList.tsx` | Modify | Add `showAvatar` computation and pass as prop |
| `components/sessions/SessionList.tsx` | Modify | Add avatar square, preview line, updated styles (Section 7) |
| `components/ui/Skeleton.tsx` | Modify | Update `SkeletonSessionRow` to match new item structure |
| `store/index.ts` | Modify | Add `activeNavItem` to UiState (Section 8) |

---

## 12. Implementation Checklist (for aipa-frontend)

### P0 Verification (must pass before merge)

- [ ] **Three-column layout visible:** App shows NavRail (56px) + SessionPanel (240px) + ChatPanel (flex)
- [ ] **Background depth:** NavRail is darkest (`#1a1a1a`), SessionPanel mid (`#212121`), ChatPanel lightest (`#2a2a2a`)
- [ ] **1px border lines** between all three columns using `var(--border)`
- [ ] **NavRail icons:** All 6 items render with correct lucide-react icons at 20px
- [ ] **NavRail selected state:** Active panel item has 3px left accent bar + white icon
- [ ] **NavRail hover:** Icon color transitions to `#a0a0a0` on hover
- [ ] **NavRail click -> panel:** Clicking History/Files/Settings shows correct content in SessionPanel
- [ ] **NavRail click -> expand:** If SessionPanel is closed, clicking a panel item opens it
- [ ] **NavRail Chat button:** Creates new conversation
- [ ] **NavRail Terminal button:** Toggles terminal panel
- [ ] **History badge:** Shows session count on History icon
- [ ] **Bottom avatar:** 36px purple circle with User icon at NavRail bottom
- [ ] **Sidebar tab bar removed:** Old horizontal tab bar in Sidebar.tsx is gone
- [ ] **AI bubble:** Left-aligned, `#333333` background, `border-radius: 2px 12px 12px 12px`
- [ ] **User bubble:** Right-aligned, `#264f78` background, `border-radius: 12px 2px 12px 12px`
- [ ] **Bubble max-width:** `min(85%, 720px)` on both bubble types
- [ ] **Bubble shadow:** `0 1px 3px rgba(0,0,0,0.12)`
- [ ] **AI avatar in bubble:** 36px circle, `#5a3f8a` background, Bot icon
- [ ] **User avatar in bubble:** 36px circle, `#007acc` background, User icon
- [ ] **Consecutive same-role:** Avatar shown only on first message, spacer on subsequent
- [ ] **Timestamp in bubble:** Right-aligned, 11px, inside each bubble
- [ ] **System messages:** Centered, no bubble, red tint background
- [ ] **Permission/Plan cards:** Centered, no bubble wrapper, existing card style preserved
- [ ] **Tool use in bubble:** Renders inside AI bubble with `rgba(0,0,0,0.15)` background
- [ ] **Image attachments in bubble:** User images render inside bubble
- [ ] **Thinking block in bubble:** Renders inside AI bubble, toggle works
- [ ] **Hover actions:** Copy and Raw buttons appear outside bubble on hover
- [ ] **Context menu:** Right-click menu works on both bubble types
- [ ] **Double-click copy:** Works on both bubble types
- [ ] **Collapse toggle:** Works on both bubble types
- [ ] **Search highlight:** Works inside bubble text
- [ ] **Bookmark indicator:** Shows on bookmarked messages
- [ ] **Session item avatar:** 36px rounded square with color from palette
- [ ] **Session item preview:** Shows last message preview (11px, muted)
- [ ] **Session item title row:** Title + timestamp on same line
- [ ] **Session avatar color stability:** Same session always gets same color
- [ ] **Pinned session icon:** Star icon in avatar instead of MessageSquare
- [ ] **Skeleton loader:** Updated to match new item structure (square avatar placeholder)
- [ ] **Ctrl+B toggle:** Hides/shows SessionPanel only, NavRail unaffected
- [ ] **Ctrl+Shift+F focus mode:** Hides NavRail + SessionPanel
- [ ] **Window < 600px:** SessionPanel auto-collapses, NavRail stays
- [ ] **Theme compatibility:** New CSS variables defined in all three themes (default, modern, minimal)
- [ ] **Compact mode:** Bubble padding and avatar size reduce appropriately
- [ ] **No new npm dependencies introduced**

### Visual Quality Checks

- [ ] All color values use CSS variables, no hardcoded hex in component files (except the SESSION_AVATAR_COLORS array)
- [ ] Border-radius values match spec exactly (verify the 2px/12px asymmetry)
- [ ] Box-shadow values match spec exactly
- [ ] No visible layout jank when switching between sessions
- [ ] Message entrance animation (`message-in`) still works correctly with bubble layout
- [ ] Code blocks inside bubbles do not overflow the bubble boundary
- [ ] Very long unbroken strings wrap correctly inside bubbles (`word-break: break-word`)

---

## 13. Design Decision Log

### Decision 1: Keep Deep-Dark, Not Switch to WeChat Light

**Choice:** Refined dark theme with layered depth gradients.
**Rationale:** The codebase has 3 dark theme variants and zero light themes. Switching to WeChat's light gray (`#ededed`) would require building an entire light-theme variable set and testing every component. The dark palette also better suits the primary developer audience and long-session usage patterns. The WeChat influence is structural (three columns, bubbles) not chromatic.

### Decision 2: Brand Blue (`#264f78`) for User Bubbles, Not WeChat Green

**Choice:** Deep blue user bubble.
**Rationale:** AIPA's brand accent is `#007acc` (blue). Using WeChat green (`#07c160`) would create brand confusion. The deep blue `#264f78` is a darkened variant of the brand accent that sits comfortably in the dark palette without being too vivid. It provides sufficient contrast with the AI bubble (`#333333`) -- approximately 30 points of luminance difference.

### Decision 3: 2px Small Corner (Not 0px) for Bubble Tail Direction

**Choice:** 2px radius at the "tail" corner instead of 0px.
**Rationale:** A fully sharp corner (0px) looks harsh and overly geometric in a dark theme. 2px is small enough to read as "this is where the bubble points" but soft enough to feel polished. WeChat desktop uses a similar subtle approach rather than an actual triangular tail.

### Decision 4: Avatar Size 36px (Up from 28px)

**Choice:** 36px circle avatars in bubble layout.
**Rationale:** Bubbles create more visual mass than the old row layout. At 28px, avatars look disproportionately small next to a 12px-radius bubble. 36px creates better visual balance and matches the WeChat reference (36-40px range). Compact mode drops back to 28px.

### Decision 5: Timestamps Inside Bubbles, Not Below

**Choice:** Timestamp rendered as the last line inside each bubble.
**Rationale:** External timestamps (below or beside the bubble) add vertical spacing and visual clutter. Inline timestamps are more space-efficient and are the standard pattern in WeChat, iMessage, and Telegram. The timestamp uses reduced opacity to avoid competing with message content.

---

## 14. Open Questions (Forwarded from PRD)

These require PM confirmation. Frontend should proceed with the **recommended defaults** unless told otherwise:

1. **User bubble color:** Using brand blue `#264f78` (recommended). Alternative: `#2d5a3a` (green). **Default: blue.**
2. **NavRail in very narrow windows (<500px):** Keeping NavRail visible even below 500px. 56px is only ~11% of 500px. **Default: keep visible.**
3. **Consecutive message avatar threshold:** Not considering time gaps, purely role-based grouping. **Default: role-based only.**
4. **Preview text source:** Using `session.lastPrompt` from existing `SessionListItem` type. **Default: lastPrompt.**

---

_End of spec. This document is the single source of truth for Iteration 53 visual design. All component implementations should reference this spec for exact values._
