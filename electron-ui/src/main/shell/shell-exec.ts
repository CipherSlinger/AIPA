import { spawn, type ChildProcess } from 'child_process'

/**
 * A single command run started from a chat code block.
 *
 * This is deliberately not the PTY path: that one spawns Codex itself, so
 * writing a shell command into it never reached a shell. Here the command is
 * handed to the platform shell, its output is streamed back, and the process
 * tree is owned by this registry for the whole run.
 */

export const SHELL_OUTPUT_CAP = 64 * 1024
export const SHELL_EXEC_TIMEOUT_MS = 120_000
export const SHELL_COMMAND_MAX = 20_000

const RUN_ID_RE = /^[A-Za-z0-9_-]{1,128}$/

export type ShellStream = 'stdout' | 'stderr'

export type ShellExecFailureCode =
  | 'invalid_run_id'
  | 'invalid_command'
  | 'duplicate_run_id'
  | 'cwd_not_allowed'
  | 'cwd_missing'
  | 'spawn_failed'

export interface ShellExecStartArgs {
  runId: string
  command: string
  cwd: string
}

export interface ShellExecDataEvent {
  stream: ShellStream
  chunk: string
}

export interface ShellExecExitEvent {
  code: number | null
  signal: string | null
  /** Present when the process could not be spawned or the shell itself failed. */
  error?: string
  timedOut: boolean
  aborted: boolean
  /** True when the retained output tail dropped earlier bytes. */
  truncated: boolean
  /** The tail the main process kept, bounded by `SHELL_OUTPUT_CAP`. */
  outputTail: string
  timeoutMs: number
  durationMs: number
}

export type ShellExecStartResult =
  | { ok: true }
  | { ok: false; code: ShellExecFailureCode; error: string }

export interface ShellExecCallbacks {
  onData: (event: ShellExecDataEvent) => void
  onExit: (event: ShellExecExitEvent) => void
}

export interface ShellExecRegistry {
  start: (args: ShellExecStartArgs, callbacks: ShellExecCallbacks) => ShellExecStartResult
  /** Returns `found: false` for an unknown or already-finished run. */
  abort: (runId: string) => { found: boolean; aborted: boolean }
  activeCount: () => number
}

type SpawnFn = (file: string, args: string[], options: Record<string, unknown>) => ChildProcess
type KillTreeFn = (child: ChildProcess, signal: NodeJS.Signals) => void

interface Run {
  child: ChildProcess
  callbacks: ShellExecCallbacks
  output: string
  truncated: boolean
  aborted: boolean
  timedOut: boolean
  finished: boolean
  startedAt: number
  timeoutTimer: NodeJS.Timeout | null
  killGraceTimer: NodeJS.Timeout | null
  finishFallbackTimer: NodeJS.Timeout | null
}

/** Environment keys a shell may legitimately need; everything else is dropped. */
const SHELL_ENV_KEYS = new Set([
  // POSIX
  'PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL', 'LC_CTYPE',
  'TMPDIR', 'TERM', 'COLORTERM', 'TZ',
  // Windows
  'PATHEXT', 'COMSPEC', 'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR', 'TEMP', 'TMP',
  'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA',
  'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS', 'OS', 'COMPUTERNAME', 'USERNAME',
])

/**
 * Keep only variables a plain shell needs. Dropping everything else removes
 * API keys from the child environment and, more importantly, injection hooks
 * such as NODE_OPTIONS, LD_PRELOAD, DYLD_*, BASH_ENV and PROMPT_COMMAND.
 */
export function sanitizeShellEnv(
  env: NodeJS.ProcessEnv = process.env,
  _platform: NodeJS.Platform = process.platform,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue
    if (SHELL_ENV_KEYS.has(key.toUpperCase())) out[key] = value
  }
  return out
}

export interface ResolvedShell {
  file: string
  args: string[]
  windowsVerbatimArguments: boolean
}

/** Windows gets `cmd.exe /d /s /c`; everything else gets the user's `$SHELL -lc`. */
export function resolveShellCommand(
  command: string,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedShell {
  if (platform === 'win32') {
    return {
      file: env.ComSpec || env.COMSPEC || 'cmd.exe',
      // `cmd /s /c` wants the whole command body in one outer pair of quotes;
      // without it a command whose executable path contains a space (or whose
      // first token is quoted) is split at the space. Verbatim keeps that
      // quoting and the user's own quotes intact — Node's default escaping of
      // a `cmd /c` body turns nested quotes into literal backslashes.
      args: ['/d', '/s', '/c', `"${command}"`],
      windowsVerbatimArguments: true,
    }
  }
  return {
    file: env.SHELL || '/bin/sh',
    args: ['-lc', command],
    windowsVerbatimArguments: false,
  }
}

/**
 * Kill the process and everything it started. POSIX runs are spawned as their
 * own process-group leader (`detached`), so signalling `-pid` reaches children;
 * Windows uses `taskkill /t`.
 */
export function killProcessTree(
  child: ChildProcess,
  signal: NodeJS.Signals = 'SIGTERM',
  platform: NodeJS.Platform = process.platform,
  spawnFn: SpawnFn = spawn as unknown as SpawnFn,
): void {
  const pid = child.pid
  if (!pid) {
    try { child.kill(signal) } catch { /* already gone */ }
    return
  }
  if (platform === 'win32') {
    try {
      const killer = spawnFn('taskkill', ['/pid', String(pid), '/t', '/f'], {
        windowsHide: true,
        stdio: 'ignore',
      })
      killer.on('error', () => {
        try { child.kill() } catch { /* already gone */ }
      })
    } catch {
      try { child.kill() } catch { /* already gone */ }
    }
    return
  }
  try {
    process.kill(-pid, signal)
  } catch {
    try { child.kill(signal) } catch { /* already gone */ }
  }
}

export interface ShellExecRegistryOptions {
  spawnFn?: SpawnFn
  killTreeFn?: KillTreeFn
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
  cap?: number
}

export function isValidShellRunId(runId: unknown): runId is string {
  return typeof runId === 'string' && RUN_ID_RE.test(runId)
}

export function createShellExecRegistry(options: ShellExecRegistryOptions = {}): ShellExecRegistry {
  const spawnFn = options.spawnFn || (spawn as unknown as SpawnFn)
  const platform = options.platform || process.platform
  const env = options.env || process.env
  const timeoutMs = options.timeoutMs ?? SHELL_EXEC_TIMEOUT_MS
  const cap = options.cap ?? SHELL_OUTPUT_CAP
  const killTreeFn: KillTreeFn = options.killTreeFn
    || ((child, signal) => killProcessTree(child, signal, platform, spawnFn))
  const runs = new Map<string, Run>()

  const finish = (runId: string, run: Run, code: number | null, signal: string | null, error?: string) => {
    if (run.finished) return
    run.finished = true
    if (run.timeoutTimer) clearTimeout(run.timeoutTimer)
    if (run.killGraceTimer) clearTimeout(run.killGraceTimer)
    if (run.finishFallbackTimer) clearTimeout(run.finishFallbackTimer)
    runs.delete(runId)
    run.callbacks.onExit({
      code,
      signal,
      ...(error ? { error } : {}),
      timedOut: run.timedOut,
      aborted: run.aborted,
      truncated: run.truncated,
      outputTail: run.output,
      timeoutMs,
      durationMs: Date.now() - run.startedAt,
    })
  }

  /** SIGKILL the tree after a grace period and finalise even if `close` never fires. */
  const killAndGuard = (runId: string, run: Run) => {
    killTreeFn(run.child, 'SIGTERM')
    run.killGraceTimer = setTimeout(() => {
      if (!run.finished) killTreeFn(run.child, 'SIGKILL')
    }, 3000)
    run.finishFallbackTimer = setTimeout(() => {
      if (!run.finished) finish(runId, run, null, 'SIGKILL')
    }, 6000)
    for (const timer of [run.killGraceTimer, run.finishFallbackTimer]) {
      try { timer.unref?.() } catch { /* Node timers support unref; ignore elsewhere */ }
    }
  }

  return {
    start(args, callbacks) {
      if (!isValidShellRunId(args?.runId)) {
        return { ok: false, code: 'invalid_run_id', error: 'The run id is not a safe identifier.' }
      }
      const command = typeof args.command === 'string' ? args.command.trim() : ''
      if (!command) {
        return { ok: false, code: 'invalid_command', error: 'The command is empty.' }
      }
      if (command.length > SHELL_COMMAND_MAX) {
        return {
          ok: false,
          code: 'invalid_command',
          error: `The command is longer than ${SHELL_COMMAND_MAX.toLocaleString()} characters.`,
        }
      }
      if (runs.has(args.runId)) {
        return { ok: false, code: 'duplicate_run_id', error: 'That run id is already running.' }
      }

      const shell = resolveShellCommand(command, platform, env)
      let child: ChildProcess
      try {
        child = spawnFn(shell.file, shell.args, {
          cwd: args.cwd,
          env: sanitizeShellEnv(env, platform),
          windowsHide: true,
          windowsVerbatimArguments: shell.windowsVerbatimArguments,
          // POSIX: own process group so Stop can reach grandchildren.
          detached: platform !== 'win32',
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { ok: false, code: 'spawn_failed', error: message }
      }

      const run: Run = {
        child,
        callbacks,
        output: '',
        truncated: false,
        aborted: false,
        timedOut: false,
        finished: false,
        startedAt: Date.now(),
        timeoutTimer: null,
        killGraceTimer: null,
        finishFallbackTimer: null,
      }
      runs.set(args.runId, run)

      const record = (chunk: string) => {
        run.output += chunk
        if (run.output.length > cap) {
          run.output = run.output.slice(run.output.length - cap)
          run.truncated = true
        }
        return chunk
      }

      child.stdout?.setEncoding('utf8')
      child.stderr?.setEncoding('utf8')
      child.stdout?.on('data', (chunk: string) => {
        callbacks.onData({ stream: 'stdout', chunk: record(String(chunk)) })
      })
      child.stderr?.on('data', (chunk: string) => {
        callbacks.onData({ stream: 'stderr', chunk: record(String(chunk)) })
      })
      child.on('error', (err) => {
        // A spawn failure (ENOENT, EACCES) arrives here, not as a throw.
        finish(args.runId, run, null, null, err.message)
      })
      // `close` (not `exit`) so both pipes have drained before the final event.
      child.on('close', (code, signal) => {
        finish(args.runId, run, code, signal)
      })

      run.timeoutTimer = setTimeout(() => {
        if (run.finished) return
        run.timedOut = true
        killAndGuard(args.runId, run)
      }, timeoutMs)
      try { run.timeoutTimer.unref?.() } catch { /* ignore */ }

      return { ok: true }
    },

    abort(runId) {
      const run = typeof runId === 'string' ? runs.get(runId) : undefined
      if (!run) return { found: false, aborted: false }
      // Repeated aborts (Stop then unmount) should not schedule a second kill.
      if (run.aborted) return { found: true, aborted: true }
      // Once the deadline has fired the run is already being killed; let its
      // exit report the deadline rather than relabelling it as a user stop.
      if (run.timedOut) return { found: true, aborted: false }
      run.aborted = true
      if (run.timeoutTimer) {
        clearTimeout(run.timeoutTimer)
        run.timeoutTimer = null
      }
      killAndGuard(runId, run)
      return { found: true, aborted: true }
    },

    activeCount() {
      return runs.size
    },
  }
}
