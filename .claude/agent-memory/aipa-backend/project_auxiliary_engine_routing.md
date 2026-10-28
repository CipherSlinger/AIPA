---
name: auxiliary-engine-routing
description: How hidden LLM features (prompt suggestion, away summary, titles, speculation) choose an engine, and which paths stay Claude-only
metadata:
  type: project
---

Hidden/background LLM features resolve their engine through `src/main/llm/auxiliary-engine.ts` (`resolveAuxiliaryEngine()`), then run via the private `cli:runInternal` turn.

Rule, in order:
1. Codex when the Codex CLI resolves **and** there is an OpenAI-style key (`sk-` but not `sk-ant-`), `OPENAI_API_KEY`, or `~/.codex/auth.json` (honours `CODEX_HOME`).
2. The active provider (pref `activeProviderId`, not `claude-cli`, enabled, has a credential) merged through `buildCliEnv`, **only if** the legacy Claude CLI binary exists.
3. The legacy Claude CLI when `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN`, an `sk-ant-` stored key, or `~/.claude/.credentials.json` exists.
4. Otherwise `{ kind: 'none' }` → feature returns empty, one INFO line `Hidden LLM features are off: …` per process.

**Why:** a Codex-only machine used to spawn the Claude CLI for these features and either fail or hit an unconfigured account; a legacy-only machine broke when internal turns defaulted to Codex. Titles never needed a model at all — `session:generateTitle` now derives locally from the description (`deriveSessionTitle`), because the CLI never shipped a title subcommand.

**How to apply:** any new background/hidden prompt must go through `runAuxiliaryPrompt` / `runInternalTurn`, never `getCliPath()` directly, and must treat an empty string as the feature's "off" state. Speculation (`speculation:run`) is deliberately Claude-CLI-only (isolated overlay + `--print`); it returns `{ error: 'engine_unavailable' }` on Codex. Provider credentials are only used when the provider is the user's active selection — never as a silent fallback. Related: [[clawd-ipc-channels]].
