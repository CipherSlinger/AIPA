# PRD: Fix React Error #185 Chat Panel Crash

**Author**: aipa-pm
**Date**: 2026-03-27
**Priority**: P0 (Critical Bug)
**Status**: Ready for Development

---

## Problem Statement

Users report that clicking on the chat panel sometimes triggers a crash with the error:
> "Something went wrong in chat panel"
> Minified React error #185

React error #185 corresponds to: **"Maximum update depth exceeded. This can happen when a component repeatedly calls setState inside componentDidUpdate or useEffect."**

This is an intermittent crash that makes the app unusable when triggered.

## Root Cause Analysis

After code review, the ChatPanel.tsx component has **17 useEffect hooks** and several potential sources of infinite re-render loops:

### Identified Risk Areas

1. **Streaming elapsed timer effect (lines 151-158)**: The useEffect depends on `[isStreaming, streamStartTime]` and mutates `streamStartTime` inside the effect. While logically stable, rapid state changes during streaming transitions could cause transient loops.

2. **Placeholder rotation effect (line 128-134)**: Uses `[input.length > 0]` as dependency which is a boolean expression -- this is correct but unconventional.

3. **Heavy Zustand selectors in Message.tsx**: `isLastUserMsg` and `hasAssistantReply` perform linear scans through all messages on every render. When messages array changes rapidly during streaming, this creates O(N*M) render cost where N = messages and M = re-renders per message.

4. **Multiple unguarded setState calls in callbacks**: Several useCallbacks can trigger state updates that cascade through multiple useEffects.

### Most Likely Cause

The streaming elapsed timer effect (lines 151-158) creates a borderline state update cycle:
- `isStreaming` changes -> effect runs -> `setStreamStartTime()` called -> re-renders -> effect runs again due to `streamStartTime` change

While the conditionals prevent an actual infinite loop, under certain timing conditions (e.g., rapid isStreaming toggles from WebSocket events), the React update queue could exceed the depth limit before the conditionals stabilize.

## Fix Requirements

### F1: Stabilize streaming timer with useRef
Replace the `streamStartTime` state variable with a `useRef` to avoid triggering re-renders from the timer effect. Only `elapsed` needs to be state (it drives the UI).

### F2: Guard against rapid streaming transitions
Add a ref-based debounce/guard to prevent the streaming status effect from firing multiple times within a single React commit.

### F3: Improve ErrorBoundary recovery
The current ErrorBoundary shows a static error panel. Enhance it to:
- Auto-retry rendering after a brief delay (e.g., 500ms)
- Show a more user-friendly error message
- Log the component stack trace to help debugging

### F4: Defensive useEffect patterns
Review all 17 useEffects in ChatPanel and ensure:
- No effect both reads and writes the same state variable in its dependency array
- All cleanup functions properly cancel pending operations

## Acceptance Criteria

- [ ] Chat panel does not crash with React error #185 during normal usage
- [ ] Chat panel does not crash during rapid streaming start/stop transitions
- [ ] Streaming elapsed timer still functions correctly (shows seconds/minutes during streaming)
- [ ] ErrorBoundary provides auto-retry on transient errors
- [ ] All existing ChatPanel features continue to work (search, export, bookmarks, etc.)
- [ ] Build passes with zero errors

## Technical Notes

- Primary file: `electron-ui/src/renderer/components/chat/ChatPanel.tsx`
- Secondary file: `electron-ui/src/renderer/components/shared/ErrorBoundary.tsx`
- Test by rapidly starting and stopping streaming sessions
