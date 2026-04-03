# PRD: WelcomeScreen.tsx Decomposition

_Version: 1 | Date: 2026-04-03 | Author: agent-leader (acting as PM)_

## Problem

`WelcomeScreen.tsx` is at 583 lines -- on the P2 MONITOR watch list. It contains multiple self-contained card sections that could be extracted into sub-components for better maintainability.

## In Scope (3 extraction targets)

### 1. Extract `WelcomeHero.tsx` — hero icon + greeting + date + subtitle

Lines 122-151 (~30 lines JSX). Pure presentational component.

Props: `greeting`, `displayName`, `activePersona`, `accentTint`.

### 2. Extract `WelcomeRecentPrompts.tsx` — recent prompts + top prompts sections

Lines 410-506 (~96 lines). Combines recent prompts and top frequent prompts into one component.

Props: `recentPrompts`, `topPrompts`, `onSuggestion`, `onClearHistory`, `onToggleFavorite`.

### 3. Extract `WelcomeQuickActions.tsx` — quick action buttons + floating action bar

Lines 508-577 (~70 lines). Two related sections: keyboard shortcut quick actions and clipboard floating actions.

Props: `quickActions`, `floatingActions`, `onFloatingAction`.

## Acceptance Criteria

- [ ] `WelcomeHero.tsx` created and used in WelcomeScreen.tsx
- [ ] `WelcomeRecentPrompts.tsx` created and used in WelcomeScreen.tsx
- [ ] `WelcomeQuickActions.tsx` created and used in WelcomeScreen.tsx
- [ ] WelcomeScreen.tsx reduced from 583 to under 450 lines
- [ ] All welcome screen functionality preserved
- [ ] `npm run build` succeeds with zero TypeScript errors

## File Impact

| File | Action |
|------|--------|
| `src/renderer/components/chat/WelcomeHero.tsx` | NEW |
| `src/renderer/components/chat/WelcomeRecentPrompts.tsx` | NEW |
| `src/renderer/components/chat/WelcomeQuickActions.tsx` | NEW |
| `src/renderer/components/chat/WelcomeScreen.tsx` | MODIFY (reduce) |
