/**
 * The renderer half of one terminal PTY: create, forward input, resize, and —
 * exactly once — destroy plus unsubscribe.
 *
 * No React and no xterm live here, so the harness can drive the lifecycle with
 * a fake bridge. The hook owns the terminal widget; this module owns the
 * event-listener accounting.
 */

export interface PtyExitInfo {
  exitCode: number | null
  signal?: string
}

export interface PtyBridge {
  ptyCreate: (args: Record<string, unknown>) => Promise<unknown>
  ptyWrite: (args: Record<string, unknown>) => unknown
  ptyResize: (args: Record<string, unknown>) => unknown
  ptyDestroy: (sessionId: string) => unknown
  onPtyData: (sessionId: string, cb: (data: string) => void) => () => void
  onPtyExit: (sessionId: string, cb: (info: PtyExitInfo) => void) => () => void
}

export interface PtySessionArgs {
  sessionId: string
  cwd: string
  cols: number
  rows: number
  /** Only `shell` is used in this wave; the field is explicit on the wire. */
  kind?: 'codex' | 'shell'
  env?: Record<string, string>
}

export interface PtySessionReady {
  ptyId: string
  shell?: string
  fallback: boolean
}

export interface PtySessionHandlers {
  onData: (data: string) => void
  onExit: (info: PtyExitInfo) => void
  onReady: (ready: PtySessionReady) => void
  onFailure: (reason: string) => void
}

export interface PtySessionHandle {
  readonly ptyId: string
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  /** Idempotent: the first call unsubscribes and kills; later calls do nothing. */
  destroy: () => void
  /** Live listener count; 0 after destroy. Used by the harness. */
  listenerCount: () => number
}

/**
 * A request id that cannot collide with another tab or a previous mount.
 * Main echoes this back as the session id used on `pty:data` / `pty:exit`.
 */
export function createPtySessionId(
  tabId: string,
  now: number = Date.now(),
  random: number = Math.random(),
): string {
  const salt = Math.floor(random * 0xffffff).toString(36)
  return `${tabId}-${now.toString(36)}-${salt}`
}

export async function startPtySession(
  bridge: PtyBridge,
  args: PtySessionArgs,
  handlers: PtySessionHandlers,
): Promise<PtySessionHandle | null> {
  let response: any
  try {
    response = await bridge.ptyCreate({ ...args })
  } catch (err) {
    handlers.onFailure(err instanceof Error ? err.message : String(err))
    return null
  }

  const ptyId = typeof response?.sessionId === 'string' && response.sessionId
    ? response.sessionId
    : ''
  if (!ptyId) {
    handlers.onFailure('PTY_NO_SESSION: Main did not return a terminal session id.')
    return null
  }

  let destroyed = false
  let live = true
  let unsubscribeData: (() => void) | null = null
  let unsubscribeExit: (() => void) | null = null

  const handle: PtySessionHandle = {
    ptyId,
    write: (data) => {
      if (destroyed || !live) return
      try { bridge.ptyWrite({ sessionId: ptyId, data }) } catch { /* session already gone */ }
    },
    resize: (cols, rows) => {
      if (destroyed || !live) return
      try { bridge.ptyResize({ sessionId: ptyId, cols, rows }) } catch { /* session already gone */ }
    },
    destroy: () => {
      if (destroyed) return
      destroyed = true
      live = false
      if (unsubscribeData) { unsubscribeData(); unsubscribeData = null }
      if (unsubscribeExit) { unsubscribeExit(); unsubscribeExit = null }
      try { bridge.ptyDestroy(ptyId) } catch { /* best effort */ }
    },
    listenerCount: () => (unsubscribeData ? 1 : 0) + (unsubscribeExit ? 1 : 0),
  }

  // Subscribe before telling the hook the session is ready: a shell can print
  // its prompt immediately, and losing that first chunk would leave a blank
  // terminal with a cursor.
  unsubscribeData = bridge.onPtyData(ptyId, (data) => {
    if (!destroyed) handlers.onData(data)
  })
  unsubscribeExit = bridge.onPtyExit(ptyId, (info) => {
    if (destroyed) return
    live = false
    handlers.onExit(info)
  })

  handlers.onReady({
    ptyId,
    ...(typeof response.shell === 'string' ? { shell: response.shell } : {}),
    fallback: response.fallback === true,
  })
  return handle
}
