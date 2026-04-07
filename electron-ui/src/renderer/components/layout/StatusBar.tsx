// StatusBar — thin orchestrator after Iteration 313 decomposition
// Sub-modules: statusBarConstants, useStatusBarTimers, useStreamingSpeed,
//              StatusBarModelPicker, StatusBarPersonaPicker, StatusBarTokenPopup

import React, { useState } from 'react'
import { PanelLeft, DollarSign, Clock, ArrowUp, ArrowDown, Recycle, Zap, Timer, Square, StopCircle, Pin, Settings, Gauge, Brain, Calendar, Wifi, Archive, ClipboardList } from 'lucide-react'
import { useChatStore, usePrefsStore, useUiStore, useSessionStore } from '../../store'
import { StandardChatMessage } from '../../types/app.types'
import { useT } from '../../i18n'
import { Separator, formatDuration, fmtNumber } from './statusBarConstants'
import { useFocusTimer, useStopwatch, FOCUS_PRESETS } from './useStatusBarTimers'
import { useStreamingSpeed } from './useStreamingSpeed'
import { useMemoryUsage } from '../../hooks/useMemoryUsage'
import StatusBarModelPicker from './StatusBarModelPicker'
import StatusBarPersonaPicker from './StatusBarPersonaPicker'
import StatusBarTokenPopup from './StatusBarTokenPopup'

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

function getModelPricing(modelId: string): [number, number] | null {
  // Try exact match first, then partial
  const costs = MODEL_PRICING[modelId]
    || Object.entries(MODEL_PRICING).find(([k]) => modelId.includes(k))?.[1]
  return costs || null
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
  const isPlanMode = useChatStore(s => s.isPlanMode)
  const toggleSidebar = useUiStore(s => s.toggleSidebar)
  const sidebarOpen = useUiStore(s => s.sidebarOpen)
  const alwaysOnTop = useUiStore(s => s.alwaysOnTop)
  const setAlwaysOnTop = useUiStore(s => s.setAlwaysOnTop)
  const t = useT()

  // Hooks from extracted modules
  const streamingSpeed = useStreamingSpeed()
  const focusTimer = useFocusTimer()
  const stopwatch = useStopwatch()
  const memoryUsage = useMemoryUsage()

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
  const [showTokenPopup, setShowTokenPopup] = useState(false)
  const costPopupRef = React.useRef<HTMLDivElement>(null)
  const tokenPopupRef = React.useRef<HTMLDivElement>(null)
  const firstMsgTs = chatMessages.length > 0
    ? (chatMessages[0] as StandardChatMessage).timestamp
    : null
  const sessionDuration = firstMsgTs ? Date.now() - firstMsgTs : null

  const personas = prefs.personas || []
  const activePersona = personas.find(p => p.id === prefs.activePersonaId)

  // Sessions today count (Iteration 417)
  const allSessions = useSessionStore(s => s.sessions)
  const sessionsToday = React.useMemo(() => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    return allSessions.filter(s => s.timestamp >= todayStart.getTime()).length
  }, [allSessions])

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

  // Close token popup on outside click
  React.useEffect(() => {
    if (!showTokenPopup) return
    const handler = (e: MouseEvent) => {
      if (tokenPopupRef.current && !tokenPopupRef.current.contains(e.target as Node)) {
        setShowTokenPopup(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showTokenPopup])

  // Close timer presets on outside click
  React.useEffect(() => {
    if (!focusTimer.showPresets) return
    const handler = () => focusTimer.setShowPresets(false)
    const timeout = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => { clearTimeout(timeout); document.removeEventListener('mousedown', handler) }
  }, [focusTimer.showPresets])

  // Effort level config (5 levels: auto/low/medium/high/max)
  const effortLevel = prefs.effortLevel || 'auto'
  const effortColors: Record<string, string> = { auto: '#60a5fa', low: '#4ade80', medium: '#fbbf24', high: '#fb923c', max: '#f87171' }
  const effortAbbr: Record<string, string> = { auto: 'A', low: 'L', medium: 'M', high: 'H', max: 'X' }

  // Extended thinking toggle (Iteration 378)
  const thinkingEnabled = prefs.extendedThinking || false
  const toggleThinking = () => {
    const newVal = !thinkingEnabled
    setPrefs({ extendedThinking: newVal })
    window.electronAPI.prefsSet('extendedThinking', newVal)
    useUiStore.getState().addToast('info', t(newVal ? 'thinking.enabled' : 'thinking.disabled'))
  }

  // Compact handler for token popup (Iteration 517)
  const handleCompactFromTokenPopup = () => {
    setShowTokenPopup(false)
    window.dispatchEvent(new CustomEvent('aipa:compactRequest'))
  }

  return (
    <div
      role="status"
      aria-label={t('a11y.statusBar')}
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

        {/* Connection status indicator */}
        <span
          title={isStreaming ? t('statusBar.connected') : t('statusBar.idle')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            opacity: 0.8,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: isStreaming ? '#4ade80' : '#a0a0a0',
              transition: 'background 0.3s',
              animation: isStreaming ? 'pulse 1.2s ease-in-out infinite' : undefined,
            }}
          />
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

        {/* Plan Mode badge (Iteration 520) */}
        {isPlanMode && (
          <button
            onClick={() => {
              useChatStore.getState().setPlanMode(false)
              useUiStore.getState().addToast('info', t('plan.disabled'))
            }}
            title={t('plan.exitHint')}
            style={{
              display: 'flex', alignItems: 'center', gap: 3,
              padding: '1px 6px', borderRadius: 4,
              background: 'rgba(167, 139, 250, 0.25)', border: 'none',
              color: '#e9d5ff', cursor: 'pointer',
              fontSize: 9, fontWeight: 600, letterSpacing: 0.5,
              transition: 'background 150ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(167, 139, 250, 0.4)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(167, 139, 250, 0.25)' }}
          >
            <ClipboardList size={9} />
            {t('plan.statusLabel')}
          </button>
        )}

        {/* Context window usage bar — clickable for token detail popup (Iteration 517) */}
        {contextPct !== null && (
          <div style={{ position: 'relative' }} ref={tokenPopupRef}>
            <button
              onClick={() => setShowTokenPopup(!showTokenPopup)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, opacity: 0.9,
                background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0,
              }}
              title={t('toolbar.contextUsed', { percent: String(contextPct), used: fmtNumber(lastContextUsage!.used), total: fmtNumber(lastContextUsage!.total) })}
            >
              <span style={{ fontSize: 9, opacity: 0.7 }}>{t('toolbar.context')}</span>
              <div
                role="progressbar"
                aria-valuenow={contextPct}
                aria-valuemin={0}
                aria-valuemax={100}
                style={{ width: 60, height: 4, background: 'rgba(255,255,255,0.25)', borderRadius: 3, overflow: 'hidden' }}
              >
                <div style={{ width: `${contextPct}%`, height: '100%', background: ctxColor, transition: 'width 0.3s ease, background 0.3s ease', borderRadius: 3 }} />
              </div>
              <span style={{ fontSize: 10, opacity: 0.8, fontVariantNumeric: 'tabular-nums' }}>
                {fmtNumber(lastContextUsage!.used)}/{fmtNumber(lastContextUsage!.total)}
              </span>
              {contextPct >= 85 && !isStreaming && (
                <span
                  onClick={(e) => { e.stopPropagation(); handleCompactFromTokenPopup() }}
                  title={t('chat.compactHint')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 2,
                    padding: '0 3px', fontSize: 9, fontWeight: 500,
                    background: 'rgba(248,113,113,0.15)', borderRadius: 4,
                    color: '#f87171', cursor: 'pointer',
                  }}
                >
                  <Archive size={8} />
                </span>
              )}
            </button>
            {showTokenPopup && (
              <StatusBarTokenPopup
                lastUsage={lastUsage}
                lastContextUsage={lastContextUsage}
                contextPct={contextPct}
                ctxColor={ctxColor}
                totalSessionCost={totalSessionCost}
                isStreaming={isStreaming}
                onCompact={handleCompactFromTokenPopup}
              />
            )}
          </div>
        )}

        {/* Session duration */}
        {sessionDuration !== null && sessionDuration > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, opacity: 0.7, fontSize: 10 }}>
            <Clock size={10} />
            {formatDuration(sessionDuration)}
          </span>
        )}

        {/* Focus timer with duration presets (enhanced Iteration 467) */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={focusTimer.toggle}
            onContextMenu={(e) => { e.preventDefault(); focusTimer.togglePresets() }}
            title={focusTimer.active
              ? t('toolbar.stopFocusTimer')
              : t('toolbar.startFocusTimer') + ' (right-click for presets)'}
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
                <span>{Math.floor(focusTimer.duration / 60)}m</span>
              </>
            )}
          </button>
          {/* Preset duration dropdown */}
          {focusTimer.showPresets && (
            <div
              className="popup-enter"
              style={{
                position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                marginBottom: 4, background: 'var(--popup-bg)', border: '1px solid var(--popup-border)',
                boxShadow: 'var(--popup-shadow)', borderRadius: 8, padding: '4px',
                display: 'flex', gap: 2, zIndex: 100, whiteSpace: 'nowrap',
              }}
            >
              {FOCUS_PRESETS.map(preset => (
                <button
                  key={preset.seconds}
                  onClick={() => focusTimer.start(preset.seconds)}
                  style={{
                    padding: '4px 8px', borderRadius: 6,
                    border: 'none', background: 'transparent',
                    color: 'var(--text-primary)', fontSize: 11, cursor: 'pointer',
                    transition: 'background 100ms',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--popup-item-hover)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}
        </div>

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
              const text = lastUsage.cacheTokens > 0
                ? t('cost.tokenCopyFormatWithCache', { input: String(lastUsage.inputTokens), output: String(lastUsage.outputTokens), cache: String(lastUsage.cacheTokens) })
                : t('cost.tokenCopyFormat', { input: String(lastUsage.inputTokens), output: String(lastUsage.outputTokens) })
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
                    const pricingLabel = pricing
                      ? `$${Number.isInteger(pricing[0]) ? pricing[0] : pricing[0].toFixed(2)}/$${Number.isInteger(pricing[1]) ? pricing[1] : pricing[1].toFixed(2)} ${t('cost.perMtok')}`
                      : null
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
                          {pricingLabel && <span style={{ opacity: 0.7 }}>{pricingLabel}</span>}
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

        {/* Effort level indicator (display only, non-auto levels) */}
        {effortLevel !== 'auto' && (
          <span
            title={t('effort.title', { level: t(`effort.${effortLevel}`) })}
            style={{
              display: 'flex', alignItems: 'center', gap: 3,
              color: effortColors[effortLevel] || '#fff',
              fontSize: 10, opacity: 0.9,
            }}
          >
            <Gauge size={10} />
            <span style={{ fontWeight: 600, fontSize: 10 }}>{effortAbbr[effortLevel] || '?'}</span>
          </span>
        )}

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

        {/* Date + sessions today (Iteration 417) */}
        <span style={{ display: 'flex', alignItems: 'center', gap: 3, opacity: 0.7, fontSize: 10 }}>
          <Calendar size={10} />
          {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>
        {sessionsToday > 0 && (
          <span style={{ opacity: 0.7, fontSize: 10 }}>
            {sessionsToday} {t('statusBar.today')}
          </span>
        )}

        {/* Memory usage warning (Iteration 491) — only shown when >= 1.5GB */}
        {memoryUsage && (
          <span
            title={`Memory: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(0)} MB — ${memoryUsage.status === 'critical' ? 'Critical' : 'High'}`}
            style={{
              display: 'flex', alignItems: 'center', gap: 3, fontSize: 10,
              color: memoryUsage.status === 'critical' ? '#f87171' : '#fbbf24',
              fontWeight: 600,
            }}
          >
            <span style={{ fontSize: 9 }}>RAM</span>
            {(memoryUsage.heapUsed / 1024 / 1024).toFixed(0)}MB
          </span>
        )}
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
