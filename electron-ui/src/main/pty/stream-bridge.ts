import { spawn, ChildProcess } from 'child_process'
import { createInterface } from 'readline'
import { EventEmitter } from 'events'
import path from 'path'
import fs from 'fs'
import { execSync } from 'child_process'

function getCliPath(): string {
  if (process.env.CLAUDE_CLI_PATH) return process.env.CLAUDE_CLI_PATH
  const candidates = [
    path.resolve(__dirname, '../../../../package/cli.js'),
    path.resolve(__dirname, '../../../package/cli.js'),
    path.resolve(process.cwd(), '../package/cli.js'),
    path.resolve(process.cwd(), 'package/cli.js'),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  throw new Error(`Claude Code CLI not found. Searched:\n${candidates.join('\n')}`)
}

function getNodePath(): string {
  try {
    const nodePath = execSync('where node', { encoding: 'utf8' }).trim().split('\n')[0].trim()
    if (fs.existsSync(nodePath)) return nodePath
  } catch {}
  throw new Error('Node.js not found.')
}

export interface CliSendMessageArgs {
  prompt: string
  cwd: string
  sessionId?: string        // bridge session ID (internal)
  resumeSessionId?: string  // real Claude session ID to resume
  model?: string
  env: Record<string, string>
  flags?: string[]
}

export class StreamBridge extends EventEmitter {
  private proc: ChildProcess | null = null
  private bridgeSessionId: string

  constructor(bridgeSessionId: string) {
    super()
    this.bridgeSessionId = bridgeSessionId
  }

  async sendMessage(args: CliSendMessageArgs): Promise<void> {
    const cliArgs = [
      getCliPath(),
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--print',
      ...(args.resumeSessionId ? ['--resume', args.resumeSessionId] : []),
      ...(args.model ? ['--model', args.model] : []),
      ...(args.flags || []),
    ]

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...args.env,
      TERM: 'dumb',
      NO_COLOR: '1',
    }

    this.proc = spawn(getNodePath(), cliArgs, {
      cwd: args.cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    // Write user message as stream-json to stdin
    const userMessage = JSON.stringify({
      type: 'user',
      message: { role: 'user', content: args.prompt },
      session_id: args.sessionId || '',
      parent_tool_use_id: null,
    }) + '\n'

    this.proc.stdin!.write(userMessage)
    this.proc.stdin!.end()

    // Parse stdout lines
    const rl = createInterface({ input: this.proc.stdout! })
    rl.on('line', (line) => {
      const trimmed = line.trim()
      if (!trimmed) return
      try {
        const event = JSON.parse(trimmed)
        this.handleStreamEvent(event)
      } catch {
        // Non-JSON output
        this.emit('rawOutput', trimmed)
      }
    })

    this.proc.stderr!.on('data', (data: Buffer) => {
      this.emit('stderr', data.toString())
    })

    return new Promise<void>((resolve, reject) => {
      this.proc!.on('close', (code) => {
        this.emit('processExit', { sessionId: this.bridgeSessionId, code })
        this.proc = null
        if (code === 0 || code === null) resolve()
        else reject(new Error(`CLI exited with code ${code}`))
      })
    })
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
            }
          }
        }
        this.emit('messageStop', { sessionId: sid })
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
      case 'system':
        this.emit('system', { sessionId: sid, event })
        break
      case 'result':
        // result event contains session_id for future --resume
        this.emit('result', { sessionId: sid, claudeSessionId: (event as Record<string, unknown>).session_id, event })
        break
      default:
        this.emit('unknown', { sessionId: sid, event })
    }
  }

  abort(): void {
    if (this.proc) {
      try { this.proc.kill('SIGTERM') } catch {}
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
    this.bridges.get(sessionId)?.abort()
    this.bridges.delete(sessionId)
  }

  abortAll(): void {
    for (const b of this.bridges.values()) b.abort()
    this.bridges.clear()
  }
}

export const streamBridgeManager = new StreamBridgeManager()
