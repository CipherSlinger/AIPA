import React, { useEffect, useRef, useState } from 'react'
import { useUiStore } from '../../store'
import Sidebar from './Sidebar'
import ChatPanel from '../chat/ChatPanel'
import TerminalPanel from '../terminal/TerminalPanel'
import StatusBar from './StatusBar'
import ErrorBoundary from '../shared/ErrorBoundary'

const MIN_SIDEBAR = 180
const MAX_SIDEBAR = 480
const MIN_TERMINAL = 280
const MAX_TERMINAL = 800

export default function AppShell() {
  const { sidebarOpen, terminalOpen } = useUiStore()
  const [sidebarWidth, setSidebarWidth] = useState(240)
  const [terminalWidth, setTerminalWidth] = useState(420)
  const draggingRef = useRef<'sidebar' | 'terminal' | null>(null)

  useEffect(() => {
    const loadWidths = async () => {
      const prefs = await window.electronAPI.prefsGetAll()
      if (prefs?.sidebarWidth) setSidebarWidth(prefs.sidebarWidth)
      if (prefs?.terminalWidth) setTerminalWidth(prefs.terminalWidth)
    }
    loadWidths()
  }, [])

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

    const onUp = () => {
      draggingRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      // Persist widths
      window.electronAPI.prefsSet(which === 'sidebar' ? 'sidebarWidth' : 'terminalWidth',
        which === 'sidebar' ? sidebarWidth : terminalWidth)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      {/* Title bar drag region */}
      <div
        className="drag-region"
        style={{ height: 32, background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}
      />

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {sidebarOpen && (
          <>
            <div style={{ width: sidebarWidth, flexShrink: 0, overflow: 'hidden' }}>
              <Sidebar />
            </div>
            {/* Sidebar resize handle */}
            <div
              className="resizer"
              style={{ width: 4, flexShrink: 0, background: 'var(--border)', cursor: 'col-resize' }}
              onMouseDown={startDrag('sidebar')}
            />
          </>
        )}

        {/* Chat panel — fills remaining space */}
        <div className="flex-1 overflow-hidden">
          <ErrorBoundary fallbackLabel="chat panel">
            <ChatPanel />
          </ErrorBoundary>
        </div>

        {/* Terminal resize handle + panel */}
        {terminalOpen && (
          <>
            <div
              className="resizer"
              style={{ width: 4, flexShrink: 0, background: 'var(--border)', cursor: 'col-resize' }}
              onMouseDown={startDrag('terminal')}
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
