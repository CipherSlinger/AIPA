import React, { useEffect, useState } from 'react'
import AppShell from './components/layout/AppShell'
import OnboardingWizard from './components/onboarding/OnboardingWizard'
import ErrorBoundary from './components/shared/ErrorBoundary'
import CommandPalette from './components/shared/CommandPalette'
import ShortcutCheatsheet from './components/shared/ShortcutCheatsheet'
import { ToastContainer } from './components/ui/Toast'
import { usePrefsStore, useChatStore, useUiStore } from './store'
import { useAppShortcuts } from './hooks/useAppShortcuts'
import { useContextHealth } from './hooks/useContextHealth'
import { populateDefaultPresetsIfEmpty } from './utils/presetPopulator'
import { useT } from './i18n'
import './styles/globals.css'
import 'highlight.js/styles/github-dark.css'

export default function App() {
  const prefs = usePrefsStore(s => s.prefs)
  const setPrefs = usePrefsStore(s => s.setPrefs)
  const setLoaded = usePrefsStore(s => s.setLoaded)
  const setWorkingDir = useChatStore(s => s.setWorkingDir)
  const toggleSidebar = useUiStore(s => s.toggleSidebar)
  const commandPaletteOpen = useUiStore(s => s.commandPaletteOpen)
  const setCommandPaletteOpen = useUiStore(s => s.setCommandPaletteOpen)
  const toggleCommandPalette = useUiStore(s => s.toggleCommandPalette)
  const toggleFocusMode = useUiStore(s => s.toggleFocusMode)
  const setSidebarOpen = useUiStore(s => s.setSidebarOpen)
  const setSidebarTab = useUiStore(s => s.setSidebarTab)
  const toasts = useUiStore(s => s.toasts)
  const removeToast = useUiStore(s => s.removeToast)
  const t = useT()
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)

  // Remove splash screen once React has mounted
  useEffect(() => {
    console.log('[AIPA] React mounted — removing splash screen')
    const splash = document.getElementById('aipa-splash')
    if (splash) {
      splash.style.opacity = '0'
      setTimeout(() => { splash.style.display = 'none' }, 300)
    }
    if ((window as any).__aipaSplashTimer) {
      clearTimeout((window as any).__aipaSplashTimer)
    }
  }, [])

  // Load preferences on startup
  useEffect(() => {
    const init = async () => {
      // Helper: wrap an IPC call with a per-call timeout (3s per call, avoids total-hang)
      const withTimeout = <T,>(promise: Promise<T>, label: string, timeoutMs = 3000): Promise<T | null> => {
        return Promise.race([
          promise.then(v => { console.log(`[AIPA] ${label} OK`); return v }),
          new Promise<null>(resolve => setTimeout(() => {
            console.warn(`[AIPA] ${label} timed out (${timeoutMs}ms)`)
            resolve(null)
          }, timeoutMs)),
        ])
      }

      try {
        console.log('[AIPA] Starting preference load...')
        const all = await withTimeout(window.electronAPI.prefsGetAll(), 'prefsGetAll') || {} as any
        const env = await withTimeout(window.electronAPI.configGetEnv(), 'configGetEnv') || { apiKey: '', hasApiKey: false }
        const home = await withTimeout(window.electronAPI.fsGetHome(), 'fsGetHome') || '/home'

        // Migrate removed themes (modern, minimal) to 'vscode' (Dark)
        if (all.theme === 'modern' || all.theme === 'minimal') {
          all.theme = 'vscode'
          window.electronAPI.prefsSet('theme', 'vscode')
        }

        setPrefs({
          ...all,
          apiKey: all.apiKey || env.apiKey || '',
        })

        // Auto-populate default personas and workflows on first launch (Iteration 405)
        populateDefaultPresetsIfEmpty(all)

        // Default working dir: ~/claude (auto-create if not saved yet)
        const workingDir = all.workingDir || `${home}/claude`
        if (!all.workingDir) {
          try {
            await window.electronAPI.fsEnsureDir(workingDir)
          } catch (dirErr) {
            console.warn('[AIPA] fsEnsureDir failed (non-fatal):', dirErr)
          }
          window.electronAPI.prefsSet('workingDir', workingDir)
        }
        setWorkingDir(workingDir)
        setLoaded(true)
        console.log('[AIPA] Preferences loaded successfully')

        // First-run: show onboarding if never completed before.
        // If an API key already exists (env or store), silently mark done and skip.
        if (!all.onboardingDone) {
          if (all.apiKey || env.apiKey) {
            window.electronAPI.prefsSet('onboardingDone', true)
          } else {
            setShowOnboarding(true)
          }
        }

        // Resume last session on startup (if enabled and no onboarding needed)
        if (all.resumeLastSession && all.onboardingDone) {
          try {
            const sessions = await window.electronAPI.sessionList()
            if (sessions && sessions.length > 0) {
              // Sessions are sorted by timestamp descending -- first entry is most recent
              const mostRecent = sessions.sort((a: any, b: any) => b.timestamp - a.timestamp)[0]
              if (mostRecent) {
                // Dispatch after a short delay to ensure SessionList is mounted and listening
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('aipa:openSession', { detail: mostRecent.sessionId }))
                }, 300)
              }
            }
          } catch { /* session resume is best-effort */ }
        }
      } catch (err: unknown) {
        // Preference loading failed -- use defaults to prevent black screen
        console.error('[AIPA] Failed to load preferences:', err)
        setLoaded(true)
        useUiStore.getState().addToast('error', t('startup.prefsLoadFailed'))
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
          setPrefs({ theme: newTheme as 'vscode' | 'light' | 'system' })
        }
      }),
      // Tray: clipboard quick action -- populate chat input with clipboard text
      window.electronAPI.onMenuEvent('clipboardQuickAction', (clipboardText) => {
        if (typeof clipboardText === 'string' && clipboardText) {
          const ui = useUiStore.getState()
          ui.setQuotedText(clipboardText)
          window.dispatchEvent(new CustomEvent('aipa:focusInput'))
        }
      }),
      // Menu: export conversation (Ctrl+Shift+E via app menu)
      window.electronAPI.onMenuEvent('exportConversation', () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, shiftKey: true, key: 'E' }))
      }),
      // Menu: toggle focus mode
      window.electronAPI.onMenuEvent('toggleFocusMode', toggleFocusMode),
      // Menu: toggle always-on-top
      window.electronAPI.onMenuEvent('toggleAlwaysOnTop', () => {
        const ui = useUiStore.getState()
        const newValue = !ui.alwaysOnTop
        window.electronAPI.windowSetAlwaysOnTop(newValue)
        ui.setAlwaysOnTop(newValue)
        ui.addToast('info', t(newValue ? 'window.pinnedOn' : 'window.pinnedOff'))
      }),
      // Menu: Help > About AIPA -- open Settings modal (which contains the About section)
      window.electronAPI.onMenuEvent('about', () => {
        useUiStore.getState().openSettingsModal()
      }),
      // Menu: Edit > Settings (Ctrl+,)
      window.electronAPI.onMenuEvent('openSettings', () => {
        useUiStore.getState().openSettingsModal()
      }),
      // Menu: Help > Keyboard Shortcuts (Ctrl+/)
      window.electronAPI.onMenuEvent('keyboardShortcuts', () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, key: '/' }))
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
        // Streaming just finished -- flash title briefly
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

  // Apply theme (supports 'system' for OS-level dark/light auto-detection)
  useEffect(() => {
    const applyEffectiveTheme = (effective: 'vscode' | 'light') => {
      if (effective === 'vscode') {
        document.documentElement.removeAttribute('data-theme')
        window.electronAPI.windowSetTitleBarOverlay({ color: '#2c2c2c', symbolColor: '#cccccc' })
      } else {
        document.documentElement.setAttribute('data-theme', 'light')
        window.electronAPI.windowSetTitleBarOverlay({ color: '#f8f8f8', symbolColor: '#1a1a1a' })
      }
    }

    const theme = prefs.theme || 'vscode'
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      applyEffectiveTheme(mq.matches ? 'vscode' : 'light')
      const handler = (e: MediaQueryListEvent) => {
        applyEffectiveTheme(e.matches ? 'vscode' : 'light')
      }
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    } else {
      applyEffectiveTheme(theme === 'light' ? 'light' : 'vscode')
    }
  }, [prefs.theme])

  // Stop taskbar flash when window gets focused
  useEffect(() => {
    const handleFocus = () => {
      try { window.electronAPI.windowFlashFrame(false) } catch {}
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  // Global keyboard shortcuts (extracted to hook)
  useAppShortcuts(
    toggleSidebar, toggleCommandPalette, toggleFocusMode,
    setSidebarOpen, setSidebarTab, setShowShortcuts, setPrefs,
  )

  // Context health + cost threshold warnings (inspired by Claude Code)
  useContextHealth()

  return (
    <ErrorBoundary fallbackLabel="application" overlay>
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
              window.dispatchEvent(new CustomEvent('aipa:export'))
            }}
            onNewConversation={() => {
              useChatStore.getState().clearMessages()
            }}
            onSendSlashCommand={(cmd: string) => {
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
