# PRD: App Startup Resilience & Black Screen Prevention

_Version: v1 | Date: 2026-04-03 | Author: aipa-pm_

## Background

User reported: "Unable to display the interface normally, showing a black screen with no content loaded." This is a critical usability issue -- when the renderer fails to initialize (due to preference corruption, script errors, network issues in dev mode, or Electron IPC failures), the user sees nothing and has no way to recover.

## In Scope

### 1. HTML-Level Loading Splash Screen
- Add a pure HTML+CSS loading indicator directly in the renderer index.html (not in React)
- This ensures something is visible even before React mounts
- The splash shows:
  - AIPA logo text (centered)
  - A subtle CSS-only loading animation (spinner or pulsing dots)
  - App version number
- The splash is automatically hidden when React App component mounts and calls a removeSplash() function
- If React fails to mount within 10 seconds, the splash transitions to an error state showing: "App failed to load. Click to reload." with a reload button that calls location.reload()

### 2. Renderer Init Error Catching
- Wrap the React root createRoot().render() call in a try-catch in main.tsx
- If the initial render throws, display a minimal error page (plain HTML, no React dependency) showing:
  - The error message and stack trace
  - A "Reload App" button
  - A "Reset Preferences" button (calls IPC to clear electron-store, then reloads -- handles corrupted prefs causing crashes)
  - A "Open DevTools" button (sends IPC to main process to open devtools for debugging)

### 3. Preference Loading Resilience
- In App.tsx, wrap the prefsGetAll() call in try-catch
- If preferences fail to load (corrupted store, IPC failure), use sensible defaults instead of crashing
- Show a non-blocking toast: "Preferences could not be loaded, using defaults"
- Log the error to the main process logger via IPC

### 4. Window Ready Event from Main Process
- In main/index.ts, listen for did-finish-load event on the webContents
- Set a 15-second timeout after loadURL/loadFile -- if did-finish-load never fires:
  - Log the error
  - Attempt to reload the page once (webContents.reload())
  - If the second attempt also times out (another 15s), show a native Electron dialog with error details and an option to reset the app

## Out of Scope
- Crash reporting to external services
- Full app state persistence/recovery across crashes
- Auto-updater improvements
- Main process crash handling (already handled by Electron built-in crash reporter)

## Acceptance Criteria
- [ ] Opening the app shows a loading splash immediately (before React renders)
- [ ] If React fails to mount, user sees an error screen with reload option within 10 seconds
- [ ] Corrupted preferences do not cause a white/black screen -- app loads with defaults
- [ ] Main process detects renderer load failure and attempts recovery
- [ ] All new UI text has i18n support (en.json + zh-CN.json) where applicable
- [ ] The loading splash is visually consistent with the app dark theme

## Technical Notes
- The HTML splash in index.html must use inline styles only (no CSS file dependency)
- The splash removal should be called from App.tsx useEffect after initial render, not from a timer
- The 10-second fallback timer in the splash should use a simple setTimeout in a script tag in index.html
- Reset preferences IPC: add a prefs:resetAll handler if not exists, which calls store.clear() and reloads

## Priority
P0 -- Critical bug fix, users cannot use the app at all when this occurs
