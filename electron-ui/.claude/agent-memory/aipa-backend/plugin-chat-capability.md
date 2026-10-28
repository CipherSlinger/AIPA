---
name: plugin-chat-capability
description: How plugin chat.ask is shaped (private-only, rails, routing) and why visible sessions are refused; includes the sandbox enum fix that unblocked plan-mode internal turns
metadata:
  type: project
---

`chat.ask` (2026-10-28) lets a plugin ask the assistant a question and receive the answer as the `aipa:invoke` result. It is gated by the manifest permission `chat`, runs through `runInternalTurn`, and is **private only**.

**Why private only:** the automation runner can create visible threads, but it returns only a 280-character `summary`, not the answer. Reusing it would hand the plugin the wrong text, and duplicating bridge wiring was explicitly out of scope. `visible: true` therefore fails with code `unsupported`; add visible mode only after the runner exposes the full turn text.

**How to apply:**
- Rails live in `src/main/plugins/plugin-chat.ts`: 2 concurrent turns per plugin, 10 asks per rolling minute, 60 s default timeout clamped to 5 s…10 min, 100 k prompt cap. Errors are `[code] message`; `PluginHostView` lifts the code into `aipa:response.code`.
- Provider routing matches `ai.generate` via `resolvePluginTurnTarget()`; otherwise the default engine runs the turn.
- Attribution: the plugin id is embedded in the internal bridge id (`internal-plugin-<id>-<n>-bridge-…`) through `internalTag`.
- Answer-only on the Claude path adds `--tools ""`; Codex relies on plan mode's read-only sandbox.

**Resolved 2026-10-28 (Codex owner):** the sandbox enum mismatch (app-server 0.145 rejects `readOnly`, expects `read-only`) is fixed — `resolveCodexSandbox` now returns the literals from `CODEX_SANDBOX` in `codex-bridge.ts`, and the bridge still normalizes legacy camelCase from callers. See [[codex-app-server-protocol-0-145]].
