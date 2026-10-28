# aipa-backend memory index

- [WeChat companion constraints](wechat-companion-constraints.md) — measured Win32/OCR limits behind the WeChat reply-companion verdict; don't re-derive
- [Main-process module conventions](electron-main-ipc-conventions.md) — how new `src/main/<feature>/` modules are structured, FFI rules, proto-before-func order
- [Internal turn isolation](internal-turn-isolation.md) — background turns use `cli:runInternal` + `internal-` bridge ids; renderer result/session invariant must not regress
- [Automation scheduler](automation-scheduler.md) — why its own 15 s ticker + `automations.json`, missed-run rule, rails, `automation:*` IPC surface
