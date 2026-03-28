/**
 * Fallback shell implementation using child_process.spawn
 * Used when node-pty native module is unavailable (e.g., missing pty.node binary).
 *
 * This provides basic terminal functionality without full PTY emulation:
 * - Runs cmd.exe (Windows) or bash (Linux/macOS)
 * - Streams stdout/stderr to the renderer
 * - Accepts stdin from the renderer
 * - No true PTY features (no cursor positioning, no colors from interactive programs)
 *   but basic command execution works fine
 */
import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import os from 'os'
import { createLogger } from '../utils/logger'

const log = createLogger('fallback-shell')

export interface FallbackCreateArgs {
  sessionId: string
  cwd: string
  env?: Record<string, string>
  cols: number
  rows: number
}

class FallbackShellManager extends EventEmitter {
  private sessions = new Map<string, ChildProcess>()

  create(args: FallbackCreateArgs): string {
    const isWin = process.platform === 'win32'
    const shell = isWin ? 'cmd.exe' : (process.env.SHELL || '/bin/bash')
    const shellArgs = isWin ? [] : ['--login']

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...(args.env || {}),
      TERM: 'dumb',
      COLUMNS: String(args.cols || 80),
      LINES: String(args.rows || 24),
    }

    log.debug(`Fallback shell spawning: ${shell} in ${args.cwd}`)

    const proc = spawn(shell, shellArgs, {
      cwd: args.cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })

    proc.stdout?.on('data', (data: Buffer) => {
      // Convert Buffer to string and normalize line endings for xterm.js
      // First strip any existing \r to avoid double \r\r\n, then convert \n -> \r\n
      const text = data.toString().replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')
      this.emit(`data:${args.sessionId}`, text)
    })

    proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString().replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')
      this.emit(`data:${args.sessionId}`, text)
    })

    proc.on('exit', (code, signal) => {
      this.emit(`exit:${args.sessionId}`, {
        exitCode: code ?? -1,
        signal: signal ? String(signal) : undefined,
      })
      this.sessions.delete(args.sessionId)
    })

    proc.on('error', (err) => {
      log.debug(`Fallback shell error: ${err.message}`)
      this.emit(`data:${args.sessionId}`, `\r\n\x1b[31mShell error: ${err.message}\x1b[0m\r\n`)
      this.emit(`exit:${args.sessionId}`, { exitCode: -1 })
      this.sessions.delete(args.sessionId)
    })

    this.sessions.set(args.sessionId, proc)
    return args.sessionId
  }

  write(sessionId: string, data: string): void {
    const proc = this.sessions.get(sessionId)
    if (!proc || !proc.stdin) return

    // Local echo: since we're not using a real PTY, the terminal driver
    // won't echo typed characters back. We need to do it manually.
    let echo = ''
    for (const ch of data) {
      if (ch === '\r') {
        // Enter key: echo newline
        echo += '\r\n'
      } else if (ch === '\x7f' || ch === '\b') {
        // Backspace: move cursor back, overwrite with space, move back again
        echo += '\b \b'
      } else if (ch === '\x03') {
        // Ctrl+C: show ^C and newline
        echo += '^C\r\n'
      } else if (ch === '\x04') {
        // Ctrl+D: show ^D
        echo += '^D'
      } else if (ch.charCodeAt(0) >= 32) {
        // Printable characters: echo as-is
        echo += ch
      }
      // Other control characters (arrows, etc.) are not echoed
    }
    if (echo) {
      this.emit(`data:${sessionId}`, echo)
    }

    // Convert \r from xterm.js Enter key to \n for the child process
    const normalized = data.replace(/\r/g, os.EOL)
    try {
      proc.stdin.write(normalized)
    } catch (err) {
      log.debug(`Fallback shell write error: ${err}`)
    }
  }

  resize(sessionId: string, cols: number, rows: number): void {
    // child_process.spawn doesn't support resize, but we store the values
    // for any future use. Some shells respect COLUMNS/LINES env vars.
    const proc = this.sessions.get(sessionId)
    if (proc && proc.stdin) {
      // Send SIGWINCH equivalent on Unix (no-op on Windows)
      // For non-PTY processes, this has no effect but is harmless
    }
  }

  destroy(sessionId: string): void {
    const proc = this.sessions.get(sessionId)
    if (proc) {
      try {
        proc.kill()
      } catch (err) {
        log.debug(`Fallback shell kill failed: ${err}`)
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

export const fallbackShellManager = new FallbackShellManager()
