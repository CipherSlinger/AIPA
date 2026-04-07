---
name: Superpower Phase 2.3-2.6 PRDs
description: 3 PRDs for CLI deep integration: permissions UI, hooks UI, diff/changes view. Permissions and Hooks share IPC (serial), Diff is independent (parallel).
type: project
---

## Phase 2 PRDs (2026-04-07)

Produced 3 PRDs for Superpower Integration Plan Phase 2:

1. **prd-permissions-ui-v1.md** (Phase 2.3) — Permission rules CRUD in Settings + "Always Allow/Deny" quickactions in permission request dialog. Establishes `config:readCLISettings` / `config:writeCLISettings` IPC (P0-3 infra).

2. **prd-hooks-ui-v1.md** (Phase 2.4) — Hooks settings panel with add wizard (command/prompt/http), hook execution progress cards in chat. **Must execute after PRD-1** (depends on readCLISettings/writeCLISettings IPC).

3. **prd-diff-view-v1.md** (Phase 2.6) — Changes panel in sidebar, tracks files modified by Claude via toolUse events, unified diff viewer with git diff backend. **Can run in parallel** with PRD-1/PRD-2 (no file conflicts).

**Why:** These 3 PRDs close the most critical gaps for AIPA as a CLI cockpit: permission management, workflow automation visibility, and code review. Together they cover P0-3 infrastructure + 3 major Phase 2 features.

**How to apply:** PRD-1 and PRD-2 must be serial (shared IPC, shared SettingsPanel.tsx). PRD-3 can be assigned to a separate frontend in parallel. i18n entries need leader-level merge for all 3.

**Conflict notes:**
- `ipc/index.ts`, `preload/index.ts`, `SettingsPanel.tsx` — PRD-1 first, PRD-2 second
- `fs-handlers.ts`, `NavRail.tsx` — PRD-3 only
- `chatStore.ts` — PRD-2 (hookEvents) and PRD-3 (changedFiles) touch different fields
- `i18n/*.json` — all 3 PRDs, leader must merge
