// The ask-history turn: state, the private IPC call, and the three ways a turn
// can end (answer, Stop, unmount).
//
// The rules this hook exists to keep, each in one place:
//
//   - A turn owns a run token (`askRunRef`). Every settlement re-reads it, so a
//     reply for a turn the user has since replaced, stopped or dismissed is
//     dropped instead of painting under the newest question. The request id
//     (`requestIdRef`) does the same for streaming progress events, which the
//     main process sends out of band: an event carrying another turn's id is
//     never allowed to append text.
//   - Stop is a user decision, not an abort: it marks the turn stopped (token
//     bumped, request id forgotten, draft cleared, main-process slot freed) and
//     never lets that turn complete itself afterwards. It is not a failure, so
//     no toast is raised for a settlement the user asked for.
//   - A failed turn clears its draft and returns to the list, so a later query
//     cannot be answered by the previous question's partial text. A timeout is
//     just such a failure: the draft goes with it.
//   - Editing the query keeps the turn's question frozen (`askedQuestion`); the
//     reply is compared against the live input (`queryRef`) and discarded when
//     the input no longer holds the question, because showing it would attach
//     an answer to text the user has replaced.
//   - Closing the overlay is the user's Stop. An in-flight turn is aborted on
//     unmount, but a settled answer is never cancelled — that late abort could
//     discard a turn a newly opened overlay just started.
//
// The corpus decision is pure and lives in `askHistory.ts`; this hook only
// freezes its answer into `askedScope` for the receipt.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ListScope } from '../searchAskScope'
import type { DeptScopeSource } from '../searchDeptScan'
import {
  ASK_MIN_QUERY,
  askErrorKey,
  deriveAskScope,
  newAskRequestId,
  type AskedScope,
  type AskSource,
  type AskState,
} from './askHistory'

/** Optional abort, same reason: the preload typing may not expose it yet. */
type AskHistoryCancelApi = { sessionAskHistoryCancel?: () => void | Promise<void> }

/** Optional progress feed, also tolerated when the preload lags this build. */
type AskHistoryProgressApi = {
  onAskHistoryProgress?: (
    cb: (data: { requestId: string; text: string }) => void,
  ) => () => void
}

/** One earlier exchange, carried into the next question so pronouns resolve. */
export interface AskExchange {
  question: string
  answer: string
}

export interface UseAskHistoryOptions {
  query: string
  resolvedLocale: 'en' | 'zh-CN'
  /** Whether the ask reads the rows' corpus. */
  askScopeOn: boolean
  listScope: ListScope | null
  listAskIds: readonly string[] | null
  deptFilter: string | null
  deptFilterLabel: string
  deptScope: DeptScopeSource | null
  addToast: (type: 'error', message: string) => void
  t: (key: string, params?: Record<string, string | number>) => string
}

export function useAskHistory(options: UseAskHistoryOptions) {
  const {
    query,
    resolvedLocale,
    askScopeOn,
    listScope,
    listAskIds,
    deptFilter,
    deptFilterLabel,
    deptScope,
    addToast,
    t,
  } = options

  const [askAvailable, setAskAvailable] = useState(false)
  const [askState, setAskState] = useState<AskState>('idle')
  const [askAnswer, setAskAnswer] = useState('')
  // Cumulative answer text pushed while the private turn runs. It becomes the
  // visible body until the invoke resolves with the final answer.
  const [askDraft, setAskDraft] = useState('')
  const [copied, setCopied] = useState(false)
  const [askSources, setAskSources] = useState<AskSource[]>([])
  // The main process says an empty answer was answered before its transcript
  // index finished building, so the copy must not claim nothing matched.
  const [askIndexing, setAskIndexing] = useState(false)
  // The question the visible answer belongs to. The input stays editable, so
  // the citation click must reopen evidence for the query that produced it.
  const [askedQuestion, setAskedQuestion] = useState('')
  // The last successful exchange, sent with the next ask so "who decided
  // that?" resolves. It survives Stop (a re-ask keeps its context) and is
  // cleared only by the chip's × or by unmounting the overlay.
  const [lastExchange, setLastExchange] = useState<AskExchange | null>(null)
  // The scope the visible answer was actually asked with, captured when the
  // turn starts. The input stays editable and the toggle disappears with the
  // list, so the receipt and the empty-answer copy must not read live state.
  const [askedScope, setAskedScope] = useState<AskedScope | null>(null)

  // Set on the way out, whether through `close()` or a direct unmount. An
  // aborted turn still settles, and reporting that settlement would toast
  // "failed" for a turn the user deliberately stopped.
  const dismissedRef = useRef(false)
  const askRunRef = useRef(0)
  // Identifies the ask whose progress events are allowed to paint. A new ask
  // replaces it, so events from the previous turn can never leak in.
  const requestIdRef = useRef('')
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Latest input text, readable from a turn that was started several renders
  // ago. The callback's captured `query` is the question as it was asked, so
  // it cannot tell whether the user has edited since.
  const queryRef = useRef('')
  // Ask state readable from the unmount cleanup, which has no captured render.
  const askStateRef = useRef<AskState>('idle')

  useEffect(() => { queryRef.current = query }, [query])

  useEffect(() => { askStateRef.current = askState }, [askState])

  // Live answer text for the running ask. The optional call keeps an older
  // preload (no progress channel) from crashing the overlay.
  useEffect(() => {
    const api = window.electronAPI as (typeof window.electronAPI & AskHistoryProgressApi) | undefined
    let unsubscribe: (() => void) | undefined
    try {
      unsubscribe = api?.onAskHistoryProgress?.(data => {
        if (!data || data.requestId !== requestIdRef.current) return
        if (askStateRef.current !== 'running') return
        if (dismissedRef.current) return
        if (typeof data.text !== 'string') return
        setAskDraft(data.text)
      })
    } catch {
      // Progress is an enhancement; the final invoke result still lands.
    }
    return () => {
      try { unsubscribe?.() } catch { /* the overlay is going away */ }
    }
  }, [])

  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
  }, [])

  // Closing the overlay is the user's "stop". A turn that was still running
  // keeps a model call and the transcript readers' epoch alive behind a window
  // nobody can see, so abort it on the way out. Only an in-flight turn is
  // cancelled — once the answer has landed there is nothing left to abort, and
  // a late cancel could discard a turn a new overlay just started.
  useEffect(() => {
    // A StrictMode remount runs this cleanup once on the same instance; the
    // fresh mount must start undismissed.
    dismissedRef.current = false
    return () => {
      // Even when a parent unmounts the overlay without `close()`, the turn is
      // still the user's to stop and its late result must stay silent.
      dismissedRef.current = true
      if (askStateRef.current !== 'running') return
      const api = window.electronAPI as (typeof window.electronAPI & AskHistoryCancelApi) | undefined
      try {
        void api?.sessionAskHistoryCancel?.()
      } catch {
        // The overlay is going away; a failed abort has nowhere to report.
      }
    }
  }, [])

  // Cheap main-process check (no spawn). Without an authenticated engine the
  // entry point is not rendered at all — a hidden feature beats one that
  // always fails.
  useEffect(() => {
    let cancelled = false
    Promise.resolve(window.electronAPI?.sessionAskHistoryStatus?.())
      .then(result => {
        if (!cancelled) setAskAvailable(Boolean(result?.available))
      })
      .catch(() => { /* feature stays hidden */ })
    return () => { cancelled = true }
  }, [])

  /** Mark the turn's settlement as unwanted, without aborting anything. */
  const markDismissed = useCallback(() => {
    dismissedRef.current = true
  }, [])

  const runAsk = useCallback(async () => {
    const question = query.trim()
    if (!askAvailable || question.length < ASK_MIN_QUERY || askState === 'running') return

    const run = ++askRunRef.current
    // Freeze the scope of this turn before the network call: the result's
    // receipt and empty-answer copy must describe what was asked, not the
    // toggle's state after the user edited the query.
    const { scopeIds, scope: scopeForRun } = deriveAskScope({
      askScopeOn,
      listScope,
      listAskIds,
      deptFilter,
      deptScope,
      deptFilterLabel,
    })
    // Fresh id per ask: the main process echoes it on every progress event,
    // and anything carrying an older id is ignored by the listener.
    const requestId = newAskRequestId()
    requestIdRef.current = requestId
    setAskState('running')
    setAskAnswer('')
    setAskDraft('')
    setAskSources([])
    setAskIndexing(false)
    setCopied(false)
    setAskedQuestion(question)
    setAskedScope(scopeForRun)

    try {
      const api = window.electronAPI
      if (!api?.sessionAskHistory) throw new Error('sessionAskHistory unavailable')
      const result = await api.sessionAskHistory({
        question,
        locale: resolvedLocale,
        requestId,
        // The first ask sends nothing; every later one carries only the last
        // exchange, which is all the model needs to resolve a reference.
        history: lastExchange ? [lastExchange] : undefined,
        // Omitted means the whole history; an empty array is a deliberately
        // empty scope, which a department with no filed sessions — or a list
        // snapshot that the department filter leaves nothing of — really is.
        scopeSessionIds: scopeIds,
      })
      if (run !== askRunRef.current || dismissedRef.current) return
      if (queryRef.current.trim() !== question) {
        // The input no longer holds the question this turn was asked for.
        // Showing the answer would attach it to text the user has replaced.
        setAskState('idle')
        setAskDraft('')
        return
      }
      if (!result?.ok) {
        setAskState('idle')
        setAskDraft('')
        addToast('error', t(askErrorKey(result?.error)))
        return
      }
      const answer = result.answer || ''
      setAskAnswer(answer)
      setAskDraft('')
      setAskSources(result.sources || [])
      setAskIndexing(Boolean(result.indexing))
      setAskState('answer')
      // Remember the exchange only when there is an answer to continue from.
      if (answer) setLastExchange({ question, answer })
    } catch {
      if (run !== askRunRef.current || dismissedRef.current) return
      // Stay in the overlay with the query intact so the user can retry.
      setAskState('idle')
      setAskDraft('')
      addToast('error', t('askHistory.failed'))
    }
  }, [
    addToast,
    askAvailable,
    askScopeOn,
    askState,
    deptFilter,
    deptFilterLabel,
    deptScope,
    lastExchange,
    listAskIds,
    listScope,
    query,
    resolvedLocale,
    t,
  ])

  // Stop is a user decision, not an abort of the overlay: bump the run token
  // so the late invoke result is ignored, clear the partial text, and free the
  // main-process slot.
  const stopAsk = useCallback(() => {
    askRunRef.current += 1
    requestIdRef.current = ''
    setAskDraft('')
    setAskIndexing(false)
    setAskState('idle')
    const api = window.electronAPI as (typeof window.electronAPI & AskHistoryCancelApi) | undefined
    try {
      void api?.sessionAskHistoryCancel?.()
    } catch {
      // The turn may already have settled; nothing useful to report.
    }
  }, [])

  /** Leave the answer view for the list without touching the turn token. */
  const dropAnswer = useCallback(() => {
    setAskState('idle')
    setAskIndexing(false)
  }, [])

  const clearLastExchange = useCallback(() => setLastExchange(null), [])

  // Copy the answer verbatim, citations included — they mean something.
  const copyAnswer = useCallback(() => {
    const textToCopy = askAnswer
    if (!textToCopy) return
    const done = () => {
      setCopied(true)
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setCopied(false), 1500)
    }
    const fallback = () => {
      try {
        const area = document.createElement('textarea')
        area.value = textToCopy
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(area)
        if (ok) done()
        else addToast('error', t('askHistory.copyFailed'))
      } catch {
        addToast('error', t('askHistory.copyFailed'))
      }
    }
    try {
      void navigator.clipboard.writeText(textToCopy).then(done).catch(fallback)
    } catch {
      fallback()
    }
  }, [addToast, askAnswer, t])

  return {
    askAvailable,
    askState,
    askAnswer,
    askDraft,
    askSources,
    askIndexing,
    askedQuestion,
    askedScope,
    lastExchange,
    copied,
    runAsk,
    stopAsk,
    dropAnswer,
    clearLastExchange,
    copyAnswer,
    markDismissed,
  }
}
