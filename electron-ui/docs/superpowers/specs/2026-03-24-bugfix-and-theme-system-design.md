# Bug Fix & Theme System Design

**Date:** 2026-03-24
**Project:** AIPA — Electron UI (`electron-ui/`)
**Status:** Approved

---

## Overview

Three issues to resolve:

1. **DevTools auto-opens** on every launch (production build)
2. **Input has no reaction** — chat messages sent but CLI fails silently
3. **UI needs beautification** — add 3 switchable themes with settings panel toggle

---

## Bug Fix 1 — DevTools Auto-Open

**Root cause:** `src/main/index.ts:36` calls `mainWindow.webContents.openDevTools()` inside the `else` (production) branch — a leftover debugging line.

**Fix:** Delete line 36. Only the `isDev` branch should open DevTools.

```ts
// Before
} else {
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  mainWindow.webContents.openDevTools()  // ← DELETE THIS LINE
}

// After
} else {
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
}
```

---

## Bug Fix 2 — Input Has No Reaction

**Root cause:** `src/main/ipc/index.ts:82` passes `args.sessionId` (the internal bridge ID, e.g. `"bridge-1704......"`) as `resumeSessionId` to the `--resume` CLI flag. The CLI attempts to resume a session that doesn't exist, exits with non-zero code, and the renderer never gets a response.

**Fix:** In `src/renderer/hooks/useStreamJson.ts`, pass the real Claude session ID (stored in `useChatStore.currentSessionId` after the first successful `cli:result` event) instead of the bridge ID.

```ts
// Before
const result = await window.electronAPI.cliSendMessage({
  prompt,
  cwd: ...,
  sessionId: currentSessionId,  // ❌ this is the bridge ID on first call, wrong on resume
  ...
})

// After
const result = await window.electronAPI.cliSendMessage({
  prompt,
  cwd: ...,
  sessionId: currentSessionId,  // real Claude session ID (null on first message, set after cli:result)
  ...
})
```

The real fix is ensuring `currentSessionId` in the store only ever holds the value from `cli:result → claudeSessionId`, never the bridge ID. The bridge ID should never be stored in `useChatStore`. Verify `useStreamJson.ts:37`:

```ts
// This line is correct — only updates sessionId from the real Claude result
if (result?.sessionId) {
  setSessionId(result.sessionId)  // ❌ result.sessionId is the bridge ID ("bridge-...")
}
```

The `cliSendMessage` IPC handler returns `{ success: true, sessionId: bridgeId }` — so `result.sessionId` is actually the bridge ID. Fix: the IPC handler should also return `claudeSessionId` from the `cli:result` event, OR the renderer should ignore `result.sessionId` and rely solely on the `cli:result` push event which already correctly calls `setSessionId(claudeSessionId)`.

**Correct fix:** Remove the `setSessionId(result.sessionId)` call in `useStreamJson.ts:36–38` entirely. The `cli:result` event handler at line 83–84 already correctly sets the real Claude session ID:

```ts
case 'cli:result': {
  const claudeSessionId = data.claudeSessionId as string | undefined
  if (claudeSessionId) setSessionId(claudeSessionId)  // ✅ already correct
  break
}
```

So simply delete lines 36–38 in `useStreamJson.ts` that overwrite with the bridge ID.

---

## Feature — Theme System

### CSS Layer (`src/renderer/styles/globals.css`)

Define 3 theme variable sets. The default `:root` block stays as-is (VS Code theme). Additional themes override via `[data-theme]` attribute on `<html>`:

```css
/* Theme: VS Code (default — existing :root block, unchanged) */
:root {
  --bg-primary: #1e1e1e;
  --bg-secondary: #252526;
  --bg-sidebar: #2c2c2c;
  --bg-input: #3c3c3c;
  --bg-hover: #2a2d2e;
  --bg-active: #37373d;
  --text-primary: #cccccc;
  --text-muted: #858585;
  --text-bright: #ffffff;
  --accent: #007acc;
  --accent-hover: #1f8ad2;
  --border: #404040;
  --success: #4ec9b0;
  --warning: #d7ba7d;
  --error: #f44747;
  --user-bubble: #264f78;
  --assistant-bubble: #2d2d2d;
}

/* Theme: Modern Dark (GitHub/Linear style) */
[data-theme="modern"] {
  --bg-primary: #0d1117;
  --bg-secondary: #161b22;
  --bg-sidebar: #161b22;
  --bg-input: #1f2937;
  --bg-hover: #1f2937;
  --bg-active: #21262d;
  --text-primary: #e6edf3;
  --text-muted: #7d8590;
  --text-bright: #ffffff;
  --accent: #2f81f7;
  --accent-hover: #388bfd;
  --border: #30363d;
  --success: #3fb950;
  --warning: #d29922;
  --error: #f85149;
  --user-bubble: #1f3a5f;
  --assistant-bubble: #161b22;
}

/* Theme: Minimal Dark (Claude.ai/Raycast style) */
[data-theme="minimal"] {
  --bg-primary: #111111;
  --bg-secondary: #1a1a1a;
  --bg-sidebar: #111111;
  --bg-input: #1a1a1a;
  --bg-hover: #1f1f1f;
  --bg-active: #242424;
  --text-primary: #eeeeee;
  --text-muted: #666666;
  --text-bright: #ffffff;
  --accent: #a855f7;
  --accent-hover: #b975f9;
  --border: #2a2a2a;
  --success: #22c55e;
  --warning: #f59e0b;
  --error: #ef4444;
  --user-bubble: #1e1033;
  --assistant-bubble: #1a1a1a;
}
```

### State Layer (`src/renderer/store/index.ts`)

Add `theme` field to `ClaudePrefs` type and `DEFAULT_PREFS`:

```ts
// In app.types.ts
theme?: 'vscode' | 'modern' | 'minimal'

// In DEFAULT_PREFS
theme: 'vscode',
```

### Application Layer (`src/renderer/App.tsx`)

Apply theme on mount and on change:

```ts
useEffect(() => {
  const theme = prefs.theme || 'vscode'
  if (theme === 'vscode') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', theme)
  }
}, [prefs.theme])
```

### Persistence

Use existing `window.electronAPI.prefsSet('theme', value)` — no new IPC channels needed.

### Settings Panel (`src/renderer/components/settings/SettingsPanel.tsx`)

Add a theme selector section with 3 clickable swatches showing color previews. Selected theme highlighted with accent border. Changing selection immediately calls `prefsSet('theme', value)` and updates the store.

---

## Files Changed

| File | Change |
|------|--------|
| `src/main/index.ts` | Delete line 36 (`openDevTools` in else branch) |
| `src/renderer/hooks/useStreamJson.ts` | Remove `setSessionId(result.sessionId)` (lines 36–38) |
| `src/renderer/styles/globals.css` | Add `[data-theme="modern"]` and `[data-theme="minimal"]` variable blocks |
| `src/renderer/types/app.types.ts` | Add `theme` field to `ClaudePrefs` |
| `src/renderer/store/index.ts` | Add `theme: 'vscode'` to `DEFAULT_PREFS` |
| `src/renderer/App.tsx` | Add `useEffect` to apply `data-theme` attribute |
| `src/renderer/components/settings/SettingsPanel.tsx` | Add theme switcher UI section |

---

## Out of Scope

- Light themes
- Per-component theme overrides
- Custom color picker
