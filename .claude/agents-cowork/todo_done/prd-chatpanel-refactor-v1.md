# PRD: ChatPanel.tsx Decomposition Refactor

**Author**: aipa-pm (via agent-leader)
**Date**: 2026-03-27
**Priority**: P1 (Engineering Quality)
**Status**: Ready for Development
**Iteration**: 111

---

## Problem Statement

`ChatPanel.tsx` is 1587 lines -- the largest file in the codebase and the central hub of the entire user experience. It contains at least 15 state variables, 10+ useEffect hooks, and mixes multiple unrelated concerns: search, bookmarks, statistics, drag-and-drop, speech recognition, input history, streaming timer, zoom controls, toolbar UI, file attachments, and the core chat input/send logic.

This creates several problems:
1. **Maintainability**: Any feature change risks breaking unrelated functionality
2. **Performance**: The entire component re-renders when any of its many state variables change
3. **Readability**: New contributors (or future iterations) must understand 1587 lines of context to make any change
4. **Bug surface**: React error #185 (infinite re-render) was caused by complex state interactions that are harder to track in a monolithic component

## Approach

Extract logically independent sections of ChatPanel into separate components and custom hooks. The ChatPanel should become a **thin orchestrator** that composes extracted pieces.

## Requirements

### R1: Extract ChatHeader component

Extract the toolbar/header bar (session title, action buttons, bookmarks dropdown, stats panel, focus mode toggle, new session button, search toggle, export button, streaming spinner + elapsed timer) into `ChatHeader.tsx`.

**Props interface**: sessionTitle, isStreaming, elapsedStr, onSearch, onExport, onNewSession, onToggleFocus, focusMode, bookmarkedMessages, conversationStats, onScrollToMessage, messageCount.

### R2: Extract ChatInput component

Extract the input area (textarea, send/stop button, at-mention popup, slash command popup, quick reply chips, attachment preview, drag-and-drop overlay, icon toolbar, speech recognition button, character count) into `ChatInput.tsx`.

**Props interface**: onSend, onAbort, isStreaming, attachments, addFiles, removeAttachment, clearAttachments.

This component should own: input state, input history, placeholder rotation, at-mention state, slash command state, speech recognition state, drag-and-drop state, textarea ref.

### R3: Extract useConversationSearch hook

Extract conversation search logic (searchOpen, searchQuery, searchMatches, currentMatchIdx, handleSearch, openSearch, closeSearch, nextMatch, prevMatch) into `hooks/useConversationSearch.ts`.

### R4: Extract useStreamingTimer hook

Extract the streaming elapsed timer (streamStartRef, elapsed, elapsedStr) into `hooks/useStreamingTimer.ts`.

### R5: Extract useChatZoom hook

Extract chat zoom state and keyboard handlers (chatZoom, setChatZoom, zoom keyboard event handling) into `hooks/useChatZoom.ts`.

### R6: Extract useConversationStats hook

Extract the conversationStats and bookmarkedMessages useMemo computations into `hooks/useConversationStats.ts`.

### R7: Thin ChatPanel orchestrator

After extraction, ChatPanel.tsx should:
- Import and compose ChatHeader, ChatInput, MessageList, SearchBar, ThinkingIndicator, WelcomeScreen, TaskQueuePanel
- Use the extracted hooks
- Handle the overall layout
- Wire event handlers between components
- Target: **under 400 lines**

## Constraints

- **Zero visual or behavioral changes** -- this is a pure refactor
- **No new npm dependencies**
- **TypeScript strict mode must pass** -- no `any` escapes
- **All existing features must continue working**: search, export, bookmarks, stats, drag-and-drop, at-mentions, slash commands, speech recognition, input history, streaming timer, zoom, task queue, quick replies, thinking indicator, welcome screen, focus mode, regeneration, message editing
- **All existing keyboard shortcuts must continue working**: Ctrl+F, Ctrl+Shift+E, Ctrl+Shift+F, Ctrl+Shift+R, Ctrl+Shift+X, Ctrl+=/-/0, Ctrl+N/K, Up/Down input history

## Acceptance Criteria

- [ ] ChatPanel.tsx is under 400 lines
- [ ] ChatHeader.tsx extracted with all toolbar functionality
- [ ] ChatInput.tsx extracted with all input area functionality
- [ ] useConversationSearch.ts hook extracted
- [ ] useStreamingTimer.ts hook extracted
- [ ] useChatZoom.ts hook extracted
- [ ] useConversationStats.ts hook extracted
- [ ] All 100+ features continue to work (no behavioral changes)
- [ ] All keyboard shortcuts work
- [ ] Build passes with zero TypeScript errors
- [ ] `tsc --noEmit` clean on all three targets (main, preload, renderer)

## Technical Notes

- ThinkingIndicator and WelcomeScreen were already extracted in Iteration 106 -- follow that pattern
- The extraction should preserve the existing event handler wiring (CustomEvent pattern for cross-component communication)
- ChatInput needs access to `sendMessage` and `abort` from `useStreamJson` -- these can be passed as props or ChatInput can call the hook directly
- The at-mention and slash command popups are already separate components -- they just need their trigger state moved to ChatInput
- Test by building (`npm run build`) and visually verifying the chat panel works

## Non-Goals

- No new features
- No Tailwind migration (separate future task)
- No test writing (separate future task)
- No state management changes (Zustand store stays as-is)
