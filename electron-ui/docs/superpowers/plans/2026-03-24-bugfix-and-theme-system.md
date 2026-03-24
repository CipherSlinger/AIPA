# Bug Fix & Theme System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 2 bugs (DevTools auto-open, input unresponsive) and add 3 switchable CSS-variable themes selectable from the settings panel.

**Architecture:** CSS custom properties on `[data-theme]` attribute for zero-flicker theming; `theme` field added to `ClaudePrefs` type and persisted via existing electron-store prefs IPC; `App.tsx` applies the attribute reactively; `SettingsPanel.tsx` adds a swatch-based theme picker that triggers an immediate live preview.

**Tech Stack:** Electron 39, React 18, TypeScript, CSS custom properties, Zustand, electron-store

---

## File Map

| File | Change |
|------|--------|
| `src/main/index.ts` | Delete `openDevTools()` call in production branch |
| `src/renderer/hooks/useStreamJson.ts` | Remove lines that overwrite session ID with bridge ID |
| `src/renderer/types/app.types.ts` | Add `theme` field to `ClaudePrefs` |
| `src/renderer/store/index.ts` | Add `theme: 'vscode'` to `DEFAULT_PREFS` |
| `src/renderer/styles/globals.css` | Add `[data-theme="modern"]` and `[data-theme="minimal"]` variable blocks |
| `src/renderer/App.tsx` | Add `useEffect` to apply `data-theme` on `prefs.theme` changes |
| `src/renderer/components/settings/SettingsPanel.tsx` | Add theme picker section with live preview |

---

## Task 1: Fix DevTools Auto-Open

**Files:**
- Modify: `src/main/index.ts:34–37`

- [ ] **Step 1: Open `src/main/index.ts` and locate the else branch (lines 34–37)**

The current else branch looks like:
```ts
} else {
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  mainWindow.webContents.openDevTools()   // ← this line must go
}
```

- [ ] **Step 2: Delete the `openDevTools()` call from the else branch**

Result:
```ts
} else {
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
}
```

The `openDevTools()` call in the `if (isDev)` branch (line 33) stays untouched.

- [ ] **Step 3: Rebuild main process and verify**

```bash
cd C:/Users/osr/Desktop/AIPA/electron-ui
npx tsc -p tsconfig.main.json --noEmit
```
Expected: no errors.

- [ ] **Step 4: Launch app and verify DevTools does NOT open**

```bash
node_modules/.bin/electron dist/main/index.js
```
Expected: app opens, no DevTools window.

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts
git commit -m "fix: remove openDevTools from production branch"
```

---

## Task 2: Fix Input/Session ID Bug

**Files:**
- Modify: `src/renderer/hooks/useStreamJson.ts:36–38`

**Background:** After `cliSendMessage` resolves, the IPC handler returns `{ success: true, sessionId: bridgeId }` where `bridgeId` is an internal ID like `"bridge-1704123456789"`. Lines 36–38 in `useStreamJson.ts` call `setSessionId(result.sessionId)`, writing this bridge ID into `useChatStore.currentSessionId`. On the next message send, this bridge ID is passed as `args.sessionId`, which `ipc/index.ts:82` uses as `resumeSessionId` for `--resume`. The CLI rejects it (no such Claude session), exits non-zero, and the renderer gets nothing.

The fix: delete lines 36–38. The real Claude session ID is already correctly captured via the `cli:result` push event handler (lines 81–85 in `useStreamJson.ts`), which sets `currentSessionId` from `data.claudeSessionId`.

- [ ] **Step 1: Open `src/renderer/hooks/useStreamJson.ts` and locate lines 36–38**

```ts
if (result?.sessionId) {
  setSessionId(result.sessionId)
}
```

- [ ] **Step 2: Delete those 3 lines**

After deletion, `sendMessage` ends with:
```ts
    return result
  }
```

- [ ] **Step 3: Rebuild renderer and verify TypeScript**

```bash
npx tsc -p tsconfig.renderer.json --noEmit
```
Expected: no errors.

- [ ] **Step 4: Build and test manually**

```bash
node_modules/.bin/electron dist/main/index.js
```

1. Open the settings sidebar, enter a valid `ANTHROPIC_API_KEY`
2. Save settings
3. Type a message in the chat input and press Enter
4. Expected: message appears in chat, assistant response streams in
5. Send a second message in the same session
6. Expected: Claude responds with context from earlier in the conversation (proving `--resume` works with real session ID)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/hooks/useStreamJson.ts
git commit -m "fix: remove bridge ID overwriting real Claude session ID"
```

---

## Task 3: Add Theme Types and Default

**Files:**
- Modify: `src/renderer/types/app.types.ts:45–55`
- Modify: `src/renderer/store/index.ts:122–132`

- [ ] **Step 1: Add `theme` to `ClaudePrefs` interface in `app.types.ts`**

Add after the `verbose: boolean` line:
```ts
export interface ClaudePrefs {
  apiKey: string
  model: string
  workingDir: string
  sidebarWidth: number
  terminalWidth: number
  fontSize: number
  fontFamily: string
  skipPermissions: boolean
  verbose: boolean
  theme: 'vscode' | 'modern' | 'minimal'   // ← add this
}
```

- [ ] **Step 2: Add `theme: 'vscode'` to `DEFAULT_PREFS` in `store/index.ts`**

In the `DEFAULT_PREFS` object (around line 122):
```ts
const DEFAULT_PREFS: ClaudePrefs = {
  apiKey: '',
  model: 'claude-sonnet-4-6',
  workingDir: '',
  sidebarWidth: 240,
  terminalWidth: 400,
  fontSize: 14,
  fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
  skipPermissions: false,
  verbose: false,
  theme: 'vscode',   // ← add this
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc -p tsconfig.renderer.json --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/types/app.types.ts src/renderer/store/index.ts
git commit -m "feat: add theme field to ClaudePrefs type and defaults"
```

---

## Task 4: Add CSS Theme Variables

**Files:**
- Modify: `src/renderer/styles/globals.css`

- [ ] **Step 1: Open `globals.css` and append the two new theme blocks after the existing `:root` block (after line 23)**

```css
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

- [ ] **Step 2: Manually verify the CSS applies by temporarily setting `data-theme="modern"` on `<html>` in browser DevTools**

Open DevTools (View → Toggle DevTools), run in console:
```js
document.documentElement.setAttribute('data-theme', 'modern')
```
Expected: entire UI recolors to the GitHub dark palette immediately.

Test minimal:
```js
document.documentElement.setAttribute('data-theme', 'minimal')
```
Expected: UI shifts to pure black + purple accent.

Reset:
```js
document.documentElement.removeAttribute('data-theme')
```
Expected: VS Code theme restored.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/styles/globals.css
git commit -m "feat: add modern and minimal CSS theme variable blocks"
```

---

## Task 5: Apply Theme Reactively in App.tsx

**Files:**
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Add `prefs` to the destructured values from `usePrefsStore` in `App.tsx`**

Current line 8:
```ts
const { setPrefs, setLoaded } = usePrefsStore()
```

Change to:
```ts
const { prefs, setPrefs, setLoaded } = usePrefsStore()
```

- [ ] **Step 2: Add a `useEffect` that watches `prefs.theme` and applies `data-theme` to `<html>`**

Add after the existing `useEffect` blocks (before the `return <AppShell />`):

```ts
// Apply theme
useEffect(() => {
  const theme = prefs.theme || 'vscode'
  if (theme === 'vscode') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', theme)
  }
}, [prefs.theme])
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc -p tsconfig.renderer.json --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat: apply data-theme attribute reactively from prefs"
```

---

## Task 6: Add Theme Picker to Settings Panel

**Files:**
- Modify: `src/renderer/components/settings/SettingsPanel.tsx`

- [ ] **Step 1: Add theme data constant near the top of `SettingsPanel.tsx` (after the `MODELS` array)**

```ts
const THEMES: { id: 'vscode' | 'modern' | 'minimal'; label: string; colors: string[] }[] = [
  {
    id: 'vscode',
    label: 'VS Code',
    colors: ['#1e1e1e', '#007acc', '#264f78', '#2d2d2d'],
  },
  {
    id: 'modern',
    label: '现代深色',
    colors: ['#0d1117', '#2f81f7', '#1f3a5f', '#161b22'],
  },
  {
    id: 'minimal',
    label: '极简暗色',
    colors: ['#111111', '#a855f7', '#1e1033', '#1a1a1a'],
  },
]
```

- [ ] **Step 2: Add the theme picker section inside `SettingsPanel` JSX, before the Save button**

Insert after the CLI options `field(...)` block and before the save `<button>`:

```tsx
{/* Theme */}
{field('界面主题', (
  <div style={{ display: 'flex', gap: 8 }}>
    {THEMES.map((t) => {
      const isActive = (local.theme || 'vscode') === t.id
      return (
        <button
          key={t.id}
          onClick={() => {
            setLocal({ ...local, theme: t.id })
            setPrefs({ theme: t.id })
            window.electronAPI.prefsSet('theme', t.id)
          }}
          title={t.label}
          style={{
            flex: 1,
            border: `2px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 6,
            padding: '6px 4px',
            background: t.colors[0],
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {/* Mini color swatches */}
          <div style={{ display: 'flex', gap: 2 }}>
            {t.colors.map((c, i) => (
              <div
                key={i}
                style={{ width: 10, height: 10, borderRadius: 2, background: c }}
              />
            ))}
          </div>
          <span style={{ fontSize: 9, color: '#aaa', whiteSpace: 'nowrap' }}>{t.label}</span>
        </button>
      )
    })}
  </div>
))}
```

**Important:** Theme switching calls `setPrefs` and `prefsSet` immediately (no Save button needed) to give live preview. The `local` state is still updated so it persists if the user later clicks Save for other fields.

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc -p tsconfig.renderer.json --noEmit
```
Expected: no errors.

- [ ] **Step 4: Build and do full manual test**

```bash
npx tsc -p tsconfig.main.json && npx tsc -p tsconfig.preload.json && npx tsc -p tsconfig.renderer.json
node_modules/.bin/electron dist/main/index.js
```

Test checklist:
1. App opens — no DevTools popup ✓
2. Open settings sidebar → see 3 theme buttons
3. Click "现代深色" → entire UI recolors immediately, no save needed
4. Click "极简暗色" → purple accent theme applies
5. Click "VS Code" → returns to original blue theme
6. Close and reopen app → selected theme is restored (persisted in electron-store)
7. Type a message, press Enter → assistant responds ✓
8. Send a second message → assistant has context from first message ✓

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/settings/SettingsPanel.tsx
git commit -m "feat: add theme picker to settings panel with live preview"
```

---

## Done

All tasks complete. The app should have:
- No DevTools on launch
- Working chat input with correct session resumption
- 3 switchable themes persisted across restarts
