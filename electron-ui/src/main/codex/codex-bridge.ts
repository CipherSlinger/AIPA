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

export type ApprovalPolicy = 'never' | 'unless-allow-listed' | 'on-request' | 'always'

export interface CodexSendMessageArgs {
  prompt: string
  cwd: string
  threadId?: string          // existing thread to resume
  model?: string
  env: Record<string, string>
  approvalPolicy?: ApprovalPolicy
  sandbox?: string           // 'readOnly' | 'workspaceWrite' | 'dangerFullAccess'
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
function toUserInput(prompt: string): Array<{ type: 'text'; text: string }> {
  return [{ type: 'text', text: prompt }]
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
    await this._startTurn(args.prompt)
  }

  /**
   * Send a follow-up message on the existing thread.
   * Replaces StreamBridge.sendFollowUp().
   */
  async sendFollowUp(prompt: string): Promise<void> {
    if (!this.currentThreadId) {
      throw new Error('No active thread to send follow-up to')
    }
    await this._startTurn(prompt)
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
    // Approval responses are JSON-RPC responses to the server's request
    const response = JSON.stringify({
      id: typeof requestId === 'string' ? parseInt(requestId, 10) : requestId,
      result: { decision: approved ? 'approved' : 'denied' },
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
   * Get the current thread ID (for session persistence).
   */
  getThreadId(): string | null {
    return this.currentThreadId
  }

  // ── Private: Protocol handshake ─────────────────

  private async _initialize(): Promise<void> {
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
    if (args.approvalPolicy) params.approvalPolicy = args.approvalPolicy
    if (args.sandbox) params.sandbox = args.sandbox
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
    if (args.approvalPolicy) params.approvalPolicy = args.approvalPolicy
    if (args.personality) params.personality = args.personality

    const result = await this._sendRequest('thread/resume', params) as { thread?: { id: string } }
    this.currentThreadId = result?.thread?.id ?? threadId
    log.info(`Thread resumed: ${this.currentThreadId}`)
  }

  private async _startTurn(prompt: string): Promise<void> {
    if (!this.currentThreadId) {
      throw new Error('No active thread')
    }

    const result = await this._sendRequest('turn/start', {
      threadId: this.currentThreadId,
      input: toUserInput(prompt),
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
    const requestId = msg.id

    log.debug(`← server request [${requestId}]: ${method}`)

    switch (method) {
      case 'item/approval/request':
        this.emit('permissionRequest', {
          sessionId: this.bridgeSessionId,
          requestId: String(requestId),
          toolName: (params.toolName ?? params.tool_name ?? 'unknown') as string,
          toolInput: (params.input ?? params.toolInput ?? {}) as Record<string, unknown>,
          title: (params.title as string) || undefined,
          description: (params.description as string) || undefined,
        })
        break

      default:
        log.debug(`Unhandled server request: ${method}`)
        // Auto-approve unknown requests to avoid deadlock
        this.respondApproval(String(requestId), true)
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
        this.emit('messageStart', { sessionId: sid, event: params })
        break
      }

      case 'turn/completed': {
        const turn = params.turn as Record<string, unknown> | undefined
        const usage = turn?.usage as Record<string, number> | undefined
        this.currentTurnId = null

        // Map to the same 'result' event format that StreamBridge emits
        this.emit('result', {
          sessionId: sid,
          subtype: 'success',
          codexThreadId: (params.threadId as string) ?? this.currentThreadId,
          turnId: turn?.id as string | undefined,
          totalCostUsd: (turn?.totalCostUsd as number) ?? undefined,
          usage: usage ? {
            input_tokens: usage.inputTokens ?? usage.input_tokens ?? 0,
            output_tokens: usage.outputTokens ?? usage.output_tokens ?? 0,
            cache_read_input_tokens: usage.cacheReadInputTokens ?? 0,
            cache_creation_input_tokens: usage.cacheCreationInputTokens ?? 0,
          } : undefined,
          status: (turn?.status as string) ?? 'completed',
          durationMs: (turn?.durationMs as number) ?? undefined,
          numTurns: 1,
          event: params,
        })
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
        if (delta) {
          this.emit('textDelta', { sessionId: sid, text: delta })
        }
        break
      }

      // ── Agent reasoning/thinking deltas ────────
      case 'item/agentReasoning/delta': {
        const delta = (params.delta as string) ?? (params.thinking as string) ?? ''
        if (delta) {
          this.emit('thinkingDelta', { sessionId: sid, thinking: delta })
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
        this.emit('turnError', {
          sessionId: sid,
          message: (error?.message as string) ?? 'Unknown error',
          details: (error?.additionalDetails as string) ?? undefined,
          willRetry: Boolean(params.willRetry),
        })
        break
      }

      // ── Token usage updates ────────────────────
      case 'thread/tokenUsage/updated': {
        this.emit('tokenUsageUpdated', { sessionId: sid, usage: params })
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

      // ── Tool progress (shell commands, file edits) ──
      case 'item/toolCall/progress': {
        // Surface as a toolResult with partial data
        const item = params.item as Record<string, unknown> | undefined
        if (item) {
          this.emit('toolProgress', { sessionId: sid, event: item })
        }
        break
      }

      // ── Skill/plugin notifications ─────────────
      case 'skills/changed': {
        this.emit('skillsChanged', { sessionId: sid })
        break
      }

      default:
        this.emit('unknown', { sessionId: sid, event: { method, params } })
    }
  }

  private _handleItemEvent(params: Record<string, unknown>, phase: 'started' | 'completed'): void {
    const sid = this.bridgeSessionId
    const item = params.item as Record<string, unknown> | undefined
    if (!item) return

    const itemType = (item.type as string) ?? ''
    const itemId = (item.id as string) ?? ''

    switch (itemType) {
      case 'agentMessage':
      case 'message': {
        // Text message item — emit as textDelta on completed (full content available)
        if (phase === 'completed') {
          const content = (item.content as string) ?? (item.text as string) ?? ''
          if (content) {
            this.emit('textDelta', { sessionId: sid, text: content, itemId })
          }
        }
        break
      }

      case 'toolCall':
      case 'tool_call':
      case 'shellCommand':
      case 'fileEdit': {
        // Tool call items — emit toolUse on started, toolResult on completed
        const toolName = (item.name as string) ?? (item.toolName as string) ?? itemType
        const toolInput = (item.input as Record<string, unknown>)
          ?? (item.arguments as Record<string, unknown>)
          ?? {}

        if (phase === 'started') {
          this.emit('toolUse', {
            sessionId: sid,
            event: { id: itemId, name: toolName, input: toolInput },
          })
        } else {
          const output = (item.output as string) ?? (item.result as string) ?? ''
          const isError = (item.status as string) === 'error' || (item.isError as boolean) === true
          this.emit('toolResult', {
            sessionId: sid,
            event: {
              tool_use_id: itemId,
              content: output || item.output,
              is_error: isError,
            },
          })
        }
        break
      }

      case 'userMessage': {
        // User message echoed back — typically ignored
        break
      }

      case 'reasoning':
      case 'agentReasoning': {
        // Reasoning/thinking item
        if (phase === 'completed') {
          const thinking = (item.content as string) ?? (item.text as string) ?? ''
          if (thinking) {
            this.emit('thinkingDelta', { sessionId: sid, thinking, itemId })
          }
        }
        break
      }

      default:
        log.debug(`Unknown item type: ${itemType} (phase=${phase})`)
        // Emit as generic item event for potential future handling
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

  abort(sessionId: string): void {
    const bridge = this.bridges.get(sessionId)
    if (bridge) {
      bridge.interruptTurn().catch(() => {})
      try { bridge.abort() } catch (err) { log.debug('abort failed:', String(err)) }
    }
    this.bridges.delete(sessionId)
  }

  abortAll(): void {
    for (const b of this.bridges.values()) b.abort()
    this.bridges.clear()
  }
}

export const codexBridgeManager = new CodexBridgeManager()
