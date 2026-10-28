---
name: internal-turn-isolation
description: Why background CLI turns use cli:runInternal / the internal- bridge prefix, and the renderer invariant that keeps them out of the open chat
metadata:
  type: project
---

Background turns (auto-memory extraction, away summary) must go through `cli:runInternal`, never `cli:sendMessage`. Their bridges have an `internal-` id prefix and their events are consumed by a private sink in `src/main/ipc/index.ts`; the invoke resolves with the final text.

**Why:** `useStreamJson` subscribes with `onCliEvent(null)` — every bridge — and `chatStore.appendTextDelta` used to accept any session's tokens. A background job's output was rendered into whatever conversation was open, and its `cli:result` could reassign `currentSessionId`. Fixed 2026-10-28 after a user-visible leak.

**How to apply:**
- New background work: `window.electronAPI.cliRunInternal({ prompt, cwd, model, timeoutMs })` and read `result.text`. Don't sleep-and-scrape `useChatStore().messages`.
- Prompts sent by internal turns are read-only (`permissionMode: 'plan'`, Codex `approvalPolicy: 'never'`), never resume a conversation, and deny permission requests silently.
- Send `ephemeral: true`: Codex's `thread/start` then writes no rollout. On the legacy Claude path `StreamBridge` now forwards it as `--no-session-persistence` (2026-10-28), so an internal Claude turn writes no JSONL either — harness-verified (archive stayed empty).
- Engine dispatch inside `runInternalTurn` keys on the *presence* of `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN`, not on the API key's truthiness. A gateway config sets an empty API key plus an auth token; the old truthiness test sent it to Codex and failed auth/thread-start.
- Settle on `cli:result`, not `cli:messageEnd`. Claude emits `message_stop` per assistant message (long before the turn ends); settling there returned partial text and aborted the bridge. Codex's `cli:result` comes from `turn/completed`. Keep the timeout race as the only other exit.
- Renderer invariant in `useStreamJson`: drop `internal-`/`internal:true` events up front; accept a `cli:result` only when it is the bridge this hook started, carries the on-screen engine session id, or the conversation has no real id yet (`null` / `pending-`).
- `chatStore.streamSessionId` is the second gate for streamed deltas; set it for CLI *and* provider bridges in `sendMessage`, or provider streaming goes blank.
- If the chat listener ever starts rendering a new event type, extend the internal guard there too.
