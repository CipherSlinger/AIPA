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
 * One entry of `skills:list`, read from a SKILL.md.
 *
 * The provenance fields are absent for skills installed before wave 64 and for
 * hand-written skills; they are present only when a conversation was recorded
 * as the source. Nothing else about an older entry changes.
 */
export interface SkillInfoData {
  name: string
  description: string
  source: 'personal' | 'project'
  dirPath: string
  fileName: string
  /**
   * The identity a scheduled job stores for this skill: one segment under the
   * skills root, or `''` for a root-level `SKILL.md`. `dirPath`/`fileName`
   * cannot distinguish those two cases, so the picker uses this.
   */
  skillDir: string
  sourceConversation?: string
  sourceTitle?: string
  createdAt?: string
}

/**
 * The token a `skills:read` hands to the editor and `skills:update` sends back.
 *
 * `hash` is a SHA-256 of the exact bytes and is the only field compared; the
 * timestamp and size are carried so a refusal can name the on-disk time.
 */
export interface SkillFileTokenData {
  hash: string
  mtimeMs: number
  size: number
}

export type SkillUpdateErrorCodeData =
  | 'invalid_input'
  | 'outside_skills'
  | 'symlink'
  | 'not_found'
  | 'unreadable'
  | 'file_too_large'
  | 'unparsable'
  | 'changed_on_disk'
  | 'write_failed'

export type SkillUpdateResultData =
  | { success: true; token: SkillFileTokenData; content: string; dirPath: string }
  | {
      success: false
      code: SkillUpdateErrorCodeData
      error: string
      currentMtimeMs?: number
      token?: SkillFileTokenData
      reason?: string
    }

export interface SkillUpdateArgsData {
  /** The identity the scheduler stores; never an absolute path. */
  source: 'personal' | 'project'
  dir: string
  name: string
  description: string
  body: string
  token?: SkillFileTokenData
  /** Only after the user was told the file changed underneath them. */
  force?: boolean
  /** The same working directory the list was read with, when there is one. */
  workingDir?: string
}

/** A record in the skill trash manifest, as returned by delete/restore/remove. */
export interface TrashedSkillEntryData {
  id: string
  name: string
  originalPath: string
  trashedPath: string
  deletedAt: number
}

/** One entry of `skills:trash:list` — a deleted skill waiting in the holding area. */
export interface TrashedSkillInfoData extends TrashedSkillEntryData {
  /** False once the folder is gone from disk; restore is then impossible. */
  available: boolean
  /** Epoch ms when the entry leaves for good. */
  purgeAt: number
}

export type SkillTrashErrorCode =
  | 'not_found'
  | 'outside_skills'
  | 'outside_trash'
  | 'skill_missing'
  | 'folder_missing'
  | 'original_exists'
  | 'move_failed'
  | 'write_failed'
  | 'delete_failed'

/**
 * Every trash operation resolves with a reason rather than a bare boolean, so
 * a refused restore ("a folder already exists at that path") can be shown to
 * the user instead of a remote-method error.
 */
export type SkillTrashFailureData = { ok: false; code: SkillTrashErrorCode; error: string }

export type SkillTrashListResultData =
  | { ok: true; entries: TrashedSkillInfoData[]; retentionDays: number }
  | SkillTrashFailureData

export type SkillTrashActionResultData =
  | { ok: true; entry: TrashedSkillEntryData }
  | SkillTrashFailureData

export type SkillTrashPurgeResultData =
  | { ok: true; removed: number; failed: number }
  | SkillTrashFailureData

/** One moved file or folder of a deleted conversation. */
export interface TrashedSessionItemData {
  originalPath: string
  trashedPath: string
}

/** One conversation waiting in `session:trash:list`. */
export interface TrashedSessionEntryData {
  id: string
  sessionId: string
  /** Display text passed at delete time; the UI falls back to the id. */
  title?: string
  engine: 'claude' | 'codex' | 'both'
  items: TrashedSessionItemData[]
  deletedAt: number
}

export interface TrashedSessionInfoData extends TrashedSessionEntryData {
  /** False once any payload is gone from disk; restore is then impossible. */
  available: boolean
  /** Epoch ms when the entry leaves for good. */
  purgeAt: number
}

export type SessionTrashErrorCode =
  | 'not_found'
  | 'invalid_session'
  | 'outside_sessions'
  | 'outside_trash'
  | 'folder_missing'
  | 'target_exists'
  | 'move_failed'
  | 'write_failed'
  | 'delete_failed'

export type SessionTrashFailureData = { ok: false; code: SessionTrashErrorCode; error: string }

export type SessionTrashListResultData =
  | { ok: true; entries: TrashedSessionInfoData[]; retentionDays: number }
  | SessionTrashFailureData

export type SessionTrashActionResultData =
  | { ok: true; entry: TrashedSessionEntryData }
  | SessionTrashFailureData

export type SessionTrashPurgeResultData =
  | { ok: true; removed: number; failed: number }
  | SessionTrashFailureData

/**
 * `session:delete` reports why nothing was deleted instead of throwing: a
 * remote-method error reaches the renderer as an unactionable rejection, and
 * "this conversation was not found" is something the caller can handle.
 */
export type SessionDeleteResultData =
  | { success: true; entry: TrashedSessionEntryData }
  | { success: false; error: string; code: SessionTrashErrorCode }

/** One entry of a Codex hook run (`HookRunSummary.entries`). */
export interface CodexHookRunEntryData {
  kind: string
  text: string
  /** The main process capped `text`; it is not the whole hook output. */
  truncated: boolean
}

/** `HookRunSummary` trimmed by main to the fields AIPA displays. */
export interface CodexHookRunData {
  id: string
  eventName: string
  handlerType: string
  executionMode: string
  scope: string
  sourcePath: string
  source: string
  displayOrder: number | null
  status: 'running' | 'completed' | 'failed' | 'blocked'
  statusMessage: string | null
  startedAt: number | null
  completedAt: number | null
  durationMs: number | null
  entries: CodexHookRunEntryData[]
}

/** `cli:hookRun` — the normalized `hook/started` / `hook/completed` event. */
export interface CodexHookRunEventData {
  sessionId: string
  phase: 'started' | 'completed'
  threadId: string
  turnId: string | null
  run: CodexHookRunData
}

/** One configured hook from `hooks/list`. */
export interface CodexHookDefinitionData {
  key: string
  eventName: string
  handlerType: string
  matcher: string | null
  command: string | null
  timeoutSec: number | null
  statusMessage: string | null
  additionalContextLimit: number | null
  sourcePath: string
  source: string
  pluginId: string | null
  displayOrder: number
  enabled: boolean
  isManaged: boolean
  currentHash: string | null
  trustStatus: string
}

export interface CodexHookListGroupData {
  cwd: string
  hooks: CodexHookDefinitionData[]
  warnings: string[]
  errors: Array<{ path: string; message: string }>
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

/** A saved composer image, as the main process reports it back. */
export interface StoredImageAttachmentData {
  name: string
  path: string
  size: number
  mimeType: string
}

export type SaveImageAttachmentData =
  | { success: true; attachment: StoredImageAttachmentData }
  | {
      success: false
      code: 'invalid_payload' | 'source_unreadable' | 'empty_file' | 'too_large' | 'unsupported_type' | 'write_failed'
      error: string
      maxBytes?: number
      mimeType?: string
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
  /**
   * Where the matched text was: the conversation's prose, a tool call's
   * arguments or output, or an assistant thinking block. The row must say so —
   * a match found in shell output is not the same finding as a sentence the
   * user or assistant wrote. Absent on title matches.
   */
  matchOrigin?: 'prose' | 'tool' | 'thinking'
  /** The matched block was cut at the index ceiling; the snippet ends there. */
  truncated?: boolean
}

/**
 * One page of `session:searchPage`.
 *
 * `results` is the requested slice of one ordered scan. `total` counts the
 * distinct hits that scan knows, which is capped at the main-process ceiling;
 * `ceilingReached` is what tells the UI that older matches exist beyond it.
 * Never infer `hasMore` from a full page — the scan stops where the ceiling
 * is, not where the page ends.
 */
export interface SessionSearchPageData {
  results: SessionSearchResultData[]
  total: number
  hasMore: boolean
  ceilingReached: boolean
  /**
   * Present only when the scan itself was narrowed. The counts above describe
   * that narrowed set; a caller that renders them without reading this would
   * describe a filtered total as if it covered the whole history.
   */
  filteredBy?: SessionSearchFilterEchoData
}

/** What a call to `session:searchPage` asked the scan to keep. */
export interface SessionSearchFilterEchoData {
  /** An empty array means the narrowing matched nothing at all. */
  origins: Array<'prose' | 'tool' | 'thinking'>
  /** Session ids the scan was limited to, or null for the whole history. */
  sessionCount: number | null
  /** More ids than the scope cap arrived and were dropped before scanning. */
  sessionTruncated: boolean
}

/**
 * One row of `session:related`. `termsHit` counts the distinct words the
 * conversation and this transcript share; `matchedTerms` shows up to three of
 * them. The relation is lexical — same words, not same meaning.
 */
export interface RelatedSessionRowData {
  sessionId: string
  title: string
  project: string
  engine: 'claude' | 'codex'
  timestamp: number
  matchType: 'title' | 'content'
  termsHit: number
  matchedTerms: string[]
}

/** Result of `session:related`. `reason` is a code, never engine detail. */
export interface RelatedSessionsReplyData {
  rows: RelatedSessionRowData[]
  /** True when a zero-row answer was produced while an index was still building. */
  indexing: boolean
  /** `'noTerms'` — too little prose to search; `'failed'` — retrieval failed. */
  reason?: 'noTerms' | 'failed'
  error?: string
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

/**
 * One step of a workflow drafted from a conversation by the model.
 *
 * `basis` is the honesty field: `observed` means the conversation actually did
 * this, `inferred` means the draft generalised it (a placeholder for a value
 * only that one run had, an implied check, a step the user obviously took
 * outside the chat). The editor shows the difference rather than presenting an
 * inferred step as if the recording contained it.
 */
export interface SessionWorkflowStepDraft {
  title: string
  prompt: string
  basis: 'observed' | 'inferred'
}

/**
 * A reusable workflow generalised from one conversation.
 *
 * Every field here is a *draft*: it is never saved without the user reviewing
 * it. `assumptions` is the model's own list of what it had to decide for the
 * procedure to be reusable (what it treated as a variable, what it left out as
 * specific to that day); `inputs` names the values a future run must supply.
 */
export interface SessionWorkflowDraftData {
  name: string
  description: string
  icon: string
  /** One sentence on what the procedure does, shown above the steps. */
  summary: string
  steps: SessionWorkflowStepDraft[]
  assumptions: string[]
  inputs: string[]
}

export interface SessionWorkflowDraftMetaData {
  /** Messages the digest was built from. */
  messagesRead: number
  /** The transcript was longer than the digest cap. */
  truncated: boolean
  /** Human turns that reached the model. */
  turnsUsed: number
}

export type SessionGeneralizeError =
  | 'missing_session'
  | 'empty_transcript'
  | 'not_procedural'
  | 'invalid_draft'
  | 'timeout'
  | 'failed'
  | 'aborted'

export type SessionGeneralizeResultData =
  | { ok: true; draft: SessionWorkflowDraftData; meta: SessionWorkflowDraftMetaData }
  | {
      ok: false
      error: SessionGeneralizeError
      /** The model's own words for `not_procedural`; absent otherwise. */
      reason?: string
    }

/**
 * A SKILL.md drafted from a conversation by the model.
 *
 * Same doctrine as `SessionWorkflowDraftData`: a draft for review, never an
 * install. `body` is the markdown body only — the installer adds the
 * frontmatter — and `assumptions` records what the model generalised so the
 * user can correct it before the skill is used on real work.
 */
export interface SessionSkillDraftData {
  name: string
  description: string
  /** Markdown body: when to use it, the steps, the checks. No frontmatter. */
  body: string
  assumptions: string[]
  /** Values a future use must supply. */
  inputs: string[]
}

export type SessionSkillGeneralizeResultData =
  | { ok: true; draft: SessionSkillDraftData; meta: SessionWorkflowDraftMetaData }
  | {
      ok: false
      error: SessionGeneralizeError
      /** The model's own words for `not_procedural`; absent otherwise. */
      reason?: string
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

/**
 * Mirrors main's `AutomationWatchTrigger`: the job runs when the watched path
 * changes. It has no `nextRunAt` at all, so any surface that shows a countdown
 * must branch on the trigger kind rather than read the null as "dead schedule".
 */
export interface AutomationWatchTriggerData {
  kind: 'watch'
  /** Absolute path to a file or a directory; relative paths are refused at save. */
  path: string
  /** Directories only: watch the whole subtree. Defaults to true. */
  recursive?: boolean
  /** Minimum quiet period between two runs, in minutes. Default 5, clamped 1..1440. */
  debounceMinutes?: number
}

export type AutomationTriggerData =
  | { kind: 'cron'; expr: string }
  | { kind: 'interval'; minutes: number }
  | AutomationWatchTriggerData

/**
 * The skill a job runs, named the way `skills:list` names it: one directory
 * segment under the root, or `''` for a `SKILL.md` at the root itself. Stored
 * instead of a path so renaming the project folder does not strand the job.
 */
export interface AutomationSkillRefData {
  source: 'personal' | 'project'
  dir: string
}

export type AutomationActionData =
  | { kind: 'workflow'; workflowId: string }
  | { kind: 'prompt'; prompt: string; cwd?: string }
  | { kind: 'skill'; skillSource: 'personal' | 'project'; skillDir: string }

/** The run's skill receipt: which folder ran, and how much of it was sent. */
export interface AutomationSkillDigestData extends AutomationSkillRefData {
  /** The skill's frontmatter name when it declares one; absent otherwise. */
  name?: string
  /** Characters placed in the prompt, after the shared ceiling. */
  chars: number
  /** The body's real length before the cut. */
  sourceChars: number
  truncated: boolean
}

export type AutomationRunStatusData = 'success' | 'error' | 'skipped' | 'running'

/**
 * Mirrors main's `AutomationRunSource`: how a run came due.
 *
 * A retry is not a member; it is the `retry` number on the same record. A record
 * written before main stored this field carries no source at all, and that
 * absence means "not recorded" — never `scheduled`.
 */
export type AutomationRunSourceData = 'manual' | 'scheduled' | 'watch' | 'chain'

/** Mirrors main's `AutomationMissedRunPolicy`; absent means `'run'`. */
export type AutomationMissedRunPolicyData = 'run' | 'skip'

/**
 * Mirrors main's `AutomationAlertPolicy`; absent means `'always'`.
 *
 * `'after_streak'` holds the first failure's announcement until the failure
 * streak reaches two. The failure itself is still recorded and still shows on
 * the job row and in the run history.
 */
export type AutomationAlertPolicyData = 'always' | 'after_streak'

/**
 * Mirrors main's `AutomationEffort` (`src/main/automation/job-effort.ts`, the
 * one list). A type cannot cross the process boundary, so the union is repeated
 * here like every other automation field; the *values* the dialog offers come
 * from main's `effortLevels`, so the two can never disagree about what exists.
 */
export type AutomationEffortData = 'auto' | 'low' | 'medium' | 'high' | 'max'

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
  /** Paths that existed but could not be read; a count only, never paths. */
  unreadable: number
}

/**
 * Mirrors main's `AutomationHandbookDigest`: what an unattended run did with
 * its job's department handbook. `used` carries the size; every other state is
 * a recorded *absence* with its reason, because a scheduled run has no receipt
 * on screen and the run history is the only place the fact can land.
 */
export interface AutomationHandbookDigestData {
  state: 'used' | 'no-department' | 'no-snapshot' | 'unknown-department' | 'empty'
  departmentId?: string
  departmentName?: string
  chars: number
  sourceChars: number
  truncated: boolean
  /** Read from a snapshot older than the stated threshold, and still used. */
  stale: boolean
  /** Snapshot age in whole days at run start; absent when none was read. */
  ageDays?: number
}

/** One org node as the renderer sends it: id, display name, handbook text. */
export interface DeptHandbookSyncEntryData {
  id: string
  name: string
  handbook: string
}

/** Mirrors main's `MemoryUnreadable`: a memory path AIPA could not read. */
export interface MemoryUnreadableData {
  path: string
  scope: 'global' | 'project'
  reason: 'stat' | 'read' | 'parse' | 'scan'
  projectHash?: string
}

/** Mirrors main's `MemorySourceEntry`: what one block line was built from. */
export interface MemorySourceData {
  path?: string
  label?: string
  tier: string
  chars: number
  truncated: boolean
  omitted: boolean
  deletable: boolean
  console: boolean
}

/** Mirrors main's `AutomationChangedFileKind`. */
export type AutomationChangedFileKindData = 'add' | 'update' | 'delete' | 'unknown'

/** Mirrors main's `AutomationChangedFileState`. */
export type AutomationChangedFileStateData = 'edited' | 'attempted'

/** One path a run's file-editing tool call named. Mirrors main. */
export interface AutomationChangedFileData {
  path: string
  kind: AutomationChangedFileKindData
  /** `edited` only when the engine reported the edit completed; else `attempted`. */
  state: AutomationChangedFileStateData
}

/**
 * Mirrors main's bounded summary. Absent on the record means *not recorded*
 * (an older run, or a rejected summary); present with `files: []` means the
 * capture ran and saw no file-editing tool calls. It never describes the
 * run's complete effect on disk — shell commands and terminal edits are
 * invisible to it.
 */
export interface AutomationRunChangedFilesData {
  files: AutomationChangedFileData[]
  totalFiles: number
  truncated: boolean
  editCalls: number
}

/** Mirrors main's `AutomationJobChain`: job ids to start after a run. */
export interface AutomationJobChainData {
  /** Job id to start when this job's run succeeds. */
  onSuccess?: string
  /** Job id to start when this job's run fails for good. */
  onFailure?: string
}

/**
 * Mirrors main's `AutomationChainNote`: why a chain named a target that did not
 * start. Each one is an observation, never a failure of the run that recorded it.
 */
export type AutomationChainNoteData =
  | 'target_missing'
  | 'target_disabled'
  | 'target_busy'
  | 'paused'
  | 'depth_limit'
  | 'target_refused'

/**
 * Mirrors main's `AutomationRunChain`. Exactly one of `nextJobId` / `note` is
 * set: a successor that really started, or the reason none did.
 */
export interface AutomationRunChainData {
  nextJobId?: string
  nextJobName?: string
  note?: AutomationChainNoteData
}

/**
 * How one held permission request of an unattended run ended. Mirrors main's
 * `AutomationRunApprovalOutcome`. The last four are refusals the run made
 * without the user answering: `timeout` after `RUN_APPROVAL_TIMEOUT_MS`, and the
 * three structural ones (`queue-full`, `run-busy`, `run-ended`) immediately.
 */
export type AutomationRunApprovalOutcomeData =
  | 'approved'
  | 'denied'
  | 'timeout'
  | 'queue-full'
  | 'run-busy'
  | 'run-ended'
  | 'interrupted'

/**
 * One permission request an unattended run held, as the run record keeps it.
 *
 * `subject` is the ask exactly as the engine stated it (the command, the path,
 * the tool and its input), clipped only for storage — never a summary. The
 * panel shows this text so the user approves the thing that will actually run.
 */
export interface AutomationRunApprovalData {
  /** Epoch ms the run asked. */
  askedAt: number
  /** The verbatim ask, bounded; never paraphrased. */
  subject: string
  outcome: AutomationRunApprovalOutcomeData
  /** Present exactly when a person answered in the panel: approved or denied. */
  answeredBy?: 'user'
  /** Epoch ms the request settled. */
  resolvedAt: number
  /** How long it waited, in ms. Structural refusals waited 0. */
  waitedMs: number
}

/**
 * A permission request an unattended run is holding right now. Present on a
 * running job only while the run waits; the panel answers it by `requestId`.
 */
export interface AutomationWaitingApprovalData {
  requestId: string
  /** Epoch ms the run asked; the "waiting since" the surfaces show. */
  since: number
  /** The verbatim ask, bounded. */
  subject: string
}

/**
 * The answer to `automation:approvalRespond`.
 *
 * `not_waiting` is a normal outcome, not an error: the request timed out, its
 * run ended, or another click already answered it between the panel rendering
 * and this click. The caller should drop the row and say it is gone rather than
 * retry.
 */
export type AutomationApprovalAnswerData =
  | { ok: true }
  | { ok: false; error: 'invalid_request' | 'not_waiting' | 'unexpected_error' }

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
   * What this run did about notifying the user. `held` is a failure whose alert
   * the job's `alertPolicy: 'after_streak'` withheld until a second failure;
   * `quiet` is a success silenced by quiet mode. Absent on legacy records and
   * on skips, and never to be read as `held`.
   */
  announcement?: 'raised' | 'held' | 'quiet'
  /**
   * How this run came due, as main recorded it at start time. Absent on every
   * record written before the field existed, and on a run repaired after a
   * crash — the process that knew how it started is gone. Absent is not
   * `scheduled`: a reader must say "not recorded".
   */
  source?: AutomationRunSourceData
  /**
   * 1-based retry attempt, absent for an ordinary scheduled run. A successful
   * retry still carries it, so the history can tell retries apart.
   */
  retry?: number
  /**
   * The rail that refused this run, when the record is a skip. Absent on every
   * older record, and on rails that only say why in their message, so a reader
   * must treat it as "this skip did not name a structured reason" rather than
   * "this skip had no reason".
   */
  skipReason?: 'dept-budget'
  /** What this run spent, when its engine reported usage; absent otherwise. */
  usage?: AutomationRunUsageData
  /**
   * The memory snapshot this run saw; absent on legacy records and on skips.
   */
  memory?: AutomationMemoryDigestData
  /**
   * What this run did with the job's department handbook, including why it
   * carried none; absent on older records and on skips.
   */
  handbook?: AutomationHandbookDigestData
  /**
   * Which skill this run read, and how much of it was sent. Present only on a
   * run whose action was `kind: 'skill'`; absent on every other run and on
   * skips, which never resolved one.
   */
  skill?: AutomationSkillDigestData
  /**
   * Tool-driven file edits observed live; absent on legacy records and skips.
   * Present-but-empty is "no file-editing tool calls seen", not "not recorded".
   */
  changedFiles?: AutomationRunChangedFilesData
  /**
   * What this run did about the job its chain named. Absent on records written
   * before chaining existed and on every skip (a refused run started nothing).
   */
  chain?: AutomationRunChainData
  /**
   * Permission requests this run held for the user, oldest first. Absent when
   * the run never asked (and on every record written before holds existed). A
   * denial the run made by itself appears here too, so the history can say the
   * request was refused and why.
   */
  approvals?: AutomationRunApprovalData[]
}

/** One remembered run in the cross-job list, with the job it belongs to. */
export interface AutomationRunActivityRowData {
  /** Live job id. The row opens this job in Settings when it left no transcript. */
  jobId: string
  /** The job's current name — not the name the run had when it started. */
  jobName: string
  /** The stored record, unchanged. */
  run: AutomationRunRecordData
}

/**
 * Every job's remembered runs, newest first, as one bounded read.
 *
 * `total` is the count before `cap`, so a surface can say "the newest 500 of
 * 1,240" rather than implying it listed everything; `perJob` is how many runs
 * one job remembers, which is why the list is finite at all. A deleted job's
 * runs are not in it — they left the store with the job.
 */
export interface AutomationRunActivityData {
  rows: AutomationRunActivityRowData[]
  total: number
  cap: number
  perJob: number
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

/**
 * Reported spend of the automations filed under a set of org nodes, over one
 * rolling window.
 *
 * The renderer owns the org tree, so it resolves the subtree to node ids and
 * asks main for the arithmetic; main owns the spend rules, so this figure is
 * computed by the same helper as the per-job and global rails rather than by a
 * second copy in the renderer that could drift. `reportedCostUsd` absent means
 * no run reported money, never that the spend was zero; `unreportedRuns > 0` or
 * `partial` makes any figure a lower bound. `jobsCounted` is 0 when nothing is
 * filed under the requested nodes — a real answer, not an error.
 */
export interface AutomationDeptSpendData {
  /** Inclusive start the caller asked for (epoch ms). */
  windowStart: number
  /** The moment main evaluated the window (epoch ms); the end is exclusive-ish
   *  in the same sense as the spend rails: `windowStart < startedAt <= windowEnd`. */
  windowEnd: number
  /** Jobs whose `departmentId` is in the requested set. */
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
 * A daily spend cap on one department, as the main process has it stored.
 *
 * The renderer owns the org tree, so a cap cannot be stored as "the subtree" —
 * main has no tree to resolve. Instead the renderer syncs the node ids the cap
 * covers (`memberIds`), and main applies it to unattended runs of any job whose
 * `departmentId` is exactly one of those ids. `syncedAt` is the moment of the
 * last sync, so a surface can say how current that membership is; a budget
 * whose node has since been deleted keeps its last membership instead of
 * silently disappearing.
 *
 * The cap is a *hold on unattended spend*, never a promise that nothing will
 * run: manual runs are the user spending on purpose and are exempt, exactly
 * like the per-job limit.
 */
export interface AutomationDeptBudgetData {
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
 * A stored department cap plus what the window says about it. Reported money
 * only, with the same absent-is-not-zero rules as `AutomationDeptSpendData`;
 * `heldJobs`/`heldRuns` count the runs this cap actually stopped, so a surface
 * can say the cap is doing something rather than merely existing.
 */
export interface AutomationDeptBudgetReportData extends AutomationDeptBudgetData {
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
   * The first instant at which the cap is *expected* to free — the moment the
   * rolling window's spend is projected to drop to or below the cap, assuming
   * nothing else runs before then. "Expected" is the whole of the claim: the
   * window is 24 h deep and a run's cost leaves it 24 h after it started, so the
   * time is arithmetic, but it is a forecast about the cap and not about work.
   * A held occurrence is gone; nothing starts because of this time.
   *
   * Absent when the spend is under the cap, when some in-window run reported no
   * cost, or when the history cannot prove the window. A surface must never
   * synthesise a time from the spend figure alone.
   */
  freesAt?: number
  /**
   * Why `freesAt` is absent although the cap *is* over. `'unmeasured'`: at least
   * one in-window run reported no cost, so the total is a lower bound and any
   * time would be fiction. `'partial'`: a member job's capped history cannot
   * reach the window start, so evicted runs may be keeping the hold alive.
   */
  freesUnknown?: 'unmeasured' | 'partial'
}

/**
 * Mirrors main's `AutomationGlobalSpendWindow`: reported spend across *every*
 * job in the shared rolling 24 h. A missing `measuredUsd` means no run reported
 * money, never that the spend was zero; `unreportedRuns > 0` or `partial` makes
 * any figure a lower bound.
 */
export interface AutomationGlobalSpendData {
  /** The active global cap, absent when the user has not set one. */
  limitUsd?: number
  /** Sum of reported costs across all jobs in the window. */
  measuredUsd?: number
  /** In-window attempts that reported no cost. */
  unreportedRuns: number
  /** No cost was reported for a window that had attempts, so the cap is unevaluable. */
  unmeasured: boolean
  /** Some job's capped history may not reach back to the window start. */
  partial: boolean
}

export interface AutomationJobData {
  id: string
  name: string
  enabled: boolean
  trigger: AutomationTriggerData
  action: AutomationActionData
  /**
   * The plugin that created this job through the `schedule` capability; absent
   * for every user-made job. Recorded by the main process, never set by a
   * renderer request, and it survives a user editing the job — the badge says
   * "a plugin created this", not "a plugin still controls it".
   */
  originPluginId?: string
  /**
   * The conversation this job was drafted from, when it was drafted from one.
   * Mirrors the same three fields on a `Workflow`. Absent means "not drafted
   * from a conversation" — never "drafted from an unknown one" — and an edit
   * never clears them: the edit form does not know they exist. The title is a
   * snapshot taken at drafting time; the date is a local `YYYY-MM-DD` day.
   */
  sourceConversation?: string
  sourceTitle?: string
  sourceDraftedAt?: string
  /**
   * This job's own expert override; absent means "follow the workflow".
   * `__assistant__` is the reserved explicit plain-assistant choice.
   */
  personaId?: string
  /**
   * This job's own thinking effort; absent means "follow `prefs.effortLevel` as
   * it stands when the run starts". `'auto'` is an explicit "let the engine
   * decide", which is not the same as absent while the app default is a level.
   */
  effort?: AutomationEffortData
  /**
   * The org node this job is filed under, as an id only. The org tree lives in
   * this renderer, so main checks only the shape; whether the id still resolves
   * is a renderer question, and an unresolvable one must stay visible. This is
   * attribution, never the run's working directory or the person who did it.
   */
  departmentId?: string
  /**
   * Stay quiet when a run succeeds: no bubble, no OS notification, no attention
   * record. Absent/false announces success as before; failures are always
   * announced and cannot be silenced by this flag.
   */
  quietOnSuccess?: boolean
  /**
   * When a failed run calls the user: absent/`'always'` announces every
   * failure, `'after_streak'` holds the first until a second one follows. Only
   * the announcement is withheld; the run is still recorded and still shown.
   */
  alertPolicy?: AutomationAlertPolicyData
  /** Opt-in retry of failed scheduled runs; absent/false never retries. */
  retryOnFailure?: boolean
  /**
   * What to do with a time that came due while AIPA was closed: absent/`'run'`
   * catches up once on launch (the original behaviour), `'skip'` drops that
   * occurrence and waits for the next. A skipped occurrence is recorded in the
   * run history and is never a failure.
   */
  missedRunPolicy?: AutomationMissedRunPolicyData
  /** The retry currently waiting for its due time, if any. */
  pendingRetry?: AutomationPendingRetryData
  /**
   * The jobs to start when this job's run finishes. A target id that no live
   * job uses is kept, not cleared: it may be waiting in Recently deleted, and
   * the row must be able to say the chain points at a job that no longer exists.
   */
  chain?: AutomationJobChainData
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
  /**
   * The permission request this job's live run is holding for the user, with
   * the verbatim ask and when it was asked. Present only while `running`;
   * answering it does not end the run, so the row keeps saying "waiting" until
   * the run moves on.
   */
  waitingApproval?: AutomationWaitingApprovalData
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
  /**
   * Watch jobs only: the watched path is gone, or the watcher could not be
   * attached. Present only for `trigger.kind === 'watch'`, and never to be read
   * as "no upcoming run" — a live watcher and a dead cron are different facts.
   */
  watchMissing?: boolean
}

/**
 * A deleted job waiting in the holding area (`automation:trash:list`).
 *
 * The whole record is carried, because restoring puts it back as it was. The
 * derived fields a live row shows — `running`, `pausedAll`, `actionMissing`,
 * `failureStreak`, `spendWindow` — are deliberately absent: nothing is running,
 * and those are answers about the live list, not about a record in a manifest.
 */
export interface TrashedJobEntryData {
  /** The trash row's own id; the job's id lives inside `job`. */
  id: string
  job: Omit<AutomationJobData, 'running' | 'pausedAll' | 'actionMissing' | 'failureStreak' | 'spendWindow'>
  deletedAt: number
}

export interface TrashedJobInfoData extends TrashedJobEntryData {
  /** Epoch ms when the entry leaves for good. */
  purgeAt: number
}

export type JobTrashErrorCode =
  | 'not_found'
  /** The record could not be read as a job; nothing was moved. */
  | 'move_failed'
  | 'write_failed'
  /** The live list is already at its cap, so restoring would overflow it. */
  | 'job_limit'
  /** A live job already uses this id; a restore never overwrites or renumbers. */
  | 'id_taken'

export type JobTrashFailureData = { ok: false; code: JobTrashErrorCode; error: string }

export type JobTrashListResultData =
  | { ok: true; entries: TrashedJobInfoData[]; retentionDays: number }
  | JobTrashFailureData

export type JobTrashActionResultData =
  | { ok: true; entry: TrashedJobEntryData }
  | JobTrashFailureData

export type JobTrashPurgeResultData =
  | { ok: true; removed: number }
  | JobTrashFailureData

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
  /**
   * One daily spend cap covering all jobs together, over the same rolling 24 h
   * as the per-job limits. Absent means no cap; per-job limits still apply on
   * top of it.
   */
  globalDailyCostLimitUsd?: number
  /**
   * The shared window's figures, derived at list time from the same jobs the
   * caller receives. Present even without a cap so the settings readout can show
   * yesterday's total before the user decides on a number.
   */
  globalSpend?: AutomationGlobalSpendData
  /** Retry policy exposed for the dialog/row copy; mirrors main's constants. */
  retry: {
    maxRetries: number
    delaysMinutes: number[]
  }
  /** How many jobs one chain may enter, successor by successor. */
  chainMaxDepth: number
  /**
   * The effort levels a job may store, in menu order. Main's one list; the
   * dialog builds its picker from this rather than restating it.
   */
  effortLevels: AutomationEffortData[]
}

export interface AutomationInputData {
  name: string
  enabled: boolean
  trigger: AutomationTriggerData
  action: AutomationActionData
  /** Empty/omitted follows the workflow; absent is not a persona id ''. */
  personaId?: string
  /**
   * Omitted means "follow the app default at run time" and is also how an edit
   * clears a previous override. A value outside the shared levels is dropped by
   * main rather than rejecting the save.
   */
  effort?: AutomationEffortData
  /**
   * Org node the job is filed under, as an id. Omitted/empty clears the filing;
   * the renderer never infers it from the working directory. Attribution only.
   */
  departmentId?: string
  /** Omitting this is the default (announce success); failures stay loud. */
  quietOnSuccess?: boolean
  /**
   * Omitted/`'always'` announces every failure (the default); `'after_streak'`
   * holds the first failure's alert until a second one follows.
   */
  alertPolicy?: AutomationAlertPolicyData
  /** Omitted/false never retries; a retry spends again and is opt-in only. */
  retryOnFailure?: boolean
  /**
   * Omitted/`'run'` is the default catch-up behaviour; only `'skip'` is stored.
   * The choice only covers a time that came due while AIPA was closed.
   */
  missedRunPolicy?: AutomationMissedRunPolicyData
  /**
   * The jobs to start when this job's run finishes. Omitted or empty clears the
   * chain. A target that is not a live job id, or that would close a loop, is
   * refused with an error code rather than silently dropped.
   */
  chain?: AutomationJobChainData
  /** Omitted clears the scheduled-run spend limit; 0 is not a limit. */
  dailyCostLimitUsd?: number
  /**
   * Provenance for a job drafted from a conversation. Main validates each
   * value on its own and drops a malformed one without rejecting the job. The
   * update path ignores these fields, so an edit that omits them preserves the
   * origin recorded at creation.
   */
  sourceConversation?: string
  sourceTitle?: string
  sourceDraftedAt?: string
}

// ── Plugin `schedule` capability ────────────────────────────────────────────
// Mirrors src/main/plugins/plugin-automation.ts. A plugin may only create,
// list and delete jobs it created itself; these calls are refused with a
// `[code] message` error the host view lifts into `aipa:response.code`.

/**
 * What a plugin may ask for. `trigger` is `cron` or `interval` only — a `watch`
 * trigger is refused with `plugin_trigger_unsupported` — and `cwd` is not part
 * of the shape at all, so a request cannot aim the run at a folder of its own.
 * There is deliberately no `departmentId` either: a plugin's job cannot be
 * filed under a department.
 */
export interface PluginAutomationInputData {
  /** Defaulted in main from the plugin's name and the opening of the prompt. */
  name?: string
  /** Required, non-empty, at most 4000 characters. */
  prompt: string
  trigger: AutomationTriggerData
  /** Default true. */
  enabled?: boolean
  /** Default false (announce a successful run). */
  quietOnSuccess?: boolean
  /** Default false (never retry a failed scheduled run). */
  retryOnFailure?: boolean
  /** Optional rolling-24 h spend limit for this job's scheduled runs. */
  dailyCostLimitUsd?: number
}

/** `originPluginId` on the returned job is the calling plugin's own id. */
export interface PluginAutomationCreateResultData {
  ok: true
  job: AutomationJobData
}

/** Only the jobs the calling plugin created; a user's job never appears here. */
export interface PluginAutomationListResultData {
  ok: true
  jobs: AutomationJobData[]
}

export interface PluginAutomationDeleteResultData {
  ok: true
}

export type AutomationMutationData =
  | { ok: true; job: AutomationJobData }
  | {
      ok: false
      error: string
      /**
       * A name the message needs — today the job that would close a chain loop.
       * The dialog substitutes it into `automation.errors.<code>`; absent when
       * the code says everything.
       */
      errorDetail?: string
    }

export type AutomationPauseData =
  | { ok: true; pausedAll: boolean }
  | { ok: false; error: string }

/**
 * Result of setting the global daily budget. `changed: false` means the stored
 * value already matched, so nothing was written and no `automation:changed`
 * event was sent.
 */
export type AutomationGlobalBudgetData =
  | { ok: true; globalDailyCostLimitUsd?: number; changed: boolean }
  | { ok: false; error: string }

/**
 * What a trigger would do if it were saved now, computed read-only by the
 * scheduler with the same validation and maths a save uses.
 *
 * `runs` holds the next few occurrences in epoch ms, strictly increasing. Fewer
 * than three means the schedule is rare, not broken; an empty array means there
 * is no foreseeable next run. An unusable cron or interval answers the same
 * stable `automation.errors.*` code a save would, and a watch trigger answers
 * `not_applicable` — a file has no calendar.
 */
export type AutomationSchedulePreviewData =
  | { ok: true; runs: number[] }
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

// ── File-browser directory watching ────────────────────────────────────────
// Mirrors src/main/fs/watch-service.ts. Only directory names and (optionally)
// changed basenames cross this boundary — never file contents.

export interface FsWatchFailureData {
  directory: string
  /** Short diagnostic; a failed watch is reported, never silently assumed. */
  error: string
}

/** What main is actually watching, and what it could not start watching. */
export interface FsWatchStateData {
  watching: string[]
  failed: FsWatchFailureData[]
}

export interface FsChangedData {
  changes: Array<{
    /** The watched directory whose immediate entries changed. */
    directory: string
    /** Basenames the OS attributed, deduplicated and capped. */
    names: string[]
    /** Some names were dropped, or the platform reported none. */
    truncated: boolean
  }>
  /**
   * Present only when a watch died after the last `fs:watchDirectories`
   * response, so the renderer can stop claiming it is live.
   */
  state?: FsWatchStateData
}

/**
 * One `fs:statPaths` result. `exists: false` with `error: null` is a definite
 * "gone"; a non-null `error` means nothing was proven and the caller must keep
 * its own state `unchecked`. Size and mtime are the only file facts returned —
 * contents never cross this boundary.
 */
export interface FsStatPathResultData {
  path: string
  exists: boolean
  isFile: boolean
  size: number | null
  mtimeMs: number | null
  /** `not_allowed`, `stat_failed`, an errno code, or null when the stat ran. */
  error: string | null
}

/**
 * `TurnStatus` normalized for the renderer. `unknown` means the notification
 * carried no status (or one this build cannot name) — it is never success.
 */
export type CodexTurnOutcomeData = 'completed' | 'interrupted' | 'failed' | 'unknown'

/**
 * `cli:result` payload. Codex turns always carry `outcome`; the legacy Claude
 * bridge has no outcome and reports only `subtype`.
 */
export interface CliResultEventData {
  sessionId?: string
  subtype?: string
  /** Raw `Turn.status` from `turn/completed`, or null when absent. */
  status?: string | null
  /** Normalized terminal outcome emitted by the Codex bridge. */
  outcome?: CodexTurnOutcomeData
  durationMs?: number | null
  codexThreadId?: string
  claudeSessionId?: string
  [key: string]: unknown
}

/**
 * `cli:turnError` payload. `codexErrorInfo` is `TurnError.codexErrorInfo`
 * verbatim — the string enum or a tagged object (see the generated schema).
 */
export interface CliTurnErrorEventData {
  sessionId?: string
  message: string
  details?: string
  willRetry?: boolean
  codexErrorInfo?: unknown
  [key: string]: unknown
}

/**
 * `cli:rateLimitsUpdated` payload. `rateLimits` is the raw `RateLimitSnapshot`
 * exactly as Codex sent it, from either `account/rateLimits/updated` (sparse
 * rolling update) or the post-`initialize` `account/rateLimits/read` (full
 * snapshot). It stays `unknown` on purpose: the renderer's pure
 * `rateLimitView` module is the one place that validates it, so no type here
 * can quietly promise a field the server did not send.
 */
export interface CliRateLimitsUpdatedEventData {
  sessionId?: string
  /** Which protocol call produced the snapshot; a sparse update must merge. */
  source?: 'notification' | 'read'
  rateLimits?: unknown
  /** Only present on the `read` response (the multi-bucket view). */
  rateLimitsByLimitId?: Record<string, unknown> | null
  [key: string]: unknown
}

/**
 * `cli:threadNameUpdated` payload (`thread/name/updated`, ThreadNameUpdatedNotification).
 *
 * `threadId` is a Codex thread id, which is the same id the session list uses
 * as `sessionId` (see `src/main/codex/codex-session-reader.ts` and the
 * `session:rename` handler). `name` is `string | null` on the wire: a null
 * name is not a rename to an empty title and must be ignored, not applied.
 * Ids are optional here because a push payload from the engine is untrusted
 * until the renderer validates it; the schema marks `threadId` required.
 */
export interface CliThreadNameUpdatedEventData {
  sessionId?: string
  threadId?: string
  name?: string | null
}

/**
 * `cli:threadArchived` / `cli:threadDeleted` payload
 * (`thread/archived`, `thread/deleted`; each notification carries only a
 * required `threadId`). No status, cwd or archive flag is sent.
 */
export interface CliThreadLifecycleEventData {
  sessionId?: string
  threadId?: string
}

/**
 * `cli:threadUnarchived` payload (`thread/unarchived`,
 * ThreadUnarchivedNotification). The schema requires exactly one field —
 * `threadId` — so there is no name, cwd or timestamp to restore a row from;
 * the renderer re-reads that session's row from the list index.
 */
export interface CliThreadUnarchivedEventData {
  sessionId?: string
  threadId?: string
}

/**
 * `cli:threadGoalUpdated` payload (`thread/goal/updated`,
 * ThreadGoalUpdatedNotification; verified against the 0.145 schema and
 * binary).
 *
 * Wire shape: `{ threadId, turnId?: string | null, goal: ThreadGoal }`, where
 * `ThreadGoal` requires `threadId`, `objective`, `status` and the
 * `timeUsedSeconds` / `tokensUsed` / `createdAt` / `updatedAt` counters
 * (`tokenBudget` is nullable). The bridge flattens the nested goal; it
 * forwards only what the composer can state honestly and keeps every field
 * optional here because a push payload is untrusted until the renderer
 * validates it.
 */
export interface CliThreadGoalUpdatedEventData {
  sessionId?: string
  threadId?: string
  objective?: string
  status?: 'active' | 'paused' | 'blocked' | 'usageLimited' | 'budgetLimited' | 'complete' | null
  tokensUsed?: number | null
  tokenBudget?: number | null
  timeUsedSeconds?: number | null
}

/**
 * `cli:threadGoalCleared` payload (`thread/goal/cleared`,
 * ThreadGoalClearedNotification). `threadId` is the only field; a cleared
 * goal for another thread must not clear the line on screen.
 */
export interface CliThreadGoalClearedEventData {
  sessionId?: string
  threadId?: string
}

/**
 * `cli:patchUpdated` payload (`item/fileChange/patchUpdated`, Codex 0.145).
 *
 * Verified wire shape (generated schema + binary discriminant):
 * `{ itemId, threadId, turnId, changes: Array<{ path, kind, diff }> }`. Each
 * `diff` is the cumulative unified diff for one file as parsed *so far* — a
 * snapshot to replace, not a delta — and its tail may sit mid-hunk while the
 * model is still writing. Every field is optional here because a push payload
 * is untrusted until `normalizePatchUpdate` validates it; `truncated` is added
 * by the bridge, not the protocol, when `diff` was tail-clipped to 32 KiB.
 */
export interface CliPatchUpdatedEventData {
  sessionId?: string
  itemId?: string
  threadId?: string
  turnId?: string
  changes?: Array<{
    path?: string
    /** `PatchChangeKind` tagged object, forwarded verbatim. */
    kind?: unknown
    diff?: string
    truncated?: boolean
  }>
  [key: string]: unknown
}

/**
 * `cli:engineWarning` payload (`warning`, `guardianWarning`,
 * `deprecationNotice`, `configWarning`; verified against
 * `.scratch/codex-schema/v2/` and the 0.145 binary. `worldWritable` rides the
 * same channel from `windows/worldWritableWarning`).
 *
 * Wire shapes:
 *   warning            `{ message, threadId? }`
 *   guardianWarning    `{ message, threadId }`
 *   deprecationNotice  `{ summary, details? }`
 *   configWarning      `{ summary, details?, path?, range? }`
 *
 * The bridge folds each into `{ kind, message, details, path, range, threadId }`
 * and keeps `message` verbatim. Every field is optional here because a push
 * payload is untrusted until the renderer validates it; `kind` is one of the
 * literal method names above.
 */
export interface CliEngineWarningEventData {
  sessionId?: string
  kind?: 'warning' | 'guardianWarning' | 'deprecationNotice' | 'configWarning' | 'worldWritable'
  /** The engine's own sentence, never re-worded by AIPA. */
  message?: string
  details?: string | null
  /** `configWarning` only: the config file that raised the warning. */
  path?: string | null
  /** `configWarning` only; malformed ranges are forwarded as null. */
  range?: {
    start: { line: number; column: number }
    end: { line: number; column: number }
  } | null
  /** `warning` only: the thread the warning applies to, when named. */
  threadId?: string | null
}

/**
 * `cli:sandboxSetupCompleted` payload (`windowsSandbox/setupCompleted`).
 * Verified wire shape: `{ mode: 'elevated' | 'unelevated', success: boolean,
 * error: string | null }`. `error` is the engine's own failure text; the mode
 * is the only step/target the payload names.
 */
export interface CliSandboxSetupCompletedEventData {
  sessionId?: string
  mode?: 'elevated' | 'unelevated' | null
  success?: boolean
  error?: string | null
}

/**
 * `cli:autoApprovalReview` payload (`item/autoApprovalReview/started` and
 * `/completed`). Verified fields: `reviewId`, `targetItemId` (`string | null`),
 * `review.status`, `review.rationale`, `review.riskLevel`,
 * `review.userAuthorization`, `threadId`, `turnId`, `startedAtMs`,
 * `completedAtMs`. `status` is `inProgress | approved | denied | timedOut |
 * aborted`; a completed event with `inProgress` is dropped in main. The bridge
 * adds `phase`. Every field is optional here because the renderer re-validates
 * push payloads before annotating any card.
 */
export interface CliAutoApprovalReviewEventData {
  sessionId?: string
  phase?: 'started' | 'completed'
  reviewId?: string
  targetItemId?: string
  status?: 'inProgress' | 'approved' | 'denied' | 'timedOut' | 'aborted'
  rationale?: string | null
  riskLevel?: string | null
  userAuthorization?: string | null
  threadId?: string
  turnId?: string
  startedAtMs?: number | null
  completedAtMs?: number | null
}

/**
 * `cli:modelRerouted` payload (`model/rerouted`, ModelReroutedNotification).
 * Every field is required on the wire; they stay optional here because the
 * renderer re-validates before showing anything. `reason` is the
 * `ModelRerouteReason` enum verbatim (currently only `highRiskCyberActivity`).
 */
export interface CliModelReroutedEventData {
  sessionId?: string
  threadId?: string
  turnId?: string
  /** The model the request named. */
  fromModel?: string
  /** The model the turn actually ran on. */
  toModel?: string
  reason?: string
}

/**
 * `cli:accountUpdated` payload (`account/updated`, AccountUpdatedNotification).
 * Both fields are optional and nullable on the wire; `{}` means the account
 * changed but the notification named no new values. The composer chip is
 * refreshed separately by a `cli:rateLimitsUpdated` read.
 */
export interface CliAccountUpdatedEventData {
  sessionId?: string
  authMode?: string | null
  planType?: string | null
}

/**
 * `cli:skillsChanged` payload (`skills/changed`). The notification carries no
 * fields of its own — it is an invalidation signal; only the bridge id is added
 * so the renderer can attribute it to a conversation.
 */
export interface CliSkillsChangedEventData {
  sessionId?: string
}

/**
 * `cli:mcpStartupStatusUpdated` payload (`mcpServer/startupStatus/updated`).
 *
 * Verified wire shape (`.scratch/codex-schema/v2/
 * McpServerStatusUpdatedNotification.json`): `{ name: string, status:
 * 'starting' | 'ready' | 'failed' | 'cancelled', error: string | null,
 * failureReason: 'reauthenticationRequired' | null, threadId: string | null }`.
 * The bridge flattens `name` to `serverName`; `error` and `failureReason` are
 * forwarded verbatim. Every field is optional here because the renderer
 * re-validates a push payload before showing it.
 */
export interface CliMcpStartupStatusEventData {
  sessionId?: string
  serverName?: string
  status?: 'starting' | 'ready' | 'failed' | 'cancelled'
  /** The engine's own failure text, never re-worded. */
  error?: string | null
  /** Typed engine enum token, verbatim. */
  failureReason?: 'reauthenticationRequired' | null
  threadId?: string | null
  /** Set on snapshot reads, not on live notifications. */
  receivedAt?: number
}

/**
 * `cli:mcpOauthLoginCompleted` payload (`mcpServer/oauthLogin/completed`).
 * Verified wire shape: `{ name: string, success: boolean, error: string | null,
 * threadId: string | null }`. Success means the sign-in flow finished, not that
 * the server started — startup arrives separately.
 */
export interface CliMcpOauthLoginCompletedEventData {
  sessionId?: string
  serverName?: string
  success?: boolean
  error?: string | null
  threadId?: string | null
  receivedAt?: number
}

/**
 * `mcp:runtimeStatus` result: the live reports this app-server process has
 * produced, newest per server. The renderer intersects them with the configured
 * server list, so nothing here can create a row on its own.
 */
export interface McpRuntimeStatusData {
  startup: CliMcpStartupStatusEventData[]
  oauth: CliMcpOauthLoginCompletedEventData[]
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
  cliSteerTurn: (args: { sessionId: string; prompt: string; expectedTurnId?: string }) =>
    ipcRenderer.invoke('cli:steerTurn', args) as Promise<{
      success: boolean
      /** The turn `TurnSteerResponse` named, when the engine answered. */
      turnId?: string
      /** The engine's own rejection text (`-32600` and friends), verbatim. */
      error?: string
    }>,
  /**
   * Branch a Codex conversation from an earlier user message.
   *
   * `sessionId` is the Codex thread id. `beforeTurnId` is exclusive: the new
   * thread keeps every turn before it (omit it to copy the whole thread). The
   * reply's `error` is the engine's own text, verbatim. `turnCount` is how much
   * history the branch kept (0 = an empty branch, `null` = the engine did not
   * say), which decides whether the new thread has a transcript to open.
   */
  threadFork: (args: { sessionId: string; beforeTurnId?: string }) =>
    ipcRenderer.invoke('cli:forkThread', args) as Promise<{
      success: boolean
      threadId?: string
      turnCount?: number | null
      error?: string
    }>,

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

  /**
   * Configured Codex hooks for one or more working directories (`hooks/list`).
   * Read-only: trust is written by the user into Codex's config and needs a
   * restart; there is no trust request on the wire. `cwds` is validated in the
   * main process; an omitted list means the session working directory.
   */
  hooksList: (args?: { cwds?: string[] }) =>
    ipcRenderer.invoke('hooks:list', args) as Promise<{
      success: boolean
      data?: CodexHookListGroupData[]
      error?: string
    }>,

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
  // Deleting moves the conversation into the trash; the renderer offers
  // "Recently deleted" to restore it for the retention window. `title` is
  // display text only — main falls back to the session id when it is absent.
  sessionDelete: (id: string, sessionTitle?: string) =>
    ipcRenderer.invoke('session:delete', { sessionId: id, title: sessionTitle }) as Promise<SessionDeleteResultData>,
  sessionFork: (sessionId: string, upToMessageIndex: number) => ipcRenderer.invoke('session:fork', { sessionId, upToMessageIndex }),
  sessionRename: (sessionId: string, title: string) => ipcRenderer.invoke('session:rename', { sessionId, title }),
  sessionGenerateTitle: (description: string) => ipcRenderer.invoke('session:generateTitle', { description }),
  sessionRewind: (sessionId: string, beforeTimestamp: string) => ipcRenderer.invoke('session:rewind', { sessionId, beforeTimestamp }),
  sessionSearch: (query: string, limit?: number) =>
    ipcRenderer.invoke('session:search', { query, limit }) as Promise<SessionSearchResultData[]>,
  /**
   * One page of cross-session hits. `offset` is how many rows the caller
   * already holds; main slices the same ordered scan, so a continuation costs
   * a slice rather than a fresh corpus walk.
   */
  sessionSearchPage: (query: string, page?: {
    offset?: number
    limit?: number
    /** Narrow the scan itself to these origins; `[]` matches nothing. */
    origins?: Array<'prose' | 'tool' | 'thinking'>
    /** Narrow the scan to these sessions; `[]` is an empty scope, not "all". */
    sessionIds?: string[]
  }) =>
    ipcRenderer.invoke('session:searchPage', {
      query,
      offset: page?.offset,
      limit: page?.limit,
      origins: page?.origins,
      sessionIds: page?.sessionIds,
    }) as Promise<SessionSearchPageData>,
  /**
   * Other local conversations that share words with the given prose. The
   * caller passes the open session id so it is never listed as its own
   * relation.
   */
  sessionRelated: (input: { text: string; excludeSessionId?: string; limit?: number }) =>
    ipcRenderer.invoke('session:related', input) as Promise<RelatedSessionsReplyData>,
  /** Whether this profile can run an ask turn; the overlay hides the row when not. */
  sessionAskHistoryStatus: () =>
    ipcRenderer.invoke('session:askHistoryStatus') as Promise<{ available: boolean; reason?: string }>,
  sessionAskHistory: ({ question, locale, requestId, history, scopeSessionIds }: {
    question: string
    locale?: string
    requestId: string
    /** Previous exchange(s); the main process validates and caps them. */
    history?: AskHistoryTurnData[]
    /** Session ids the evidence must come from; an empty array is an empty scope. */
    scopeSessionIds?: string[]
  }) =>
    ipcRenderer.invoke('session:askHistory', { question, locale, requestId, history, scopeSessionIds }) as Promise<AskHistoryResultData>,
  /** Abort the in-flight ask (the overlay closes mid-run) and free the slot. */
  sessionAskHistoryCancel: () => ipcRenderer.invoke('session:askHistoryCancel') as Promise<void>,
  // Read one stored conversation and ask the model for a *reusable procedure*
  // rather than a replay of it. The answer is a draft shown for review; nothing
  // is saved, scheduled or run by this call.
  sessionGeneralizeWorkflow: (input: { sessionId: string; locale?: string; title?: string | null }) =>
    ipcRenderer.invoke('session:generalizeWorkflow', input) as Promise<SessionGeneralizeResultData>,
  // Cancels the one in-flight generalisation, if any. The handler answers with
  // `{ ok: false, error: 'aborted' }`.
  sessionGeneralizeWorkflowCancel: () =>
    ipcRenderer.invoke('session:generalizeWorkflowCancel') as Promise<void>,
  // The skill-shaped counterpart: the same transcript digest, asked for a
  // SKILL.md body instead of workflow steps. One generalisation runs at a time
  // in main, so the two dialogs cannot both hold a model turn.
  sessionGeneralizeSkill: (input: { sessionId: string; locale?: string; title?: string | null }) =>
    ipcRenderer.invoke('session:generalizeSkill', input) as Promise<SessionSkillGeneralizeResultData>,
  sessionGeneralizeSkillCancel: () =>
    ipcRenderer.invoke('session:generalizeSkillCancel') as Promise<void>,
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
  // Every job's remembered runs in one newest-first list, capped by main. An
  // empty `rows` with `total: 0` means nothing has run; a rejected promise means
  // the store could not be read, which is a different fact.
  automationRunActivity: () =>
    ipcRenderer.invoke('automation:runActivity') as Promise<AutomationRunActivityData>,
  automationCreate: (input: AutomationInputData) =>
    ipcRenderer.invoke('automation:create', input) as Promise<AutomationMutationData>,
  // Read-only preview of a schedule the dialog has not saved yet. Never creates,
  // updates or broadcasts; the same validation a save would run answers here.
  automationPreviewSchedule: (trigger: AutomationTriggerData) =>
    ipcRenderer.invoke('automation:preview', trigger) as Promise<AutomationSchedulePreviewData>,
  // A switched-off copy of an existing job. The optional name wins over the
  // generated "<original> (copy)" one; no name is the normal UI path.
  automationClone: (id: string, name?: string) =>
    ipcRenderer.invoke('automation:clone', { id, name }) as Promise<AutomationMutationData>,
  automationUpdate: (id: string, input: AutomationInputData) =>
    ipcRenderer.invoke('automation:update', id, input) as Promise<AutomationMutationData>,
  // The user's delete moves the job into the holding area and answers with the
  // row it became. A refusal carries a `code` so the toast can say why nothing
  // was deleted instead of reporting a success.
  automationDelete: (id: string) =>
    ipcRenderer.invoke('automation:delete', id) as Promise<JobTrashActionResultData>,
  // Recently deleted jobs. `automation:trash:list` rejects when the manifest
  // cannot be read, so an outage is never dressed up as "nothing was deleted".
  automationTrashList: () =>
    ipcRenderer.invoke('automation:trash:list') as Promise<JobTrashListResultData>,
  automationTrashRestore: (id: string) =>
    ipcRenderer.invoke('automation:trash:restore', id) as Promise<JobTrashActionResultData>,
  // Drops entries past the retention window. Safe to call on launch and when
  // the section opens; entries exactly at the window are kept.
  automationTrashPurge: () =>
    ipcRenderer.invoke('automation:trash:purge') as Promise<JobTrashPurgeResultData>,
  automationTrashRemove: (id: string) =>
    ipcRenderer.invoke('automation:trash:remove', id) as Promise<JobTrashActionResultData>,
  automationSetEnabled: (id: string, enabled: boolean) =>
    ipcRenderer.invoke('automation:setEnabled', id, enabled) as Promise<AutomationMutationData>,
  automationRunNow: (id: string) =>
    ipcRenderer.invoke('automation:runNow', id) as Promise<AutomationMutationData>,
  // Answer one held permission request of an unattended run. Names job *and*
  // request: there is no "always allow" and no per-job rule — approving one ask
  // answers that ask only. A request that already settled resolves `not_waiting`.
  automationApprovalRespond: (jobId: string, requestId: string, approved: boolean) =>
    ipcRenderer.invoke('automation:approvalRespond', { jobId, requestId, approved }) as Promise<AutomationApprovalAnswerData>,
  automationSetPausedAll: (paused: boolean) =>
    ipcRenderer.invoke('automation:setPausedAll', paused) as Promise<AutomationPauseData>,
  // `null` clears the global daily budget; the main process validates and
  // broadcasts `automation:changed` only when the value actually changed.
  automationSetGlobalBudget: (limitUsd: number | null) =>
    ipcRenderer.invoke('automation:setGlobalBudget', limitUsd) as Promise<AutomationGlobalBudgetData>,
  // Reported spend for the jobs filed under a resolved org subtree, from
  // `windowStart` to now. `null` when the request itself is unusable (no ids, a
  // start in the future or more than 31 days back) — distinct from an empty
  // summary, which says "nothing is filed under these nodes".
  automationDeptSpend: (departmentIds: string[], windowStart: number) =>
    ipcRenderer.invoke('automation:deptSpend', { departmentIds, windowStart }) as Promise<AutomationDeptSpendData | null>,
  // Stored department caps with their window figures. An empty array means no
  // cap is set anywhere — distinct from a failed read, which rejects.
  automationDeptBudgets: () =>
    ipcRenderer.invoke('automation:deptBudgets') as Promise<AutomationDeptBudgetReportData[]>,
  // `usd: null` clears the cap. `memberIds` is the renderer's subtree at that
  // moment; main validates the number and rejects an empty membership, since a
  // cap that covers no node is a cap that can never hold anything.
  automationDeptBudgetSet: (input: { departmentId: string; usd: number | null; memberIds: string[] }) =>
    ipcRenderer.invoke('automation:deptBudgetSet', input) as Promise<{ ok: boolean; error?: string }>,
  // Membership-only update from the org tree, so a cap starts covering nodes
  // added to its department without the user re-entering the amount. Budgets
  // whose department is missing from `entries` keep their last membership.
  automationDeptBudgetSync: (entries: Array<{ departmentId: string; memberIds: string[] }>) =>
    ipcRenderer.invoke('automation:deptBudgetSync', entries) as Promise<{ ok: boolean }>,
  // The org tree reduced to what a scheduled run needs: each node's id, name
  // and handbook. Main keeps this snapshot beside the jobs and reads it at run
  // start; the renderer is the only writer, so main can never edit it. Text is
  // bounded by main, and `updatedAt` is main's clock, not the caller's.
  automationHandbookSnapshotSync: (entries: DeptHandbookSyncEntryData[]) =>
    ipcRenderer.invoke('automation:handbookSnapshotSync', entries) as Promise<{ ok: boolean; error?: string }>,
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
  /**
   * Persist one composer image into the app-owned attachments directory and
   * return its absolute path. Pass `sourcePath` for a dialog pick, or `data`
   * for pasted/dropped/screenshot bytes. The main process re-validates both
   * the format (by magic bytes) and the size; the renderer's type is a hint.
   */
  fsSaveImageAttachment: (payload: {
    name?: string
    mimeType?: string
    data?: ArrayBuffer
    sourcePath?: string
  }) =>
    ipcRenderer.invoke('fs:saveImageAttachment', payload) as Promise<SaveImageAttachmentData>,
  fsGetHome: () => ipcRenderer.invoke('fs:getHome'),
  fsEnsureDir: (dirPath: string) => ipcRenderer.invoke('fs:ensureDir', dirPath),
  fsListCommands: (workingDir: string) => ipcRenderer.invoke('fs:listCommands', workingDir),
  fsPathExists: (filePath: string) =>
    ipcRenderer.invoke('fs:pathExists', { filePath }) as Promise<boolean>,
  fsGitDiff: (filePath?: string) =>
    ipcRenderer.invoke('fs:gitDiff', { filePath }) as Promise<string | { error: string }>,
  fsGitStatus: () =>
    ipcRenderer.invoke('fs:gitStatus') as Promise<string | { error: string }>,
  /**
   * Replace the directory set this browser instance wants watched. Main
   * refcounts them, so two mounted browsers share one watcher. Passing `[]`
   * stops watching for this subscriber; the returned state says what is
   * actually live and what could not be watched.
   */
  fsWatchDirectories: (directories: string[], subscriberId?: string) =>
    ipcRenderer.invoke('fs:watchDirectories', { directories, subscriberId }) as Promise<FsWatchStateData>,
  /**
   * Size + mtime for a bounded list of absolute paths. Confined to the same
   * allowed roots as the other `fs:*` handlers; a rejected path returns an
   * error instead of a stat, so callers never mistake it for "unchanged".
   */
  fsStatPaths: (paths: string[]) =>
    ipcRenderer.invoke('fs:statPaths', { paths }) as Promise<FsStatPathResultData[]>,
  /** Pushed after the main-process debounce; names only, never contents. */
  onFsChanged: (cb: (payload: FsChangedData) => void): Unsubscribe => {
    const handler = (_: unknown, data: FsChangedData) => cb(data)
    ipcRenderer.on('fs:changed', handler)
    return () => { ipcRenderer.removeListener('fs:changed', handler) }
  },

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

  // `null` subscribes to every conversation's events — the shape the renderer's
  // global stream hook uses. It was always accepted at runtime (`!sessionId`
  // short-circuits the filter); the type now says so instead of forcing casts.
  onCliEvent: (
    sessionId: string | null,
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
      'cli:patchUpdated',
      'cli:threadStarted', 'cli:threadClosed', 'cli:messageStart',
      'cli:tokenUsageUpdated', 'cli:turnError', 'cli:threadStatusChanged',
      'cli:planUpdated', 'cli:compacted',
      // Server-question + observability events (renderer adoption is a later wave)
      'cli:turnDiffUpdated', 'cli:threadSettingsUpdated',
      'cli:serverRequestResolved', 'cli:serverRequestTimedOut',
      // Codex account rate limits (composer chip; payload stays raw)
      'cli:rateLimitsUpdated',
      // Engine-side notices: verbatim warnings, a model reroute the picker
      // would otherwise hide, an account change, and a changed skills
      // catalogue (Settings refetches on it).
      'cli:engineWarning', 'cli:modelRerouted',
      'cli:accountUpdated', 'cli:skillsChanged',
      // Live MCP server startup/auth reports (Settings → MCP rows).
      'cli:mcpStartupStatusUpdated', 'cli:mcpOauthLoginCompleted',
      // Codex thread life-cycle changes made by any client (CLI rename/archive/
      // delete). The renderer edits the session list in place from these.
      'cli:threadNameUpdated', 'cli:threadArchived', 'cli:threadDeleted',
      // Thread goal (standing objective shown in the composer strip) and the
      // inverse of archive — the row belongs back in the sidebar.
      'cli:threadGoalUpdated', 'cli:threadGoalCleared', 'cli:threadUnarchived',
      // Normalized `hook/started` / `hook/completed`. A blocked hook is the
      // explanation for a turn with no model answer.
      'cli:hookRun',
      // Windows sandbox lifecycle + the automatic reviewer's verdict on an
      // existing item. The sandbox warning itself rides `cli:engineWarning`
      // with `kind: 'worldWritable'`.
      'cli:sandboxSetupCompleted', 'cli:autoApprovalReview',
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
  /**
   * Live MCP startup/auth reports from the current app-server process. Read
   * when Settings → MCP opens so a status reported before the page mounted is
   * not lost; an open page also listens to the `cli:*` push channels.
   */
  mcpRuntimeStatus: () =>
    ipcRenderer.invoke('mcp:runtimeStatus') as Promise<McpRuntimeStatusData>,
  mcpList: () => ipcRenderer.invoke('mcp:list') as Promise<McpServerConfigData[]>,
  mcpSetEnabled: (serverName: string, enabled: boolean) =>
    ipcRenderer.invoke('mcp:setEnabled', { serverName, enabled }) as Promise<{ success: boolean; error?: string }>,
  mcpAdd: (name: string, type: string, config: Record<string, unknown>) =>
    ipcRenderer.invoke('mcp:add', { name, type, config }) as Promise<{ success: boolean; error?: string }>,
  mcpRemove: (name: string) =>
    ipcRenderer.invoke('mcp:remove', { name }) as Promise<{ success: boolean; error?: string }>,
  mcpGetTools: (serverName: string) =>
    ipcRenderer.invoke('mcp:getTools', { serverName }) as Promise<{ tools: { name: string; description?: string }[] }>,
  /**
   * Reload the MCP configuration of the running Codex engine
   * (`config/mcpServer/reload`). It is one global action, because the protocol
   * has no per-server restart; each server's new state arrives afterwards on
   * `cli:mcpStartupStatusUpdated`. `code: 'no_engine'` means there was no
   * running engine to reload — AIPA does not spawn one just to reload a file.
   */
  mcpReload: () =>
    ipcRenderer.invoke('mcp:reload') as Promise<{
      success: boolean
      error?: string
      code?: 'no_engine'
    }>,

  // ── Feedback ─────────────────────────────
  feedbackRate: (messageId: string, rating: 'up' | 'down' | null) =>
    ipcRenderer.invoke('feedback:rate', { messageId, rating }),

  // ── URL metadata (Iteration 462) ──────
  urlFetchMeta: (url: string) => ipcRenderer.invoke('url:fetchMeta', url) as Promise<{
    title: string; description: string; favicon: string; domain: string
  } | null>,

  // ── Skills ─────────────────────────────
  // Provenance fields are added in wave 64 and are absent on older entries.
  skillsList: (workingDir?: string) =>
    ipcRenderer.invoke('skills:list', workingDir) as Promise<SkillInfoData[]>,
  // `token` is the version of the file this read saw; `skills:update` refuses
  // to save unless it is handed back, so an edit cannot silently overwrite a
  // change made outside the app.
  skillsRead: (dirPath: string) =>
    ipcRenderer.invoke('skills:read', dirPath) as Promise<{
      content?: string
      token?: SkillFileTokenData
      error?: string
    }>,
  // Omitting `replace` refuses to overwrite an existing folder (`skill_exists`
  // plus that folder's path and best-effort name). The create form previews the
  // same path `sanitizeSkillDirName` will create, and only re-sends with
  // `replace: true` after the user explicitly chooses to replace.
  skillsInstall: (args: { name: string; content: string; replace?: boolean }) =>
    ipcRenderer.invoke('skills:install', args) as Promise<
      | { success: true; dirPath: string }
      | {
          success: false
          code: 'skill_exists' | 'invalid_name' | 'outside_skills' | 'write_failed'
          error: string
          dirPath?: string
          name?: string
        }
    >,
  // Edits an installed skill by identity. Main re-reads the file and preserves
  // every frontmatter key the editor does not own; `force: true` is only sent
  // after a `changed_on_disk` refusal and the user choosing "Overwrite anyway".
  skillsUpdate: (args: SkillUpdateArgsData) =>
    ipcRenderer.invoke('skills:update', args) as Promise<SkillUpdateResultData>,
  // Deleting now moves the skill folder into the trash; the renderer offers
  // "Recently deleted" to restore it for the retention window.
  skillsDelete: (dirPath: string) =>
    ipcRenderer.invoke('skills:delete', dirPath) as Promise<
      | { success: true; entry: TrashedSkillEntryData }
      | { success: false; error: string; code: SkillTrashErrorCode }
    >,
  skillsTrashList: () =>
    ipcRenderer.invoke('skills:trash:list') as Promise<SkillTrashListResultData>,
  skillsTrashRestore: (id: string) =>
    ipcRenderer.invoke('skills:trash:restore', id) as Promise<SkillTrashActionResultData>,
  skillsTrashPurge: () =>
    ipcRenderer.invoke('skills:trash:purge') as Promise<SkillTrashPurgeResultData>,
  skillsTrashRemove: (id: string) =>
    ipcRenderer.invoke('skills:trash:remove', id) as Promise<SkillTrashActionResultData>,

  // ── Deleted conversations ──────────────
  // Same holding-area shape as skills above: every call resolves with a reason
  // rather than rejecting, so a refusal can be shown next to the row.
  sessionsTrashList: () =>
    ipcRenderer.invoke('session:trash:list') as Promise<SessionTrashListResultData>,
  sessionsTrashRestore: (id: string) =>
    ipcRenderer.invoke('session:trash:restore', id) as Promise<SessionTrashActionResultData>,
  sessionsTrashPurge: () =>
    ipcRenderer.invoke('session:trash:purge') as Promise<SessionTrashPurgeResultData>,
  sessionsTrashRemove: (id: string) =>
    ipcRenderer.invoke('session:trash:remove', id) as Promise<SessionTrashActionResultData>,

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

  // ── Backup & Restore (format 2) ──────
  // Counts cover every section the file carries; a section the user had none of
  // is simply zero rather than absent, so the report can say "0 jobs" honestly.
  backupExport: () =>
    ipcRenderer.invoke('backup:export') as Promise<{
      success?: boolean; canceled?: boolean; error?: string;
      filePath?: string; sizeKB?: number; backupVersion?: number;
      counts?: Record<string, number>
    }>,
  backupImport: () =>
    ipcRenderer.invoke('backup:import') as Promise<{
      success?: boolean; canceled?: boolean; error?: string; errorCode?: string;
      backupVersion?: number; backupDate?: string; olderVersion?: boolean;
      written?: Record<string, number>; skippedExisting?: Record<string, number>;
      failed?: Record<string, number>;
      refused?: { section: string; path: string; reason: string }[];
      warnings?: { code: string; count?: number; version?: number }[];
      sectionsPresent?: { automations: boolean; skills: boolean; memoryFiles: boolean; sessionTrash: boolean }
    }>,

  // ── Automatic backups (wave 77A) ──────
  // The same versioned document the manual export writes, saved on a rolling
  // schedule under <userData>/backups. Restore runs the same merge import.
  backupList: () =>
    ipcRenderer.invoke('backup:list') as Promise<{
      success?: boolean; error?: string;
      dir?: string;
      policy?: { enabled: boolean; interval: 'daily' | 'weekly'; retention: number };
      lastAttemptAt?: number | null; lastSuccessAt?: number | null;
      lastResult?: {
        ok: boolean; at: number; fileName?: string; sizeBytes?: number;
        pruned: number; leftAlone: number; pruneFailures: number;
        error?: 'collect_failed' | 'write_failed'
      } | null;
      backups?: { name: string; sizeBytes: number; createdAt: number }[];
      foreignCount?: number
    }>,
  backupRunNow: () =>
    ipcRenderer.invoke('backup:runNow') as Promise<{
      ok: boolean; skipped?: boolean;
      reason?: 'disabled' | 'never' | 'new_window' | 'already_in_window';
      fileName?: string; sizeBytes?: number; createdAt?: number;
      pruned: number; leftAlone: number; pruneFailures: number;
      error?: 'collect_failed' | 'write_failed'
    }>,
  backupSetPolicy: (patch: { enabled?: boolean; retention?: number; interval?: 'daily' | 'weekly' }) =>
    ipcRenderer.invoke('backup:setPolicy', patch) as Promise<{
      success?: boolean; error?: string;
      policy?: { enabled: boolean; interval: 'daily' | 'weekly'; retention: number }
    }>,
  backupDelete: (name: string) =>
    ipcRenderer.invoke('backup:delete', { name }) as Promise<{
      success?: boolean; error?: 'not_ours' | 'not_found' | 'delete_failed'
    }>,
  backupRestore: (name: string) =>
    ipcRenderer.invoke('backup:restore', { name }) as Promise<{
      success?: boolean; error?: string; errorCode?: string;
      backupVersion?: number; backupDate?: string; olderVersion?: boolean;
      written?: Record<string, number>; skippedExisting?: Record<string, number>;
      failed?: Record<string, number>;
      refused?: { section: string; path: string; reason: string }[];
      warnings?: { code: string; count?: number; version?: number }[];
      sectionsPresent?: { automations: boolean; skills: boolean; memoryFiles: boolean; sessionTrash: boolean }
    }>,
  onBackupChanged: (cb: () => void): Unsubscribe => {
    const handler = () => cb()
    ipcRenderer.on('backup:changed', handler)
    return () => { ipcRenderer.removeListener('backup:changed', handler) }
  },

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
      truncated: string[]
      unreadable: MemoryUnreadableData[]
      sources: MemorySourceData[]
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
  // `schedule` capability: a plugin manages only the automations it created.
  // Every refusal rejects with a `[code] message` error, like `chat.ask`.
  pluginAutomationCreate: (pluginId: string, input: PluginAutomationInputData) =>
    ipcRenderer.invoke('plugin:automation:create', { pluginId, input }) as Promise<PluginAutomationCreateResultData>,
  pluginAutomationList: (pluginId: string) =>
    ipcRenderer.invoke('plugin:automation:list', { pluginId }) as Promise<PluginAutomationListResultData>,
  pluginAutomationDelete: (pluginId: string, id: string) =>
    ipcRenderer.invoke('plugin:automation:delete', { pluginId, id }) as Promise<PluginAutomationDeleteResultData>,
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
