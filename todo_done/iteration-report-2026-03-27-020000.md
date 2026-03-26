# Iteration Report: Resize Bug Fix, Visual Polish, README Update

**Date**: 2026-03-27 02:00
**Iteration**: 13
**Status**: COMPLETE
**Build**: PASS (Vite)

## Changes

### Bug Fix
- `electron-ui/src/renderer/components/layout/AppShell.tsx`
  - **Fixed stale closure bug** in resize handler: `onUp` previously captured `sidebarWidth`/`terminalWidth` from the closure at drag start, so the persisted width was always the initial width, not the final width after dragging. Now computes final width from mouse position in the `onUp` handler.
  - Added hover effect on resize handles: handles highlight with accent color on hover, providing visual affordance that they are interactive.

### UX Polish
- Updated README.md and README_CN.md:
  - Added keyboard shortcuts to feature list
  - Added active session indicator to session history description

## Files Modified
- `electron-ui/src/renderer/components/layout/AppShell.tsx` (bug fix + visual)
- `README.md` (feature list update)
- `README_CN.md` (feature list update)
