# UI Spec: Status Bar Enhancement

_Iteration 65 | Author: aipa-ui | Date: 2026-03-26_

## Overview

Redesign the bottom status bar from a flat, cramped information row into a segmented, context-aware info panel with better visual hierarchy and interactive elements.

## Layout

Three-zone segmented layout separated by subtle vertical dividers:

```
[Left Zone] | [Center Zone] | [Right Zone]
```

### Left Zone (controls + working dir)
- Sidebar toggle button (existing)
- Folder icon + working directory name (existing, cleaned up)
- Vertical separator (1px, rgba(255,255,255,0.15))

### Center Zone (context info, flex: 1)
- Streaming status OR message count (existing, enhanced)
- Context window progress bar (existing, made wider and with label)
- Session duration indicator (NEW)

### Right Zone (metrics + controls)
- Token usage (existing, with lucide icons instead of arrows)
- Cost display (existing)
- Model badge (styled as pill)
- Terminal toggle button (existing)

## New Elements

### Session Duration
- Shows elapsed time since the first message in current session
- Format: "2m 30s" for short sessions, "1h 15m" for longer ones
- Icon: Clock (lucide) at 10px
- Only visible when messages exist

### Model Badge
- Pill shape: padding 1px 6px, border-radius 8px
- Background: rgba(255,255,255,0.15)
- Font size: 10px, font-weight 500
- Replaces the plain text model display

### Vertical Separators
- Width: 1px
- Color: rgba(255,255,255,0.15)
- Height: 14px
- Margin: 0 4px

### Enhanced Context Bar
- Width: 60px (increased from 48px)
- Height: 6px (increased from 5px)
- Label shows "Context" prefix when hovered

## Styling
- Background stays `var(--accent)` (brand-consistent)
- Height stays 24px
- Improved spacing with consistent 8px gaps within zones

## Files Changed
- `src/renderer/components/layout/StatusBar.tsx` -- Full rewrite with segmented layout
