# UI Spec: Welcome Screen Visual Redesign

_Date: 2026-03-26 | Author: aipa-ui | Iteration 69_

## Overview

Redesign the WelcomeScreen (empty state shown before first message in every session) from a plain emoji-based layout into a polished, modern hero that matches the WeChat-style UI established across the application.

## Current Problems

1. Raw emoji icons (robot, bug, sparkles, memo) for hero and suggestion cards
2. Suggestion cards have plain styling with no visual hierarchy
3. Keyboard shortcuts section is cramped and unstyled
4. Quick action buttons are too subtle
5. Hero robot emoji doesn't match the refined Bot icon used elsewhere

## Design Specifications

### Hero Section
- Replace robot emoji with `Bot` lucide icon inside an 80px circular container
- Circle: `background: rgba(0,122,204,0.1)`, same style as onboarding icon circles
- Bot icon: 48px, color `var(--accent)`, strokeWidth 1.5
- Title: "Hello! I'm AIPA" -- 28px, weight 700, letter-spacing -0.02em, color `--text-bright`
- Subtitle: 14px, `--text-muted`, max-width 360px, centered

### Suggestion Cards
- Replace emoji with lucide icons: FolderSearch (Analyze), Bug (Find bug), Sparkles (New feature), FileCode2 (Write script)
- Each icon: 24px, color `var(--accent)` inside a 44px circular container with `rgba(0,122,204,0.08)` background
- Card: `background: var(--card-bg)`, `border: 1px solid var(--card-border)`, `borderRadius: 12px`
- Card padding: `20px 16px`, min-width 130px, max-width 150px
- Text: 13px, centered below icon, color `--text-primary`
- Hover: border color transitions to `var(--accent)`, background to `var(--action-btn-hover)`
- Add subtle hover scale transform (1.03)

### Keyboard Shortcuts
- Wrap in a rounded container with `var(--card-bg)` background
- Organized as a 2x3 grid
- kbd element: `background: var(--popup-bg)`, `border: 1px solid var(--popup-border)`, padding 2px 8px, border-radius 4px, font 10px monospace
- Separator line above shortcuts section

### Quick Action Buttons
- Slightly larger: padding `5px 14px`, font 12px
- Border-radius: `6px`
- Add lucide icons: Settings, Terminal, FolderOpen, Keyboard (small, 12px, before label)

## Files to Modify
1. `src/renderer/components/chat/ChatPanel.tsx` -- WelcomeScreen function rewrite

## Acceptance Criteria
- [ ] Robot emoji replaced with Bot icon in styled circle
- [ ] Suggestion cards use lucide icons in circular containers
- [ ] Cards have card-bg/card-border CSS variable styling
- [ ] Card hover shows accent border + subtle scale
- [ ] Keyboard shortcuts in 2x3 grid with styled kbd elements
- [ ] Quick action buttons have lucide icons
- [ ] Build passes with zero errors
