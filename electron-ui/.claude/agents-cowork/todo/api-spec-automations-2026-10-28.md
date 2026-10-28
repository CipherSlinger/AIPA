# API Spec: Automations (scheduled jobs)
_Date: 2026-10-28_

Main-process scheduler that runs a workflow or a prompt on a cron/interval schedule and leaves
a real Codex session behind. Renderer code is already in `src/renderer/components/settings/SettingsAutomations.tsx`;
this document is the contract if the page is reworked or reused elsewhere.

## Types (exported from `src/preload/index.ts`)

```ts
type AutomationTriggerData = { kind: 'cron'; expr: string } | { kind: 'interval'; minutes: number }
type AutomationActionData  = { kind: 'workflow'; workflowId: string }
                           | { kind: 'prompt'; prompt: string; cwd?: string }
type AutomationRunStatusData = 'success' | 'error' | 'skipped' | 'running'

interface AutomationJobData {
  id: string; name: string; enabled: boolean
  trigger: AutomationTriggerData; action: AutomationActionData
  createdAt: number; updatedAt: number
  nextRunAt: number | null          // epoch ms; null when disabled or unschedulable
  lastRunAt: number | null
  lastStatus: AutomationRunStatusData | null
  lastError: string | null          // stable code, translate via automation.errors.*
  lastSessionId: string | null      // Codex thread id — pass to the session opener
  lastRunLate: boolean              // the last run was owed while the app was closed
  lastDurationMs: number | null
  runCount: number
  recentRuns: number[]              // timestamps inside the last hour (runaway guard)
  actionMissing: boolean            // derived: the workflow action no longer exists
  running: boolean                  // derived: a run is in flight right now
}

interface AutomationLimitsData {
  minIntervalMinutes: number        // 5
  maxRunsPerHour: number            // 12
  maxConcurrentRuns: number         // 2 (across all jobs)
  maxJobs: number                   // 50
}

interface AutomationInputData { name: string; enabled: boolean; trigger: AutomationTriggerData; action: AutomationActionData }
type AutomationMutationData = { ok: true; job: AutomationJobData } | { ok: false; error: string }
```

`error` is always a code, never prose: `name_required`, `name_too_long`, `trigger_invalid`,
`cron_invalid`, `cron_too_frequent`, `interval_invalid`, `interval_too_short`, `interval_too_long`,
`action_invalid`, `workflow_missing`, `prompt_required`, `prompt_too_long`, `cwd_not_allowed`,
`too_many_jobs`, `not_found`, `already_running`, `too_many_running`, `unexpected_error`.

## IPC channels

### `automation:list`
**Direction**: renderer → main (invoke)
**Params**: none
**Returns**: `{ jobs: AutomationJobData[]; limits: AutomationLimitsData | null }` — `limits` is null only if the read failed.
**Notes**: jobs are returned in store order (newest last). Sort for display as you like.

### `automation:create`
**Direction**: renderer → main (invoke)
**Params**: `AutomationInputData`
**Returns**: `AutomationMutationData`
**Notes**: `nextRunAt` is computed from the trigger immediately, so a new daily job shows its first run.
A workflow action must reference an existing workflow id at creation time (`workflow_missing` otherwise).

### `automation:update`
**Direction**: renderer → main (invoke)
**Params**: `id: string`, `input: AutomationInputData`
**Returns**: `AutomationMutationData`
**Notes**: the upcoming run is preserved unless the trigger changed or the job is being re-enabled —
editing a name must not postpone tonight's run. Renaming a workflow action requires a valid id again.

### `automation:delete`
**Direction**: renderer → main (invoke)
**Params**: `id: string`
**Returns**: `{ ok: boolean; error?: string }` — aborts an in-flight run before removing the job.

### `automation:setEnabled`
**Direction**: renderer → main (invoke)
**Params**: `id: string`, `enabled: boolean`
**Returns**: `AutomationMutationData` — disabling sets `nextRunAt = null`; enabling recomputes it from now.

### `automation:runNow`
**Direction**: renderer → main (invoke)
**Params**: `id: string`
**Returns**: `AutomationMutationData` with `job.lastStatus === 'running'` on success.
**Notes**: ignores `enabled` and the hourly cap (a human asked), but honours "already running" and the
global concurrency limit (`already_running` / `too_many_running`). The schedule is not shifted.

### `automation:changed`
**Direction**: main → renderer (push, `webContents.send`)
**Payload**: none — a signal only. Re-read state with `automationList()`.
**Notes**: sent after every mutation and around every run (start, finish, skip, auto-disable), so the
page never has to guess what the scheduler did. Subscribe via `onAutomationChanged(cb)`; it returns an
unsubscribe function.

## Not in this API
- No IPC to fire a job into the open chat window. Runs always open their own Codex thread and appear in
  the archive; the renderer never sees `cli:*` events for them.
- No OS-level scheduling. Jobs only fire while the Electron main process is alive; a run owed while the
  app was closed fires once on the next start and is flagged `lastRunLate`.
