import React, { useEffect, useRef, useState } from 'react'
import { useChatStore, useUiStore } from '../../store'
import Sidebar from './Sidebar'
import NavRail from './NavRail'
import ChatPanel from '../chat/ChatPanel'
import TerminalPanel from '../terminal/TerminalPanel'
import StatusBar from './StatusBar'
import ErrorBoundary from '../shared/ErrorBoundary'

const MIN_SIDEBAR = 180
const MAX_SIDEBAR = 400
const MIN_TERMINAL = 280
const MAX_TERMINAL = 800

export default function AppShell() {
  const sidebarOpen = useUiStore(s => s.sidebarOpen)
  const terminalOpen = useUiStore(s => s.terminalOpen)
  const setSidebarOpen = useUiStore(s => s.setSidebarOpen)
  const focusMode = useUiStore(s => s.focusMode)
  const currentSessionTitle = useChatStore(s => s.currentSessionTitle)
  const [sidebarWidth, setSidebarWidth] = useState(240)
  const [terminalWidth, setTerminalWidth] = useState(420)
  const draggingRef = useRef<'sidebar' | 'terminal' | null>(null)

  useEffect(() => {
    const loadWidths = async () => {
      const prefs = await window.electronAPI.prefsGetAll()
      if (prefs?.sidebarWidth) setSidebarWidth(Math.min(Math.max(prefs.sidebarWidth, MIN_SIDEBAR), MAX_SIDEBAR))
      if (prefs?.terminalWidth) setTerminalWidth(prefs.terminalWidth)
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

  const startDrag = (which: 'sidebar' | 'terminal') => (e: React.MouseEvent) => {
    e.preventDefault()
    draggingRef.current = which
    const startX = e.clientX
    const startWidth = which === 'sidebar' ? sidebarWidth : terminalWidth

    const onMove = (ev: MouseEvent) => {
      const delta = which === 'sidebar' ? ev.clientX - startX : startX - ev.clientX
      const newWidth = Math.min(
        Math.max(startWidth + delta, which === 'sidebar' ? MIN_SIDEBAR : MIN_TERMINAL),
        which === 'sidebar' ? MAX_SIDEBAR : MAX_TERMINAL
      )
      if (which === 'sidebar') setSidebarWidth(newWidth)
      else setTerminalWidth(newWidth)
    }

    const onUp = (ev: MouseEvent) => {
      draggingRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      // Compute final width from the last mouse position to avoid stale closure
      const delta = which === 'sidebar' ? ev.clientX - startX : startX - ev.clientX
      const finalWidth = Math.min(
        Math.max(startWidth + delta, which === 'sidebar' ? MIN_SIDEBAR : MIN_TERMINAL),
        which === 'sidebar' ? MAX_SIDEBAR : MAX_TERMINAL
      )
      window.electronAPI.prefsSet(which === 'sidebar' ? 'sidebarWidth' : 'terminalWidth', finalWidth)
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

      {/* Main content: NavRail + SessionPanel + ChatPanel [+ TerminalPanel] */}
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
              aria-label="Session list"
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
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--border)')}
            />
            )}
          </>
        )}

        {/* Chat panel -- fills remaining space */}
        <div
          role="main"
          aria-label="Chat"
          style={{
            flex: 1,
            overflow: 'hidden',
            background: 'var(--bg-chat)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <ErrorBoundary fallbackLabel="chat panel">
            <ChatPanel />
          </ErrorBoundary>
        </div>

        {/* Terminal resize handle + panel */}
        {terminalOpen && (
          <>
            <div
              className="resizer"
              style={{ width: 4, flexShrink: 0, background: 'var(--border)', cursor: 'col-resize', transition: 'background 0.15s' }}
              onMouseDown={startDrag('terminal')}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--border)')}
            />
            <div style={{ width: terminalWidth, flexShrink: 0, overflow: 'hidden' }}>
              <ErrorBoundary fallbackLabel="terminal panel">
                <TerminalPanel />
              </ErrorBoundary>
            </div>
          </>
        )}
      </div>

      {/* Status bar */}
      <StatusBar />
    </div>
  )
}
