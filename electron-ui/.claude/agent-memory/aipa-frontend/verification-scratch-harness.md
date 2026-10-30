---
name: verification-scratch-harness
description: AIPA renderer regressions must be proven in a scratch-profile Electron harness under %LOCALAPPDATA%/Temp, never in the real profile
metadata:
  type: feedback
---

Prove renderer regressions by driving the built app in a throwaway Electron
harness, not by reading code. The harness lives outside the repo (e.g.
`C:/Users/jiany/AppData/Local/Temp/aipa-shot/*.js`), calls
`app.setPath('userData', <scratch dir>)` **before** `require(.../dist/main/index.js)`,
and seeds `claude-code-ui-prefs.json` (set `workingDir` at the repo so real
transcripts are visible read-only).

**Why:** the user has hit the collision where several harnesses share
`%APPDATA%/Electron` and silently overwrite the real profile's localStorage.
Restarting or driving the user's own running app is also off-limits.

**How to apply:** for every user-visible fix, build first (`npm run build`),
then run the harness against `dist/main/index.js`; count IPC by swapping the
entry in `ipcMain._invokeHandlers` (the renderer's contextBridge object is
frozen, so wrapping `window.electronAPI` there does not stick); wait by
polling for rendered rows rather than fixed sleeps on large transcripts; and
capture `webContents.capturePage()` before/after for visual evidence. Two
gotchas: a window moved off-screen never repaints on Windows and `capturePage`
then returns the first blank/skeleton frame, so keep the harness window visible
(or show it inactive at a corner); and a fresh profile opens the first-run
wizard, so seed `{ onboardingDone: true }` into the same prefs file or the
screenshots only show the modal.
