import { useState, useEffect, useRef } from 'react'

interface UseChatInputDraftOptions {
  sessionId: string | null
  onDraftRestored?: () => void
}

/**
 * Manages per-session draft persistence in localStorage.
 * When the user switches sessions, the draft for the new session is restored.
 */
export function useChatInputDraft({ sessionId, onDraftRestored }: UseChatInputDraftOptions) {
  const draftKey = sessionId ? `aipa:draft:${sessionId}` : 'aipa:draft-input'

  const [input, setInput] = useState(() => {
    try {
      if (sessionId) {
        return localStorage.getItem(`aipa:draft:${sessionId}`) || ''
      }
      return sessionStorage.getItem('aipa:draft-input') || ''
    } catch { return '' }
  })

  // Auto-save draft input to localStorage (per-session) and sessionStorage (global fallback)
  useEffect(() => {
    try {
      if (input) {
        localStorage.setItem(draftKey, input)
        sessionStorage.setItem('aipa:draft-input', input)
      } else {
        localStorage.removeItem(draftKey)
        sessionStorage.removeItem('aipa:draft-input')
      }
    } catch { /* storage may not be available */ }
  }, [input, draftKey])

  // Restore draft when session changes
  const prevSessionIdRef = useRef(sessionId)
  useEffect(() => {
    if (prevSessionIdRef.current === sessionId) return
    prevSessionIdRef.current = sessionId
    try {
      const draft = sessionId
        ? localStorage.getItem(`aipa:draft:${sessionId}`) || ''
        : ''
      setInput(draft)
      if (draft && onDraftRestored) {
        onDraftRestored()
      }
    } catch { setInput('') }
  }, [sessionId])

  const clearDraft = () => {
    try {
      localStorage.removeItem(draftKey)
      sessionStorage.removeItem('aipa:draft-input')
    } catch { /* ignore */ }
  }

  return { input, setInput, clearDraft, draftKey }
}
