import { useState, useRef } from 'react'

/**
 * Manages input history navigation with Up/Down arrow keys.
 * History is persisted in localStorage (max 50 entries).
 */
export function useChatInputHistory() {
  const [initialHistory] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('aipa:input-history')
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  })

  const inputHistoryRef = useRef<string[]>(initialHistory)
  const historyIdxRef = useRef(-1)
  const tempInputRef = useRef('')

  const addToHistory = (text: string) => {
    inputHistoryRef.current = [text, ...inputHistoryRef.current.filter(h => h !== text)].slice(0, 50)
    historyIdxRef.current = -1
    try {
      localStorage.setItem('aipa:input-history', JSON.stringify(inputHistoryRef.current))
    } catch { /* ignore */ }
  }

  const navigateUp = (currentInput: string, cursorAtStart: boolean): string | null => {
    if (!cursorAtStart || inputHistoryRef.current.length === 0) return null
    if (historyIdxRef.current === -1) {
      tempInputRef.current = currentInput
    }
    const nextIdx = Math.min(historyIdxRef.current + 1, inputHistoryRef.current.length - 1)
    historyIdxRef.current = nextIdx
    return inputHistoryRef.current[nextIdx]
  }

  const navigateDown = (cursorAtEnd: boolean): string | null => {
    if (!cursorAtEnd || historyIdxRef.current < 0) return null
    const nextIdx = historyIdxRef.current - 1
    historyIdxRef.current = nextIdx
    return nextIdx >= 0 ? inputHistoryRef.current[nextIdx] : tempInputRef.current
  }

  return {
    inputHistoryRef,
    addToHistory,
    navigateUp,
    navigateDown,
  }
}
