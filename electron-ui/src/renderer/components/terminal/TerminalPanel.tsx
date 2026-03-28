import React, { useRef } from 'react'
import { Terminal, RefreshCw, AlertTriangle, Play } from 'lucide-react'
import { usePty } from '../../hooks/usePty'
import { useT } from '../../i18n'
import '@xterm/xterm/css/xterm.css'

export default function TerminalPanel() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { refitTerminal, reconnect, ptyError, ptyExited } = usePty(containerRef as React.RefObject<HTMLDivElement>)
  const t = useT()

  const hasIssue = !!ptyError || ptyExited

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
        <Terminal size={13} style={{ color: ptyError ? 'var(--error)' : ptyExited ? 'var(--warning, #fbbf24)' : 'var(--text-muted)' }} />
        <span style={{ fontSize: 12, color: ptyError ? 'var(--error)' : ptyExited ? 'var(--warning, #fbbf24)' : 'var(--text-muted)', flex: 1 }}>
          {ptyError ? t('terminal.error') : ptyExited ? t('terminal.exited') : t('terminal.title')}
        </span>
        {/* Reconnect button -- shown when PTY has exited or errored */}
        {hasIssue && (
          <button
            onClick={reconnect}
            title={t('terminal.reconnect')}
            style={{
              background: 'rgba(0, 122, 204, 0.15)',
              border: '1px solid rgba(0, 122, 204, 0.3)',
              borderRadius: 4,
              color: 'var(--accent)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 10px',
              fontSize: 11,
              fontWeight: 500,
              transition: 'background 150ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0, 122, 204, 0.25)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0, 122, 204, 0.15)' }}
          >
            <Play size={11} />
            {t('terminal.reconnect')}
          </button>
        )}
        {/* Refit button -- shown when PTY is active */}
        {!hasIssue && (
          <button
            onClick={refitTerminal}
            title={t('terminal.refit')}
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
