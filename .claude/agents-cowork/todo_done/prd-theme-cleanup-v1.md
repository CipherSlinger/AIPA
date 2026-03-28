# PRD: Theme Cleanup -- Keep Only Dark and Light

**Author**: agent-leader (from user feedback)
**Date**: 2026-03-27
**Priority**: P2
**Status**: Ready for Development

---

## Problem Statement

User requests: "Only keep Dark and Light themes, remove others."

Currently 4 themes exist:
- `vscode` (VS Code Dark) -- **KEEP as "Dark"**
- `modern` (Modern Dark) -- REMOVE
- `minimal` (Minimal Dark) -- REMOVE
- `light` (Light) -- **KEEP as "Light"**

## Requirements

### R1: Remove Modern and Minimal themes from Settings UI
In `SettingsPanel.tsx`, remove the `modern` and `minimal` entries from the `THEMES` array.

### R2: Rename remaining themes
- `vscode` -> label "Dark" (keep id as `vscode` for backward compat)
- `light` -> label "Light" (keep id as `light`)

### R3: Remove CSS theme blocks
Remove the `[data-theme="modern"]` and `[data-theme="minimal"]` CSS blocks from `globals.css`.

### R4: Handle existing users with removed themes
If a user's saved preference is `modern` or `minimal`, fall back to `vscode` (Dark).

### R5: Update TypeScript types
Change theme type from `'vscode' | 'modern' | 'minimal' | 'light'` to `'vscode' | 'light'` in `app.types.ts`.

### R6: i18n
Add i18n keys for "Dark" and "Light" theme labels.

## Acceptance Criteria

- [ ] Settings panel shows only 2 themes: Dark and Light
- [ ] Selecting Dark applies `:root` (vscode) styles
- [ ] Selecting Light applies `[data-theme="light"]` styles
- [ ] Users with previously saved `modern`/`minimal` themes get migrated to Dark
- [ ] CSS file is significantly smaller (removed ~170 lines of theme definitions)
- [ ] TypeScript types updated
- [ ] Build passes with zero errors
