/**
 * CodexBridge — replaces StreamBridge for OpenAI Codex CLI integration.
 *
 * Speaks JSON-RPC 2.0 over stdio (newline-delimited JSON) to `codex app-server --stdio`.
 * Maps Codex protocol events to the same EventEmitter interface that StreamBridge used,
 * so the IPC layer and renderer need minimal changes.
 *
 * Protocol reference: codex/codex-rs/app-server/README.md
 */
import { spawn, ChildProcess } from 'child_process'
import { createInterface } from 'readline'
import { EventEmitter } from 'events'
import { getCodexPath } from './codex-resolver'
import { sanitizeCodexEnv } from './codex-env'
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

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  method: string
  timer: NodeJS.Timeout
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

    this.proc = spawn(codexPath, ['app-server', '--stdio'], {
      cwd: args.cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this._attachOutputHandlers()

    // Step 1: Initialize handshake
    await this._initialize()

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

    // Step 3: Send the first user turn
    await this._startTurn(args.input ?? toUserInput(args.prompt))
  }

  /**
   * Send a follow-up message on the existing thread.
   * Replaces StreamBridge.sendFollowUp().
   */
  async sendFollowUp(prompt: string, input?: CodexUserInput[]): Promise<void> {
    if (!this.currentThreadId) {
      throw new Error('No active thread to send follow-up to')
    }
    await this._startTurn(input ?? toUserInput(prompt))
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
      this.proc = spawn(codexPath, ['app-server', '--stdio'], {
        cwd: args.cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      this._attachOutputHandlers()
      await this._initialize()
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
    try {
      await this._sendRequest('turn/interrupt', {
        threadId: this.currentThreadId,
        turnId: this.currentTurnId,
      })
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
    this.pendingApprovalKinds.delete(key)
    this.pendingPermissionProfiles.delete(key)
    // Approval responses are JSON-RPC responses to the server's request
    const response = JSON.stringify({
      id: typeof requestId === 'string' ? parseInt(requestId, 10) : requestId,
      result,
    }) + '\n'
    this.proc.stdin.write(response)
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

  // ── Private: Protocol handshake ─────────────────

  /**
   * `silent` skips the synthetic `systemInit` event (and the MCP probe behind
   * it) for short-lived processes — a detached rename has no renderer listening.
   */
  private async _initialize(opts: { silent?: boolean } = {}): Promise<void> {
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

    // Send initialized notification (no response expected)
    this._sendNotification('initialized', {})

    if (opts.silent) {
      log.info('Codex app-server initialized (silent)')
      return
    }

    // Emit a synthetic systemInit event for compatibility
    const initResult = result as Record<string, unknown> ?? {}
    this.emit('systemInit', {
      sessionId: this.bridgeSessionId,
      tools: [],
      mcpServers: await this._collectMcpServers(),
      model: (initResult.model as string) ?? '',
      permissionMode: 'default',
      cwd: '',
      skills: [],
      plugins: [],
      codexHome: (initResult.codexHome as string) ?? '',
      platformFamily: (initResult.platformFamily as string) ?? '',
    })

    log.info('Codex app-server initialized successfully')
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

  private async _startTurn(input: CodexUserInput[]): Promise<void> {
    if (!this.currentThreadId) {
      throw new Error('No active thread')
    }

    const result = await this._sendRequest('turn/start', {
      threadId: this.currentThreadId,
      input,
    }) as { turn?: { id: string } }

    this.currentTurnId = result?.turn?.id ?? null
    log.info(`Turn started: ${this.currentTurnId}`)
  }

  // ── Private: JSON-RPC transport ─────────────────

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
    const params = (msg.params ?? {}) as Record<string, unknown>
    const requestId = String(msg.id)

    log.debug(`← server request [${requestId}]: ${method}`)

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
        request(
          method === 'applyPatchApproval' ? 'Edit' : 'Bash',
          { ...params },
          method === 'applyPatchApproval' ? 'File change approval' : 'Command approval',
        )
        break

      // Older protocol revision used by the first AIPA integration.
      case 'item/approval/request':
        this.pendingApprovalKinds.set(requestId, 'legacy')
        request(
          (params.toolName ?? params.tool_name ?? 'unknown') as string,
          (params.input ?? params.toolInput ?? {}) as Record<string, unknown>,
          (params.title as string) || undefined,
          (params.description as string) || undefined,
        )
        break

      default:
        log.debug(`Unhandled server request: ${method}`)
        // Auto-approve unknown requests to avoid deadlock
        this.respondApproval(requestId, true)
    }
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
        const status = (turn?.status as string) ?? 'completed'
        const error = turn?.error as { message?: string; additionalDetails?: string } | undefined
        this.currentTurnId = null

        // A failed turn also arrives as a failed turn/completed. Emit an error
        // only if the standalone `error` notification did not already do so.
        if (status === 'failed' && error?.message && turnId !== this.errorTurnId) {
          this.emit('turnError', {
            sessionId: sid,
            message: error.message,
            details: error.additionalDetails,
            willRetry: false,
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

        // Map to the same 'result' event format that StreamBridge emits
        this.emit('result', {
          sessionId: sid,
          subtype: status === 'failed' ? 'error' : 'success',
          codexThreadId: (params.threadId as string) ?? this.currentThreadId,
          turnId,
          totalCostUsd: (turn?.totalCostUsd as number) ?? undefined,
          usage,
          status,
          durationMs: (turn?.durationMs as number) ?? undefined,
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
      // Command/file output deltas are intentionally not forwarded: they fire
      // per chunk and nothing in the UI consumes them, so mirroring them would
      // just flood IPC during long commands.
      case 'item/mcpToolCall/progress':
      case 'item/toolCall/progress': {
        this.emit('toolProgress', {
          sessionId: sid,
          itemId: params.itemId ?? null,
          delta: params.delta ?? params.message ?? '',
        })
        break
      }

      // ── Compaction ─────────────────────────────
      case 'thread/compacted':
        this.emit('compacted', { sessionId: sid, turnId: params.turnId })
        break

      // ── Skill/plugin notifications ─────────────
      case 'skills/changed': {
        this.emit('skillsChanged', { sessionId: sid })
        break
      }

      default:
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
