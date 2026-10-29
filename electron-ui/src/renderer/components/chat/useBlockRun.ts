import { useCallback, useEffect, useRef, useState } from 'react'
import { useT } from '../../i18n'
import { createShellOutputCollector, type ShellOutputCollector } from './shellOutput'

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

/** `3s`, `1m 05s` — short enough for the status row. */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0
    ? `${minutes}m ${String(seconds).padStart(2, '0')}s`
    : `${seconds}s`
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
      stopping: false,
      finishedAt: Date.now(),
      durationMs: event.durationMs,
      timeoutMs: event.timeoutMs,
      outputVisible: previous.outputVisible,
    }))
  }, [detach])

  const failToStart = useCallback((message: string) => {
    if (finishedRef.current) return
    finishedRef.current = true
    activeRef.current = false
    stopRequestedRef.current = false
    runIdRef.current = null
    detach()
    const snap = collectorRef.current?.flush() ?? null
    setState(previous => ({
      ...previous,
      status: 'failed',
      output: snap?.text ?? previous.output,
      truncated: Boolean(snap?.truncated),
      droppedChars: snap?.droppedChars ?? 0,
      failureMessage: message,
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
    setNow(Date.now())
    setState({
      ...initialState(),
      status: 'running',
      runId,
      startedAt: Date.now(),
      outputVisible: true,
    })

    if (!cwd || !cwd.trim()) {
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
      failToStart(err instanceof Error ? err.message : String(err))
      return
    }
    if (generation !== generationRef.current) {
      // The block went away while the request was in flight. Nobody else can
      // stop this run, so ask main to kill it now.
      void api.shellAbort(runId).catch(() => { /* block is gone; best effort */ })
      return
    }
    if (!result.ok && !finishedRef.current) {
      failToStart(result.error)
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
