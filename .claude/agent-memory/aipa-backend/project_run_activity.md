---
name: run-activity-page
description: The cross-job run list — automation:runActivity IPC, cap 500, why it is a page, and why run source is recorded at write time
metadata:
  type: project
---

# Cross-job run list (wave 79A)

`automation:runActivity` (invoke, no params) → `{ rows, total, cap, perJob }`, newest first,
job id + current job name attached. Cap **500**, applied *after* the global sort; `total` is
pre-read so the UI can say "the newest 500 of N". `perJob` is `AUTOMATION_HISTORY_CAP` (20).
Implemented as `flattenRunActivity(jobs)` in `src/main/automation/run-activity.ts`, exported
through `listAutomationRunActivity()` in the scheduler.

**Why a page, not a Settings tab or a rail item:** it spans every job, so the surface that owns
one job at a time is the wrong owner. It has no nav-rail icon; `mainView: 'run-activity'` with
`activeNavItem: 'run-activity'` (nothing highlights). Entry points: the status-bar background
popover ("View all runs") and one command-palette row that vanishes when no job remembers a run.

**Design decision — run source is recorded, never derived.** `AutomationRunRecord.source`
(`manual | scheduled | watch | chain`) is written at every run start and every skip. Absent means
"not recorded" (pre-field records, crash-repaired runs) and must never read as `scheduled`. A retry
keeps its occurrence's source. Validated on restore in `run-history.ts`.

Renderer arithmetic lives in `src/renderer/components/automation/runActivity.ts` (pure):
chip counts are over loaded rows only; `unrecorded` is a real filter value; four empty-state
answers (`none | unreadable | no-runs | no-match`).

Ask AIPA for a failed row goes through `prepareRunInvestigation` in `investigateRun.ts`, shared
with the popover — do not rebuild the prompt in new surfaces.

Related: [[project_automation_engine_attention]].
