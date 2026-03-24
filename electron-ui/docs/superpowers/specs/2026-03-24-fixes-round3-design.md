# Fixes Round 3 Design

**Date:** 2026-03-24
**Project:** AIPA — Electron UI (`electron-ui/`)
**Status:** Approved

---

## Overview

Four issues to resolve:

1. **FileBrowser not updating to `~/claude`** — `useEffect` has empty deps, never re-runs when `workingDir` changes
2. **Terminal defaults to open** — `terminalOpen` initializes to `true` in store; PTY already runs Claude with correct cwd
3. **Chat not auto-updating during streaming** — streaming events from CLI either not arriving in renderer or not triggering React re-render
4. **No loading animation while Claude is processing** — user gets no feedback after sending a message

---

## Fix 1 — FileBrowser Reactivity

**File:** `src/renderer/components/filebrowser/FileBrowser.tsx`

**Root cause:** `useEffect(() => { init() }, [])` reads `workingDir` from Zustand store at mount only. When `workingDir` changes (e.g. after App.tsx sets it to `~/claude`), the file browser never re-runs `init()`.

**Fix:**
- Destructure `workingDir` from `useChatStore` at the top of the component
- Change effect dependency array from `[]` to `[workingDir]`
- Ensure `init()` uses the current `workingDir` value (from closure or parameter), not a stale one

```ts
// Before
useEffect(() => { init() }, [])

// After
const { workingDir } = useChatStore()
useEffect(() => { init() }, [workingDir])
```

No other files need changes.

---

## Fix 2 — Terminal Default Collapsed

**File:** `src/renderer/store/index.ts`

**Root cause:** `useUiStore` initializes with `terminalOpen: true`.

**Fix:** Change to `terminalOpen: false`.

```ts
// Before
terminalOpen: true,

// After
terminalOpen: false,
```

No other changes needed. `pty-manager.ts` already spawns `node cli.js` (Claude CLI) directly as the PTY process using `prefs.workingDir` as cwd — when the user opens the terminal, Claude starts in the correct directory automatically.

---

## Fix 3 — Chat Real-Time Updates

**Root cause investigation approach:** Add console logging at each stage of the IPC→Zustand→React pipeline to identify exactly where events are dropped.

**Suspected failure points (most to least likely):**

1. **ChatPanel not subscribing to messages correctly** — component may be reading from Zustand via a selector that doesn't trigger re-renders on append
2. **`onCliEvent` listener not receiving events** — IPC push events from main process not reaching the renderer handler
3. **`appendTextDelta` not creating a new assistant message** — if no assistant message exists yet when first `cli:assistantText` fires, the delta is silently dropped

**What the code actually does (verified by reading source):**

- `appendTextDelta` in `store/index.ts` checks `last && last.role === 'assistant' && last.isStreaming`. If true, appends to that message. Otherwise creates a new assistant message with `isStreaming: true`. This is correct.
- `ChatPanel.tsx` reads `{ messages, isStreaming }` via direct Zustand destructure (no selector). In Zustand v4 this subscribes to the whole store and re-renders on any state change — this is correct.
- The IPC push path: `win.webContents.send('cli:event', ...)` → preload `onCliEvent` → `useStreamJson` handler → `appendTextDelta`

**Most likely root cause:** The `onCliEvent` listener in `useStreamJson` passes `null` as `sessionId` filter. The preload implementation may require a non-null value to match events. If filtering logic silently drops events when `sessionId` is `null`, no streaming events ever reach the handler.

**Fix strategy:**

1. Read `src/preload/index.ts` `onCliEvent` implementation to verify filtering logic
2. If filtering drops `null` — fix the preload to accept `null` as "match all"
3. If filtering is fine — add `console.log` in the `cli:assistantText` case to confirm events arrive

**Files to fix:**
- `src/preload/index.ts` — verify/fix `onCliEvent` null sessionId handling

---

## Fix 4 — Loading Animation

**File:** `src/renderer/components/chat/ChatPanel.tsx`

**Goal:** When `isStreaming` is true, show a pulsing three-dot animation below the last message to indicate Claude is processing.

**Implementation:**

Read `isStreaming` from `useChatStore`. When true, render a `ThinkingIndicator` component below the message list:

```tsx
// Inline in ChatPanel or as a small local component
function ThinkingIndicator() {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '8px 12px', alignItems: 'center' }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--text-muted)',
            animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  )
}
```

Add keyframe to `globals.css`:
```css
@keyframes pulse {
  0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1); }
}
```

---

## Files Changed

| File | Change |
|------|--------|
| `src/renderer/components/filebrowser/FileBrowser.tsx` | Add `workingDir` to `useEffect` deps |
| `src/renderer/store/index.ts` | `terminalOpen: false`; verify/fix `appendTextDelta` |
| `src/renderer/components/chat/ChatPanel.tsx` | Add `ThinkingIndicator`, ensure messages selector triggers re-renders |
| `src/renderer/styles/globals.css` | Add `@keyframes pulse` |

---

## Build Step

After all changes:
```bash
cd C:/Users/osr/Desktop/AIPA/electron-ui
npm run build 2>&1 | tail -20
```

Then launch:
```bash
node_modules/.bin/electron dist/main/index.js
```

---

## Out of Scope

- Changing PTY to launch a different process (it already runs Claude)
- Persisting terminal open/closed state across launches
- Markdown rendering improvements
- Any changes to the CLI invocation flags
