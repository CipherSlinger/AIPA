# UI Spec: Color Unification Completion + Animation System
_Iteration 55 | Designer: aipa-ui | Date: 2026-03-26_

## Design Goal

Complete the WeChat-style visual overhaul by eliminating all remaining `var(--bg-primary)` and `var(--bg-secondary)` references in chat-related components, replacing them with the new layered CSS variable system. Additionally, introduce a lightweight animation system for panel transitions, hover micro-interactions, and tool card expand/collapse -- using only CSS transitions and `@keyframes`, no new dependencies.

---

## Part 1: New CSS Variables

Add these to `:root`, `[data-theme="modern"]`, and `[data-theme="minimal"]`:

### Popup / Overlay Surface

Used for all floating overlays (context menus, command palette, slash popup, @mention popup, search bar).

| Variable | Default | Modern | Minimal | Purpose |
|----------|---------|--------|---------|---------|
| `--popup-bg` | `#2a2a2a` | `#1c2128` | `#1e1e1e` | Floating panel background |
| `--popup-border` | `#404040` | `#30363d` | `#2a2a2a` | Floating panel border |
| `--popup-shadow` | `0 8px 24px rgba(0,0,0,0.5)` | `0 8px 24px rgba(0,0,0,0.6)` | `0 8px 24px rgba(0,0,0,0.7)` | Floating panel shadow |
| `--popup-item-hover` | `rgba(255,255,255,0.06)` | `rgba(255,255,255,0.06)` | `rgba(255,255,255,0.06)` | Hover background for popup list items |

### Inline Action Button

Used for message hover buttons (Copy, Raw Markdown, Bookmark).

| Variable | Default | Modern | Minimal | Purpose |
|----------|---------|--------|---------|---------|
| `--action-btn-bg` | `rgba(0,0,0,0.3)` | `rgba(0,0,0,0.35)` | `rgba(0,0,0,0.4)` | Small action button background |
| `--action-btn-border` | `rgba(255,255,255,0.08)` | `rgba(255,255,255,0.06)` | `rgba(255,255,255,0.05)` | Small action button border |
| `--action-btn-hover` | `rgba(255,255,255,0.1)` | `rgba(255,255,255,0.1)` | `rgba(255,255,255,0.1)` | Small action button hover bg |

### Card Surface

Used for PlanCard, PermissionCard (cards that sit outside the bubble flow).

| Variable | Default | Modern | Minimal | Purpose |
|----------|---------|--------|---------|---------|
| `--card-bg` | `#2a2a2a` | `#1c2128` | `#1e1e1e` | Card background (matches chat surface) |
| `--card-border` | `rgba(255,255,255,0.08)` | `rgba(255,255,255,0.06)` | `rgba(255,255,255,0.05)` | Card border |

---

## Part 2: Component Color Mapping

### 2.1 Message.tsx -- Hover Action Buttons

**Current**: `background: 'var(--bg-primary)'`, `border: '1px solid var(--border)'`

**Target**:
```
background: 'var(--action-btn-bg)'
border: '1px solid var(--action-btn-border)'
```
Apply to:
- Line ~389: Raw markdown toggle button (`showRawMarkdown ? 'var(--accent)' : 'var(--action-btn-bg)'`)
- Line ~409: Copy button for assistant messages
- Line ~440: Copy button for user messages

Hover effect: `background: 'var(--action-btn-hover)'`

### 2.2 PlanCard.tsx

**Current**: `background: 'var(--bg-secondary)'` (container)

**Target**:
```
Container: background: 'var(--card-bg)', border: '1px solid var(--card-border)'
Header: background unchanged (color-mix with --accent works well)
```

### 2.3 PermissionCard.tsx

**Current**: `background: 'var(--bg-secondary)'`

**Target**:
```
Container: background: 'var(--card-bg)', border uses existing conditional logic but fallback to 'var(--card-border)'
Detail block: background: 'var(--action-btn-bg)' (replaces var(--bg-active))
```

### 2.4 SearchBar.tsx

**Current**: `background: 'var(--bg-secondary)'`

**Target**:
```
Container: background: 'var(--popup-bg)', borderBottom unchanged
Input field: background: 'var(--input-field-bg)', border: '1px solid var(--input-field-border)', borderRadius: 6px
Focus: border-color: 'var(--input-field-focus)'
```

### 2.5 SlashCommandPopup.tsx

**Current**: `background: 'var(--bg-secondary)'`, `boxShadow: '0 4px 16px rgba(0,0,0,0.4)'`

**Target**:
```
Container: background: 'var(--popup-bg)', border: '1px solid var(--popup-border)', boxShadow: 'var(--popup-shadow)'
Item hover: background: 'var(--popup-item-hover)' (replaces var(--bg-active))
```

### 2.6 AtMentionPopup.tsx

**Current**: `background: 'var(--bg-secondary)'`, `boxShadow: '0 4px 16px rgba(0,0,0,0.4)'`

**Target**:
```
Container: background: 'var(--popup-bg)', border: '1px solid var(--popup-border)', boxShadow: 'var(--popup-shadow)'
Item hover: background: 'var(--popup-item-hover)' (replaces var(--bg-active))
```

### 2.7 MessageContextMenu.tsx

**Current**: `background: 'var(--bg-secondary)'`, `boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)'`

**Target**:
```
Container: background: 'var(--popup-bg)', border: '1px solid var(--popup-border)', boxShadow: 'var(--popup-shadow)'
Item hover: background: 'var(--popup-item-hover)' (replaces var(--bg-hover, var(--bg-active)))
```

### 2.8 CommandPalette.tsx

**Current**: `background: 'var(--bg-secondary)'` (modal), `background: 'var(--bg-primary)'` (selected item)

**Target**:
```
Modal: background: 'var(--popup-bg)', border: '1px solid var(--popup-border)', boxShadow: 'var(--popup-shadow)'
Selected item: background: 'var(--popup-item-hover)'
```

### 2.9 ShortcutCheatsheet.tsx

**Current**: `background: 'var(--bg-secondary)'`

**Target**:
```
Container: background: 'var(--popup-bg)', border: '1px solid var(--popup-border)', boxShadow: 'var(--popup-shadow)'
```

### 2.10 OnboardingWizard.tsx

**Current**: `background: 'var(--bg-secondary)'`

**Target**:
```
Container: background: 'var(--popup-bg)'
```

### 2.11 AppShell.tsx

**Current**: outer container uses `background: 'var(--bg-primary)'`

**Target**: Keep as-is. `--bg-primary` is appropriate for the top-level app shell (it's the deepest layer). No change needed.

### 2.12 globals.css -- Skeleton class

**Current**: `.skeleton { background: var(--bg-secondary, #252526); }`

**Target**: `.skeleton { background: var(--popup-bg, #2a2a2a); }`

### 2.13 MessageContent.tsx -- Search highlights and table headers

**Current**: Search highlight uses `color: 'var(--bg-primary)'`, table header uses `var(--bg-active, var(--bg-secondary))`

**Target**:
- Search highlight: `color: '#1a1a1a'` (hardcode dark text on yellow highlight -- this is semantically correct, not a theme variable)
- Table header: `background: 'var(--action-btn-bg)'` (subtle overlay)

### 2.14 TerminalPanel.tsx

**Current**: header uses `background: 'var(--bg-secondary)'`

**Target**: `background: 'var(--popup-bg)'`

### 2.15 SessionList.tsx -- Search highlight

**Current**: `color: 'var(--bg-primary)'`

**Target**: `color: '#1a1a1a'` (same rationale as MessageContent search highlight)

---

## Part 3: Animation System

### 3.0 Reduced Motion

All animations must be wrapped in a `prefers-reduced-motion` check:

```css
@media (prefers-reduced-motion: reduce) {
  .message-enter,
  .sidebar-animate,
  .tool-collapse {
    animation: none !important;
    transition: none !important;
  }
}
```

### 3.1 Enhanced Message Bubble Entrance

**Current** (`message-in`): `opacity 0->1, translateY 8px->0, 0.2s ease-out`

**Enhanced** -- add slight horizontal slide based on sender direction:

```css
@keyframes bubble-in-left {
  from { opacity: 0; transform: translateX(-12px) translateY(6px); }
  to   { opacity: 1; transform: translateX(0) translateY(0); }
}
@keyframes bubble-in-right {
  from { opacity: 0; transform: translateX(12px) translateY(6px); }
  to   { opacity: 1; transform: translateX(0) translateY(0); }
}
.message-enter-left {
  animation: bubble-in-left 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.message-enter-right {
  animation: bubble-in-right 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
```

- AI messages use `message-enter-left` (slide from left)
- User messages use `message-enter-right` (slide from right)
- Duration: 250ms, easing: `cubic-bezier(0.16, 1, 0.3, 1)` (spring-like deceleration)
- Only `opacity` and `transform` -- no layout-triggering properties

### 3.2 Sidebar Panel Slide

SessionPanel (middle column) show/hide should transition smoothly:

```css
.session-panel {
  transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              opacity 0.2s ease;
  overflow: hidden;
}
.session-panel.collapsed {
  width: 0 !important;
  opacity: 0;
}
```

Implementation note: Instead of display:none toggle, use width:0 + opacity:0 with overflow:hidden. The SessionPanel in AppShell.tsx should always render but have its width animated.

### 3.3 NavRail Icon Hover

Add subtle scale + glow on hover:

```css
.nav-icon-btn {
  transition: transform 0.15s ease, color 0.15s ease;
}
.nav-icon-btn:hover {
  transform: scale(1.1);
}
.nav-icon-btn:active {
  transform: scale(0.95);
}
```

Duration: 150ms. Only `transform` -- no layout impact.

### 3.4 Tool Use Card Expand/Collapse

When toggling tool output visibility, animate height smoothly:

Add to ToolUseBlock toggle output section:
```css
.tool-output-wrapper {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.2s ease;
  overflow: hidden;
}
.tool-output-wrapper.expanded {
  grid-template-rows: 1fr;
}
.tool-output-wrapper > div {
  min-height: 0;
}
```

Duration: 200ms. Uses `grid-template-rows` trick for smooth height animation without JavaScript measurement.

### 3.5 Input Focus Transition

Already partially implemented (input field has border color change). Enhance with shadow:

```css
Input field inline style addition:
  transition: 'border-color 0.2s ease, box-shadow 0.2s ease'
  On focus: boxShadow: '0 0 0 2px rgba(var(--accent-rgb), 0.15)'
```

Since CSS custom properties can't be used in rgba() directly, use a hardcoded semi-transparent accent shadow per theme:

| Theme | Focus shadow |
|-------|-------------|
| Default | `0 0 0 2px rgba(0, 122, 204, 0.15)` |
| Modern | `0 0 0 2px rgba(47, 129, 247, 0.15)` |
| Minimal | `0 0 0 2px rgba(168, 85, 247, 0.15)` |

Add CSS variable: `--input-focus-shadow`

| Variable | Default | Modern | Minimal |
|----------|---------|--------|---------|
| `--input-focus-shadow` | `0 0 0 2px rgba(0,122,204,0.15)` | `0 0 0 2px rgba(47,129,247,0.15)` | `0 0 0 2px rgba(168,85,247,0.15)` |

### 3.6 Popup Entrance Animation

All popups (SlashCommand, AtMention, CommandPalette, ContextMenu) should fade in:

```css
@keyframes popup-in {
  from { opacity: 0; transform: translateY(4px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.popup-enter {
  animation: popup-in 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}
```

Duration: 150ms. Light and fast -- popups should feel snappy, not sluggish.

---

## Acceptance Criteria

### Color Unification
- [ ] No remaining `var(--bg-primary)` in Message.tsx
- [ ] No remaining `var(--bg-secondary)` in PlanCard.tsx, PermissionCard.tsx, SearchBar.tsx, SlashCommandPopup.tsx, AtMentionPopup.tsx, MessageContextMenu.tsx, CommandPalette.tsx, ShortcutCheatsheet.tsx, OnboardingWizard.tsx, TerminalPanel.tsx
- [ ] All popup/overlay components use `var(--popup-bg)` for background
- [ ] All popup/overlay components use `var(--popup-border)` for border
- [ ] All popup/overlay components use `var(--popup-shadow)` for box-shadow
- [ ] Message hover buttons use `var(--action-btn-bg)` and `var(--action-btn-border)`
- [ ] PlanCard and PermissionCard use `var(--card-bg)` and `var(--card-border)`
- [ ] New CSS variables defined in all 3 themes (default, modern, minimal)
- [ ] Skeleton class updated to use `var(--popup-bg)`

### Animations
- [ ] AI messages slide in from left, user messages slide in from right (250ms spring easing)
- [ ] SessionPanel show/hide transitions smoothly (width + opacity, 250ms)
- [ ] NavRail icons scale up on hover (1.1x, 150ms) and scale down on click (0.95x)
- [ ] Tool use card output expand/collapse animates height (200ms, grid trick)
- [ ] Input field focus has smooth border + shadow transition (200ms)
- [ ] Popup components fade in with slight upward slide (150ms)
- [ ] `prefers-reduced-motion` disables all animations
- [ ] Virtual list scrolling performance unchanged (no layout-triggering animation properties)

### Build
- [ ] TypeScript compilation passes (main + preload + renderer)
- [ ] No unused imports or variables

---

## Implementation Checklist (for aipa-frontend)
- [ ] Add new CSS variables to `:root`, `[data-theme="modern"]`, `[data-theme="minimal"]` in globals.css
- [ ] Add new `@keyframes` and CSS classes in globals.css
- [ ] Add `prefers-reduced-motion` media query
- [ ] Update Message.tsx hover button styles
- [ ] Update PlanCard.tsx background/border
- [ ] Update PermissionCard.tsx background/border
- [ ] Update SearchBar.tsx background + input styling
- [ ] Update SlashCommandPopup.tsx surface colors
- [ ] Update AtMentionPopup.tsx surface colors
- [ ] Update MessageContextMenu.tsx surface colors
- [ ] Update CommandPalette.tsx surface colors
- [ ] Update ShortcutCheatsheet.tsx surface colors
- [ ] Update OnboardingWizard.tsx surface colors
- [ ] Update TerminalPanel.tsx header background
- [ ] Update MessageContent.tsx search highlight text color
- [ ] Update SessionList.tsx search highlight text color
- [ ] Update Skeleton class in globals.css
- [ ] Update MessageList.tsx to pass direction-aware entrance class
- [ ] Update AppShell.tsx sidebar toggle for smooth slide transition
- [ ] Update NavRail.tsx icon buttons with hover/active scale classes
- [ ] Update ToolUseBlock.tsx output section with grid height animation
- [ ] Update ChatPanel.tsx input focus shadow
