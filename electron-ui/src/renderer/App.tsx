import React, { useEffect, useState } from 'react'
import AppShell from './components/layout/AppShell'
import OnboardingWizard from './components/onboarding/OnboardingWizard'
import ErrorBoundary from './components/shared/ErrorBoundary'
import CommandPalette from './components/shared/CommandPalette'
import ShortcutCheatsheet from './components/shared/ShortcutCheatsheet'
import { ToastContainer } from './components/ui/Toast'
import { usePrefsStore, useChatStore, useSessionStore, useUiStore } from './store'
import './styles/globals.css'
import 'highlight.js/styles/github-dark.css'

export default function App() {
  const { prefs, setPrefs, setLoaded } = usePrefsStore()
  const { setWorkingDir } = useChatStore()
  const { toggleSidebar, toggleTerminal, commandPaletteOpen, setCommandPaletteOpen, toggleCommandPalette, toggleFocusMode, focusMode, setSidebarOpen, setSidebarTab, toasts, removeToast } = useUiStore()
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)

  // Load preferences on startup
  useEffect(() => {
    const init = async () => {
      const all = await window.electronAPI.prefsGetAll()
      const env = await window.electronAPI.configGetEnv()
      const home = await window.electronAPI.fsGetHome()

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
    ]
    return () => cleanups.forEach((fn) => fn?.())
  }, [])

  // Apply theme
  useEffect(() => {
    const theme = prefs.theme || 'vscode'
    if (theme === 'vscode') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', theme)
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
        useChatStore.getState().clearMessages()
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
