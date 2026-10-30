import React, { useEffect, useState } from 'react'
import { useChatStore, useTaskStore, useUiStore } from '../../store'
import { usePluginStore } from '../../store/pluginStore'
import { useTerminalStore } from '../../store/terminalStore'
import { useT } from '../../i18n'
import NavRail from './NavRail'
import ChatPanel from '../chat/ChatPanel'
import StatusBar from './StatusBar'
import ErrorBoundary from '../shared/ErrorBoundary'
import { runTopEscape } from '../ui/escapeStack'
import { ArrowLeft } from 'lucide-react'

const SettingsPanel = React.lazy(() => import('../settings/SettingsPanel'))
const PersonaEditorPage = React.lazy(() => import('../settings/PersonaEditorPage'))
const WorkflowEditorPage = React.lazy(() => import('../settings/WorkflowEditorPage'))
const WorkflowDetailPage = React.lazy(() => import('../workflows/WorkflowDetailPage'))
const NotesPanel = React.lazy(() => import('../notes/NotesPanel'))
const SkillCreatorPage = React.lazy(() => import('../skills/SkillCreatorPage'))
const SkillMarketplacePage = React.lazy(() => import('../skills/SkillMarketplacePage'))
const DepartmentDashboard = React.lazy(() => import('../departments/DepartmentDashboard'))
const TasksPanel = React.lazy(() => import('../tasks/TasksPanel'))
const ArchivePanel = React.lazy(() => import('../archive/ArchivePanel'))
const RunActivityPanel = React.lazy(() => import('../automation/RunActivityPanel'))
const WorkflowPanel = React.lazy(() => import('../workflows/WorkflowPanel'))
const ChangesPanel = React.lazy(() => import('../sidebar/ChangesPanel'))
const FileBrowser = React.lazy(() => import('../filebrowser/FileBrowser'))
const PluginHostView = React.lazy(() => import('../plugins/PluginHostView'))
// xterm is only needed once the dock opens; keeping it lazy means a user who
// never opens a terminal never downloads or evaluates the widget.
const TerminalDock = React.lazy(() => import('../terminal/TerminalDock'))

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
  const focusMode = useUiStore(s => s.focusMode)
  const mainView = useUiStore(s => s.mainView)
  const closeSettings = useUiStore(s => s.closeSettingsModal)
  const currentSessionTitle = useChatStore(s => s.currentSessionTitle)
  const terminalOpen = useTerminalStore(s => s.open)
  // Once the dock has been opened it stays mounted while hidden, so its shells
  // keep running; `TerminalDock` hides itself with `display:none`.
  const [terminalMounted, setTerminalMounted] = useState(false)
  useEffect(() => {
    if (terminalOpen) setTerminalMounted(true)
  }, [terminalOpen])

  // Initialize hot-pluggable plugin listener
  useEffect(() => {
    const unsub = usePluginStore.getState().initPluginListener()
    // Main asks to open a plugin (e.g. a Work Calendar reminder notification was clicked)
    const unsubOpen = window.electronAPI.onPluginOpen((pluginId) => {
      useUiStore.getState().setActiveNavItem(`plugin:${pluginId}`)
    })
    return () => { unsub(); unsubOpen() }
  }, [])

  // Close settings/editor page on Escape
  useEffect(() => {
    if (mainView === 'chat') return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        // A nested layer inside the current view — an overlay in Settings, the
        // model picker, and friends — claims Escape before the view itself
        // does, so the key peels off one layer at a time.
        if (runTopEscape()) return
        if (mainView === 'department') {
          // Escape from department dashboard goes to chat
          useUiStore.getState().setMainView('chat')
        } else if (mainView === 'tasks') {
          // First Escape leaves the open task detail; the list stays in front.
          // A second one follows the other page views back to chat.
          const tasks = useTaskStore.getState()
          if (tasks.selectedTaskId) tasks.selectTask(null)
          else useUiStore.getState().setActiveNavItem('chat')
        } else if (mainView === 'workflow-detail' || mainView === 'workflow-editor') {
          // Go back to workflows from workflow detail or editor
          useUiStore.getState().setActiveNavItem('workflows')
        } else if (mainView === 'persona-editor') {
          const returnView = useUiStore.getState().personaEditorReturnView
          useUiStore.getState().setMainView(returnView)
          if (returnView === 'workflows') {
            useUiStore.getState().setActiveNavItem('workflows')
          }
        } else if (mainView === 'skill-creator' || mainView === 'skill-marketplace') {
          // Skills live in the Employees page — go back there
          useUiStore.getState().setActiveNavItem('workflows')
        } else if (
          mainView === 'notes' ||
          mainView === 'workflows' ||
          mainView === 'changes' ||
          mainView === 'files' ||
          mainView === 'run-activity' ||
          mainView === 'plugin'
        ) {
          useUiStore.getState().setActiveNavItem('chat')
        } else {
          closeSettings()
        }
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [mainView, closeSettings])

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

      {/* Main content: NavRail + Main View Area */}
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

        {/* Main content area -- ChatPanel, Department, Workflows, Skills, Notes, Memory, Channel, Changes, Files, Settings, or Editor pages */}
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
            <ErrorBoundary key={mainView} fallbackLabel="department dashboard">
              <React.Suspense fallback={<PanelSkeleton />}>
                <DepartmentDashboard />
              </React.Suspense>
            </ErrorBoundary>
          ) : mainView === 'archive' ? (
            <ErrorBoundary key={mainView} fallbackLabel="archive panel">
              <React.Suspense fallback={<PanelSkeleton />}>
                <ArchivePanel />
              </React.Suspense>
            </ErrorBoundary>
          ) : mainView === 'tasks' ? (
            <ErrorBoundary key={mainView} fallbackLabel="tasks panel">
              <React.Suspense fallback={<PanelSkeleton />}>
                <TasksPanel />
              </React.Suspense>
            </ErrorBoundary>
          ) : mainView === 'run-activity' ? (
            <ErrorBoundary key={mainView} fallbackLabel="run activity page">
              <React.Suspense fallback={<PanelSkeleton />}>
                <RunActivityPanel />
              </React.Suspense>
            </ErrorBoundary>
          ) : mainView === 'workflows' ? (
            <ErrorBoundary key={mainView} fallbackLabel="workflows panel">
              <React.Suspense fallback={<PanelSkeleton />}>
                <WorkflowPanel />
              </React.Suspense>
            </ErrorBoundary>
          ) : mainView === 'changes' ? (
            <ErrorBoundary key={mainView} fallbackLabel="changes panel">
              <React.Suspense fallback={<PanelSkeleton />}>
                <ChangesPanel />
              </React.Suspense>
            </ErrorBoundary>
          ) : mainView === 'files' ? (
            <ErrorBoundary key={mainView} fallbackLabel="files browser">
              <React.Suspense fallback={<PanelSkeleton />}>
                <FileBrowser />
              </React.Suspense>
            </ErrorBoundary>
          ) : mainView === 'notes' ? (
            <ErrorBoundary key={mainView} fallbackLabel="notes panel">
              <React.Suspense fallback={<PanelSkeleton />}>
                <NotesPanel />
              </React.Suspense>
            </ErrorBoundary>
          ) : mainView === 'settings' ? (
            <ErrorBoundary key={mainView} fallbackLabel="settings page">
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
              {/* Settings content. The settings panel owns its own readable
                  column (see SettingsPanel), so this wrapper stays fluid: the
                  rail + nav remain pinned and only the form area gets a measure. */}
              <div style={{
                flex: 1, overflow: 'auto',
                display: 'flex',
              }}>
                <div style={{ width: '100%', minWidth: 0 }}>
                  <React.Suspense fallback={<PanelSkeleton />}>
                    <SettingsPanel />
                  </React.Suspense>
                </div>
              </div>
            </ErrorBoundary>
          ) : mainView === 'persona-editor' ? (
            <ErrorBoundary key={mainView} fallbackLabel="persona editor">
              <React.Suspense fallback={<PanelSkeleton />}>
                <PersonaEditorPage />
              </React.Suspense>
            </ErrorBoundary>
          ) : mainView === 'workflow-editor' ? (
            <ErrorBoundary key={mainView} fallbackLabel="workflow editor">
              <React.Suspense fallback={<PanelSkeleton />}>
                <WorkflowEditorPage />
              </React.Suspense>
            </ErrorBoundary>
          ) : mainView === 'workflow-detail' ? (
            <ErrorBoundary key={mainView} fallbackLabel="workflow detail">
              <React.Suspense fallback={<PanelSkeleton />}>
                <WorkflowDetailPage />
              </React.Suspense>
            </ErrorBoundary>
          ) : mainView === 'skill-creator' ? (
            <ErrorBoundary key={mainView} fallbackLabel="skill creator">
              <React.Suspense fallback={<PanelSkeleton />}>
                <SkillCreatorPage />
              </React.Suspense>
            </ErrorBoundary>
          ) : mainView === 'skill-marketplace' ? (
            <ErrorBoundary key={mainView} fallbackLabel="skill marketplace">
              <React.Suspense fallback={<PanelSkeleton />}>
                <SkillMarketplacePage />
              </React.Suspense>
            </ErrorBoundary>
          ) : mainView === 'plugin' ? (
            <ErrorBoundary key={mainView} fallbackLabel="plugin view">
              <React.Suspense fallback={<PanelSkeleton />}>
                <PluginHostView />
              </React.Suspense>
            </ErrorBoundary>
          ) : (
            <ErrorBoundary key={mainView} fallbackLabel="chat panel">
              <ChatPanel />
            </ErrorBoundary>
          )}
        </div>

      </div>

      {/* Terminal dock — mounted above the status bar after its first open, and
          hidden rather than unmounted from then on, so toggling it never kills
          a running shell. */}
      {terminalMounted && (
        <ErrorBoundary fallbackLabel="terminal dock">
          <React.Suspense fallback={null}>
            <TerminalDock visible={terminalOpen} />
          </React.Suspense>
        </ErrorBoundary>
      )}

      {/* Status bar */}
      <StatusBar />
    </div>
  )
}
