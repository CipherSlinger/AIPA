/**
 * Owns the one in-chat "ask your history" run.
 *
 * The run is deliberately not component state. `MessageList` is virtualised, so
 * a row can unmount while its answer is still streaming; and tab switching
 * moves the message array into a snapshot. A module-level run keeps the single
 * progress subscription alive exactly as long as the IPC call, updates the row
 * wherever it is currently rendered, and cancels (freeing the main process's
 * one-ask slot) when the row is no longer reachable from any transcript.
 *
 * Retrieval is `session:askHistory` — the same path the search overlay uses. The
 * question never goes to this conversation's engine thread, and the row is only
 * an in-memory system message.
 */
import { useSyncExternalStore } from 'react'
import { useChatStore } from '../../store'
import type { ChatMessage, HistoryAskNotice } from '../../types/app.types'
import { applyAskOutcome, classifyAskResult, validateAskQuestion } from './historyAskState'

interface ActiveRun {
  messageId: string
  requestId: string
  sessionId: string | null
  unsubscribeProgress: (() => void) | null
  unsubscribeStore: (() => void) | null
  cancelling: boolean
}

let active: ActiveRun | null = null

/**
 * Live notices keyed by row id. Settled entries are kept so a row restored from
 * a tab snapshot can show its final outcome instead of staying "reading".
 */
const notices = new Map<string, HistoryAskNotice>()
const MAX_NOTICES = 24

const listeners = new Set<() => void>()
let version = 0

function emit(): void {
  version += 1
  for (const listener of listeners) {
    try { listener() } catch { /* a dead subscriber must not stop the others */ }
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function trimNotices(): void {
  if (notices.size <= MAX_NOTICES) return
  for (const key of notices.keys()) {
    if (notices.size <= MAX_NOTICES) break
    if (active?.messageId === key) continue
    notices.delete(key)
  }
}

/** Update the authoritative copy and the transcript row that shows it. */
function storeNotice(messageId: string, notice: HistoryAskNotice): void {
  notices.set(messageId, notice)
  trimNotices()
  useChatStore.getState().updateHistoryAsk(messageId, notice)
  emit()
}

function patchNotice(messageId: string, patch: Partial<HistoryAskNotice>): void {
  const current = notices.get(messageId)
  if (!current) return
  storeNotice(messageId, { ...current, ...patch })
}

export function getLiveHistoryAskNotice(messageId: string): HistoryAskNotice | null {
  return notices.get(messageId) ?? null
}

export function useLiveHistoryAskNotice(messageId: string): HistoryAskNotice | null {
  useSyncExternalStore(subscribe, () => version)
  return notices.get(messageId) ?? null
}

export function isHistoryAskRunning(): boolean {
  return active !== null
}

/**
 * Re-renders the toolbar button only when the app-wide ask slot changes hands.
 * The snapshot is the boolean, not the store version: progress patches change
 * the version many times a second and the button has nothing to say about them.
 */
export function useHistoryAskRunning(): boolean {
  return useSyncExternalStore(subscribe, () => active !== null, () => false)
}

function isRowReachable(messageId: string): boolean {
  const state = useChatStore.getState()
  const find = (messages: ChatMessage[]) => messages.some(message => message.id === messageId)
  if (find(state.messages)) return true
  return state.tabs.some(tab => (tab.snapshot ? find(tab.snapshot.messages) : false))
}

function cleanup(run: ActiveRun): void {
  try { run.unsubscribeProgress?.() } catch { /* the preload may be gone */ }
  try { run.unsubscribeStore?.() } catch { /* already unsubscribed */ }
  run.unsubscribeProgress = null
  run.unsubscribeStore = null
  if (active === run) active = null
  emit()
}

/**
 * Stop the run. The streamed draft is kept and the row is marked stopped: an
 * aborted ask never becomes a complete answer.
 */
function cancelRun(run: ActiveRun, notifyMain: boolean): void {
  if (active !== run || run.cancelling) return
  run.cancelling = true
  const current = notices.get(run.messageId)
  if (current && current.status === 'running') {
    storeNotice(run.messageId, { ...current, status: 'stopped', stopped: true })
  }
  cleanup(run)
  if (notifyMain) {
    try {
      void window.electronAPI?.sessionAskHistoryCancel?.()
    } catch {
      // The turn may already have settled; there is nothing left to report.
    }
  }
}

/** Settle the row from the IPC result. Only the run that still owns the slot may. */
function settle(run: ActiveRun, result: unknown): void {
  if (active !== run) return
  const current = notices.get(run.messageId)
  if (current) storeNotice(run.messageId, applyAskOutcome(current, classifyAskResult(result)))
  cleanup(run)
}

export type StartHistoryAskResult =
  | { ok: true; messageId: string }
  | { ok: false; code: 'running' | 'invalid' | 'unavailable' }

/**
 * Start one ask. Refuses locally when this renderer already has one running;
 * an ask owned by the search overlay is refused by the main process and the
 * row says so (`busy`), which is the same message either way.
 */
export function startHistoryAsk(opts: {
  question: string
  locale: 'en' | 'zh-CN'
  sessionId: string | null
}): StartHistoryAskResult {
  if (active) return { ok: false, code: 'running' }
  const check = validateAskQuestion(opts.question)
  if (!check.ok) return { ok: false, code: 'invalid' }
  const api = window.electronAPI
  if (!api?.sessionAskHistory) return { ok: false, code: 'unavailable' }

  const stamp = Date.now()
  const messageId = `history-ask-${stamp}-${Math.random().toString(36).slice(2, 8)}`
  const requestId = `chat-ask-${stamp}-${Math.random().toString(36).slice(2, 10)}`
  const notice: HistoryAskNotice = {
    question: check.question,
    answer: '',
    sources: [],
    status: 'running',
    indexing: false,
    stopped: false,
  }

  useChatStore.getState().addMessage({
    id: messageId,
    role: 'system',
    content: '',
    timestamp: stamp,
    historyAsk: notice,
  })
  notices.set(messageId, notice)
  trimNotices()

  const run: ActiveRun = {
    messageId,
    requestId,
    sessionId: opts.sessionId,
    unsubscribeProgress: null,
    unsubscribeStore: null,
    cancelling: false,
  }
  active = run
  emit()

  try {
    run.unsubscribeProgress = api.onAskHistoryProgress?.(data => {
      if (active !== run || run.cancelling) return
      if (!data || data.requestId !== requestId) return
      if (typeof data.text !== 'string') return
      // Cumulative text from the main process; this is only a guard against a
      // runaway generation, not a second cap on the answer.
      patchNotice(messageId, { answer: data.text.slice(0, 12_000) })
    }) ?? null
  } catch {
    // Progress is an enhancement; the final invoke result still lands.
    run.unsubscribeProgress = null
  }

  run.unsubscribeStore = useChatStore.subscribe((state, prev) => {
    if (active !== run) return
    // Only message/tab changes can move the row; token flushes elsewhere do not
    // need this scan.
    if (state.messages === prev.messages && state.tabs === prev.tabs) return
    if (isRowReachable(messageId)) return
    // The conversation (or tab) that owned the row is gone. Keeping the ask
    // alive would hold the app-wide slot behind a transcript nobody can see.
    cancelRun(run, true)
  })

  void (async () => {
    try {
      const result = await api.sessionAskHistory({
        question: check.question,
        locale: opts.locale,
        requestId,
      })
      settle(run, result)
    } catch {
      settle(run, { ok: false, error: 'failed' })
    }
  })()

  return { ok: true, messageId }
}

/**
 * The row's Stop action. A row restored from a snapshot can outlive its run;
 * it has no process left to abort, but it must stop claiming to be reading.
 */
export function stopHistoryAsk(messageId?: string): void {
  if (active && (!messageId || active.messageId === messageId)) {
    cancelRun(active, true)
    return
  }
  if (!messageId) return
  const current = notices.get(messageId)
  if (current && current.status === 'running') {
    storeNotice(messageId, { ...current, status: 'stopped', stopped: true })
  }
}
