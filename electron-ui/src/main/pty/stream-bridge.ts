import { spawn, ChildProcess } from 'child_process'
import { createInterface } from 'readline'
import { EventEmitter } from 'events'
import { getCliPath, getNodePath } from '../utils/cli-path'
import { sanitizeEnv } from '../utils/cli-env'
import { createLogger } from '../utils/logger'

const log = createLogger('stream-bridge')

export type PermissionMode = 'default' | 'acceptEdits' | 'dontAsk' | 'plan' | 'bypassPermissions'

export interface CliSendMessageArgs {
  prompt: string
  cwd: string
  sessionId?: string        // bridge session ID (internal)
  resumeSessionId?: string  // real Claude session ID to resume
  model?: string
  env: Record<string, string>
  flags?: string[]
  skipPermissions?: boolean  // legacy — derived from permissionMode
  permissionMode?: PermissionMode
}

export class StreamBridge extends EventEmitter {
  private proc: ChildProcess | null = null
  private bridgeSessionId: string
  private keepAliveTimer: NodeJS.Timeout | null = null

  constructor(bridgeSessionId: string) {
    super()
    this.bridgeSessionId = bridgeSessionId
  }

  async sendMessage(args: CliSendMessageArgs): Promise<void> {
    // Resolve effective permission mode (permissionMode takes precedence over legacy skipPermissions)
    const effectiveMode: PermissionMode = args.permissionMode
      ?? (args.skipPermissions ? 'bypassPermissions' : 'default')

    // session mode: keep stdin open so we can send follow-ups
    // non-session mode (bypassPermissions legacy path): close stdin and wait
    const isSessionMode = effectiveMode !== 'bypassPermissions'

    // Build --permission-mode flag; bypassPermissions also passes legacy flag for older CLI compat
    const permissionFlags: string[] = effectiveMode === 'bypassPermissions'
      ? ['--permission-mode', 'bypassPermissions']
      : ['--permission-mode', effectiveMode]

    const cliArgs = [
      getCliPath(),
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--permission-prompt-tool', 'stdio',
      ...permissionFlags,
      ...(isSessionMode ? [] : ['--print']),
      ...(args.resumeSessionId ? ['--resume', args.resumeSessionId] : []),
      ...(args.model ? ['--model', args.model] : []),
      ...(args.flags || []),
    ]

    const env: Record<string, string> = sanitizeEnv({
      ...args.env,
      TERM: 'dumb',
      NO_COLOR: '1',
    })

    this.proc = spawn(getNodePath(), cliArgs, {
      cwd: args.cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this._attachOutputHandlers()
    this._writeUserMessage(args.prompt, args.resumeSessionId)

    if (!isSessionMode) {
      // skip mode: close stdin now, wait for process to exit
      this.proc.stdin!.end()
      return new Promise<void>((resolve, reject) => {
        this.proc!.on('close', (code) => {
          if (code === 0 || code === null) resolve()
          else reject(new Error(`CLI exited with code ${code}`))
        })
      })
    }
    // session mode: return immediately, CLI stays alive
    // Start keep-alive ping every 25s to prevent stdin from being GC'd
    this.keepAliveTimer = setInterval(() => {
      if (this.proc?.stdin) {
        try { this.proc.stdin.write('{"type":"keep_alive"}\n') } catch { /* ignore */ }
      }
    }, 25000)
  }

  private _writeUserMessage(prompt: string, sessionId?: string): void {
    // If prompt is a JSON array string (image attachments), parse it back to array
    let content: unknown = prompt
    if (prompt.startsWith('[')) {
      try { content = JSON.parse(prompt) } catch { content = prompt }
    }
    const userMessage = JSON.stringify({
      type: 'user',
      message: { role: 'user', content },
      session_id: sessionId || '',
      parent_tool_use_id: null,
    }) + '\n'
    this.proc!.stdin!.write(userMessage)
  }

  private _attachOutputHandlers(): void {
    const rl = createInterface({ input: this.proc!.stdout! })
    rl.on('line', (line) => {
      const trimmed = line.trim()
      if (!trimmed) return
      log.debug('stdout:', trimmed.slice(0, 200))
      try {
        const event = JSON.parse(trimmed)
        this.handleStreamEvent(event)
      } catch {
        log.debug('Non-JSON stdout line:', trimmed.slice(0, 200))
        this.emit('rawOutput', trimmed)
      }
    })

    this.proc!.stderr!.on('data', (data: Buffer) => {
      log.debug('stderr:', data.toString().slice(0, 200))
      this.emit('stderr', data.toString())
    })

    this.proc!.on('close', (code) => {
      this.emit('processExit', { sessionId: this.bridgeSessionId, code })
      this.proc = null
    })
  }

  sendFollowUp(prompt: string, sessionId?: string): void {
    if (!this.proc || !this.proc.stdin) {
      throw new Error('No active CLI process to send follow-up to')
    }
    this._writeUserMessage(prompt, sessionId)
  }

  endSession(): void {
    if (this.keepAliveTimer) { clearInterval(this.keepAliveTimer); this.keepAliveTimer = null }
    if (this.proc?.stdin) {
      try { this.proc.stdin.end() } catch (err) {
        log.warn('Failed to end stdin (process may already be dead):', String(err))
      }
    }
  }

  respondPermission(requestId: string, allowed: boolean): void {
    if (!this.proc?.stdin) return
    const response = JSON.stringify({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response: { behavior: allowed ? 'allow' : 'deny' },
      },
    }) + '\n'
    this.proc.stdin.write(response)
  }

  private handleStreamEvent(event: Record<string, unknown>): void {
    const sid = this.bridgeSessionId
    switch (event.type) {
      case 'assistant': {
        // Claude Code CLI emits {"type":"assistant","message":{...}} with full response
        const message = event.message as Record<string, unknown>
        const content = message?.content as Array<Record<string, unknown>> | undefined
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text' && block.text) {
              this.emit('textDelta', { sessionId: sid, text: block.text as string })
            } else if (block.type === 'tool_use' && block.id) {
              const toolId = block.id as string
              const toolName = block.name as string
              const toolInput = (block.input ?? {}) as Record<string, unknown>
              this.emit('toolUse', { sessionId: sid, event: { id: toolId, name: toolName, input: toolInput } })
            }
          }
        }
        this.emit('messageStop', { sessionId: sid })
        break
      }
      case 'user': {
        // Tool results come back wrapped in a user message
        const message = event.message as Record<string, unknown>
        const content = message?.content as Array<Record<string, unknown>> | undefined
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'tool_result') {
              const toolUseId = block.tool_use_id as string
              const isError = Boolean(block.is_error)
              const blockContent = block.content
              this.emit('toolResult', { sessionId: sid, event: { tool_use_id: toolUseId, content: blockContent, is_error: isError } })
            }
          }
        }
        break
      }
      case 'message_start':
        this.emit('messageStart', { sessionId: sid, event })
        break
      case 'content_block_start':
        break
      case 'content_block_delta': {
        const delta = event.delta as Record<string, unknown>
        if (delta?.type === 'text_delta') {
          this.emit('textDelta', { sessionId: sid, text: delta.text as string })
        } else if (delta?.type === 'thinking_delta') {
          this.emit('thinkingDelta', { sessionId: sid, thinking: delta.thinking as string })
        }
        break
      }
      case 'content_block_stop':
        this.emit('contentBlockStop', { sessionId: sid })
        break
      case 'message_stop':
        this.emit('messageStop', { sessionId: sid })
        break
      case 'message_delta':
        this.emit('messageDelta', { sessionId: sid, event })
        break
      case 'tool_use':
        this.emit('toolUse', { sessionId: sid, event })
        break
      case 'tool_result':
        this.emit('toolResult', { sessionId: sid, event })
        break
      case 'system': {
        const parsed = event as Record<string, unknown>
        if (parsed.subtype === 'init') {
          const allTools = (parsed.tools as string[] | undefined) ?? []
          const rawMcpServers = (parsed.mcp_servers as Array<{ name: string; status: string }> | undefined) ?? []
          // Infer per-server tool lists from tool names: mcp__serverName__toolName
          const serverToolMap: Record<string, string[]> = {}
          for (const toolName of allTools) {
            if (toolName.startsWith('mcp__')) {
              const withoutPrefix = toolName.slice('mcp__'.length)
              const sepIdx = withoutPrefix.indexOf('__')
              if (sepIdx !== -1) {
                const serverName = withoutPrefix.slice(0, sepIdx)
                if (!serverToolMap[serverName]) serverToolMap[serverName] = []
                serverToolMap[serverName].push(toolName)
              }
            }
          }
          const mcpServers = rawMcpServers.map(srv => ({
            ...srv,
            tools: serverToolMap[srv.name] ?? [],
          }))
          this.emit('systemInit', {
            sessionId: sid,
            tools: allTools,
            mcpServers,
            model: (parsed.model as string | undefined) ?? '',
            permissionMode: (parsed.permissionMode as string | undefined) ?? 'default',
            cwd: (parsed.cwd as string | undefined) ?? '',
          })
        } else {
          this.emit('system', { sessionId: sid, event })
        }
        break
      }
      case 'result': {
        // result event contains session_id and rich stats for the completed turn
        const re = event as Record<string, unknown>
        const resultSubtype = (re.subtype as string | undefined) ?? 'success'
        if (resultSubtype === 'error_max_structured_output_retries') {
          log.warn('[result] Structured output retries exceeded for session:', sid)
        }
        this.emit('result', {
          sessionId: sid,
          subtype: resultSubtype,
          claudeSessionId: re.session_id,
          uuid: re.uuid,
          fastModeState: re.fast_mode_state,
          totalCostUsd: re.total_cost_usd,
          usage: re.usage,
          modelUsage: re.model_usage ?? re.modelUsage,
          permissionDenials: (re.permission_denials as Array<{ tool_name: string; reason?: string }> | undefined) ?? [],
          numTurns: re.num_turns,
          durationMs: re.duration_ms,
          uuid: re.uuid,
          fastModeState: re.fast_mode_state,
          event,
        })
        break
      }
      case 'control_request': {
        const req = (event.request ?? event) as Record<string, unknown>
        const subtype = req.subtype as string | undefined
        if (subtype === 'can_use_tool') {
          this.emit('permissionRequest', {
            sessionId: this.bridgeSessionId,
            requestId: (event.request_id as string) || '',
            toolName: (req.tool_name ?? 'unknown') as string,
            toolInput: (req.input ?? {}) as Record<string, unknown>,
            title: (req.title as string) || undefined,
            description: (req.description as string) || undefined,
            permissionSuggestions: (req.permission_suggestions ?? []) as unknown[],
          })
        } else if (subtype === 'hook_callback') {
          this.emit('hookCallback', {
            sessionId: this.bridgeSessionId,
            requestId: (event.request_id as string) || '',
            callbackId: (req.callback_id as string) || '',
            hookInput: (req.input ?? {}) as Record<string, unknown>,
            toolUseId: (req.tool_use_id as string) || undefined,
          })
        } else if (subtype === 'elicitation') {
          this.emit('mcpElicitation', {
            sessionId: this.bridgeSessionId,
            requestId: (event.request_id as string) || '',
            serverName: (req.mcp_server_name as string) || '',
            message: (req.message as string) || '',
            mode: (req.mode as 'form' | 'url') || 'form',
            url: req.url as string | undefined,
            requestedSchema: req.requested_schema as Record<string, unknown> | undefined,
          })
        }
        break
      }
      case 'permission_request': {
        this.emit('permissionRequest', {
          sessionId: this.bridgeSessionId,
          requestId: (event.request_id as string) || '',
          toolName: (event.tool_name ?? event.tool_type ?? 'unknown') as string,
          toolInput: (event.action_data ?? event.input ?? {}) as Record<string, unknown>,
        })
        break
      }
      case 'hook_event': {
        this.emit('hookEvent', { sessionId: sid, data: event })
        break
      }
      case 'notification': {
        this.emit('notification', {
          sessionId: sid,
          message: (event.message as string) ?? '',
          title: (event.title as string) ?? '',
        })
        break
      }
      case 'overloaded_error': {
        // API overload — surface as a user-visible error
        this.emit('apiError', {
          sessionId: sid,
          errorType: 'overloaded',
          message: (event.message as string) || 'The API is currently overloaded. Please try again.',
        })
        break
      }
      case 'authentication_error': {
        // Auth failure (expired token, invalid API key, etc.)
        this.emit('apiError', {
          sessionId: sid,
          errorType: 'authentication',
          message: (event.message as string) || 'Authentication failed. Please check your API key.',
        })
        break
      }
      case 'worktree-state': {
        // Worktree state change notification from CLI
        this.emit('worktreeState', {
          sessionId: sid,
          worktreePath: (event.worktreePath as string) || '',
          branch: (event.branch as string) || '',
          state: (event.state as string) || '',
        })
        break
      }
      case 'custom-title': {
        // CLI has auto-generated/set a custom session title
        this.emit('customTitle', {
          sessionId: sid,
          title: (event.title as string) || '',
        })
        break
      }
      case 'task_completed': {
        // Background task completed
        this.emit('taskCompleted', {
          sessionId: sid,
          taskId: (event.taskId as string) || '',
          result: event.result,
        })
        break
      }
      case 'plan_approval_request': {
        this.emit('planApprovalRequest', {
          sessionId: sid,
          requestId: (event.requestId as string) || '',
          from: (event.from as string) || '',
          planContent: (event.planContent as string) || '',
          planFilePath: (event.planFilePath as string) || '',
          timestamp: (event.timestamp as string) || '',
        })
        break
      }
      default:
        this.emit('unknown', { sessionId: sid, event })
    }
  }

  respondPlanApproval(requestId: string, approved: boolean, feedback?: string): void {
    if (!this.proc?.stdin) return
    const response = JSON.stringify({
      type: 'plan_approval_response',
      requestId,
      approved,
      feedback: feedback || undefined,
      timestamp: new Date().toISOString(),
    }) + '\n'
    this.proc.stdin.write(response)
  }

  respondHookCallback(requestId: string, response: Record<string, unknown>): void {
    if (!this.proc?.stdin) return
    const msg = JSON.stringify({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response,
      },
    }) + '\n'
    this.proc.stdin.write(msg)
  }

  respondElicitation(requestId: string, result: Record<string, unknown>): void {
    if (!this.proc?.stdin) return
    const msg = JSON.stringify({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response: result,
      },
    }) + '\n'
    this.proc.stdin.write(msg)
  }

  cancelRequest(requestId: string): void {
    if (!this.proc?.stdin) return
    try {
      this.proc.stdin.write(JSON.stringify({ type: 'control_cancel_request', request_id: requestId }) + '\n')
    } catch { /* ignore if already closed */ }
  }

  updateEnv(vars: Record<string, string>): void {
    if (!this.proc?.stdin) return
    try {
      this.proc.stdin.write(JSON.stringify({ type: 'update_environment_variables', variables: vars }) + '\n')
    } catch { /* ignore if already closed */ }
  }

  abort(): void {
    if (this.keepAliveTimer) { clearInterval(this.keepAliveTimer); this.keepAliveTimer = null }
    if (this.proc) {
      try { this.proc.kill('SIGTERM') } catch (err) {
        log.debug('Kill failed (process may have already exited):', String(err))
      }
      this.proc = null
    }
  }
}

// Manager for multiple concurrent stream bridges
class StreamBridgeManager {
  private bridges = new Map<string, StreamBridge>()

  create(sessionId: string): StreamBridge {
    const bridge = new StreamBridge(sessionId)
    this.bridges.set(sessionId, bridge)
    bridge.on('processExit', () => this.bridges.delete(sessionId))
    return bridge
  }

  get(sessionId: string): StreamBridge | undefined {
    return this.bridges.get(sessionId)
  }

  abort(sessionId: string): void {
    const bridge = this.bridges.get(sessionId)
    if (bridge) {
      bridge.endSession()
      try { bridge.abort() } catch (err) { log.debug('abort failed:', String(err)) }
    }
    this.bridges.delete(sessionId)
  }

  abortAll(): void {
    for (const b of this.bridges.values()) b.abort()
    this.bridges.clear()
  }
}

export const streamBridgeManager = new StreamBridgeManager()
