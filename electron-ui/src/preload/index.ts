import { contextBridge, ipcRenderer } from 'electron'

type Unsubscribe = () => void

/**
 * Origin attached to a `session:list` row. Mirrors the renderer's
 * `SessionOrigin`; declared inline so preload keeps no runtime dependency on
 * renderer modules.
 */
export type SessionOriginData =
  | { kind: 'automation'; jobId: string; jobName: string }
  | { kind: 'plugin'; pluginId: string; pluginLabel: string }

/**
 * One row of `session:list`. The renderer's `SessionListItem`
 * (src/renderer/types/app.types.ts) is the authority; this mirror only keeps
 * the IPC surface typed.
 */
export interface SessionListItemData {
  sessionId: string
  lastPrompt: string
  timestamp: number
  project: string
  projectSlug: string
  cwd?: string
  title?: string
  messageCount?: number
  firstTimestamp?: number
  origin?: SessionOriginData
}

export interface SystemInitData {
  sessionId: string
  tools: string[]
  mcpServers: Array<{ name: string; status: string; tools?: string[] }>
  model: string
  permissionMode: string
  cwd: string
  skills: string[]
  plugins: string[]
}

/**
 * Codex `model/list` row (see `.scratch/codex-schema/v2/ModelListResponse.json`).
 * Main process trims the payload to these picker-relevant fields.
 */
export interface CodexModelInfoData {
  id: string
  model: string
  displayName: string
  description: string
  hidden: boolean
  isDefault: boolean
  defaultReasoningEffort: string
  supportedReasoningEfforts: Array<{ reasoningEffort: string; description: string }>
  inputModalities: string[]
  supportsPersonality: boolean
}

/** `account/usage/read`, normalized in the main process. */
export interface CodexAccountUsageData {
  fetchedAt: number
  summary: {
    lifetimeTokens: number | null
    peakDailyTokens: number | null
    currentStreakDays: number | null
    longestStreakDays: number | null
    longestRunningTurnSec: number | null
  }
  dailyUsageBuckets: Array<{ startDate: string; tokens: number }> | null
}

export interface CodexRateLimitWindowData {
  usedPercent: number
  windowDurationMins: number | null
  resetsAt: number | null
}

export interface CodexRateLimitSnapshotData {
  limitId: string | null
  limitName: string | null
  planType: string | null
  primary: CodexRateLimitWindowData | null
  secondary: CodexRateLimitWindowData | null
  credits: { hasCredits: boolean; unlimited: boolean; balance: string | null } | null
  rateLimitReachedType: string | null
  spendControlReached: boolean | null
}

/** `account/rateLimits/read`, normalized in the main process. */
export interface CodexRateLimitsData {
  fetchedAt: number
  rateLimits: CodexRateLimitSnapshotData
  rateLimitsByLimitId: Record<string, CodexRateLimitSnapshotData> | null
  rateLimitResetCredits: { availableCount: number } | null
}

/** One `skills/list` entry, flattened across cwds in the main process. */
export interface CodexSkillInfoData {
  name: string
  description: string
  path: string
  scope: string
  enabled: boolean
  shortDescription?: string | null
}

/**
 * Which engine the next chat turn will use (see `resolveAuxiliaryEngine` in
 * the main process). Deliberately omits the Claude `env`: it carries the
 * provider's credentials, which must stay out of the renderer.
 */
export interface ActiveEngineData {
  kind: 'codex' | 'claude' | 'none'
  /** `claude` only: a third-party provider, or the legacy Anthropic login. */
  source?: 'legacy' | 'provider'
  /** `none` only: why no engine can authenticate. */
  reason?: string
}

/** Where MCP configuration lives for the active engine. */
export interface McpConfigInfoData {
  engine: 'codex' | 'claude'
  path: string
  format: 'json' | 'toml'
  scope: 'global'
}

export interface McpServerConfigData {
  name: string
  type: 'stdio' | 'http' | 'sse'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  disabled: boolean
}

/**
 * One background memory consolidation pass, as listed in the Memory console.
 *
 * `statements` is empty for a failed/empty pass; `filePath` is only set when a
 * file was actually written. The renderer addresses a pass by `id`, never by
 * its path, so deleting one cannot be redirected at an arbitrary file.
 */
export interface DreamPassData {
  id: string
  status: 'written' | 'empty' | 'junk' | 'unavailable' | 'error'
  createdAt: number
  sessionId: string
  projectSlug: string
  filePath: string
  entryCount: number
  statements: string[]
  trigger: 'idle' | 'manual'
  note?: string
}

export interface DreamStatusData {
  enabled: boolean
  running: boolean
  pendingSessions: number
  passes: number
}

export interface DreamRunNowResult {
  ok: boolean
  record?: DreamPassData
  error?: string
}

/**
 * One row of `session:search`. The main process merges Claude and Codex hits,
 * so both engines arrive in this shape. `messageTimestamp` + `messageRole`
 * identify the transcript entry when `matchType === 'content'`.
 */
export interface SessionSearchResultData {
  sessionId: string
  title?: string
  project: string
  matchType: 'title' | 'content'
  snippet: string
  timestamp: number
  engine: 'claude' | 'codex'
  messageTimestamp?: number
  messageRole?: 'user' | 'assistant'
}

/**
 * One session cited by an "Ask AIPA about your history" answer. It is the
 * search-row shape plus the excerpt that surfaced it, which is exactly what
 * `revealSessionEvidence` needs to reopen the matched message.
 */
export interface AskHistorySourceData extends SessionSearchResultData {
  matchType: 'content'
  /**
   * The search term the cited excerpt line contains. Pass this — not the whole
   * question — to `revealSessionEvidence` so the opened transcript highlights
   * text that is actually on that line.
   */
  matchedTerm: string
}

/**
 * One earlier ask exchange, carried into the next question so pronouns like
 * "that" or "上一句" resolve. It is continuity context, never a source.
 */
export interface AskHistoryTurnData {
  question: string
  answer: string
}

/** Result of `session:askHistory`. `error` is a code, never engine detail. */
export interface AskHistoryResultData {
  ok: boolean
  answer?: string
  sources?: AskHistorySourceData[]
  /** True when an empty answer was returned while the transcript index was still building. */
  indexing?: boolean
  /** Set when no authenticated engine could run the turn. */
  available?: boolean
  reason?: string
  /** 'invalid_question' | 'busy' | 'aborted' | 'timeout' | 'failed' | 'empty_response' */
  error?: string
}

export interface NavPluginManifest {
  id: string
  name: string
  nameEn?: string
  version?: string
  description?: string
  icon?: string
  location?: 'top' | 'bottom'
  order?: number
  main: string
  permissions?: string[]
}

export interface NavPlugin {
  manifest: NavPluginManifest
  dirPath: string
  entryPath: string
  /** Entry URL on the app's dedicated `aipa-plugin:` scheme. Loading the plugin
   *  through this custom origin (instead of file://) lets the iframe drop
   *  allow-same-origin without losing relative asset and localStorage access. */
  url: string
  source: 'global' | 'workspace'
  valid: boolean
  error?: string
}

export interface PluginPullItem {
  title: string
  desc: string
}

export interface PluginGithubCommitsArgs {
  repo: string
  branch?: string
  author?: string
  token?: string
  since: string
  until: string
}

export interface PluginScanFolderArgs {
  folderPath: string
  filter?: string
  since: string
  until: string
}

export interface PluginAiEvent {
  pluginId: string
  requestId: string
  type: 'delta' | 'status' | 'done' | 'error'
  text?: string
  message?: string
}

/** One answer-only assistant turn, requested by a plugin (`chat.ask`). */
export interface PluginChatAskArgs {
  prompt: string
  /**
   * Ask for a persisted conversation the user can open in the archive. The
   * turn still runs read-only and cannot use tools; only its persistence
   * changes. Defaults to false (a private turn that leaves no archive entry).
   */
  visible?: boolean
  /**
   * Continue a conversation this plugin created with an earlier visible ask:
   * pass the `sessionId` that ask returned. A continuation is always persisted
   * and returns the same id, so it requires `visible: true`. Passing it on a
   * private ask is refused with `session_requires_visible`; ids that are
   * unknown, user-started, owned by another plugin, or un-resumable by the
   * current engine are refused with the other `session_*` codes. None of those
   * refusals creates a session or spends a model call.
   */
  sessionId?: string
  /** Human-readable attribution only; not used as the session title. */
  title?: string
  /** Millisecond budget, clamped to 5 s … 10 min (default 60 s). */
  timeoutMs?: number
}

export interface PluginChatAnswer {
  text: string
  /**
   * The id the archive opens. Set for a visible turn; null for a private turn,
   * which creates no session. A continuation returns the same id it was given.
   * A new visible turn that cannot produce an openable id rejects with a coded
   * error instead of returning success here.
   */
  sessionId: string | null
}

/**
 * A plugin's visible `chat.ask` created an archive conversation. A continuation
 * of an existing conversation is not announced again.
 */
export interface PluginConversationCreatedEvent {
  pluginId: string
  /** Display label in the app language, for attribution. */
  pluginLabel: string
  sessionId: string
}

/** Stream events of the recruit dialog's "polish the job description" call. */
export interface RecruitPolishEvent {
  requestId: string
  type: 'delta' | 'status' | 'done' | 'error'
  text?: string
  message?: string
}

/** Stream events of an edit-drawer chat (cwd = the plugin folder). */
export type PluginEditEvent =
  | { pluginId: string; type: 'delta'; text: string }
  | { pluginId: string; type: 'tool'; name: string; detail: string }
  | { pluginId: string; type: 'status'; message: string }
  | { pluginId: string; type: 'done'; text: string }
  | { pluginId: string; type: 'error'; message: string }

// ── Automations ────────────────────────────────────────────────────────────
// Mirrors src/main/automation/types.ts. Declared inline so preload keeps no
// runtime dependency on main-process modules.

export type AutomationTriggerData =
  | { kind: 'cron'; expr: string }
  | { kind: 'interval'; minutes: number }

export type AutomationActionData =
  | { kind: 'workflow'; workflowId: string }
  | { kind: 'prompt'; prompt: string; cwd?: string }

export type AutomationRunStatusData = 'success' | 'error' | 'skipped' | 'running'

/** Mirrors main's `RunUsage`; cost stays absent when the engine reported none. */
export interface AutomationRunUsageData {
  inputTokens: number
  outputTokens: number
  cachedInputTokens?: number
  costUsd?: number
}

/** Mirrors main's `AutomationMemoryTier`; labels only, never memory content. */
export type AutomationMemoryTierData =
  | 'global'
  | 'project'
  | 'global-structured'
  | 'project-structured'
  | 'personal'

/**
 * Mirrors main's `AutomationMemoryDigest`: the shape of the one memory snapshot
 * a run saw. `state: 'failed'` means the read failed, which `chars: 0` alone
 * cannot express (that is simply "no memory").
 */
export interface AutomationMemoryDigestData {
  state: 'ok' | 'failed'
  tiers: AutomationMemoryTierData[]
  chars: number
  truncated: boolean
}

/** Mirrors main's `AutomationRunRecord`; `running` never appears in history. */
export interface AutomationRunRecordData {
  /** Epoch ms when the run started (or the occurrence a skip replaced). */
  startedAt: number
  status: Exclude<AutomationRunStatusData, 'running'>
  /** Wall-clock duration; null when nothing executed (skip / missing workflow). */
  durationMs: number | null
  /** Openable transcript id this run produced, or null. */
  sessionId: string | null
  /** Failure code or message, clipped; null when the run succeeded or skipped. */
  error: string | null
  /** True when this run fired after its scheduled minute (app was closed). */
  late: boolean
  /**
   * 1-based retry attempt, absent for an ordinary scheduled run. A successful
   * retry still carries it, so the history can tell retries apart.
   */
  retry?: number
  /** What this run spent, when its engine reported usage; absent otherwise. */
  usage?: AutomationRunUsageData
  /**
   * The memory snapshot this run saw; absent on legacy records and on skips.
   */
  memory?: AutomationMemoryDigestData
}

/** A retry of a failed occurrence, waiting for its due time. Mirrors main. */
export interface AutomationPendingRetryData {
  dueAt: number
  attempt: number
  /** The next regular occurrence; the retry is stale at or after it. */
  expiresAt: number
}

/**
 * Reported spend inside a job's rolling 24-hour window; mirrors main's
 * `AutomationSpendWindow`. A missing `reportedCostUsd` means no run reported
 * money, never that the spend was zero.
 */
export interface AutomationSpendWindowData {
  windowStart: number
  reportedCostUsd?: number
  attemptedRuns: number
  unreportedRuns: number
  unmeasured: boolean
  partial: boolean
}

export interface AutomationJobData {
  id: string
  name: string
  enabled: boolean
  trigger: AutomationTriggerData
  action: AutomationActionData
  /**
   * This job's own expert override; absent means "follow the workflow".
   * `__assistant__` is the reserved explicit plain-assistant choice.
   */
  personaId?: string
  /**
   * Stay quiet when a run succeeds: no bubble, no OS notification, no attention
   * record. Absent/false announces success as before; failures are always
   * announced and cannot be silenced by this flag.
   */
  quietOnSuccess?: boolean
  /** Opt-in retry of failed scheduled runs; absent/false never retries. */
  retryOnFailure?: boolean
  /** The retry currently waiting for its due time, if any. */
  pendingRetry?: AutomationPendingRetryData
  /** Scheduled-run spend limit in USD over a rolling 24 h; absent means none. */
  dailyCostLimitUsd?: number
  createdAt: number
  updatedAt: number
  nextRunAt: number | null
  lastRunAt: number | null
  lastStatus: AutomationRunStatusData | null
  lastError: string | null
  lastSessionId: string | null
  lastRunLate: boolean
  lastDurationMs: number | null
  /** What the last completed run spent, when the engine reported usage. */
  lastUsage?: AutomationRunUsageData
  /** Lifetime input + output tokens across this job's runs. */
  totalTokens?: number
  /** Lifetime cost reported by the engine; absent when none was reported. */
  totalCostUsd?: number
  runCount: number
  recentRuns: number[]
  /** The most recent runs, oldest first; empty until the job has run. */
  history: AutomationRunRecordData[]
  /** Consecutive failed attempts, ignoring skips. 0 when the last one won. */
  failureStreak: number
  /** Present only when the job has a spend limit; absent otherwise. */
  spendWindow?: AutomationSpendWindowData
  /** The workflow this job targets no longer exists. */
  actionMissing: boolean
  /** A run is in flight right now. */
  running: boolean
  /**
   * The global pause is on, so this job's scheduled runs are suspended even
   * when its own `enabled` switch is still on. Lets a job-only surface tell a
   * global pause apart from an individually paused job.
   */
  pausedAll: boolean
}

export interface AutomationLimitsData {
  minIntervalMinutes: number
  maxRunsPerHour: number
  maxConcurrentRuns: number
  maxJobs: number
  /**
   * Global pause: no scheduled run starts while true. Per-job `enabled` flags
   * are untouched and manual runs still work, so this is not a substitute for
   * reading each row's own switch.
   */
  pausedAll: boolean
  /** Retry policy exposed for the dialog/row copy; mirrors main's constants. */
  retry: {
    maxRetries: number
    delaysMinutes: number[]
  }
}

export interface AutomationInputData {
  name: string
  enabled: boolean
  trigger: AutomationTriggerData
  action: AutomationActionData
  /** Empty/omitted follows the workflow; absent is not a persona id ''. */
  personaId?: string
  /** Omitting this is the default (announce success); failures stay loud. */
  quietOnSuccess?: boolean
  /** Omitted/false never retries; a retry spends again and is opt-in only. */
  retryOnFailure?: boolean
  /** Omitted clears the scheduled-run spend limit; 0 is not a limit. */
  dailyCostLimitUsd?: number
}

export type AutomationMutationData =
  | { ok: true; job: AutomationJobData }
  | { ok: false; error: string }

export type AutomationPauseData =
  | { ok: true; pausedAll: boolean }
  | { ok: false; error: string }

/**
 * `cli:sendMessage` arguments. The main process still validates every field;
 * this type only names the ones the renderer actually sends.
 */
export interface CliSendMessageArgsData {
  prompt: string
  /** Structured Codex `UserInput[]`; the Claude bridge parses `prompt` itself. */
  input?: unknown[]
  cwd?: string
  sessionId?: string
  activeBridgeId?: string
  /** Effective model for this turn; the main process strips Claude ids for Codex. */
  model?: string
  /**
   * Reasoning-effort preference (`prefs.effortLevel`). The main process drops it
   * unless the model that will run advertises that value.
   */
  effort?: string
  env?: Record<string, string>
  flags?: string[]
  permissionMode?: string
}

const electronAPI = {
  // ── IPC readiness check ────────────────────
  ipcPing: () => ipcRenderer.invoke('ipc:ping') as Promise<{ ok: boolean; timestamp: number }>,

  // ── PTY ──────────────────────────────────
  ptyCreate: (args: unknown) => ipcRenderer.invoke('pty:create', args),
  ptyWrite: (args: unknown) => ipcRenderer.invoke('pty:write', args),
  ptyResize: (args: unknown) => ipcRenderer.invoke('pty:resize', args),
  ptyDestroy: (sessionId: string) => ipcRenderer.invoke('pty:destroy', sessionId),

  // ── CLI stream-json ───────────────────────
  cliSendMessage: (args: CliSendMessageArgsData) => ipcRenderer.invoke('cli:sendMessage', args),
  cliAbort: (sessionId: string) => ipcRenderer.invoke('cli:abort', sessionId),
  cliRespondPermission: (args: { sessionId: string; requestId: string; allowed: boolean }) =>
    ipcRenderer.invoke('cli:respondPermission', args),
  cliEndSession: (sessionId: string) =>
    ipcRenderer.invoke('cli:endSession', sessionId),
  cliGenerateSuggestion: (context: string) =>
    ipcRenderer.invoke('cli:generateSuggestion', { context }) as Promise<string>,
  cliGenerateAwaySummary: (context: string) =>
    ipcRenderer.invoke('cli:generateAwaySummary', { context }) as Promise<string>,
  /**
   * Run a background turn that belongs to no conversation. Its events are not
   * published on the cli:* channels; the final text comes back here.
   */
  cliRunInternal: (args: { prompt: string; cwd?: string; model?: string; timeoutMs?: number }) =>
    ipcRenderer.invoke('cli:runInternal', args) as Promise<{ success: boolean; text?: string; error?: string }>,
  cliRespondHookCallback: (args: { sessionId: string; requestId: string; response: Record<string, unknown> }) =>
    ipcRenderer.invoke('cli:respondHookCallback', args),
  cliRespondElicitation: (args: { sessionId: string; requestId: string; result: Record<string, unknown> }) =>
    ipcRenderer.invoke('cli:respondElicitation', args),
  cliRespondPlanApproval: (args: { sessionId: string; requestId: string; approved: boolean; feedback?: string }) =>
    ipcRenderer.invoke('cli:respondPlanApproval', args),
  cliCancelRequest: (args: { sessionId: string; requestId: string }) =>
    ipcRenderer.invoke('cli:cancelRequest', args),
  cliUpdateEnv: (args: { sessionId: string; vars: Record<string, string> }) =>
    ipcRenderer.invoke('cli:updateEnv', args),

  // ── Codex-specific ─────────────────────────────
  cliSteerTurn: (args: { sessionId: string; prompt: string }) =>
    ipcRenderer.invoke('cli:steerTurn', args),
  cliForkThread: (args: { sessionId: string; lastTurnId?: string }) =>
    ipcRenderer.invoke('cli:forkThread', args) as Promise<{ success: boolean; threadId?: string; error?: string }>,

  // ── Engine routing ─────────────────────────────
  // Which engine the next chat turn will run on. Read-only and derived from
  // credentials, so the model picker can offer that engine's real catalogue.
  engineGetActive: () =>
    ipcRenderer.invoke('engine:getActive') as Promise<ActiveEngineData>,

  // ── Codex read-only protocol probes ───────────
  // Backed by `model/list`, `account/usage/read`, `account/rateLimits/read`
  // and `skills/list` on the installed Codex app-server. A live session's
  // bridge is reused when `sessionId` names one; otherwise the main process
  // starts a short-lived probe. `force` bypasses the short cache.
  codexModelList: (args?: { sessionId?: string; cwd?: string; force?: boolean }) =>
    ipcRenderer.invoke('codex:modelList', args) as Promise<{ success: boolean; models?: CodexModelInfoData[]; error?: string }>,
  codexAccountUsage: (args?: { sessionId?: string; force?: boolean }) =>
    ipcRenderer.invoke('codex:accountUsage', args) as Promise<{ success: boolean; usage?: CodexAccountUsageData; error?: string }>,
  codexRateLimits: (args?: { sessionId?: string; force?: boolean }) =>
    ipcRenderer.invoke('codex:rateLimits', args) as Promise<{ success: boolean; rateLimits?: CodexRateLimitsData; error?: string }>,
  codexSkillsList: (args?: { sessionId?: string; cwd?: string; force?: boolean }) =>
    ipcRenderer.invoke('codex:skillsList', args) as Promise<{ success: boolean; skills?: CodexSkillInfoData[]; error?: string }>,

  // ── Speculation ───────────────────────────
  speculationIsSafe: (prompt: string) =>
    ipcRenderer.invoke('speculation:isSafe', { prompt }) as Promise<boolean>,
  speculationRun: (args: { id: string; prompt: string; cwd: string; model: string; env: Record<string, string> }) =>
    ipcRenderer.invoke('speculation:run', args),
  speculationAccept: (id: string) =>
    ipcRenderer.invoke('speculation:accept', { id }) as Promise<{ merged: string[] }>,
  speculationReject: (id: string) =>
    ipcRenderer.invoke('speculation:reject', { id }),
  speculationAbort: (id: string) =>
    ipcRenderer.invoke('speculation:abort', { id }),

  // ── Sessions ─────────────────────────────
  sessionList: () => ipcRenderer.invoke('session:list') as Promise<SessionListItemData[]>,
  sessionLoad: (id: string) => ipcRenderer.invoke('session:load', id),
  sessionDelete: (id: string) => ipcRenderer.invoke('session:delete', id),
  sessionFork: (sessionId: string, upToMessageIndex: number) => ipcRenderer.invoke('session:fork', { sessionId, upToMessageIndex }),
  sessionRename: (sessionId: string, title: string) => ipcRenderer.invoke('session:rename', { sessionId, title }),
  sessionGenerateTitle: (description: string) => ipcRenderer.invoke('session:generateTitle', { description }),
  sessionRewind: (sessionId: string, beforeTimestamp: string) => ipcRenderer.invoke('session:rewind', { sessionId, beforeTimestamp }),
  sessionSearch: (query: string, limit?: number) =>
    ipcRenderer.invoke('session:search', { query, limit }) as Promise<SessionSearchResultData[]>,
  /** Whether this profile can run an ask turn; the overlay hides the row when not. */
  sessionAskHistoryStatus: () =>
    ipcRenderer.invoke('session:askHistoryStatus') as Promise<{ available: boolean; reason?: string }>,
  sessionAskHistory: ({ question, locale, requestId, history }: {
    question: string
    locale?: string
    requestId: string
    /** Previous exchange(s); the main process validates and caps them. */
    history?: AskHistoryTurnData[]
  }) =>
    ipcRenderer.invoke('session:askHistory', { question, locale, requestId, history }) as Promise<AskHistoryResultData>,
  /** Abort the in-flight ask (the overlay closes mid-run) and free the slot. */
  sessionAskHistoryCancel: () => ipcRenderer.invoke('session:askHistoryCancel') as Promise<void>,
  /**
   * Cumulative answer text for one ask, pushed every ~120 ms while the private
   * turn runs. The `requestId` is the one passed to `sessionAskHistory`; an
   * event for any other id belongs to a superseded ask and must be ignored.
   */
  onAskHistoryProgress: (cb: (data: { requestId: string; text: string }) => void): Unsubscribe => {
    const handler = (_: unknown, data: { requestId: string; text: string }) => cb(data)
    ipcRenderer.on('session:askHistoryProgress', handler)
    return () => ipcRenderer.removeListener('session:askHistoryProgress', handler)
  },
  sessionDetectInterruption: (sessionId: string) => ipcRenderer.invoke('session:detectInterruption', { sessionId }),
  sessionGetStats: () => ipcRenderer.invoke('session:getStats'),
  /** Returns mtime (ms) of .consolidate-lock — used to detect dream completions */
  sessionGetDreamMtime: () => ipcRenderer.invoke('session:getDreamMtime') as Promise<number>,

  // ── Automations (main-process scheduler) ──
  automationList: () =>
    ipcRenderer.invoke('automation:list') as Promise<{
      jobs: AutomationJobData[]
      limits: AutomationLimitsData | null
    }>,
  automationCreate: (input: AutomationInputData) =>
    ipcRenderer.invoke('automation:create', input) as Promise<AutomationMutationData>,
  automationUpdate: (id: string, input: AutomationInputData) =>
    ipcRenderer.invoke('automation:update', id, input) as Promise<AutomationMutationData>,
  automationDelete: (id: string) =>
    ipcRenderer.invoke('automation:delete', id) as Promise<{ ok: boolean; error?: string }>,
  automationSetEnabled: (id: string, enabled: boolean) =>
    ipcRenderer.invoke('automation:setEnabled', id, enabled) as Promise<AutomationMutationData>,
  automationRunNow: (id: string) =>
    ipcRenderer.invoke('automation:runNow', id) as Promise<AutomationMutationData>,
  automationSetPausedAll: (paused: boolean) =>
    ipcRenderer.invoke('automation:setPausedAll', paused) as Promise<AutomationPauseData>,
  onAutomationChanged: (cb: () => void): Unsubscribe => {
    const handler = () => cb()
    ipcRenderer.on('automation:changed', handler)
    return () => { ipcRenderer.removeListener('automation:changed', handler) }
  },

  // ── Config / prefs ───────────────────────
  configRead: () => ipcRenderer.invoke('config:read'),
  configWrite: (patch: unknown) => ipcRenderer.invoke('config:write', patch),
  configGetEnv: () => ipcRenderer.invoke('config:getEnv'),
  configGetLocale: () => ipcRenderer.invoke('config:getLocale'),
  configSetApiKey: (key: string) => ipcRenderer.invoke('config:setApiKey', key),
  prefsGet: (key: string) => ipcRenderer.invoke('prefs:get', key),
  prefsSet: (key: string, value: unknown) => ipcRenderer.invoke('prefs:set', key, value),
  prefsGetAll: () => ipcRenderer.invoke('prefs:getAll'),
  prefsResetAll: () => ipcRenderer.invoke('prefs:resetAll'),

  // ── CLI settings.json (Iteration 518) ──────
  configReadCLISettings: () =>
    ipcRenderer.invoke('config:readCLISettings') as Promise<Record<string, unknown>>,
  configWriteCLISettings: (patch: Record<string, unknown>) =>
    ipcRenderer.invoke('config:writeCLISettings', patch) as Promise<{ success?: boolean; error?: string }>,

  // ── File system ──────────────────────────
  // Shape matches renderer's FileEntry (src/renderer/types/app.types.ts) — declared
  // inline so preload keeps no runtime dependency on renderer modules.
  fsListDir: (dirPath: string) =>
    ipcRenderer.invoke('fs:listDir', dirPath) as Promise<
      Array<{ name: string; isDirectory: boolean; isFile: boolean; path: string }>
    >,
  fsShowOpenDialog: () => ipcRenderer.invoke('fs:showOpenDialog'),
  fsShowOpenFileDialog: (filters?: { name: string; extensions: string[] }[], multiSelections?: boolean) =>
    ipcRenderer.invoke('fs:showOpenFileDialog', { filters, multiSelections }),
  fsShowSaveDialog: (defaultName: string, filters: { name: string; extensions: string[] }[]) =>
    ipcRenderer.invoke('fs:showSaveDialog', { defaultName, filters }),
  fsWriteFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('fs:writeFile', { filePath, content }),
  fsReadFile: (filePath: string) =>
    ipcRenderer.invoke('fs:readFile', filePath) as Promise<{ content?: string; error?: string }>,
  fsGetHome: () => ipcRenderer.invoke('fs:getHome'),
  fsEnsureDir: (dirPath: string) => ipcRenderer.invoke('fs:ensureDir', dirPath),
  fsListCommands: (workingDir: string) => ipcRenderer.invoke('fs:listCommands', workingDir),
  fsPathExists: (filePath: string) =>
    ipcRenderer.invoke('fs:pathExists', { filePath }) as Promise<boolean>,
  fsGitDiff: (filePath?: string) =>
    ipcRenderer.invoke('fs:gitDiff', { filePath }) as Promise<string | { error: string }>,
  fsGitStatus: () =>
    ipcRenderer.invoke('fs:gitStatus') as Promise<string | { error: string }>,

  // ── Shell ───────────────────────────────
  shellOpenExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  shellShowItemInFolder: (filePath: string) =>
    ipcRenderer.invoke('shell:showItemInFolder', filePath) as Promise<{ success: boolean; error?: string }>,

  // ── Push event listeners ─────────────────
  onPtyData: (sessionId: string, cb: (data: string) => void): Unsubscribe => {
    const handler = (_: unknown, sid: string, data: string) => { if (sid === sessionId) cb(data) }
    ipcRenderer.on('pty:data', handler)
    return () => ipcRenderer.removeListener('pty:data', handler)
  },

  onPtyExit: (sessionId: string, cb: (info: { exitCode: number; signal: string }) => void): Unsubscribe => {
    const handler = (_: unknown, sid: string, info: { exitCode: number; signal: string }) => {
      if (sid === sessionId) cb(info)
    }
    ipcRenderer.on('pty:exit', handler)
    return () => ipcRenderer.removeListener('pty:exit', handler)
  },

  onCliEvent: (
    sessionId: string,
    cb: (event: string, data: unknown) => void
  ): Unsubscribe => {
    const channels = [
      'cli:assistantText', 'cli:thinkingDelta', 'cli:toolUse',
      'cli:toolResult', 'cli:messageEnd', 'cli:result',
      'cli:error', 'cli:processExit',
      'cli:permissionRequest',
      'cli:hookEvent',
      'cli:hookCallback',
      'cli:elicitation',
      'cli:worktreeState',
      'cli:taskCompleted',
      // Codex-specific channels
      'cli:itemStarted', 'cli:itemCompleted', 'cli:toolProgress',
      'cli:threadStarted', 'cli:threadClosed', 'cli:messageStart',
      'cli:tokenUsageUpdated', 'cli:turnError', 'cli:threadStatusChanged',
      'cli:planUpdated', 'cli:compacted',
      // Server-question + observability events (renderer adoption is a later wave)
      'cli:turnDiffUpdated', 'cli:threadSettingsUpdated',
      'cli:serverRequestResolved', 'cli:serverRequestTimedOut',
    ]
    const handlers = channels.map((ch) => {
      const h = (_: unknown, d: Record<string, unknown>) => {
        if (!sessionId || d?.sessionId === sessionId) cb(ch, d)
      }
      ipcRenderer.on(ch, h)
      return { ch, h }
    })
    return () => handlers.forEach(({ ch, h }) => ipcRenderer.removeListener(ch, h))
  },

  onSystemInit: (cb: (data: SystemInitData) => void): Unsubscribe => {
    const handler = (_: unknown, data: SystemInitData) => cb(data)
    ipcRenderer.on('cli:systemInit', handler)
    return () => ipcRenderer.removeListener('cli:systemInit', handler)
  },

  onNotification: (cb: (data: { message: string; title?: string; sessionId?: string }) => void): Unsubscribe => {
    const handler = (_: unknown, data: { message: string; title?: string; sessionId?: string }) => cb(data)
    ipcRenderer.on('cli:notification', handler)
    return () => ipcRenderer.removeListener('cli:notification', handler)
  },

  onHookEvent: (cb: (data: { eventType?: string; [key: string]: unknown }) => void): Unsubscribe => {
    const handler = (_: unknown, data: { eventType?: string; [key: string]: unknown }) => cb(data)
    ipcRenderer.on('cli:hookEvent', handler)
    return () => ipcRenderer.removeListener('cli:hookEvent', handler)
  },

  onPlanApprovalRequest: (cb: (data: { sessionId: string; requestId: string; from: string; planContent: string; planFilePath: string; timestamp: string }) => void): Unsubscribe => {
    const handler = (_: unknown, data: { sessionId: string; requestId: string; from: string; planContent: string; planFilePath: string; timestamp: string }) => cb(data)
    ipcRenderer.on('cli:planApprovalRequest', handler)
    return () => ipcRenderer.removeListener('cli:planApprovalRequest', handler)
  },

  onApiError: (cb: (data: { sessionId: string; errorType: 'overloaded' | 'authentication'; message: string }) => void): Unsubscribe => {
    const handler = (_: unknown, data: { sessionId: string; errorType: 'overloaded' | 'authentication'; message: string }) => cb(data)
    ipcRenderer.on('cli:apiError', handler)
    return () => ipcRenderer.removeListener('cli:apiError', handler)
  },

  onCustomTitle: (cb: (data: { sessionId: string; title: string }) => void): Unsubscribe => {
    const handler = (_: unknown, data: { sessionId: string; title: string }) => cb(data)
    ipcRenderer.on('cli:customTitle', handler)
    return () => ipcRenderer.removeListener('cli:customTitle', handler)
  },

  // ── Menu events ──────────────────────────
  onMenuEvent: (event: string, cb: (...args: unknown[]) => void): Unsubscribe => {
    const h = (_: unknown, ...args: unknown[]) => cb(...args)
    ipcRenderer.on(`menu:${event}`, h)
    return () => ipcRenderer.removeListener(`menu:${event}`, h)
  },

  // ── MCP ──────────────────────────────────
  // Backed by ~/.codex/config.toml under the Codex engine and by
  // ~/.claude/settings.json under Claude — see main/config/mcp-config.ts.
  mcpConfigInfo: () =>
    ipcRenderer.invoke('mcp:configInfo') as Promise<McpConfigInfoData>,
  mcpReadConfig: () =>
    ipcRenderer.invoke('mcp:readConfig') as Promise<McpConfigInfoData & { servers: McpServerConfigData[] }>,
  mcpList: () => ipcRenderer.invoke('mcp:list') as Promise<McpServerConfigData[]>,
  mcpSetEnabled: (serverName: string, enabled: boolean) =>
    ipcRenderer.invoke('mcp:setEnabled', { serverName, enabled }) as Promise<{ success: boolean; error?: string }>,
  mcpAdd: (name: string, type: string, config: Record<string, unknown>) =>
    ipcRenderer.invoke('mcp:add', { name, type, config }) as Promise<{ success: boolean; error?: string }>,
  mcpRemove: (name: string) =>
    ipcRenderer.invoke('mcp:remove', { name }) as Promise<{ success: boolean; error?: string }>,
  mcpGetTools: (serverName: string) =>
    ipcRenderer.invoke('mcp:getTools', { serverName }) as Promise<{ tools: { name: string; description?: string }[] }>,
  mcpReconnect: (serverName: string) =>
    ipcRenderer.invoke('mcp:reconnect', { serverName }) as Promise<{ success: boolean; error?: string }>,

  // ── Feedback ─────────────────────────────
  feedbackRate: (messageId: string, rating: 'up' | 'down' | null) =>
    ipcRenderer.invoke('feedback:rate', { messageId, rating }),

  // ── URL metadata (Iteration 462) ──────
  urlFetchMeta: (url: string) => ipcRenderer.invoke('url:fetchMeta', url) as Promise<{
    title: string; description: string; favicon: string; domain: string
  } | null>,

  // ── Skills ─────────────────────────────
  skillsList: (workingDir?: string) => ipcRenderer.invoke('skills:list', workingDir),
  skillsRead: (dirPath: string) => ipcRenderer.invoke('skills:read', dirPath),
  skillsInstall: (args: { name: string; content: string }) => ipcRenderer.invoke('skills:install', args),
  skillsDelete: (dirPath: string) => ipcRenderer.invoke('skills:delete', dirPath),

  // ── Window ──────────────────────────────
  windowSetTitleBarOverlay: (opts: { color: string; symbolColor: string }) =>
    ipcRenderer.invoke('window:setTitleBarOverlay', opts),
  windowFlashFrame: (flash: boolean) =>
    ipcRenderer.invoke('window:flashFrame', flash),
  // `sessionId` lets main suppress only the notice for the turn the pet already
  // reported; without it the notice is always shown (never mis-attributed).
  windowShowNotification: (opts: { title: string; body: string; sessionId?: string }) =>
    ipcRenderer.invoke('window:showNotification', opts),
  windowToggleMaximize: () =>
    ipcRenderer.invoke('window:toggleMaximize'),
  windowSetAlwaysOnTop: (onTop: boolean) =>
    ipcRenderer.invoke('window:setAlwaysOnTop', onTop),
  windowIsAlwaysOnTop: () =>
    ipcRenderer.invoke('window:isAlwaysOnTop') as Promise<boolean>,
  windowCaptureScreen: () =>
    ipcRenderer.invoke('window:captureScreen') as Promise<string | null>,
  windowPreventSleep: (prevent: boolean) =>
    ipcRenderer.invoke('window:preventSleep', prevent),

  // ── Diagnostics (Iteration 377) ──────
  systemRunDiagnostics: () =>
    ipcRenderer.invoke('system:runDiagnostics') as Promise<{
      id: string; label: string; status: 'ok' | 'warning' | 'error'; detail: string; subDetail?: string
    }[]>,

  // ── Backup & Restore (Iteration 426) ──────
  backupExport: () =>
    ipcRenderer.invoke('backup:export') as Promise<{
      success?: boolean; canceled?: boolean; error?: string;
      filePath?: string; sizeKB?: number;
      counts?: { personas: number; workflows: number; notes: number; memories: number; snippets: number }
    }>,
  backupImport: () =>
    ipcRenderer.invoke('backup:import') as Promise<{
      success?: boolean; canceled?: boolean; error?: string;
      imported?: Record<string, number>; backupDate?: string
    }>,

  // ── Providers (multi-model support) ────
  providerListConfigs: () => ipcRenderer.invoke('provider:listConfigs'),
  providerListModels: () => ipcRenderer.invoke('provider:listModels'),
  providerUpsert: (config: unknown) => ipcRenderer.invoke('provider:upsert', config),
  providerRemove: (providerId: string) => ipcRenderer.invoke('provider:remove', providerId),
  providerHealthCheck: () => ipcRenderer.invoke('provider:healthCheck'),
  providerHealthStatuses: () => ipcRenderer.invoke('provider:healthStatuses'),
  providerSetActive: (providerId: string) => ipcRenderer.invoke('provider:setActive', providerId),
  providerGetActive: () => ipcRenderer.invoke('provider:getActive'),
  providerSendMessage: (args: unknown) => ipcRenderer.invoke('provider:sendMessage', args),
  providerAbort: (providerId: string) => ipcRenderer.invoke('provider:abort', providerId),
  providerFetchRemoteModels: (args: unknown) => ipcRenderer.invoke('provider:fetchRemoteModels', args),

  onProviderFailover: (cb: (data: { fromProvider: string; toProvider: string; reason: string }) => void): Unsubscribe => {
    const handler = (_: unknown, data: { fromProvider: string; toProvider: string; reason: string }) => cb(data)
    ipcRenderer.on('provider:failover', handler)
    return () => ipcRenderer.removeListener('provider:failover', handler)
  },

  // ── Memory ──────────────────────────────────────────────────────────────
  memoryList: (scope?: 'global' | 'project' | 'all') =>
    ipcRenderer.invoke('memory:list', { scope }) as Promise<{
      filePath: string; name: string; description: string;
      type: string; content: string; scope: string; projectHash?: string; mtime: number
    }[]>,
  memoryRead: (filePath: string) =>
    ipcRenderer.invoke('memory:read', { filePath }) as Promise<string>,
  memoryWrite: (filePath: string, content: string) =>
    ipcRenderer.invoke('memory:write', { filePath, content }) as Promise<{ success: boolean }>,
  memoryCreate: (args: { name: string; description: string; type: string; body: string; scope: 'global' | 'project'; projectHash?: string }) =>
    ipcRenderer.invoke('memory:create', args) as Promise<{ success: boolean; filePath: string }>,
  memoryDelete: (filePath: string) =>
    ipcRenderer.invoke('memory:delete', { filePath }) as Promise<{ success: boolean }>,
  /**
   * Assemble the five-tier `<memory_context>` block in the main process. The
   * renderer's chat turn calls this so manual and headless turns cannot drift.
   */
  memoryBuildContext: (args: {
    cwd: string
    personalMemories?: Array<{
      content: string
      category?: string
      memoryType?: string
      pinned?: boolean
      updatedAt: number
    }>
  }) =>
    ipcRenderer.invoke('memory:buildContext', args) as Promise<{
      text: string
      applied: string[]
      omitted: string[]
      used: Record<string, number>
    }>,

  // ── Dream consolidation (background memory passes) ───────────────────────
  memoryDreamList: () =>
    ipcRenderer.invoke('memory:dream:list') as Promise<DreamPassData[]>,
  memoryDreamStatus: () =>
    ipcRenderer.invoke('memory:dream:status') as Promise<DreamStatusData>,
  memoryDreamRunNow: (sessionId?: string) =>
    ipcRenderer.invoke('memory:dream:runNow', { sessionId }) as Promise<DreamRunNowResult>,
  /** Delete one pass (and the file it wrote, if any). */
  memoryDreamDelete: (passId: string) =>
    ipcRenderer.invoke('memory:dream:delete', { passId }) as Promise<{ ok: boolean; error?: string }>,
  onMemoryDreamPass: (cb: (record: DreamPassData) => void): Unsubscribe => {
    const handler = (_: Electron.IpcRendererEvent, record: DreamPassData) => cb(record)
    ipcRenderer.on('memory:dream:pass', handler)
    return () => { ipcRenderer.removeListener('memory:dream:pass', handler) }
  },

  // ── Worktree ─────────────────────────────────────────────────────────────
  worktreeIsGitRepo: (cwd: string) =>
    ipcRenderer.invoke('worktree:isGitRepo', { cwd }) as Promise<{ isGit: boolean }>,
  worktreeList: (cwd: string) =>
    ipcRenderer.invoke('worktree:list', { cwd }) as Promise<{
      path: string; branch: string; head: string; isMain: boolean
    }[]>,
  worktreeCreate: (cwd: string, name: string) =>
    ipcRenderer.invoke('worktree:create', { cwd, name }) as Promise<{ path: string; branch: string }>,
  worktreeRemove: (cwd: string, worktreePath: string, force: boolean) =>
    ipcRenderer.invoke('worktree:remove', { cwd, worktreePath, force }) as Promise<{ success: boolean }>,

  // ── Plugin ───────────────────────────────────────────────────────────────
  pluginList: () =>
    ipcRenderer.invoke('plugin:list') as Promise<{
      name: string; version?: string; source: string; enabled: boolean;
      installDate: string; description?: string; mcpServers?: unknown; hooks?: unknown
    }[]>,
  pluginSetEnabled: (name: string, enabled: boolean) =>
    ipcRenderer.invoke('plugin:setEnabled', { name, enabled }) as Promise<{ success: boolean }>,
  pluginUninstall: (name: string) =>
    ipcRenderer.invoke('plugin:uninstall', { name }) as Promise<{ success: boolean }>,
  pluginRegisterLocal: (pluginPath: string) =>
    ipcRenderer.invoke('plugin:registerLocal', { pluginPath }),

  // ── Nav Plugins (Hot-Pluggable Left-Rail & Main View Plugins) ─────────────
  pluginNavList: () =>
    ipcRenderer.invoke('plugin:nav:list') as Promise<NavPlugin[]>,
  pluginNavReload: () =>
    ipcRenderer.invoke('plugin:nav:reload') as Promise<NavPlugin[]>,
  pluginNavOpenFolder: (pluginId?: string) =>
    ipcRenderer.invoke('plugin:nav:openFolder', { pluginId }) as Promise<boolean>,
  onPluginOpen: (callback: (pluginId: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, pluginId: string) => callback(pluginId)
    ipcRenderer.on('plugin:open', handler)
    return () => { ipcRenderer.removeListener('plugin:open', handler) }
  },
  onPluginNavUpdated: (callback: (plugins: NavPlugin[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, plugins: NavPlugin[]) => callback(plugins)
    ipcRenderer.on('plugin:nav:updated', handler)
    return () => { ipcRenderer.removeListener('plugin:nav:updated', handler) }
  },

  // ── Nav plugin host capabilities (permission-gated in main) ───────────────
  pluginDataGet: (pluginId: string, key: string) =>
    ipcRenderer.invoke('plugin:data:get', { pluginId, key }) as Promise<unknown>,
  pluginDataSet: (pluginId: string, key: string, value: unknown) =>
    ipcRenderer.invoke('plugin:data:set', { pluginId, key, value }) as Promise<boolean>,
  pluginGithubCommits: (pluginId: string, args: PluginGithubCommitsArgs) =>
    ipcRenderer.invoke('plugin:github:commits', { pluginId, args }) as Promise<PluginPullItem[]>,
  pluginScanFolder: (pluginId: string, args: PluginScanFolderArgs) =>
    ipcRenderer.invoke('plugin:fs:scanFolder', { pluginId, args }) as Promise<PluginPullItem[]>,
  pluginPickFolder: (pluginId: string, title?: string) =>
    ipcRenderer.invoke('plugin:fs:pickFolder', { pluginId, title }) as Promise<string | null>,
  pluginAiGenerate: (args: { pluginId: string; requestId: string; prompt: string; instructions?: string; model?: string }) =>
    ipcRenderer.invoke('plugin:ai:generate', args) as Promise<{ started: boolean }>,
  pluginAiAbort: (pluginId: string, requestId: string) =>
    ipcRenderer.invoke('plugin:ai:abort', { pluginId, requestId }) as Promise<void>,
  pluginChatAsk: (pluginId: string, args: PluginChatAskArgs) =>
    ipcRenderer.invoke('plugin:chat:ask', { pluginId, args }) as Promise<PluginChatAnswer>,
  onPluginAiEvent: (callback: (event: PluginAiEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: PluginAiEvent) => callback(data)
    ipcRenderer.on('plugin:ai:event', handler)
    return () => { ipcRenderer.removeListener('plugin:ai:event', handler) }
  },
  onPluginConversationCreated: (callback: (event: PluginConversationCreatedEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: PluginConversationCreatedEvent) => callback(data)
    ipcRenderer.on('plugin:conversation-created', handler)
    return () => { ipcRenderer.removeListener('plugin:conversation-created', handler) }
  },

  // ── Recruit dialog: polish a drafted job description ──
  recruitPolish: (args: { requestId: string; draft: string; deptName: string; locale?: string; model?: string }) =>
    ipcRenderer.invoke('recruit:polish:start', args) as Promise<{ started: boolean }>,
  recruitPolishAbort: (requestId: string) =>
    ipcRenderer.invoke('recruit:polish:abort', { requestId }) as Promise<void>,
  onRecruitPolishEvent: (callback: (event: RecruitPolishEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: RecruitPolishEvent) => callback(data)
    ipcRenderer.on('recruit:polish:event', handler)
    return () => { ipcRenderer.removeListener('recruit:polish:event', handler) }
  },

  // ── Edit drawer: an AI chat whose cwd is the plugin folder ──
  pluginEditStart: (args: { pluginId: string; prompt: string; model?: string }) =>
    ipcRenderer.invoke('plugin:edit:start', args) as Promise<{ started: boolean }>,
  pluginEditSend: (pluginId: string, prompt: string) =>
    ipcRenderer.invoke('plugin:edit:send', { pluginId, prompt }) as Promise<{ sent: boolean }>,
  pluginEditAbort: (pluginId: string) =>
    ipcRenderer.invoke('plugin:edit:abort', { pluginId }) as Promise<void>,
  pluginEditClose: (pluginId: string) =>
    ipcRenderer.invoke('plugin:edit:close', { pluginId }) as Promise<void>,
  onPluginEditEvent: (callback: (event: PluginEditEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: PluginEditEvent) => callback(data)
    ipcRenderer.on('plugin:edit:event', handler)
    return () => { ipcRenderer.removeListener('plugin:edit:event', handler) }
  },

  // ── Version info ────────────────────────
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    app: (() => { try { return require('../../package.json').version } catch { return 'unknown' } })(),
    platform: process.platform,
    arch: process.arch,
  },

  // ── Clawd desktop pet (Iteration 615) ──
  clawdLaunch: () =>
    ipcRenderer.invoke('clawd:launch') as Promise<{ success: boolean; alreadyRunning?: boolean; error?: string }>,
  clawdIsRunning: () =>
    ipcRenderer.invoke('clawd:isRunning') as Promise<{ running: boolean }>,
  clawdGetInitError: () =>
    ipcRenderer.invoke('clawd:getInitError') as Promise<{ error: string | null }>,
  clawdGetPrefs: () =>
    ipcRenderer.invoke('clawd:getPrefs') as Promise<{ prefs: Record<string, unknown> }>,
  clawdSetPrefs: (key: string, value: unknown) =>
    ipcRenderer.invoke('clawd:setPrefs', key, value) as Promise<{ success: boolean; error?: string }>,
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
