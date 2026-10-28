/**
 * CodexBridge — replaces StreamBridge for OpenAI Codex CLI integration.
 *
 * Speaks JSON-RPC 2.0 over stdio (newline-delimited JSON) to `codex app-server --stdio`.
 * Maps Codex protocol events to the same EventEmitter interface that StreamBridge used,
 * so the IPC layer and renderer need minimal changes.
 *
 * Protocol reference: the `codex/` sparse checkout is empty, so the schema is
 * generated from the installed binary (0.145.x):
 *
 *     node node_modules/@openai/codex/bin/codex.js \
 *       app-server generate-json-schema --out .scratch/codex-schema
 *
 * Files this bridge depends on (paths under `.scratch/codex-schema/`):
 *   - `ServerRequest.json` — every server→client request method
 *   - `ToolRequestUserInputParams.json` / `ToolRequestUserInputResponse.json`
 *   - `McpServerElicitationRequestParams.json` / `McpServerElicitationRequestResponse.json`
 *   - `CommandExecutionRequestApprovalResponse.json`, `FileChangeRequestApprovalResponse.json`,
 *     `PermissionsRequestApprovalResponse.json`
 *   - `ServerNotification.json` — every server→client notification
 *   - `v2/ModelListResponse.json`, `v2/GetAccountTokenUsageResponse.json`,
 *     `v2/GetAccountRateLimitsResponse.json`,
 *     `v2/AccountRateLimitsUpdatedNotification.json`, `v2/SkillsListResponse.json`
 *
 * `.scratch/` is gitignored; regenerate the schema before changing field names.
 */
import { spawn, ChildProcess } from 'child_process'
import { createInterface } from 'readline'
import { EventEmitter } from 'events'
import { getCodexPath } from './codex-resolver'
import { sanitizeCodexEnv } from './codex-env'
import { normalizeTurnCompleted } from './turn-outcome'
import { readCodexMcpServers } from '../config/codex-config-manager'
import { createLogger } from '../utils/logger'

const log = createLogger('codex-bridge')

// ── Types ────────────────────────────────────────────

/**
 * Approval policy names as callers know them. The wire enum (0.145) is
 * `untrusted | on-request | granular | never`; the legacy names are mapped in
 * `normalizeApprovalPolicy` because they are spread across older call sites.
 */
export type ApprovalPolicy = 'never' | 'unless-allow-listed' | 'on-request' | 'always'

/**
 * Sandbox values `thread/start` actually accepts (0.145 wire enum, kebab-case).
 * Code that builds a turn must take the literal from here: writing the
 * camelCase name by hand fails the whole `thread/start` with "unknown variant",
 * which silently disables every internal read-only turn.
 */
export type CodexSandbox = 'read-only' | 'workspace-write' | 'danger-full-access'

export const CODEX_SANDBOX = {
  readOnly: 'read-only',
  workspaceWrite: 'workspace-write',
  dangerFullAccess: 'danger-full-access',
} as const satisfies Record<string, CodexSandbox>

/**
 * Codex `UserInput` (app-server protocol, v2). Mirrors the subset AIPA sends:
 * text plus the image/audio variants that carry a URL. `localImage` stays
 * available for callers that already have an on-disk path.
 */
export type CodexUserInput =
  | { type: 'text'; text: string }
  | { type: 'image'; url: string }
  | { type: 'localImage'; path: string }
  | { type: 'audio'; url: string }
  | { type: 'localAudio'; path: string }

export interface CodexSendMessageArgs {
  prompt: string
  /** Structured input for turn/start. When omitted, `prompt` is sent as one text part. */
  input?: CodexUserInput[]
  cwd: string
  threadId?: string          // existing thread to resume
  model?: string
  /** Reasoning effort for the turn; dropped unless the running model advertises it. */
  effort?: string
  env: Record<string, string>
  approvalPolicy?: ApprovalPolicy
  /** Accepts either the wire spelling (`read-only`) or the legacy camelCase. */
  sandbox?: string
  permissions?: string       // experimental profile id (e.g. ':workspace')
  personality?: 'friendly' | 'pragmatic' | 'none'
  ephemeral?: boolean        // don't persist the thread to Codex session history
  requireAuth?: boolean      // fail fast via account/read when Codex has no credentials
  developerInstructions?: string
  flags?: string[]           // unused, kept for interface compat
}

/**
 * One entry of `model/list` (`v2/ModelListResponse.json`), trimmed to the
 * fields a picker needs. `hidden` is preserved so callers can filter it.
 */
export interface CodexModelInfo {
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

/** `account/usage/read` (`v2/GetAccountTokenUsageResponse.json`), normalized. */
export interface CodexAccountUsage {
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

/** One bucket of `account/rateLimits/read` (`RateLimitSnapshot`). */
export interface CodexRateLimitWindow {
  usedPercent: number
  windowDurationMins: number | null
  resetsAt: number | null
}

export interface CodexRateLimitSnapshot {
  limitId: string | null
  limitName: string | null
  planType: string | null
  primary: CodexRateLimitWindow | null
  secondary: CodexRateLimitWindow | null
  credits: { hasCredits: boolean; unlimited: boolean; balance: string | null } | null
  rateLimitReachedType: string | null
  spendControlReached: boolean | null
}

/** `account/rateLimits/read` (`v2/GetAccountRateLimitsResponse.json`), normalized. */
export interface CodexRateLimits {
  fetchedAt: number
  rateLimits: CodexRateLimitSnapshot
  rateLimitsByLimitId: Record<string, CodexRateLimitSnapshot> | null
  rateLimitResetCredits: { availableCount: number } | null
}

/** One enabled skill from `skills/list` (`v2/SkillsListResponse.json`). */
export interface CodexSkillInfo {
  name: string
  description: string
  path: string
  scope: 'user' | 'repo' | 'system' | 'admin' | string
  enabled: boolean
  shortDescription?: string | null
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  method: string
  timer: NodeJS.Timeout
}

/** A server→client request awaiting a user answer. */
type ServerRequestKind = 'approval' | 'permissions' | 'legacy' | 'userInput' | 'elicitation'

interface PendingServerRequest {
  /** The raw JSON-RPC id. RequestId is `string | integer`, so never coerce it blindly. */
  id: string | number
  method: string
  kind: ServerRequestKind
  timer: NodeJS.Timeout
  /** requestUserInput question ids, used to build the response map. */
  questionIds?: string[]
}

/** One question of a `requestUserInput` request, as the renderer receives it. */
export interface CodexQuestionPayload {
  id: string
  header: string
  question: string
  options: { label: string; description: string }[] | null
  isOther: boolean
  isSecret: boolean
}

// Hard bounds on the `codexQuestions` payload: a hostile or buggy server must
// not be able to grow the IPC message or the renderer's DOM without limit.
const MAX_CODEX_QUESTIONS = 10
const MAX_CODEX_QUESTION_OPTIONS = 20
const MAX_CODEX_QUESTION_HEADER = 300
const MAX_CODEX_QUESTION_TEXT = 300
const MAX_CODEX_QUESTION_LABEL = 200
const MAX_CODEX_QUESTION_DESCRIPTION = 300

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value
}

/**
 * Normalize the `questions` array of `item/tool/requestUserInput` into the
 * bounded shape the renderer's choice form consumes. Questions with an empty
 * id are dropped (the id is the answer-map key), duplicate ids keep the first
 * occurrence, and every string is clipped so one hostile payload cannot blow
 * up the IPC message.
 */
export function boundCodexQuestions(raw: unknown): CodexQuestionPayload[] {
  if (!Array.isArray(raw)) return []
  const result: CodexQuestionPayload[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (result.length >= MAX_CODEX_QUESTIONS) break
    const question = asRecord(item)
    if (!question) continue
    const id = stringOr(question.id).trim()
    if (!id || seen.has(id)) continue
    seen.add(id)

    const options: { label: string; description: string }[] = []
    if (Array.isArray(question.options)) {
      for (const rawOption of question.options) {
        if (options.length >= MAX_CODEX_QUESTION_OPTIONS) break
        const option = asRecord(rawOption)
        if (!option) continue
        const label = clip(stringOr(option.label).trim(), MAX_CODEX_QUESTION_LABEL)
        if (!label) continue
        options.push({
          label,
          description: clip(stringOr(option.description).trim(), MAX_CODEX_QUESTION_DESCRIPTION),
        })
      }
    }

    result.push({
      id,
      header: clip(stringOr(question.header, id), MAX_CODEX_QUESTION_HEADER),
      question: clip(stringOr(question.question), MAX_CODEX_QUESTION_TEXT),
      options: options.length > 0 ? options : null,
      isOther: question.isOther === true,
      isSecret: question.isSecret === true,
    })
  }
  return result
}

interface JsonRpcRequest {
  id: number
  method: string
  params: Record<string, unknown>
}

interface JsonRpcResponse {
  id: number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

interface JsonRpcNotification {
  method: string
  params: Record<string, unknown>
}

// ── Constants ────────────────────────────────────────

export class CodexAuthError extends Error {}

/** turn/start and turn/steer expect `UserInput[]`, not a bare string. */
function toUserInput(prompt: string): CodexUserInput[] {
  return [{ type: 'text', text: prompt }]
}

/** Codex thread ids are UUIDs; anything else cannot name a real thread. */
const THREAD_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The app-server rejects an unknown enum variant with "unknown variant", which
 * fails the whole `thread/start`. Callers arrived at these fields from two
 * different generations of Codex, so accept both spellings at the boundary and
 * send only what 0.145 declares: `read-only | workspace-write | danger-full-access`.
 */
const SANDBOX_WIRE: Record<string, string> = {
  readonly: 'read-only',
  'read-only': 'read-only',
  workspacewrite: 'workspace-write',
  'workspace-write': 'workspace-write',
  dangerfullaccess: 'danger-full-access',
  'danger-full-access': 'danger-full-access',
}

function normalizeSandbox(value: string | undefined): string | undefined {
  if (!value) return undefined
  return SANDBOX_WIRE[value.toLowerCase()] ?? value
}

/**
 * Map the adapter's approval names onto the 0.145 enum
 * (`untrusted | on-request | granular | never`). `always` meant "ask before
 * every command", which is Codex's `untrusted`; `unless-allow-listed` is the
 * middle ground and becomes `on-request`. `granular` is a struct variant, so it
 * is never produced here.
 */
const APPROVAL_WIRE: Record<string, string> = {
  always: 'untrusted',
  'unless-allow-listed': 'on-request',
  'on-request': 'on-request',
  onrequest: 'on-request',
  never: 'never',
  untrusted: 'untrusted',
}

function normalizeApprovalPolicy(value: string | undefined): string | undefined {
  if (!value) return undefined
  return APPROVAL_WIRE[value.toLowerCase()] ?? value
}

/** Flatten a Responses-style content array (input_text / output_text / text). */
function extractContentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map(part => (typeof part === 'string' ? part : (part as Record<string, unknown>)?.text))
    .filter((t): t is string => typeof t === 'string')
    .join('')
}

/**
 * Reduce a unified diff to the old/new strings the renderer's DiffView expects.
 * Context lines belong to both sides; file headers and hunk markers are noise.
 */
function splitUnifiedDiff(diff: unknown): { oldString: string; newString: string } {
  if (typeof diff !== 'string' || !diff) return { oldString: '', newString: '' }
  const oldLines: string[] = []
  const newLines: string[] = []
  for (const line of diff.split('\n')) {
    if (
      line.startsWith('@@') ||
      line.startsWith('---') ||
      line.startsWith('+++') ||
      line.startsWith('diff ') ||
      line.startsWith('index ') ||
      line.startsWith('\\ No newline')
    ) continue
    if (line.startsWith('-')) oldLines.push(line.slice(1))
    else if (line.startsWith('+')) newLines.push(line.slice(1))
    else {
      const context = line.startsWith(' ') ? line.slice(1) : line
      oldLines.push(context)
      newLines.push(context)
    }
  }
  return { oldString: oldLines.join('\n'), newString: newLines.join('\n') }
}

/** Parse markdown checkboxes from a Codex plan item into renderer todo rows. */
function parseChecklist(text: string): Array<{ content: string; status: string }> {
  const todos: Array<{ content: string; status: string }> = []
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(?:[-*]|\d+\.)\s+\[([ xX>~-])\]\s+(.+)$/)
    if (!m) continue
    const mark = m[1]
    todos.push({
      content: m[2].trim(),
      status: mark === 'x' || mark === 'X' ? 'completed' : mark === '>' || mark === '~' ? 'in_progress' : 'pending',
    })
  }
  return todos
}

// ── Protocol payload normalizers ─────────────────────
// Every field name below is taken from the generated schema listed in the file
// header; none of these are guessed.

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function stringOr(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeModel(raw: unknown): CodexModelInfo | null {
  const m = asRecord(raw)
  const id = stringOr(m?.id)
  if (!id) return null
  return {
    id,
    model: stringOr(m?.model, id),
    displayName: stringOr(m?.displayName, id),
    description: stringOr(m?.description),
    hidden: m?.hidden === true,
    isDefault: m?.isDefault === true,
    defaultReasoningEffort: stringOr(m?.defaultReasoningEffort),
    supportedReasoningEfforts: Array.isArray(m?.supportedReasoningEfforts)
      ? (m!.supportedReasoningEfforts as unknown[])
          .map(option => {
            const o = asRecord(option)
            const effort = stringOr(o?.reasoningEffort)
            return effort ? { reasoningEffort: effort, description: stringOr(o?.description) } : null
          })
          .filter((option): option is { reasoningEffort: string; description: string } => option !== null)
      : [],
    inputModalities: Array.isArray(m?.inputModalities)
      ? (m!.inputModalities as unknown[]).filter((modality): modality is string => typeof modality === 'string')
      : [],
    supportsPersonality: m?.supportsPersonality === true,
  }
}

function normalizeUsage(raw: unknown): CodexAccountUsage {
  const r = asRecord(raw) ?? {}
  const summary = asRecord(r.summary) ?? {}
  // Keep the bucket list bounded: a user with years of history should not push
  // an unbounded array through IPC on every settings read.
  const buckets = Array.isArray(r.dailyUsageBuckets)
    ? (r.dailyUsageBuckets as unknown[]).slice(-366).map(bucket => {
        const b = asRecord(bucket)
        return { startDate: stringOr(b?.startDate), tokens: numberOrNull(b?.tokens) ?? 0 }
      })
    : null
  return {
    fetchedAt: Date.now(),
    summary: {
      lifetimeTokens: numberOrNull(summary.lifetimeTokens),
      peakDailyTokens: numberOrNull(summary.peakDailyTokens),
      currentStreakDays: numberOrNull(summary.currentStreakDays),
      longestStreakDays: numberOrNull(summary.longestStreakDays),
      longestRunningTurnSec: numberOrNull(summary.longestRunningTurnSec),
    },
    dailyUsageBuckets: buckets,
  }
}

function normalizeRateLimitWindow(raw: unknown): CodexRateLimitWindow | null {
  const w = asRecord(raw)
  if (!w) return null
  return {
    usedPercent: numberOrNull(w.usedPercent) ?? 0,
    windowDurationMins: numberOrNull(w.windowDurationMins),
    resetsAt: numberOrNull(w.resetsAt),
  }
}

function normalizeRateLimitSnapshot(raw: unknown): CodexRateLimitSnapshot {
  const r = asRecord(raw) ?? {}
  const credits = asRecord(r.credits)
  return {
    limitId: typeof r.limitId === 'string' ? r.limitId : null,
    limitName: typeof r.limitName === 'string' ? r.limitName : null,
    planType: typeof r.planType === 'string' ? r.planType : null,
    primary: normalizeRateLimitWindow(r.primary),
    secondary: normalizeRateLimitWindow(r.secondary),
    credits: credits
      ? {
          hasCredits: credits.hasCredits === true,
          unlimited: credits.unlimited === true,
          balance: typeof credits.balance === 'string' ? credits.balance : null,
        }
      : null,
    rateLimitReachedType: typeof r.rateLimitReachedType === 'string' ? r.rateLimitReachedType : null,
    spendControlReached: typeof r.spendControlReached === 'boolean' ? r.spendControlReached : null,
  }
}

function normalizeRateLimits(raw: unknown): CodexRateLimits {
  const r = asRecord(raw) ?? {}
  const byId = asRecord(r.rateLimitsByLimitId)
  const credits = asRecord(r.rateLimitResetCredits)
  return {
    fetchedAt: Date.now(),
    rateLimits: normalizeRateLimitSnapshot(r.rateLimits),
    rateLimitsByLimitId: byId
      ? Object.fromEntries(Object.entries(byId).map(([key, value]) => [key, normalizeRateLimitSnapshot(value)]))
      : null,
    rateLimitResetCredits: credits
      ? { availableCount: numberOrNull(credits.availableCount) ?? 0 }
      : null,
  }
}

function normalizeSkills(raw: unknown): CodexSkillInfo[] {
  const response = asRecord(raw) ?? {}
  const entries = Array.isArray(response.data) ? response.data as unknown[] : []
  const byPath = new Map<string, CodexSkillInfo>()
  for (const entry of entries) {
    const e = asRecord(entry)
    const skills = Array.isArray(e?.skills) ? e!.skills as unknown[] : []
    for (const skill of skills) {
      const s = asRecord(skill)
      const name = stringOr(s?.name)
      if (!name) continue
      const path = stringOr(s?.path)
      // Multiple cwds can surface the same skill directory; the first wins.
      if (path && byPath.has(path)) continue
      const info: CodexSkillInfo = {
        name,
        description: stringOr(s?.description),
        path,
        scope: stringOr(s?.scope, 'user'),
        enabled: s?.enabled !== false,
        ...(typeof s?.shortDescription === 'string' ? { shortDescription: s.shortDescription } : {}),
      }
      byPath.set(path || `${info.scope}:${name}`, info)
    }
  }
  return [...byPath.values()]
}

/** Token usage normalized into the snake_case shape the renderer already reads. */
interface CodexClaudeUsage {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
  context_window?: number
}

const REQUEST_TIMEOUT_MS = 60_000
const INITIALIZE_TIMEOUT_MS = 15_000
/** MCP tools are a nicety on the init event — never hold the handshake for them. */
const MCP_STATUS_TIMEOUT_MS = 3_000
/**
 * How long a user-facing server request (approval or question) may sit
 * unanswered. After this the bridge sends a JSON-RPC error, so a turn cannot
 * hang forever waiting for an answer nobody gave. Per-request
 * `autoResolutionMs` (requestUserInput) wins when it is shorter.
 */
const SERVER_REQUEST_TIMEOUT_MS = 10 * 60_000
/** Probes must not hold Settings/UI open when Codex is slow or offline. */
const PROBE_TIMEOUT_MS = 10_000
/**
 * How long a turn may wait for `model/list` just to validate `effort`. A turn
 * is the user's own message — it must never queue behind a catalogue probe.
 */
const EFFORT_LOOKUP_TIMEOUT_MS = 1_500

/**
 * Resolve with `promise`, or reject once `ms` elapses. The timer is unref'd so
 * a pending validation cannot keep the main process alive.
 */
function raceWithDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)
    timer.unref?.()
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (err) => { clearTimeout(timer); reject(err) },
    )
  })
}
const SKILLS_INIT_TIMEOUT_MS = 3_000
const MODEL_LIST_TIMEOUT_MS = 15_000
const MODEL_LIST_CACHE_TTL_MS = 5 * 60_000
const USAGE_CACHE_TTL_MS = 60_000
const RATE_LIMITS_CACHE_TTL_MS = 30_000
/**
 * The first `account/rateLimits/read` after a thread starts only warms the
 * composer's limit chip. A signed-out or slow account must never hold the
 * user's turn, so the read is fire-and-forget with a short deadline; on
 * failure the chip waits for the next `account/rateLimits/updated`.
 */
const RATE_LIMITS_PRIME_TIMEOUT_MS = 4_000
const SKILLS_CACHE_TTL_MS = 60_000
/** Chatty delta streams: coalesce/drop and hard-cap what crosses IPC. */
const TOOL_PROGRESS_MIN_INTERVAL_MS = 100
const TOOL_PROGRESS_CHUNK_LIMIT = 4 * 1024
const PLAN_DELTA_MIN_INTERVAL_MS = 150
const PLAN_DELTA_BUFFER_LIMIT = 16 * 1024
const TURN_DIFF_LIMIT = 32 * 1024

// ── CodexBridge ──────────────────────────────────────

export class CodexBridge extends EventEmitter {
  private proc: ChildProcess | null = null
  private bridgeSessionId: string
  private nextId = 0
  private pendingRequests = new Map<number, PendingRequest>()
  private initialized = false
  private currentThreadId: string | null = null
  private currentTurnId: string | null = null
  // Codex reports usage separately from turn/completed, so keep the latest
  // breakdown to attach to the final result event.
  private lastTokenUsage: CodexClaudeUsage | null = null
  // Deltas arrive before the completed item; remembering which item streamed
  // keeps item/completed from appending the full text a second time.
  private streamedTextItems = new Set<string>()
  private streamedThinkingKinds = new Map<string, 'summary' | 'content'>()
  // The `error` notification and a failed turn/completed describe the same
  // failure; surface it once.
  private errorTurnId: string | null = null
  // Item ids whose tool card has been opened, so a completed item without a
  // preceding item/started still gets one before its result resolves.
  private toolStarts = new Set<string>()
  // Server approval responses use different decision enums per method.
  private pendingApprovalKinds = new Map<string, 'command' | 'fileChange' | 'permissions' | 'legacy'>()
  private pendingPermissionProfiles = new Map<string, unknown>()
  // Every server→client request that is waiting on the user. Entries are
  // removed when answered, resolved by the server, timed out, or interrupted.
  private pendingServerRequests = new Map<string, PendingServerRequest>()
  // Unknown methods are logged once per method, not once per occurrence.
  private loggedUnknownServerRequests = new Set<string>()
  // The cwd of the current thread; skills/list is relative to it.
  private currentCwd: string | null = null
  // Per-bridge caches for the read-only protocol probes.
  private modelListCache: { models: CodexModelInfo[]; fetchedAt: number } | null = null
  // Effort values rejected for a model, so each rejection is logged once.
  private loggedDroppedEfforts = new Set<string>()
  private usageCache: { usage: CodexAccountUsage; fetchedAt: number } | null = null
  private rateLimitsCache: { rateLimits: CodexRateLimits; fetchedAt: number } | null = null
  // One priming read per bridge lifetime; retrying every sendMessage would
  // stampede the account endpoint for data that only changes on push.
  private rateLimitsPrimed = false
  private skillsCache: { cwd: string; skills: CodexSkillInfo[]; fetchedAt: number } | null = null
  // Bounded bookkeeping for streaming notifications.
  private toolProgressLastAt = new Map<string, number>()
  private planDeltaBuffers = new Map<string, string>()
  private planDeltaLastEmit = new Map<string, number>()

  constructor(bridgeSessionId: string) {
    super()
    this.bridgeSessionId = bridgeSessionId
  }

  // ── Public API ───────────────────────────────────

  /**
   * Start or resume a conversation thread and send the first user message.
   * Replaces StreamBridge.sendMessage().
   */
  async sendMessage(args: CodexSendMessageArgs): Promise<void> {
    const codexPath = getCodexPath()
    const env = sanitizeCodexEnv({
      ...args.env,
    })

    log.info(`Spawning codex app-server: ${codexPath}`)

    this.currentCwd = args.cwd
    this.proc = spawn(codexPath, ['app-server', '--stdio'], {
      cwd: args.cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this._attachOutputHandlers()

    // Step 1: Initialize handshake
    await this._initialize({ cwd: args.cwd })

    // Without credentials Codex retries the model request indefinitely, so
    // callers that can't show a login flow check up front.
    if (args.requireAuth && !args.env.OPENAI_API_KEY) {
      const account = await this._sendRequest('account/read', {}) as { account?: unknown; requiresOpenaiAuth?: boolean }
      if (!account?.account && account?.requiresOpenaiAuth) {
        throw new CodexAuthError('Codex is not signed in and no OpenAI API key is configured')
      }
    }

    // Step 2: Start or resume thread
    if (args.threadId) {
      await this._resumeThread(args.threadId, args)
    } else {
      await this._startThread(args)
    }

    // Step 3: warm the account-limit chip in the background, then send the
    // first user turn. The read is not awaited on purpose.
    this._primeRateLimits()
    await this._startTurn(args.input ?? toUserInput(args.prompt), { model: args.model, effort: args.effort })
  }

  /**
   * Send a follow-up message on the existing thread.
   * Replaces StreamBridge.sendFollowUp().
   */
  async sendFollowUp(
    prompt: string,
    input?: CodexUserInput[],
    turnOptions: { model?: string; effort?: string } = {},
  ): Promise<void> {
    if (!this.currentThreadId) {
      throw new Error('No active thread to send follow-up to')
    }
    await this._startTurn(input ?? toUserInput(prompt), turnOptions)
  }

  /**
   * Compact the current thread. Codex has a dedicated protocol call; sending
   * "/compact" as a prompt would just ask the model about a slash command.
   */
  async compactThread(): Promise<void> {
    if (!this.currentThreadId) throw new Error('No active thread to compact')
    await this._sendRequest('thread/compact/start', { threadId: this.currentThreadId })
  }

  /**
   * Compact a thread on a bridge that may not have spawned yet. Used when the
   * renderer asks for compaction after the app lost its active bridge id.
   */
  async compactSession(args: CodexSendMessageArgs): Promise<void> {
    if (!this.proc) {
      const codexPath = getCodexPath()
      const env = sanitizeCodexEnv({ ...args.env })
      this.currentCwd = args.cwd
      this.proc = spawn(codexPath, ['app-server', '--stdio'], {
        cwd: args.cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      this._attachOutputHandlers()
      await this._initialize({ cwd: args.cwd })
    }
    if (!this.currentThreadId) {
      if (!args.threadId) throw new Error('No thread to compact')
      await this._resumeThread(args.threadId, args)
    }
    await this.compactThread()
  }

  /**
   * Steer an in-progress turn with additional guidance.
   * Codex-specific feature — no Claude CLI equivalent.
   */
  async steerTurn(prompt: string): Promise<void> {
    if (!this.currentThreadId || !this.currentTurnId) {
      throw new Error('No active turn to steer')
    }
    await this._sendRequest('turn/steer', {
      threadId: this.currentThreadId,
      turnId: this.currentTurnId,
      input: toUserInput(prompt),
    })
  }

  /**
   * Interrupt the current turn.
   * Replaces StreamBridge.abort() for graceful cancellation.
   */
  async interruptTurn(): Promise<void> {
    if (!this.currentThreadId || !this.currentTurnId) {
      // No active turn — kill the process instead
      this.abort()
      return
    }
    // Reject anything waiting on the user *before* asking the server to stop:
    // an answer request the server is blocked on can otherwise outlive the
    // interrupt and leave the turn (and its IPC timers) hanging.
    this._rejectAllServerRequests('Turn interrupted by the user')
    try {
      await this._sendRequest('turn/interrupt', {
        threadId: this.currentThreadId,
        turnId: this.currentTurnId,
      }, 15_000)
    } catch (err) {
      log.debug('turn/interrupt error (may already be done):', String(err))
    }
  }

  /**
   * Respond to an item/approval/request from the server.
   * Replaces StreamBridge.respondPermission().
   */
  respondApproval(requestId: string | number, approved: boolean): void {
    if (!this.proc?.stdin) return
    const key = String(requestId)
    const pending = this.pendingServerRequests.get(key)
    // An untracked id is a stale answer: the request was already answered, the
    // server sent `serverRequest/resolved`, or the turn ended. Writing the
    // legacy "approved" shape for it would fabricate a decision nobody asked
    // for — the same failure this wave removed from the unknown-request path.
    if (!pending) {
      log.debug(`Ignoring approval response for untracked request ${key}`)
      return
    }
    // A stale answer for a different request kind must not become an approval.
    if (pending.kind === 'userInput' || pending.kind === 'elicitation') {
      log.debug(`Ignoring approval response for a ${pending.kind} request ${key}`)
      return
    }
    const kind = this.pendingApprovalKinds.get(key)
    let result: Record<string, unknown>
    if (kind === 'command' || kind === 'fileChange') {
      // v2 approvals use accept/decline; "approved"/"denied" are only valid on
      // the legacy execCommandApproval/applyPatchApproval methods.
      result = { decision: approved ? 'accept' : 'decline' }
    } else if (kind === 'permissions') {
      result = { permissions: approved ? (this.pendingPermissionProfiles.get(key) ?? {}) : {}, scope: 'turn' }
    } else {
      // Legacy ReviewDecision has no "denied" string: a denial is an object
      // carrying the rejection text.
      result = {
        decision: approved ? 'approved' : { denied: { rejection: 'Denied by user' } },
      }
    }
    // RequestId may be a string; use the id the server actually sent.
    const wireId = pending.id
    this._clearServerRequest(key)
    this._writeServerResult(wireId, result)
  }

  /**
   * Respond to a user-facing question. Both `item/tool/requestUserInput` and
   * `mcpServer/elicitation/request` surface through the same `cli:elicitation`
   * event, so the renderer's existing elicitation card can answer either.
   *
   * `result` is the renderer shape `{ action: 'accept'|'decline'|'cancel', content? }`.
   * MCP elicitations accept it verbatim (Codex's response schema uses the same
   * action/content fields). requestUserInput needs the questions mapped back to
   * `{ answers: { <questionId>: { answers: string[] } } }`.
   *
   * The renderer builds `content` from `payload.codexQuestions` (one answer per
   * question id: the chosen option label, the typed "Other" text, or the plain
   * text answer) and falls back to `payload.requestedSchema` when
   * `codexQuestions` is absent. Either way the key is the question id.
   */
  respondElicitation(requestId: string | number, result: Record<string, unknown>): void {
    const key = String(requestId)
    const pending = this.pendingServerRequests.get(key)
    if (!pending || (pending.kind !== 'userInput' && pending.kind !== 'elicitation')) {
      log.debug(`Ignoring elicitation response for unknown request ${key}`)
      return
    }

    let payload: Record<string, unknown>
    if (pending.kind === 'elicitation') {
      const requested = typeof result.action === 'string' ? result.action : 'accept'
      const action = requested === 'decline' || requested === 'cancel' ? requested : 'accept'
      const content = asRecord(result.content)
      // McpServerElicitationRequestResponse: required `action`, optional
      // structured `content` only on accept.
      payload = { action, ...(action === 'accept' && content ? { content } : {}) }
    } else {
      const accepted = result.action === undefined || result.action === 'accept'
      const content = accepted ? asRecord(result.content) ?? {} : {}
      const answers: Record<string, { answers: string[] }> = {}
      for (const questionId of pending.questionIds ?? Object.keys(content)) {
        const raw = content[questionId]
        const values = Array.isArray(raw)
          ? raw.filter((value): value is string => typeof value === 'string')
          : typeof raw === 'string' && raw.trim()
            ? [raw]
            : []
        answers[questionId] = { answers: values }
      }
      // ToolRequestUserInputResponse requires `answers`; an empty map is the
      // valid "user declined / no input" form.
      payload = { answers }
    }

    this._clearServerRequest(key)
    this._writeServerResult(pending.id, payload)
  }

  /**
   * `model/list` — the models this Codex installation exposes. Cached per
   * bridge; `force` bypasses the cache. Paginated responses are followed until
   * `nextCursor` is null (with a hard page cap so a buggy server cannot loop).
   */
  async listModels(options: { force?: boolean } = {}): Promise<CodexModelInfo[]> {
    this._requireProcess('model/list')
    if (!options.force && this.modelListCache
      && Date.now() - this.modelListCache.fetchedAt < MODEL_LIST_CACHE_TTL_MS) {
      return this.modelListCache.models
    }

    const models: CodexModelInfo[] = []
    const seen = new Set<string>()
    let cursor: string | null = null
    for (let page = 0; page < 10; page++) {
      const result = await this._sendRequest('model/list', cursor ? { cursor } : {}, MODEL_LIST_TIMEOUT_MS) as {
        data?: unknown[]
        nextCursor?: string | null
      }
      for (const raw of Array.isArray(result?.data) ? result.data : []) {
        const model = normalizeModel(raw)
        if (!model || seen.has(model.id)) continue
        seen.add(model.id)
        models.push(model)
      }
      cursor = typeof result?.nextCursor === 'string' && result.nextCursor ? result.nextCursor : null
      if (!cursor) break
    }

    this.modelListCache = { models, fetchedAt: Date.now() }
    return models
  }

  /** `account/usage/read` — real token usage, cached for a minute. */
  async readAccountUsage(options: { force?: boolean } = {}): Promise<CodexAccountUsage> {
    this._requireProcess('account/usage/read')
    if (!options.force && this.usageCache
      && Date.now() - this.usageCache.fetchedAt < USAGE_CACHE_TTL_MS) {
      return this.usageCache.usage
    }
    const result = await this._sendRequest('account/usage/read', {}, PROBE_TIMEOUT_MS)
    const usage = normalizeUsage(result)
    this.usageCache = { usage, fetchedAt: Date.now() }
    return usage
  }

  /** `account/rateLimits/read` — real plan limits, cached briefly. */
  async readRateLimits(options: { force?: boolean } = {}): Promise<CodexRateLimits> {
    this._requireProcess('account/rateLimits/read')
    if (!options.force && this.rateLimitsCache
      && Date.now() - this.rateLimitsCache.fetchedAt < RATE_LIMITS_CACHE_TTL_MS) {
      return this.rateLimitsCache.rateLimits
    }
    const result = await this._sendRequest('account/rateLimits/read', {}, PROBE_TIMEOUT_MS)
    const rateLimits = normalizeRateLimits(result)
    this.rateLimitsCache = { rateLimits, fetchedAt: Date.now() }
    return rateLimits
  }

  /**
   * `skills/list` — the skills Codex will actually load for `cwd`. The renderer
   * has only ever received names via `systemInit.skills`, so that field keeps
   * its `string[]` shape while the IPC probe exposes the full metadata.
   *
   * `force` re-scans disk; the default uses Codex's own cache.
   */
  async listSkills(options: { cwd?: string; force?: boolean; timeoutMs?: number } = {}): Promise<CodexSkillInfo[]> {
    this._requireProcess('skills/list')
    const cwd = options.cwd ?? this.currentCwd ?? process.cwd()
    if (!options.force && this.skillsCache
      && this.skillsCache.cwd === cwd
      && Date.now() - this.skillsCache.fetchedAt < SKILLS_CACHE_TTL_MS) {
      return this.skillsCache.skills
    }
    const result = await this._sendRequest(
      'skills/list',
      { cwds: [cwd], ...(options.force ? { forceReload: true } : {}) },
      options.timeoutMs ?? PROBE_TIMEOUT_MS,
    )
    const skills = normalizeSkills(result)
    this.skillsCache = { cwd, skills, fetchedAt: Date.now() }
    return skills
  }

  /**
   * Unsubscribe from the thread and clean up.
   * Replaces StreamBridge.endSession().
   */
  async endSession(): Promise<void> {
    if (this.currentThreadId && this.proc?.stdin) {
      try {
        await this._sendRequest('thread/unsubscribe', {
          threadId: this.currentThreadId,
        })
      } catch { /* best effort */ }
    }
    this._cleanup()
  }

  /**
   * Forcefully kill the codex process.
   */
  abort(): void {
    this._cleanup()
    if (this.proc) {
      try { this.proc.kill('SIGTERM') } catch (err) {
        log.debug('Kill failed (process may have already exited):', String(err))
      }
      this.proc = null
    }
  }

  /**
   * Fork the current thread into a new conversation branch.
   * Codex-specific feature.
   */
  async forkThread(lastTurnId?: string): Promise<string | null> {
    if (!this.currentThreadId) return null
    const result = await this._sendRequest('thread/fork', {
      threadId: this.currentThreadId,
      ...(lastTurnId ? { lastTurnId } : {}),
    }) as { thread?: { id: string } }
    return result?.thread?.id ?? null
  }

  /**
   * Rename a thread through the protocol so the name lands in Codex's own
   * index (`session_index.jsonl` + state DB) and survives restarts. The
   * archive title is derived from the first prompt otherwise.
   */
  async renameThreadById(threadId: string, name: string): Promise<void> {
    if (!THREAD_ID_RE.test(threadId)) {
      throw new Error(`Invalid Codex thread id: ${threadId}`)
    }
    const trimmed = name.trim()
    // Codex rejects an empty name ("thread name must not be empty"); fail here
    // with a clearer message instead of a JSON-RPC error at the call site.
    if (!trimmed) throw new Error('Thread name must not be empty')
    await this._sendRequest('thread/name/set', { threadId, name: trimmed })
  }

  async renameThread(name: string): Promise<void> {
    if (!this.currentThreadId) throw new Error('No active thread to rename')
    await this.renameThreadById(this.currentThreadId, name)
  }

  /**
   * Rename without an existing app-server. `thread/name/set` works on a
   * not-loaded thread, so this only needs the initialize handshake — no resume,
   * and no model credentials.
   */
  async renameDetached(threadId: string, name: string): Promise<void> {
    const codexPath = getCodexPath()
    this.proc = spawn(codexPath, ['app-server', '--stdio'], {
      cwd: process.cwd(),
      env: sanitizeCodexEnv({}),
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this._attachOutputHandlers()
    try {
      await this._initialize({ silent: true })
      await this.renameThreadById(threadId, name)
    } finally {
      this.abort()
    }
  }

  /**
   * Get the current thread ID (for session persistence).
   */
  getThreadId(): string | null {
    return this.currentThreadId
  }

  /**
   * Run a read-only probe on a throwaway app-server that has completed
   * `initialize` but owns no thread or turn. Used when no live bridge exists
   * (e.g. Settings opened before the first message). The process is always
   * reaped, including when the probe throws.
   */
  static async withDetached<T>(
    cwd: string,
    env: Record<string, string>,
    fn: (bridge: CodexBridge) => Promise<T>,
  ): Promise<T> {
    const bridge = new CodexBridge(`probe-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
    bridge.currentCwd = cwd
    bridge.proc = spawn(getCodexPath(), ['app-server', '--stdio'], {
      cwd,
      env: sanitizeCodexEnv({ ...env }),
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    bridge._attachOutputHandlers()
    try {
      await bridge._initialize({ silent: true, cwd })
      return await fn(bridge)
    } finally {
      bridge.abort()
    }
  }

  // ── Private: Protocol handshake ─────────────────

  /**
   * `silent` skips the synthetic `systemInit` event (and the MCP/skills probes
   * behind it) for short-lived processes — a detached rename has no renderer
   * listening.
   */
  private async _initialize(opts: { silent?: boolean; cwd?: string } = {}): Promise<void> {
    const result = await this._sendRequest('initialize', {
      clientInfo: {
        name: 'aipa_desktop',
        title: 'AIPA Desktop Assistant',
        version: '1.0.0',
      },
      capabilities: {
        experimentalApi: true,
      },
    }, INITIALIZE_TIMEOUT_MS)

    this.initialized = true
    if (opts.cwd) this.currentCwd = opts.cwd

    // Send initialized notification (no response expected)
    this._sendNotification('initialized', {})

    if (opts.silent) {
      log.info('Codex app-server initialized (silent)')
      return
    }

    // Emit a synthetic systemInit event for compatibility. MCP discovery and
    // skills/list are independent reads, so run them together; both are
    // best-effort and bounded so they can never hold the handshake open.
    const cwd = opts.cwd ?? this.currentCwd ?? process.cwd()
    const [mcpServers, skills] = await Promise.all([
      this._collectMcpServers(),
      this._collectSkillNames(cwd),
    ])
    const initResult = result as Record<string, unknown> ?? {}
    this.emit('systemInit', {
      sessionId: this.bridgeSessionId,
      tools: [],
      mcpServers,
      model: (initResult.model as string) ?? '',
      permissionMode: 'default',
      cwd,
      skills,
      plugins: [],
      codexHome: (initResult.codexHome as string) ?? '',
      platformFamily: (initResult.platformFamily as string) ?? '',
    })

    log.info('Codex app-server initialized successfully')
  }

  /**
   * Names of the skills Codex actually exposes for `cwd`.
   *
   * `systemInit.skills` is the Claude CLI's `string[]` shape, which the
   * renderer already consumes. Codex's own `skills/list` returns metadata, so
   * the names are extracted here; `listSkills()` is the full-metadata probe.
   * A Codex that is slow or has no skills must not block initialization.
   */
  private async _collectSkillNames(cwd: string): Promise<string[]> {
    try {
      const skills = await this.listSkills({ cwd, timeoutMs: SKILLS_INIT_TIMEOUT_MS })
      return [...new Set(skills.filter(skill => skill.enabled).map(skill => skill.name))]
    } catch (err) {
      log.debug('skills/list failed during initialize:', String(err))
      return []
    }
  }

  /**
   * MCP servers Codex will load this session, read from ~/.codex/config.toml.
   *
   * The renderer's chat header and MCP panels are built around the Claude CLI's
   * system.init payload, so we synthesise the same shape. `status` describes the
   * configuration (enabled / disabled), not the live connection — Codex reports
   * startup separately through `mcpServer/startupStatus/updated`, which we don't
   * mirror yet. Tool lists come from `mcpServerStatus/list`, best-effort: servers
   * may still be starting when we ask, so an empty list means "not discovered".
   */
  private async _collectMcpServers(): Promise<Array<{ name: string; status: string; tools?: string[] }>> {
    const configured = readCodexMcpServers()
    if (configured.length === 0) return []

    const toolsByServer = await this._readMcpToolNames()

    return configured.map(srv => {
      const tools = toolsByServer[srv.name] ?? []
      return {
        name: srv.name,
        status: srv.enabled ? 'connected' : 'disabled',
        ...(tools.length > 0 ? { tools } : {}),
      }
    })
  }

  /** `mcpServerStatus/list` → { serverName: ['mcp__server__tool', …] }. */
  private async _readMcpToolNames(): Promise<Record<string, string[]>> {
    let timer: NodeJS.Timeout | undefined
    try {
      const result = await Promise.race([
        this._sendRequest('mcpServerStatus/list', {}),
        new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), MCP_STATUS_TIMEOUT_MS) }),
      ]) as { data?: Array<{ name?: string; tools?: Record<string, unknown> }> } | null

      const map: Record<string, string[]> = {}
      for (const entry of result?.data ?? []) {
        if (!entry?.name || !entry.tools) continue
        // Mirror the CLI's model-facing tool naming so the renderer's
        // `mcp__<server>__<tool>` prefix stripping keeps working.
        const names = Object.keys(entry.tools).map(tool => `mcp__${entry.name}__${tool}`)
        if (names.length > 0) map[entry.name] = names
      }
      return map
    } catch {
      return {}
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  private async _startThread(args: CodexSendMessageArgs): Promise<void> {
    const params: Record<string, unknown> = {
      cwd: args.cwd,
    }
    if (args.model) params.model = args.model
    if (args.approvalPolicy) params.approvalPolicy = normalizeApprovalPolicy(args.approvalPolicy)
    if (args.sandbox) params.sandbox = normalizeSandbox(args.sandbox)
    if (args.permissions) params.permissions = args.permissions
    if (args.personality) params.personality = args.personality
    if (args.ephemeral) params.ephemeral = true
    if (args.developerInstructions) params.developerInstructions = args.developerInstructions

    const result = await this._sendRequest('thread/start', params) as { thread?: { id: string } }
    this.currentThreadId = result?.thread?.id ?? null
    log.info(`Thread started: ${this.currentThreadId}`)
  }

  private async _resumeThread(threadId: string, args: CodexSendMessageArgs): Promise<void> {
    const params: Record<string, unknown> = {
      threadId,
    }
    if (args.model) params.model = args.model
    if (args.approvalPolicy) params.approvalPolicy = normalizeApprovalPolicy(args.approvalPolicy)
    // Resuming without the sandbox would silently inherit whatever the user's
    // ~/.codex/config.toml says (possibly danger-full-access), so carry it over.
    if (args.sandbox) params.sandbox = normalizeSandbox(args.sandbox)
    // developerInstructions are persisted in the rollout, so a resume normally
    // inherits them; passing them again lets a caller (plugin, automation) put
    // its own instructions on someone else's thread. 0.145 accepts the field.
    if (args.developerInstructions) params.developerInstructions = args.developerInstructions
    if (args.personality) params.personality = args.personality

    const result = await this._sendRequest('thread/resume', params) as { thread?: { id: string } }
    this.currentThreadId = result?.thread?.id ?? threadId
    log.info(`Thread resumed: ${this.currentThreadId}`)
  }

  /**
   * Read the account's limits once, right after a thread is started or
   * resumed, so the composer chip has a full baseline before the first sparse
   * `account/rateLimits/updated` notification. The raw snapshot is forwarded
   * untouched; the renderer owns the merge rule. Failures are invisible to the
   * user and logged at debug only — this read must never fail a turn.
   */
  private _primeRateLimits(): void {
    if (this.rateLimitsPrimed || !this.proc?.stdin) return
    this.rateLimitsPrimed = true
    this._sendRequest('account/rateLimits/read', {}, RATE_LIMITS_PRIME_TIMEOUT_MS)
      .then((result) => {
        const response = asRecord(result)
        if (!response || !asRecord(response.rateLimits)) return
        this.emit('rateLimitsUpdated', {
          sessionId: this.bridgeSessionId,
          source: 'read',
          rateLimits: response.rateLimits,
          rateLimitsByLimitId: asRecord(response.rateLimitsByLimitId),
        })
      })
      .catch((err) => {
        log.debug('account/rateLimits/read (prime) failed:', String(err))
      })
  }

  private async _startTurn(
    input: CodexUserInput[],
    turnOptions: { model?: string; effort?: string } = {},
  ): Promise<void> {
    if (!this.currentThreadId) {
      throw new Error('No active thread')
    }

    const params: Record<string, unknown> = {
      threadId: this.currentThreadId,
      input,
    }
    // `turn/start.model` overrides "this turn and subsequent turns", so passing
    // it on every turn is what makes a model switch take effect mid-thread. A
    // bad id is left to fail visibly: the server is the authority.
    if (turnOptions.model) params.model = turnOptions.model
    const effort = await this._resolveTurnEffort(turnOptions.model, turnOptions.effort)
    if (effort) params.effort = effort

    const result = await this._sendRequest('turn/start', params) as { turn?: { id: string } }

    this.currentTurnId = result?.turn?.id ?? null
    log.info(`Turn started: ${this.currentTurnId}`)
  }

  /**
   * Drop an effort the running model does not advertise.
   *
   * `turn/start` validates `effort` against that model's own
   * `supportedReasoningEfforts`, and an unadvertised value fails the whole
   * turn. There is no global effort enum, so `model/list` is the only honest
   * source. Anything that cannot be verified is dropped rather than guessed:
   * the turn then runs at the engine's default effort instead of failing.
   */
  private async _resolveTurnEffort(model: string | undefined, effort: string | undefined): Promise<string | undefined> {
    if (!effort) return undefined
    let models: CodexModelInfo[]
    try {
      // Never let a catalogue probe delay the user's turn: on a cold bridge
      // `model/list` can take seconds (its own timeout is 15 s). Give it a short
      // window, then send the turn at the engine default instead of stalling.
      // The outstanding request still resolves into the cache for later turns.
      models = await raceWithDeadline(this.listModels({ force: false }), EFFORT_LOOKUP_TIMEOUT_MS)
    } catch (err) {
      this._logDroppedEffort(effort, model, `model/list unavailable: ${String(err)}`)
      return undefined
    }
    // Without an explicit override the thread's model (or Codex's default) runs;
    // `model/list` marks which one that is.
    const target = model
      ? models.find(m => m.model === model || m.id === model)
      : models.find(m => m.isDefault)
    const advertised = target?.supportedReasoningEfforts.some(o => o.reasoningEffort === effort) ?? false
    if (!advertised) {
      this._logDroppedEffort(effort, model ?? target?.model, 'not advertised for this model')
      return undefined
    }
    return effort
  }

  /** Once per (effort, model) pair: a rejected preference must not spam every turn. */
  private _logDroppedEffort(effort: string, model: string | undefined, reason: string): void {
    const key = `${effort}\u0000${model ?? ''}`
    if (this.loggedDroppedEfforts.has(key)) return
    this.loggedDroppedEfforts.add(key)
    log.info(`Dropping effort "${effort}" for model "${model ?? 'default'}": ${reason}`)
  }

  // ── Private: JSON-RPC transport ─────────────────

  private _requireProcess(method: string): void {
    if (!this.proc?.stdin) throw new Error(`No active codex process for ${method}`)
  }

  /** Write a JSON-RPC success response to a server-initiated request. */
  private _writeServerResult(id: string | number, result: Record<string, unknown>): void {
    this._writeServerLine({ id, result }, `result id=${id}`)
  }

  /**
   * Write a JSON-RPC error response. Unknown or expired server requests use
   * this instead of a fabricated approval: a visible turn failure is the only
   * safe answer when AIPA cannot actually grant what was asked.
   */
  private _writeServerError(id: string | number, code: number, message: string, data?: unknown): void {
    this._writeServerLine(
      { id, error: { code, message, ...(data === undefined ? {} : { data }) } },
      `error id=${id}: ${message}`,
    )
  }

  private _writeServerLine(payload: Record<string, unknown>, description: string): void {
    const stdin = this.proc?.stdin
    if (!stdin) {
      log.debug(`Cannot write server response (${description}): no stdin`)
      return
    }
    try {
      stdin.write(JSON.stringify(payload) + '\n')
      log.debug(`→ ${description}`)
    } catch (err) {
      log.debug(`Failed to write server response (${description}):`, String(err))
    }
  }

  private _sendRequest(method: string, params: Record<string, unknown>, timeoutMs = REQUEST_TIMEOUT_MS): Promise<unknown> {
    if (!this.proc?.stdin) {
      return Promise.reject(new Error('No active codex process'))
    }

    const id = this.nextId++
    const msg: JsonRpcRequest = { id, method, params }
    const json = JSON.stringify(msg) + '\n'

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`Request timeout: ${method} (id=${id})`))
      }, timeoutMs)

      this.pendingRequests.set(id, { resolve, reject, method, timer })

      try {
        this.proc!.stdin!.write(json)
        log.debug(`→ [${id}] ${method}`)
      } catch (err) {
        clearTimeout(timer)
        this.pendingRequests.delete(id)
        reject(err)
      }
    })
  }

  private _sendNotification(method: string, params: Record<string, unknown>): void {
    if (!this.proc?.stdin) return
    const msg: Omit<JsonRpcNotification, 'jsonrpc'> = { method, params }
    const json = JSON.stringify(msg) + '\n'
    try {
      this.proc.stdin.write(json)
      log.debug(`→ notification: ${method}`)
    } catch (err) {
      log.debug('Failed to send notification:', String(err))
    }
  }

  // ── Private: Output handling ────────────────────

  private _attachOutputHandlers(): void {
    const rl = createInterface({ input: this.proc!.stdout! })

    rl.on('line', (line) => {
      const trimmed = line.trim()
      if (!trimmed) return

      try {
        const msg = JSON.parse(trimmed)
        this._handleMessage(msg)
      } catch {
        log.debug('Non-JSON stdout line:', trimmed.slice(0, 200))
        this.emit('rawOutput', trimmed)
      }
    })

    this.proc!.stderr!.on('data', (data: Buffer) => {
      const text = data.toString()
      log.debug('stderr:', text.slice(0, 200))
      this.emit('stderr', text)
    })

    this.proc!.on('close', (code) => {
      log.info(`Codex process exited with code ${code}`)
      this.emit('processExit', { sessionId: this.bridgeSessionId, code })
      // Reject all pending requests
      for (const [id, pending] of this.pendingRequests) {
        clearTimeout(pending.timer)
        pending.reject(new Error(`Process exited with code ${code}`))
        this.pendingRequests.delete(id)
      }
      // No process remains to receive answers; drop their timers.
      this._clearAllServerRequests()
      this.proc = null
    })
  }

  private _handleMessage(msg: Record<string, unknown>): void {
    // JSON-RPC Response (has id, no method)
    if (msg.id !== undefined && msg.id !== null && !msg.method) {
      this._handleResponse(msg as unknown as JsonRpcResponse)
      return
    }

    // JSON-RPC Notification or Server Request (has method)
    if (msg.method) {
      // Check if it's a server→client request (has id → needs response)
      if (msg.id !== undefined && msg.id !== null) {
        this._handleServerRequest(msg)
      } else {
        this._handleNotification(msg as unknown as JsonRpcNotification)
      }
    }
  }

  private _handleResponse(response: JsonRpcResponse): void {
    const pending = this.pendingRequests.get(response.id)
    if (!pending) {
      log.debug(`Unexpected response id=${response.id}`)
      return
    }

    clearTimeout(pending.timer)
    this.pendingRequests.delete(response.id)

    if (response.error) {
      log.warn(`← [${response.id}] ${pending.method} error:`, response.error.message)
      pending.reject(new Error(`${pending.method}: ${response.error.message}`))
    } else {
      log.debug(`← [${response.id}] ${pending.method} OK`)
      pending.resolve(response.result)
    }
  }

  private _handleServerRequest(msg: Record<string, unknown>): void {
    const method = msg.method as string
    const params = asRecord(msg.params) ?? {}
    const requestId = String(msg.id)
    // RequestId is `string | integer`; keep the wire type so a string id is not
    // sent back as a numeric one (and vice versa).
    const wireId: string | number = typeof msg.id === 'number' || typeof msg.id === 'string'
      ? msg.id
      : requestId

    log.debug(`← server request [${requestId}]: ${method}`)

    // A server can reuse an id after resolving it; drop any stale timer first.
    this._clearServerRequest(requestId)

    const request = (
      toolName: string,
      toolInput: Record<string, unknown>,
      title?: string,
      description?: string,
    ) => this.emit('permissionRequest', {
      sessionId: this.bridgeSessionId,
      requestId,
      toolName,
      toolInput,
      title,
      description,
    })

    switch (method) {
      // v2 approval surface. Responding with the legacy "approved" enum makes
      // serde reject the response, so the kind is remembered for respondApproval.
      case 'item/commandExecution/requestApproval':
        this.pendingApprovalKinds.set(requestId, 'command')
        this._trackServerRequest(wireId, method, 'approval')
        request(
          'Bash',
          {
            command: params.command ?? '',
            cwd: params.cwd ?? '',
            reason: params.reason ?? '',
          },
          'Command approval',
          (params.reason as string) || undefined,
        )
        break

      case 'item/fileChange/requestApproval':
        this.pendingApprovalKinds.set(requestId, 'fileChange')
        this._trackServerRequest(wireId, method, 'approval')
        request(
          'Edit',
          { itemId: params.itemId ?? '', grantRoot: params.grantRoot ?? '', reason: params.reason ?? '' },
          'File change approval',
          (params.reason as string) || undefined,
        )
        break

      case 'item/permissions/requestApproval':
        this.pendingApprovalKinds.set(requestId, 'permissions')
        this.pendingPermissionProfiles.set(requestId, params.permissions ?? {})
        this._trackServerRequest(wireId, method, 'permissions')
        request(
          'Permissions',
          {
            cwd: params.cwd ?? '',
            permissions: params.permissions ?? {},
            reason: params.reason ?? '',
          },
          'Permission approval',
          (params.reason as string) || undefined,
        )
        break

      // Legacy approval methods (still emitted by some Codex builds).
      case 'execCommandApproval':
      case 'applyPatchApproval':
        this.pendingApprovalKinds.set(requestId, 'legacy')
        this._trackServerRequest(wireId, method, 'legacy')
        request(
          method === 'applyPatchApproval' ? 'Edit' : 'Bash',
          { ...params },
          method === 'applyPatchApproval' ? 'File change approval' : 'Command approval',
        )
        break

      // Older protocol revision used by the first AIPA integration.
      case 'item/approval/request':
        this.pendingApprovalKinds.set(requestId, 'legacy')
        this._trackServerRequest(wireId, method, 'legacy')
        request(
          (params.toolName ?? params.tool_name ?? 'unknown') as string,
          (params.input ?? params.toolInput ?? {}) as Record<string, unknown>,
          (params.title as string) || undefined,
          (params.description as string) || undefined,
        )
        break

      // ── User-facing questions ────────────────────
      // Both are answer requests, never approvals. They surface through the
      // same `cli:elicitation` event the Claude path already renders; the
      // answer is sent back only when respondElicitation() is called.
      case 'item/tool/requestUserInput': {
        const payload = this._userInputElicitationPayload(requestId, params)
        const questionIds = Array.isArray(params.questions)
          ? (params.questions as unknown[])
              .map(question => stringOr(asRecord(question)?.id))
              .filter(Boolean)
          : []
        // The server may cap how long it will wait; never exceed our own bound.
        const auto = numberOrNull(params.autoResolutionMs)
        const timeoutMs = auto !== null && auto > 0
          ? Math.min(SERVER_REQUEST_TIMEOUT_MS, auto)
          : SERVER_REQUEST_TIMEOUT_MS
        this._trackServerRequest(wireId, method, 'userInput', { timeoutMs, questionIds })
        this.emit('elicitationRequest', payload)
        // Background/internal turns have no listener: decline immediately
        // instead of holding the turn until the timeout.
        if (this.listenerCount('elicitationRequest') === 0) {
          this.respondElicitation(requestId, { action: 'decline' })
        }
        break
      }

      case 'mcpServer/elicitation/request': {
        const mode = params.mode === 'url' ? 'url' : 'form'
        const payload = {
          sessionId: this.bridgeSessionId,
          requestId,
          serverName: stringOr(params.serverName, 'MCP'),
          message: stringOr(params.message),
          mode,
          ...(mode === 'url' ? { url: stringOr(params.url) || undefined } : {}),
          ...(mode === 'form' ? { requestedSchema: asRecord(params.requestedSchema) ?? undefined } : {}),
        }
        this._trackServerRequest(wireId, method, 'elicitation')
        this.emit('elicitationRequest', payload)
        if (this.listenerCount('elicitationRequest') === 0) {
          this.respondElicitation(requestId, { action: 'decline' })
        }
        break
      }

      // AIPA registers no dynamic tools and cannot refresh ChatGPT tokens or
      // mint attestations. These are recognisable protocol methods, but there
      // is no honest success answer, so they fail the turn visibly.
      case 'item/tool/call':
      case 'account/chatgptAuthTokens/refresh':
      case 'attestation/generate':
        this._rejectUnsupportedServerRequest(wireId, method)
        break

      default:
        this._rejectUnsupportedServerRequest(wireId, method)
    }
  }

  /**
   * Answer an unknown server request with a JSON-RPC error. Approving it would
   * hand the model a permission the user never granted, and doing so silently
   * was the old behaviour.
   */
  private _rejectUnsupportedServerRequest(id: string | number, method: string): void {
    if (!this.loggedUnknownServerRequests.has(method)) {
      log.warn(`Unsupported server request rejected: ${method}`)
      this.loggedUnknownServerRequests.add(method)
    }
    this._writeServerError(id, -32601, `AIPA does not support server request: ${method}`, { method })
  }

  /** Track a server request so it times out (and is rejected on interrupt). */
  private _trackServerRequest(
    id: string | number,
    method: string,
    kind: ServerRequestKind,
    opts: { timeoutMs?: number; questionIds?: string[] } = {},
  ): void {
    const key = String(id)
    const timeoutMs = Math.max(1, opts.timeoutMs ?? SERVER_REQUEST_TIMEOUT_MS)
    const timer = setTimeout(() => {
      const pending = this.pendingServerRequests.get(key)
      if (!pending) return
      log.warn(`Server request timed out after ${timeoutMs}ms: ${method} (id=${key})`)
      this._clearServerRequest(key)
      // Reject, never approve. For approvals this fails the turn; for questions
      // it is the only response schema-compatible way to say "nobody answered".
      this._writeServerError(id, -32001, `Request timed out waiting for the user: ${method}`, { method })
      this.emit('serverRequestTimedOut', {
        sessionId: this.bridgeSessionId,
        requestId: key,
        kind,
        method,
      })
    }, timeoutMs)
    // A pending question must not keep a desktop process alive after teardown.
    timer.unref?.()

    this.pendingServerRequests.set(key, {
      id,
      method,
      kind,
      timer,
      ...(opts.questionIds ? { questionIds: opts.questionIds } : {}),
    })
  }

  /** Stop tracking one request, clearing its timer and approval bookkeeping. */
  private _clearServerRequest(key: string): void {
    const pending = this.pendingServerRequests.get(key)
    if (pending) {
      clearTimeout(pending.timer)
      this.pendingServerRequests.delete(key)
    }
    this.pendingApprovalKinds.delete(key)
    this.pendingPermissionProfiles.delete(key)
  }

  /**
   * Reject every pending server request. Called when the user interrupts or
   * the bridge tears down, so neither the codex process nor an IPC timer can
   * wait forever for an answer that will never arrive.
   */
  private _rejectAllServerRequests(reason: string): void {
    for (const [key, pending] of this.pendingServerRequests) {
      clearTimeout(pending.timer)
      this._writeServerError(pending.id, -32001, reason, { method: pending.method })
      this.pendingApprovalKinds.delete(key)
      this.pendingPermissionProfiles.delete(key)
    }
    this.pendingServerRequests.clear()
  }

  /** Forget pending request timers without answering (the turn/process is gone). */
  private _clearAllServerRequests(): void {
    for (const pending of this.pendingServerRequests.values()) clearTimeout(pending.timer)
    this.pendingServerRequests.clear()
    this.pendingApprovalKinds.clear()
    this.pendingPermissionProfiles.clear()
  }

  /**
   * Map `item/tool/requestUserInput` questions onto the renderer's elicitation
   * card shape. `codexQuestions` carries the structured questions (bounded by
   * `boundCodexQuestions`) so the card can render real choice controls;
   * `requestedSchema`/`message` remain the schema-driven text form used by the
   * plain-text fallback. The question id is the key in both shapes, so the
   * answer maps back in respondElicitation().
   */
  private _userInputElicitationPayload(
    requestId: string,
    params: Record<string, unknown>,
  ): Record<string, unknown> {
    const questions = Array.isArray(params.questions)
      ? (params.questions as unknown[]).map(asRecord).filter((q): q is Record<string, unknown> => q !== null)
      : []
    const properties: Record<string, unknown> = {}
    const required: string[] = []
    const promptLines: string[] = []
    for (const question of questions) {
      const id = stringOr(question.id)
      if (!id) continue
      const header = stringOr(question.header, id)
      const text = stringOr(question.question)
      const options = Array.isArray(question.options)
        ? (question.options as unknown[]).map(option => {
            const o = asRecord(option)
            const label = stringOr(o?.label)
            const description = stringOr(o?.description)
            return label ? (description ? `${label} — ${description}` : label) : ''
          }).filter(Boolean)
        : []
      properties[id] = {
        type: 'string',
        title: header,
        description: [text, options.length > 0 ? `Options: ${options.join('; ')}` : '']
          .filter(Boolean)
          .join('\n'),
        ...(question.isSecret === true ? { format: 'password' } : {}),
      }
      required.push(id)
      promptLines.push(text || header)
    }
    return {
      sessionId: this.bridgeSessionId,
      requestId,
      // The elicitation card shows this above the message; "Codex" keeps it
      // honest that the question comes from the agent, not an MCP server.
      serverName: 'Codex',
      message: promptLines.filter(Boolean).join('\n\n') || 'Codex needs your input to continue.',
      mode: 'form',
      requestedSchema: { type: 'object', properties, required },
      codexQuestions: boundCodexQuestions(params.questions),
    }
  }

  /**
   * Forward one tool-output chunk, throttled per item and hard-capped. Dropped
   * intermediate chunks are harmless: the completed item carries the aggregate.
   */
  private _emitToolProgress(itemId: string, delta: string): void {
    if (!itemId || !delta) return
    const now = Date.now()
    const last = this.toolProgressLastAt.get(itemId) ?? 0
    if (now - last < TOOL_PROGRESS_MIN_INTERVAL_MS) return
    // Bound the bookkeeping map as well as the payload: a turn that touches
    // hundreds of items must not leave hundreds of timestamps behind.
    if (this.toolProgressLastAt.size > 512) this.toolProgressLastAt.clear()
    this.toolProgressLastAt.set(itemId, now)
    this.emit('toolProgress', {
      sessionId: this.bridgeSessionId,
      itemId,
      delta: delta.length > TOOL_PROGRESS_CHUNK_LIMIT
        ? delta.slice(-TOOL_PROGRESS_CHUNK_LIMIT)
        : delta,
    })
  }

  private _handleNotification(notification: JsonRpcNotification): void {
    const { method, params } = notification
    const sid = this.bridgeSessionId

    log.debug(`← notification: ${method}`)

    switch (method) {
      // ── Turn lifecycle ─────────────────────────
      case 'turn/started': {
        const turn = params.turn as Record<string, unknown> | undefined
        this.currentTurnId = (turn?.id as string) ?? this.currentTurnId
        this.errorTurnId = null
        this.emit('messageStart', { sessionId: sid, event: params })
        break
      }

      case 'turn/completed': {
        const turn = params.turn as Record<string, unknown> | undefined
        const turnId = (turn?.id as string) ?? undefined
        // The protocol's own status is the authority. Missing or unrecognised
        // is `unknown`, never `completed`: a stopped turn must not be dressed
        // up as a successful one.
        const view = normalizeTurnCompleted(turn)
        this.currentTurnId = null

        // A failed turn also arrives as a failed turn/completed. Emit an error
        // only if the standalone `error` notification did not already do so.
        // `codexErrorInfo` (the typed enum) rides along verbatim.
        if (view.outcome === 'failed' && view.error?.message && turnId !== this.errorTurnId) {
          this.emit('turnError', {
            sessionId: sid,
            message: view.error.message,
            details: view.error.details,
            willRetry: false,
            codexErrorInfo: view.error.codexErrorInfo,
          })
        }

        // Older builds put usage on the turn; current builds send it through
        // thread/tokenUsage/updated, which we cached above.
        const turnUsage = turn?.usage as Record<string, number> | undefined
        const usage = this.lastTokenUsage ?? (turnUsage ? {
          input_tokens: turnUsage.inputTokens ?? turnUsage.input_tokens ?? 0,
          output_tokens: turnUsage.outputTokens ?? turnUsage.output_tokens ?? 0,
          cache_read_input_tokens: turnUsage.cacheReadInputTokens ?? 0,
          cache_creation_input_tokens: turnUsage.cacheCreationInputTokens ?? 0,
        } : undefined)

        // Map to the same 'result' event format that StreamBridge emits.
        // `status` stays exactly what the wire said (null when absent), while
        // `outcome` is the renderer-facing normalized statement. `subtype`
        // keeps its legacy success/error vocabulary and adds honest values for
        // stopped/unknown turns instead of pretending they succeeded.
        this.emit('result', {
          sessionId: sid,
          subtype: view.subtype,
          outcome: view.outcome,
          codexThreadId: (params.threadId as string) ?? this.currentThreadId,
          turnId,
          totalCostUsd: (turn?.totalCostUsd as number) ?? undefined,
          usage,
          status: view.statusOnWire,
          durationMs: view.durationMs ?? undefined,
          numTurns: 1,
          event: params,
        })
        // Close the synthetic plan card, if one was opened for this turn.
        if (turnId) {
          this.emit('toolResult', {
            sessionId: sid,
            event: { tool_use_id: `plan-${turnId}`, content: '', is_error: false },
          })
        }
        this.errorTurnId = null
        this.streamedTextItems.clear()
        this.streamedThinkingKinds.clear()
        this.toolProgressLastAt.clear()
        this.planDeltaBuffers.clear()
        this.planDeltaLastEmit.clear()
        // A completed turn cannot still need an answer; drop stale timers
        // without sending responses the server no longer expects.
        this._clearAllServerRequests()
        this.emit('messageStop', { sessionId: sid })
        break
      }

      // ── Item lifecycle ─────────────────────────
      case 'item/started': {
        this._handleItemEvent(params, 'started')
        break
      }

      case 'item/completed': {
        this._handleItemEvent(params, 'completed')
        break
      }

      // ── Streaming text deltas ──────────────────
      case 'item/agentMessage/delta': {
        const delta = (params.delta as string) ?? (params.text as string) ?? ''
        const itemId = (params.itemId as string) ?? ''
        if (itemId) this.streamedTextItems.add(itemId)
        if (delta) {
          this.emit('textDelta', { sessionId: sid, text: delta, itemId })
        }
        break
      }

      // ── Plan streaming ─────────────────────────
      // `item/plan/delta` is a raw text stream; the structured plan arrives via
      // turn/plan/updated and the completed plan item. Accumulate a bounded
      // window (never concatenate unboundedly), parse checkboxes when present,
      // and throttle: a verbose plan must not flood IPC.
      case 'item/plan/delta': {
        const itemId = stringOr(params.itemId)
        const delta = stringOr(params.delta)
        if (!itemId || !delta) break
        const previous = this.planDeltaBuffers.get(itemId) ?? ''
        const next = (previous + delta).slice(-PLAN_DELTA_BUFFER_LIMIT)
        this.planDeltaBuffers.set(itemId, next)
        const now = Date.now()
        const last = this.planDeltaLastEmit.get(itemId) ?? 0
        if (now - last < PLAN_DELTA_MIN_INTERVAL_MS) break
        this.planDeltaLastEmit.set(itemId, now)
        const todos = parseChecklist(next)
        if (todos.length === 0) break
        this.emit('planUpdated', {
          sessionId: sid,
          turnId: params.turnId,
          planId: `plan-${params.turnId ?? itemId}`,
          plan: todos,
        })
        break
      }

      // ── Agent reasoning/thinking deltas ────────
      // Codex streams both a condensed summary and the raw reasoning text.
      // Whichever arrives first wins for that item; mixing them duplicates
      // every thought.
      case 'item/reasoning/summaryTextDelta':
      case 'item/reasoning/textDelta': {
        const itemId = (params.itemId as string) ?? ''
        const kind = method.endsWith('summaryTextDelta') ? 'summary' : 'content'
        const already = itemId ? this.streamedThinkingKinds.get(itemId) : undefined
        if (!already || already === kind) {
          if (itemId) this.streamedThinkingKinds.set(itemId, kind)
          const delta = (params.delta as string) ?? (params.thinking as string) ?? ''
          if (delta) this.emit('thinkingDelta', { sessionId: sid, thinking: delta, itemId })
        }
        break
      }

      // ── Thread events ──────────────────────────
      case 'thread/started': {
        const thread = params.thread as Record<string, unknown> | undefined
        if (thread?.id) {
          this.currentThreadId = thread.id as string
        }
        this.emit('threadStarted', { sessionId: sid, threadId: thread?.id })
        break
      }

      case 'thread/closed': {
        log.info(`Thread closed: ${params.threadId}`)
        this.emit('threadClosed', { sessionId: sid, threadId: params.threadId })
        break
      }

      // Fired for a rename from any client, including this one, so a sidebar
      // can update in place instead of waiting for the next list load.
      case 'thread/name/updated': {
        this.emit('threadNameUpdated', {
          sessionId: sid,
          threadId: params.threadId,
          name: params.threadName,
        })
        break
      }

      case 'thread/archived': {
        this.emit('threadArchived', { sessionId: sid, threadId: params.threadId })
        break
      }

      case 'thread/deleted': {
        this.emit('threadDeleted', { sessionId: sid, threadId: params.threadId })
        break
      }

      // A settings change made through any client (or the protocol's own
      // defaults). Forward only the compact fields the UI can act on — the
      // full ThreadSettings includes permission-profile internals.
      case 'thread/settings/updated': {
        const settings = asRecord(params.threadSettings) ?? {}
        this.emit('threadSettingsUpdated', {
          sessionId: sid,
          threadId: params.threadId,
          settings: {
            cwd: settings.cwd ?? null,
            model: settings.model ?? null,
            modelProvider: settings.modelProvider ?? null,
            approvalPolicy: settings.approvalPolicy ?? null,
            approvalsReviewer: settings.approvalsReviewer ?? null,
            personality: settings.personality ?? null,
            effort: settings.effort ?? null,
            serviceTier: settings.serviceTier ?? null,
            sandboxPolicy: settings.sandboxPolicy ?? null,
          },
        })
        break
      }

      // The server resolved a request on its own (auto-resolution, another
      // client, or a turn cancel). Stop the local timer and re-enable the card;
      // never send a response for an id the server has already closed.
      case 'serverRequest/resolved': {
        const key = String(params.requestId ?? '')
        const pending = key ? this.pendingServerRequests.get(key) : undefined
        this._clearServerRequest(key)
        this.emit('serverRequestResolved', {
          sessionId: sid,
          requestId: key,
          threadId: params.threadId,
          ...(pending ? { kind: pending.kind, method: pending.method } : {}),
        })
        break
      }

      // The aggregate turn diff can be large; keep the latest bounded window
      // and mark truncation rather than pushing unbounded text over IPC.
      case 'turn/diff/updated': {
        const diff = stringOr(params.diff)
        if (!diff) break
        const bounded = diff.length > TURN_DIFF_LIMIT ? diff.slice(-TURN_DIFF_LIMIT) : diff
        this.emit('turnDiffUpdated', {
          sessionId: sid,
          threadId: params.threadId,
          turnId: params.turnId,
          diff: bounded,
          truncated: bounded.length < diff.length,
        })
        break
      }

      // ── Turn errors (willRetry=true means Codex is reconnecting) ──
      case 'error': {
        const error = params.error as Record<string, unknown> | undefined
        const willRetry = Boolean(params.willRetry)
        const turnId = (params.turnId as string) ?? null
        if (!willRetry && turnId) this.errorTurnId = turnId
        this.emit('turnError', {
          sessionId: sid,
          message: (error?.message as string) ?? 'Unknown error',
          details: (error?.additionalDetails as string) ?? undefined,
          // Typed protocol enum (string or tagged object); forwarded verbatim
          // so the renderer can explain the cause the engine actually named.
          codexErrorInfo: error?.codexErrorInfo ?? undefined,
          willRetry,
        })
        break
      }

      // ── Token usage updates ────────────────────
      // ThreadTokenUsage: { last, total, modelContextWindow }. The renderer
      // consumes the same snake_case fields Claude's result usage uses.
      case 'thread/tokenUsage/updated': {
        const tokenUsage = params.tokenUsage as Record<string, unknown> | undefined
        const last = (tokenUsage?.last ?? {}) as Record<string, number>
        // A zeroed event fires before the first request completes; emitting it
        // would blank the token meter mid-session.
        if (!last.inputTokens && !last.outputTokens && !last.totalTokens) break
        const usage: CodexClaudeUsage = {
          input_tokens: last.inputTokens ?? 0,
          output_tokens: last.outputTokens ?? 0,
          cache_read_input_tokens: last.cachedInputTokens ?? 0,
          cache_creation_input_tokens: last.cacheWriteInputTokens ?? 0,
          ...(typeof tokenUsage?.modelContextWindow === 'number'
            ? { context_window: tokenUsage.modelContextWindow }
            : {}),
        }
        this.lastTokenUsage = usage
        this.emit('tokenUsageUpdated', { sessionId: sid, usage, tokenUsage })
        break
      }

      // ── Account rate limits ────────────────────
      // The schema documents this as a *sparse* rolling update: nullable
      // metadata may be unavailable and does not clear a previously observed
      // value. Forward the raw snapshot unchanged and let the renderer's
      // rateLimitView module merge it into the last read.
      case 'account/rateLimits/updated': {
        this.emit('rateLimitsUpdated', {
          sessionId: sid,
          source: 'notification',
          rateLimits: params.rateLimits ?? null,
        })
        break
      }

      // ── Status changes ─────────────────────────
      case 'thread/status/changed': {
        this.emit('threadStatusChanged', {
          sessionId: sid,
          threadId: params.threadId,
          status: params.status,
        })
        break
      }

      // ── Structured plan / todo updates ──────────
      case 'turn/plan/updated': {
        const plan = Array.isArray(params.plan) ? params.plan as Array<Record<string, unknown>> : []
        this.emit('planUpdated', {
          sessionId: sid,
          turnId: params.turnId,
          planId: `plan-${params.turnId}`,
          explanation: params.explanation ?? null,
          // TurnPlanStep uses camelCase statuses; TodoListView expects
          // snake_case, so normalize here rather than in the renderer.
          plan: plan.map(step => ({
            content: String(step.step ?? ''),
            status: step.status === 'inProgress'
              ? 'in_progress'
              : step.status === 'completed' ? 'completed' : 'pending',
          })),
        })
        break
      }

      // ── Tool progress ─────────────────────────
      // Command/file output deltas fire per chunk. They are forwarded as the
      // existing `cli:toolProgress` shape, but throttled and truncated so a
      // long build cannot flood IPC. `item/completed` still carries the full
      // aggregate output for the final result.
      case 'item/commandExecution/outputDelta':
      case 'item/fileChange/outputDelta': {
        this._emitToolProgress(stringOr(params.itemId), stringOr(params.delta))
        break
      }

      case 'item/mcpToolCall/progress':
      case 'item/toolCall/progress': {
        this._emitToolProgress(
          stringOr(params.itemId),
          stringOr(params.delta) || stringOr(params.message),
        )
        break
      }

      // ── Compaction ─────────────────────────────
      case 'thread/compacted':
        this.emit('compacted', { sessionId: sid, turnId: params.turnId })
        break

      // ── Skill/plugin notifications ─────────────
      case 'skills/changed': {
        // The next systemInit / skills probe must see the new list.
        this.skillsCache = null
        this.emit('skillsChanged', { sessionId: sid })
        break
      }

      default:
        // Explicitly drop notifications AIPA has no consumer for. A debug line
        // means a newly added protocol method is discoverable instead of silent.
        log.debug(`Unhandled notification: ${method}`)
        this.emit('unknown', { sessionId: sid, event: { method, params } })
    }
  }

  /**
   * Translate Codex `ThreadItem`s into the `toolUse` / `toolResult` pairs the
   * renderer's rich cards already understand. The names and input keys are the
   * Claude CLI ones (Bash/Edit/TodoWrite) on purpose: ToolUseBlock picks its
   * card by name, so reusing them avoids teaching the renderer a second
   * vocabulary.
   */
  private _handleItemEvent(params: Record<string, unknown>, phase: 'started' | 'completed'): void {
    const sid = this.bridgeSessionId
    const item = params.item as Record<string, unknown> | undefined
    if (!item) return

    const itemType = (item.type as string) ?? ''
    const itemId = (item.id as string) ?? ''
    const isDone = phase === 'completed'
    const failed = (status: string) => status === 'failed' || status === 'declined'

    switch (itemType) {
      case 'agentMessage':
      case 'message': {
        if (!isDone) break
        // Deltas already streamed this item; appending item.text again would
        // duplicate the whole message.
        if (this.streamedTextItems.has(itemId)) break
        const content = (item.text as string) ?? extractContentText(item.content)
        if (content) this.emit('textDelta', { sessionId: sid, text: content, itemId })
        break
      }

      // ── Shell command → Bash card ──────────────
      case 'commandExecution': {
        if (!isDone) {
          this.emit('toolUse', {
            sessionId: sid,
            event: {
              id: itemId,
              name: 'Bash',
              input: {
                command: item.command ?? '',
                ...(item.cwd ? { cwd: item.cwd } : {}),
                commandActions: item.commandActions ?? undefined,
              },
            },
          })
          this.toolStarts.add(itemId)
          break
        }
        // item/started may be missing on replayed/older sessions — make sure
        // the card exists before resolving it.
        if (!this.toolStarts.has(itemId)) {
          this.emit('toolUse', {
            sessionId: sid,
            event: {
              id: itemId,
              name: 'Bash',
              input: { command: item.command ?? '', ...(item.cwd ? { cwd: item.cwd } : {}) },
            },
          })
        }
        this.emit('toolResult', {
          sessionId: sid,
          event: {
            tool_use_id: itemId,
            content: item.aggregatedOutput ?? '',
            is_error: failed(item.status as string),
            ...(item.exitCode != null ? { exitCode: item.exitCode } : {}),
          },
        })
        this.toolStarts.delete(itemId)
        this.toolProgressLastAt.delete(itemId)
        break
      }

      // ── Patch → one Edit card per changed file ──
      case 'fileChange': {
        const changes = Array.isArray(item.changes) ? item.changes as Array<Record<string, unknown>> : []
        const done = failed(item.status as string)
        if (changes.length === 0) {
          if (isDone) {
            this.emit('toolResult', { sessionId: sid, event: { tool_use_id: itemId, content: '', is_error: done } })
          }
          break
        }
        changes.forEach((change, idx) => {
          // A patch item can touch several files; each becomes its own card.
          const toolId = changes.length === 1 ? itemId : `${itemId}:${idx}`
          const path = (change.path as string) ?? ''
          const { oldString, newString } = splitUnifiedDiff(change.diff)
          if (!this.toolStarts.has(toolId)) {
            this.emit('toolUse', {
              sessionId: sid,
              event: {
                id: toolId,
                name: 'Edit',
                input: {
                  file_path: path,
                  old_string: oldString,
                  new_string: newString,
                  ...(change.kind ? { change_kind: change.kind } : {}),
                },
              },
            })
            this.toolStarts.add(toolId)
          }
          if (isDone) {
            this.emit('toolResult', { sessionId: sid, event: { tool_use_id: toolId, content: '', is_error: done } })
            this.toolStarts.delete(toolId)
          }
        })
        break
      }

      // ── MCP / dynamic tools → generic card ─────
      case 'mcpToolCall': {
        const name = `mcp__${item.server ?? 'mcp'}__${item.tool ?? 'tool'}`
        const input = (item.arguments ?? {}) as Record<string, unknown>
        if (!isDone) {
          this.emit('toolUse', { sessionId: sid, event: { id: itemId, name, input } })
          this.toolStarts.add(itemId)
          break
        }
        if (!this.toolStarts.has(itemId)) {
          this.emit('toolUse', { sessionId: sid, event: { id: itemId, name, input } })
        }
        const error = item.error as Record<string, unknown> | undefined
        const result = item.result as Record<string, unknown> | undefined
        this.emit('toolResult', {
          sessionId: sid,
          event: {
            tool_use_id: itemId,
            content: error ? (error.message ?? 'MCP tool failed') : JSON.stringify(result?.content ?? result ?? ''),
            is_error: failed(item.status as string) || Boolean(error),
          },
        })
        this.toolStarts.delete(itemId)
        break
      }

      case 'dynamicToolCall': {
        const namespace = item.namespace as string | undefined
        const name = namespace ? `${namespace}.${item.tool}` : String(item.tool ?? 'tool')
        const input = (item.arguments ?? {}) as Record<string, unknown>
        if (!isDone) {
          this.emit('toolUse', { sessionId: sid, event: { id: itemId, name, input } })
          this.toolStarts.add(itemId)
          break
        }
        if (!this.toolStarts.has(itemId)) {
          this.emit('toolUse', { sessionId: sid, event: { id: itemId, name, input } })
        }
        const text = Array.isArray(item.contentItems)
          ? (item.contentItems as Array<Record<string, unknown>>)
              .map(c => (typeof c.text === 'string' ? c.text : c.imageUrl ? `[image] ${c.imageUrl}` : ''))
              .join('\n')
          : ''
        this.emit('toolResult', {
          sessionId: sid,
          event: {
            tool_use_id: itemId,
            content: text,
            is_error: item.success === false || failed(item.status as string),
          },
        })
        this.toolStarts.delete(itemId)
        break
      }

      // ── Web search → WebSearch card ─────────────
      case 'webSearch': {
        const input = { query: item.query ?? '' }
        if (!isDone) {
          this.emit('toolUse', { sessionId: sid, event: { id: itemId, name: 'WebSearch', input } })
          this.toolStarts.add(itemId)
          break
        }
        if (!this.toolStarts.has(itemId)) {
          this.emit('toolUse', { sessionId: sid, event: { id: itemId, name: 'WebSearch', input } })
        }
        this.emit('toolResult', {
          sessionId: sid,
          event: {
            tool_use_id: itemId,
            content: item.results ? JSON.stringify(item.results) : '',
            is_error: false,
          },
        })
        this.toolStarts.delete(itemId)
        break
      }

      case 'imageView': {
        if (!isDone) {
          this.emit('toolUse', {
            sessionId: sid,
            event: { id: itemId, name: 'Read', input: { file_path: item.path ?? '' } },
          })
          this.toolStarts.add(itemId)
          break
        }
        if (!this.toolStarts.has(itemId)) {
          this.emit('toolUse', {
            sessionId: sid,
            event: { id: itemId, name: 'Read', input: { file_path: item.path ?? '' } },
          })
        }
        this.emit('toolResult', { sessionId: sid, event: { tool_use_id: itemId, content: '', is_error: false } })
        this.toolStarts.delete(itemId)
        break
      }

      // ── Plan / checklist ───────────────────────
      case 'plan': {
        if (!isDone) break
        // The completed item supersedes any streamed delta buffer.
        this.planDeltaBuffers.delete(itemId)
        this.planDeltaLastEmit.delete(itemId)
        // turn/plan/updated normally carries the structured steps; this item is
        // the markdown fallback. Both share the plan-<turnId> id so the renderer
        // updates one card instead of stacking two.
        const todos = parseChecklist(String(item.text ?? ''))
        if (todos.length === 0) break
        const planId = `plan-${this.currentTurnId ?? itemId}`
        this.emit('planUpdated', {
          sessionId: sid,
          turnId: this.currentTurnId,
          planId,
          plan: todos,
        })
        break
      }

      // ── Reasoning ─────────────────────────────
      case 'reasoning':
      case 'agentReasoning': {
        if (!isDone) break
        // Deltas already streamed this item's thoughts.
        if (this.streamedThinkingKinds.has(itemId)) break
        const summary = Array.isArray(item.summary) ? (item.summary as string[]).join('\n\n') : ''
        const content = extractContentText(item.content)
        const thinking = summary || content
        if (thinking) this.emit('thinkingDelta', { sessionId: sid, thinking, itemId })
        break
      }

      case 'userMessage':
        break

      default:
        log.debug(`Unknown item type: ${itemType} (phase=${phase})`)
        this.emit(phase === 'started' ? 'itemStarted' : 'itemCompleted', {
          sessionId: sid,
          item: { id: itemId, type: itemType, ...item },
        })
    }
  }

  private _cleanup(): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Bridge cleanup'))
      this.pendingRequests.delete(id)
    }
    // Nobody can answer these once the bridge is gone; reject instead of
    // leaving the codex process (or an IPC waiter) blocked.
    this._rejectAllServerRequests('Bridge closed before the user answered')
    this.currentThreadId = null
    this.currentTurnId = null
    this.initialized = false
    this.lastTokenUsage = null
    this.streamedTextItems.clear()
    this.streamedThinkingKinds.clear()
    this.toolStarts.clear()
    this.errorTurnId = null
    this.pendingApprovalKinds.clear()
    this.pendingPermissionProfiles.clear()
    this.toolProgressLastAt.clear()
    this.planDeltaBuffers.clear()
    this.planDeltaLastEmit.clear()
    this.modelListCache = null
    this.loggedDroppedEfforts.clear()
    this.usageCache = null
    this.rateLimitsCache = null
    this.rateLimitsPrimed = false
    this.skillsCache = null
  }
}

// ── Bridge Manager ───────────────────────────────────

class CodexBridgeManager {
  private bridges = new Map<string, CodexBridge>()

  create(sessionId: string): CodexBridge {
    const bridge = new CodexBridge(sessionId)
    this.bridges.set(sessionId, bridge)
    bridge.on('processExit', () => this.bridges.delete(sessionId))
    return bridge
  }

  get(sessionId: string): CodexBridge | undefined {
    return this.bridges.get(sessionId)
  }

  /**
   * Find the live bridge for a Codex thread. A finished turn leaves the
   * app-server process running with the thread subscribed; opening the same
   * session from another panel (or calling /compact without an active bridge
   * id) must reuse it instead of resuming the thread in a second process.
   */
  /**
   * The first user-facing live bridge, if any. Read-only probes (models,
   * usage, skills) reuse it instead of spawning a second app-server; internal
   * background bridges are skipped because they own no conversation.
   */
  firstLive(): CodexBridge | null {
    for (const [bridgeId, bridge] of this.bridges) {
      if (bridgeId.startsWith('internal-')) continue
      return bridge
    }
    return null
  }

  findByThreadId(threadId: string): { bridgeId: string; bridge: CodexBridge } | null {
    for (const [bridgeId, bridge] of this.bridges) {
      // Background bridges (`internal-…`): automation runs, memory extraction,
      // and other app-initiated turns. Their threads can be opened from the
      // archive while a run is still in flight; attaching the user's message
      // to that bridge would inject it into the hidden run, so never reuse one.
      if (bridgeId.startsWith('internal-')) continue
      if (bridge.getThreadId() === threadId) return { bridgeId, bridge }
    }
    return null
  }

  abort(sessionId: string): void {
    const bridge = this.bridges.get(sessionId)
    this.bridges.delete(sessionId)
    if (!bridge) return
    // Stop semantics: give the model a chance to end the turn cleanly (and keep
    // any partial output it already produced), then reap the process. Killing
    // immediately truncates the rollout and used to leave a half-written turn.
    bridge.interruptTurn().catch(() => {})
    const timer = setTimeout(() => {
      try { bridge.abort() } catch (err) { log.debug('abort failed:', String(err)) }
    }, 1500)
    timer.unref?.()
  }

  abortAll(): void {
    for (const b of this.bridges.values()) b.abort()
    this.bridges.clear()
  }
}

export const codexBridgeManager = new CodexBridgeManager()

/**
 * Rename a Codex thread from outside a turn (sidebar / header rename).
 *
 * Reuses a live bridge when one owns the thread so the running process and
 * Codex's on-disk state stay in sync; otherwise spawns a throwaway app-server,
 * because the session index is only writable through the protocol. Returns
 * false for anything that is not a Codex thread id, so the caller can fall
 * back to the Claude session store.
 */
export async function renameCodexThread(threadId: string, name: string): Promise<boolean> {
  if (typeof threadId !== 'string' || !THREAD_ID_RE.test(threadId)) return false
  const trimmed = name.trim()
  if (!trimmed) return false

  const live = codexBridgeManager.findByThreadId(threadId)
  if (live) {
    try {
      await live.bridge.renameThreadById(threadId, trimmed)
      return true
    } catch (err) {
      log.warn(`renameCodexThread on live bridge failed for ${threadId}:`, String(err))
      return false
    }
  }

  const bridge = new CodexBridge(`rename-${Date.now()}`)
  try {
    await bridge.renameDetached(threadId, trimmed)
    return true
  } catch (err) {
    // "thread not found" is the normal answer for a Claude session id that
    // happens to look like a UUID; callers treat false as "not a Codex thread".
    log.debug(`renameCodexThread failed for ${threadId}:`, String(err))
    return false
  }
}

// ── Read-only protocol probes ───────────────────────
//
// These are independent of any turn: they use a live user-facing bridge when
// one exists and otherwise spawn a short-lived app-server. Nothing here is
// called from sendMessage(), so a slow probe can never hold a turn open.

export interface CodexProbeOptions {
  /** Spawn cwd for a detached probe; defaults to process.cwd(). */
  cwd?: string
  /** Extra environment (normally the stored API key) for a detached probe. */
  env?: Record<string, string>
  /** Bypass the module-level cache. */
  force?: boolean
}

// Module-level caches back the detached path (a fresh bridge has no cache of
// its own). Live bridges cache on the instance; both TTLs are identical.
let detachedModelCache: { cwd: string; models: CodexModelInfo[]; fetchedAt: number } | null = null
let detachedUsageCache: { usage: CodexAccountUsage; fetchedAt: number } | null = null
let detachedRateLimitsCache: { rateLimits: CodexRateLimits; fetchedAt: number } | null = null
let detachedSkillsCache: { cwd: string; skills: CodexSkillInfo[]; fetchedAt: number } | null = null

/** Models Codex exposes, from a live bridge or a short-lived probe. */
export async function fetchCodexModels(options: CodexProbeOptions = {}): Promise<CodexModelInfo[]> {
  const cwd = options.cwd ?? process.cwd()
  if (!options.force && detachedModelCache
    && detachedModelCache.cwd === cwd
    && Date.now() - detachedModelCache.fetchedAt < MODEL_LIST_CACHE_TTL_MS) {
    return detachedModelCache.models
  }
  const live = codexBridgeManager.firstLive()
  const models = live
    ? await live.listModels({ force: options.force })
    : await CodexBridge.withDetached(cwd, options.env ?? {}, bridge => bridge.listModels({ force: true }))
  detachedModelCache = { cwd, models, fetchedAt: Date.now() }
  return models
}

/** Real token usage from Codex's account endpoint (briefly cached). */
export async function fetchCodexAccountUsage(options: CodexProbeOptions = {}): Promise<CodexAccountUsage> {
  if (!options.force && detachedUsageCache
    && Date.now() - detachedUsageCache.fetchedAt < USAGE_CACHE_TTL_MS) {
    return detachedUsageCache.usage
  }
  const live = codexBridgeManager.firstLive()
  const usage = live
    ? await live.readAccountUsage({ force: options.force })
    : await CodexBridge.withDetached(options.cwd ?? process.cwd(), options.env ?? {}, bridge =>
        bridge.readAccountUsage({ force: true }))
  detachedUsageCache = { usage, fetchedAt: Date.now() }
  return usage
}

/** Real plan rate limits from Codex's account endpoint (briefly cached). */
export async function fetchCodexRateLimits(options: CodexProbeOptions = {}): Promise<CodexRateLimits> {
  if (!options.force && detachedRateLimitsCache
    && Date.now() - detachedRateLimitsCache.fetchedAt < RATE_LIMITS_CACHE_TTL_MS) {
    return detachedRateLimitsCache.rateLimits
  }
  const live = codexBridgeManager.firstLive()
  const rateLimits = live
    ? await live.readRateLimits({ force: options.force })
    : await CodexBridge.withDetached(options.cwd ?? process.cwd(), options.env ?? {}, bridge =>
        bridge.readRateLimits({ force: true }))
  detachedRateLimitsCache = { rateLimits, fetchedAt: Date.now() }
  return rateLimits
}

/** Full skill metadata (enabled and disabled) Codex sees for `cwd`. */
export async function fetchCodexSkills(options: CodexProbeOptions = {}): Promise<CodexSkillInfo[]> {
  const cwd = options.cwd ?? process.cwd()
  if (!options.force && detachedSkillsCache
    && detachedSkillsCache.cwd === cwd
    && Date.now() - detachedSkillsCache.fetchedAt < SKILLS_CACHE_TTL_MS) {
    return detachedSkillsCache.skills
  }
  const live = codexBridgeManager.firstLive()
  const skills = live
    ? await live.listSkills({ cwd, force: options.force })
    : await CodexBridge.withDetached(cwd, options.env ?? {}, bridge =>
        bridge.listSkills({ cwd, force: true }))
  detachedSkillsCache = { cwd, skills, fetchedAt: Date.now() }
  return skills
}
