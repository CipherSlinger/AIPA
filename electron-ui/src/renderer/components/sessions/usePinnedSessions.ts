// usePinnedSessions — manages pinned session state (extracted Iteration 455)
import { useState, useCallback } from 'react'

export function usePinnedSessions() {
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('aipa:pinned-sessions')
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch { return new Set() }
  })

  const togglePin = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    setPinnedIds(prev => {
      const next = new Set(prev)
      if (next.has(sessionId)) {
        next.delete(sessionId)
      } else {
        next.add(sessionId)
      }
      try { localStorage.setItem('aipa:pinned-sessions', JSON.stringify([...next])) } catch { /* ignore */ }
      return next
    })
  }, [])

  return { pinnedIds, togglePin }
}
