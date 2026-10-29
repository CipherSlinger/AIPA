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
 * How many jobs one store may hold.
 *
 * Named here rather than left inline in `AUTOMATION_LIMITS.maxJobs` because the
 * trash needs the same number when it decides whether a restore would overflow
 * the list. Two copies of the cap would let a restore be refused at 50 while
 * create still accepts at 50, or the reverse.
 */
export const MAX_AUTOMATION_JOBS = 50

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

/**
 * What a job does with an occurrence that came due while AIPA was not running.
 *
 * Absent means `'run'`: the occurrence starts once on the first tick after
 * launch, flagged late, which is what every job did before this choice existed.
 * `'skip'` drops that one occurrence and waits for the next regular one — the
 * choice a user makes for a 07:00 briefing they do not want at 18:00. A skipped
 * occurrence is recorded in history, never counted as a failure.
 */
export type AutomationMissedRunPolicy = 'run' | 'skip'

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
  /**
   * How many memory paths existed but could not be read. A count only — never
   * paths or contents, because the digest is persisted in `automations.json`.
   * Absent on records written before this field existed; restored as 0.
   */
  unreadable: number
}

/**
 * How a file's change was described *by the engine's payload*.
 *
 * `unknown` is deliberate and common: Claude's Edit / Write / MultiEdit inputs
 * carry a path but no kind, and the tool name alone cannot tell an add from an
 * overwrite. Defaulting those to `update` would invent a fact.
 */
export type AutomationChangedFileKind = 'add' | 'update' | 'delete' | 'unknown'

/**
 * Whether the engine reported the edit completing.
 *
 * `edited` requires a matching `toolResult` with `is_error === false`. Every
 * other sighting — no result yet, a failed call, a denied approval — stays
 * `attempted`: the call was intent, not proof.
 */
export type AutomationChangedFileState = 'edited' | 'attempted'

/** One file path named by a file-editing tool call during a run. */
export interface AutomationChangedFile {
  /** Path exactly as the tool input stated it (relative to the run's cwd for Codex). */
  path: string
  /** The payload's stated kind, or `unknown` when it stated none. */
  kind: AutomationChangedFileKind
  /** `edited` only when a completed, non-error result was observed. */
  state: AutomationChangedFileState
}

/**
 * The bounded summary of a run's tool-driven file edits.
 *
 * Coverage is deliberately narrow. This is what the engine's own file tools
 * named *during* the run — not the run's complete or current effect on disk.
 * Shell commands, formatters, `git apply`, `rm` and anything the model did
 * through a terminal are invisible; a later process may also have changed the
 * same paths. Every surface that shows this must say so.
 *
 * Absent (the whole field) means *not recorded*: the record predates capture,
 * or the summary was malformed on restore. Present with `files: []` means the
 * capture ran and saw no file-editing tool calls. Those two states are not the
 * same and must never be collapsed.
 */
export interface AutomationRunChangedFiles {
  /** Distinct paths, first-seen order, capped at the store's per-run limit. */
  files: AutomationChangedFile[]
  /** Distinct paths observed, including ones beyond `files`; a lower bound when truncated. */
  totalFiles: number
  /** True when `totalFiles` exceeds the stored list, so the UI can say how many are omitted. */
  truncated: boolean
  /** Distinct file-edit tool emissions observed during the run, clamped. */
  editCalls: number
}

/**
 * Why a safety rail held a run, when the free-text `error` code is not enough.
 *
 * Only the department cap sets this today. It is a separate field rather than a
 * prefix on `error` because the same skip is also readable as prose in the
 * settings row, and because a reader counting "runs this cap actually stopped"
 * should not have to parse a message. Absent means the record predates this
 * field, was a real run, or was held by a rail that does not classify itself —
 * exactly the shape every existing record already has.
 */
export type AutomationRunSkipReason = 'dept-budget'

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
  /**
   * File-editing tool calls observed during the run. Absent on older records
   * and on skips (nothing ran), and absent rather than empty when normalize
   * rejects a corrupt summary. Present with `files: []` means the run really
   * made no file-editing tool calls *that AIPA could see* — never the run's
   * complete effect on disk. See `AutomationRunChangedFiles`.
   */
  changedFiles?: AutomationRunChangedFiles
  /**
   * The department cap held this run. Absent on every real run and on skips
   * written by the other rails, so a reader can count held runs without
   * inferring it from the message text.
   */
  skipReason?: AutomationRunSkipReason
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
   * The org node this job is filed under, stored as an id only.
   *
   * The org tree lives in the renderer's localStorage, so main can validate the
   * shape of this value (a trimmed, non-empty, bounded string) but never that
   * the node exists. A stale id is kept, not cleared or re-filed: only the user
   * may change the filing. Attribution only — it never decides where the job
   * runs or who did the work.
   */
  departmentId?: string
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
   * What to do about an occurrence that came due while AIPA was closed. Absent
   * means `'run'` (the original catch-up-on-launch behaviour), so every job
   * saved before this field existed keeps running exactly as it did. Only a
   * deliberate `'skip'` is stored; a corrupt value reads as `'run'` for the
   * same reason — a bad byte must never silently drop a scheduled run.
   */
  missedRunPolicy?: AutomationMissedRunPolicy
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
  /**
   * The conversation this job was drafted from, if it was drafted from one.
   *
   * Mirrors the fields a workflow records when it is saved from a chat header
   * (`Workflow.sourceConversation` / `sourceTitle` / `sourceDraftedAt`), so both
   * artefacts point back at the same conversation in the same words.
   *
   * Every field is optional. Absent on every hand-made job and on every job that
   * existed before this field did — and absent means "not drafted from a
   * conversation", never "drafted from an unknown one". The title is a snapshot
   * kept because the conversation can be deleted; the date is a local calendar
   * day, not an instant. Only `createAutomationJob` writes these from renderer
   * input (validated field by field in `normalizeJobProvenance`), and an edit
   * must never clear or rewrite them: the edit form does not know they exist.
   */
  sourceConversation?: string
  /** The conversation's title at drafting time; a snapshot, not a live lookup. */
  sourceTitle?: string
  /** Local `YYYY-MM-DD` stamp of the day the job was drafted. */
  sourceDraftedAt?: string
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

/**
 * Reported spend for the automations filed under a set of org nodes.
 *
 * Mirrors the preload surface exactly, but is main's own type: the renderer
 * resolves the subtree (it owns the tree) and main does the arithmetic with the
 * same window rules as the per-job and global rails. `reportedCostUsd` absent
 * means no counted run reported money, never that the spend was zero;
 * `unreportedRuns > 0` or `partial` makes any figure a lower bound.
 */
export interface AutomationDeptSpend {
  /** Inclusive start the caller asked for (epoch ms). */
  windowStart: number
  /** The moment main evaluated the window; `windowStart < startedAt <= windowEnd`. */
  windowEnd: number
  /** Jobs whose `departmentId` is exactly in the requested set, runs or not. */
  jobsCounted: number
  /** Real runs (success or error) in the window; skips are not attempts. */
  attemptedRuns: number
  /** Sum of reported costs; absent when no run in the window reported one. */
  reportedCostUsd?: number
  /** Runs in the window that reported no cost, so the sum is a lower bound. */
  unreportedRuns: number
  /**
   * No cost was reported for a window that had runs, or whose capped history
   * cannot prove it had none — so the figure cannot be read as "spent nothing".
   */
  unmeasured: boolean
  /** Any counted job's capped history may not reach back to `windowStart`. */
  partial: boolean
}

/**
 * A daily spend cap on one department, as main stores it.
 *
 * The org tree lives in the renderer, so main cannot store "the subtree" — it
 * has no tree to resolve. The renderer syncs the node ids the cap covers
 * (`memberIds`), and the rail applies the cap to unattended runs of any job
 * whose `departmentId` is exactly one of those ids. `syncedAt` is when that
 * membership was last refreshed, so a surface can say how current it is; a
 * department deleted in the renderer keeps its last membership instead of the
 * cap vanishing behind the user's back.
 *
 * This is a hold on unattended spend, not a promise that nothing runs: manual
 * runs are the user spending on purpose and stay exempt.
 */
export interface AutomationDeptBudget {
  /** The org node the user set the cap on. */
  departmentId: string
  /** Node ids the cap covers, as the renderer's tree had them at the last sync. */
  memberIds: string[]
  /** Daily cap in USD over the same rolling 24 h window as every other rail. */
  usd: number
  /** Epoch ms of the last cap edit. */
  updatedAt: number
  /** Epoch ms of the last membership sync. */
  syncedAt: number
}

/**
 * A stored department cap plus what its window says about it.
 *
 * `spentUsd` is absent, never 0, when no member run reported money — the same
 * absent-is-not-zero rule as every other spend figure. The held counts are what
 * the cap actually stopped in that window, so a surface can distinguish a cap
 * that is working from one that merely exists.
 */
export interface AutomationDeptBudgetReport extends AutomationDeptBudget {
  /** Reported spend of member jobs in the window; absent = nothing reported. */
  spentUsd?: number
  /** Runs in the window that reported no cost, so a figure is a lower bound. */
  unreportedRuns: number
  /** Runs happened (or the capped history cannot prove none did) with no cost. */
  unmeasured: boolean
  /** A member job's capped history may not reach back to the window start. */
  partial: boolean
  /** Member jobs whose most recent run was held by this cap. */
  heldJobs: number
  /** Held runs still visible in those jobs' capped histories. */
  heldRuns: number
  /**
   * The first instant at which the rolling-window spend is *expected* to drop
   * to or below the cap, assuming no other run happens in the meantime. A run's
   * cost leaves the window 24 h after it started, so this is the moment the
   * oldest remaining attempt stops counting.
   *
   * Absent — never guessed — when the spend is not over the cap, when some
   * in-window attempt reported no cost (the total is a lower bound), or when a
   * member job's capped history cannot reach the window start. A forecast about
   * the cap, not about work: a held occurrence is gone and nothing starts
   * because of this time.
   */
  freesAt?: number
  /**
   * Why `freesAt` could not be computed although the cap *is* over.
   * `'unmeasured'`: at least one in-window attempt reported no cost, so the
   * total is a floor and any time would be fiction. `'partial'`: a member job's
   * capped history cannot reach the window start, so evicted attempts may be
   * the ones keeping the hold alive. Absent whenever `freesAt` is present or the
   * spend is not over the cap.
   */
  freesUnknown?: 'unmeasured' | 'partial'
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
   * The org node the job is filed under, as an id. Omitted/empty clears it;
   * main can only check the shape because the tree lives in the renderer.
   * This is attribution, never the run's working directory.
   */
  departmentId?: string
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
   * What to do about a scheduled time that came due while AIPA was closed.
   * Omitted (or `'run'`) is the default catch-up behaviour; only `'skip'` is
   * stored, matching the opt-in shape of `retryOnFailure`.
   */
  missedRunPolicy?: AutomationMissedRunPolicy
  /**
   * Optional scheduled-run spend limit in USD. Omitted/null clears it; the
   * scheduler stores an absent value rather than `0`.
   */
  dailyCostLimitUsd?: number
  /**
   * Provenance, when the job is being drafted from a conversation. Each value
   * is validated independently (`normalizeJobProvenance`): a malformed value is
   * dropped, never written as a placeholder and never a reason to reject the
   * job. The update path ignores these fields entirely, so an edit that omits
   * them preserves what was recorded at creation.
   */
  sourceConversation?: string
  sourceTitle?: string
  sourceDraftedAt?: string
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
  /**
   * File-editing tool calls observed before the run ended. Present on failures
   * too (the edits happened); absent only when the runner returned before an
   * engine conversation existed, which is also when nothing could be observed.
   */
  changedFiles?: AutomationRunChangedFiles
}
