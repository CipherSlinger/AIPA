import React, { useEffect, useRef, useState } from 'react'
import { useChatStore, useUiStore } from '../../store'
import { useT } from '../../i18n'
import Sidebar from './Sidebar'
import NavRail from './NavRail'
import ChatPanel from '../chat/ChatPanel'
import StatusBar from './StatusBar'
import ErrorBoundary from '../shared/ErrorBoundary'
import { ArrowLeft } from 'lucide-react'

const SettingsPanel = React.lazy(() => import('../settings/SettingsPanel'))
const PersonaEditorPage = React.lazy(() => import('../settings/PersonaEditorPage'))
const WorkflowEditorPage = React.lazy(() => import('../settings/WorkflowEditorPage'))
const WorkflowDetailPage = React.lazy(() => import('../workflows/WorkflowDetailPage'))
const NotesPanel = React.lazy(() => import('../notes/NotesPanel'))
const SkillCreatorPage = React.lazy(() => import('../skills/SkillCreatorPage'))
const SkillMarketplacePage = React.lazy(() => import('../skills/SkillMarketplacePage'))
const DepartmentDashboard = React.lazy(() => import('../departments/DepartmentDashboard'))

const MIN_SIDEBAR = 180
const MAX_SIDEBAR = 400

/** Shimmer skeleton shown while lazy panels load */
function PanelSkeleton() {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      padding: '32px 40px',
      overflow: 'hidden',
    }}>
      {[80, 60, 90, 55, 70].map((w, i) => (
        <div
          key={i}
          style={{
            height: 14,
            width: `${w}%`,
            borderRadius: 6,
            background: 'var(--bg-hover)',
            animation: 'shimmer 1.6s ease-in-out infinite',
            animationDelay: `${i * 0.12}s`,
          }}
        />
      ))}
    </div>
  )
}

export default function AppShell() {
  const t = useT()
  const sidebarOpen = useUiStore(s => s.sidebarOpen)
  const setSidebarOpen = useUiStore(s => s.setSidebarOpen)
  const focusMode = useUiStore(s => s.focusMode)
  const mainView = useUiStore(s => s.mainView)
  const closeSettings = useUiStore(s => s.closeSettingsModal)
  const currentSessionTitle = useChatStore(s => s.currentSessionTitle)
  const [sidebarWidth, setSidebarWidth] = useState(240)
  const [isDragging, setIsDragging] = useState(false)
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
        if (mainView === 'department') {
          // Escape from department dashboard goes to chat
          useUiStore.getState().setMainView('chat')
        } else if (mainView === 'workflow-detail') {
          // Go back to chat from workflow detail
          useUiStore.getState().setMainView('chat')
        } else if (mainView === 'persona-editor' || mainView === 'workflow-editor') {
          // Go back to settings, not chat
          useUiStore.getState().setMainView('settings')
        } else if (mainView === 'notes') {
          // Go back to chat from notes main view
          useUiStore.getState().setMainView('chat')
          useUiStore.getState().setActiveNavItem('chat')
        } else if (mainView === 'skill-creator') {
          // Go back to chat from skill creator
          useUiStore.getState().setMainView('chat')
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
    setIsDragging(true)
    const startX = e.clientX
    const startWidth = sidebarWidth

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX
      const newWidth = Math.min(Math.max(startWidth + delta, MIN_SIDEBAR), MAX_SIDEBAR)
      setSidebarWidth(newWidth)
    }

    const onUp = (ev: MouseEvent) => {
      draggingRef.current = null
      setIsDragging(false)
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
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--bg-chat)' }} role="application" aria-label="AIPA">
      {/* Skip-to-content link for keyboard accessibility */}
      <a href="#main-content" className="skip-link">{t('a11y.skipToContent')}</a>
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
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '60%',
          pointerEvents: 'none',
          letterSpacing: '0.01em',
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
          // Prevent text selection cursor during drag
          userSelect: isDragging ? 'none' : undefined,
          cursor: isDragging ? 'col-resize' : undefined,
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
                background: 'var(--bg-chat)',
                borderRight: sidebarOpen ? '1px solid var(--border)' : 'none',
                transition: 'all 0.15s ease',
                opacity: sidebarOpen ? 1 : 0,
                position: 'relative',
              }}
            >
              <Sidebar />
              {/* Semi-transparent overlay during active drag */}
              {isDragging && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(0,0,0,0.02)',
                  pointerEvents: 'none',
                }} />
              )}
            </div>
            {/* Sidebar resize handle */}
            {sidebarOpen && (
            <div
              className="resizer"
              style={{
                width: 4,
                flexShrink: 0,
                background: isDragging ? 'rgba(99,102,241,0.40)' : 'var(--bg-hover)',
                cursor: 'col-resize',
                transition: 'all 0.15s ease',
              }}
              onMouseDown={startDrag('sidebar')}
              onDoubleClick={() => { setSidebarWidth(240); window.electronAPI.prefsSet('sidebarWidth', 240) }}
              onMouseEnter={(e) => { if (!isDragging) e.currentTarget.style.background = 'rgba(99,102,241,0.40)' }}
              onMouseLeave={(e) => { if (!isDragging) e.currentTarget.style.background = 'var(--bg-hover)' }}
            />
            )}
          </>
        )}

        {/* Main content area -- ChatPanel, Settings, or Editor pages */}
        <div
          id="main-content"
          role="main"
          aria-label={mainView === 'settings' ? t('settings.title') : t('a11y.chatArea')}
          style={{
            flex: 1,
            overflow: 'hidden',
            background: 'var(--bg-chat)',
            display: 'flex',
            flexDirection: 'column',
            transition: 'all 0.15s ease',
          }}
        >
          {mainView === 'department' ? (
            <ErrorBoundary fallbackLabel="department dashboard">
              <React.Suspense fallback={<PanelSkeleton />}>
                <DepartmentDashboard />
              </React.Suspense>
            </ErrorBoundary>
          ) : mainView === 'settings' ? (
            <ErrorBoundary fallbackLabel="settings page">
              {/* Settings page header */}
              <div style={{
                height: 44,
                background: 'var(--popup-bg)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                padding: '0 16px',
                flexShrink: 0,
                gap: 12,
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              }}>
                <button
                  onClick={closeSettings}
                  title={t('settings.backToChat')}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
                    padding: 4, borderRadius: 8,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--bg-hover)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none' }}
                >
                  <ArrowLeft size={16} />
                </button>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1, lineHeight: 1.3 }}>
                  {t('settings.title')}
                </span>
              </div>
              {/* Settings content */}
              <div style={{
                flex: 1, overflow: 'auto',
                display: 'flex', justifyContent: 'center',
              }}>
                <div style={{ width: '100%', maxWidth: 800 }}>
                  <React.Suspense fallback={<PanelSkeleton />}>
                    <SettingsPanel />
                  </React.Suspense>
                </div>
              </div>
            </ErrorBoundary>
          ) : mainView === 'persona-editor' ? (
            <ErrorBoundary fallbackLabel="persona editor">
              <React.Suspense fallback={<PanelSkeleton />}>
                <PersonaEditorPage />
              </React.Suspense>
            </ErrorBoundary>
          ) : mainView === 'workflow-editor' ? (
            <ErrorBoundary fallbackLabel="workflow editor">
              <React.Suspense fallback={<PanelSkeleton />}>
                <WorkflowEditorPage />
              </React.Suspense>
            </ErrorBoundary>
          ) : mainView === 'workflow-detail' ? (
            <ErrorBoundary fallbackLabel="workflow detail">
              <React.Suspense fallback={<PanelSkeleton />}>
                <WorkflowDetailPage />
              </React.Suspense>
            </ErrorBoundary>
          ) : mainView === 'notes' ? (
            <ErrorBoundary fallbackLabel="notes panel">
              <React.Suspense fallback={<PanelSkeleton />}>
                <NotesPanel />
              </React.Suspense>
            </ErrorBoundary>
          ) : mainView === 'skill-creator' ? (
            <ErrorBoundary fallbackLabel="skill creator">
              <React.Suspense fallback={<PanelSkeleton />}>
                <SkillCreatorPage />
              </React.Suspense>
            </ErrorBoundary>
          ) : mainView === 'skill-marketplace' ? (
            <ErrorBoundary fallbackLabel="skill marketplace">
              <React.Suspense fallback={<PanelSkeleton />}>
                <SkillMarketplacePage />
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
