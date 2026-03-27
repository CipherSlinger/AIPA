import React from 'react'
import { PanelLeft, Terminal, DollarSign, Clock, ArrowUp, ArrowDown, Recycle } from 'lucide-react'
import { useChatStore, usePrefsStore, useUiStore } from '../../store'
import { StandardChatMessage } from '../../types/app.types'
import { useT } from '../../i18n'

function Separator() {
  return (
    <div
      style={{
        width: 1,
        height: 14,
        background: 'rgba(255,255,255,0.15)',
        margin: '0 4px',
        flexShrink: 0,
      }}
    />
  )
}

function formatDuration(ms: number): string {
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) {
    const remainSecs = secs % 60
    return remainSecs > 0 ? `${mins}m ${remainSecs}s` : `${mins}m`
  }
  const hrs = Math.floor(mins / 60)
  const remainMins = mins % 60
  return remainMins > 0 ? `${hrs}h ${remainMins}m` : `${hrs}h`
}

export default function StatusBar() {
  const { workingDir, lastUsage, lastCost, totalSessionCost, lastContextUsage, isStreaming, messages } = useChatStore()
  const { prefs } = usePrefsStore()
  const { toggleSidebar, toggleTerminal, sidebarOpen, terminalOpen } = useUiStore()
  const t = useT()

  const dirLabel = workingDir || prefs.workingDir || '~'
  const dirShort = dirLabel.split(/[/\\]/).pop() || dirLabel
  const modelLabel = prefs.model || 'claude-sonnet-4-6'
  const shortModel = modelLabel
    .replace('claude-', '')
    .replace(/-\d{8}$/, '')
    .split('-')
    .map((s: string) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ')
  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)

  const contextPct = lastContextUsage && lastContextUsage.total > 0
    ? Math.min(100, Math.round(lastContextUsage.used / lastContextUsage.total * 100))
    : null

  const ctxColor = contextPct == null ? '#4ade80'
    : contextPct >= 85 ? '#f87171'
    : contextPct >= 60 ? '#fbbf24'
    : '#4ade80'

  // Session duration: time since first message
  const chatMessages = messages.filter(m => m.role !== 'permission' && m.role !== 'plan')
  const firstMsgTs = chatMessages.length > 0
    ? (chatMessages[0] as StandardChatMessage).timestamp
    : null
  const sessionDuration = firstMsgTs ? Date.now() - firstMsgTs : null

  return (
    <div
      style={{
        height: 24,
        background: 'var(--accent)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px',
        fontSize: 11,
        flexShrink: 0,
      }}
    >
      {/* Left Zone: Controls + Working Dir */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <button
          onClick={toggleSidebar}
          title={t('toolbar.toggleSidebar')}
          style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0, opacity: sidebarOpen ? 1 : 0.6 }}
        >
          <PanelLeft size={12} />
        </button>
        <span
          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.85, maxWidth: 120 }}
          title={dirLabel}
        >
          {dirShort}
        </span>
      </div>

      <Separator />

      {/* Center Zone: Context Info (flex: 1) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
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
            <span style={{ fontSize: 10 }}>{t('toolbar.streaming')}</span>
          </span>
        )}

        {/* Message count */}
        {chatMessages.length > 0 && !isStreaming && (
          <span style={{ opacity: 0.7, fontSize: 10 }}>
            {t('toolbar.msgs', { count: chatMessages.length })}
          </span>
        )}

        {/* Context window usage bar */}
        {contextPct !== null && (
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: 0.9 }}
            title={`Context used: ${contextPct}% (${fmt(lastContextUsage!.used)} / ${fmt(lastContextUsage!.total)} tokens)`}
          >
            <span style={{ fontSize: 9, opacity: 0.7 }}>Ctx</span>
            <div style={{ width: 60, height: 6, background: 'rgba(255,255,255,0.25)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${contextPct}%`, height: '100%', background: ctxColor, transition: 'width 0.3s', borderRadius: 3 }} />
            </div>
            <span style={{ fontSize: 10, opacity: 0.8 }}>{contextPct}%</span>
          </div>
        )}

        {/* Session duration */}
        {sessionDuration !== null && sessionDuration > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, opacity: 0.7, fontSize: 10 }}>
            <Clock size={10} />
            {formatDuration(sessionDuration)}
          </span>
        )}
      </div>

      <Separator />

      {/* Right Zone: Metrics + Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {/* Token usage */}
        {lastUsage && (
          <span style={{ opacity: 0.85, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3, fontSize: 10 }}>
            <ArrowUp size={9} />
            {fmt(lastUsage.inputTokens)}
            <ArrowDown size={9} />
            {fmt(lastUsage.outputTokens)}
            {lastUsage.cacheTokens > 0 && (
              <>
                <Recycle size={9} style={{ opacity: 0.7 }} />
                {fmt(lastUsage.cacheTokens)}
              </>
            )}
          </span>
        )}

        {/* Cost */}
        {totalSessionCost > 0 && (
          <span
            style={{ opacity: 0.85, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 2, fontSize: 10 }}
            title={lastCost != null ? `Last turn: $${lastCost.toFixed(4)} | Session total: $${totalSessionCost.toFixed(4)}` : `Session total: $${totalSessionCost.toFixed(4)}`}
          >
            <DollarSign size={10} />
            {totalSessionCost < 0.001 ? '<$0.001' : `$${totalSessionCost.toFixed(3)}`}
          </span>
        )}

        {/* Model badge */}
        <span
          style={{
            padding: '1px 6px',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.15)',
            fontSize: 10,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            opacity: 0.9,
          }}
        >
          {shortModel}
        </span>

        <button
          onClick={toggleTerminal}
          title={t('toolbar.toggleTerminal')}
          style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0, opacity: terminalOpen ? 1 : 0.6 }}
        >
          <Terminal size={12} />
        </button>
      </div>
    </div>
  )
}
