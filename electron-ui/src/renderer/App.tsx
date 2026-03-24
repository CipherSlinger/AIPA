import React, { useEffect } from 'react'
import AppShell from './components/layout/AppShell'
import { usePrefsStore, useChatStore, useUiStore } from './store'
import './styles/globals.css'
import 'highlight.js/styles/github-dark.css'

export default function App() {
  const { prefs, setPrefs, setLoaded } = usePrefsStore()
  const { setWorkingDir } = useChatStore()
  const { toggleSidebar, toggleTerminal, setSidebarTab } = useUiStore()

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

      // First-run: open settings if no API key
      if (!all.apiKey && !env.apiKey) {
        setSidebarTab('settings')
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

  return <AppShell />
}
