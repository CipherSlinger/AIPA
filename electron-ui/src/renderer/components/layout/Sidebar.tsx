import React, { Suspense } from 'react'
import { useUiStore } from '../../store'
import DepartmentPanel from '../departments/DepartmentPanel'
import ErrorBoundary from '../shared/ErrorBoundary'

// Lazy-load heavy sidebar panels (Iteration 198 — code-splitting)
const FileBrowser = React.lazy(() => import('../filebrowser/FileBrowser'))
const NotesPanel = React.lazy(() => import('../notes/NotesPanel'))
const WorkflowPanel = React.lazy(() => import('../workflows/WorkflowPanel'))
const ChangesPanel = React.lazy(() => import('../sidebar/ChangesPanel'))

function PanelFallback() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      color: 'var(--text-muted)',
      fontSize: 12,
    }}>
      <div style={{
        width: 20,
        height: 20,
        border: '2px solid var(--border)',
        borderTopColor: 'var(--accent)',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
    </div>
  )
}

export default function Sidebar() {
  const { sidebarTab } = useUiStore()

  return (
    <div
      className="flex flex-col h-full"
      style={{
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border)',
        overflow: 'hidden',
      }}
    >
      {/* Tab content — NavRail controls which tab is active */}
      <div className="flex-1 overflow-auto">
        {sidebarTab === 'history' && <DepartmentPanel />}
        {sidebarTab === 'files' && (
          <Suspense fallback={<PanelFallback />}>
            <FileBrowser />
          </Suspense>
        )}
        {sidebarTab === 'notes' && (
          <Suspense fallback={<PanelFallback />}>
            <NotesPanel />
          </Suspense>
        )}
        {sidebarTab === 'workflows' && (
          <Suspense fallback={<PanelFallback />}>
            <WorkflowPanel />
          </Suspense>
        )}
        {sidebarTab === 'changes' && (
          <Suspense fallback={<PanelFallback />}>
            <ChangesPanel />
          </Suspense>
        )}
      </div>
    </div>
  )
}
