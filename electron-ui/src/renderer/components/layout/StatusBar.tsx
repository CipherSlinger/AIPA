import React from 'react'
import { PanelLeft, PanelRight, Terminal } from 'lucide-react'
import { useChatStore, usePrefsStore, useUiStore } from '../../store'

export default function StatusBar() {
  const { workingDir, lastUsage } = useChatStore()
  const { prefs } = usePrefsStore()
  const { toggleSidebar, toggleTerminal, sidebarOpen, terminalOpen } = useUiStore()

  const dirLabel = workingDir || prefs.workingDir || '~'
  const modelLabel = prefs.model || 'claude-sonnet-4-6'

  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)

  return (
    <div
      style={{
        height: 24,
        background: 'var(--accent)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px',
        gap: 12,
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
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {dirLabel}
      </span>

      {lastUsage && (
        <span style={{ opacity: 0.85, whiteSpace: 'nowrap' }}>
          ↑{fmt(lastUsage.inputTokens)} ↓{fmt(lastUsage.outputTokens)}
          {lastUsage.cacheTokens > 0 && ` ♻️${fmt(lastUsage.cacheTokens)}`}
        </span>
      )}

      <span style={{ opacity: 0.9 }}>⚡ {modelLabel}</span>

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
