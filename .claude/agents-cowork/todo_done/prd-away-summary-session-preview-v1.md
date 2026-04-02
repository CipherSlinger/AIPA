# PRD: Away Summary + Session Preview

_Version: 1.0 | Date: 2026-04-01 | Author: aipa-pm (via agent-leader)_

## Background

Inspired by Claude Code official source (`awaySummary.ts`, `useAwaySummary.ts`, `SessionPreview.tsx`). AIPA already has an Idle Return Dialog (It.373) that detects when the user returns after 30+ minutes away, but it only offers navigation options (continue, new, don't ask). It does NOT generate an AI-powered summary of "where we left off." The official source generates a contextual 1-3 sentence recap using a fast model call, which is significantly more helpful.

Additionally, sessions in the sidebar can only be opened (full load). There's no way to "peek" at a session's conversation before committing to open it. The official source has a `SessionPreview.tsx` component that shows messages inline.

## In Scope

### Feature 1: Away Summary (AI-generated "While You Were Away" Recap)

When the Idle Return Dialog appears (user returns after 30+ min idle with an active conversation), generate a short AI-powered summary of the session context and display it in the dialog.

- Uses existing CLI in `--print` mode (same pattern as prompt suggestions from It.372)
- Prompt: "The user stepped away and is coming back. Write exactly 1-3 short sentences. Start by stating the high-level task, then the concrete next step."
- Display the summary text in the IdleReturnDialog between the idle duration info and the action buttons
- Add a loading state (skeleton text) while the summary generates
- Summary generation starts immediately when the idle return condition is detected (in parallel with showing the dialog)
- If generation fails or times out (10s), show the dialog without summary (graceful degradation)
- Respects the existing `idleReturnDialogEnabled` preference

### Feature 2: Session Preview Panel

Add a preview capability to the session list. When hovering over a session for 1 second (enhancing the existing tooltip from It.90), show a richer preview panel on the right side that displays the last 5 messages of the conversation.

- Preview panel appears to the right of the session list (or below on narrow screens)
- Shows: session title, project path, last 5 messages with role labels (User/AI), timestamps
- Messages truncated at 200 chars each with "..." ellipsis
- Uses existing `session:loadMessages` IPC to fetch messages (lazy, with cancel on hover-out)
- Loading skeleton while messages load
- Close on mouse leave (with 200ms delay to prevent flicker)
- Does not auto-scroll or affect the active session

## Out of Scope

- Voice integration
- Background/dream tasks
- Full context collapse system
- Session preview in the command palette

## Acceptance Criteria

### Away Summary
- [ ] IdleReturnDialog shows AI-generated summary when available
- [ ] Summary appears between idle duration and action buttons
- [ ] Loading state shown while generating
- [ ] Graceful fallback if generation fails or times out (10s)
- [ ] No summary when conversation has fewer than 3 messages
- [ ] i18n: summary label and loading text in en.json and zh-CN.json
- [ ] Build passes with zero errors

### Session Preview
- [ ] Hovering over a session for 1s shows preview panel
- [ ] Preview shows last 5 messages with role labels and truncated content
- [ ] Loading skeleton while messages load from disk
- [ ] Panel dismissed on mouse leave (200ms delay)
- [ ] Does not interfere with existing session tooltip
- [ ] i18n: preview labels in en.json and zh-CN.json
- [ ] Build passes with zero errors
