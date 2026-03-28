import React, { useEffect, useState } from 'react'
import AppShell from './components/layout/AppShell'
import OnboardingWizard from './components/onboarding/OnboardingWizard'
import ErrorBoundary from './components/shared/ErrorBoundary'
import CommandPalette from './components/shared/CommandPalette'
import ShortcutCheatsheet from './components/shared/ShortcutCheatsheet'
import { ToastContainer } from './components/ui/Toast'
import { usePrefsStore, useChatStore, useSessionStore, useUiStore } from './store'
import { useT } from './i18n'
import './styles/globals.css'
import 'highlight.js/styles/github-dark.css'

export default function App() {
  const prefs = usePrefsStore(s => s.prefs)
  const setPrefs = usePrefsStore(s => s.setPrefs)
  const setLoaded = usePrefsStore(s => s.setLoaded)
  const setWorkingDir = useChatStore(s => s.setWorkingDir)
  const toggleSidebar = useUiStore(s => s.toggleSidebar)
  const toggleTerminal = useUiStore(s => s.toggleTerminal)
  const commandPaletteOpen = useUiStore(s => s.commandPaletteOpen)
  const setCommandPaletteOpen = useUiStore(s => s.setCommandPaletteOpen)
  const toggleCommandPalette = useUiStore(s => s.toggleCommandPalette)
  const toggleFocusMode = useUiStore(s => s.toggleFocusMode)
  const focusMode = useUiStore(s => s.focusMode)
  const setSidebarOpen = useUiStore(s => s.setSidebarOpen)
  const setSidebarTab = useUiStore(s => s.setSidebarTab)
  const toasts = useUiStore(s => s.toasts)
  const removeToast = useUiStore(s => s.removeToast)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const t = useT()

  // Load preferences on startup
  useEffect(() => {
    const init = async () => {
      const all = await window.electronAPI.prefsGetAll()
      const env = await window.electronAPI.configGetEnv()
      const home = await window.electronAPI.fsGetHome()

      // Migrate removed themes (modern, minimal) to 'vscode' (Dark)
      if (all.theme === 'modern' || all.theme === 'minimal') {
        all.theme = 'vscode'
        window.electronAPI.prefsSet('theme', 'vscode')
      }

      setPrefs({
        ...all,
        apiKey: all.apiKey || env.apiKey || '',
      })

      // Default working dir: ~/claude (auto-create if not saved yet)
      const workingDir = all.workingDir || `${home}/claude`
      if (!all.workingDir) {
        await window.electronAPI.fsEnsureDir(workingDir)
        window.electronAPI.prefsSet('workingDir', workingDir)
      }
      setWorkingDir(workingDir)
      setLoaded(true)

      // First-run: show onboarding if never completed before.
      // If an API key already exists (env or store), silently mark done and skip.
      if (!all.onboardingDone) {
        if (all.apiKey || env.apiKey) {
          window.electronAPI.prefsSet('onboardingDone', true)
        } else {
          setShowOnboarding(true)
        }
      }
    }
    init()
  }, [])

  // Listen for menu events
  useEffect(() => {
    const cleanups = [
      window.electronAPI.onMenuEvent('newSession', () => {
        useChatStore.getState().clearMessages()
      }),
      window.electronAPI.onMenuEvent('openFolder', async () => {
        const p = await window.electronAPI.fsShowOpenDialog()
        if (p) {
          setWorkingDir(p)
          window.electronAPI.prefsSet('workingDir', p)
        }
      }),
      window.electronAPI.onMenuEvent('toggleSidebar', toggleSidebar),
      window.electronAPI.onMenuEvent('toggleTerminal', toggleTerminal),
      window.electronAPI.onMenuEvent('commandPalette', toggleCommandPalette),
      // Tray: open a specific session by ID
      window.electronAPI.onMenuEvent('openSession', (sessionId) => {
        if (typeof sessionId === 'string') {
          window.dispatchEvent(new CustomEvent('aipa:openSession', { detail: sessionId }))
        }
      }),
      // Tray: theme changed from tray menu
      window.electronAPI.onMenuEvent('themeChanged', (newTheme) => {
        if (typeof newTheme === 'string') {
          setPrefs({ theme: newTheme as 'vscode' | 'light' })
        }
      }),
      // Tray: clipboard quick action — populate chat input with clipboard text
      window.electronAPI.onMenuEvent('clipboardQuickAction', (clipboardText) => {
        if (typeof clipboardText === 'string' && clipboardText) {
          const ui = useUiStore.getState()
          // Set the clipboard text as quoted text so it shows in the chat input
          ui.setQuotedText(clipboardText)
          // Focus the chat input
          window.dispatchEvent(new CustomEvent('aipa:focusInput'))
        }
      }),
    ]
    return () => cleanups.forEach((fn) => fn?.())
  }, [])

  // Update window title with session name and unread indicator
  useEffect(() => {
    const chatTitle = useChatStore.getState().currentSessionTitle
    const baseTitle = chatTitle ? `AIPA — ${chatTitle}` : 'AIPA'
    document.title = baseTitle
  }, [prefs])

  // Listen for streaming end to flash title if user is scrolled away
  useEffect(() => {
    let prevStreaming = false
    const unsubscribe = useChatStore.subscribe((state) => {
      const wasStreaming = prevStreaming
      prevStreaming = state.isStreaming

      // Update title with session name
      const chatTitle = state.currentSessionTitle
      const baseTitle = chatTitle ? `AIPA — ${chatTitle}` : 'AIPA'

      if (wasStreaming && !state.isStreaming && state.messages.length > 0) {
        // Streaming just finished — flash title briefly
        document.title = `(*) ${baseTitle}`
        setTimeout(() => {
          document.title = baseTitle
        }, 3000)
      } else if (!state.isStreaming) {
        document.title = baseTitle
      }
    })
    return unsubscribe
  }, [])

  // Apply theme
  useEffect(() => {
    const theme = prefs.theme || 'vscode'
    if (theme === 'vscode') {
      document.documentElement.removeAttribute('data-theme')
      window.electronAPI.windowSetTitleBarOverlay({ color: '#2c2c2c', symbolColor: '#cccccc' })
    } else if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', theme)
      window.electronAPI.windowSetTitleBarOverlay({ color: '#f8f8f8', symbolColor: '#1a1a1a' })
    } else {
      document.documentElement.setAttribute('data-theme', theme)
      window.electronAPI.windowSetTitleBarOverlay({ color: '#2c2c2c', symbolColor: '#cccccc' })
    }
  }, [prefs.theme])

  // Global keyboard shortcuts (renderer-side, supplements menu accelerators)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+L: Focus chat input
      if (e.ctrlKey && !e.shiftKey && e.key === 'l') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('aipa:focusInput'))
      }
      // Ctrl+,: Open settings
      if (e.ctrlKey && !e.shiftKey && e.key === ',') {
        e.preventDefault()
        setSidebarOpen(true)
        setSidebarTab('settings')
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
          // Show brief toast warning — use double-press pattern
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
      // Ctrl+Shift+F: Focus mode (hide sidebar + terminal)
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
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

  return (
    <ErrorBoundary fallbackLabel="application">
      <>
        {showOnboarding && (
          <OnboardingWizard onComplete={async () => {
            // Reload prefs so prefsStore reflects the workingDir set during onboarding
            const all = await window.electronAPI.prefsGetAll()
            const env = await window.electronAPI.configGetEnv()
            setPrefs({ ...all, apiKey: all.apiKey || env.apiKey || '' })
            if (all.workingDir) setWorkingDir(all.workingDir)
            setShowOnboarding(false)
          }} />
        )}
        <AppShell />
        <ToastContainer toasts={toasts} onDismiss={removeToast} />
        {commandPaletteOpen && (
          <CommandPalette
            onClose={() => setCommandPaletteOpen(false)}
            onExport={async () => {
              // Trigger export via a custom event that ChatPanel listens for
              window.dispatchEvent(new CustomEvent('aipa:export'))
            }}
            onNewConversation={() => {
              useChatStore.getState().clearMessages()
            }}
            onSendSlashCommand={(cmd: string) => {
              // Dispatch a custom event that ChatPanel can handle
              window.dispatchEvent(new CustomEvent('aipa:slashCommand', { detail: cmd }))
            }}
          />
        )}
        {showShortcuts && (
          <ShortcutCheatsheet onClose={() => setShowShortcuts(false)} />
        )}
      </>
    </ErrorBoundary>
  )
}
