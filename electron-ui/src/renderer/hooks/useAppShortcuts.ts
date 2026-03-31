import { useEffect } from 'react'
import { usePrefsStore, useChatStore, useSessionStore, useUiStore } from '../store'
import { useT } from '../i18n'

type SidebarTab = 'history' | 'files' | 'notes' | 'skills' | 'memory' | 'workflows' | 'prompthistory' | 'channel'

/**
 * Global keyboard shortcuts registered at the App level.
 * These are always active regardless of which panel is focused.
 */
export function useAppShortcuts(
  toggleSidebar: () => void,
  toggleTerminal: () => void,
  toggleCommandPalette: () => void,
  toggleFocusMode: () => void,
  setSidebarOpen: (open: boolean) => void,
  setSidebarTab: (tab: SidebarTab) => void,
  setShowShortcuts: (fn: (prev: boolean) => boolean) => void,
  setPrefs: (prefs: Record<string, unknown>) => void,
) {
  const t = useT()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+L: Focus chat input
      if (e.ctrlKey && !e.shiftKey && e.key === 'l') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('aipa:focusInput'))
      }
      // Ctrl+,: Open settings modal
      if (e.ctrlKey && !e.shiftKey && e.key === ',') {
        e.preventDefault()
        useUiStore.getState().openSettingsModal()
      }
      // Ctrl+B: Toggle sidebar
      if (e.ctrlKey && !e.shiftKey && e.key === 'b') {
        e.preventDefault()
        toggleSidebar()
      }
      // Ctrl+N: New conversation
      if (e.ctrlKey && !e.shiftKey && e.key === 'n') {
        e.preventDefault()
        const store = useChatStore.getState()
        if (store.messages.length > 0 && store.isStreaming) return // don't clear during streaming
        if (store.messages.length > 2) {
          // Show brief toast warning -- use double-press pattern
          const now = Date.now()
          if ((window as any).__lastClearPress && now - (window as any).__lastClearPress < 1500) {
            store.clearMessages()
            ;(window as any).__lastClearPress = 0
          } else {
            (window as any).__lastClearPress = now
            useUiStore.getState().addToast('warning', t('chat.pressAgainToClear', { key: 'Ctrl+N' }), 1500)
          }
        } else {
          store.clearMessages()
        }
      }
      // Ctrl+K: Clear conversation (alternative, terminal-style)
      if (e.ctrlKey && !e.shiftKey && e.key === 'k') {
        e.preventDefault()
        const store = useChatStore.getState()
        if (store.messages.length > 0 && store.isStreaming) return
        if (store.messages.length > 2) {
          const now = Date.now()
          if ((window as any).__lastClearPress && now - (window as any).__lastClearPress < 1500) {
            store.clearMessages()
            ;(window as any).__lastClearPress = 0
          } else {
            (window as any).__lastClearPress = now
            useUiStore.getState().addToast('warning', t('chat.pressAgainToClear', { key: 'Ctrl+K' }), 1500)
          }
        } else {
          store.clearMessages()
        }
      }
      // Ctrl+`: Toggle terminal
      if (e.ctrlKey && !e.shiftKey && e.key === '`') {
        e.preventDefault()
        toggleTerminal()
      }
      // Ctrl+Shift+P: Command palette
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault()
        toggleCommandPalette()
      }
      // Ctrl+/: Shortcut cheatsheet
      if (e.ctrlKey && !e.shiftKey && e.key === '/') {
        e.preventDefault()
        setShowShortcuts(prev => !prev)
      }
      // Ctrl+Shift+O: Focus mode (hide sidebar + terminal)
      if (e.ctrlKey && e.shiftKey && e.key === 'O') {
        e.preventDefault()
        toggleFocusMode()
      }
      // Ctrl+Shift+N: Toggle Notes panel
      if (e.ctrlKey && e.shiftKey && e.key === 'N') {
        e.preventDefault()
        const ui = useUiStore.getState()
        if (ui.sidebarOpen && ui.sidebarTab === 'notes') {
          ui.setSidebarOpen(false)
        } else {
          ui.setSidebarOpen(true)
          ui.setSidebarTab('notes')
          ui.setActiveNavItem('notes')
        }
      }
      // Ctrl+Shift+C: Collapse/expand all messages
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault()
        const store = useChatStore.getState()
        const hasCollapsed = store.messages.some(m => m.role !== 'permission' && m.role !== 'plan' && (m as any).collapsed)
        if (hasCollapsed) {
          store.expandAll()
        } else {
          store.collapseAll()
        }
      }
      // Ctrl+Shift+D: Cycle theme (System -> Dark -> Light -> System)
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault()
        const currentTheme = usePrefsStore.getState().prefs.theme || 'vscode'
        const themeOrder: Array<'system' | 'vscode' | 'light'> = ['system', 'vscode', 'light']
        const currentIdx = themeOrder.indexOf(currentTheme as typeof themeOrder[number])
        const newTheme = themeOrder[(currentIdx + 1) % themeOrder.length]
        setPrefs({ theme: newTheme })
        window.electronAPI.prefsSet('theme', newTheme)
      }
      // Ctrl+Shift+L: Toggle language (en <-> zh-CN)
      if (e.ctrlKey && e.shiftKey && e.key === 'L') {
        e.preventDefault()
        const currentLang = usePrefsStore.getState().prefs.language || 'en'
        const newLang = currentLang === 'zh-CN' ? 'en' : 'zh-CN'
        setPrefs({ language: newLang })
        window.electronAPI.prefsSet('language', newLang)
      }
      // Ctrl+Shift+M: Cycle through primary models (Sonnet -> Opus -> Haiku -> Sonnet)
      if (e.ctrlKey && e.shiftKey && e.key === 'M') {
        e.preventDefault()
        const modelCycle = ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5'] as const
        const currentModel = usePrefsStore.getState().prefs.model || 'claude-sonnet-4-6'
        const currentIdx = modelCycle.indexOf(currentModel as typeof modelCycle[number])
        const nextModel = modelCycle[(currentIdx + 1) % modelCycle.length]
        setPrefs({ model: nextModel })
        window.electronAPI.prefsSet('model', nextModel)
        // Show short model name in toast
        const shortName = nextModel.replace('claude-', '').split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')
        useUiStore.getState().addToast('info', `Model: ${shortName}`, 1500)
      }
      // Ctrl+Shift+T: Toggle always-on-top (pin window)
      if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        e.preventDefault()
        const ui = useUiStore.getState()
        const newValue = !ui.alwaysOnTop
        window.electronAPI.windowSetAlwaysOnTop(newValue)
        ui.setAlwaysOnTop(newValue)
        ui.addToast('info', t(newValue ? 'window.pinnedOn' : 'window.pinnedOff'), 1500)
      }
      // Ctrl+1-9: Switch sidebar tabs (Ctrl+5 opens settings modal)
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const tabs = ['history', 'files', 'notes', 'skills', 'settings', 'memory', 'workflows', 'prompthistory', 'channel'] as const
        const idx = parseInt(e.key) - 1
        const tab = tabs[idx]
        if (tab === 'settings') {
          // Settings opens as a modal, not in sidebar
          const ui = useUiStore.getState()
          ui.setSettingsModalOpen(!ui.settingsModalOpen)
        } else {
          const ui = useUiStore.getState()
          if (ui.sidebarOpen && ui.sidebarTab === tab) {
            ui.setSidebarOpen(false)
          } else {
            ui.setSidebarOpen(true)
            ui.setSidebarTab(tab as any)
            ui.setActiveNavItem(tab)
          }
        }
      }
      // / key: Focus session search (when not in an input)
      if (e.key === '/' && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
        const activeEl = document.activeElement
        const inInput = activeEl instanceof HTMLTextAreaElement || activeEl instanceof HTMLInputElement || (activeEl as HTMLElement)?.isContentEditable
        const hasModal = document.querySelector('[role="dialog"]')
        if (!inInput && !hasModal) {
          e.preventDefault()
          const ui = useUiStore.getState()
          if (!ui.sidebarOpen || ui.sidebarTab !== 'history') {
            ui.setActiveNavItem('history')
          }
          window.dispatchEvent(new CustomEvent('aipa:globalSearchFocus'))
        }
      }
      // Ctrl+[ / Ctrl+]: Navigate between sessions
      if (e.ctrlKey && !e.shiftKey && (e.key === '[' || e.key === ']')) {
        e.preventDefault()
        const sessions = useSessionStore.getState().sessions
        if (sessions.length === 0) return
        const currentId = useChatStore.getState().currentSessionId
        // Sort sessions by timestamp descending (same as default view)
        const sorted = [...sessions].sort((a, b) => b.timestamp - a.timestamp)
        const currentIdx = sorted.findIndex(s => s.sessionId === currentId)
        let targetIdx: number
        if (e.key === '[') {
          // Previous (newer session)
          targetIdx = currentIdx <= 0 ? sorted.length - 1 : currentIdx - 1
        } else {
          // Next (older session)
          targetIdx = currentIdx >= sorted.length - 1 ? 0 : currentIdx + 1
        }
        const target = sorted[targetIdx]
        if (target) {
          window.dispatchEvent(new CustomEvent('aipa:openSession', { detail: target.sessionId }))
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setSidebarOpen, setSidebarTab, toggleSidebar, toggleTerminal, toggleCommandPalette, toggleFocusMode])
}
