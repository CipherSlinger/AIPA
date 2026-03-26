import React, { useEffect, useState } from 'react'
import AppShell from './components/layout/AppShell'
import OnboardingWizard from './components/onboarding/OnboardingWizard'
import ErrorBoundary from './components/shared/ErrorBoundary'
import { ToastContainer } from './components/ui/Toast'
import { usePrefsStore, useChatStore, useUiStore } from './store'
import './styles/globals.css'
import 'highlight.js/styles/github-dark.css'

export default function App() {
  const { prefs, setPrefs, setLoaded } = usePrefsStore()
  const { setWorkingDir } = useChatStore()
  const { toggleSidebar, toggleTerminal, toasts, removeToast } = useUiStore()
  const [showOnboarding, setShowOnboarding] = useState(false)

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
      </>
    </ErrorBoundary>
  )
}
