// useChatInputKeyboard — extracted from ChatInput.tsx (Iteration 432 decomposition)
// Handles all keyboard shortcuts in the chat input textarea.

import React, { useCallback } from 'react'

interface KeyboardDeps {
  input: string
  setInput: React.Dispatch<React.SetStateAction<string>>
  textareaRef: React.RefObject<HTMLTextAreaElement>
  popups: {
    atQuery: string | null
    slashQuery: string | null
    snippetQuery: string | null
    filteredSnippets: { id: string; keyword: string; content: string }[]
    snippetIndex: number
    setSnippetIndex: React.Dispatch<React.SetStateAction<number>>
    handleSnippetSelect: (snippet: { id: string; keyword: string; content: string }) => void
    setSnippetQuery: (q: string | null) => void
  }
  paste: {
    pastedUrl: string | null
    pastedLongText: boolean
    pendingQuote: string | null
    setPastedUrl: (v: string | null) => void
    setPastedLongText: (v: boolean) => void
    setPendingQuote: (v: string | null) => void
    urlChipTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
    longTextTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  }
  ghostText: string | null
  calcResult: string | null
  dismissSuggestion: () => void
  multiLineMode: boolean
  navigateUp: (current: string, fromEmpty: boolean) => string | null
  navigateDown: (fromEnd: boolean) => string | null
  handleSend: () => void
  resizeTextarea: () => void
}

export function useChatInputKeyboard(deps: KeyboardDeps) {
  const {
    input, setInput, textareaRef, popups, paste,
    ghostText, calcResult, dismissSuggestion,
    multiLineMode, navigateUp, navigateDown,
    handleSend, resizeTextarea,
  } = deps

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (popups.atQuery !== null && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape')) return
    if (popups.slashQuery !== null && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape')) return
    // Snippet popup keyboard navigation
    if (popups.snippetQuery !== null && popups.filteredSnippets.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); popups.setSnippetIndex(i => Math.min(i + 1, popups.filteredSnippets.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); popups.setSnippetIndex(i => Math.max(i - 1, 0)); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); popups.handleSnippetSelect(popups.filteredSnippets[popups.snippetIndex]); return }
      if (e.key === 'Escape') { e.preventDefault(); popups.setSnippetQuery(null); return }
    }

    if (e.key === 'ArrowUp' && !e.shiftKey && popups.atQuery === null && popups.slashQuery === null) {
      const ta = textareaRef.current
      if (ta && ta.selectionStart === 0 && ta.selectionEnd === 0) {
        const result = navigateUp(input, true)
        if (result !== null) { e.preventDefault(); setInput(result) }
      }
    }
    if (e.key === 'ArrowDown' && !e.shiftKey && popups.atQuery === null && popups.slashQuery === null) {
      const ta = textareaRef.current
      if (ta && ta.selectionStart === input.length) {
        const result = navigateDown(true)
        if (result !== null) { e.preventDefault(); setInput(result) }
      }
    }
    // Tab: accept ghost text autocomplete, or accept calculator result
    if (e.key === 'Tab' && !e.shiftKey && ghostText) {
      e.preventDefault()
      if (input.trim()) {
        setInput(prev => prev.trimStart() + ghostText)
      } else {
        setInput(ghostText)
      }
      dismissSuggestion()
      return
    }
    if (e.key === 'Tab' && !e.shiftKey && calcResult) {
      e.preventDefault()
      setInput(calcResult)
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      if (multiLineMode) {
        // In multi-line mode, Enter adds newline; Ctrl+Enter sends
        if (e.ctrlKey) { e.preventDefault(); handleSend() }
        // Otherwise let default textarea behavior (newline) happen
      } else {
        e.preventDefault(); handleSend()
      }
    }
    if (e.key === 'Escape' && input.trim().length > 0) { e.preventDefault(); setInput(''); resizeTextarea(); return }
    if (e.key === 'Escape' && ghostText && !input.trim()) { e.preventDefault(); dismissSuggestion(); return }
    if (e.ctrlKey && !e.shiftKey && e.key === 'u') { e.preventDefault(); setInput('') }
    // Markdown formatting shortcuts
    if (e.ctrlKey && !e.shiftKey && (e.key === 'b' || e.key === 'i')) {
      e.preventDefault()
      const ta = textareaRef.current
      if (!ta) return
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const selected = input.substring(start, end)
      const wrapper = e.key === 'b' ? '**' : '*'
      if (selected) {
        const newText = input.substring(0, start) + wrapper + selected + wrapper + input.substring(end)
        setInput(newText)
        setTimeout(() => {
          ta.selectionStart = start + wrapper.length
          ta.selectionEnd = end + wrapper.length
        }, 0)
      } else {
        const newText = input.substring(0, start) + wrapper + wrapper + input.substring(end)
        setInput(newText)
        setTimeout(() => {
          ta.selectionStart = start + wrapper.length
          ta.selectionEnd = start + wrapper.length
        }, 0)
      }
      return
    }
    // Ctrl+Shift+U: Cycle text case (UPPER -> lower -> Title -> original)
    if (e.ctrlKey && e.shiftKey && e.key === 'U') {
      e.preventDefault()
      const ta = textareaRef.current
      if (!ta) return
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const selected = input.substring(start, end)
      if (!selected) return
      let transformed: string
      if (selected === selected.toUpperCase() && selected !== selected.toLowerCase()) {
        transformed = selected.toLowerCase()
      } else if (selected === selected.toLowerCase() && selected !== selected.toUpperCase()) {
        transformed = selected.replace(/\b\w/g, c => c.toUpperCase())
      } else {
        transformed = selected.toUpperCase()
      }
      const newText = input.substring(0, start) + transformed + input.substring(end)
      setInput(newText)
      setTimeout(() => {
        ta.selectionStart = start
        ta.selectionEnd = start + transformed.length
      }, 0)
      return
    }
    // Escape: dismiss URL chips, long text chips, then quote preview
    if (e.key === 'Escape' && popups.atQuery === null && popups.slashQuery === null) {
      if (paste.pastedUrl) { e.preventDefault(); paste.setPastedUrl(null); if (paste.urlChipTimerRef.current) clearTimeout(paste.urlChipTimerRef.current); return }
      if (paste.pastedLongText) { e.preventDefault(); paste.setPastedLongText(false); if (paste.longTextTimerRef.current) clearTimeout(paste.longTextTimerRef.current); return }
      if (paste.pendingQuote) { e.preventDefault(); paste.setPendingQuote(null); return }
    }
  }, [
    input, setInput, textareaRef, popups, paste,
    ghostText, calcResult, dismissSuggestion,
    multiLineMode, navigateUp, navigateDown,
    handleSend, resizeTextarea,
  ])

  return handleKeyDown
}
