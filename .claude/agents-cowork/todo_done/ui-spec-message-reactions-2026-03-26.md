# UI Spec: Message Reactions (Emoji Quick-React)

_Iteration 63 | Author: aipa-ui | Date: 2026-03-26_

## Overview

Add hover-triggered emoji quick-reaction buttons to message bubbles, mimicking WeChat/Slack-style message reactions. When a user hovers over any message bubble, a small floating reaction toolbar appears. Clicking an emoji adds a visible reaction badge below the bubble.

## Design Tokens (CSS Variables)

Add to all three themes in `globals.css`:

```css
/* Reaction system */
--reaction-bar-bg:        rgba(0,0,0,0.75);
--reaction-bar-border:    rgba(255,255,255,0.08);
--reaction-bar-shadow:    0 2px 8px rgba(0,0,0,0.3);
--reaction-badge-bg:      rgba(255,255,255,0.08);
--reaction-badge-border:  rgba(255,255,255,0.12);
--reaction-badge-active:  rgba(0,122,204,0.2);
--reaction-badge-active-border: rgba(0,122,204,0.4);
```

## Reaction Toolbar

### Appearance
- **Container**: Pill-shaped bar, height 32px, padding 4px 6px, border-radius 16px
- **Background**: `var(--reaction-bar-bg)` (dark frosted glass effect)
- **Border**: 1px solid `var(--reaction-bar-border)`
- **Shadow**: `var(--reaction-bar-shadow)`
- **Position**: Floating above the bubble, offset 4px above the top edge
  - AI bubbles (left-aligned): toolbar anchored to top-right of bubble
  - User bubbles (right-aligned): toolbar anchored to top-left of bubble
- **z-index**: 10 (above bubble but below popups/modals)

### Emoji Buttons
- **Emojis**: Five buttons using native Unicode emoji:
  - `+1` (thumbs up)
  - `heart` (red heart)
  - `laughing` (laughing face)
  - `surprised` (surprised face)
  - `thinking` (thinking face)
- **Button size**: 26px x 26px, border-radius 50%, centered emoji
- **Font size**: 15px for the emoji character
- **Hover**: background `rgba(255,255,255,0.15)`, scale(1.15) transform, 120ms transition
- **Active/pressed**: scale(0.95), 60ms

### Animation
- Entry: Use existing `popup-in` keyframe (0.15s cubic-bezier)
- Exit: Immediate (no exit animation to avoid flicker)

### Behavior
- Appears after 200ms hover delay (not instant, to avoid accidental triggers)
- Disappears when mouse leaves the message row (including toolbar area)
- The toolbar is part of the message's hover zone (hovering the toolbar keeps it visible)

## Reaction Badges

### Appearance
- **Container row**: flex row, gap 4px, margin-top 4px (below the bubble, above hover action buttons)
- **Badge shape**: Pill, height 22px, padding 2px 8px, border-radius 11px
- **Background**: `var(--reaction-badge-bg)` normally; `var(--reaction-badge-active)` when the current user has reacted
- **Border**: 1px solid `var(--reaction-badge-border)` normally; `var(--reaction-badge-active-border)` when active
- **Content**: emoji (13px) + count (11px, `var(--text-primary)`)
- **Spacing**: 3px gap between emoji and count
- **Hover**: slightly brighter background, cursor pointer (clicking toggles)
- **Animation**: `popup-in` on first appearance

### Behavior
- Clicking a badge toggles the reaction (add/remove)
- Clicking a toolbar emoji that already has a badge increments/toggles it
- Badge row is always visible (not just on hover) once reactions exist
- Reaction counts only go to "1" in this implementation (single-user desktop app)

## State Management

### Zustand Store Addition

Add to `ChatState` interface:
```typescript
reactions: Record<string, string[]>  // messageId -> array of emoji strings
toggleReaction: (msgId: string, emoji: string) => void
```

- `reactions` maps message ID to an array of active emoji strings (e.g., `["thumbsup", "heart"]`)
- `toggleReaction` adds or removes an emoji from a message's reaction array
- Reactions are in-memory only, not persisted across sessions

## Component Changes

### Message.tsx
1. Import `useChatStore` for `reactions` and `toggleReaction`
2. Add `reactionToolbarVisible` state with 200ms setTimeout (like NavRail tooltips)
3. Render reaction toolbar when hovered (above bubble, positioned per user/AI alignment)
4. Render reaction badge row below bubble (persistent once reactions exist)
5. Update React.memo comparison to include reactions

### globals.css
- Add reaction CSS variables to all three themes (default, modern, minimal)

## Accessibility
- Reaction toolbar has `role="toolbar"` and `aria-label="Message reactions"`
- Each emoji button has `aria-label` (e.g., "React with thumbs up")
- Badge row has `aria-label="Reactions"` with each badge being a button

## Responsive Behavior
- `prefers-reduced-motion`: disable popup-in animation and scale transforms on hover
- Compact mode: toolbar height 28px, emoji size 13px, badge height 20px
