import React from 'react'
import { PanelLeft, Terminal, DollarSign } from 'lucide-react'
import { useChatStore, usePrefsStore, useUiStore } from '../../store'

export default function StatusBar() {
  const { workingDir, lastUsage, lastCost, totalSessionCost, lastContextUsage, isStreaming, messages } = useChatStore()
  const { prefs } = usePrefsStore()
  const { toggleSidebar, toggleTerminal, sidebarOpen, terminalOpen } = useUiStore()

  const dirLabel = workingDir || prefs.workingDir || '~'
  const dirShort = dirLabel.split(/[/\\]/).pop() || dirLabel
  const modelLabel = prefs.model || 'claude-sonnet-4-6'
  const shortModel = modelLabel
    .replace('claude-', '')
    .replace(/-\d{8}$/, '')  // remove date suffixes like -20250219
    .split('-')
    .map((s: string) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ')
  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)

  const contextPct = lastContextUsage && lastContextUsage.total > 0
    ? Math.min(100, Math.round(lastContextUsage.used / lastContextUsage.total * 100))
    : null

  // Context bar color: green < 60%, yellow < 85%, red >= 85%
  const ctxColor = contextPct == null ? '#4ade80'
    : contextPct >= 85 ? '#f87171'
    : contextPct >= 60 ? '#fbbf24'
    : '#4ade80'

  return (
    <div
      style={{
        height: 24,
        background: 'var(--accent)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px',
        gap: 10,
        fontSize: 11,
        flexShrink: 0,
      }}
    >
      <button
        onClick={toggleSidebar}
        title="Toggle sidebar (Ctrl+B)"
        style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: sidebarOpen ? 1 : 0.6 }}
      >
        <PanelLeft size={12} />
      </button>

      <span style={{ opacity: 0.8 }}>{'\uD83D\uDCC1'}</span>
      <span
        style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.85 }}
        title={dirLabel}
      >
        {dirShort}
      </span>

      {/* Streaming indicator */}
      {isStreaming && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 3, opacity: 0.9 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#4ade80',
              animation: 'pulse 1.2s ease-in-out infinite',
            }}
          />
          <span style={{ fontSize: 10 }}>Streaming</span>
        </span>
      )}

      {/* Message count */}
      {messages.length > 0 && !isStreaming && (
        <span style={{ opacity: 0.7, fontSize: 10 }}>
          {messages.filter(m => m.role !== 'permission' && m.role !== 'plan').length} msgs
        </span>
      )}

      {/* Context window usage bar */}
      {contextPct !== null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: 0.9 }} title={`Context used: ${contextPct}% (${fmt(lastContextUsage!.used)} / ${fmt(lastContextUsage!.total)} tokens)`}>
          <div style={{ width: 48, height: 5, background: 'rgba(255,255,255,0.3)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${contextPct}%`, height: '100%', background: ctxColor, transition: 'width 0.3s' }} />
          </div>
          <span style={{ fontSize: 10, opacity: 0.8 }}>{contextPct}%</span>
        </div>
      )}

      {/* Token usage */}
      {lastUsage && (
        <span style={{ opacity: 0.85, whiteSpace: 'nowrap' }}>
          ↑{fmt(lastUsage.inputTokens)} ↓{fmt(lastUsage.outputTokens)}
          {lastUsage.cacheTokens > 0 && ` ♻️${fmt(lastUsage.cacheTokens)}`}
        </span>
      )}

      {/* Cost */}
      {totalSessionCost > 0 && (
        <span
          style={{ opacity: 0.85, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 2 }}
          title={lastCost != null ? `Last turn: $${lastCost.toFixed(4)} | Session total: $${totalSessionCost.toFixed(4)}` : `Session total: $${totalSessionCost.toFixed(4)}`}
        >
          <DollarSign size={10} />
          {totalSessionCost < 0.001 ? '<$0.001' : `$${totalSessionCost.toFixed(3)}`}
        </span>
      )}

      <span style={{ opacity: 0.9, whiteSpace: 'nowrap' }}>⚡ {shortModel}</span>

      <button
        onClick={toggleTerminal}
        title="Toggle terminal (Ctrl+`)"
        style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: terminalOpen ? 1 : 0.6 }}
      >
        <Terminal size={12} />
      </button>
    </div>
  )
}
