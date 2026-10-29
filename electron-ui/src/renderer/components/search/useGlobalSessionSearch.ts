import { useCallback, useEffect, useRef, useState } from 'react'
import type { SessionSearchFilterEchoData, SessionSearchResultData } from '../../../preload/index'
import { GLOBAL_SEARCH_RESULT_LIMIT, type ScanOrigin } from './searchMatchFilter'

export type GlobalSearchStatus = 'idle' | 'loading' | 'ready'

const DEBOUNCE_MS = 180

/**
 * What the polite live region says after one page lands. It deliberately does
 * not carry `total`: at the scan ceiling that number is a floor, and an
 * announcement reading "80 of 200" would state a whole the scan never measured.
 */
export interface LoadedPage {
  /** Rows this page added to the view. */
  added: number
  /** Rows the view holds now. */
  loaded: number
}

/**
 * Identifies one scan: its query and the narrowing it asked for. A page may
 * only continue a scan it was started for — a filter pushed into the scan or a
 * new query makes the previous ordering irrelevant, and appending a slice of it
 * would mix two scans in one list.
 *
 * The session allowlist is part of the key, so a department narrowing is
 * covered exactly like an origin list: two departments, or one department
 * before and after a filing change, are two corpora even when the query is the
 * same. Main keys its page cache the same way, which is what lets a
 * continuation either slice the same ordering or rescan instead of blending.
 */
export function searchScanKey(
  query: string,
  origins: readonly ScanOrigin[] | null,
  sessionIds: readonly string[] | null,
): string {
  return `${query}\u0000${origins ? origins.join(',') : '*'}\u0000${sessionIds ? sessionIds.join(',') : '*'}`
}

/**
 * Debounced `session:searchPage`, with a sequence guard so a slow scan started
 * for an earlier keystroke can never overwrite the results of a later one. The
 * main process cancels superseded scans too; the guard here is the renderer
 * half of that contract.
 *
 * `enabled` exists for the "ask about your history" turn: that retrieval runs
 * `searchSessions` in the main process, and those readers cancel a superseded
 * scan through a module-level epoch. A keystroke here would start a second
 * scan and silently empty the ask's digest, so the overlay disables this hook
 * while the turn is running. Re-enabling runs the current query immediately.
 *
 * `scanOrigins` / `scanSessionIds` push a filter into the scan itself. They are
 * deliberately inputs to this hook rather than derived from the chip state:
 * changing a chip never changes them, so a chip click cannot start a scan. Only
 * the caller's explicit action sets them. `null` is the unfiltered scan; an
 * empty array is a scope that matches nothing.
 *
 * Paging: the first page and every later page are slices of the same
 * main-side ordered scan, so `loadMore` appends rows in exactly the order the
 * first page began. `total`, `hasMore` and `ceilingReached` all come from main
 * — a full page is never read as "there must be more", because the scan stops
 * at its own ceiling, not at the page boundary. `filteredBy` is main's echo of
 * what the scan kept; non-null means every count above describes a narrowed
 * set.
 */
export function useGlobalSessionSearch(
  query: string,
  enabled = true,
  scanOrigins: readonly ScanOrigin[] | null = null,
  scanSessionIds: readonly string[] | null = null,
) {
  const [results, setResults] = useState<SessionSearchResultData[]>([])
  const [status, setStatus] = useState<GlobalSearchStatus>('idle')
  const [searchedQuery, setSearchedQuery] = useState('')
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [ceilingReached, setCeilingReached] = useState(false)
  const [filteredBy, setFilteredBy] = useState<SessionSearchFilterEchoData | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreFailed, setLoadMoreFailed] = useState(false)
  const [lastPage, setLastPage] = useState<LoadedPage | null>(null)
  // Bumped whenever a new query starts. The overlay resets its highlighted row
  // on this, not on `results`: appending a page also changes `results`, and a
  // page landing must not yank the selection back to the top.
  const [runId, setRunId] = useState(0)
  const sequence = useRef(0)
  // Mirrors of the latest committed state, readable from `loadMore` without
  // making the callback a new identity on every appended row (which would
  // re-render the pager button on every keystroke's result landing).
  const resultsRef = useRef<SessionSearchResultData[]>([])
  resultsRef.current = results
  const pageStateRef = useRef({ query: '', key: '', hasMore: false })
  pageStateRef.current = {
    query: searchedQuery,
    key: searchScanKey(searchedQuery, scanOrigins, scanSessionIds),
    hasMore,
  }
  // The scan the rows on screen belong to. A continuation that no longer
  // matches is refused instead of appending a slice of a different filter.
  const loadedKeyRef = useRef('')
  // Set synchronously: two clicks in one tick would otherwise both read the
  // same offset before React commits `loadingMore`.
  const loadingMoreRef = useRef(false)

  useEffect(() => {
    // Invalidate the previous query's in-flight scan immediately, not when the
    // debounce fires. A scan started for the old text can resolve inside the
    // new query's 180 ms window; without this bump it would still match
    // `sequence.current` and paint rows for text the input no longer holds.
    const mine = ++sequence.current
    if (!enabled) return
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults([])
      setStatus('idle')
      setSearchedQuery('')
      setTotal(0)
      setHasMore(false)
      setCeilingReached(false)
      setFilteredBy(null)
      setLoadingMore(false)
      loadingMoreRef.current = false
      setLoadMoreFailed(false)
      setLastPage(null)
      loadedKeyRef.current = ''
      return
    }

    // The visible rows belonged to the previous query; keeping them while the
    // new scan runs would show snippets that no longer match what is typed.
    // Any paging state belonged to them too.
    setResults([])
    setStatus('loading')
    setTotal(0)
    setHasMore(false)
    setCeilingReached(false)
    setFilteredBy(null)
    setLoadingMore(false)
    loadingMoreRef.current = false
    setLoadMoreFailed(false)
    setLastPage(null)
    loadedKeyRef.current = ''
    // Selection belongs to the previous result set; a new run starts at the
    // best row once its rows arrive.
    setRunId(n => n + 1)

    const origins = scanOrigins ? [...scanOrigins] : undefined
    const sessionIds = scanSessionIds ? [...scanSessionIds] : undefined
    const key = searchScanKey(trimmed, scanOrigins, scanSessionIds)

    const timer = setTimeout(async () => {
      try {
        const api = window.electronAPI
        if (!api?.sessionSearchPage) throw new Error('sessionSearchPage unavailable')
        const page = await api.sessionSearchPage(trimmed, {
          offset: 0,
          limit: GLOBAL_SEARCH_RESULT_LIMIT,
          origins,
          sessionIds,
        })
        if (mine !== sequence.current) return
        setResults(Array.isArray(page?.results) ? page.results : [])
        setTotal(Number(page?.total) || 0)
        setHasMore(Boolean(page?.hasMore))
        setCeilingReached(Boolean(page?.ceilingReached))
        setFilteredBy(page?.filteredBy ?? null)
        setSearchedQuery(trimmed)
        setStatus('ready')
        loadedKeyRef.current = key
      } catch (err) {
        if (mine !== sequence.current) return
        console.warn('[AIPA] Global search failed', err)
        setResults([])
        setTotal(0)
        setHasMore(false)
        setCeilingReached(false)
        setFilteredBy(null)
        setSearchedQuery(trimmed)
        setStatus('ready')
        loadedKeyRef.current = ''
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query, enabled, scanOrigins, scanSessionIds])

  const loadMore = useCallback(() => {
    const state = pageStateRef.current
    const trimmed = state.query
    if (trimmed.length < 2 || !state.hasMore || loadingMoreRef.current) return
    if (state.key !== loadedKeyRef.current) return
    const offset = resultsRef.current.length
    const mine = sequence.current
    loadingMoreRef.current = true
    setLoadingMore(true)
    setLoadMoreFailed(false)

    void (async () => {
      try {
        const api = window.electronAPI
        if (!api?.sessionSearchPage) throw new Error('sessionSearchPage unavailable')
        const page = await api.sessionSearchPage(trimmed, {
          offset,
          limit: GLOBAL_SEARCH_RESULT_LIMIT,
          origins: scanOrigins ? [...scanOrigins] : undefined,
          sessionIds: scanSessionIds ? [...scanSessionIds] : undefined,
        })
        if (mine !== sequence.current) return
        const incoming = Array.isArray(page?.results) ? page.results : []
        // A page is a slice of one ordered scan, so it cannot repeat a row.
        // The guard is for the rare case where the main-side cache expired and
        // the list shifted under the request: showing a row twice is worse
        // than dropping the overlap.
        const seen = new Set(resultsRef.current.map(hit => hit.sessionId))
        const fresh = incoming.filter(hit => !seen.has(hit.sessionId))
        const loaded = resultsRef.current.length + fresh.length
        setResults(prev => [...prev, ...fresh])
        setTotal(Number(page?.total) || loaded)
        setHasMore(Boolean(page?.hasMore))
        setCeilingReached(Boolean(page?.ceilingReached))
        setFilteredBy(page?.filteredBy ?? null)
        setLastPage({ added: fresh.length, loaded })
      } catch (err) {
        if (mine !== sequence.current) return
        console.warn('[AIPA] Could not load more search results', err)
        // Keep `hasMore` so the button stays and the click can be retried.
        setLoadMoreFailed(true)
      } finally {
        if (mine === sequence.current) {
          loadingMoreRef.current = false
          setLoadingMore(false)
        }
      }
    })()
  }, [scanOrigins, scanSessionIds])

  return {
    results,
    status,
    searchedQuery,
    total,
    hasMore,
    ceilingReached,
    filteredBy,
    loadingMore,
    loadMoreFailed,
    loadMore,
    lastPage,
    runId,
  }
}
