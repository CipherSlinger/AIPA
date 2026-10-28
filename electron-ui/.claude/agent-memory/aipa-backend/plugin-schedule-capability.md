---
name: plugin-schedule-capability
description: How the plugin `schedule` capability works (manifest gate, recorded originPluginId ownership, per-plugin cap, watch refusal) and which invariants must hold
metadata:
  type: project
---

`schedule` (2026-10-29) lets an installed plugin create, list and delete **its own** scheduled
automations. Shipped shape:

- **IPCs:** `plugin:automation:create` / `:list` / `:delete` (renderer → main, registered inside
  `registerNavPluginHandlers` in `src/main/ipc/index.ts`), preload methods
  `pluginAutomationCreate(pluginId, input)` / `pluginAutomationList(pluginId)` /
  `pluginAutomationDelete(pluginId, id)`. The renderer agent wires the `aipa:invoke` methods
  `automation.create|list|delete`.
- **Module:** `src/main/plugins/plugin-automation.ts` owns validation + the refusal codes
  (`plugin_unknown`, `permission_denied`, `prompt_required`, `prompt_too_long`, `trigger_invalid`,
  `plugin_trigger_unsupported`, `plugin_job_limit`, `action_invalid`, `not_found`, `not_owned`).
  The scheduler's own codes (`cron_invalid`, `cron_too_frequent`, `interval_too_short`,
  `cost_limit_invalid`, `name_too_long`, `too_many_jobs`, …) are forwarded unchanged, so the error
  code type is deliberately an open `string`.
- **Permission gate lives in the capability module**, re-checked on every call, exactly like
  `chat.ask` — not the local `requirePermission` in `ipc/index.ts`, because that helper throws prose
  without a `[code]`, and a refusal here must be branchable.

**Ownership is recorded, not inferred.** `AutomationJob.originPluginId` is whitelisted in
`job-store.ts` and stamped only by `createAutomationJobForPlugin` (the shared private `createJob`);
the renderer-facing `createAutomationJob` builds its job field-by-field, so a payload carrying
`originPluginId` cannot impersonate a plugin. `listAutomationJobsForPlugin` /
`deleteAutomationJobForPlugin` filter on that value alone. Delete is `not_owned` (not `not_found`)
for a live job owned by someone else, and `not_found` for an id that no longer exists — including a
plugin job the user deleted in Settings, which is normal. A blank/whitespace `originPluginId` in a
hand-edited file normalizes to absent, i.e. becomes a user job.

**Narrow by design:** prompt actions only (a plugin cannot name a workflow), `cwd` is never read from
the input, and `watch` triggers are refused with `plugin_trigger_unsupported` — watching the file
system is a user-level capability; the user can create the same job in Settings in one click.
`MAX_PLUGIN_AUTOMATIONS = 5`, counted against the live list so deleting frees a slot.

**Rails carry over unchanged:** hourly cap, per-job spend limit, shared daily budget, global pause,
retries, history, memory digest. The plugin-chat rails (2 concurrent, 10/min) do **not** apply to
scheduled runs — those go through the automation runner, not `askPluginChat`.

**How to apply:** never add an `…ForPlugin` path that reads ownership from the input; never let the
renderer `automation:*` handlers set `originPluginId`; keep the plugin job's fields identical to a
user job's, or the "same rails" promise silently becomes "special-case rails". Harness:
`.scratch/wave26-plugin-automation-harness/` (18 checks, esbuild bundle of the real capability +
scheduler with Electron/plugin-scanner/runner stubs). Related: [[plugin-chat-capability]],
[[automation-scheduler]].
