/**
 * Automations — durable, main-process-owned scheduled jobs.
 *
 * The renderer's task queue only advances while a window is alive, and the
 * Work Calendar ticker only shows notifications. An automation is the first
 * thing in the main process that starts real work on a clock, so its state
 * must survive a restart and its runs must be readable afterwards.
 */

import type { RunUsage } from './run-usage'

export type AutomationTrigger =
  | { kind: 'cron'; expr: string }
  | { kind: 'interval'; minutes: number }

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
  /** What this run spent, when its engine reported usage; absent otherwise. */
  usage?: RunUsage
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

export interface AutomationJobView extends AutomationJob {
  /** The workflow this job names no longer exists in prefs. */
  actionMissing: boolean
  /** A run is in flight right now (not persisted). */
  running: boolean
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
}
