# Fixes Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix default working directory, show CLI errors in chat, add delete-all sessions button, then rebuild dist to activate all pending source changes.

**Architecture:** Minimal targeted edits across 5 files — one new IPC handler, preload stub, two renderer logic fixes, one UI addition. A full `npm run build` at the end compiles everything (including round-1 changes already in source).

**Tech Stack:** Electron 39, React 18, TypeScript, Zustand, Vite (renderer build), Node.js fs

**Note:** No git repository in this project. Skip all commit steps.

---

## File Map

| File | Change |
|------|--------|
| `src/main/ipc/index.ts` | Add `fs:ensureDir` handler inside `registerFsHandlers()` |
| `src/preload/index.ts` | Add `fsEnsureDir` to `electronAPI` |
| `src/renderer/App.tsx` | Default workingDir to `~/claude`, call `fsEnsureDir` |
| `src/renderer/hooks/useStreamJson.ts` | Show CLI errors as assistant messages |
| `src/renderer/components/sessions/SessionList.tsx` | Add "clear all" button |

---

## Task 1: Add `fs:ensureDir` IPC Handler

**Files:**
- Modify: `src/main/ipc/index.ts` — inside `registerFsHandlers()` at the bottom
- Modify: `src/preload/index.ts` — add stub to `electronAPI`

- [ ] **Step 1: Open `src/main/ipc/index.ts`, find `registerFsHandlers()` (around line 126)**

Locate the `ipcMain.handle('fs:getHome', ...)` line at the very bottom of the function. Add the new handler directly after it:

```ts
ipcMain.handle('fs:ensureDir', (_e, dirPath: string) => {
  fs.mkdirSync(dirPath, { recursive: true })
  return dirPath
})
```

The `fs` import is already at the top of the file — no new imports needed.

- [ ] **Step 2: Open `src/preload/index.ts`, find the `// ── File system` section (around line 31)**

After `fsGetHome`:
```ts
fsGetHome: () => ipcRenderer.invoke('fs:getHome'),
```
Add:
```ts
fsEnsureDir: (dirPath: string) => ipcRenderer.invoke('fs:ensureDir', dirPath),
```

- [ ] **Step 3: Verify TypeScript compiles for main and preload**

```bash
cd C:/Users/osr/Desktop/AIPA/electron-ui
npx tsc -p tsconfig.main.json --noEmit 2>&1 | grep -v "npm warn"
npx tsc -p tsconfig.preload.json --noEmit 2>&1 | grep -v "npm warn"
```

Expected: no errors from either command.

---

## Task 2: Default Working Directory `~/claude`

**Files:**
- Modify: `src/renderer/App.tsx` — init `useEffect`, lines 13–32

- [ ] **Step 1: Open `src/renderer/App.tsx`, find the `init` async function inside the first `useEffect`**

Current code (lines 14–29):
```ts
const init = async () => {
  const all = await window.electronAPI.prefsGetAll()
  const env = await window.electronAPI.configGetEnv()
  const home = await window.electronAPI.fsGetHome()

  setPrefs({
    ...all,
    apiKey: all.apiKey || env.apiKey || '',
  })
  setWorkingDir(all.workingDir || home)
  setLoaded(true)

  // First-run: open settings if no API key
  if (!all.apiKey && !env.apiKey) {
    setSidebarTab('settings')
  }
}
```

- [ ] **Step 2: Replace that `init` function body with the following**

```ts
const init = async () => {
  const all = await window.electronAPI.prefsGetAll()
  const env = await window.electronAPI.configGetEnv()
  const home = await window.electronAPI.fsGetHome()

  setPrefs({
    ...all,
    apiKey: all.apiKey || env.apiKey || '',
  })

  // Default working dir: ~/claude (auto-create if not saved yet)
  const workingDir = all.workingDir || `${home}/claude`
  if (!all.workingDir) {
    await window.electronAPI.fsEnsureDir(workingDir)
    window.electronAPI.prefsSet('workingDir', workingDir)
  }
  setWorkingDir(workingDir)
  setLoaded(true)

  // First-run: open settings if no API key
  if (!all.apiKey && !env.apiKey) {
    setSidebarTab('settings')
  }
}
```

Key logic:
- If `all.workingDir` is already saved → use it as-is (don't create or overwrite)
- If not saved → use `${home}/claude`, create the directory, persist to prefs

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc -p tsconfig.json --noEmit 2>&1 | grep -v "npm warn" | grep "App.tsx"
```

Expected: no errors for App.tsx (pre-existing errors in other files are OK).

---

## Task 3: Show CLI Errors as Chat Messages

**Files:**
- Modify: `src/renderer/hooks/useStreamJson.ts` — `cli:error` case in the `onCliEvent` handler (around line 87)

- [ ] **Step 1: Open `src/renderer/hooks/useStreamJson.ts`, find the `cli:error` case**

Current code:
```ts
case 'cli:error':
  setStreaming(false)
  break
```

- [ ] **Step 2: Replace with error-message version**

```ts
case 'cli:error': {
  const errText = (data.error as string) || 'CLI 发生未知错误'
  useChatStore.getState().addMessage({
    id: `err-${Date.now()}`,
    role: 'assistant',
    content: `⚠️ ${errText}`,
    timestamp: Date.now(),
  })
  setStreaming(false)
  break
}
```

Note: `useChatStore` is already imported at the top of the file — no new imports needed.

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc -p tsconfig.json --noEmit 2>&1 | grep -v "npm warn" | grep "useStreamJson"
```

Expected: no new errors for useStreamJson.ts.

---

## Task 4: Add "Clear All Sessions" Button

**Files:**
- Modify: `src/renderer/components/sessions/SessionList.tsx` — search bar row (around lines 66–89)

- [ ] **Step 1: Open `src/renderer/components/sessions/SessionList.tsx`, find the search bar `<div>` (around line 66)**

Current search bar JSX:
```tsx
<div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, flexShrink: 0 }}>
  <input ... />
  <button onClick={loadSessions} title="刷新" ...>
    <RefreshCw size={13} />
  </button>
</div>
```

- [ ] **Step 2: Add a "clear all" button after the refresh button**

```tsx
<div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, flexShrink: 0 }}>
  <input ... />
  <button
    onClick={loadSessions}
    title="刷新"
    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
  >
    <RefreshCw size={13} />
  </button>
  <button
    onClick={async () => {
      if (!sessions.length) return
      const ok = window.confirm(`确定要删除全部 ${sessions.length} 条会话记录吗？此操作不可撤销。`)
      if (!ok) return
      for (const s of sessions) {
        await window.electronAPI.sessionDelete(s.sessionId)
      }
      loadSessions()
    }}
    title="清空全部会话"
    style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
  >
    <Trash2 size={13} />
  </button>
</div>
```

`Trash2` and `sessions` are already available in scope — no new imports or state needed.

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc -p tsconfig.json --noEmit 2>&1 | grep -v "npm warn" | grep "SessionList"
```

Expected: no errors for SessionList.tsx.

---

## Task 5: Full Build and Verification

**Files:** None (build step only)

- [ ] **Step 1: Run full build**

```bash
cd C:/Users/osr/Desktop/AIPA/electron-ui
npm run build 2>&1 | tail -20
```

Expected: exits with code 0. Vite prints something like:
```
✓ built in Xs
```

If errors appear, read them carefully — they may be pre-existing TypeScript errors in other files that don't block the build. Vite's renderer build uses `vite build` which is more lenient than `tsc --noEmit`.

- [ ] **Step 2: Launch the app**

```bash
node_modules/.bin/electron dist/main/index.js
```

- [ ] **Step 3: Manual verification checklist**

**Default working dir:**
1. Open Settings sidebar → 默认工作目录 field shows `C:\Users\osr\claude` (or equivalent home/claude path)
2. Check `C:\Users\osr\claude` folder was created on disk

**Theme picker:**
3. Settings sidebar shows "界面主题" section with 3 color swatch buttons
4. Clicking a swatch immediately changes the app colors

**Chat (requires API key set in settings):**
5. Type a message, press Enter → user message appears, streaming indicator shows
6. Claude responds → response text streams in real-time without needing to switch sessions
7. If CLI errors occur → error message appears in chat as `⚠️ ...`

**Delete all sessions:**
8. Switch to "历史" tab → search bar has a red trash icon next to the refresh icon
9. Click the red trash icon → confirm dialog appears
10. Confirm → all sessions deleted, list cleared

**DevTools:**
11. App opens with no DevTools panel (round-1 fix now active in built dist)
