# UI Spec: Onboarding Wizard Visual Redesign

_Date: 2026-03-26 | Author: aipa-ui | Iteration 68_

## Overview

Redesign the OnboardingWizard from a plain, emoji-heavy card into a modern, polished first-run experience that matches the WeChat-style visual language established in Iterations 53-67.

## Current Problems

1. Raw emoji icons (robot, folder, checkmark) look amateurish
2. Step dots are plain circles with no animation
3. No entrance/exit animations between steps
4. Card styling is functional but doesn't match the polished popup/card system
5. Buttons don't match the refined button styles used elsewhere
6. No visual branding -- the welcome screen should make a strong first impression

## Design Specifications

### Card Container
- Background: `var(--popup-bg)` (already used, keep)
- Border: `1px solid var(--popup-border)` (upgrade from `--border`)
- Shadow: `var(--popup-shadow)` + additional outer glow `0 0 80px rgba(0,122,204,0.08)`
- Border radius: `16px` (from 12px)
- Max width: `520px` (from 480px)
- Padding: `48px 40px 36px` (from `40px 36px 32px`)
- Entrance animation: `popup-in` (reuse existing)

### Step Progress Bar (replacing dots)
- Replace 4 dots with a segmented progress bar
- Bar container: `width: 200px`, `height: 4px`, `borderRadius: 2px`, `background: var(--border)`
- Active segment fills from left with `var(--accent)`, animated width transition `0.4s cubic-bezier(0.4, 0, 0.2, 1)`
- Below bar: step label text in `--text-muted`, 11px, showing "Step N of 4"

### Step Icons (replacing emoji)
- Step 1 (Welcome): `Sparkles` icon from lucide-react, 48px, color `var(--accent)`
- Step 2 (API Key): `Key` icon, 48px, color `var(--accent)`
- Step 3 (Work Folder): `FolderOpen` icon, 48px, color `var(--accent)`
- Step 4 (Done): `CheckCircle2` icon, 48px, color `var(--success)`
- Icon container: 80px circle with `rgba(0,122,204,0.1)` background
- Icon entrance: scale from 0.8 to 1.0, opacity 0 to 1, `0.3s ease-out`

### Typography
- Title: `24px`, weight `700` (from 600), letter-spacing `-0.02em`
- Subtitle/explanation: `14px`, line-height `1.7`, max-width `360px`

### Buttons
- Primary: height `42px`, border-radius `8px`, font-weight `600`, min-width `140px`
- Primary hover: slight scale `1.02` + brightness filter
- Secondary: same height, ghost style with `var(--popup-border)` border
- Skip link: `11px`, underline on hover, positioned at card bottom

### Step Transitions
- Content between steps uses a simple `fadeIn` transition
- New CSS keyframe: `@keyframes onboard-fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`
- Duration: `0.3s ease-out`
- Applied to `.onboard-step-content` wrapper

### Input Field (API Key step)
- Use `var(--input-field-bg)` background
- Border: `var(--input-field-border)`, focus: `var(--input-field-focus)` with `var(--input-focus-shadow)`
- Border radius: `8px`
- Height: `42px`
- Font: monospace, 13px

### Folder Display (Step 3)
- Replace emoji folder with `Folder` lucide icon, 18px, color `var(--accent)`
- Background: `var(--input-field-bg)`
- Border radius: `8px`

### Overlay
- Keep `rgba(0,0,0,0.85)` backdrop
- Add subtle radial gradient center glow: `radial-gradient(ellipse at center, rgba(0,122,204,0.05) 0%, transparent 70%)`

## CSS Variables Used (all existing, no new ones needed)
- `--popup-bg`, `--popup-border`, `--popup-shadow`
- `--accent`, `--success`
- `--input-field-bg`, `--input-field-border`, `--input-field-focus`, `--input-focus-shadow`
- `--text-bright`, `--text-muted`, `--text-primary`
- `--border`

## New CSS (globals.css)
- `@keyframes onboard-fade-in` -- step content fade+slide
- Add to `prefers-reduced-motion` disable list

## Files to Modify
1. `src/renderer/components/onboarding/OnboardingWizard.tsx` -- full visual overhaul
2. `src/renderer/styles/globals.css` -- add `onboard-fade-in` keyframe

## Acceptance Criteria
- [ ] Emoji icons replaced with lucide-react icons in 80px circular containers
- [ ] Step dots replaced with animated progress bar + "Step N of 4" label
- [ ] Step transitions use fade-in animation
- [ ] Card uses popup styling system (border, shadow, radius)
- [ ] API key input uses input-field CSS variable system
- [ ] Primary buttons 42px height with hover scale effect
- [ ] Overlay has subtle radial gradient accent glow
- [ ] Skip link styled as subtle underline text
- [ ] Respects prefers-reduced-motion
- [ ] Build passes with zero errors
