import React, { Suspense, lazy, useEffect, useRef, useState } from 'react'
import AppShell from './components/layout/AppShell'
import ErrorBoundary from './components/shared/ErrorBoundary'
import { ToastContainer } from './components/ui/Toast'
import { usePrefsStore, useChatStore, useUiStore, useSessionStore, useDepartmentStore } from './store'
import { useAppShortcuts } from './hooks/useAppShortcuts'
import { useAppEventBridge } from './hooks/useAppEventBridge'
import { useContextHealth } from './hooks/useContextHealth'
import { cancelDeptBudgetSync, scheduleDeptBudgetSync } from './components/departments/deptBudgetSync'
import { cancelDeptHandbookSync, scheduleDeptHandbookSync } from './components/departments/deptHandbookSync'
import { populateDefaultPresetsIfEmpty } from './utils/presetPopulator'
import { purgeTrashedWorkflows } from './lib/workflowTrash'
import { listSessionsShared } from './utils/sessionListShared'
import { useI18n, useT } from './i18n'
import './styles/globals.css'
import 'highlight.js/styles/github-dark.css'

// PERF: overlays are only shown on demand — split them out of the initial bundle.
const OnboardingWizard = lazy(() => import('./components/onboarding/OnboardingWizard'))
const CommandPalette = lazy(() => import('./components/ui/CommandPalette'))
const SessionQuickSwitcher = lazy(() => import('./components/shared/SessionQuickSwitcher'))
const ShortcutCheatsheet = lazy(() => import('./components/shared/ShortcutCheatsheet'))
const GlobalSearchOverlay = lazy(() => import('./components/search/GlobalSearchOverlay'))

export default function App() {
  const prefs = usePrefsStore(s => s.prefs)
  // The org tree lives in its own store; `prefs` never holds it.
  const departments = useDepartmentStore(s => s.departments)
  const setPrefs = usePrefsStore(s => s.setPrefs)
  const setLoaded = usePrefsStore(s => s.setLoaded)
  const setWorkingDir = useChatStore(s => s.setWorkingDir)
  const toggleSidebar = useUiStore(s => s.toggleSidebar)
  const commandPaletteOpen = useUiStore(s => s.commandPaletteOpen)
  const setCommandPaletteOpen = useUiStore(s => s.setCommandPaletteOpen)
  const toggleCommandPalette = useUiStore(s => s.toggleCommandPalette)
  const sessionSwitcherOpen = useUiStore(s => s.sessionSwitcherOpen)
  const setSessionSwitcherOpen = useUiStore(s => s.setSessionSwitcherOpen)
  const globalSearchOpen = useUiStore(s => s.globalSearchOpen)
  const toggleFocusMode = useUiStore(s => s.toggleFocusMode)
  const toasts = useUiStore(s => s.toasts)
  const removeToast = useUiStore(s => s.removeToast)
  const t = useT()
  // The handbook snapshot carries the *display* name, so it is written per
  // interface language; a language switch re-syncs even when the tree is
  // otherwise unchanged.
  const { resolvedLocale } = useI18n()
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const initCalledRef = useRef(false)

  // Load preferences on startup
  useEffect(() => {
    const init = async () => {
      if (initCalledRef.current) return
      initCalledRef.current = true
      // Helper: wrap an IPC call with a per-call timeout (3s per call, avoids total-hang)
      const withTimeout = <T,>(promise: Promise<T>, label: string, timeoutMs = 3000): Promise<T | null> => {
        let timer: ReturnType<typeof setTimeout> | undefined
        const timeout = new Promise<null>(resolve => {
          timer = setTimeout(() => {
            console.warn(`[AIPA] ${label} timed out (${timeoutMs}ms)`)
            resolve(null)
          }, timeoutMs)
        })
        // Clear the timer when the real call wins the race — otherwise the
        // loser still fires 3s later and logs a false "timed out" warning.
        return Promise.race([
          promise.then(v => { console.log(`[AIPA] ${label} OK`); return v }),
          timeout,
        ]).finally(() => clearTimeout(timer))
      }

      try {
        // Guard: verify electronAPI is available (preload might have failed)
        if (!window.electronAPI) {
          console.error('[AIPA] window.electronAPI is undefined — preload script may have failed')
          setLoaded(true)
          return
        }

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

        // Expired "Recently deleted" entries leave at launch, not only when the
        // Employees page happens to be opened: a user who never returns there
        // should still have a bounded holding area.
        const purgedTrash = purgeTrashedWorkflows(all.trashedWorkflows)
        if (purgedTrash.removed > 0) {
          all.trashedWorkflows = purgedTrash.entries
          setPrefs({ trashedWorkflows: purgedTrash.entries })
          window.electronAPI.prefsSet('trashedWorkflows', purgedTrash.entries)
        }
        // Skill folders live in userData; main owns their retention window and
        // this is just the earliest convenient nudge. Failure is harmless —
        // the next launch or the Employees page tries again.
        window.electronAPI.skillsTrashPurge().catch(() => { /* best effort */ })
        // Deleted conversations are files under userData too; a user who never
        // opens the Employees page should still have a bounded holding area.
        window.electronAPI.sessionsTrashPurge().catch(() => { /* best effort */ })
        // Deleted jobs are records in a manifest under userData; same window,
        // same bounded holding area, same best-effort nudge.
        window.electronAPI.automationTrashPurge().catch(() => { /* best effort */ })

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

        // Preload sessions into store so DepartmentPanel and other components
        // have data immediately without waiting for their own mount effects.
        // Kept as one promise: the resume-last-session branch below reuses this
        // result instead of issuing a second identical round trip — the first
        // list of a launch can be a full corpus scan.
        const sessionsPromise = listSessionsShared()
          .then((list: any) => {
            if (list) useSessionStore.getState().setSessions(list)
            return list as any[] | null
          })

        // Store home dir for path normalization (~ expansion)
        useSessionStore.getState().setHomeDir(home)

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
            const sessions = await sessionsPromise
            if (sessions && sessions.length > 0) {
              // Sessions are sorted by timestamp descending -- first entry is most recent
              const mostRecent = sessions.sort((a: any, b: any) => b.timestamp - a.timestamp)[0]
              if (mostRecent) {
                // The app-level event bridge owns opening sessions; it is
                // already listening by the time this await resolves.
                window.dispatchEvent(new CustomEvent('aipa:openSession', { detail: mostRecent.sessionId }))
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

  // A department cap stores the org node ids it covers, and main has no tree to
  // resolve them. This runs app-wide, not inside the Brief, because a node added
  // to a department must join an existing cap even when the user never opens
  // that department's page; otherwise the cap silently covers less than the
  // user asked for. The module debounces, deduplicates and swallows failures.
  useEffect(() => {
    scheduleDeptBudgetSync(departments)
    return cancelDeptBudgetSync
  }, [departments])

  // Same app-wide reasoning for the handbook snapshot: main assembles
  // scheduled runs and cannot read this tree, so a job filed under a
  // department would run without the rules its conversations carry. Every
  // handbook edit, rename and delete lands in `departments`, and the sync
  // module debounces, deduplicates and swallows failures.
  useEffect(() => {
    scheduleDeptHandbookSync(departments, resolvedLocale)
    return cancelDeptHandbookSync
  }, [departments, resolvedLocale])

  // Probe once whether "Ask AIPA about your history" can run here, so the
  // command palette never offers a command whose overlay row is hidden for
  // lack of an authenticated engine. A failed probe leaves `null`, which the
  // palette treats as available — a slow or broken probe must not hide a
  // working command.
  useEffect(() => {
    if (!window.electronAPI?.sessionAskHistoryStatus) return
    let cancelled = false
    Promise.resolve(window.electronAPI.sessionAskHistoryStatus())
      .then(result => {
        if (!cancelled) {
          useUiStore.getState().setAskHistoryAvailable(Boolean(result?.available))
        }
      })
      .catch(() => { /* leave null; the command stays visible */ })
    return () => { cancelled = true }
  }, [])

  // Listen for CLI notification events and surface them as info toasts
  useEffect(() => {
    if (!window.electronAPI?.onNotification) return
    const unsub = window.electronAPI.onNotification((data) => {
      const text = data.title
        ? `${data.title}: ${data.message}`
        : data.message
      if (text) useUiStore.getState().addToast('info', text)
    })
    return () => unsub?.()
  }, [])

  // Listen for CLI system.init events to sync active model and MCP server state
  useEffect(() => {
    if (!window.electronAPI?.onSystemInit) return
    const unsub = window.electronAPI.onSystemInit((data) => {
      if (data.model) usePrefsStore.getState().setActiveModel(data.model)
      if (data.mcpServers) {
        usePrefsStore.getState().setActiveMcpServers(
          data.mcpServers as unknown as Record<string, unknown>[]
        )
        // Build serverName -> toolNames map from the enriched mcpServers data
        const toolMap: Record<string, string[]> = {}
        for (const srv of data.mcpServers) {
          if (srv.tools && srv.tools.length > 0) {
            toolMap[srv.name] = srv.tools
          }
        }
        usePrefsStore.getState().setMcpServerTools(toolMap)
      }
    })
    return () => unsub?.()
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
      // Menu / tray: Automations > Manage Automations -- land on that tab
      window.electronAPI.onMenuEvent('openAutomations', () => {
        useUiStore.getState().openSettingsAt('automations')
      }),
      // Menu: Help > Keyboard Shortcuts (Ctrl+/)
      window.electronAPI.onMenuEvent('keyboardShortcuts', () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, key: '/' }))
      }),
    ]
    return () => cleanups.forEach((fn) => fn?.())
  }, [])

  // Flash title on streaming end; keep title in sync with session name
  useEffect(() => {
    let prevStreaming = false
    let flashTimer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = useChatStore.subscribe((state) => {
      const wasStreaming = prevStreaming
      prevStreaming = state.isStreaming
      const baseTitle = state.currentSessionTitle ? `AIPA — ${state.currentSessionTitle}` : 'AIPA'
      if (wasStreaming && !state.isStreaming && state.messages.length > 0) {
        clearTimeout(flashTimer)
        document.title = `(*) ${baseTitle}`
        flashTimer = setTimeout(() => { document.title = baseTitle }, 3000)
      } else if (!state.isStreaming && document.title !== baseTitle) {
        document.title = baseTitle
      }
    })
    return () => { unsubscribe(); clearTimeout(flashTimer) }
  }, [])

  // Apply theme (supports 'system' for OS-level dark/light auto-detection)
  useEffect(() => {
    const applyEffectiveTheme = (effective: 'vscode' | 'light') => {
      if (effective === 'vscode') {
        document.documentElement.removeAttribute('data-theme')
        window.electronAPI.windowSetTitleBarOverlay({ color: '#0f0f19', symbolColor: '#cccccc' })
      } else {
        document.documentElement.setAttribute('data-theme', 'light')
        window.electronAPI.windowSetTitleBarOverlay({ color: '#f8f8f8', symbolColor: '#1a1a1a' })
      }
    }

    const theme = prefs.theme || 'light'
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
    toggleCommandPalette, toggleFocusMode, setShowShortcuts, setPrefs,
  )

  // Session-open and search-focus events from the tray, palette, switcher and
  // shortcuts share one listener, mounted here.
  useAppEventBridge()

  // Context health + cost threshold warnings (inspired by Claude Code)
  useContextHealth()

  return (
    <div
      style={{
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        height: '100vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
    <ErrorBoundary fallbackLabel="application" overlay>
      <>
        <Suspense fallback={null}>
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
        </Suspense>
        <AppShell />
        <ToastContainer toasts={toasts} onDismiss={removeToast} />
        <Suspense fallback={null}>
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
          {sessionSwitcherOpen && (
            <SessionQuickSwitcher onClose={() => setSessionSwitcherOpen(false)} />
          )}
          {globalSearchOpen && <GlobalSearchOverlay />}
        </Suspense>
      </>
    </ErrorBoundary>
    </div>
  )
}
