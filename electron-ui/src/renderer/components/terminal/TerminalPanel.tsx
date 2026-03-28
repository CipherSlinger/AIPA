import React, { useRef, useEffect } from 'react'
import { Terminal, RefreshCw, AlertTriangle } from 'lucide-react'
import { usePty } from '../../hooks/usePty'
import { useT } from '../../i18n'
import '@xterm/xterm/css/xterm.css'

const SESSION_ID = `terminal-main-${Date.now()}`

export default function TerminalPanel() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { refitTerminal, ptyError } = usePty(containerRef as React.RefObject<HTMLDivElement>, SESSION_ID)
  const t = useT()

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
          background: 'var(--popup-bg)',
          flexShrink: 0,
        }}
      >
        <Terminal size={13} style={{ color: ptyError ? 'var(--error)' : 'var(--text-muted)' }} />
        <span style={{ fontSize: 12, color: ptyError ? 'var(--error)' : 'var(--text-muted)', flex: 1 }}>
          {ptyError ? t('terminal.error') : t('terminal.title')}
        </span>
        {!ptyError && (
          <button
            onClick={refitTerminal}
            title={t('terminal.reconnect')}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <RefreshCw size={12} />
          </button>
        )}
      </div>

      {/* xterm.js container */}
      <div
        ref={containerRef}
        style={{ flex: 1, overflow: 'hidden' }}
      />
    </div>
  )
}
