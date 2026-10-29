import { EventEmitter } from 'events'
import { getCodexPath } from '../codex/codex-resolver'
import { sanitizeCodexEnv } from '../codex/codex-env'
import { resolveShellCommand } from './shell-command'
import { createLogger } from '../utils/logger'

const log = createLogger('pty-manager')

// Lazy-load node-pty: the native .node binary may not exist on all platforms
// (requires electron-rebuild or platform-specific compilation)
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
let _electronApp: any
try { _electronApp = require('electron').app } catch {}


/**
 * What a PTY should run.
 *
 * `codex` is the interactive engine panel that existed before this wave; it is
 * the default so every existing caller keeps its behaviour. `shell` is the
 * user-facing terminal: their own login shell, with their own environment.
 */
export type PtyKind = 'codex' | 'shell'

export interface PtyCreateArgs {
  sessionId: string
  cwd: string
  env?: Record<string, string>
  cols: number
  rows: number
  resumeSessionId?: string
  /** Defaults to `codex`. Validated by the IPC layer before it reaches here. */
  kind?: PtyKind
}

// The renderer's fit addon normally produces values in this range. A bogus
// payload must not be able to ask the native PTY layer for a 1,000,000-column
// screen, so both paths clamp instead of trusting `cols`/`rows`.
export const PTY_MIN_COLS = 10
export const PTY_MAX_COLS = 1000
export const PTY_MIN_ROWS = 2
export const PTY_MAX_ROWS = 400

export function clampPtyDimension(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

export function normalizePtyDimensions(cols: unknown, rows: unknown): { cols: number; rows: number } {
  return {
    cols: clampPtyDimension(cols, PTY_MIN_COLS, PTY_MAX_COLS, 80),
    rows: clampPtyDimension(rows, PTY_MIN_ROWS, PTY_MAX_ROWS, 24),
  }
}

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

    const kind: PtyKind = args.kind === 'shell' ? 'shell' : 'codex'
    const { cols, rows } = normalizePtyDimensions(args.cols, args.rows)

    let executable: string
    let executableArgs: string[]
    let env: Record<string, string>

    if (kind === 'shell') {
      const shell = resolveShellCommand()
      executable = shell.file
      executableArgs = shell.args
      // Deliberately NOT sanitizeCodexEnv here. The Codex allowlist exists to
      // keep an engine turn reproducible; a user's own terminal is the opposite
      // — it must see the environment they logged in with (their PATH, their
      // shell functions, their proxy/editor/toolchain variables). Filtering it
      // would make "the terminal" a different machine from the user's shell.
      env = {}
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) env[key] = value
      }
      Object.assign(env, args.env || {}, {
        TERM: args.env?.TERM || 'xterm-256color',
        TERM_PROGRAM: 'aipa-terminal',
      })
      log.debug(`PTY spawning shell: ${shell.file} ${shell.args.join(' ')}, cwd=${args.cwd}`)
    } else {
      const codexPath = getCodexPath()
      // Codex interactive mode — no additional args needed
      // (thread/resume is handled via app-server protocol, not CLI flags)
      executable = codexPath
      executableArgs = []
      env = sanitizeCodexEnv({
        ...(args.env || {}),
        TERM: 'xterm-256color',
        TERM_PROGRAM: 'aipa-codex-ui',
      })
      log.debug(`PTY spawning: codex=${codexPath}, cwd=${args.cwd}`)
    }

    try {
      const ptyProcess = pty.spawn(executable, executableArgs, {
        name: 'xterm-256color',
        cols,
        rows,
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
        if (kind === 'shell') {
          throw new Error(
            `PTY_SHELL_UNAVAILABLE: The shell "${executable}" could not be started. ` +
            `Check that it exists and is executable, or set SHELL (or COMSPEC on Windows) ` +
            `to a working shell.`
          )
        }
        throw new Error(
          `PTY_CODEX_UNAVAILABLE: Codex CLI executable not found at "${executable}". ` +
          `Please ensure Codex is installed (npm install -g @openai/codex) ` +
          `or set the CODEX_CLI_PATH environment variable to the full path.`
        )
      }
      throw new Error(`PTY_SPAWN_FAILED: ${msg}`)
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
