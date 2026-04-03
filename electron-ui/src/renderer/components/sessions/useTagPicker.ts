import { useState, useCallback, useEffect } from 'react'
import { usePrefsStore } from '../../store'

/**
 * useTagPicker — tag picker state management extracted from SessionList.tsx (Iteration 452)
 * Handles tag assignment, picker open/close, and Escape/click-outside dismissal.
 */
export function useTagPicker() {
  const { prefs, setPrefs } = usePrefsStore()
  const sessionTags: Record<string, string[]> = prefs.sessionTags || {}

  const [tagPickerSessionId, setTagPickerSessionId] = useState<string | null>(null)
  const [tagPickerPos, setTagPickerPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  const toggleSessionTag = useCallback((sessionId: string, tagId: string) => {
    const current = sessionTags[sessionId] || []
    const updated = current.includes(tagId)
      ? current.filter(id => id !== tagId)
      : [...current, tagId]
    const newSessionTags = { ...sessionTags, [sessionId]: updated }
    if (updated.length === 0) delete newSessionTags[sessionId]
    setPrefs({ sessionTags: newSessionTags })
    window.electronAPI.prefsSet('sessionTags', newSessionTags)
  }, [sessionTags, setPrefs])

  const openTagPicker = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setTagPickerSessionId(sessionId)
    setTagPickerPos({ top: rect.bottom + 4, left: rect.left })
  }, [])

  const closeTagPicker = useCallback(() => {
    setTagPickerSessionId(null)
  }, [])

  // Close tag picker on Escape or click outside
  useEffect(() => {
    if (!tagPickerSessionId) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeTagPicker() }
    const handleClick = () => closeTagPicker()
    window.addEventListener('keydown', handleKey)
    const timer = setTimeout(() => window.addEventListener('click', handleClick), 50)
    return () => {
      window.removeEventListener('keydown', handleKey)
      window.removeEventListener('click', handleClick)
      clearTimeout(timer)
    }
  }, [tagPickerSessionId, closeTagPicker])

  return {
    sessionTags,
    tagPickerSessionId,
    tagPickerPos,
    toggleSessionTag,
    openTagPicker,
    closeTagPicker,
  }
}
