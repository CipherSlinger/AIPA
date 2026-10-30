import { useCallback, useEffect, useRef, useState } from 'react'
import { useT } from '../../i18n'
import { createShellOutputCollector, type ShellOutputCollector } from './shellOutput'
import { formatElapsed } from './runFollowThrough'

// Re-exported for existing callers; the implementation lives in the pure
// follow-through module so the composer draft can share the exact wording.
export { formatElapsed }

/**
 * State machine behind the Run button on a shell code block.
 *
 * One run at a time per block. `running` is only ever left in response to the
 * main process's exit event (or a failure to start), so the panel never claims
 * a command succeeded before the process ended.
 */

export type BlockRunStatus = 'idle' | 'running' | 'exited' | 'failed' | 'stopped'
export type BlockStopReason = 'user' | 'timeout'

export interface BlockRunState {
  status: BlockRunStatus
  runId: string | null
  output: string
  truncated: boolean
  droppedChars: number
  exitCode: number | null
  signal: string | null
  stoppedReason: BlockStopReason | null
  failureMessage: string | null
  /**
   * The invoke failure's code, kept beside the sentence. Only `shell:exec`
   * answering `ok: false` carries one; a failure reported later by the process
   * itself (spawn error, or an unknown thrown value) keeps `null`.
   */
  failureCode: string | null
  /**
   * The folder this attempt asked main to run in. Kept for the refusal that
   * names a folder, so a grant dialog can be seeded with it and the retry can
   * reuse it without consulting the current working-directory preference.
   */
  failureCwd: string | null
  /**
   * The folder this attempt asked main to run in. Recorded when the attempt
   * starts, so the panel can name the folder it used — an attempt run in
   * another folder must not be described with the working-directory
   * preference — and a refusal can point at the folder a retry will reuse.
   */
  cwd: string | null
  stopping: boolean
  startedAt: number | null
  finishedAt: number | null
  durationMs: number | null
  timeoutMs: number | null
  outputVisible: boolean
}

function initialState(): BlockRunState {
  return {
    status: 'idle',
    runId: null,
    output: '',
    truncated: false,
    droppedChars: 0,
    exitCode: null,
    signal: null,
    stoppedReason: null,
    failureMessage: null,
    failureCode: null,
    failureCwd: null,
    cwd: null,
    stopping: false,
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    timeoutMs: null,
    outputVisible: true,
  }
}

/** A run id the main process can validate: letters, digits, `_` and `-`. */
function createRunId(): string {
  const cryptoApi = typeof crypto !== 'undefined' ? crypto : undefined
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return `run-${cryptoApi.randomUUID()}`
  }
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

export interface BlockRunController {
  state: BlockRunState
  /** Milliseconds to show for a running block; frozen duration once finished. */
  elapsedMs: number
  start: (cwd: string | undefined) => Promise<void>
  stop: () => void
  toggleOutput: () => void
}

export function useBlockRun(command: string): BlockRunController {
  const t = useT()
  const [state, setState] = useState<BlockRunState>(initialState)
  const [now, setNow] = useState(() => Date.now())

  const activeRef = useRef(false)
  const runIdRef = useRef<string | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const collectorRef = useRef<ShellOutputCollector | null>(null)
  const mountedRef = useRef(true)
  // Bumped whenever a run starts or the block unmounts. An async start that
  // resolves into an older generation must not touch the current state.
  const generationRef = useRef(0)
  const finishedRef = useRef(false)
  const stopRequestedRef = useRef(false)

  const detach = useCallback(() => {
    const unsubscribe = unsubscribeRef.current
    unsubscribeRef.current = null
    if (unsubscribe) {
      try { unsubscribe() } catch { /* listener already gone */ }
    }
  }, [])

  const finishFromEvent = useCallback((
    event: {
      code: number | null
      signal: string | null
      error?: string
      timedOut: boolean
      aborted: boolean
      truncated: boolean
      outputTail: string
      timeoutMs: number
      durationMs: number
    },
  ) => {
    if (finishedRef.current) return
    finishedRef.current = true
    activeRef.current = false
    stopRequestedRef.current = false
    const runId = runIdRef.current
    runIdRef.current = null
    detach()

    let snap: ReturnType<ShellOutputCollector['flush']> | null = null
    try {
      snap = collectorRef.current?.flush() ?? null
    } catch {
      snap = null
    }
    const output = snap?.text ?? event.outputTail
    const truncated = Boolean(snap?.truncated || event.truncated)
    const droppedChars = snap?.droppedChars ?? 0

    const status: BlockRunStatus = event.error
      ? 'failed'
      : event.aborted
        ? 'stopped'
        : event.timedOut
          ? 'stopped'
          : 'exited'

    setState(previous => ({
      ...previous,
      status,
      runId,
      output,
      truncated,
      droppedChars,
      exitCode: event.code,
      signal: event.signal,
      stoppedReason: event.aborted ? 'user' : event.timedOut ? 'timeout' : null,
      failureMessage: event.error ?? null,
      // An exit is not an invoke refusal: there is no code and no folder to
      // grant, and this run did start.
      failureCode: null,
      failureCwd: null,
      stopping: false,
      finishedAt: Date.now(),
      durationMs: event.durationMs,
      timeoutMs: event.timeoutMs,
      outputVisible: previous.outputVisible,
    }))
  }, [detach])

  const failToStart = useCallback((
    message: string,
    code?: string | null,
    attemptedCwd?: string | null,
  ) => {
    if (finishedRef.current) return
    finishedRef.current = true
    activeRef.current = false
    stopRequestedRef.current = false
    runIdRef.current = null
    detach()
    const snap = collectorRef.current?.flush() ?? null
    const folder = typeof attemptedCwd === 'string' ? attemptedCwd.trim() : ''
    setState(previous => ({
      ...previous,
      status: 'failed',
      output: snap?.text ?? previous.output,
      truncated: Boolean(snap?.truncated),
      droppedChars: snap?.droppedChars ?? 0,
      failureMessage: message,
      // A blank folder is not a folder: an absent path stays null rather than
      // becoming the empty string a "grant this" button might mistake for one.
      failureCode: code ?? null,
      failureCwd: folder || null,
      stopping: false,
      finishedAt: Date.now(),
      durationMs: previous.startedAt ? Date.now() - previous.startedAt : null,
    }))
  }, [detach])

  const start = useCallback(async (cwd: string | undefined) => {
    if (activeRef.current) return
    const api = window.electronAPI
    if (!api) return

    const generation = ++generationRef.current
    activeRef.current = true
    finishedRef.current = false
    stopRequestedRef.current = false
    const runId = createRunId()
    runIdRef.current = runId
    collectorRef.current = createShellOutputCollector()
    // The folder this attempt asks for, recorded before the request leaves, so
    // the panel names the folder the attempt actually used rather than whatever
    // the preference says by the time the answer arrives.
    const folder = typeof cwd === 'string' ? cwd.trim() : ''
    setNow(Date.now())
    setState({
      ...initialState(),
      status: 'running',
      runId,
      cwd: folder || null,
      startedAt: Date.now(),
      outputVisible: true,
    })

    if (!cwd || !folder) {
      failToStart(t('codeAction.noWorkingDir'))
      return
    }

    // Subscribe before invoking. A command like `echo hi` can exit before the
    // invoke promise resolves, and those events must not be missed.
    unsubscribeRef.current = api.onShellExec(runId, (event) => {
      if (generation !== generationRef.current) return
      if (event.type === 'data') {
        const snapshot = collectorRef.current?.push(event.chunk)
        if (!snapshot) return
        setState(previous => previous.status === 'running'
          ? {
            ...previous,
            output: snapshot.text,
            truncated: snapshot.truncated,
            droppedChars: snapshot.droppedChars,
          }
          : previous)
        return
      }
      finishFromEvent({
        code: event.code,
        signal: event.signal,
        ...(event.error ? { error: event.error } : {}),
        timedOut: event.timedOut,
        aborted: event.aborted,
        truncated: event.truncated,
        outputTail: event.outputTail,
        timeoutMs: event.timeoutMs,
        durationMs: event.durationMs,
      })
    })

    let result: Awaited<ReturnType<typeof api.shellExec>>
    try {
      result = await api.shellExec({ runId, command: command.trim(), cwd })
    } catch (err) {
      if (generation !== generationRef.current || !mountedRef.current) return
      // A thrown invoke is not a refusal with a code; the folder is kept only
      // as the folder that attempt used, never as something to grant.
      failToStart(err instanceof Error ? err.message : String(err), null, cwd)
      return
    }
    if (generation !== generationRef.current) {
      // The block went away while the request was in flight. Nobody else can
      // stop this run, so ask main to kill it now.
      void api.shellAbort(runId).catch(() => { /* block is gone; best effort */ })
      return
    }
    if (!result.ok && !finishedRef.current) {
      // The one failure that carries a code: main refused the request before
      // any process existed, and the code plus the attempted folder are what a
      // grant button would need.
      failToStart(result.error, result.code, cwd)
      return
    }
    if (result.ok && stopRequestedRef.current) {
      // Stop was pressed while the start request was still in flight; that
      // first abort found no registered run. Ask again now that it exists.
      void api.shellAbort(runId).catch(() => { /* exit event still settles the state */ })
    }
  }, [command, failToStart, finishFromEvent, t])

  const stop = useCallback(() => {
    const runId = runIdRef.current
    if (!runId || !activeRef.current || stopRequestedRef.current) return
    stopRequestedRef.current = true
    setState(previous => previous.status === 'running' ? { ...previous, stopping: true } : previous)
    // The run becomes `stopped` when main reports the exit; nothing is claimed
    // here. Main answers `found: false` for an already-finished run, whose exit
    // event is on its way regardless.
    void window.electronAPI?.shellAbort(runId).catch(() => { /* exit event still settles the state */ })
  }, [])

  const toggleOutput = useCallback(() => {
    setState(previous => ({ ...previous, outputVisible: !previous.outputVisible }))
  }, [])

  // Elapsed time only ticks while the command is running; a finished run shows
  // the duration main measured rather than a clock that keeps growing.
  useEffect(() => {
    if (state.status !== 'running') return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [state.status])

  // Abort on unmount: collapsing the message, switching tabs, or replacing the
  // transcript must not leave a process writing into a dead listener.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      generationRef.current += 1
      activeRef.current = false
      stopRequestedRef.current = false
      const runId = runIdRef.current
      runIdRef.current = null
      detach()
      if (runId) {
        void window.electronAPI?.shellAbort(runId).catch(() => { /* app is tearing down */ })
      }
    }
  }, [detach])

  const elapsedMs = state.status === 'running' && state.startedAt !== null
    ? Math.max(0, now - state.startedAt)
    : state.durationMs ?? 0

  return { state, elapsedMs, start, stop, toggleOutput }
}
