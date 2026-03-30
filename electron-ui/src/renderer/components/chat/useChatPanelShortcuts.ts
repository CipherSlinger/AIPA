import { useEffect } from 'react'
import { useChatStore, useUiStore } from '../../store'

/**
 * Hook encapsulating all global keyboard shortcuts for ChatPanel.
 */
export function useChatPanelShortcuts(
  exportConversation: () => void,
  copyConversation: () => void,
  setSearchOpen: (open: boolean) => void,
  sendMessage: (text: string) => Promise<void>,
  abort: () => void,
) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'E') {
        e.preventDefault()
        exportConversation()
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'X') {
        e.preventDefault()
        copyConversation()
      }
      // Ctrl+Shift+B: Toggle bookmarks panel
      if (e.ctrlKey && e.shiftKey && e.key === 'B') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('aipa:toggleBookmarks'))
      }
      // Ctrl+Shift+S: Toggle stats panel
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('aipa:toggleStats'))
      }
      if (e.ctrlKey && !e.shiftKey && e.key === 'f') {
        e.preventDefault()
        setSearchOpen(true)
      }
      // Ctrl+Shift+F: Global cross-session search
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault()
        const uiState = useUiStore.getState()
        if (!uiState.sidebarOpen || uiState.sidebarTab !== 'history') {
          uiState.setActiveNavItem('history')
        }
        window.dispatchEvent(new CustomEvent('aipa:globalSearchFocus'))
      }
      // Ctrl+Shift+C: Compact conversation context
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault()
        const state = useChatStore.getState()
        if (!state.isStreaming) {
          sendMessage('/compact')
        }
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'R') {
        e.preventDefault()
        const state = useChatStore.getState()
        if (!state.isStreaming && state.messages.length >= 2 && state.messages[state.messages.length - 1]?.role === 'assistant') {
          const prompt = state.prepareRegeneration()
          if (prompt) sendMessage(prompt)
        }
      }
      // Ctrl+Home: Jump to first message
      if (e.ctrlKey && !e.shiftKey && e.key === 'Home') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('aipa:scrollToFirst'))
      }
      // Ctrl+End: Jump to last message
      if (e.ctrlKey && !e.shiftKey && e.key === 'End') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('aipa:scrollToLast'))
      }
      // Alt+Up / Alt+Down: Jump between user messages
      if (e.altKey && !e.ctrlKey && !e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        const activeEl = document.activeElement
        const inInput = activeEl instanceof HTMLTextAreaElement || activeEl instanceof HTMLInputElement
        if (!inInput) {
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('aipa:jumpUserMessage', { detail: e.key === 'ArrowUp' ? 'prev' : 'next' }))
        }
      }
      // Page Up / Page Down: Chunk scroll in message list
      if ((e.key === 'PageUp' || e.key === 'PageDown') && !e.ctrlKey && !e.shiftKey) {
        const activeEl = document.activeElement
        const inInput = activeEl instanceof HTMLTextAreaElement || activeEl instanceof HTMLInputElement
        if (!inInput) {
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('aipa:pageScroll', { detail: e.key === 'PageUp' ? 'up' : 'down' }))
        }
      }
      // Escape to stop streaming
      if (e.key === 'Escape' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        const state = useChatStore.getState()
        if (state.isStreaming) {
          const activeEl = document.activeElement
          const inInput = activeEl instanceof HTMLTextAreaElement || activeEl instanceof HTMLInputElement
          const hasModal = document.querySelector('[role="dialog"]') || document.querySelector('.lightbox-overlay')
          if (!inInput && !hasModal) {
            e.preventDefault()
            abort()
          }
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [exportConversation, copyConversation, setSearchOpen, sendMessage, abort])

  // Listen for export trigger from CommandPalette
  useEffect(() => {
    const handler = () => exportConversation()
    window.addEventListener('aipa:export', handler)
    return () => window.removeEventListener('aipa:export', handler)
  }, [exportConversation])

  // Listen for slash command from CommandPalette
  useEffect(() => {
    const handler = (e: Event) => {
      const cmd = (e as CustomEvent).detail as string
      if (cmd) sendMessage(cmd)
    }
    window.addEventListener('aipa:slashCommand', handler)
    return () => window.removeEventListener('aipa:slashCommand', handler)
  }, [sendMessage])
}
