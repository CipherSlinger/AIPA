// Global cross-session search.
//
// Mounted from App, not from ChatPanel: the shortcut works from every view,
// and the overlay must survive the view switch that opening a hit causes.
// Rows are grouped by project in the order the main process returned them
// (newest first), so the first group is always the most recently active work.
//
// The same overlay hosts "Ask AIPA about your history": Ctrl+Enter (or the
// pinned first row) sends the typed question to the main process, which
// retrieves local transcripts and runs one private, ephemeral turn. The answer
// replaces the list, and its [n] markers open the cited session at the exact
// message the answer was built from.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, Loader2, Search, Sparkles, X } from 'lucide-react'
import type { AskHistorySourceData, SessionSearchResultData } from '../../../preload/index'
import { useI18n, useT } from '../../i18n'
import { useSessionStore, useUiStore } from '../../store'
import { pushEscapeHandler } from '../ui/escapeStack'
import { useGlobalSessionSearch } from './useGlobalSessionSearch'
import { SearchResultRow, relativeTime } from './SearchResultRow'
import { revealSessionEvidence } from './revealSessionEvidence'
import { parseAnswerCitations } from './answerCitations'
import {
  SEARCH_ORIGIN_FILTERS,
  buildSessionOriginMap,
  filterResultsByOrigin,
  isOriginFilterEmpty,
  originFilterForQuery,
  searchResultOrigin,
  type SearchOriginFilter,
} from './searchOriginFilter'

/**
 * Every ask source records the term it matched on, so a citation click can mark
 * that text instead of the whole question. The preload typing may lag the main
 * process change, so the field is carried here until `AskHistorySourceData`
 * declares it (then the intersection degrades to the declared type).
 */
type AskSource = AskHistorySourceData & { matchedTerm?: string }

/** Optional abort, same reason: the preload typing may not expose it yet. */
type AskHistoryCancelApi = { sessionAskHistoryCancel?: () => void | Promise<void> }

/** Optional progress feed, also tolerated when the preload lags this build. */
type AskHistoryProgressApi = {
  onAskHistoryProgress?: (
    cb: (data: { requestId: string; text: string }) => void,
  ) => () => void
}

// Streaming answers blink a caret at the end. Injected once, module-wide, so
// every overlay mount can reuse it.
;(function ensureAskCaretKeyframes() {
  if (typeof document === 'undefined') return
  if (document.getElementById('ask-history-kf')) return
  const style = document.createElement('style')
  style.id = 'ask-history-kf'
  style.textContent = '@keyframes ask-caret-blink { 0%, 49% { opacity: 1 } 50%, 100% { opacity: 0 } }'
  document.head.appendChild(style)
})()

function projectLabel(project: string, fallback: string): string {
  if (!project) return fallback
  const parts = project.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || project
}

type AskState = 'idle' | 'running' | 'answer'

/** Minimum query length worth an LLM turn — same threshold as the pinned row. */
const ASK_MIN_QUERY = 4

const GHOST_BUTTON_STYLE: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: 11,
  padding: '3px 10px',
  fontFamily: 'inherit',
}

/**
 * Compact origin pills. The overlay is narrow and already has a query bar, a
 * hint row and a footer, so this row wraps at most once and never shrinks the
 * input or the result list.
 */
const ORIGIN_ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 6,
  padding: '6px 16px',
  borderBottom: '1px solid var(--border)',
  flexShrink: 0,
}

const ORIGIN_PILL_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 9px',
  borderRadius: 999,
  fontSize: 11,
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text-muted)',
  transition: 'all 0.15s ease',
}

/**
 * A plain Enter on a focused pill activates the pill; without this it also
 * bubbles to the dialog and opens the highlighted hit. Ctrl/Cmd+Enter still
 * reaches the dialog's ask shortcut.
 */
function stopPillActivation(e: React.KeyboardEvent) {
  if ((e.key === 'Enter' && !e.ctrlKey && !e.metaKey) || e.key === ' ') e.stopPropagation()
}

const FOLLOW_UP_ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '5px 16px',
  borderBottom: '1px solid var(--border)',
  flexShrink: 0,
}

const FOLLOW_UP_CHIP_STYLE: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 11,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
}

const CHIP_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0 4px',
  margin: '0 1px',
  borderRadius: 4,
  border: '1px solid rgba(99,102,241,0.35)',
  background: 'rgba(99,102,241,0.18)',
  color: 'var(--accent-text)',
  fontSize: 11,
  fontWeight: 600,
  lineHeight: 1.5,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontVariantNumeric: 'tabular-nums',
}

/**
 * Render the answer with its `[n]` markers as chips. Only markers that point
 * at a real source become buttons; an out-of-range number stays literal text
 * rather than offering an action that cannot work.
 */
function AnswerBody({
  answer,
  sources,
  onCite,
}: {
  answer: string
  sources: AskSource[]
  onCite: (n: number, source: AskSource) => void
}) {
  const t = useT()
  const nodes = useMemo(() => {
    const out: React.ReactNode[] = []
    // Shared with the in-chat history row: a number that does not map to a
    // returned source must stay literal text in both places.
    for (const segment of parseAnswerCitations(answer, sources.length)) {
      if (segment.kind === 'text') {
        out.push(segment.text)
        continue
      }
      const source = sources[segment.sourceIndex]
      if (!source) {
        out.push(segment.raw)
        continue
      }
      out.push(
        <button
          key={`cite-${segment.start}`}
          type="button"
          onClick={() => onCite(segment.n, source)}
          aria-label={t('askHistory.citeLabel', {
            n: segment.n,
            title: source.title || t('askHistory.untitled'),
          })}
          style={CHIP_STYLE}
        >
          [{segment.n}]
        </button>,
      )
    }
    return out
  }, [answer, sources, onCite, t])

  return (
    <div style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
      {nodes}
    </div>
  )
}

export default function GlobalSearchOverlay() {
  const t = useT()
  const { resolvedLocale } = useI18n()
  const addToast = useUiStore(s => s.addToast)
  const setOpen = useUiStore(s => s.setGlobalSearchOpen)
  // The command palette can hand a typed question to the next overlay mount.
  // Read it once here (the state initializer runs on mount only) so typing
  // remains fully controlled afterwards.
  const [query, setQuery] = useState(() => useUiStore.getState().globalSearchSeed || '')
  const [active, setActive] = useState(0)
  // Which origin kind the current result set is narrowed to. It is a client
  // view over the rows already returned — never a new search.
  const [originFilter, setOriginFilter] = useState<SearchOriginFilter>('all')
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
  const [lastExchange, setLastExchange] = useState<{ question: string; answer: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const openingRef = useRef(false)
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
  // Retrieval inside the ask owns the readers' search epochs; a keystroke that
  // starts another scan would cancel it and empty the digest.
  //
  // The list is hidden for the whole answer view, not just while the turn
  // runs. Gating on `!== 'running'` flipped back on the moment the answer
  // arrived, firing a full-corpus scan nobody could see. Only an idle overlay
  // searches: editing the query (which stops a running turn or drops a stale
  // answer) or a later open resumes it.
  const { results, status, searchedQuery } = useGlobalSessionSearch(query, askState === 'idle')

  // Search hits carry no origin of their own; the session listing does. A hit
  // that is not listed stays unknown and shows no badge.
  const sessions = useSessionStore(s => s.sessions)
  const originMap = useMemo(() => buildSessionOriginMap(sessions), [sessions])
  const filtered = useMemo(
    () => filterResultsByOrigin(results, originMap, originFilter),
    [results, originMap, originFilter],
  )

  const close = useCallback(() => {
    dismissedRef.current = true
    setOpen(false)
  }, [setOpen])

  // Put the caret at the end of the question, selecting nothing. Used by both
  // the follow-up chip and the answer card's "Follow up" action, so the user
  // can extend the question instead of retyping it.
  const focusComposer = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    const end = el.value.length
    try {
      el.setSelectionRange(end, end)
    } catch {
      // Some input types refuse selection ranges; focus alone is enough.
    }
  }, [])

  useEffect(() => {
    inputRef.current?.focus()
    return pushEscapeHandler(close)
  }, [close])

  useEffect(() => { queryRef.current = query }, [query])

  useEffect(() => { askStateRef.current = askState }, [askState])

  // The seed is one-shot: consume it on mount so closing and reopening the
  // overlay does not bring the palette's old question back.
  useEffect(() => {
    const store = useUiStore.getState()
    if (store.globalSearchSeed) store.setGlobalSearchSeed('')
  }, [])

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

  const groups = useMemo(() => {
    const map = new Map<string, SessionSearchResultData[]>()
    for (const hit of filtered.visible) {
      const key = hit.project || ''
      const bucket = map.get(key)
      if (bucket) bucket.push(hit)
      else map.set(key, [hit])
    }
    return [...map.entries()].map(([project, items]) => ({ project, items }))
  }, [filtered])

  const flat = useMemo(() => groups.flatMap(group => group.items), [groups])

  // A new result set — or a different origin narrowing — starts at the best
  // visible hit. A session-list refresh alone must not move the selection.
  useEffect(() => { setActive(0) }, [results, originFilter])
  useEffect(() => {
    if (active >= flat.length) setActive(Math.max(0, flat.length - 1))
  }, [flat.length, active])
  // The list scrolls inside a fixed-height box; keyboard navigation must keep
  // the selected row visible without moving the focused input.
  useEffect(() => {
    document.getElementById(`global-search-row-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const openHit = useCallback(async (hit: SessionSearchResultData) => {
    if (openingRef.current) return
    openingRef.current = true
    const searched = query.trim()
    close()
    const ok = await revealSessionEvidence(hit, searched)
    openingRef.current = false
    if (!ok) addToast('error', t('globalSearch.openFailed'))
  }, [addToast, close, query, t])

  const runAsk = useCallback(async () => {
    const question = query.trim()
    if (!askAvailable || question.length < ASK_MIN_QUERY || askState === 'running') return

    const run = ++askRunRef.current
    // Fresh id per ask: the main process echoes it on every progress event,
    // and anything carrying an older id is ignored by the listener.
    const requestId = `ask-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    requestIdRef.current = requestId
    setAskState('running')
    setAskAnswer('')
    setAskDraft('')
    setAskSources([])
    setAskIndexing(false)
    setCopied(false)
    setAskedQuestion(question)

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
        if (result?.error === 'busy') addToast('error', t('askHistory.busy'))
        else if (result?.error === 'timeout') addToast('error', t('askHistory.timeout'))
        else if (result?.error === 'empty_response') addToast('error', t('askHistory.empty'))
        else addToast('error', t('askHistory.failed'))
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
  }, [addToast, askAvailable, askState, lastExchange, query, resolvedLocale, t])

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

  const openCitation = useCallback(async (source: AskSource) => {
    if (openingRef.current) return
    openingRef.current = true
    close()
    // Highlight the term this source was retrieved for. Passing the question
    // made the opened message flash without marking anything, because the
    // question as typed is never the text stored in the transcript.
    const ok = await revealSessionEvidence(source, source.matchedTerm || askedQuestion)
    openingRef.current = false
    if (!ok) addToast('error', t('globalSearch.openFailed'))
  }, [addToast, askedQuestion, close, t])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      void runAsk()
      return
    }
    // While an ask is running or its answer is showing, the result rows are
    // not visible; only Escape applies. The answer's citation chips are real
    // buttons in the tab order.
    if (askState !== 'idle') {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        close()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      if (flat.length === 0) return
      e.preventDefault()
      setActive(prev => (prev + 1) % flat.length)
    } else if (e.key === 'ArrowUp') {
      if (flat.length === 0) return
      e.preventDefault()
      setActive(prev => (prev - 1 + flat.length) % flat.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const hit = flat[active]
      if (hit) void openHit(hit)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  }

  const trimmed = query.trim()
  const showIdle = trimmed.length < 2
  const showLoading = status === 'loading' && trimmed.length >= 2
  const showEmpty = status === 'ready' && results.length === 0 && searchedQuery.length >= 2
  // The search found matches but the origin filter is hiding all of them. The
  // copy must name the filter, not pretend the query had no results.
  const showFilterEmpty = status === 'ready'
    && isOriginFilterEmpty(results.length, filtered.visible.length, originFilter)
  const showAskEntry = askState === 'idle' && askAvailable && trimmed.length >= ASK_MIN_QUERY

  return (
    <div
      onClick={close}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'var(--glass-overlay)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        animation: 'gsearch-fade 0.15s ease',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('globalSearch.title')}
        onClick={e => e.stopPropagation()}
        onKeyDown={onKeyDown}
        style={{
          position: 'fixed',
          top: '12%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 700,
          maxWidth: '92vw',
          maxHeight: '72vh',
          background: 'var(--popup-bg)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          boxShadow: 'var(--dialog-shadow)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'gsearch-slide 0.18s ease',
        }}
      >
        {/* Query */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexShrink: 0,
          }}
        >
          <Search size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            data-global-search-input
            value={query}
            onChange={e => {
              setQuery(e.target.value)
              // A changed query has a different result set, so an origin
              // choice made over the old rows no longer describes it. Reset
              // synchronously — an effect would let a stale filter hide the
              // new query's rows for a frame.
              setOriginFilter(current => originFilterForQuery(query, e.target.value, current))
              // Editing invalidates whatever the previous text produced. An
              // answer is simply stale, so return to the list; a running turn
              // must stop, because it streams for a question the input no
              // longer holds and its late result would be discarded anyway.
              if (askState === 'running') {
                stopAsk()
              } else if (askState === 'answer') {
                setAskState('idle')
                setAskIndexing(false)
              }
            }}
            placeholder={t('globalSearch.placeholder')}
            aria-label={t('globalSearch.placeholder')}
            aria-controls="global-search-results"
            aria-activedescendant={
              askState === 'idle' && flat.length > 0 ? `global-search-row-${active}` : undefined
            }
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            onFocus={e => {
              const bar = e.currentTarget.parentElement
              if (bar) {
                bar.style.boxShadow = 'inset 0 0 0 2px var(--accent-border)'
                bar.style.background = 'var(--accent-bg)'
              }
            }}
            onBlur={e => {
              const bar = e.currentTarget.parentElement
              if (bar) {
                bar.style.boxShadow = 'none'
                bar.style.background = 'transparent'
              }
            }}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              fontSize: 15,
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
            }}
          />
          {showLoading && askState === 'idle' && (
            <Loader2
              size={14}
              style={{ color: 'var(--text-muted)', flexShrink: 0, animation: 'spin 1s linear infinite' }}
            />
          )}
          <button
            onClick={close}
            title={t('globalSearch.close')}
            aria-label={t('globalSearch.close')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              padding: 4,
              borderRadius: 6,
              flexShrink: 0,
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Ask becomes possible at four characters. Between two and three,
            say so instead of leaving the floor invisible. */}
        {askState === 'idle' && askAvailable && trimmed.length >= 2 && trimmed.length < ASK_MIN_QUERY && (
          <div
            role="status"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 16px',
              borderBottom: '1px solid var(--border)',
              fontSize: 11,
              color: 'var(--text-muted)',
              flexShrink: 0,
            }}
          >
            <Sparkles size={11} style={{ flexShrink: 0, color: 'var(--accent-text)' }} aria-hidden="true" />
            <span>
              {t(
                ASK_MIN_QUERY - trimmed.length === 1
                  ? 'globalSearch.askMoreCharOne'
                  : 'globalSearch.askMoreChars',
                { count: ASK_MIN_QUERY - trimmed.length },
              )}
            </span>
          </div>
        )}

        {/* Follow-up context. Hidden while a turn runs so it cannot look like
            the answer being streamed belongs to the older question. */}
        {askState !== 'running' && lastExchange && (
          <div style={FOLLOW_UP_ROW_STYLE}>
            <button
              type="button"
              onClick={focusComposer}
              title={t('askHistory.followUpOn', { question: lastExchange.question })}
              style={FOLLOW_UP_CHIP_STYLE}
            >
              {t('askHistory.followUpOn', { question: lastExchange.question })}
            </button>
            <button
              type="button"
              onClick={() => setLastExchange(null)}
              title={t('askHistory.followUpDismiss')}
              aria-label={t('askHistory.followUpDismiss')}
              style={{
                background: 'none',
                border: 'none',
                padding: '0 2px',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                flexShrink: 0,
              }}
            >
              <X size={11} />
            </button>
          </div>
        )}

        {/* Origin narrowing. It filters the rows already on screen, so changing
            it never starts a scan and never races the search sequencing. */}
        {askState === 'idle' && results.length > 0 && (
          <div role="group" aria-label={t('globalSearch.originFilterLabel')} style={ORIGIN_ROW_STYLE}>
            {SEARCH_ORIGIN_FILTERS.map(kind => {
              const active = originFilter === kind
              return (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setOriginFilter(kind)}
                  onKeyDown={stopPillActivation}
                  style={{
                    ...ORIGIN_PILL_STYLE,
                    borderColor: active ? 'rgba(99,102,241,0.5)' : 'var(--border)',
                    background: active ? 'rgba(99,102,241,0.14)' : 'transparent',
                    color: active ? 'var(--accent-text)' : 'var(--text-muted)',
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {t(`globalSearch.origin.${kind}`)}
                </button>
              )
            })}
            {originFilter !== 'all' && (
              <>
                {filtered.hidden > 0 && (
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 0 }}>
                    {t(
                      filtered.hidden === 1
                        ? 'globalSearch.originHiddenOne'
                        : 'globalSearch.originHidden',
                      { count: filtered.hidden },
                    )}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setOriginFilter('all')}
                  onKeyDown={stopPillActivation}
                  style={{
                    ...ORIGIN_PILL_STYLE,
                    color: 'var(--accent-text)',
                    borderColor: 'rgba(99,102,241,0.35)',
                    background: 'transparent',
                    marginLeft: 'auto',
                  }}
                >
                  {t('globalSearch.originClear')}
                </button>
              </>
            )}
          </div>
        )}

        {/* Results / ask states */}
        <div
          style={{
            overflowY: 'auto',
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--border) transparent',
            minHeight: 120,
          }}
        >
          {askState === 'running' && (
            askDraft ? (
              <div
                role="region"
                aria-label={t('askHistory.answerLabel')}
                aria-live="polite"
                style={{ padding: '16px 16px 14px' }}
              >
                <div
                  style={{
                    fontSize: 13,
                    lineHeight: 1.7,
                    color: 'var(--text-primary)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {askDraft}
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-block',
                      width: 1,
                      height: '1em',
                      marginLeft: 2,
                      verticalAlign: 'text-bottom',
                      background: 'var(--accent-text)',
                      animation: 'ask-caret-blink 1s steps(1, end) infinite',
                    }}
                  />
                </div>
                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={stopAsk} style={GHOST_BUTTON_STYLE}>
                    {t('askHistory.stop')}
                  </button>
                </div>
              </div>
            ) : (
              <div
                aria-live="polite"
                style={{
                  ...EMPTY_STYLE,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <Loader2
                    size={20}
                    style={{ color: 'var(--accent-text)', animation: 'spin 1s linear infinite' }}
                  />
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    {t('askHistory.reading')}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Stops just the turn and returns to the search list. Closing
                      still dismisses the overlay and aborts through unmount. */}
                  <button type="button" onClick={stopAsk} style={GHOST_BUTTON_STYLE}>
                    {t('askHistory.stop')}
                  </button>
                  <button type="button" onClick={close} style={GHOST_BUTTON_STYLE}>
                    {t('askHistory.cancel')}
                  </button>
                </div>
              </div>
            )
          )}

          {askState === 'answer' && (
            <div
              role="region"
              aria-label={t('askHistory.answerLabel')}
              aria-live="polite"
              style={{ padding: '16px 16px 14px' }}
            >
              {askAnswer ? (
                <>
                  {/* The row keeps its height in both states: growing it on
                      "Copied" would shift the answer under the cursor. */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 2, minHeight: 22 }}>
                    <button
                      type="button"
                      onClick={copyAnswer}
                      title={t(copied ? 'askHistory.copied' : 'askHistory.copy')}
                      aria-label={t(copied ? 'askHistory.copied' : 'askHistory.copy')}
                      style={{
                        ...GHOST_BUTTON_STYLE,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        color: copied ? 'var(--success-text)' : 'var(--text-muted)',
                        padding: '3px 8px',
                      }}
                    >
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                      <span>{t(copied ? 'askHistory.copied' : 'askHistory.copy')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={focusComposer}
                      title={t('askHistory.followUp')}
                      aria-label={t('askHistory.followUp')}
                      style={{ ...GHOST_BUTTON_STYLE, padding: '3px 8px' }}
                    >
                      {t('askHistory.followUp')}
                    </button>
                  </div>
                  <AnswerBody
                    answer={askAnswer}
                    sources={askSources}
                    onCite={(_n, source) => void openCitation(source)}
                  />
                </>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {t(askIndexing ? 'askHistory.stillIndexing' : 'askHistory.noSources')}
                </div>
              )}

              {askSources.length > 0 && (
                <div role="group" aria-label={t('askHistory.sourcesTitle')} style={{ marginTop: 14 }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.07em',
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {t('askHistory.sourcesTitle')}
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {askSources.map((source, i) => (
                      <button
                        key={`${source.sessionId}-${i}`}
                        type="button"
                        onClick={() => void openCitation(source)}
                        aria-label={t('askHistory.citeLabel', {
                          n: i + 1,
                          title: source.title || t('askHistory.untitled'),
                        })}
                        style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          gap: 8,
                          width: '100%',
                          textAlign: 'left',
                          background: 'transparent',
                          border: 'none',
                          borderLeft: '2px solid transparent',
                          borderRadius: 0,
                          padding: '5px 6px',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          color: 'inherit',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = 'rgba(99,102,241,0.12)'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = 'transparent'
                        }}
                      >
                        <span style={{ ...CHIP_STYLE, cursor: 'inherit' }}>[{i + 1}]</span>
                        <span
                          title={source.title || t('askHistory.untitled')}
                          style={{
                            fontSize: 12,
                            color: 'var(--text-primary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            minWidth: 0,
                          }}
                        >
                          {source.title || t('askHistory.untitled')}
                        </span>
                        <span
                          title={projectLabel(source.project, t('askHistory.unknownProject'))}
                          style={{
                            fontSize: 11,
                            color: 'var(--text-muted)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flexShrink: 1,
                          }}
                        >
                          {projectLabel(source.project, t('askHistory.unknownProject'))}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: 'var(--text-muted)',
                            marginLeft: 'auto',
                            flexShrink: 0,
                            fontVariantNumeric: 'tabular-nums',
                            fontFeatureSettings: '"tnum"',
                          }}
                        >
                          {relativeTime(source.timestamp, t)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {askState === 'idle' && (
            <>
              {/* Pinned first row: an explicit affordance, because Ctrl+Enter
                  alone is invisible. Keyboard users can Tab to it; Enter still
                  opens the highlighted search result. */}
              {showAskEntry && (
                <button
                  type="button"
                  onClick={() => void runAsk()}
                  aria-label={t('askHistory.entry')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 16px',
                    background: 'rgba(99,102,241,0.08)',
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    borderLeft: '2px solid rgba(99,102,241,0.45)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    color: 'var(--accent-text)',
                  }}
                >
                  <Sparkles size={14} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{t('askHistory.entry')}</span>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      marginLeft: 'auto',
                      flexShrink: 0,
                    }}
                  >
                    {t('askHistory.ctrlEnterHint')}
                  </span>
                </button>
              )}

              <div id="global-search-results" role="listbox" aria-label={t('globalSearch.title')}>
                {showIdle && (
                  <div style={EMPTY_STYLE}>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('globalSearch.idle')}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                      {t('globalSearch.idleHint')}
                    </div>
                  </div>
                )}

                {showLoading && results.length === 0 && (
                  <div style={EMPTY_STYLE}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('globalSearch.loading')}</div>
                  </div>
                )}

                {showEmpty && !showLoading && (
                  <div style={EMPTY_STYLE}>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('globalSearch.empty')}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                      {t('globalSearch.emptyHint')}
                    </div>
                  </div>
                )}

                {showFilterEmpty && !showLoading && (
                  <div style={EMPTY_STYLE}>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      {t(
                        results.length === 1
                          ? 'globalSearch.originFilterEmptyOne'
                          : 'globalSearch.originFilterEmpty',
                        { count: results.length },
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                      {t('globalSearch.originFilterEmptyHint')}
                    </div>
                    <button
                      type="button"
                      onClick={() => setOriginFilter('all')}
                      onKeyDown={stopPillActivation}
                      style={{ ...GHOST_BUTTON_STYLE, marginTop: 12 }}
                    >
                      {t('globalSearch.originClear')}
                    </button>
                  </div>
                )}

                {groups.map(group => {
                  const groupStart = flat.indexOf(group.items[0])
                  return (
                    <div key={group.project || '__none'}>
                      <div
                        title={group.project || undefined}
                        style={{
                          padding: '8px 16px 4px',
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '0.07em',
                          textTransform: 'uppercase',
                          color: 'var(--text-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {projectLabel(group.project, t('globalSearch.unknownProject'))}
                      </div>
                      {group.items.map((hit, offset) => {
                        const index = groupStart + offset
                        return (
                          <SearchResultRow
                            key={`${hit.sessionId}-${hit.matchType}`}
                            hit={hit}
                            query={searchedQuery || trimmed}
                            index={index}
                            selected={index === active}
                            onHover={() => setActive(index)}
                            onOpen={() => void openHit(hit)}
                            origin={searchResultOrigin(hit.sessionId, originMap)}
                          />
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Keyboard legend */}
        <div
          style={{
            padding: '7px 16px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            fontSize: 10,
            color: 'var(--text-muted)',
            flexShrink: 0,
          }}
        >
          {askState === 'idle' ? (
            <>
              <span>{t('globalSearch.navHint')}</span>
              {askAvailable && <span>{t('askHistory.ctrlEnterHint')}</span>}
              {results.length > 0 && (
                <span style={{ marginLeft: 'auto' }}>
                  {t(
                    filtered.visible.length === 1
                      ? 'globalSearch.resultOne'
                      : 'globalSearch.resultsCount',
                    { count: filtered.visible.length },
                  )}
                </span>
              )}
            </>
          ) : (
            <span>{t('askHistory.cancelHint')}</span>
          )}
        </div>
      </div>
    </div>
  )
}

const EMPTY_STYLE: React.CSSProperties = {
  padding: '28px 20px',
  textAlign: 'center',
}
