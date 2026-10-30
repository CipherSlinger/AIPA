// Read spend rows for a set of conversations.
//
// The lookup is keyed by session id and a missing id is deliberately absent:
// the callers distinguish "no recorded usage" from a zero, and an empty map is
// also what a failed read looks like. Both mean unknown, which is the honest
// answer either way. The array is collapsed to a sorted, deduped key so a
// parent that rebuilds the array each render does not refetch every render.
import { useEffect, useMemo, useState } from 'react'
import type { UsageEntryData } from '../../../preload'

export function useUsageEntries(sessionIds: readonly string[]): Map<string, UsageEntryData> {
  const key = useMemo(
    () => Array.from(new Set(sessionIds.filter(id => typeof id === 'string' && id))).sort().join('\n'),
    [sessionIds],
  )
  const ids = useMemo(() => (key ? key.split('\n') : []), [key])
  const [entries, setEntries] = useState<Map<string, UsageEntryData>>(() => new Map())
  // A turn that resumes an already-recorded conversation does not change
  // `task.sessions`, so a mounted view would otherwise keep yesterday's number.
  // Re-read when the window regains focus.
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const bump = () => setRevision(value => value + 1)
    window.addEventListener('focus', bump)
    return () => window.removeEventListener('focus', bump)
  }, [])

  useEffect(() => {
    if (ids.length === 0) {
      setEntries(new Map())
      return
    }
    const api = window.electronAPI
    if (!api?.usageGetForSessions) {
      setEntries(new Map())
      return
    }
    let disposed = false
    void api.usageGetForSessions(ids)
      .then(rows => {
        if (disposed) return
        setEntries(new Map((Array.isArray(rows) ? rows : []).map(row => [row.sessionId, row])))
      })
      .catch(() => {
        if (!disposed) setEntries(new Map())
      })
    return () => { disposed = true }
  }, [ids, revision])

  return entries
}
