// ChatPanel event listeners — extracted from ChatPanel.tsx (Iteration 441)
import { useEffect, useRef } from 'react'
import { useUiStore } from '../../store'
import { useT } from '../../i18n'

/**
 * Manages ChatPanel custom event listeners and budget/context warning logic.
 */
export function useChatPanelEvents(
  currentSessionId: string | null,
  isStreaming: boolean,
  totalSessionCost: number,
  maxBudgetUsd: number | undefined,
  sendMessage: (text: string) => Promise<void>,
  sessionNotes: Record<string, string>,
  setEditingNote: (v: boolean) => void,
  setNoteText: (v: string) => void,
) {
  const addToast = useUiStore(s => s.addToast)
  const setPinnedNoteId = useUiStore(s => s.setPinnedNoteId)
  const t = useT()

  // Listen for external send prompt events (from SelectionToolbar)
  useEffect(() => {
    const handler = (e: Event) => {
      const prompt = (e as CustomEvent).detail as string
      if (prompt && !isStreaming) {
        sendMessage(prompt)
      }
    }
    window.addEventListener('aipa:sendPrompt', handler)
    return () => window.removeEventListener('aipa:sendPrompt', handler)
  }, [sendMessage, isStreaming])

  // Listen for "Pin note to session" events from command palette (Iteration 434)
  useEffect(() => {
    const handler = () => {
      if (currentSessionId) {
        setNoteText(sessionNotes[currentSessionId] || '')
        setEditingNote(true)
      }
    }
    window.addEventListener('aipa:editSessionNote', handler)
    return () => window.removeEventListener('aipa:editSessionNote', handler)
  }, [currentSessionId, sessionNotes, setEditingNote, setNoteText])

  // Listen for "Pin note to chat" events from notes panel (Iteration 439)
  useEffect(() => {
    const handler = (e: Event) => {
      const noteId = (e as CustomEvent).detail as string
      if (noteId && currentSessionId) {
        setPinnedNoteId(currentSessionId, noteId)
        addToast('info', t('notes.pinnedToChat'))
      }
    }
    window.addEventListener('aipa:pinNoteToChat', handler)
    return () => window.removeEventListener('aipa:pinNoteToChat', handler)
  }, [currentSessionId, setPinnedNoteId, addToast, t])

  // Cost budget warning: toast when session cost approaches or exceeds maxBudgetUsd
  const budgetWarningRef = useRef<'none' | '80' | '100'>('none')
  useEffect(() => {
    const budget = maxBudgetUsd
    if (!budget || budget <= 0 || totalSessionCost <= 0) return
    const pct = (totalSessionCost / budget) * 100
    if (pct >= 100 && budgetWarningRef.current !== '100') {
      budgetWarningRef.current = '100'
      addToast('error', t('cost.budgetExceeded', { budget: `$${budget.toFixed(2)}`, spent: `$${totalSessionCost.toFixed(3)}` }))
    } else if (pct >= 80 && pct < 100 && budgetWarningRef.current === 'none') {
      budgetWarningRef.current = '80'
      addToast('warning', t('cost.budgetWarning', { percent: String(Math.round(pct)), budget: `$${budget.toFixed(2)}` }))
    }
  }, [totalSessionCost, maxBudgetUsd, addToast, t])

  // Reset budget warning when session changes
  useEffect(() => {
    budgetWarningRef.current = 'none'
  }, [currentSessionId])
}
