# Fixes Round 2 Design

**Date:** 2026-03-24
**Project:** AIPA — Electron UI (`electron-ui/`)
**Status:** Approved

---

## Overview

Four issues to resolve:

1. **Default working directory** — should be `~/claude`, auto-created on first run
2. **Chat messages not updating in real-time** — root cause: dist not rebuilt after round-1 fixes; secondary: silent CLI errors give user no feedback
3. **Theme picker not visible** — root cause: dist not rebuilt; source already correct
4. **Delete all sessions** — need a "clear all" button in the session history tab

---

## Fix 1 — Default Working Directory

**Goal:** When no `workingDir` is saved in prefs, default to `$HOME/claude` and create the directory if it doesn't exist.

**IPC change (`src/main/ipc/index.ts`):**

Add `fs:ensureDir` handler to `registerFsHandlers()`:

```ts
ipcMain.handle('fs:ensureDir', (_e, dirPath: string) => {
  fs.mkdirSync(dirPath, { recursive: true })
  return dirPath
})
```

**Preload change (`src/preload/index.ts`):**

Add:
```ts
fsEnsureDir: (dirPath: string) => ipcRenderer.invoke('fs:ensureDir', dirPath),
```

**Renderer change (`src/renderer/App.tsx`):**

Change the init logic from:
```ts
setWorkingDir(all.workingDir || home)
```
To:
```ts
const defaultDir = path.join(home, 'claude')  // Note: use string join, no path module in renderer
const workingDir = all.workingDir || `${home}/claude`
await window.electronAPI.fsEnsureDir(workingDir)
setWorkingDir(workingDir)
window.electronAPI.prefsSet('workingDir', workingDir)  // persist so it's not re-created on next launch
```

Note: Only set the default and persist it when no workingDir was saved (`!all.workingDir`). If the user had a saved workingDir, don't overwrite it.

**Type change (`src/renderer/types/electron.d.ts` or preload type):**

Add `fsEnsureDir` to the `ElectronAPI` type exported from `src/preload/index.ts`.

---

## Fix 2 — Chat Messages Not Updating

**Primary fix:** Rebuild `dist/` — all round-1 source changes (session ID bug fix, theme system, etc.) become active.

**Secondary fix — show CLI errors in chat (`src/renderer/hooks/useStreamJson.ts`):**

When `cli:error` fires, currently only `setStreaming(false)` is called. The user sees nothing. Add an error message to the chat:

```ts
case 'cli:error': {
  const errText = (data.error as string) || 'CLI 发生错误'
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

This gives the user visible feedback instead of a frozen UI.

---

## Fix 3 — Theme Picker Not Visible

**Fix:** Rebuild `dist/`. Source (`SettingsPanel.tsx`) already contains the theme picker added in round 1. No source changes needed.

---

## Fix 4 — Delete All Sessions

**Goal:** Add a "清空" button next to the refresh button in `SessionList.tsx`. On click, show a `confirm()` dialog. If confirmed, delete all sessions one by one using the existing `sessionDelete` IPC call, then refresh the list.

**Change (`src/renderer/components/sessions/SessionList.tsx`):**

Add a trash-all button to the search bar row:

```tsx
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
```

Note: `Trash2` is already imported in the file. No new imports needed.

---

## Build Step (Critical)

After all source changes, run the full build:

```bash
cd C:/Users/osr/Desktop/AIPA/electron-ui
npm run build
```

This runs `build:main` (tsc), `build:preload` (tsc), and `build:renderer` (vite build) in sequence.

Then launch:
```bash
node_modules/.bin/electron dist/main/index.js
```

---

## Files Changed

| File | Change |
|------|--------|
| `src/main/ipc/index.ts` | Add `fs:ensureDir` IPC handler |
| `src/preload/index.ts` | Add `fsEnsureDir` to electronAPI |
| `src/renderer/App.tsx` | Default workingDir to `~/claude`, call `fsEnsureDir` |
| `src/renderer/hooks/useStreamJson.ts` | Show CLI errors as chat messages |
| `src/renderer/components/sessions/SessionList.tsx` | Add "clear all" button |
| *(build step)* | `npm run build` compiles all changes including round-1 fixes |

---

## Out of Scope

- Changing the location of `~/claude` to anything else
- Batch-delete IPC handler (frontend loop is sufficient)
- Persisting error messages across sessions
