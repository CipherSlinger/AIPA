# Iteration Report: Remove Double RAF Buffering & Add Elapsed Timer

**Date**: 2026-03-27 04:30
**Iteration**: 19
**Status**: COMPLETE
**Build**: PASS (Vite)

## Changes

### Bug Fix: Remove Redundant Double RAF Buffering

**Problem**: After Iteration 17 added RAF-throttled streaming buffers to the Zustand store (`appendTextDelta`/`appendThinkingDelta`), the `useStreamJson` hook still had its own layer of RAF buffering. Text deltas were being:
1. Accumulated in `useStreamJson`'s `textBufferRef` Map
2. Flushed via RAF to `appendTextDelta`
3. Accumulated again in the store's `streamingBuffer`
4. Flushed via another RAF to Zustand state

This doubled the latency (2x RAF frames before UI update) and added unnecessary complexity.

**Fix**: Removed the RAF buffering layer in `useStreamJson.ts`. Deltas now pass directly to the store's `appendTextDelta`/`appendThinkingDelta`, which handles all batching internally. Removed `textBufferRef`, `thinkingBufferRef`, `rafScheduledRef`, `flushBuffers`, and `scheduleFlush` from the hook.

### New Feature: Streaming Elapsed Timer

Added a real-time elapsed timer that appears in the chat toolbar during streaming:
- Shows elapsed time in `Xs` or `Xm Ys` format
- Uses monospace font in success color (`var(--success)`)
- Starts automatically when streaming begins
- Resets when streaming ends
- Only appears after 1 second (avoids flashing for instant responses)

### Modified Files
- `electron-ui/src/renderer/hooks/useStreamJson.ts`
  - Removed redundant RAF buffering (textBufferRef, thinkingBufferRef, scheduleFlush, flushBuffers)
  - Deltas now pass directly to store functions
- `electron-ui/src/renderer/components/chat/ChatPanel.tsx`
  - Added `streamStartTime`, `elapsed`, and `elapsedStr` state
  - Added elapsed timer display in toolbar between export and new conversation buttons

## UX Impact

- **Latency improvement**: Text appears one frame sooner during streaming (16ms less latency)
- **Timer**: Users can now see how long Claude has been working, useful for long tasks
