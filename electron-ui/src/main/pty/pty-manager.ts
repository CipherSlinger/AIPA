import { EventEmitter } from 'events'
import path from 'path'
import os from 'os'
import { getCliPath, getNodePath } from '../utils/cli-path'
import { sanitizeEnv } from '../utils/cli-env'
import { createLogger } from '../utils/logger'

const log = createLogger('pty-manager')

// Lazy-load node-pty: the native .node binary may not exist on all platforms
// (requires electron-rebuild or platform-specific compilation)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pty: any = null
let ptyLoadError: string | null = null

try {
  pty = require('node-pty')
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  ptyLoadError = msg
  log.debug(`node-pty native module unavailable: ${msg}`)
}

// Lazy import electron.app to avoid circular deps
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _electronApp: any
try { _electronApp = require('electron').app } catch {}


export interface PtyCreateArgs {
  sessionId: string
  cwd: string
  env?: Record<string, string>
  cols: number
  rows: number
  resumeSessionId?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
class PtyManager extends EventEmitter {
  private sessions = new Map<string, any>()
  private nodePath: string | null = null

  /** Check if the native PTY module loaded successfully */
  isAvailable(): boolean {
    return pty !== null
  }

  /** Get the error message if PTY failed to load */
  getLoadError(): string | null {
    return ptyLoadError
  }

  private getNode(): string {
    if (!this.nodePath) this.nodePath = getNodePath()
    return this.nodePath
  }

  create(args: PtyCreateArgs): string {
    // Guard: if node-pty failed to load, throw a descriptive error
    if (!pty) {
      const hint = process.platform === 'win32'
        ? 'Run "npm run rebuild-pty" in the electron-ui folder (requires Visual Studio C++ Build Tools). ' +
          'Or run "npm install" which triggers electron-builder install-app-deps automatically.'
        : 'Run "npm run rebuild-pty" in the electron-ui folder to compile node-pty for your Electron version.'
      throw new Error(
        `PTY_NATIVE_UNAVAILABLE: The node-pty native module could not be loaded. ` +
        `This is required for the terminal panel. ${hint} ` +
        `Original error: ${ptyLoadError || 'unknown'}`
      )
    }

    const cliPath = getCliPath()
    const cliArgs = [
      cliPath,
      ...(args.resumeSessionId ? ['--resume', args.resumeSessionId] : []),
    ]

    const env: Record<string, string> = sanitizeEnv({
      ...(args.env || {}),
      TERM: 'xterm-256color',
      TERM_PROGRAM: 'claude-code-ui',
      CLAUDE_CONFIG_DIR: path.join(os.homedir(), '.claude'),
    })

    const nodePath = this.getNode()
    log.debug(`PTY spawning: node=${nodePath}, cli=${cliPath}, cwd=${args.cwd}`)

    try {
      const ptyProcess = pty.spawn(nodePath, cliArgs, {
        name: 'xterm-256color',
        cols: args.cols,
        rows: args.rows,
        cwd: args.cwd,
        env,
        useConpty: false,
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('File not found') || msg.includes('ENOENT')) {
        throw new Error(
          `Node.js executable not found at "${nodePath}". ` +
          `Please ensure Node.js is installed and available on your system PATH, ` +
          `or set the CLAUDE_NODE_PATH environment variable to the full path of node.exe.`
        )
      }
      throw err
    }
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
      try { p.kill() } catch (err) {
        log.debug('PTY kill failed (may already have exited):', String(err))
      }
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
