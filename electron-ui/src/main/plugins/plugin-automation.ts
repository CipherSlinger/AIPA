/**
 * Host capability `schedule` — a plugin creates, lists and deletes its own
 * scheduled automations.
 *
 * A plugin that can ask a question every time it is opened should be able to
 * ask it every morning instead. The scheduling machinery already exists
 * (`automation/scheduler.ts`); what this module adds is a gated, owner-scoped
 * door to it, so the capability is "manage the jobs I created", never "manage
 * the user's automations".
 *
 * Ownership is recorded, not inferred. Every function here reaches the
 * scheduler through the `…ForPlugin` entry points, which stamp and filter on
 * `AutomationJob.originPluginId`; the renderer-facing `automation:create` path
 * still produces jobs with no origin at all, so a bug in a plugin view cannot
 * make a job look plugin-made (or the reverse). The user remains the owner of
 * the store: a plugin-created job shows up in Settings → Automations like any
 * other, and the user may disable, edit or delete it. A plugin must keep
 * working when that happens — its next call for that id answers `not_found`,
 * which is a normal outcome, not a crash.
 *
 * What a plugin may create is deliberately narrow:
 *
 *  - Prompt actions only. A workflow is the user's artifact (composed in the
 *    app, edited by them), so naming one is refused with `action_invalid` — the
 *    same refusal a malformed action gets, because the plugin has no id space
 *    in which "someone else's workflow" would make sense.
 *  - `cwd` is not read from the input at all, so a plugin cannot aim the run at
 *    a folder of its choosing; the run uses the same working directory a
 *    user-made prompt job would.
 *  - Clock triggers only (`cron`, `interval`). A `watch` trigger attaches to a
 *    file-system namespace, which is a user-level capability: the path it names
 *    is one the user opened, and the event means "the user's file changed", not
 *    "the plugin felt like running". The user can still create a watch job for
 *    the same purpose in one click in Settings → Automations, with the path
 *    they actually meant. Plugins get `plugin_trigger_unsupported` for this
 *    wave; a future wave that lets a plugin watch its own folder would have to
 *    name that boundary explicitly rather than reuse this one.
 *
 * Rails carry over unchanged. After creation a plugin job is an ordinary
 * automation: hourly cap, per-job limit, shared daily budget, global pause,
 * retries, run history and the memory digest all apply, and nothing is
 * granted. In particular the concurrency and rate rails in `plugin-chat.ts`
 * (2 turns at once, 10 asks per rolling minute) do NOT apply to later scheduled
 * runs — those runs go through the automation runner, not through
 * `askPluginChat`, so nobody should assume a plugin that asked politely once
 * cannot run every five minutes. It is the scheduler's rails that bound it.
 *
 * Validation lives here rather than in the IPC layer for the same reason as
 * `chat.ask`: the manifest check is re-done here, so a compromised renderer
 * path still cannot reach a capability the plugin never declared. Refusals are
 * `[code] message` errors (see `PluginHostView`), and the scheduler's own
 * stable rail codes (`cron_invalid`, `interval_too_short`, `cost_limit_invalid`,
 * …) are passed through unchanged so the plugin sees one vocabulary.
 */
import { listNavPlugins } from './nav-plugin-manager'
import {
  createAutomationJobForPlugin,
  deleteAutomationJobForPlugin,
  listAutomationJobsForPlugin,
} from '../automation/scheduler'
import type { AutomationJobView, AutomationTrigger } from '../automation/types'
import { createLogger } from '../utils/logger'

const log = createLogger('plugin-automation')

/** Permission a manifest must declare to reach this capability. */
export const PLUGIN_SCHEDULE_PERMISSION = 'schedule'

/**
 * How many live jobs one plugin may own.
 *
 * The store-wide cap is 50; this one exists so a single plugin cannot fill it
 * and leave the user no room for jobs of their own. Counting is live: deleting
 * a job frees a slot immediately, and a job the user deleted frees one too.
 */
export const MAX_PLUGIN_AUTOMATIONS = 5

/**
 * Same ceiling the scheduler enforces on a prompt action, checked here so the
 * refusal arrives before any work and with the plugin's own vocabulary. The
 * value is not invented here: a longer prompt would be refused a line later.
 */
const MAX_PROMPT_CHARS = 4000
/** Same ceiling the scheduler enforces on a job name. */
const MAX_NAME_CHARS = 80
/** How much of the prompt a defaulted name quotes, in characters. */
const NAME_PROMPT_SNIPPET_CHARS = 40

/**
 * The message carries the code in `[code]` form because Electron serialises a
 * rejected invoke down to its message string. `PluginHostView` lifts the code
 * back out and adds it to the `aipa:response`, so a plugin gets a typed refusal
 * instead of having to parse prose.
 *
 * `code` is a string rather than a closed union on purpose: the scheduler's
 * stable rail codes are forwarded unchanged, and a union here would have to be
 * edited every time a rail learns a new one. The capability's own codes are
 * `plugin_unknown`, `permission_denied`, `prompt_required`, `prompt_too_long`,
 * `trigger_invalid`, `plugin_trigger_unsupported`, `plugin_job_limit`,
 * `action_invalid`, `not_found` and `not_owned`.
 */
export class PluginAutomationError extends Error {
  constructor(readonly code: string, message: string) {
    super(`[${code}] ${message}`)
    this.name = 'PluginAutomationError'
  }
}

/** What a plugin may ask for. Nothing else is read from its request. */
export interface PluginAutomationInput {
  /** Defaulted by this module from the plugin's name and the prompt's opening. */
  name?: string
  prompt: string
  /** `cron` or `interval` only; a `watch` trigger is refused, see the file doc. */
  trigger: AutomationTrigger
  /** Defaults to true, like a job created in Settings. */
  enabled?: boolean
  /** Default off: announce a successful run, as every job does by default. */
  quietOnSuccess?: boolean
  /** Default off: a retry spends again, so it is opt-in exactly as for a user. */
  retryOnFailure?: boolean
  /** Optional rolling-24 h spend limit for this job's scheduled runs. */
  dailyCostLimitUsd?: number
}

export interface PluginAutomationCreateResult {
  ok: true
  job: AutomationJobView
}

export interface PluginAutomationListResult {
  ok: true
  jobs: AutomationJobView[]
}

export interface PluginAutomationDeleteResult {
  ok: true
}

/**
 * Manifest check, re-done here and not only in PluginHostView: a compromised
 * renderer path must not reach a capability a plugin never declared. The
 * wording matches the other host capabilities' refusal.
 *
 * The returned label is the plugin's own display name, used to default a job
 * name. It is the manifest's primary name, not a locale-resolved one: the name
 * is persisted in `automations.json` and must not change when the user switches
 * UI language.
 */
function requireSchedulePermission(pluginId: unknown): { id: string; label: string } {
  if (typeof pluginId !== 'string' || !pluginId) {
    throw new PluginAutomationError('plugin_unknown', 'Missing plugin id')
  }
  const plugin = listNavPlugins().find(p => p.manifest.id === pluginId)
  if (!plugin) {
    throw new PluginAutomationError('plugin_unknown', `Unknown plugin: ${pluginId}`)
  }
  if (!plugin.manifest.permissions?.includes(PLUGIN_SCHEDULE_PERMISSION)) {
    throw new PluginAutomationError(
      'permission_denied',
      `Plugin "${pluginId}" does not declare the "${PLUGIN_SCHEDULE_PERMISSION}" permission (plugin.json → permissions)`,
    )
  }
  return { id: pluginId, label: plugin.manifest.name || pluginId }
}

function readPrompt(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new PluginAutomationError('prompt_required', 'prompt must be a non-empty string')
  }
  if (value.length > MAX_PROMPT_CHARS) {
    throw new PluginAutomationError('prompt_too_long', `prompt exceeds ${MAX_PROMPT_CHARS} characters`)
  }
  return value
}

/**
 * Rebuild the trigger from its two allowed fields.
 *
 * Only `cron` and `interval` pass. The object is rebuilt rather than forwarded,
 * so a plugin cannot smuggle extra keys (`cwd`, a persona, a workflow id) into
 * the trigger and have some later reader pick them up. The two values are
 * handed to the scheduler as-is: its validation owns whether the cron parses
 * and whether the interval is long enough, and its codes are what the plugin
 * branches on.
 */
function readTrigger(value: unknown): AutomationTrigger {
  if (!value || typeof value !== 'object') {
    throw new PluginAutomationError('trigger_invalid', 'trigger must be an object')
  }
  const trigger = value as Record<string, unknown>
  if (trigger.kind === 'watch') {
    throw new PluginAutomationError(
      'plugin_trigger_unsupported',
      'A plugin may not create a watch trigger: watching the file system is a user-level capability. '
      + 'The user can create the same job in Settings → Automations and pick the path themselves.',
    )
  }
  if (trigger.kind === 'cron') {
    return { kind: 'cron', expr: typeof trigger.expr === 'string' ? trigger.expr : '' }
  }
  if (trigger.kind === 'interval') {
    return { kind: 'interval', minutes: Number(trigger.minutes) }
  }
  throw new PluginAutomationError('trigger_invalid', `Unsupported trigger kind: ${String(trigger.kind)}`)
}

/**
 * A name the plugin did not choose: "<plugin> — <opening of the prompt>".
 *
 * Clipped here because the length rule belongs to the scheduler and a generated
 * default must never be the thing that makes a valid request fail. An explicit
 * name is passed through untouched — if it is too long, that is the scheduler's
 * `name_too_long` to report, and clipping it silently would hide the mistake.
 */
function defaultName(label: string, prompt: string): string {
  const snippet = prompt
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_PROMPT_SNIPPET_CHARS)
    .trim()
  const name = `${label} — ${snippet}`
  return name.length > MAX_NAME_CHARS ? `${name.slice(0, MAX_NAME_CHARS - 1)}…` : name
}

function readName(value: unknown, label: string, prompt: string): string {
  const name = typeof value === 'string' ? value.trim() : ''
  return name || defaultName(label, prompt)
}

/**
 * Create one job owned by this plugin.
 *
 * Validation order is permission → prompt → trigger → cap → scheduler, so every
 * refusal a plugin can fix on its own arrives before the one it cannot (a full
 * per-plugin quota).
 */
export function createPluginAutomation(
  pluginId: string,
  input: PluginAutomationInput | undefined,
): PluginAutomationCreateResult {
  const plugin = requireSchedulePermission(pluginId)
  const prompt = readPrompt(input?.prompt)
  const trigger = readTrigger(input?.trigger)

  const owned = listAutomationJobsForPlugin(plugin.id)
  if (owned.length >= MAX_PLUGIN_AUTOMATIONS) {
    throw new PluginAutomationError(
      'plugin_job_limit',
      `Plugin "${plugin.id}" already owns ${owned.length} automations; the limit is `
      + `${MAX_PLUGIN_AUTOMATIONS}. Delete one before creating another.`,
    )
  }

  const result = createAutomationJobForPlugin(plugin.id, {
    name: readName(input?.name, plugin.label, prompt),
    enabled: input?.enabled !== false,
    trigger,
    // Prompt only: a workflow id belongs to the user, and `cwd` is deliberately
    // absent even when the plugin sent one, so the run cannot be aimed at a
    // folder the plugin picked.
    action: { kind: 'prompt', prompt },
    // The opt-in flags and the spend limit are the plugin's to set within the
    // same defaults a user gets; the scheduler normalizes them and refuses an
    // unusable limit rather than treating it as "no limit".
    ...(input?.quietOnSuccess !== undefined ? { quietOnSuccess: input.quietOnSuccess } : {}),
    ...(input?.retryOnFailure !== undefined ? { retryOnFailure: input.retryOnFailure } : {}),
    ...(input?.dailyCostLimitUsd !== undefined ? { dailyCostLimitUsd: input.dailyCostLimitUsd } : {}),
  })
  if (!result.ok) {
    // Code only in the log: a job name or prompt is the user's/plugin's text.
    log.warn(`create refused for ${plugin.id}: ${result.error}`)
    throw new PluginAutomationError(
      result.error,
      `Could not create the automation (${result.error})`,
    )
  }
  log.info(`create ${result.job.id} for ${plugin.id} (${trigger.kind})`)
  return { ok: true, job: result.job }
}

/** The jobs this plugin created — never a job the user or another plugin made. */
export function listPluginAutomations(pluginId: string): PluginAutomationListResult {
  const plugin = requireSchedulePermission(pluginId)
  return { ok: true, jobs: listAutomationJobsForPlugin(plugin.id) }
}

/**
 * Delete one of this plugin's jobs.
 *
 * `not_found` covers an id that no longer exists — including one the user
 * deleted in Settings, which is a normal thing for them to do and must not turn
 * into an error the plugin cannot handle. `not_owned` covers a live job that
 * belongs to the user or to another plugin.
 */
export function deletePluginAutomation(
  pluginId: string,
  id: string,
): PluginAutomationDeleteResult {
  const plugin = requireSchedulePermission(pluginId)
  const jobId = typeof id === 'string' ? id.trim() : ''
  if (!jobId) {
    throw new PluginAutomationError('not_found', 'An automation id is required')
  }
  const result = deleteAutomationJobForPlugin(plugin.id, jobId)
  if (!result.ok) {
    const code = result.error || 'not_found'
    log.warn(`delete refused for ${plugin.id}: ${code}`)
    throw new PluginAutomationError(code, `Could not delete the automation (${code})`)
  }
  log.info(`delete ${jobId} for ${plugin.id}`)
  return { ok: true }
}
