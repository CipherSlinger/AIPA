// useCollapsedGroups — manages collapsible date group state (extracted Iteration 455)
import { useState, useCallback } from 'react'

export function useCollapsedGroups() {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('aipa:collapsed-session-groups')
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch { return new Set() }
  })

  const toggleGroupCollapse = useCallback((group: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      try { localStorage.setItem('aipa:collapsed-session-groups', JSON.stringify([...next])) } catch {}
      return next
    })
  }, [])

  return { collapsedGroups, toggleGroupCollapse }
}
