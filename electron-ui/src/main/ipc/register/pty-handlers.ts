import * as fs from 'fs'
import { type BrowserWindow } from 'electron'
import { createLogger } from '../../utils/logger'
import { getPref } from '../../config/config-manager'
import { getAllowedFsRoots, safePath } from '../../utils/validate'
import { ptyManager, normalizePtyDimensions, type PtyKind } from '../../pty/pty-manager'
import { fallbackShellManager } from '../../pty/fallback-shell'
import { resolveShellCommand } from '../../pty/shell-command'
import { safeHandle } from './safe-handle'
import type { SendFn } from './types'

const log = createLogger('ipc')

// ----------------------------------------
// PTY handlers
// ----------------------------------------
// Track which sessions are using the fallback shell (not real PTY)
const fallbackSessions = new Set<string>()

interface NormalizedPtyCreateArgs {
  sessionId: string
  cwd: string
  env?: Record<string, string>
  cols: number
  rows: number
  resumeSessionId?: string
  kind: PtyKind
}

/**
 * Resolve and validate the working directory a terminal asked for.
 *
 * This runs for both kinds (`codex` and `shell`): the renderer chooses the
 * folder, and every other renderer-supplied path in this app goes through the
 * same allowed-root check. A rejected folder is named and the call fails — it
 * is never quietly replaced with the home directory, because a shell that
 * silently opens somewhere else runs the user's next command in the wrong
 * place.
 */
function validatePtyCwd(rawCwd: unknown): string {
  if (typeof rawCwd !== 'string' || !rawCwd.trim()) {
    throw new Error('PTY_CWD_INVALID: The terminal did not name a working folder.')
  }
  let cwd: string
  try {
    cwd = safePath(rawCwd, getAllowedFsRoots(String(getPref('workingDir') || '')))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`PTY_CWD_REJECTED: ${message}`)
  }
  let stat: fs.Stats
  try {
    stat = fs.statSync(cwd)
  } catch {
    throw new Error(`PTY_CWD_MISSING: The folder does not exist: ${cwd}`)
  }
  if (!stat.isDirectory()) {
    throw new Error(`PTY_CWD_NOT_DIRECTORY: The path is not a folder: ${cwd}`)
  }
  return cwd
}

function normalizeCreateArgs(args: any): NormalizedPtyCreateArgs {
  const input = args && typeof args === 'object' ? args : {}
  if (input.kind !== undefined && input.kind !== 'codex' && input.kind !== 'shell') {
    throw new Error(`PTY_KIND_INVALID: Unknown terminal kind "${String(input.kind)}".`)
  }
  const kind: PtyKind = input.kind === 'shell' ? 'shell' : 'codex'
  const sessionId = typeof input.sessionId === 'string' ? input.sessionId.trim() : ''
  if (!sessionId) {
    throw new Error('PTY_ARGS_INVALID: The terminal did not name a session.')
  }
  const { cols, rows } = normalizePtyDimensions(input.cols, input.rows)
  return {
    sessionId,
    cwd: validatePtyCwd(input.cwd),
    ...(input.env && typeof input.env === 'object'
      ? { env: input.env as Record<string, string> }
      : {}),
    cols,
    rows,
    ...(typeof input.resumeSessionId === 'string' ? { resumeSessionId: input.resumeSessionId } : {}),
    kind,
  }
}

export function registerPtyHandlers(_win: BrowserWindow, send: SendFn): void {
  safeHandle('pty:create', (_e, rawArgs) => {
    // The working directory is validated before either spawning path, so a
    // rejected path can never be papered over by the fallback shell.
    const args = normalizeCreateArgs(rawArgs)
    const useFallback = !ptyManager.isAvailable()

    if (!useFallback) {
      // Normal PTY path -- try real PTY first, fall back to shell on failure
      try {
        const sessionId = ptyManager.create(args)

        const dataHandler = (data: string) => {
          send('pty:data', sessionId, data)
        }
        const exitHandler = (info: { exitCode: number; signal: string }) => {
          send('pty:exit', sessionId, info)
          ptyManager.removeListener(`data:${sessionId}`, dataHandler)
          ptyManager.removeListener(`exit:${sessionId}`, exitHandler)
        }

        ptyManager.on(`data:${sessionId}`, dataHandler)
        ptyManager.on(`exit:${sessionId}`, exitHandler)

        return {
          sessionId,
          fallback: false,
          kind: args.kind,
          shell: args.kind === 'shell' ? resolveShellCommand().label : 'codex',
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log.debug(`pty:create failed, falling back to basic shell: ${msg}`)
        // Fall through to fallback shell below
      }
    } else {
      log.debug(`pty:create using fallback shell (node-pty unavailable: ${ptyManager.getLoadError()})`)
    }

    // Fallback shell path (either node-pty unavailable or pty.spawn failed)
    try {
      const sessionId = fallbackShellManager.create(args)
      fallbackSessions.add(sessionId)

      const dataHandler = (data: string) => {
        send('pty:data', sessionId, data)
      }
      const exitHandler = (info: { exitCode: number; signal?: string }) => {
        send('pty:exit', sessionId, info)
        fallbackShellManager.removeListener(`data:${sessionId}`, dataHandler)
        fallbackShellManager.removeListener(`exit:${sessionId}`, exitHandler)
        fallbackSessions.delete(sessionId)
      }

      fallbackShellManager.on(`data:${sessionId}`, dataHandler)
      fallbackShellManager.on(`exit:${sessionId}`, exitHandler)

      // Send a notice to the renderer that this is fallback mode
      send('pty:data', sessionId,
        '\x1b[33m[Basic Mode] ' +
        'Terminal is running in basic mode (node-pty native module not available).\x1b[0m\r\n' +
        '\x1b[90mInteractive programs and colours will not work correctly in this mode.\r\n' +
        'To enable full terminal: run "npm run rebuild-pty" (requires C++ Build Tools on Windows).\x1b[0m\r\n\r\n'
      )

      return {
        sessionId,
        fallback: true,
        kind: args.kind,
        shell: resolveShellCommand().label,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.debug(`pty:create fallback failed: ${msg}`)
      throw new Error(`PTY_SPAWN_FAILED: ${msg}`)
    }
  })

  safeHandle('pty:write', (_e, { sessionId, data }: { sessionId?: unknown; data?: unknown }) => {
    if (typeof sessionId !== 'string' || typeof data !== 'string') return
    if (fallbackSessions.has(sessionId)) {
      fallbackShellManager.write(sessionId, data)
    } else {
      ptyManager.write(sessionId, data)
    }
  })

  safeHandle('pty:resize', (_e, { sessionId, cols, rows }: { sessionId?: unknown; cols?: unknown; rows?: unknown }) => {
    if (typeof sessionId !== 'string') return
    const sized = normalizePtyDimensions(cols, rows)
    if (fallbackSessions.has(sessionId)) {
      fallbackShellManager.resize(sessionId, sized.cols, sized.rows)
    } else {
      ptyManager.resize(sessionId, sized.cols, sized.rows)
    }
  })

  safeHandle('pty:destroy', (_e, sessionId: unknown) => {
    if (typeof sessionId !== 'string') return
    if (fallbackSessions.has(sessionId)) {
      fallbackShellManager.removeAllListeners(`data:${sessionId}`)
      fallbackShellManager.removeAllListeners(`exit:${sessionId}`)
      fallbackShellManager.destroy(sessionId)
      fallbackSessions.delete(sessionId)
    } else {
      ptyManager.removeAllListeners(`data:${sessionId}`)
      ptyManager.removeAllListeners(`exit:${sessionId}`)
      ptyManager.destroy(sessionId)
    }
  })
}
