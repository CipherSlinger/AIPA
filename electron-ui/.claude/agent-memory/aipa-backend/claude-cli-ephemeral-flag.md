---
name: claude-cli-ephemeral-flag
description: --no-session-persistence is accepted in session mode because the app's piped stdio counts as non-interactive; it only fails under a real PTY
metadata:
  type: project
---

The bundled Claude CLI (`package/cli.js` 2.1.81) documents `--no-session-persistence` as "only works with --print", but its actual guard is `sessionPersistence === false && !isNonInteractive`, where `isNonInteractive` is true when any of `--print`, `--init-only`, `--sdk-url` is present or **stdout is not a TTY**.

**Why:** AIPA's StreamBridge always spawns with `stdio: ['pipe','pipe','pipe']`, so stdout is never a TTY and the flag passes even in session mode; `shouldSkipPersistence()` then suppresses the JSONL transcript. Under a real PTY (node-pty probe) the same argv exits 1 with `Error: --no-session-persistence can only be used with --print mode.` A code review once concluded the flag was broken in session mode by reading the help text instead of the guard. Verified with a mock Messages API: with the flag the turn completes and leaves no `.jsonl`; without it a transcript appears.

**How to apply:** keep `--no-session-persistence` gated on `ephemeral`, not on `--print`; if a future CLI version changes the guard, re-run the probe instead of trusting the help text. Do not add `--print` to session-mode turns just to satisfy the flag. See [[internal-turn-isolation]].
