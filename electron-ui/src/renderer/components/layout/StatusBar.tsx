import React from 'react'
import { PanelLeft, Terminal, DollarSign } from 'lucide-react'
import { useChatStore, usePrefsStore, useUiStore } from '../../store'

export default function StatusBar() {
  const { workingDir, lastUsage, lastCost, lastContextUsage } = useChatStore()
  const { prefs } = usePrefsStore()
  const { toggleSidebar, toggleTerminal, sidebarOpen, terminalOpen } = useUiStore()

  const dirLabel = workingDir || prefs.workingDir || '~'
  const modelLabel = prefs.model || 'claude-sonnet-4-6'
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
        title="切换侧边栏 (Ctrl+B)"
        style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: sidebarOpen ? 1 : 0.6 }}
      >
        <PanelLeft size={12} />
      </button>

      <span style={{ opacity: 0.8 }}>📁</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.85 }}>
        {dirLabel}
      </span>

      {/* Context window usage bar */}
      {contextPct !== null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: 0.9 }} title={`上下文已用 ${contextPct}%（${fmt(lastContextUsage!.used)} / ${fmt(lastContextUsage!.total)} tokens）`}>
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
      {lastCost != null && lastCost > 0 && (
        <span style={{ opacity: 0.85, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 2 }}>
          <DollarSign size={10} />
          {lastCost < 0.001 ? '<$0.001' : `$${lastCost.toFixed(3)}`}
        </span>
      )}

      <span style={{ opacity: 0.9, whiteSpace: 'nowrap' }}>⚡ {modelLabel}</span>

      <button
        onClick={toggleTerminal}
        title="切换终端 (Ctrl+`)"
        style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: terminalOpen ? 1 : 0.6 }}
      >
        <Terminal size={12} />
      </button>
    </div>
  )
}
