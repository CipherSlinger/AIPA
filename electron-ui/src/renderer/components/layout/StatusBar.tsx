// StatusBar — thin orchestrator after Iteration 313 decomposition
// Sub-modules: statusBarConstants, useStatusBarTimers, useStreamingSpeed,
//              StatusBarModelPicker, StatusBarPersonaPicker

import React from 'react'
import { PanelLeft, Terminal, DollarSign, Clock, ArrowUp, ArrowDown, Recycle, Zap, Timer, Play, Square, StopCircle, Pin } from 'lucide-react'
import { useChatStore, usePrefsStore, useUiStore } from '../../store'
import { StandardChatMessage } from '../../types/app.types'
import { useT } from '../../i18n'
import { Separator, formatDuration, fmtNumber } from './statusBarConstants'
import { useFocusTimer, useStopwatch } from './useStatusBarTimers'
import { useStreamingSpeed } from './useStreamingSpeed'
import StatusBarModelPicker from './StatusBarModelPicker'
import StatusBarPersonaPicker from './StatusBarPersonaPicker'

export default function StatusBar() {
  const workingDir = useChatStore(s => s.workingDir)
  const lastUsage = useChatStore(s => s.lastUsage)
  const lastCost = useChatStore(s => s.lastCost)
  const totalSessionCost = useChatStore(s => s.totalSessionCost)
  const lastContextUsage = useChatStore(s => s.lastContextUsage)
  const isStreaming = useChatStore(s => s.isStreaming)
  const messages = useChatStore(s => s.messages)
  const prefs = usePrefsStore(s => s.prefs)
  const toggleSidebar = useUiStore(s => s.toggleSidebar)
  const toggleTerminal = useUiStore(s => s.toggleTerminal)
  const sidebarOpen = useUiStore(s => s.sidebarOpen)
  const terminalOpen = useUiStore(s => s.terminalOpen)
  const alwaysOnTop = useUiStore(s => s.alwaysOnTop)
  const setAlwaysOnTop = useUiStore(s => s.setAlwaysOnTop)
  const t = useT()

  // Hooks from extracted modules
  const streamingSpeed = useStreamingSpeed()
  const focusTimer = useFocusTimer()
  const stopwatch = useStopwatch()

  // Derived values
  const dirLabel = workingDir || prefs.workingDir || '~'
  const dirShort = dirLabel.split(/[/\\]/).pop() || dirLabel
  const modelLabel = prefs.model || 'claude-sonnet-4-6'
  const isClaudeModel = modelLabel.startsWith('claude-')
  const shortModel = isClaudeModel
    ? modelLabel
        .replace('claude-', '')
        .replace(/-\d{8}$/, '')
        .split('-')
        .map((s: string) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(' ')
    : modelLabel

  const contextPct = lastContextUsage && lastContextUsage.total > 0
    ? Math.min(100, Math.round(lastContextUsage.used / lastContextUsage.total * 100))
    : null

  const ctxColor = contextPct == null ? '#4ade80'
    : contextPct >= 85 ? '#f87171'
    : contextPct >= 60 ? '#fbbf24'
    : '#4ade80'

  const chatMessages = messages.filter(m => m.role !== 'permission' && m.role !== 'plan')
  const firstMsgTs = chatMessages.length > 0
    ? (chatMessages[0] as StandardChatMessage).timestamp
    : null
  const sessionDuration = firstMsgTs ? Date.now() - firstMsgTs : null

  const personas = prefs.personas || []
  const activePersona = personas.find(p => p.id === prefs.activePersonaId)

  return (
    <div
      role="status"
      aria-label="Status bar"
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
            {streamingSpeed !== null && streamingSpeed > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 2, opacity: 0.8, fontSize: 10 }}>
                <Zap size={9} />
                {streamingSpeed > 1000
                  ? `${(streamingSpeed / 1000).toFixed(1)}k`
                  : streamingSpeed
                } {t('toolbar.charsPerSec')}
                <span style={{ opacity: 0.6 }}>
                  (~{Math.round(streamingSpeed / 4)} {t('toolbar.tokPerSec')})
                </span>
              </span>
            )}
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
            title={t('toolbar.contextUsed', { percent: String(contextPct), used: fmtNumber(lastContextUsage!.used), total: fmtNumber(lastContextUsage!.total) })}
          >
            <span style={{ fontSize: 9, opacity: 0.7 }}>{t('toolbar.context')}</span>
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

        {/* Focus timer */}
        <button
          onClick={focusTimer.toggle}
          title={focusTimer.active ? t('toolbar.stopFocusTimer') : t('toolbar.startFocusTimer')}
          style={{
            background: focusTimer.active ? 'rgba(255,255,255,0.15)' : 'none',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            padding: '1px 5px',
            borderRadius: 4,
            fontSize: 10,
            opacity: focusTimer.active ? 1 : 0.6,
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = focusTimer.active ? '1' : '0.6' }}
        >
          {focusTimer.active ? (
            <>
              <Timer size={10} style={{ color: '#4ade80' }} />
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                {Math.floor(focusTimer.remaining / 60)}:{String(focusTimer.remaining % 60).padStart(2, '0')}
              </span>
              <Square size={8} />
            </>
          ) : (
            <>
              <Timer size={10} />
              <span>25m</span>
            </>
          )}
        </button>

        {/* Stopwatch */}
        <button
          onClick={stopwatch.handleClick}
          title={stopwatch.active ? t('toolbar.stopStopwatch') : stopwatch.elapsed > 0 ? t('toolbar.resumeStopwatch') : t('toolbar.startStopwatch')}
          style={{
            background: stopwatch.active ? 'rgba(255,255,255,0.15)' : 'none',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            padding: '1px 5px',
            borderRadius: 4,
            fontSize: 10,
            opacity: stopwatch.active || stopwatch.elapsed > 0 ? 1 : 0.6,
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = (stopwatch.active || stopwatch.elapsed > 0) ? '1' : '0.6' }}
        >
          <StopCircle size={10} style={{ color: stopwatch.active ? '#f59e0b' : undefined }} />
          {stopwatch.active || stopwatch.elapsed > 0 ? (
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatDuration(stopwatch.elapsed * 1000)}
            </span>
          ) : (
            <span>{t('toolbar.stopwatch')}</span>
          )}
        </button>
      </div>

      <Separator />

      {/* Right Zone: Metrics + Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {/* Token usage (click to copy) */}
        {lastUsage && (
          <button
            onClick={() => {
              const text = `Input: ${lastUsage.inputTokens} tokens, Output: ${lastUsage.outputTokens} tokens${lastUsage.cacheTokens > 0 ? `, Cache: ${lastUsage.cacheTokens} tokens` : ''}`
              navigator.clipboard.writeText(text).then(() => {
                useUiStore.getState().addToast('success', t('toolbar.tokensCopied'))
              })
            }}
            title={t('toolbar.clickToCopyTokens')}
            style={{ opacity: 0.85, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0 }}
          >
            <ArrowUp size={9} />
            {fmtNumber(lastUsage.inputTokens)}
            <ArrowDown size={9} />
            {fmtNumber(lastUsage.outputTokens)}
            {lastUsage.cacheTokens > 0 && (
              <>
                <Recycle size={9} style={{ opacity: 0.7 }} />
                {fmtNumber(lastUsage.cacheTokens)}
              </>
            )}
          </button>
        )}

        {/* Cost (click to copy) */}
        {totalSessionCost > 0 && (
          <button
            onClick={() => {
              const text = `Session cost: $${totalSessionCost.toFixed(4)}${lastCost != null ? ` (last turn: $${lastCost.toFixed(4)})` : ''}`
              navigator.clipboard.writeText(text).then(() => {
                useUiStore.getState().addToast('success', t('toolbar.costCopied'))
              })
            }}
            title={lastCost != null ? t('toolbar.lastTurn', { cost: lastCost.toFixed(4), total: totalSessionCost.toFixed(4) }) : t('toolbar.sessionTotal', { total: totalSessionCost.toFixed(4) })}
            style={{ opacity: 0.85, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0 }}
          >
            <DollarSign size={10} />
            {totalSessionCost < 0.001 ? '<$0.001' : `$${totalSessionCost.toFixed(3)}`}
          </button>
        )}

        {/* Persona quick-switcher */}
        <StatusBarPersonaPicker personas={personas} activePersona={activePersona} />

        {/* Model badge (clickable) */}
        <StatusBarModelPicker modelLabel={modelLabel} shortModel={shortModel} isClaudeModel={isClaudeModel} />

        {/* Always-on-top pin toggle */}
        <button
          onClick={() => {
            const newValue = !alwaysOnTop
            window.electronAPI.windowSetAlwaysOnTop(newValue)
            setAlwaysOnTop(newValue)
          }}
          title={t(alwaysOnTop ? 'window.pinnedOn' : 'window.pinWindow') + ' (Ctrl+Shift+T)'}
          style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0, opacity: alwaysOnTop ? 1 : 0.6 }}
        >
          <Pin size={12} style={{ transform: alwaysOnTop ? 'rotate(-45deg)' : undefined, transition: 'transform 0.2s' }} />
        </button>

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
