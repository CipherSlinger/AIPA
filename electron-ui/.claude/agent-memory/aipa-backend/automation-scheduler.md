---
name: automation-scheduler
description: Design decisions behind src/main/automation (job store, own ticker, missed-run rule, IPC surface) and the invariants a future change must not break
metadata:
  type: project
---

Automations (`src/main/automation/`, shipped 2026-10-28) run a workflow or prompt on a cron/interval
schedule from the main process. Decisions that are not obvious from the code:

- **Store is `userData/automations.json`, not electron-store prefs.** The Settings page writes the whole
  `workflows` pref on save; scheduler bookkeeping (`lastStatus`, `nextRunAt`) in the same file would be
  clobbered by any settings save. Writes are tmp-file + rename. Bump `version` if the shape changes.
- **Own 15 s ticker, not the reminder ticker.** Reminders stop when no window exists; automations must
  survive a hidden or tray-only window. Separate tickers also keep one subsystem's failure local.
- **Missed-run rule: run once on the next tick/start, `lastRunLate = true`, then reschedule from now.**
  Never a burst of catch-up runs. Runs are only possible while the app runs — no OS-level scheduling.
- **A run = a real Codex thread with bridge id `internal-automation-<jobId>-<rand>`.** That prefix is
  load-bearing: `findByThreadId` skips it (else a user's message could attach to a hidden run) and
  every broadcast path drops `internal-` events. See [[internal-turn-isolation]].
- **Rails:** in-flight map per job, global concurrency 2 (due jobs stay due, not skipped), 12 runs/hour
  counted from `recentRuns`, cron validated against its first two occurrences to enforce the 5 min
  floor. `runNow` deliberately bypasses `enabled` and the hourly cap but not concurrency.
- **Missing workflow:** listing flags `actionMissing`; firing it disables the job, sets `nextRunAt = null`
  and records `lastError = 'workflow_missing'`.
- **Watch triggers (`{kind:'watch'}`, added 2026-10-29) have no calendar by design.** `nextRunAt` is
  null for life; `nextRunAfter` returns null, and both the tick and the pause-resume loop skip watch
  jobs before their dead-cron branch — without that skip the first tick disables every watch job.
  `src/main/automation/watcher.ts` owns one `fs.watch` per enabled watch job (a file is watched via
  its parent with a basename filter), `decideWatchEvent` is the pure paused/running/debounce gate
  (coalescing: events inside the window are dropped, never replayed), and `watchAttachFailed(jobId)`
  feeds `AutomationJobView.watchMissing`. `syncWatchTriggers` runs after every store mutation + startup
  and retries failed attaches; `stopAutomationScheduler` closes them. A watch fire enters
  `startRun(job, {manual:false, late:false, watch:true})` through `fireWatchJob`, so the per-job and
  global spend rails and the hourly cap all apply (source `'watch'`); a failure never retries because
  `nextRetryAfterFailure` needs a non-null `nextRunAt` — the next file change is the retry.
  Menu states `watch-missing` (disabled) and `watching <basename>` (clickable).
- **Errors crossing IPC are codes**, translated by `automation.errors.*` in both locales — never prose.
- **Turn args come from `buildCodexTurnArgs` (`src/main/codex/codex-turn-args.ts`)**, never a hand-built
  `env: {}`. That builder injects the Settings key and picks sandbox/approval; automations add
  `requireAuth` so a credential-less run fails fast instead of retrying. Chat and internal turns call it too.
- **Workflow prompts are localized in main** by `workflowPrompts` (`automation/workflow-plan.ts`),
  mirroring `getWorkflowQueuePlan` in `src/renderer/components/workflows/workflowConstants.ts`.
  Translations are the renderer's own JSON, copied to `dist/main/locales` by `scripts/copy-main-locales.js`;
  the repo keeps one copy. If the renderer plan rules change, update the mirror.
- **Runs carry `prefs.model`** (trimmed, omitted when empty) so scheduled work behaves like chat.
- **The window is resolved lazily** via `SchedulerContext.getWindow`; never capture a BrowserWindow.
  Notifications are constructed and shown even when no window exists; their click emits `app.emit('activate')`
  so `index.ts` owns recreation.
- **Language:** stored `'system'`, absent, or unknown values resolve through `app.getLocale()`; only
  `'en'`/`'zh-CN'` are taken literally.

The scratch end-to-end harness lives at `C:\Users\jiany\AppData\Local\Temp\aipa-shot\automation-e2e.cjs`
(36 assertions, patches `Notification.prototype.show`, fakes the bridge, never touches the real profile).
Electron's own exports are read-only getters, so a harness that needs a fake `Notification` must
intercept `Module._load('electron')` rather than assigning to the module.

How to apply: read the module header comments before changing timing or concurrency; keep the
`internal-` prefix and the "reschedule before awaiting the run" order intact.
