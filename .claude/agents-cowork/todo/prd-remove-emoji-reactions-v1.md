# PRD: Remove Emoji Reactions Feature
_Version: v1 | Status: Approved | PM: aipa-pm | Date: 2026-03-27_

## One-line Definition
Remove the emoji quick-react system from message bubbles, per direct user feedback requesting its removal.

## Background & Motivation
- User feedback (feedback.md item #2): "Remove the emoji reaction feature on AI replies"
- The emoji reaction system was added in Iteration 63 as a WeChat/Slack-style feature
- User finds it unnecessary or distracting in an AI assistant context
- Unlike social messaging apps, reactions on AI replies provide limited value

## Target User
All AIPA users -- this is a universal UX simplification.

## User Story
As an AIPA user,
I want a cleaner message interface without emoji reaction buttons,
so that the chat experience is focused on the conversation content.

## Scope

### In Scope (This Version)
- Remove the hover-triggered emoji reaction toolbar from message bubbles
- Remove the reaction badge display below message bubbles
- Remove the `reactions` state and `toggleReaction` action from Zustand store
- Remove the 7 reaction-specific CSS variables from all themes
- Keep the hover action toolbar (Copy, Bookmark, Quote Reply, Raw Markdown) -- only remove the reaction toolbar

### Out of Scope
- Message context menu changes (unchanged)
- Hover action toolbar restructuring (unchanged beyond reaction removal)

## Detailed Changes

### 1. Message.tsx -- Remove Reaction UI
**Description**: Remove the REACTION_EMOJIS constant, the hover-triggered reaction toolbar, and the reaction badge row from the Message component.
**Changes**:
- Remove `REACTION_EMOJIS` constant
- Remove reaction toolbar rendering (the separate emoji bar that appears on hover)
- Remove reaction badge row (badges below bubbles)
- Remove `reactions` and `toggleReaction` imports from store
- Remove `showReactionBar` / `reactionTimer` state if present
- Keep the existing hover action toolbar (Copy/Bookmark/Quote/Raw Markdown) intact

**Acceptance Criteria**:
- [ ] No emoji reaction toolbar appears on message hover
- [ ] No reaction badges visible below any message bubble
- [ ] Hover action toolbar (Copy, Bookmark, Quote Reply) still works
- [ ] No TypeScript errors after removal

### 2. store/index.ts -- Remove Reaction State
**Description**: Remove the reactions state and toggleReaction action from ChatState.
**Changes**:
- Remove `reactions: Record<string, string[]>` from ChatState interface
- Remove `toggleReaction(msgId, emoji)` action
- Remove initial `reactions: {}` from store creation

**Acceptance Criteria**:
- [ ] `reactions` property removed from ChatState
- [ ] `toggleReaction` method removed
- [ ] No TypeScript errors

### 3. globals.css -- Remove Reaction CSS Variables
**Description**: Remove the 7 reaction-specific CSS variables from all theme blocks.
**Variables to remove**:
- `--reaction-bar-bg`
- `--reaction-bar-border`
- `--reaction-bar-shadow`
- `--reaction-badge-bg`
- `--reaction-badge-border`
- `--reaction-badge-active`
- `--reaction-badge-active-border`

**Acceptance Criteria**:
- [ ] All 7 reaction CSS variables removed from all theme blocks (default, light)
- [ ] No CSS compilation issues

## Non-Functional Requirements
- **Performance**: Removing reaction state should marginally improve render performance (fewer store subscriptions per message)
- **Bundle size**: Slight reduction from removing reaction constants and rendering logic

## Success Metrics
- Clean build with zero errors
- No reaction-related UI elements visible in the app
- Hover action toolbar (Copy/Bookmark/Quote) continues to work

## Priority
- **P0**: Direct user request, must be done this iteration

## Dependencies & Risks
| Dependency | Owner | Risk Level |
|-----------|-------|-----------|
| None | Engineering | Low -- pure removal |

## Open Questions
- None -- straightforward feature removal
