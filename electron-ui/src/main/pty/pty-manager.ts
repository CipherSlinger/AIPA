import { EventEmitter } from 'events'
import { getCodexPath } from '../codex/codex-resolver'
import { sanitizeCodexEnv } from '../codex/codex-env'
import { createLogger } from '../utils/logger'

const log = createLogger('pty-manager')

// Lazy-load node-pty: the native .node binary may not exist on all platforms
// (requires electron-rebuild or platform-specific compilation)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pty: any = null
let ptyLoadError: string | null = null

try {
  // Temporarily suppress stderr to prevent Node.js module loader from
  // printing noisy "Cannot find module '../build/Debug/pty.node'" stack traces
  // to the console where the user launched Electron. The error is expected
  // on systems without the compiled native binary (e.g., Windows without
  // Visual Studio C++ Build Tools). We catch and handle it gracefully below.
  const origStderrWrite = process.stderr.write
  process.stderr.write = (() => true) as typeof process.stderr.write
  try {
    pty = require('node-pty')
  } finally {
    process.stderr.write = origStderrWrite
  }
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

  /** Check if the native PTY module loaded successfully */
  isAvailable(): boolean {
    return pty !== null
  }

  /** Get the error message if PTY failed to load */
  getLoadError(): string | null {
    return ptyLoadError
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

    const codexPath = getCodexPath()
    // Codex interactive mode — no additional args needed
    // (thread/resume is handled via app-server protocol, not CLI flags)
    const codexArgs: string[] = []

    const env: Record<string, string> = sanitizeCodexEnv({
      ...(args.env || {}),
      TERM: 'xterm-256color',
      TERM_PROGRAM: 'aipa-codex-ui',
    })

    log.debug(`PTY spawning: codex=${codexPath}, cwd=${args.cwd}`)

    try {
      const ptyProcess = pty.spawn(codexPath, codexArgs, {
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
          `Codex CLI executable not found at "${codexPath}". ` +
          `Please ensure Codex is installed (npm install -g @openai/codex) ` +
          `or set the CODEX_CLI_PATH environment variable to the full path.`
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
