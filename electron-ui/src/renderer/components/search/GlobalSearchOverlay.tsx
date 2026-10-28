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
import { Loader2, Search, Sparkles, X } from 'lucide-react'
import type { AskHistorySourceData, SessionSearchResultData } from '../../../preload/index'
import { useI18n, useT } from '../../i18n'
import { useUiStore } from '../../store'
import { pushEscapeHandler } from '../ui/escapeStack'
import { useGlobalSessionSearch } from './useGlobalSessionSearch'
import { SearchResultRow, relativeTime } from './SearchResultRow'
import { revealSessionEvidence } from './revealSessionEvidence'

/**
 * Every ask source records the term it matched on, so a citation click can mark
 * that text instead of the whole question. The preload typing may lag the main
 * process change, so the field is carried here until `AskHistorySourceData`
 * declares it (then the intersection degrades to the declared type).
 */
type AskSource = AskHistorySourceData & { matchedTerm?: string }

/** Optional abort, same reason: the preload typing may not expose it yet. */
type AskHistoryCancelApi = { sessionAskHistoryCancel?: () => void | Promise<void> }

function projectLabel(project: string, fallback: string): string {
  if (!project) return fallback
  const parts = project.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || project
}

type AskState = 'idle' | 'running' | 'answer'

/** Minimum query length worth an LLM turn — same threshold as the pinned row. */
const ASK_MIN_QUERY = 4

const CHIP_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0 4px',
  margin: '0 1px',
  borderRadius: 4,
  border: '1px solid rgba(99,102,241,0.35)',
  background: 'rgba(99,102,241,0.18)',
  color: '#a5b4fc',
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
    const re = /\[(\d+)\]/g
    let from = 0
    let match: RegExpExecArray | null
    while ((match = re.exec(answer))) {
      if (match.index > from) out.push(answer.slice(from, match.index))
      const n = Number(match[1])
      const source = sources[n - 1]
      if (source) {
        out.push(
          <button
            key={`cite-${match.index}`}
            type="button"
            onClick={() => onCite(n, source)}
            aria-label={t('askHistory.citeLabel', {
              n,
              title: source.title || t('askHistory.untitled'),
            })}
            style={CHIP_STYLE}
          >
            [{n}]
          </button>,
        )
      } else {
        out.push(match[0])
      }
      from = re.lastIndex
    }
    if (from < answer.length) out.push(answer.slice(from))
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
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [askAvailable, setAskAvailable] = useState(false)
  const [askState, setAskState] = useState<AskState>('idle')
  const [askAnswer, setAskAnswer] = useState('')
  const [askSources, setAskSources] = useState<AskSource[]>([])
  // The question the visible answer belongs to. The input stays editable, so
  // the citation click must reopen evidence for the query that produced it.
  const [askedQuestion, setAskedQuestion] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const openingRef = useRef(false)
  // Set on the way out, whether through `close()` or a direct unmount. An
  // aborted turn still settles, and reporting that settlement would toast
  // "failed" for a turn the user deliberately stopped.
  const dismissedRef = useRef(false)
  const askRunRef = useRef(0)
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
  // searches: editing the query (which drops a stale answer) or a later open
  // resumes it.
  const { results, status, searchedQuery } = useGlobalSessionSearch(query, askState === 'idle')

  const close = useCallback(() => {
    dismissedRef.current = true
    setOpen(false)
  }, [setOpen])

  useEffect(() => {
    inputRef.current?.focus()
    return pushEscapeHandler(close)
  }, [close])

  useEffect(() => { queryRef.current = query }, [query])

  useEffect(() => { askStateRef.current = askState }, [askState])

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
    for (const hit of results) {
      const key = hit.project || ''
      const bucket = map.get(key)
      if (bucket) bucket.push(hit)
      else map.set(key, [hit])
    }
    return [...map.entries()].map(([project, items]) => ({ project, items }))
  }, [results])

  const flat = useMemo(() => groups.flatMap(group => group.items), [groups])

  // A new result set always starts at the best hit.
  useEffect(() => { setActive(0) }, [results])
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
    setAskState('running')
    setAskAnswer('')
    setAskSources([])
    setAskedQuestion(question)

    try {
      const api = window.electronAPI
      if (!api?.sessionAskHistory) throw new Error('sessionAskHistory unavailable')
      const result = await api.sessionAskHistory({ question, locale: resolvedLocale })
      if (run !== askRunRef.current || dismissedRef.current) return
      if (queryRef.current.trim() !== question) {
        // The input no longer holds the question this turn was asked for.
        // Showing the answer would attach it to text the user has replaced.
        setAskState('idle')
        return
      }
      if (!result?.ok) {
        setAskState('idle')
        if (result?.error === 'busy') addToast('error', t('askHistory.busy'))
        else if (result?.error === 'timeout') addToast('error', t('askHistory.timeout'))
        else if (result?.error === 'empty_response') addToast('error', t('askHistory.empty'))
        else addToast('error', t('askHistory.failed'))
        return
      }
      setAskAnswer(result.answer || '')
      setAskSources(result.sources || [])
      setAskState('answer')
    } catch {
      if (run !== askRunRef.current || dismissedRef.current) return
      // Stay in the overlay with the query intact so the user can retry.
      setAskState('idle')
      addToast('error', t('askHistory.failed'))
    }
  }, [addToast, askAvailable, askState, query, resolvedLocale, t])

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
          boxShadow: '0 32px 80px rgba(0,0,0,0.8), 0 8px 24px rgba(0,0,0,0.5)',
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
              // Editing after an answer makes that answer stale; go back to
              // the search list. A running turn is left alone — it keeps going
              // and its result is still shown.
              if (askState === 'answer') setAskState('idle')
            }}
            placeholder={t('globalSearch.placeholder')}
            aria-label={t('globalSearch.placeholder')}
            aria-controls="global-search-results"
            aria-activedescendant={
              askState === 'idle' && flat.length > 0 ? `global-search-row-${active}` : undefined
            }
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
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
              <Loader2
                size={20}
                style={{ color: '#a5b4fc', animation: 'spin 1s linear infinite' }}
              />
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {t('askHistory.reading')}
              </div>
              {/* Closing dismisses the overlay and aborts the turn through the
                  unmount cleanup, so no model call keeps running unseen. */}
              <button
                type="button"
                onClick={close}
                style={{
                  background: 'none',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: 11,
                  padding: '3px 10px',
                  fontFamily: 'inherit',
                }}
              >
                {t('askHistory.cancel')}
              </button>
            </div>
          )}

          {askState === 'answer' && (
            <div
              role="region"
              aria-label={t('askHistory.answerLabel')}
              aria-live="polite"
              style={{ padding: '16px 16px 14px' }}
            >
              {askAnswer ? (
                <AnswerBody
                  answer={askAnswer}
                  sources={askSources}
                  onCite={(_n, source) => void openCitation(source)}
                />
              ) : (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {t('askHistory.noSources')}
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
                    color: '#a5b4fc',
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
              {showAskEntry && <span>{t('askHistory.ctrlEnterHint')}</span>}
              {results.length > 0 && (
                <span style={{ marginLeft: 'auto' }}>
                  {t('globalSearch.resultsCount', { count: results.length })}
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
