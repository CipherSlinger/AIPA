/**
 * Automations — durable, main-process-owned scheduled jobs.
 *
 * The renderer's task queue only advances while a window is alive, and the
 * Work Calendar ticker only shows notifications. An automation is the first
 * thing in the main process that starts real work on a clock, so its state
 * must survive a restart and its runs must be readable afterwards.
 */

import type { RunUsage } from './run-usage'

/**
 * A trigger with no calendar: the job runs when the watched path changes.
 *
 * `nextRunAt` stays null for such a job for its whole life — the next run is a
 * file-system event this process cannot predict — so every scheduler rail that
 * reasons about "the next occurrence" must special-case this kind rather than
 * read null as "a dead cron".
 */
export interface AutomationWatchTrigger {
  kind: 'watch'
  /** Absolute path to a file or to a directory. Relative paths are refused at save. */
  path: string
  /** Directories only: watch the whole subtree. Defaults to true. */
  recursive?: boolean
  /** Minimum quiet period between two watch-triggered runs, in minutes. Default 5, clamped 1..1440. */
  debounceMinutes?: number
}

export type AutomationTrigger =
  | { kind: 'cron'; expr: string }
  | { kind: 'interval'; minutes: number }
  | AutomationWatchTrigger

/**
 * Why a run started.
 *
 * `scheduled` and `watch` are the two unattended sources, so the spend rails and
 * the hourly cap treat them identically; `manual` is the user spending on
 * purpose and is the only source those rails exempt.
 */
export type AutomationRunSource = 'manual' | 'scheduled' | 'watch'

export type AutomationAction =
  | { kind: 'workflow'; workflowId: string }
  | { kind: 'prompt'; prompt: string; cwd?: string }

/**
 * `running` is persisted so a crash mid-run is visible, but the next launch
 * rewrites it to `error` (the process that owned the run is gone).
 */
export type AutomationRunStatus = 'success' | 'error' | 'skipped' | 'running'
export type AutomationRunRecordStatus = Exclude<AutomationRunStatus, 'running'>

/**
 * Tier labels a run's memory snapshot can name, in prompt order.
 *
 * These are the public labels, not the assembler's internal keys, because they
 * are persisted and rendered; renaming one is a display change, not a store
 * migration, so `run-history` validates against exactly this list.
 */
export type AutomationMemoryTier =
  | 'global'
  | 'project'
  | 'global-structured'
  | 'project-structured'
  | 'personal'

/**
 * What the one memory snapshot of a run looked like — never its content.
 *
 * A scheduled run reads memory once and prefixes every step with it, so a run
 * that behaved oddly at 03:00 needs to be explainable after the fact: was there
 * no memory, did the budget clip it, or did the read simply fail? Character
 * counts and tier names are enough to answer that without copying a single
 * line of the user's memory into `automations.json`.
 *
 * `state` distinguishes the two cases a bare character count cannot: `ok` with
 * zero chars means the user had no memory; `failed` means the snapshot was not
 * readable at all and the run ran without it.
 */
export interface AutomationMemoryDigest {
  /** `ok` when the assembler produced a snapshot (even an empty one). */
  state: 'ok' | 'failed'
  /** Tiers that made it into the block, in prompt order; empty when none did. */
  tiers: AutomationMemoryTier[]
  /** Length of the whole assembled block in characters; 0 when nothing was added. */
  chars: number
  /** A tier was shortened or dropped to fit the memory budget. */
  truncated: boolean
}

/**
 * One finished run, kept on the job so the last few remain inspectable.
 *
 * The same record serves two readers: the settings row (time, outcome, spend,
 * openable session) and the archive's origin resolver, which uses `sessionId`
 * to label runs older than `lastSessionId`. `running` never appears here — a
 * record is written only once a run has an outcome.
 */
export interface AutomationRunRecord {
  /** Epoch ms when the run started (or the occurrence a skip replaced). */
  startedAt: number
  status: AutomationRunRecordStatus
  /** Wall-clock duration; null when nothing executed (skip / missing workflow). */
  durationMs: number | null
  /**
   * Openable transcript id this run produced (Codex thread id or Claude JSONL
   * session id), never a fabricated/internal id. Null when the engine reported
   * none or no run happened.
   */
  sessionId: string | null
  /** Failure code or message, clipped; null when the run succeeded or skipped. */
  error: string | null
  /** True when this run fired after its scheduled minute (app was closed). */
  late: boolean
  /**
   * 1-based retry attempt this record belongs to, or absent for an ordinary
   * scheduled occurrence. A success can carry it too: a retry that works is
   * still a retry, and the history must be able to say so.
   */
  retry?: number
  /** What this run spent, when its engine reported usage; absent otherwise. */
  usage?: RunUsage
  /**
   * The memory snapshot this run saw. Absent on a record written before this
   * field existed and, deliberately, on a skip: a rail refusal never fetched
   * memory, so inventing an empty digest would say it saw "no memory".
   */
  memory?: AutomationMemoryDigest
}

/**
 * A retry of a failed scheduled occurrence, waiting for its due time.
 *
 * Persisted with the job so a restart does not lose it, and bounded by
 * `expiresAt`: once the next regular occurrence has arrived, running the retry
 * as well would be a burst, so the first tick drops it.
 */
export interface AutomationPendingRetry {
  /** Epoch ms when the retry should start. */
  dueAt: number
  /** 1-based attempt number, capped by `AUTOMATION_RETRY_POLICY.maxRetries`. */
  attempt: number
  /** Epoch ms of the next regular occurrence; the retry is stale at or after it. */
  expiresAt: number
}

export interface AutomationJob {
  id: string
  name: string
  enabled: boolean
  trigger: AutomationTrigger
  action: AutomationAction
  /**
   * This job's own expert, overriding the workflow's binding. Absent means
   * "follow the workflow" (plain assistant for a prompt job); the reserved
   * `ASSISTANT_PERSONA_ID` means an explicit plain-assistant override.
   */
  personaId?: string
  /**
   * Stay quiet when a scheduled run succeeds: no pet bubble, no OS
   * notification, no attention record at all. Absent/false keeps the original
   * behaviour of announcing every finished run. Failures are deliberately not
   * covered — an unattended job must never be able to fail silently. The run
   * itself is unaffected: its record, history and usage are still persisted.
   */
  quietOnSuccess?: boolean
  /**
   * Opt-in retry of failed unattended runs. Absent/false — the default for
   * every existing and new job — never retries: a retry spends again and
   * repeats the job's side effects, so it must be a deliberate choice.
   */
  retryOnFailure?: boolean
  /**
   * The retry currently waiting for its due time. Absent when none is pending;
   * cleared by a success, a manual run, a schedule change, or a rail refusal.
   */
  pendingRetry?: AutomationPendingRetry
  /**
   * The plugin that created this job through the `schedule` capability.
   *
   * Recorded rather than inferred: a job's shape (a prompt action, no cwd, a
   * cron trigger) is exactly what a user-made job looks like too, so ownership
   * has to be a fact on the record. Only `createAutomationJobForPlugin` writes
   * it — the renderer-facing `createAutomationJob` builds its job field by
   * field, so a renderer bug cannot stamp a plugin's id onto a job, and the
   * plugin list/delete paths filter on this value and nothing else.
   *
   * Absent on every user-made job and on every job that existed before this
   * field did. A user may still edit, disable or delete the job: this is an
   * attribution, not a lock.
   */
  originPluginId?: string
  createdAt: number
  updatedAt: number
  /** Epoch ms of the next scheduled occurrence; null only for a dead cron. */
  nextRunAt: number | null
  lastRunAt: number | null
  lastStatus: AutomationRunStatus | null
  lastError: string | null
  /**
   * Openable id of the run's transcript: the Codex thread id, or the Claude
   * JSONL session id on the legacy engine. Null when the engine reported none,
   * never a fabricated/internal bridge id.
   */
  lastSessionId: string | null
  /** True when the last run fired after its scheduled minute (app was closed). */
  lastRunLate: boolean
  lastDurationMs: number | null
  /**
   * What the most recent completed run spent, when its engine reported usage.
   * Absent after a run that reported nothing, and on a job that never ran, so
   * the row stays empty instead of showing zeros.
   */
  lastUsage?: RunUsage
  /** Lifetime input + output tokens reported across this job's runs. */
  totalTokens?: number
  /** Lifetime cost as the engine reported it; absent when no run reported one. */
  totalCostUsd?: number
  /**
   * Optional spend limit in USD for scheduled runs, evaluated over a rolling
   * 24 hours. Absent means no limit; clearing the field removes it instead of
   * storing `0`, which would read as "every run is over budget".
   */
  dailyCostLimitUsd?: number
  /** Starts, including failed ones; skips by a safety rail do not count. */
  runCount: number
  /** Start timestamps inside the rolling hour, for the runaway guard. */
  recentRuns: number[]
  /**
   * The most recent runs, oldest first.
   *
   * Stored on the job rather than in a separate session-keyed ledger: every
   * fact a ledger would key by session id is already owned here (`lastSessionId`,
   * `lastUsage`, the lifetime totals), so a second store would be a copy that
   * can disagree with the job after a crash. One atomic write and one
   * validation path (`normalizeJob`) keep the two views of a run consistent.
   * Capped by `AUTOMATION_HISTORY_CAP`, so `automations.json` stays bounded even
   * at the 50-job limit; a deleted job's runs disappear with it, which is what
   * "this job's runs" means.
   */
  history: AutomationRunRecord[]
}

/**
 * The reported spend inside a job's rolling 24-hour window.
 *
 * Derived on every read, like `failureStreak`, so the number the row compares
 * with the limit can never disagree with the history it came from.
 */
export interface AutomationSpendWindow {
  /** A run counts when `windowStart < startedAt <= now` (see spend-guard). */
  windowStart: number
  /** Sum of reported costs; absent when no run in the window reported one. */
  reportedCostUsd?: number
  /** Real runs (success or error) in the window; skips are not attempts. */
  attemptedRuns: number
  /** Runs in the window that reported no cost, so the sum is a lower bound. */
  unreportedRuns: number
  /**
   * No cost was reported for a window that had runs (or whose capped history
   * cannot prove it had none), so the limit cannot be evaluated. Such a run is
   * allowed; the row says the rail could not bite.
   */
  unmeasured: boolean
  /**
   * The capped history may not reach back to `windowStart`, so older runs in
   * the window and any spend they reported are missing from the sum.
   */
  partial: boolean
}

/**
 * The reported spend of *every* job inside the shared rolling 24-hour window.
 *
 * The per-job window answers "is this job over its own limit"; this one answers
 * the question a user with three $5 jobs actually asked — "how much can today
 * cost me in total". Jobs that were deleted are not represented: their history
 * left the store with them, and a separate ledger to remember them would be a
 * second source of truth for money.
 *
 * `measuredUsd` is absent when nothing in the window reported money; it is
 * never `0`, because `$0` is a real report from some engines.
 */
export interface AutomationGlobalSpendWindow {
  /** The normalized global cap, absent when the user has not set one. */
  limitUsd?: number
  /** Sum of reported costs across all jobs in the window. */
  measuredUsd?: number
  /** In-window attempts that reported no cost, making `measuredUsd` a lower bound. */
  unreportedRuns: number
  /**
   * No cost was reported for a window that had attempts, or whose capped
   * history cannot prove it had none, so the cap cannot be evaluated. A run is
   * allowed in that state, and every surface must say why.
   */
  unmeasured: boolean
  /** Some job's capped history may not reach back to `windowStart`. */
  partial: boolean
}

export interface AutomationJobView extends AutomationJob {
  /** The workflow this job names no longer exists in prefs. */
  actionMissing: boolean
  /** A run is in flight right now (not persisted). */
  running: boolean
  /**
   * The global pause is on: scheduled runs are suspended even though this
   * job's own `enabled` switch may still be on. Carried per row so a surface
   * that only reads the job list (the menu/tray) can tell a global pause apart
   * from an individually paused job without a second call.
   */
  pausedAll: boolean
  /**
   * A watch job whose watched path no longer exists, or whose watcher could
   * not be attached. Absent on every other trigger kind. Present (true or
   * false) only on watch jobs, because "no upcoming run" means something
   * different for them: a live watcher is not a dead cron.
   */
  watchMissing?: boolean
  /**
   * Consecutive failed attempts, newest first, with skips ignored. Derived from
   * `history` on every read so it can never disagree with the records shown.
   */
  failureStreak: number
  /** Present only when the job has a spend limit, so a row without one stays quiet. */
  spendWindow?: AutomationSpendWindow
}

export interface AutomationLimits {
  minIntervalMinutes: number
  maxRunsPerHour: number
  maxConcurrentRuns: number
  maxJobs: number
  /**
   * Global pause: while true, no scheduled run starts on any job. It does not
   * touch each job's own `enabled` flag, so resuming restores exactly the jobs
   * that were on. Manual runs are unaffected. Surfaced here because every
   * automation surface already reads limits; `AutomationJobView.pausedAll`
   * carries the same fact for callers that only list jobs.
   */
  pausedAll: boolean
  /**
   * One daily spend cap for *all* jobs together, over the same rolling 24 h as
   * the per-job rail. Absent means no cap; a per-job limit still applies on top
   * of it, whichever the user set.
   */
  globalDailyCostLimitUsd?: number
  /**
   * The shared window's live figures, computed at list time from the same job
   * array the caller is about to see, so the settings readout can never disagree
   * with the history it came from. Present even when no cap is set: seeing last
   * day's total is what makes the field worth filling in.
   */
  globalSpend?: AutomationGlobalSpendWindow
  /**
   * The opt-in retry policy, exposed so the dialog and pending row can name
   * the actual numbers instead of repeating them in translation copy.
   */
  retry: {
    maxRetries: number
    /** Wait before each retry, in minutes, in attempt order. */
    delaysMinutes: number[]
  }
}

/** What the IPC handlers hand to the scheduler after validation. */
export interface AutomationInput {
  name: string
  enabled: boolean
  trigger: AutomationTrigger
  action: AutomationAction
  /**
   * Per-job expert override. Empty/null means "follow the workflow" (which is
   * never a persona whose id is ''), so the scheduler stores it as absent.
   */
  personaId?: string
  /**
   * Opt-in quiet mode for successful runs. Omitted/false is the default
   * (announce success); the scheduler stores it only when true.
   */
  quietOnSuccess?: boolean
  /**
   * Opt-in retry of failed scheduled runs. Omitted/false is the default and
   * stores no flag; manual runs are never retried regardless.
   */
  retryOnFailure?: boolean
  /**
   * Optional scheduled-run spend limit in USD. Omitted/null clears it; the
   * scheduler stores an absent value rather than `0`.
   */
  dailyCostLimitUsd?: number
}

/** What the scheduler asks the main process to execute. */
export interface AutomationRunRequest {
  job: AutomationJob
  /** Every prompt to run, in order, inside one new session. */
  prompts: string[]
  cwd: string
  model?: string
  /**
   * The expert this run adopts: the job's override first, then its workflow's
   * binding. Present only when the chosen persona still exists; a job with no
   * binding, or one that names a deleted persona, leaves all four unset so the
   * run is byte-identical to the old plain-assistant behaviour.
   */
  personaId?: string
  personaName?: string
  /** Resolved persona prompt (preset text already localized). */
  systemPrompt?: string
  /** Persona's output style; applied as an `<output_style>` block. */
  outputStyle?: 'explanatory' | 'learning'
  /** Epoch ms after which the run is abandoned. */
  deadline: number
}

export interface AutomationRunOutcome {
  ok: boolean
  sessionId?: string
  error?: string
  /** Last assistant text, trimmed, for the completion notification. */
  summary?: string
  /**
   * What the run spent before finishing or failing. A run that died after some
   * turns still carries their usage, so a failure does not hide the spend.
   */
  usage?: RunUsage
  /**
   * The memory snapshot the run actually used. Carried on failures too — a run
   * that failed after fetching memory still saw that snapshot — and absent only
   * when the runner returned before it could take one (already running, no
   * prompts, no usable engine).
   */
  memory?: AutomationMemoryDigest
}
