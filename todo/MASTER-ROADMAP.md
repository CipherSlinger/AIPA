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

### Sprint 3 (2026-03-26)

| Feature | Priority | Status |
|---------|----------|--------|
| Session Auto-Title | P1 | DONE (Sprint 2 Iteration 2) |
| Command Palette | P1 | DONE (Sprint 2 Iteration 2) |
| Wire Skeleton loaders | P1 | DONE (Sprint 2 Iteration 1 - SessionList) |
| Session search polish | P1 | DONE (Sprint 2 Iteration 1 - highlighting) |
| Global Keyboard Shortcuts | P2 | DONE (Sprint 2 Iteration 4) |
| Message Context Menu | P1 | DONE (Iteration 5) |
| File Browser in Sidebar | P1 | DONE (Iteration 7) |

### Queued for Sprint 4

| Feature | Priority | Notes |
|---------|----------|-------|
| Settings About section | P2 | DONE (Iteration 16) |
| Array-based content accumulation | P0-perf | DONE (Iteration 17) - RAF-throttled streaming buffer |
| Conversation branching UI | P1 | Backend fork/rewind exists; need visual branch tree |
| Message virtualization | P1-perf | DONE (Iteration 18) - @tanstack/react-virtual |
| Double RAF fix + elapsed timer | P1-fix | DONE (Iteration 19) |
| Cumulative session cost | P1 | DONE (Iteration 20) |
| Conversation search (Ctrl+F) | P1 | DONE (Iteration 21) |
| Session sort options | P2 | DONE (Iteration 22) |
| Draft auto-save + char count | P2 | DONE (Iteration 23) |
| Input history navigation | P2 | DONE (Iteration 24) |
| External links + Markdown headings | P1 | DONE (Iteration 25) |
| Completion sound + relative timestamps | P2 | DONE (Iteration 26) |
| GFM checkboxes + message bookmarks | P2 | DONE (Iteration 27) |
| Word count tooltip + compact mode | P2 | DONE (Iteration 28) |
| Delete confirmation + scroll memory | P2 | DONE (Iteration 29) |
| Copy as Markdown + shortcut cheatsheet | P2 | DONE (Iteration 30) |
| System message styling + typing indicator | P2 | DONE (Iteration 31) |
| Session count badge + welcome quick actions | P2 | DONE (Iteration 32) |
| Collapsible code blocks + line count | P2 | DONE (Iteration 33) |
| Date separators + focus mode | P2 | DONE (Iteration 34) |
| Bookmarks dropdown panel | P2 | DONE (Iteration 35) |
| Unread count badge + double-click copy | P2 | DONE (Iteration 36) |
| Session pinning / starring | P2 | DONE (Iteration 37) |
| Message collapse / expand | P2 | DONE (Iteration 38) |
| Conversation statistics panel | P2 | DONE (Iteration 39) |
| Collapse all/expand all + raw markdown toggle | P2 | DONE (Iteration 40) |
| Collapse/expand all shortcut + message count | P2 | DONE (Iteration 41) |
| Scroll progress indicator + session navigation | P2 | DONE (Iteration 42) |
| Image lightbox + window title notification | P2 | DONE (Iteration 43) |
| Ctrl+K clear + streaming spinner | P2 | DONE (Iteration 44) |
| Enhanced tables + responsive sidebar | P2 | DONE (Iteration 45) |
| Persistent sort + clear confirmation | P2 | DONE (Iteration 46) |
| Message animation + session keyboard nav | P2 | DONE (Iteration 47) |
| Status bar enhancements + input actions | P2 | DONE (Iteration 48) |

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
