---
name: automation-engine-and-attention
description: Automation runner engine strategy (reuses auxiliary resolver, Claude runs persist real sessions) and how finished runs reach the pet without double notifications
metadata:
  type: project
---

# Automation engine strategy + attention wiring

Decided 2026-10-28. Automations used to open a Codex app-server unconditionally, so Claude-only profiles could chat but never run a job.

- **Engine:** `runAutomation` calls `resolveAuxiliaryEngine()` (see [[auxiliary-engine-routing]]) and wraps either a `CodexBridge` or a `StreamBridge` in one `EngineRun` interface; prompt sequencing, deadline, abort and status bookkeeping live once in `runAutomation`.
- **Claude path:** session-mode `StreamBridge`, `permissionMode: 'acceptEdits'`, permission/plan requests auto-denied, persistence left ON. The openable id is the result envelope's real `claudeSessionId` (JSONL session), never the internal bridge id; failed turns also return it so the failure bubble can open the partial transcript.
- **Success bubble:** new pet attention kind `automation-done` (not `plugin-done`, whose click path opens a plugin). Failures reuse `failed`.
- **Single notification rule:** `raiseAttention` returns whether the pet will show this item now (quiet rule + no current bubble + show backoff + `pickNext`). The scheduler skips its own `Notification` only when that returns true; otherwise the native notification is the fallback. This changed `raiseAttention` from `void` to `boolean` for all callers.

**Why:** the profile's resolved engine, not the binary present on disk, decides what can authenticate; and the pet must replace, not duplicate, the scheduler's notification.

**How to apply:** any future automation engine (OpenAI/Ollama) plugs into `EngineRun`; do not add a second engine resolver. Any new main-process "job finished" surface should call `raiseAttention` and respect its boolean before showing a native notification.
