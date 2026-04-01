// StatusBar — thin orchestrator after Iteration 313 decomposition
// Sub-modules: statusBarConstants, useStatusBarTimers, useStreamingSpeed,
//              StatusBarModelPicker, StatusBarPersonaPicker

import React, { useState } from 'react'
import { PanelLeft, DollarSign, Clock, ArrowUp, ArrowDown, Recycle, Zap, Timer, Square, StopCircle, Pin, Settings, Gauge, Brain } from 'lucide-react'
import { useChatStore, usePrefsStore, useUiStore } from '../../store'
import { StandardChatMessage } from '../../types/app.types'
import { useT } from '../../i18n'
import { Separator, formatDuration, fmtNumber } from './statusBarConstants'
import { useFocusTimer, useStopwatch } from './useStatusBarTimers'
import { useStreamingSpeed } from './useStreamingSpeed'
import StatusBarModelPicker from './StatusBarModelPicker'
import StatusBarPersonaPicker from './StatusBarPersonaPicker'

// Per-model pricing tiers (inspired by Claude Code modelCost.ts)
// Format: [inputCostPerMtok, outputCostPerMtok]
const MODEL_PRICING: Record<string, [number, number]> = {
  'claude-sonnet-4-6': [3, 15],
  'claude-sonnet-4-5': [3, 15],
  'claude-sonnet-4-0': [3, 15],
  'claude-3-7-sonnet': [3, 15],
  'claude-3-5-sonnet': [3, 15],
  'claude-opus-4-6': [5, 25],
  'claude-opus-4-5': [5, 25],
  'claude-opus-4-1': [15, 75],
  'claude-opus-4-0': [15, 75],
  'claude-haiku-4-5': [1, 5],
  'claude-3-5-haiku': [0.8, 4],
}

function getModelPricing(modelId: string): string | null {
  // Try exact match first, then partial
  const costs = MODEL_PRICING[modelId]
    || Object.entries(MODEL_PRICING).find(([k]) => modelId.includes(k))?.[1]
  if (!costs) return null
  const fmt = (n: number) => Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`
  return `${fmt(costs[0])}/${fmt(costs[1])} per Mtok`
}

export default function StatusBar() {
  const workingDir = useChatStore(s => s.workingDir)
  const lastUsage = useChatStore(s => s.lastUsage)
  const lastCost = useChatStore(s => s.lastCost)
  const totalSessionCost = useChatStore(s => s.totalSessionCost)
  const lastContextUsage = useChatStore(s => s.lastContextUsage)
  const modelUsage = useChatStore(s => s.modelUsage)
  const isStreaming = useChatStore(s => s.isStreaming)
  const messages = useChatStore(s => s.messages)
  const prefs = usePrefsStore(s => s.prefs)
  const setPrefs = usePrefsStore(s => s.setPrefs)
  const toggleSidebar = useUiStore(s => s.toggleSidebar)
  const sidebarOpen = useUiStore(s => s.sidebarOpen)
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
  const [showCostBreakdown, setShowCostBreakdown] = useState(false)
  const costPopupRef = React.useRef<HTMLDivElement>(null)
  const firstMsgTs = chatMessages.length > 0
    ? (chatMessages[0] as StandardChatMessage).timestamp
    : null
  const sessionDuration = firstMsgTs ? Date.now() - firstMsgTs : null

  const personas = prefs.personas || []
  const activePersona = personas.find(p => p.id === prefs.activePersonaId)

  // Close cost popup on outside click
  React.useEffect(() => {
    if (!showCostBreakdown) return
    const handler = (e: MouseEvent) => {
      if (costPopupRef.current && !costPopupRef.current.contains(e.target as Node)) {
        setShowCostBreakdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showCostBreakdown])

  // Model pricing for current model
  const modelPricing = getModelPricing(prefs.model || 'claude-sonnet-4-6')

  // Effort level config
  const effortLevel = prefs.effortLevel || 'medium'
  const effortSymbols: Record<string, string> = { low: '\u25D4', medium: '\u25D1', high: '\u25D5' }
  const effortColors: Record<string, string> = { low: '#4ade80', medium: '#fbbf24', high: '#f87171' }
  const cycleEffort = () => {
    const levels: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high']
    const next = levels[(levels.indexOf(effortLevel as any) + 1) % 3]
    setPrefs({ effortLevel: next })
    window.electronAPI.prefsSet('effortLevel', next)
    useUiStore.getState().addToast('info', t('effort.switched', { level: t(`effort.${next}`) }))
  }

  // Extended thinking toggle (Iteration 378)
  const thinkingEnabled = prefs.extendedThinking || false
  const toggleThinking = () => {
    const newVal = !thinkingEnabled
    setPrefs({ extendedThinking: newVal })
    window.electronAPI.prefsSet('extendedThinking', newVal)
    useUiStore.getState().addToast('info', t(newVal ? 'thinking.enabled' : 'thinking.disabled'))
  }

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

        {/* Cost (click for per-model breakdown) -- color-coded thresholds: green < $1, yellow $1-$5, red >= $5 */}
        {totalSessionCost > 0 && (
          <div style={{ position: 'relative' }} ref={costPopupRef}>
            <button
              onClick={() => setShowCostBreakdown(!showCostBreakdown)}
              title={lastCost != null ? t('toolbar.lastTurn', { cost: lastCost.toFixed(4), total: totalSessionCost.toFixed(4) }) : t('toolbar.sessionTotal', { total: totalSessionCost.toFixed(4) })}
              style={{
                opacity: 0.85, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 2, fontSize: 10,
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                color: totalSessionCost >= 5 ? '#f87171' : totalSessionCost >= 1 ? '#fbbf24' : '#4ade80',
                transition: 'color 0.3s',
              }}
            >
              <DollarSign size={10} />
              {totalSessionCost < 0.001 ? '<$0.001' : `$${totalSessionCost.toFixed(3)}`}
            </button>
            {showCostBreakdown && Object.keys(modelUsage).length > 0 && (
              <div
                className="popup-enter"
                style={{
                  position: 'absolute', bottom: '100%', right: 0, marginBottom: 4,
                  background: 'var(--popup-bg)', border: '1px solid var(--popup-border)',
                  boxShadow: 'var(--popup-shadow)', borderRadius: 8, padding: '8px 12px',
                  minWidth: 220, zIndex: 100,
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                  {t('cost.breakdownTitle')}
                </div>
                {Object.entries(modelUsage)
                  .sort((a, b) => b[1].costUsd - a[1].costUsd)
                  .map(([model, usage]) => {
                    const shortName = model.startsWith('claude-')
                      ? model.replace('claude-', '').replace(/-\d{8}$/, '')
                      : model
                    const pricing = getModelPricing(model)
                    return (
                      <div key={model} style={{ marginBottom: 5, borderBottom: '1px solid var(--popup-border)', paddingBottom: 5 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                          <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{shortName}</span>
                          <span style={{ color: usage.costUsd >= 1 ? '#fbbf24' : '#4ade80', fontWeight: 600 }}>
                            ${usage.costUsd < 0.001 ? '<0.001' : usage.costUsd.toFixed(3)}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                          <span>{t('cost.input')}: {fmtNumber(usage.inputTokens)}</span>
                          <span>{t('cost.output')}: {fmtNumber(usage.outputTokens)}</span>
                          {usage.cacheTokens > 0 && <span>{t('cost.cache')}: {fmtNumber(usage.cacheTokens)}</span>}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>
                          <span>{usage.turns} {t('cost.turns')}</span>
                          {pricing && <span style={{ opacity: 0.7 }}>{pricing}</span>}
                        </div>
                      </div>
                    )
                  })}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                  <span>{t('cost.total')}</span>
                  <span style={{ color: totalSessionCost >= 5 ? '#f87171' : totalSessionCost >= 1 ? '#fbbf24' : '#4ade80' }}>
                    ${totalSessionCost.toFixed(4)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Persona quick-switcher */}
        <StatusBarPersonaPicker personas={personas} activePersona={activePersona} />

        {/* Model badge (clickable) */}
        <StatusBarModelPicker modelLabel={modelLabel} shortModel={shortModel} isClaudeModel={isClaudeModel} />

        {/* Effort level indicator (click to cycle low → medium → high) */}
        <button
          onClick={cycleEffort}
          title={t('effort.title', { level: t(`effort.${effortLevel}`) })}
          style={{
            background: 'none', border: 'none', color: effortColors[effortLevel],
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
            padding: '0 2px', fontSize: 10, opacity: 0.9,
            transition: 'color 0.2s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.9' }}
        >
          <Gauge size={10} />
          <span style={{ fontFamily: 'system-ui', fontSize: 11 }}>{effortSymbols[effortLevel]}</span>
        </button>

        {/* Extended Thinking toggle (Iteration 378) */}
        <button
          onClick={toggleThinking}
          title={t('thinking.title')}
          style={{
            background: 'none', border: 'none',
            color: thinkingEnabled ? '#a78bfa' : '#fff',
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            padding: '0 2px', opacity: thinkingEnabled ? 1 : 0.5,
            transition: 'color 0.2s, opacity 0.2s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = thinkingEnabled ? '1' : '0.5' }}
        >
          <Brain size={11} />
        </button>

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

        {/* Settings gear */}
        <button
          onClick={() => useUiStore.getState().openSettingsModal()}
          title={t('nav.settings') + ' (Ctrl+,)'}
          style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0, opacity: 0.6 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.6' }}
        >
          <Settings size={12} />
        </button>
      </div>
    </div>
  )
}
