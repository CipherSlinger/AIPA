import { useState, useCallback } from 'react'
import { usePrefsStore } from '../../store'

/**
 * useSessionArchive — archive state management extracted from SessionList.tsx (Iteration 452)
 * Handles show/hide archived sessions, toggle archive, and bulk archive.
 */
export function useSessionArchive(
  selectedIds: Set<string>,
  exitSelectMode: () => void,
) {
  const { prefs, setPrefs } = usePrefsStore()
  const archivedSessions: string[] = prefs.archivedSessions || []
  const [showArchived, setShowArchived] = useState(false)

  const toggleArchive = useCallback((sessionId: string) => {
    const current = archivedSessions
    const isArchived = current.includes(sessionId)
    const updated = isArchived ? current.filter(id => id !== sessionId) : [...current, sessionId]
    setPrefs({ archivedSessions: updated })
    window.electronAPI.prefsSet('archivedSessions', updated)
  }, [archivedSessions, setPrefs])

  const bulkArchive = useCallback(() => {
    const selectedArr = [...selectedIds]
    const current = archivedSessions
    const toArchive = selectedArr.filter(id => !current.includes(id))
    if (toArchive.length === 0) return
    const updated = [...current, ...toArchive]
    setPrefs({ archivedSessions: updated })
    window.electronAPI.prefsSet('archivedSessions', updated)
    exitSelectMode()
  }, [selectedIds, archivedSessions, setPrefs, exitSelectMode])

  return {
    showArchived,
    setShowArchived,
    archivedSessions,
    toggleArchive,
    bulkArchive,
  }
}
