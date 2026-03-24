import React, { useRef, useEffect } from 'react'
import { Terminal, RefreshCw } from 'lucide-react'
import { usePty } from '../../hooks/usePty'
import '@xterm/xterm/css/xterm.css'

const SESSION_ID = `terminal-main-${Date.now()}`

export default function TerminalPanel() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { refitTerminal } = usePty(containerRef as React.RefObject<HTMLDivElement>, SESSION_ID)

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: '#1e1e1e', borderLeft: '1px solid var(--border)' }}
    >
      {/* Toolbar */}
      <div
        style={{
          height: 36,
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          gap: 8,
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          flexShrink: 0,
        }}
      >
        <Terminal size={13} style={{ color: 'var(--text-muted)' }} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>Claude Code 终端</span>
        <button
          onClick={refitTerminal}
          title="刷新终端大小"
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {/* xterm.js container */}
      <div
        ref={containerRef}
        style={{ flex: 1, overflow: 'hidden' }}
      />
    </div>
  )
}
