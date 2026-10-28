---
name: plugin-chat-capability
description: How plugin chat.ask is shaped (private vs visible, continuation, rails, routing); the visible-mode blocker is resolved; includes the sandbox enum fix that unblocked plan-mode internal turns
metadata:
  type: project
---

`chat.ask` (2026-10-28) lets a plugin ask the assistant a question and receive the answer as the `aipa:invoke` result. It is gated by the manifest permission `chat` and runs through `runInternalTurn`. Two shapes:

- **private** (default): ephemeral, leaves no session;
- **visible** (`visible: true`): persists a conversation the user can open in the archive, and returns `{ text, sessionId }`. A visible success with no openable id fails rather than returning an internal bridge id.

**Continuation (2026-10-29):** `sessionId` from an earlier visible ask continues that conversation — Codex via `thread/resume`, the legacy Claude bridge via `--resume`. Ownership is checked against the plugin origin ledger (`session-origins.ts`), never inferred from the id shape: a plugin may only continue a conversation recorded to *that* plugin. Refusals are typed and happen before any spawn — `session_not_found`, `session_not_plugin`, `session_owned_by_other_plugin`, `session_engine_unsupported`, `session_requires_visible` (private ask carrying an id). `PluginHostView` must forward `sessionId`, or the capability is unreachable from `aipa:invoke`.

The old blocker — "the automation runner returns only a summary, so visible mode would hand back the wrong text" — is gone: plugins go through `runInternalTurn`, which returns the full turn text with the persisted session id.

**How to apply:**
- Rails live in `src/main/plugins/plugin-chat.ts`: 2 concurrent turns per plugin, 10 asks per rolling minute, 60 s default timeout clamped to 5 s…10 min, 100 k prompt cap. Errors are `[code] message`; `PluginHostView` lifts the code into `aipa:response.code`.
- Provider routing matches `ai.generate` via `resolvePluginTurnTarget()`; otherwise the default engine runs the turn.
- Attribution: the plugin id is embedded in the internal bridge id (`internal-plugin-<id>-<n>-bridge-…`) through `internalTag`.
- Answer-only on the Claude path adds `--tools ""`; Codex relies on plan mode's read-only sandbox.

**Resolved 2026-10-28 (Codex owner):** the sandbox enum mismatch (app-server 0.145 rejects `readOnly`, expects `read-only`) is fixed — `resolveCodexSandbox` now returns the literals from `CODEX_SANDBOX` in `codex-bridge.ts`, and the bridge still normalizes legacy camelCase from callers. See [[codex-app-server-protocol-0-145]].
