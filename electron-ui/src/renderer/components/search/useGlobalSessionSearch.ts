import { useEffect, useRef, useState } from 'react'
import type { SessionSearchResultData } from '../../../preload/index'
import { GLOBAL_SEARCH_RESULT_LIMIT } from './searchMatchFilter'

export type GlobalSearchStatus = 'idle' | 'loading' | 'ready'

const DEBOUNCE_MS = 180

/**
 * Debounced `session:search`, with a sequence guard so a slow scan started for
 * an earlier keystroke can never overwrite the results of a later one. The main
 * process cancels superseded scans too; the guard here is the renderer half of
 * that contract.
 *
 * `enabled` exists for the "ask about your history" turn: that retrieval runs
 * `searchSessions` in the main process, and those readers cancel a superseded
 * scan through a module-level epoch. A keystroke here would start a second
 * scan and silently empty the ask's digest, so the overlay disables this hook
 * while the turn is running. Re-enabling runs the current query immediately.
 */
export function useGlobalSessionSearch(query: string, enabled = true) {
  const [results, setResults] = useState<SessionSearchResultData[]>([])
  const [status, setStatus] = useState<GlobalSearchStatus>('idle')
  const [searchedQuery, setSearchedQuery] = useState('')
  const sequence = useRef(0)

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
      return
    }

    // The visible rows belonged to the previous query; keeping them while the
    // new scan runs would show snippets that no longer match what is typed.
    setResults([])
    setStatus('loading')

    const timer = setTimeout(async () => {
      try {
        const api = window.electronAPI
        if (!api?.sessionSearch) throw new Error('sessionSearch unavailable')
        // The same constant drives the UI's "this is only the newest N" note;
        // two numbers would let the admission drift away from the request.
        const hits = await api.sessionSearch(trimmed, GLOBAL_SEARCH_RESULT_LIMIT)
        if (mine !== sequence.current) return
        setResults(Array.isArray(hits) ? hits : [])
        setSearchedQuery(trimmed)
        setStatus('ready')
      } catch (err) {
        if (mine !== sequence.current) return
        console.warn('[AIPA] Global search failed', err)
        setResults([])
        setSearchedQuery(trimmed)
        setStatus('ready')
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query, enabled])

  return { results, status, searchedQuery }
}
