import * as pty from 'node-pty'
import { EventEmitter } from 'events'
import path from 'path'
import { execSync } from 'child_process'
import fs from 'fs'
import os from 'os'

// Lazy import electron.app to avoid circular deps
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _electronApp: any
try { _electronApp = require('electron').app } catch {}

function isPackaged(): boolean {
  return _electronApp?.isPackaged ?? false
}

function getResourcesPath(): string {
  return (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath ?? ''
}

// Path to the Claude Code CLI
function getCliPackageDir(): string {
  return isPackaged()
    ? path.join(getResourcesPath(), 'cli')
    : path.resolve(__dirname, '../../../package')
}

function getCliPath(): string {
  if (process.env.CLAUDE_CLI_PATH) return process.env.CLAUDE_CLI_PATH
  const candidates = [
    path.join(getCliPackageDir(), 'cli.js'),
    // dev: electron-ui/dist/main/pty/ → ../../../../package/cli.js = AIPA/package/cli.js
    path.resolve(__dirname, '../../../../package/cli.js'),
    path.resolve(__dirname, '../../../package/cli.js'),
    path.resolve(__dirname, '../../package/cli.js'),
    // absolute fallback next to electron-ui folder
    path.resolve(process.cwd(), '../package/cli.js'),
    path.resolve(process.cwd(), 'package/cli.js'),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  throw new Error(`Claude Code CLI not found. Searched:\n${candidates.join('\n')}`)
}

function getNodePath(): string {
  if (process.env.CLAUDE_NODE_PATH) return process.env.CLAUDE_NODE_PATH
  return 'node'
}

export interface PtyCreateArgs {
  sessionId: string
  cwd: string
  env?: Record<string, string>
  cols: number
  rows: number
  resumeSessionId?: string
}

class PtyManager extends EventEmitter {
  private sessions = new Map<string, pty.IPty>()
  private nodePath: string | null = null

  private getNode(): string {
    if (!this.nodePath) this.nodePath = getNodePath()
    return this.nodePath
  }

  create(args: PtyCreateArgs): string {
    const cliPath = getCliPath()
    const cliArgs = [
      cliPath,
      ...(args.resumeSessionId ? ['--resume', args.resumeSessionId] : []),
    ]

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...(args.env || {}),
      TERM: 'xterm-256color',
      TERM_PROGRAM: 'claude-code-ui',
      CLAUDE_CONFIG_DIR: path.join(os.homedir(), '.claude'),
    }

    // Remove env vars that interfere with Claude CLI detection
    delete env['VSCODE_GIT_ASKPASS_MAIN']
    delete env['CURSOR_TRACE_ID']
    delete env['TERM_PROGRAM_VERSION']

    const ptyProcess = pty.spawn(this.getNode(), cliArgs, {
      name: 'xterm-256color',
      cols: args.cols,
      rows: args.rows,
      cwd: args.cwd,
      env,
      useConpty: true,
    })

    ptyProcess.onData((data: string) => {
      this.emit(`data:${args.sessionId}`, data)
    })

    ptyProcess.onExit(({ exitCode, signal }: { exitCode: number; signal?: number }) => {
      this.emit(`exit:${args.sessionId}`, { exitCode, signal })
      this.sessions.delete(args.sessionId)
    })

    this.sessions.set(args.sessionId, ptyProcess)
    return args.sessionId
  }

  write(sessionId: string, data: string): void {
    this.sessions.get(sessionId)?.write(data)
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.sessions.get(sessionId)?.resize(cols, rows)
  }

  destroy(sessionId: string): void {
    const p = this.sessions.get(sessionId)
    if (p) {
      try { p.kill() } catch {}
      this.sessions.delete(sessionId)
    }
  }

  destroyAll(): void {
    for (const id of this.sessions.keys()) {
      this.destroy(id)
    }
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }
}

export const ptyManager = new PtyManager()
