# UI Spec: Thinking Indicator Bubble
_Iteration 58 | Designer: aipa-ui | Date: 2026-03-26_

## Design Goal

Redesign the thinking/typing indicator to match the WeChat-style bubble layout. Instead of floating dots at the bottom of the message area, render a mini AI bubble with avatar, animated dots, and activity label -- visually consistent with assistant message bubbles.

---

## Layout

```
[Bot Avatar 28px]  [Bubble: ... Thinking]
```

The indicator appears left-aligned in the message area, matching assistant bubble alignment. It replaces the current flat dot + label layout with a proper mini-bubble.

## Bubble Design

### Container
- Left-aligned, same as assistant bubbles
- `margin-left: 16px` (matches message padding)
- Avatar: 28px (slightly smaller than message avatar 36px)
- Gap between avatar and bubble: 8px
- Bottom padding: 8px

### Mini Bubble
- Background: `var(--bubble-ai-bg)` (same as assistant bubbles)
- Border-radius: `2px 12px 12px 12px` (matching assistant bubble shape -- small top-left)
- Padding: `8px 14px`
- Min-width: 80px
- Max-width: 200px
- Entrance animation: `bubble-in-left 0.25s ease` (reuse existing animation)

### Animated Dots
- 3 dots in a row, 5px diameter each
- Color: `var(--accent)`
- Animation: wave bounce (translateY) instead of pulse
- Each dot offset by 0.15s
- `@keyframes dot-wave`: `0%,60%,100% { transform: translateY(0) }` `30% { transform: translateY(-4px) }`

### Activity Label
- Text: "Thinking..." / "Writing..." / "Running command..." etc. (keep existing logic)
- Font-size: 11px
- Color: `var(--text-muted)`
- Appears to the right of dots, separated by 6px gap

### Elapsed Timer
- Small elapsed time counter below the dots/label row
- Font-size: 10px, color: `var(--text-muted)`, opacity: 0.7
- Format: "0s", "5s", "12s", etc.
- Updates every second

## CSS Additions

```css
@keyframes dot-wave {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-4px); }
}
```

## Accessibility

- `aria-live="polite"` on the container so screen readers announce activity changes
- `aria-label` with current activity description

## Acceptance Criteria

- [ ] Thinking indicator renders as a left-aligned mini bubble with AI avatar
- [ ] Bubble uses same background and border-radius as assistant message bubbles
- [ ] 3 dots animate with wave bounce pattern
- [ ] Activity label shows contextual text (Thinking/Writing/Running command/etc.)
- [ ] Elapsed timer counts seconds while indicator is visible
- [ ] Entrance animation uses existing bubble-in-left
- [ ] `aria-live="polite"` for accessibility
- [ ] Build passes with zero errors
