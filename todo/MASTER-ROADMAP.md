# AIPA Master Roadmap

**Last Updated**: 2026-03-26
**Maintained by**: aipa-pm

---

## Completed Iterations

### Sprint 1 (2026-03-26)
- Security hardening (CSP, safeStorage, IPC validation, path sandboxing, env sanitization)
- Engineering quality (shared CLI path, structured logging, error boundaries)
- Performance (RAF batching, React.memo, resize throttle)
- UX foundations (Toast system, Skeleton components)
- Feature prep (Save dialog IPC, export IPC, session search store state)

### Sprint 1 Bugfix (2026-03-26)
- 6 code quality and security fixes from test report

---

## Current Sprint: Sprint 2

### In Progress

| Feature | PRD | Priority | Status |
|---------|-----|----------|--------|
| Conversation Export | `prd-conversation-export-v1.md` | P0 | DONE (Iteration 1) |
| File Drag-and-Drop | `prd-file-dragdrop-v1.md` | P0 | DONE (Iteration 1) |
| Command Palette | `prd-command-palette-v1.md` | P1 | DONE (Iteration 2) |
| Session Title Auto-Refresh | `prd-session-title-refresh-v1.md` | P1 | DONE (Iteration 2) |

### Queued for Sprint 3

| Feature | Priority | Notes |
|---------|----------|-------|
| Session Auto-Title | P1 | Backend `session:generateTitle` exists; need UI trigger on conversation end |
| Command Palette | P1 | Menu entry + Ctrl+Shift+P wired; need `CommandPalette.tsx` component |
| Wire Skeleton loaders | P1 | Components exist; need integration into SessionList/MessageList |
| Session search polish | P1 | Store state exists; need search highlighting |

### Queued for Sprint 4

| Feature | Priority | Notes |
|---------|----------|-------|
| Keyboard shortcuts system | P2 | Global shortcut manager + configurable bindings |
| Conversation branching UI | P1 | Backend fork/rewind exists; need visual branch tree |
| Array-based content accumulation | P0-perf | Fix O(n^2) string concat in appendTextDelta |
| Message virtualization | P1-perf | react-virtuoso for 100+ message conversations |

### Backlog (Sprint 5+)

| Feature | Priority | Notes |
|---------|----------|-------|
| Multi-tab conversations | P2 | Major architectural addition |
| TypeScript strict mode | P1-eng | Substantial type error fixing |
| Vitest test foundation | P1-eng | Requires npm install + config |
| GitHub Actions CI | P1-eng | Build + lint pipeline |
| ARIA accessibility audit | P1-ux | Screen reader support |
| Inline styles -> Tailwind migration | P2-eng | ~8h effort |
| Node.js runtime bundling | P2-dist | Bundle Node.js for zero-dep install |
| Auto-update | P2-dist | electron-updater + GitHub Releases |
| macOS/Linux builds | P2-dist | Cross-platform electron-builder config |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-26 | Sprint 2 focuses on Export + Drag-and-Drop | Both complete the "doer" loop (files in, output out). Both have backend support ready. Highest user-facing value per effort. |
| 2026-03-26 | electron-store stays at v8 | v10+ is ESM-only, breaks main process CJS require chain |
| 2026-03-26 | No new npm dependencies in Sprint 2 | Both features can be built with existing APIs |
