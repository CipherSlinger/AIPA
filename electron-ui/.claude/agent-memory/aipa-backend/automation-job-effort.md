---
name: automation-job-effort
description: Where a scheduled job's thinking effort lives, the one level list, and the three-state resolution rule
metadata:
  type: project
---

A scheduled job may carry its own `effort`; the automation side owns the list in
`src/main/automation/job-effort.ts` (`AUTOMATION_EFFORT_LEVELS`), which imports
nothing on purpose so the renderer dialog can load it directly. Preload repeats
the union as a type (`AutomationEffortData`) because types cannot cross the
process boundary and preload has its own `rootDir`. There is no `src/shared`
module: both `tsconfig.main.json` and `tsconfig.preload.json` pin `rootDir`, so a
neutral shared file would fail `tsc` (TS6059). The chat side keeps its own
`EFFORT_LEVELS` in `src/renderer/lib/sessionEffort.ts`; the wave-74B harness
compares the two arrays so they cannot drift.

Three states, resolved in `scheduler.ts::resolveEffort(job)` at run start:
absent = follow `effortLevel` as it stands now (read with `getRawPref`, because
`effortLevel` is a renderer-owned pref outside the typed `StoreSchema`); an
explicit level wins; explicit `'auto'` wins over a non-auto global and resolves
to "send no field". The runner forwards effort only to the Codex turn builder;
the legacy Claude path deliberately never sends it (chat parity).

A chained run calls `startRun(target, …)`, so the successor's own effort is what
resolves — never the source's. Trash and backup round-trip the field through
`normalizeJob`, which spells it out as `effort: undefined` when absent (present
key, no value — same as `personaId`); JSON drops it on the way to disk.
