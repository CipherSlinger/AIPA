# UI Spec: Task Queue Panel
_Date: 2026-03-27 | Designer: aipa-ui_

---

## Design Goal

Insert a queue feature entry point and queue panel between the existing MessageList and Input areas without disrupting the current Input layout. Users should clearly perceive "there are tasks queued and waiting to execute." The theme color is **violet**, which creates visual separation from the existing primary palette (zinc/neutral), making queue status identifiable at a glance.

### Design Principles Applied
- **Layer clarity**: The queue panel is a distinct visual layer sitting between conversation and input, with its own color identity (violet) so it never blends into either.
- **Progressive disclosure**: The panel only appears when there is content to show (queue non-empty), avoiding persistent chrome that wastes space.
- **Minimal disruption**: The entry button integrates into the existing toolbar pattern; the panel does not shift the input area's internal layout.

---

## Important Implementation Note: Inline Styles

> **The existing codebase (ChatPanel, StatusBar, MessageList, etc.) uses inline `style={{}}` objects and CSS variables (`var(--bg-primary)`, `var(--border)`, etc.), NOT Tailwind utility classes.** The Tailwind classes in this spec are provided as a **visual shorthand** for designers and as a reference for color/spacing values. Frontend engineers should implement using inline styles and CSS variables consistent with the existing codebase patterns.
>
> A **CSS variable mapping table** is provided at the end of this document to bridge the gap.

---

## Color System: Queue Theme (Violet)

Since the project's `tailwind.config.js` does not currently include violet tokens, these values must either be added to the config or used as literal values in inline styles.

| Token Name            | Hex Value   | Usage                                    |
|-----------------------|-------------|------------------------------------------|
| `--queue-accent`      | `#a78bfa`   | Primary queue accent (equiv. violet-400)  |
| `--queue-accent-dim`  | `#7c3aed`   | Deeper violet for backgrounds (violet-600)|
| `--queue-bg`          | `rgba(139, 92, 246, 0.10)` | Subtle violet tint for running state bg |
| `--queue-bg-hover`    | `rgba(139, 92, 246, 0.10)` | Button hover background              |
| `--queue-badge`       | `#8b5cf6`   | Badge background (violet-500)            |

These complement the existing palette:
- Neutral surface: `var(--bg-secondary)` = `#252526`
- Neutral border: `var(--border)` = `#404040`
- Text primary: `var(--text-primary)` = `#cccccc`
- Text muted: `var(--text-muted)` = `#858585`

---

## 1. Queue Entry Button

### Position

Located in the **input area's quick-action bar** (the `<div>` above the textarea that currently contains `Clear`, `@file`, `/cmd` buttons). The Queue button is placed **at the end of that row, right-aligned**, separated from the left-aligned group by flex spacer.

```
[ Clear ] [ @file ] [ /cmd ]  ................  [ + Queue (3) ]
```

Alternatively, if toolbar space is limited, it can sit as an additional button in the **send button row** (the `<div>` containing the textarea, mic button, and send button), placed immediately left of the send button.

### Visual Specification

| Property         | Value                                              |
|------------------|----------------------------------------------------|
| Icon             | `ListPlus` from lucide-react, 14px                 |
| Label            | "Queue" (always visible -- the bar has room)       |
| Font size        | 10px (matches existing toolbar buttons)            |
| Padding          | `1px 6px` (slightly wider than existing `1px 4px` to accommodate icon+text) |
| Border radius    | 3px                                                |
| Default color    | `var(--text-muted)` (#858585)                      |
| Hover color      | `#a78bfa` (violet-400)                             |
| Hover background | `rgba(139, 92, 246, 0.10)`                         |
| Transition       | `color 150ms ease, background 150ms ease`          |

### States

**Default (queue empty, input has text)**
- Color: `var(--text-muted)`
- No badge
- Clickable

**Disabled (input empty)**
- Color: `#4a4a4a` (darker than muted)
- `cursor: not-allowed`
- `opacity: 0.4`

**Active (queue non-empty)**
- Color: `#a78bfa` (violet-400) -- always violet when queue has items
- Badge visible (see below)

### Badge (Queue Count)

Appears when queue has 1+ items. Positioned relative to the button.

| Property       | Value                                    |
|----------------|------------------------------------------|
| Position       | `absolute`, `top: -6px`, `right: -6px`   |
| Size           | `width: 16px`, `height: 16px`            |
| Background     | `#8b5cf6` (violet-500)                   |
| Text color     | `#ffffff`                                |
| Font size      | 10px                                     |
| Font weight    | 600                                      |
| Border radius  | 50% (circle)                             |
| Display        | flex, center-center                      |
| Entry animation| `transform: scale(0) -> scale(1)`, 200ms, cubic-bezier(0.34, 1.56, 0.64, 1) (spring feel) |

When count exceeds 9, display "9+".

---

## 2. Queue Panel

### Position and Visibility

- **Location**: Between the MessageList area and the Input bar. Specifically, inside the ChatPanel component, rendered immediately before the `{/* Input bar */}` section.
- **Visibility rule**: Rendered only when `queue.length > 0`. When the last item is removed or completed, the panel animates out and then unmounts.
- The panel **does not** displace the MessageList -- it sits in the flex flow and the MessageList area shrinks to accommodate it.

### Panel Container

```
Layout:
+-------------------------------------------------------------+
|  Header bar (title + controls)                               |
|--------------------------------------------------------------|
|  Task row 1                                                  |
|  Task row 2                                                  |
|  Task row 3                                                  |
|  (scrollable if > max-height)                                |
+-------------------------------------------------------------+
```

| Property          | Value                                                |
|-------------------|------------------------------------------------------|
| Background        | `#1e1e1e` with `opacity: 0.97` (or `rgba(30, 30, 30, 0.97)`) |
| Backdrop filter   | `blur(8px)` (subtle, for depth when overlapping scroll content) |
| Border            | `1px solid rgba(64, 64, 64, 0.6)` (--border at 60% opacity) |
| Border radius     | 10px                                                 |
| Margin            | `0 16px 8px 16px` (horizontal margin matches input's padding) |
| Box shadow        | `0 4px 16px rgba(0, 0, 0, 0.3)`                     |
| Max height        | `208px` (13rem, approx 5 task rows)                  |
| Overflow          | `overflow-y: auto` (custom scrollbar via CSS if desired) |
| Flex shrink       | 0                                                    |

### Entry Animation (Panel Appearing)

| Property    | From       | To         | Duration | Easing   |
|-------------|------------|------------|----------|----------|
| opacity     | 0          | 1          | 200ms    | ease-out |
| translateY  | 6px        | 0          | 200ms    | ease-out |

### Exit Animation (Panel Disappearing)

| Property    | From       | To         | Duration | Easing   |
|-------------|------------|------------|----------|----------|
| opacity     | 1          | 0          | 150ms    | ease-in  |
| translateY  | 0          | 4px        | 150ms    | ease-in  |

**Implementation hint**: Use a CSS class toggle with `@keyframes` or a state-driven approach with `transition`. The component should remain mounted during exit animation (use a `isExiting` state + `onTransitionEnd` to unmount).

---

## 3. Panel Header Bar

```
+--------------------------------------------------------------+
|  =  Task Queue  (3)                      || Pause  Trash Clear|
+--------------------------------------------------------------+
```

| Property       | Value                                            |
|----------------|--------------------------------------------------|
| Layout         | `display: flex`, `align-items: center`, `justify-content: space-between` |
| Padding        | `8px 12px`                                       |
| Border bottom  | `1px solid rgba(64, 64, 64, 0.5)`                |

### Left Side

| Element       | Spec                                              |
|---------------|---------------------------------------------------|
| Icon          | `AlignJustify` (lucide-react), 14px, color `#a78bfa` |
| Title text    | "Task Queue", font-size 13px, font-weight 500, color `var(--text-primary)` (#cccccc) |
| Count         | `(3)`, font-size 11px, color `var(--text-muted)` (#858585), margin-left 6px |

### Right Side Controls

Two small text buttons, inline:

**Pause/Resume Button**

| State    | Icon           | Label    | Color                          |
|----------|----------------|----------|--------------------------------|
| Default  | `Pause` (12px) | "Pause"  | `var(--text-muted)` (#858585)  |
| Hover    | `Pause` (12px) | "Pause"  | `#fbbf24` (yellow/amber-400)   |
| Paused   | `Play` (12px)  | "Resume" | `#fbbf24` (yellow/amber-400)   |

- Font size: 11px
- Layout: `flex items-center gap-4px`
- Transition: `color 150ms ease`

**Clear Button**

| State    | Icon            | Label   | Color                          |
|----------|-----------------|---------|--------------------------------|
| Default  | `Trash2` (12px) | "Clear" | `var(--text-muted)` (#858585)  |
| Hover    | `Trash2` (12px) | "Clear" | `#f44747` (var(--error))       |

- Font size: 11px
- Margin left: 12px from Pause button
- Layout: `flex items-center gap-4px`
- Transition: `color 150ms ease`
- **Behavior**: Clears all `pending` tasks. Does NOT remove `running` or `done` tasks.
- **Confirmation**: No modal needed for v1. The action is reversible enough (user can re-type). If future versions want confirmation, add a 2-second "Undo" toast.

---

## 4. Task Row

Each task in the queue is rendered as a row inside the panel body.

```
+--------------------------------------------------------------+
|  1  * Running   Analyze src/main/index.ts for security...     |
|  2  o Pending   Write unit tests for the above file      [x] |
|  3  o Pending   Commit and push to main branch           [x] |
+--------------------------------------------------------------+
```

### Row Container

| Property       | Value                                                |
|----------------|------------------------------------------------------|
| Layout         | `display: flex`, `align-items: center`, `gap: 8px`   |
| Padding        | `6px 12px`                                           |
| Hover          | `background: rgba(255, 255, 255, 0.03)` (very subtle)|
| Transition     | `background 100ms ease`                              |
| Border bottom  | `1px solid rgba(64, 64, 64, 0.25)` (last row: none) |

### Row Elements (left to right)

#### Sequence Number
| Property    | Value                            |
|-------------|----------------------------------|
| Font size   | 11px                             |
| Color       | `#4a4a4a` (darker muted)         |
| Width       | 16px                             |
| Text align  | right                            |
| Flex shrink | 0                                |

#### Status Badge

Three variants:

**Pending**
| Property    | Value                               |
|-------------|-------------------------------------|
| Background  | `rgba(64, 64, 64, 0.6)`            |
| Text color  | `var(--text-muted)` (#858585)       |
| Font size   | 10px                                |
| Padding     | `2px 6px`                           |
| Border rad  | 3px                                 |
| Label       | "Pending"                           |
| Flex shrink | 0                                   |

**Running**
| Property    | Value                               |
|-------------|-------------------------------------|
| Background  | `rgba(139, 92, 246, 0.20)` (violet tint) |
| Text color  | `#c4b5fd` (violet-300)              |
| Font size   | 10px                                |
| Padding     | `2px 6px`                           |
| Border rad  | 3px                                 |
| Label       | "Running"                           |
| Animation   | `pulse`: opacity oscillation between 1.0 and 0.6, 1.5s ease-in-out infinite |
| Flex shrink | 0                                   |

**Done**
| Property    | Value                               |
|-------------|-------------------------------------|
| Background  | `rgba(78, 201, 176, 0.15)` (success tint, uses project's --success) |
| Text color  | `#4ec9b0` (var(--success))          |
| Font size   | 10px                                |
| Padding     | `2px 6px`                           |
| Border rad  | 3px                                 |
| Label       | "Done"                              |
| Flex shrink | 0                                   |

#### Task Content (Text)
| Property       | Value                              |
|----------------|------------------------------------|
| Font size      | 13px                               |
| Color          | `var(--text-primary)` (#cccccc)    |
| Flex           | `1 1 0`, `min-width: 0`           |
| Overflow       | `text-overflow: ellipsis`, `white-space: nowrap`, `overflow: hidden` |

#### Delete Button (Pending tasks only)

Only rendered for tasks with `status === 'pending'`. Hidden for `running` and `done`.

| Property       | Value                              |
|----------------|------------------------------------|
| Icon           | `X` from lucide-react, 14px       |
| Default state  | `opacity: 0` (invisible)          |
| Row hover      | `opacity: 1` (appears on row hover)|
| Color          | `#4a4a4a`                          |
| Hover color    | `#f44747` (var(--error))           |
| Flex shrink    | 0                                  |
| Cursor         | pointer                            |
| Transition     | `opacity 150ms ease, color 150ms ease` |
| Padding        | `2px` (clickable area)             |

**Implementation**: Use the `onMouseEnter`/`onMouseLeave` pattern on the row to toggle the delete button visibility (consistent with how existing components handle hover states with inline styles). Track a `hoveredRowId` in local state.

---

## 5. Queue Complete Notification

When all queued tasks finish executing, trigger a toast notification using the existing `addToast` pattern:

```typescript
addToast('success', `Queue complete: ${completedCount} tasks finished`)
```

The panel hides immediately (with exit animation) after the last task completes. The toast provides the user feedback.

**Rationale**: The existing toast system (`useUiStore.addToast`) is well-established in the codebase. Using it avoids adding new UI patterns and keeps the queue panel lifecycle simple (empty queue = panel unmounts).

---

## 6. Animation Specification Summary

| Interaction               | Property              | Duration | Easing                              |
|---------------------------|-----------------------|----------|-------------------------------------|
| Panel appear              | opacity + translateY  | 200ms    | ease-out                            |
| Panel disappear           | opacity + translateY  | 150ms    | ease-in                             |
| Task row hover            | background-color      | 100ms    | ease                                |
| Delete button appear      | opacity               | 150ms    | ease                                |
| Running badge pulse       | opacity (0.6 - 1.0)  | 1500ms   | ease-in-out, infinite               |
| Badge count appear        | transform (scale)     | 200ms    | cubic-bezier(0.34, 1.56, 0.64, 1)  |
| Badge count disappear     | transform (scale)     | 150ms    | ease-in                             |
| Pause/Resume icon swap    | (instant swap, no animation) | -- | --                              |

---

## 7. Keyboard Shortcuts

| Shortcut       | Action                                       |
|----------------|----------------------------------------------|
| Enter          | Send message (existing behavior, unchanged)  |
| Ctrl+Shift+Q   | Add current input to queue (same as clicking Queue button) |

The shortcut `Ctrl+Shift+Q` should be registered in the ChatPanel's existing keyboard handler pattern (the `useEffect` that handles `Ctrl+Shift+E` for export).

---

## 8. Responsive Behavior

| Window Width    | Behavior                                         |
|-----------------|--------------------------------------------------|
| >= 640px        | Full layout as specified                         |
| < 640px         | Queue button shows icon only (no "Queue" label)  |
| < 640px         | Panel header hides "Pause"/"Clear" labels, shows icons only |

---

## 9. CSS Variable Mapping for Frontend

Since the codebase uses CSS variables via inline styles, the following mapping connects this spec's visual descriptions to implementation values.

```css
/* Add to the root CSS or as inline style constants */

/* Queue-specific (new) */
--queue-accent:      #a78bfa;   /* violet-400 */
--queue-accent-deep: #8b5cf6;   /* violet-500, for badge */
--queue-accent-soft: #c4b5fd;   /* violet-300, for running label */
--queue-bg-tint:     rgba(139, 92, 246, 0.10);  /* violet hover bg */
--queue-bg-running:  rgba(139, 92, 246, 0.20);  /* running badge bg */

/* Existing (reference only, already in codebase) */
--bg-primary:   #1e1e1e;
--bg-secondary: #252526;
--bg-input:     #3c3c3c;
--border:       #404040;
--text-primary: #cccccc;
--text-muted:   #858585;
--text-bright:  #ffffff;
--accent:       #007acc;
--success:      #4ec9b0;
--warning:      #d7ba7d;
--error:        #f44747;
```

### Icon Reference (all from lucide-react)

| Icon Name      | Usage                          | Size |
|----------------|--------------------------------|------|
| `ListPlus`     | Queue entry button             | 14px |
| `AlignJustify` | Panel header icon              | 14px |
| `Pause`        | Pause queue                    | 12px |
| `Play`         | Resume queue                   | 12px |
| `Trash2`       | Clear queue                    | 12px |
| `X`            | Delete individual task         | 14px |
| `CheckCircle`  | Queue complete toast (if used) | 14px |

---

## 10. Component Structure Recommendation

```
ChatPanel.tsx
  |-- MessageList
  |-- ThinkingIndicator
  |-- TaskQueuePanel (NEW)          <-- Insert here
  |     |-- TaskQueueHeader
  |     |     |-- Title + Count
  |     |     +-- PauseButton + ClearButton
  |     +-- TaskQueueList
  |           +-- TaskQueueRow (repeated)
  |                 |-- SequenceNumber
  |                 |-- StatusBadge
  |                 |-- TaskContent
  |                 +-- DeleteButton (conditional)
  +-- InputBar (existing)
```

The `TaskQueuePanel` component receives queue state from a new Zustand store slice (`useQueueStore`) or as part of the existing `useChatStore`. It should be a self-contained component in a new file:

```
src/renderer/components/chat/TaskQueuePanel.tsx
```

---

## 11. Accessibility Notes

- The Queue button should have `aria-label="Add to task queue"` and `aria-describedby` pointing to a count when badge is visible.
- Task rows should be in a `role="list"` container with `role="listitem"` on each row.
- The delete button needs `aria-label="Remove task: [task content preview]"`.
- The pause/resume toggle needs `aria-pressed` state.
- Focus management: After adding to queue, focus should return to the textarea (input stays clear for next task).

---

## Implementation Checklist (for aipa-frontend)

- [ ] Color values match spec (violet-400 `#a78bfa` as queue accent, no magic hex values)
- [ ] Panel appears/disappears with animation, not instant show/hide
- [ ] Running status badge has pulse animation (opacity oscillation, 1.5s)
- [ ] Only `pending` tasks show the delete button; `running`/`done` tasks do not
- [ ] Queue panel is completely hidden (no DOM or no layout space) when queue is empty
- [ ] Badge count appears on the Queue button when queue has 1+ items
- [ ] Pause state toggles button icon between `Pause` and `Play`
- [ ] Pause state toggles button label between "Pause" and "Resume"
- [ ] Queue complete triggers a toast via existing `addToast('success', ...)` pattern
- [ ] Panel uses inline styles + CSS variables consistent with existing ChatPanel code
- [ ] `Ctrl+Shift+Q` keyboard shortcut works for adding to queue
- [ ] Task content text truncates with ellipsis (does not wrap or overflow)
- [ ] Panel max-height is enforced; excess tasks scroll within the panel

---

## Design Decision Log

| Decision | Rationale |
|----------|-----------|
| Violet as queue theme color | Needs clear visual distinction from the main UI (zinc/neutral) and the accent color (blue #007acc). Violet sits between blue and red on the spectrum, is not used elsewhere in the palette, and carries a "pending/queued" connotation without implying success/error/warning. |
| Panel between MessageList and Input | This is the natural "staging area" position -- content flows down from conversation, tasks stage in the middle, input sits at the bottom. Avoids covering messages or creating a floating overlay that competes with popups (AtMention, SlashCommand). |
| Toast for completion (not inline message) | The existing toast system is well-established. An inline completion message would require the panel to stay mounted after its content is cleared, adding lifecycle complexity for minimal UX benefit. |
| Inline styles over Tailwind classes | Maintaining consistency with the existing codebase is more important than using Tailwind. Every existing component in the renderer uses `style={{}}` objects. Introducing Tailwind classes in one component would create an inconsistent pattern. |
| No drag-and-drop reorder in v1 | PRD marks this as P2. The panel layout and task row structure are designed to accommodate drag handles in a future iteration (the sequence number column can become a drag handle). |
