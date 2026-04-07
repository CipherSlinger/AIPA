# PRD: Smart Quick Actions

_Version: 1.0 | Date: 2026-04-03 | Author: agent-leader (acting as PM)_

## Background

AIPA already has clipboard quick access (`Ctrl+Shift+G`) and a command palette, but users still need to fully open the app and navigate to a chat session for simple questions. As a personal AI assistant, AIPA should support rapid-fire micro-interactions: quick translations, definitions, format conversions, and calculations without interrupting the user's flow.

## In Scope (3 features)

### Feature 1: Quick Answer Popover

A lightweight floating mini-window (separate BrowserWindow, ~400x300px) that appears via `Ctrl+Shift+Q` (global hotkey). The user types a quick question, gets a streamed answer, and dismisses with Escape. The answer does NOT create a session -- it's ephemeral.

**Acceptance Criteria:**
- [x] Global hotkey `Ctrl+Shift+Q` opens a minimal floating window (always-on-top, frameless, rounded corners)
- [x] Single-line input at top, answer area below (scrollable, markdown-rendered)
- [x] Uses stream-json mode to get AI response, streams in real-time
- [x] Escape or click-outside closes the window; answer is discarded (no session created)
- [x] Copy button on the answer area to copy result to clipboard
- [x] Window remembers last position (electron-store)

### Feature 2: Smart Clipboard Pipeline

Enhance the existing `Ctrl+Shift+G` clipboard flow with a pre-processing step: when triggered, show a small popup (inside the quick answer popover or main window) with detected clipboard content type and suggested actions:

- Text detected → "Translate", "Summarize", "Fix grammar", "Explain"
- Code detected → "Explain code", "Find bugs", "Add comments"
- URL detected → "Summarize page", "Extract key points"

**Acceptance Criteria:**
- [x] When `Ctrl+Shift+G` is pressed, clipboard content is analyzed and categorized (text/code/URL heuristic)
- [x] A small action picker appears showing 3-4 contextual actions as pill buttons
- [x] Selecting an action auto-composes the prompt (e.g. "Translate the following to English: {clipboard}") and sends it
- [x] The composed message appears in the current chat session as a user message
- [x] If no session is active, creates a new one automatically

### Feature 3: StatusBar Quick Timer Enhancement

Add a Pomodoro-style quick timer to the StatusBar: click to start a 25-min focus timer, shows countdown, plays a notification sound and desktop notification when done. Integrates with the existing focus timer in statusBarConstants.

**Acceptance Criteria:**
- [x] Tomato icon in StatusBar; click opens a small dropdown with preset durations (5, 15, 25, 45 min) and custom input
- [x] Active timer shows countdown in StatusBar (mm:ss format)
- [x] Timer completion triggers desktop notification + optional sound
- [x] Timer persists across sidebar/panel toggling (lives in uiStore, not component state)
- [x] Cancel button to stop early

## Out of Scope

- Voice input for quick answer
- OCR/image clipboard processing
- Multi-step workflow triggers from clipboard
- Syncing quick answers to session history

## Technical Notes

- Quick Answer Popover requires a new BrowserWindow in main process (`src/main/`) -- keep it minimal, reuse preload
- Smart Clipboard can reuse existing `Ctrl+Shift+G` IPC handler in main process, just add a pre-step in renderer
- Timer state should live in `uiStore.ts` (add `pomodoroEndTime: number | null`, `pomodoroLabel: string`)

## File Impact Estimate

- **New files**: `QuickAnswerWindow` (main process), `QuickAnswerRenderer` (new entry or component), `ClipboardActionPicker.tsx`, `PomodoroTimer.tsx`
- **Modified**: `src/main/ipc/index.ts` (IPC for quick-answer window), `StatusBar.tsx` (timer display), `uiStore.ts` (timer state)
- **i18n**: `en.json`, `zh-CN.json` (new keys for quick actions namespace)

## Priority

P1 — Core personal assistant UX improvement
