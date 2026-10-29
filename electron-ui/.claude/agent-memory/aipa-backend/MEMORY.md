# aipa-backend memory index

- [WeChat companion constraints](wechat-companion-constraints.md) — measured Win32/OCR limits behind the WeChat reply-companion verdict; don't re-derive
- [Main-process module conventions](electron-main-ipc-conventions.md) — how new `src/main/<feature>/` modules are structured, FFI rules, proto-before-func order
- [Internal turn isolation](internal-turn-isolation.md) — background turns use `cli:runInternal` + `internal-` bridge ids; renderer result/session invariant must not regress
- [Automation scheduler](automation-scheduler.md) — own 15 s ticker + `automations.json`, missed-run rule, rails, watch triggers (`nextRunAt` null for life), `automation:*` IPC surface
- [Plugin chat capability](plugin-chat-capability.md) — `chat.ask` is private-only, rails, routing, and the Codex 0.145 sandbox enum mismatch
- [Plugin schedule capability](plugin-schedule-capability.md) — `schedule` creates/list/deletes a plugin's own jobs; recorded `originPluginId`, prompt-only, no watch triggers
- [Codex app-server 0.145 protocol](codex-app-server-protocol-0-145.md) — rename/rollback/input variants/enums, and why `mention` is not an attachment path
- [Pet attention notifications](pet-attention-notifications.md) — pet bubble replaces native notification for approvals/questions/failures/plugin jobs; per-session suppression, chooser for batches
- [Claude CLI ephemeral flag](claude-cli-ephemeral-flag.md) — `--no-session-persistence` works in session mode with piped stdio; PTY-only failure is a false alarm
- [Dept cap "frees at" forecast](dept-budget-frees-forecast.md) — rail holds at `>= cap` with float epsilon; forecast keys on `unreportedRuns`, not `unmeasured`
