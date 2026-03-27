# UI Spec: Message Context Menu

**Date**: 2026-03-26
**PRD**: `prd-message-context-menu-v1.md`

## Component: MessageContextMenu

### Visual Design

```
+----------------------------------+
| Copy Text            Ctrl+C      |
|----------------------------------|
| 👍 Rate Up                       |
| 👎 Rate Down                     |
|----------------------------------|
| ↩ Rewind to Here                 |
+----------------------------------+
```

### Dimensions & Positioning

- Width: 200px
- Max height: auto (content-driven)
- Border radius: 6px
- Background: `var(--bg-secondary)`
- Border: `1px solid var(--border)`
- Box shadow: `0 8px 24px rgba(0, 0, 0, 0.4)`
- Z-index: 100 (above all chat content)
- Position: fixed, at cursor (x, y) with viewport clamping

### Menu Item Styling

- Padding: `6px 12px`
- Font size: 12px
- Color: `var(--text-primary)`
- Hover background: `var(--bg-hover)`
- Separator: `1px solid var(--border)` with `margin: 4px 0`
- Shortcut text: `var(--text-muted)`, right-aligned, font-size 11px

### Behavior

1. **Trigger**: `onContextMenu` on the message row div
2. **Positioning**: Place at `(clientX, clientY)`, then clamp so menu doesn't overflow viewport
3. **Dismiss**: Click outside (via document click listener), Escape key, or selecting an action
4. **Animation**: None (instant show/hide for context menus)

### Conditional Items

| Message Role | Items Shown |
|-------------|-------------|
| user | Copy Text |
| assistant | Copy Text, Rate Up, Rate Down, Rewind to Here |
| permission | (no context menu) |
| plan | (no context menu) |

### Rating State

- Rate Up item shows checkmark when `rating === 'up'`
- Rate Down item shows checkmark when `rating === 'down'`
- Clicking an active rating toggles it off (sets to null)

### Integration with Existing Hover Buttons

- Keep the Copy button on hover for assistant messages (quick access)
- Remove Rate Up/Down buttons from hover overlay
- Remove Rewind button from hover overlay
- This declutters the hover state significantly

## Changes to Message.tsx

1. Add `onContextMenu` handler to root div
2. Render `MessageContextMenu` as a portal (appended to document.body)
3. Remove rate buttons from hover overlay
4. Remove rewind button from hover overlay
5. Keep copy button on hover

## New Component: MessageContextMenu.tsx

Location: `src/renderer/components/chat/MessageContextMenu.tsx`

Props:
```typescript
interface ContextMenuProps {
  x: number
  y: number
  message: ChatMessage
  onCopy: () => void
  onRate?: (rating: 'up' | 'down' | null) => void
  onRewind?: () => void
  onClose: () => void
}
```
