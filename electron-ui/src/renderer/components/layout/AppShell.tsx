import React, { useEffect, useRef, useState } from 'react'
import { useChatStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import Sidebar from './Sidebar'
import NavRail from './NavRail'
import ChatPanel from '../chat/ChatPanel'
import StatusBar from './StatusBar'
import ErrorBoundary from '../shared/ErrorBoundary'
import { ArrowLeft, X } from 'lucide-react'

const SettingsPanel = React.lazy(() => import('../settings/SettingsPanel'))
const PersonaEditorPage = React.lazy(() => import('../settings/PersonaEditorPage'))
const WorkflowEditorPage = React.lazy(() => import('../settings/WorkflowEditorPage'))

const MIN_SIDEBAR = 180
const MAX_SIDEBAR = 400

export default function AppShell() {
  const t = useT()
  const sidebarOpen = useUiStore(s => s.sidebarOpen)
  const setSidebarOpen = useUiStore(s => s.setSidebarOpen)
  const focusMode = useUiStore(s => s.focusMode)
  const mainView = useUiStore(s => s.mainView)
  const closeSettings = useUiStore(s => s.closeSettingsModal)
  const currentSessionTitle = useChatStore(s => s.currentSessionTitle)
  const [sidebarWidth, setSidebarWidth] = useState(240)
  const draggingRef = useRef<'sidebar' | null>(null)

  useEffect(() => {
    const loadWidths = async () => {
      try {
        // Use timeout to prevent hanging if IPC is not ready
        const prefs = await Promise.race([
          window.electronAPI.prefsGetAll(),
          new Promise<null>(resolve => setTimeout(() => resolve(null), 3000)),
        ])
        if (prefs?.sidebarWidth) setSidebarWidth(Math.min(Math.max(prefs.sidebarWidth, MIN_SIDEBAR), MAX_SIDEBAR))
      } catch {
        // Ignore -- use default sidebar width
      }
    }
    loadWidths()
  }, [])

  // Auto-collapse sidebar (SessionPanel) on narrow windows
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 600 && useUiStore.getState().sidebarOpen) {
        setSidebarOpen(false)
      }
    }
    window.addEventListener('resize', handleResize)
    // Check on mount too
    handleResize()
    return () => window.removeEventListener('resize', handleResize)
  }, [setSidebarOpen])

  // Close settings/editor page on Escape
  useEffect(() => {
    if (mainView === 'chat') return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        if (mainView === 'persona-editor' || mainView === 'workflow-editor') {
          // Go back to settings, not chat
          useUiStore.getState().setMainView('settings')
        } else {
          closeSettings()
        }
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [mainView, closeSettings])

  const startDrag = (which: 'sidebar') => (e: React.MouseEvent) => {
    e.preventDefault()
    draggingRef.current = which
    const startX = e.clientX
    const startWidth = sidebarWidth

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX
      const newWidth = Math.min(Math.max(startWidth + delta, MIN_SIDEBAR), MAX_SIDEBAR)
      setSidebarWidth(newWidth)
    }

    const onUp = (ev: MouseEvent) => {
      draggingRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      const delta = ev.clientX - startX
      const finalWidth = Math.min(Math.max(startWidth + delta, MIN_SIDEBAR), MAX_SIDEBAR)
      window.electronAPI.prefsSet('sidebarWidth', finalWidth)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--bg-primary)' }} role="application" aria-label="AIPA">
      {/* Title bar drag region -- spans all three columns */}
      <div
        className="drag-region"
        role="banner"
        onDoubleClick={() => window.electronAPI.windowToggleMaximize()}
        style={{
          height: 32,
          background: 'var(--bg-nav)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          userSelect: 'none',
        }}
      >
        <span style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          opacity: 0.7,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '60%',
          pointerEvents: 'none',
        }}>
          {currentSessionTitle ? `AIPA — ${currentSessionTitle}` : 'AIPA'}
        </span>
      </div>

      {/* Main content: NavRail + SessionPanel + ChatPanel */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          flex: 1,
          overflow: 'hidden',
        }}
      >
        {/* NavRail — always visible unless in focus mode */}
        {!focusMode && (
          <ErrorBoundary fallbackLabel="nav rail">
            <NavRail />
          </ErrorBoundary>
        )}

        {/* SessionPanel (Sidebar) — toggleable via Ctrl+B, animated slide */}
        {!focusMode && (
          <>
            <div
              role="complementary"
              aria-label={t('a11y.sessionList')}
              style={{
                width: sidebarOpen ? sidebarWidth : 0,
                flexShrink: 0,
                overflow: 'hidden',
                background: 'var(--bg-sessionpanel)',
                transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease',
                opacity: sidebarOpen ? 1 : 0,
              }}
            >
              <Sidebar />
            </div>
            {/* Sidebar resize handle */}
            {sidebarOpen && (
            <div
              className="resizer"
              style={{ width: 4, flexShrink: 0, background: 'var(--border)', cursor: 'col-resize', transition: 'background 0.15s' }}
              onMouseDown={startDrag('sidebar')}
              onDoubleClick={() => { setSidebarWidth(240); window.electronAPI.prefsSet('sidebarWidth', 240) }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--border)')}
            />
            )}
          </>
        )}

        {/* Main content area -- ChatPanel, Settings, or Editor pages */}
        <div
          role="main"
          aria-label={mainView === 'settings' ? t('settings.title') : t('a11y.chatArea')}
          style={{
            flex: 1,
            overflow: 'hidden',
            background: 'var(--bg-chat)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {mainView === 'settings' ? (
            <ErrorBoundary fallbackLabel="settings page">
              {/* Settings page header */}
              <div style={{
                height: 44,
                background: 'var(--chat-header-bg)',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                padding: '0 16px',
                flexShrink: 0,
                gap: 12,
              }}>
                <button
                  onClick={closeSettings}
                  title={t('settings.backToChat')}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
                    padding: 4, borderRadius: 4,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
                >
                  <ArrowLeft size={16} />
                </button>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
                  {t('settings.title')}
                </span>
                <button
                  onClick={closeSettings}
                  title={t('settings.close')}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
                    padding: 4, borderRadius: 4,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
                >
                  <X size={16} />
                </button>
              </div>
              {/* Settings content */}
              <div style={{
                flex: 1, overflow: 'auto',
                display: 'flex', justifyContent: 'center',
              }}>
                <div style={{ width: '100%', maxWidth: 800 }}>
                  <React.Suspense fallback={<div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading...</div>}>
                    <SettingsPanel />
                  </React.Suspense>
                </div>
              </div>
            </ErrorBoundary>
          ) : mainView === 'persona-editor' ? (
            <ErrorBoundary fallbackLabel="persona editor">
              <React.Suspense fallback={<div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading...</div>}>
                <PersonaEditorPage />
              </React.Suspense>
            </ErrorBoundary>
          ) : mainView === 'workflow-editor' ? (
            <ErrorBoundary fallbackLabel="workflow editor">
              <React.Suspense fallback={<div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading...</div>}>
                <WorkflowEditorPage />
              </React.Suspense>
            </ErrorBoundary>
          ) : (
            <ErrorBoundary fallbackLabel="chat panel">
              <ChatPanel />
            </ErrorBoundary>
          )}
        </div>

      </div>

      {/* Status bar */}
      <StatusBar />
    </div>
  )
}
