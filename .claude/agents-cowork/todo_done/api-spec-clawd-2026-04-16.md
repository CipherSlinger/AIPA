# API Spec: Clawd Desktop Pet Integration
_Date: 2026-04-16_

## New IPC Channels

### `clawd:launch`
**Direction**: renderer → main (invoke)
**Parameters**: none
**Returns**: `{ success: boolean; alreadyRunning?: boolean; error?: string }`
**Description**: Launches the Clawd desktop pet process if it is not already running. Reads `~/.clawd/runtime.json` to health-check before spawning. Safe to call multiple times — will not spawn a duplicate if already running.

### `clawd:isRunning`
**Direction**: renderer → main (invoke)
**Parameters**: none
**Returns**: `{ running: boolean }`
**Description**: Returns whether the Clawd HTTP server is currently reachable on the runtime port. Useful for displaying status in UI.

## New Preload API

```typescript
window.electronAPI.clawdLaunch(): Promise<{ success: boolean; alreadyRunning?: boolean; error?: string }>
window.electronAPI.clawdIsRunning(): Promise<{ running: boolean }>
```

## New Pref Field

```typescript
// ClaudePrefs
clawdEnabled?: boolean   // default: false
```

Persisted via electron-store (`prefs:set` / `prefs:get`). The settings UI toggle in SettingsGeneral already handles this; no additional frontend work needed unless a more prominent UI surface is desired.

## Automatic State Notifications

The main process automatically notifies Clawd of session state changes when bridge events fire. No renderer-side action is needed for the pet to animate — it happens transparently in the main process:

| Bridge event | Clawd state |
|---|---|
| `textDelta` | `thinking` |
| `thinkingDelta` | `thinking` |
| `toolUse` | `working` |
| `result` | `happy` |
| `apiError` | `error` |
| `notification` | `notification` |
| `processExit` | `idle` |

Notifications are debounced at 500 ms and silently ignored if Clawd is not running.
