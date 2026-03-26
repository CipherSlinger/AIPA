# PRD: Command Palette

**Version**: v1
**Priority**: P1
**Author**: aipa-pm
**Date**: 2026-03-26
**Status**: Ready for Design

---

## 1. Problem Statement

AIPA has many features spread across multiple UI areas (sidebar tabs, toolbar buttons, menu items, slash commands). Power users need a fast way to access any action without navigating the UI. The command palette is the standard solution -- a fuzzy-search modal that appears with `Ctrl+Shift+P` and provides instant access to all available actions.

The main process already sends a `menu:commandPalette` event on `Ctrl+Shift+P`, but no renderer component exists to handle it.

## 2. Target Users

- **Power users** who want keyboard-driven workflows
- **All users** who want to discover available features without exploring the UI

## 3. Solution Overview

Create a `CommandPalette` component -- a modal overlay with a search input that filters a list of available commands. Selecting a command executes it immediately.

## 4. Functional Requirements

### FR-1: Trigger
- `Ctrl+Shift+P` opens the palette (via existing `menu:commandPalette` event)
- Pressing `Escape` or clicking outside closes it
- If already open, `Ctrl+Shift+P` closes it (toggle)

### FR-2: Command Registry
The palette aggregates commands from multiple sources:

**Built-in Actions:**
| Command | Action |
|---------|--------|
| New Conversation | Clear messages, end current session |
| Export Conversation | Trigger export flow (same as toolbar button) |
| Toggle Sidebar | Open/close sidebar |
| Toggle Terminal | Open/close terminal panel |
| Open Settings | Switch sidebar to settings tab |
| Open Session History | Switch sidebar to history tab |
| Change Working Directory | Open folder dialog |
| Toggle Speech Input | Start/stop voice recognition |

**Slash Commands:**
- All built-in slash commands (`/compact`, `/clear`, `/help`, etc.)
- Custom commands from `.claude/commands/` directories

### FR-3: Fuzzy Search
- Text input at the top of the palette
- Filter commands by name AND description (case-insensitive substring match)
- Show all commands when search is empty
- Highlight matching portions in results (optional, can be deferred)

### FR-4: Keyboard Navigation
- `ArrowUp`/`ArrowDown` to move selection
- `Enter` to execute selected command
- `Escape` to close
- Auto-scroll to keep selected item visible

### FR-5: Command Execution
- After selecting a command, the palette closes and the command executes
- For slash commands: insert into chat and send
- For UI actions: execute directly

### FR-6: Visual Design
- Modal overlay with backdrop (semi-transparent dark)
- Centered at the top-center of the window (not fully centered -- biased toward top like VS Code)
- Width: 500px max, responsive
- Max height: 400px with scroll
- Each command shows: name (bold) + description (muted)
- Selected item highlighted with accent background

## 5. Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|--------------|
| AC-1 | Ctrl+Shift+P opens the palette | Keyboard test |
| AC-2 | Palette lists all built-in actions | Visual inspection |
| AC-3 | Typing filters commands by name/description | Functional test |
| AC-4 | Arrow keys navigate, Enter executes | Keyboard test |
| AC-5 | Escape closes the palette | Keyboard test |
| AC-6 | Executing "New Conversation" clears chat | Functional test |
| AC-7 | Executing "Export Conversation" opens save dialog | Functional test |
| AC-8 | Executing "Toggle Sidebar" toggles sidebar | Functional test |
| AC-9 | Clicking outside the palette closes it | Functional test |
| AC-10 | Build succeeds | Build verification |

## 6. Technical Notes

- **Existing event**: Main process sends `menu:commandPalette` via `mainWindow.webContents.send('menu:commandPalette')` on `Ctrl+Shift+P`
- **Listener registration**: Use `window.electronAPI.onMenuEvent('commandPalette', callback)` in `App.tsx`
- **State**: Add `commandPaletteOpen: boolean` to `useUiStore`
- **Component file**: `electron-ui/src/renderer/components/shared/CommandPalette.tsx`
- **No new dependencies needed**

## 7. Out of Scope

- Recently-used commands ranking
- Custom keybindings for individual commands
- File search within the palette (separate feature)
