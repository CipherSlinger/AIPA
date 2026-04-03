# PRD: Keyboard Accessibility Polish

_Author: agent-leader (acting as PM) | Date: 2026-04-03_

## Objective

Improve keyboard accessibility for power users by adding focus indicators, keyboard-driven actions, and ARIA attributes across key interactive elements.

## In Scope

### 1. Focus-Visible Outlines on All Interactive Buttons

Add `:focus-visible` outlines to header toolbar buttons, sidebar nav items, and session list action buttons. Currently many buttons only have hover states, making keyboard navigation invisible.

**Implementation**:
- In `globals.css`, add a global rule:
  ```css
  button:focus-visible, [role="radio"]:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  ```
- This provides consistent focus indicators across the entire app without per-component changes
- Ensure it doesn't conflict with custom focus styles (check InputToolbar, ModelPicker, etc.)

### 2. Escape Key Closes All Popovers

Verify that all popover/dropdown components close when Escape is pressed. Check and fix:
- Sort dropdown (SessionListHeader)
- Context detail popover (ContextIndicator)
- Model picker
- Persona picker
- Tag picker
- Notification panel

**Implementation**:
- For each popover, add a `useEffect` that listens for Escape keydown and calls the close handler
- Many may already have this — verify first, only fix those that don't

### 3. Skip-to-Content Link

Add a hidden "Skip to content" link at the top of the app that becomes visible on focus. This is a standard accessibility pattern for keyboard users to bypass the sidebar navigation.

**Implementation**:
- In `AppShell.tsx` (or the root layout), add:
  ```tsx
  <a href="#main-content" className="skip-link">Skip to content</a>
  ```
- Add `id="main-content"` to the main chat area div
- CSS: visually hidden until `:focus`, then displayed as a fixed banner at top

## Out of Scope

- Screen reader announcements for streaming state (future work)
- Full WCAG audit (this is incremental improvement)

## Acceptance Criteria

- [ ] `button:focus-visible` outline visible across all buttons
- [ ] Escape closes all popover/dropdown components
- [ ] Skip-to-content link works when Tab is pressed from page load
- [ ] No visual regression (focus ring only on keyboard focus, not mouse click)
- [ ] `npm run build` succeeds

## Files Affected

- `electron-ui/src/renderer/styles/globals.css` — focus-visible rule, skip-link styles
- `electron-ui/src/renderer/components/layout/AppShell.tsx` — skip link
- `electron-ui/src/renderer/components/sessions/SessionListHeader.tsx` — Escape handler for sort dropdown
- `electron-ui/src/renderer/components/chat/ContextIndicator.tsx` — Escape handler for popover (if missing)

**High-risk shared files**: `globals.css`
