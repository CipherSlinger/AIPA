---
name: codex-app-server-protocol-0-145
description: Verified Codex 0.145 app-server wire facts (rename, rollback, input variants, sandbox enums, developerInstructions) that took binary probing to establish
metadata:
  type: project
---

The `codex/` sparse checkout can be empty, so the protocol spec is not always
readable. These facts were established against the installed 0.145.0 binary
(`@openai/codex` is pinned `^0.145.0`, i.e. 0.145.x) by sending malformed
params: unknown fields are ignored, but a wrong type/variant on a *known* field
returns "invalid type" / "unknown variant … expected one of", which enumerates
the schema. Reuse that technique if the version moves.

**Methods that exist and were exercised**
- `thread/name/set {threadId, name}` → `{}`. Trims whitespace; rejects empty
  ("thread name must not be empty"). Persists to `CODEX_HOME/session_index.jsonl`
  (`{id, thread_name, updated_at}`) and `state_5.sqlite`; survives process
  restart. Emits notification `thread/name/updated {threadId, threadName}`.
  Works on a thread that is not loaded — no `thread/resume` needed.
- `thread/rollback {threadId, numTurns}` (numTurns ≥ 1) → `{thread}`. Really
  truncates: 2 turns → 1, and the next turn's model request no longer contains
  the removed turn. **But the binary says "thread/rollback is deprecated and
  will be removed soon"** — don't build UI on it.
- `thread/metadata/update` requires `gitInfo`; it is not a rename path.
- `thread/list` returned `[]` in scratch homes even with live legacy threads;
  AIPA reads rollout JSONL + `session_index.jsonl` directly instead.

**`turn/start` input variants** (`UserInput`): `text{text}`, `image{url}`,
`localImage{path}`, `audio{url}`, `localAudio{path}`, `skill{name,path}`,
`mention{name,path}`. There is **no document/file variant**.

**`mention` does not attach files.** With a local mock Responses server
capturing the model request, a `mention` of an existing file was absent from
the request body entirely — the file path and contents never reached the
model, with or without `[features] mentions_v2 = true`. Treat mentions as a TUI
completion concept, not an attachment transport. This is why the composer
keeps inlining text and apologising for binary files.

**Enums (0.145)**
- `sandbox`: `read-only | workspace-write | danger-full-access` (kebab-case).
- `approvalPolicy`: `untrusted | on-request | granular | never`; `granular` is a
  struct variant. Legacy `always` ≈ `untrusted`, `unless-allow-listed` ≈
  `on-request`.
- `historyMode`: `legacy | paginated`.

**Instructions**: `thread/start` and `thread/resume` both accept
`developerInstructions` and `baseInstructions` (strings). Developer
instructions are persisted in the rollout, so a resume inherits them without
resending (verified after a full restart).

See [[plugin-chat-capability]] for the incident where camelCase sandbox values
disabled every internal read-only turn.
