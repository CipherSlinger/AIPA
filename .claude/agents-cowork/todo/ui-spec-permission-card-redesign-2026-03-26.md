# UI Spec: Permission Card Visual Upgrade

_Date: 2026-03-26 | Iteration 70_

## Overview

Redesign PermissionCard from a plain text card into a graphical authorization interface with tool-specific icons, animated pending glow border, and improved visual hierarchy.

## Design Specification

### Tool-Specific Icons

Each tool type gets its own lucide-react icon in a 44px circular container with rgba tint:

| Tool | Icon | Tint Color |
|------|------|------------|
| Bash / computer | Terminal | rgba(78,201,176,0.15) success green |
| Write / create_file | FilePlus | rgba(0,122,204,0.15) accent blue |
| Edit / str_replace_editor / MultiEdit | FileEdit | rgba(215,186,125,0.15) warning amber |
| Read / read_file | FileSearch | rgba(133,133,133,0.15) muted gray |
| Glob / LS | FolderSearch | rgba(133,133,133,0.15) |
| Grep | Search | rgba(133,133,133,0.15) |
| WebFetch / web_fetch | Globe | rgba(90,63,138,0.15) purple |
| WebSearch | Globe | rgba(90,63,138,0.15) |
| Default | ShieldCheck | rgba(0,122,204,0.15) |

### Layout

- Card max-width: 420px, centered in message flow
- Border-radius: 12px
- Padding: 16px 18px
- Header: horizontal flex with 44px icon circle + title column
- Detail block: 12px monospace, action-btn-bg background, border-radius 6px
- Buttons: 36px height, border-radius 8px, font-weight 600

### Pending State Animation

- Card border: 2px solid var(--accent) with animated glow
- CSS keyframe permission-glow: box-shadow pulses 0 0 0 0 rgba(0,122,204,0.4) to 0 0 0 6px rgba(0,122,204,0) over 2s infinite
- Allow button: filled accent, hover scale(1.02) + brightness(1.1)
- Deny button: transparent with border, hover var(--popup-item-hover)

### Resolved State

- Card border: 1px solid var(--card-border)
- Icon circle opacity: 0.6
- Result: pill-shaped badge with Check (green) or X (red)
- Buttons hidden

### Acceptance Criteria

- [ ] Tool-specific icon in 44px circle with rgba tint
- [ ] Card max-width 420px, centered, border-radius 12px
- [ ] Pending state has animated glow (permission-glow keyframe)
- [ ] Allow button: filled accent, 36px height, hover scale
- [ ] Deny button: transparent with border, 36px height
- [ ] Resolved state shows pill badge
- [ ] Card uses popup-in entrance animation
- [ ] permission-glow in prefers-reduced-motion disable list
- [ ] Build passes with zero errors
