# Fixes Round 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix FileBrowser reactivity, collapse terminal by default, diagnose and fix chat streaming, add loading animation, then rebuild dist.

**Architecture:** Four targeted edits across 4 files — one dep array change, one boolean flip, one streaming diagnostic + fix, one new UI element — plus a CSS keyframe addition. Full `npm run build` at the end activates all changes.

**Tech Stack:** Electron 39, React 18, TypeScript, Zustand, Vite (renderer build), Node.js

**Note:** No git repository in this project. Skip all commit steps.

---

## File Map

| File | Change |
|------|--------|
| `src/renderer/components/filebrowser/FileBrowser.tsx` | Add `workingDir` to `useEffect` deps (line 88) |
| `src/renderer/store/index.ts` | Change `terminalOpen: true` → `false` (line 157) |
| `src/renderer/components/chat/ChatPanel.tsx` | Add `ThinkingIndicator` component, show when `isStreaming` |
| `src/renderer/styles/globals.css` | Add `@keyframes pulse` animation |
| `src/renderer/hooks/useStreamJson.ts` | Add diagnostic console logs to trace streaming pipeline |

---

## Task 1: Fix FileBrowser Reactivity

**Files:**
- Modify: `src/renderer/components/filebrowser/FileBrowser.tsx` — line 88

The `useEffect` at line 80–88 reads `workingDir` from the store inside `init()` but only runs once (empty deps). When `App.tsx` calls `setWorkingDir(workingDir)` after init, the FileBrowser never reloads. Fix: add `workingDir` to the dependency array so it re-runs whenever the working directory changes.

- [ ] **Step 1: Open `src/renderer/components/filebrowser/FileBrowser.tsx`, find line 88**

Current code (lines 80–88):
```ts
useEffect(() => {
  const init = async () => {
    const home = await window.electronAPI.fsGetHome()
    const dir = workingDir || home
    setCurrentDir(dir)
    loadDir(dir)
  }
  init()
}, [])
```

- [ ] **Step 2: Change the dependency array from `[]` to `[workingDir]`**

```ts
useEffect(() => {
  const init = async () => {
    const home = await window.electronAPI.fsGetHome()
    const dir = workingDir || home
    setCurrentDir(dir)
    loadDir(dir)
  }
  init()
}, [workingDir])
```

That's the only change in this file. `workingDir` is already destructured at line 76: `const { workingDir, setWorkingDir } = useChatStore()`.

- [ ] **Step 3: Verify TypeScript**

```bash
cd C:/Users/osr/Desktop/AIPA/electron-ui
npx tsc -p tsconfig.json --noEmit 2>&1 | grep -v "npm warn" | grep "FileBrowser"
```

Expected: no new errors for FileBrowser.tsx.

---

## Task 2: Terminal Default Collapsed

**Files:**
- Modify: `src/renderer/store/index.ts` — line 157

The PTY already spawns `node cli.js` (Claude CLI) with the correct `cwd` when the terminal opens. No other changes needed — just flip the initial state.

- [ ] **Step 1: Open `src/renderer/store/index.ts`, find line 157**

Current code (lines 154–158):
```ts
export const useUiStore = create<UiState>((set) => ({
  sidebarTab: 'files',
  sidebarOpen: true,
  terminalOpen: true,
```

- [ ] **Step 2: Change `terminalOpen: true` to `terminalOpen: false`**

```ts
export const useUiStore = create<UiState>((set) => ({
  sidebarTab: 'files',
  sidebarOpen: true,
  terminalOpen: false,
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc -p tsconfig.json --noEmit 2>&1 | grep -v "npm warn" | grep "store"
```

Expected: no new errors.

---

## Task 3: Diagnose and Fix Chat Streaming

**Files:**
- Modify: `src/renderer/hooks/useStreamJson.ts` — add console logs to trace the pipeline

The IPC pipeline is: `bridge.on('textDelta')` → `win.webContents.send('cli:assistantText')` → preload `onCliEvent` handler → `appendTextDelta` → Zustand `set()` → React re-render.

From code analysis, all pieces look correct. The most likely failure points are:
1. CLI fails to run (API key missing, path not found, or cwd issue) → `cli:error` appears in chat
2. CLI runs but produces no `text_delta` events (e.g., streaming not enabled, or the model returns a tool use only)
3. Events fire but something in the IPC push path drops them silently

Add diagnostic logging first, then build and run to identify the exact failure point.

- [ ] **Step 1: Open `src/renderer/hooks/useStreamJson.ts`, find the `onCliEvent` handler (lines 47–98)**

Current `cli:assistantText` case (lines 49–51):
```ts
case 'cli:assistantText':
  appendTextDelta(data.sessionId as string, data.text as string)
  break
```

- [ ] **Step 2: Add console logs to the three key cases**

```ts
case 'cli:assistantText':
  console.log('[stream] assistantText', data.sessionId, (data.text as string)?.slice(0, 40))
  appendTextDelta(data.sessionId as string, data.text as string)
  break
```

Also add before the switch:
```ts
const unsub = window.electronAPI.onCliEvent(null as unknown as string, (event, data: any) => {
  console.log('[stream] event received:', event)
  switch (event) {
```

And in `sendMessage`, add after `setStreaming(true)`:
```ts
setStreaming(true)
console.log('[stream] sendMessage starting, sessionId:', currentSessionId, 'cwd:', prefs.workingDir)
```

- [ ] **Step 3: Build and run the app to observe console output**

```bash
cd C:/Users/osr/Desktop/AIPA/electron-ui
npm run build 2>&1 | tail -20
node_modules/.bin/electron dist/main/index.js
```

Open DevTools (Ctrl+Shift+I in the app window) → Console tab.

Send a test message. Observe:

**Scenario A — No `[stream] sendMessage starting` log:**
→ The click handler isn't calling `sendMessage`. Check ChatPanel's send button.

**Scenario B — `sendMessage starting` appears but no `[stream] event received` logs:**
→ Events not reaching renderer. The IPC push channel is broken.
→ Check if `cli:error` appears in chat. If yes, read the error to identify the CLI failure.
→ If no `cli:error`: add a log in preload `onCliEvent` (need to rebuild preload — see Step 4).

**Scenario C — `[stream] event received: cli:error`:**
→ CLI is failing. Read the error text in chat.
→ Common causes: API key not set, CLI not found, `cwd` doesn't exist.
→ Fix the underlying cause (API key in Settings, or check CLI path).

**Scenario D — `[stream] event received: cli:assistantText` appears, but no UI update:**
→ `appendTextDelta` isn't triggering re-render.
→ Proceed to Step 4.

**Scenario E — Everything looks fine in logs, messages appear in chat:**
→ Bug is fixed by the rebuild. Proceed to Task 4.

- [ ] **Step 4: Apply fix based on diagnosis**

**If Scenario B (events not reaching renderer) and no CLI error:**

The preload's `onCliEvent` fires `!sessionId || d?.sessionId === sessionId`. Verify this by adding a temporary log in the preload. Open `src/preload/index.ts`, find line 61–63:

```ts
const h = (_: unknown, d: Record<string, unknown>) => {
  if (!sessionId || d?.sessionId === sessionId) cb(ch, d)
}
```

Add:
```ts
const h = (_: unknown, d: Record<string, unknown>) => {
  console.log('[preload] channel', ch, 'sessionId filter:', sessionId, 'd.sessionId:', d?.sessionId)
  if (!sessionId || d?.sessionId === sessionId) cb(ch, d)
}
```

Rebuild and recheck. If the filter condition never passes, the `sessionId` filtering is the bug. Fix: change the condition to always call `cb` (remove the filter since `useStreamJson` passes `null`):

```ts
const h = (_: unknown, d: Record<string, unknown>) => {
  cb(ch, d)
}
```

**If Scenario D (logs appear but no UI update):**

In `src/renderer/store/index.ts`, verify `appendTextDelta` (lines 32–49). The current implementation checks `last.isStreaming` before appending. This should work. If not working, force a new array reference by changing line 37:

```ts
msgs[msgs.length - 1] = { ...last, content: last.content + text }
```
to:
```ts
return { messages: [...msgs.slice(0, -1), { ...last, content: last.content + text }], currentSessionId: sessionId || s.currentSessionId }
```

(The whole `appendTextDelta` already returns the object via `set((s) => { ... return { messages: msgs, currentSessionId: ... } })` so this style is consistent.)

- [ ] **Step 5: Remove diagnostic console logs before final build**

After identifying and applying the fix, remove the `console.log` lines added in Steps 2 and 4 (keep the code clean).

---

## Task 4: Add Loading Animation

**Files:**
- Modify: `src/renderer/components/chat/ChatPanel.tsx` — add `ThinkingIndicator`
- Modify: `src/renderer/styles/globals.css` — add `@keyframes pulse`

- [ ] **Step 1: Open `src/renderer/styles/globals.css`, find the end of the file**

Add the keyframe animation at the end of the file:

```css
@keyframes pulse {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1); }
}
```

- [ ] **Step 2: Open `src/renderer/components/chat/ChatPanel.tsx`, find the `WelcomeScreen` function (line 152)**

Add a new `ThinkingIndicator` component just before `WelcomeScreen`:

```tsx
function ThinkingIndicator() {
  return (
    <div style={{ display: 'flex', gap: 5, padding: '10px 16px', alignItems: 'center' }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 7,
            height: 7,
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

- [ ] **Step 3: Find the messages section in `ChatPanel` (lines 73–80) and add `ThinkingIndicator`**

Current code:
```tsx
{/* Messages */}
<div className="flex-1 overflow-hidden">
  {messages.length === 0 ? (
    <WelcomeScreen />
  ) : (
    <MessageList messages={messages} />
  )}
</div>
```

Change to:
```tsx
{/* Messages */}
<div className="flex-1 overflow-hidden" style={{ display: 'flex', flexDirection: 'column' }}>
  <div style={{ flex: 1, overflow: 'hidden' }}>
    {messages.length === 0 ? (
      <WelcomeScreen />
    ) : (
      <MessageList messages={messages} />
    )}
  </div>
  {isStreaming && <ThinkingIndicator />}
</div>
```

`isStreaming` is already destructured at line 8: `const { messages, isStreaming, clearMessages, currentSessionId } = useChatStore()`.

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc -p tsconfig.json --noEmit 2>&1 | grep -v "npm warn" | grep "ChatPanel"
```

Expected: no new errors.

---

## Task 5: Full Build and Verification

- [ ] **Step 1: Run full build**

```bash
cd C:/Users/osr/Desktop/AIPA/electron-ui
npm run build 2>&1 | tail -20
```

Expected: exits with code 0. Vite prints `✓ built in Xs`.

- [ ] **Step 2: Launch the app**

```bash
node_modules/.bin/electron dist/main/index.js
```

- [ ] **Step 3: Manual verification checklist**

**FileBrowser:**
1. Left sidebar → "文件" tab shows `C:\Users\osr\claude` content immediately on launch
2. Double-click a folder in the tree → path updates in header + breadcrumb

**Terminal:**
3. App launches with terminal panel NOT visible (collapsed by default)
4. Click the terminal toggle button → terminal opens and Claude CLI starts in the correct working directory

**Chat streaming (requires API key in Settings):**
5. Type a message, press Enter → user message appears, send button changes to red square (stop icon)
6. Thinking dots animation appears below the messages while Claude is processing
7. Claude's response streams in word-by-word without needing to switch sessions
8. When streaming ends, dots disappear, send button returns to blue

**Error visibility:**
9. If something goes wrong, `⚠️ ...` error message appears in chat
