# PRD: Fix User Bubble Background Color
_Version: v1 | Status: Approved | PM: aipa-pm | Date: 2026-03-27_

## One-line Definition
Lighten the user message bubble background color in dark theme to improve text readability.

## Background & Motivation
- Direct user feedback (feedback.md): "对话框我的输入背景泡泡颜色太深，显得文字很难看清" (User bubble background too dark, text hard to read)
- Current dark theme bubble: `#264f78` (dark navy) with `#e8e8e8` text
- The dark background combined with not-quite-white text creates poor contrast, especially on lower-quality displays
- This is a P0 UX fix -- text readability is a fundamental usability requirement

## Target User
All AIPA users in dark theme (the default theme).

## User Story
As an AIPA user,
I want my own message bubbles to have a readable, comfortable background color,
so that I can easily scan the conversation without straining my eyes.

## Scope

### In Scope (This Version)
- Adjust `--bubble-user` to a lighter, more readable blue
- Adjust `--bubble-user-text` to pure white for maximum contrast
- Adjust `--bubble-user-border` to complement the new background
- Ensure the change looks good in dark theme

### Out of Scope
- Light theme changes (already uses `#2563eb` with white text, which has good contrast)
- AI bubble color changes (not reported as an issue)
- Message bubble layout/shape changes

## Detailed Changes

### 1. Dark Theme User Bubble Color Adjustment
**Description**: Change the user bubble from dark navy (#264f78) to a medium blue that provides better contrast with white text while maintaining the WeChat-style aesthetic.
**Color Direction**:
- Background: Shift from `#264f78` to a lighter blue around `#3572a5` or `#3b7dd8` -- brighter but not as vivid as the light theme's `#2563eb`
- Text: Change from `#e8e8e8` to `#ffffff` for maximum readability
- Border: Adjust to complement the new background (slightly darker shade)

**Acceptance Criteria**:
- [ ] User bubble text is easily readable on the new background
- [ ] The color feels natural in the dark theme (not too bright/jarring)
- [ ] Light theme bubbles are unchanged
- [ ] WCAG AA contrast ratio (4.5:1) met between text and background
- [ ] Build passes with zero errors

## Non-Functional Requirements
- **Accessibility**: Must meet WCAG AA contrast ratio for text readability
- **Compatibility**: No impact on other themes

## Success Metrics
- User feedback resolved -- text clearly readable in dark theme user bubbles

## Priority
- **P0**: Direct user complaint about basic readability

## Dependencies & Risks
| Dependency | Owner | Risk Level |
|-----------|-------|-----------|
| None | Engineering | Low -- pure CSS variable change |

## Open Questions
- None -- straightforward color adjustment
