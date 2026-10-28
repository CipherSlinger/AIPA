import { useEffect, useRef, useState } from 'react'
import type { SessionSearchResultData } from '../../../preload/index'

export type GlobalSearchStatus = 'idle' | 'loading' | 'ready'

const DEBOUNCE_MS = 180
const RESULT_LIMIT = 40

/**
 * Debounced `session:search`, with a sequence guard so a slow scan started for
 * an earlier keystroke can never overwrite the results of a later one. The main
 * process cancels superseded scans too; the guard here is the renderer half of
 * that contract.
 */
export function useGlobalSessionSearch(query: string) {
  const [results, setResults] = useState<SessionSearchResultData[]>([])
  const [status, setStatus] = useState<GlobalSearchStatus>('idle')
  const [searchedQuery, setSearchedQuery] = useState('')
  const sequence = useRef(0)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      sequence.current++
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
      const mine = ++sequence.current
      try {
        const api = window.electronAPI
        if (!api?.sessionSearch) throw new Error('sessionSearch unavailable')
        const hits = await api.sessionSearch(trimmed, RESULT_LIMIT)
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
  }, [query])

  return { results, status, searchedQuery }
}
