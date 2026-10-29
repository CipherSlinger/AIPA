import React from 'react'
import { AlertTriangle } from 'lucide-react'
import type { TerminalTab as TerminalTabModel } from '../../store/terminalTabs'
import { useTerminalSession } from './useTerminalSession'

interface TerminalTabProps {
  tab: TerminalTabModel
  active: boolean
  /** False while the whole dock is hidden; the tab stays mounted but unmeasured. */
  visible: boolean
}

/**
 * One tab's terminal surface. Every tab stays mounted while the dock is open —
 * inactive ones are `display:none` — so switching tabs never recreates an xterm
 * or loses its scrollback. An exited tab keeps its output and its place.
 */
export default function TerminalTab({ tab, active, visible }: TerminalTabProps) {
  const containerRef = useTerminalSession(tab, active, visible)

  return (
    <div
      role="tabpanel"
      aria-label={tab.title}
      style={{
        flex: 1,
        minHeight: 0,
        display: active ? 'flex' : 'none',
        flexDirection: 'column',
        background: 'var(--bg-chat)',
      }}
    >
      {tab.failure && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            padding: '8px 12px',
            borderBottom: '1px solid var(--border)',
            background: 'rgba(239,68,68,0.08)',
            color: 'var(--error)',
            fontSize: 12,
            lineHeight: 1.5,
            flexShrink: 0,
          }}
        >
          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 2 }} />
          <span style={{ minWidth: 0 }}>{tab.failure}</span>
        </div>
      )}
      <div
        ref={containerRef}
        data-terminal-tab={tab.id}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          padding: 6,
        }}
      />
    </div>
  )
}
