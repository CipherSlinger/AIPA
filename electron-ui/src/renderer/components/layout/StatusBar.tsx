import React, { useRef, useEffect, useState, useCallback } from 'react'
import { PanelLeft, Terminal, DollarSign, Clock, ArrowUp, ArrowDown, Recycle, Zap, Timer, Play, Square, ChevronUp, Check, StopCircle, User } from 'lucide-react'
import { useChatStore, usePrefsStore, useUiStore } from '../../store'
import { StandardChatMessage, Persona } from '../../types/app.types'
import { useT } from '../../i18n'
import { MODEL_OPTIONS } from '../settings/settingsConstants'

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
  const t = useT()

  // Model quick-picker
  const [showModelPicker, setShowModelPicker] = useState(false)
  const modelPickerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!showModelPicker) return
    const handler = (e: MouseEvent) => {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setShowModelPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showModelPicker])

  const handleModelSelect = useCallback((modelId: string) => {
    usePrefsStore.getState().setPrefs({ model: modelId })
    window.electronAPI.prefsSet('model', modelId)
    setShowModelPicker(false)
    useUiStore.getState().addToast('success', t('chat.modelSwitched', { model: modelId.replace('claude-', '') }))
  }, [t])

  // Persona quick-picker
  const [showPersonaPicker, setShowPersonaPicker] = useState(false)
  const personaPickerRef = useRef<HTMLDivElement>(null)
  const personas: Persona[] = prefs.personas || []
  const activePersona = personas.find(p => p.id === prefs.activePersonaId)

  useEffect(() => {
    if (!showPersonaPicker) return
    const handler = (e: MouseEvent) => {
      if (personaPickerRef.current && !personaPickerRef.current.contains(e.target as Node)) {
        setShowPersonaPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPersonaPicker])

  const handlePersonaSelect = useCallback((personaId: string | null) => {
    const { setPrefs } = usePrefsStore.getState()
    if (personaId) {
      const persona = (usePrefsStore.getState().prefs.personas || []).find(p => p.id === personaId)
      if (persona) {
        setPrefs({ activePersonaId: personaId, model: persona.model, systemPrompt: persona.systemPrompt, responseTone: persona.responseTone || 'default' })
        window.electronAPI.prefsSet('activePersonaId', personaId)
        window.electronAPI.prefsSet('model', persona.model)
        window.electronAPI.prefsSet('systemPrompt', persona.systemPrompt)
        window.electronAPI.prefsSet('responseTone', persona.responseTone || 'default')
        useUiStore.getState().addToast('success', t('persona.switchedTo', { name: persona.name }))
      }
    } else {
      setPrefs({ activePersonaId: undefined, systemPrompt: '', responseTone: 'default' })
      window.electronAPI.prefsSet('activePersonaId', null)
      window.electronAPI.prefsSet('systemPrompt', '')
      window.electronAPI.prefsSet('responseTone', 'default')
      useUiStore.getState().addToast('info', t('persona.deactivated'))
    }
    setShowPersonaPicker(false)
  }, [t])

  // Streaming speed tracking (chars/sec)
  const streamingStartRef = useRef<number>(0)
  const lastContentLenRef = useRef<number>(0)
  const [streamingSpeed, setStreamingSpeed] = useState<number | null>(null)

  // Track streaming start/stop and compute speed
  useEffect(() => {
    if (isStreaming) {
      // Start tracking
      streamingStartRef.current = Date.now()
      lastContentLenRef.current = 0
      setStreamingSpeed(null)

      const interval = setInterval(() => {
        // Get the last assistant message content length
        const msgs = useChatStore.getState().messages
        const lastMsg = msgs[msgs.length - 1]
        if (lastMsg && lastMsg.role === 'assistant' && (lastMsg as StandardChatMessage).content) {
          const contentLen = (lastMsg as StandardChatMessage).content.length
          const elapsed = (Date.now() - streamingStartRef.current) / 1000
          if (elapsed > 0.5 && contentLen > 0) {
            setStreamingSpeed(Math.round(contentLen / elapsed))
          }
        }
      }, 500)

      return () => clearInterval(interval)
    } else {
      setStreamingSpeed(null)
    }
  }, [isStreaming])

  const dirLabel = workingDir || prefs.workingDir || '~'

  // Focus timer (Pomodoro)
  const POMODORO_DURATION = 25 * 60 // 25 minutes in seconds
  const [focusTimerActive, setFocusTimerActive] = useState(false)
  const [focusTimerRemaining, setFocusTimerRemaining] = useState(POMODORO_DURATION)
  const focusTimerRef = useRef<number>(0)

  const toggleFocusTimer = useCallback(() => {
    if (focusTimerActive) {
      // Stop timer
      if (focusTimerRef.current) clearInterval(focusTimerRef.current)
      focusTimerRef.current = 0
      setFocusTimerActive(false)
      setFocusTimerRemaining(POMODORO_DURATION)
    } else {
      // Start timer
      setFocusTimerRemaining(POMODORO_DURATION)
      setFocusTimerActive(true)
    }
  }, [focusTimerActive, POMODORO_DURATION])

  useEffect(() => {
    if (!focusTimerActive) return
    focusTimerRef.current = window.setInterval(() => {
      setFocusTimerRemaining(prev => {
        if (prev <= 1) {
          // Timer complete
          clearInterval(focusTimerRef.current)
          focusTimerRef.current = 0
          setFocusTimerActive(false)
          // Play notification sound if enabled
          if (prefs.notifySound !== false) {
            try {
              const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2MkZabnp2bl5KMhoJ+enl5e36BhYmMj5KUlpeTkI2Kh4SBfnt5eHl7foKGio6RlJaXlpOPjImGg4B9e3p5ent+goaMkJOWmJiWk5CMiYaEgX58e3t7fH+Ch4uPk5aYl5WSkI2Jh4SAf3x7e3x9f4KHi4+TlpiXlZKQjIqHhIKAf317e3x9gIOIjJCTlpeWk5GNi4mHhIJ/fXx7fH6AgYSIjJCSlZaVk5CQjouJh4SBf317fH1+gIKEiIuOkZOVlJOQjo2LiYeEg4F/fn18fn+AgoWHi46RkpSUkpCNi4qIh4SDgX9+fX5/gIGDhYmLjpCSkpGQjYyLiYiGhYOBgH5+f4CBgoSGiIuNkJGSkZCOjYyKiYiGhYOCgIB/f4CBgoSFh4qMjpCRkpGQjo2Mi4qJh4aFg4KBgH+AgoKDhYeJi42PkJGRkI+OjYyLiomIh4WEg4KBgICBgoOEhoeJi42Oj5CQj46NjIuLiomIh4aFhIOCgoGBgYKDhIWHiImLjI6Oj4+OjY2Mi4uKiYiHhoWEhIODgoKCg4OEhYaHiYqLjI2Oj46OjY2Mi4uKiYmIh4aGhYWEhIODg4ODhIWGh4iJiouMjY2OjY2NjIyLi4qKiYiIh4eGhoWFhYSEhIWFhoaHiImKi4yMjY2NjY2NjIyLi4uKiomJiIiHh4aGhoaGhoaGh4eIiImKiouMjIyNjY2NjIyMi4uLi4qKiYmJiIiHh4eHh4eHh4eHiIiJiYqKi4uMjIyMjIyMjIyMi4uLi4qKioqJiYmIiIiIiIiIiIiIiIiJiYmKiouLi4yMjIyMjIyMjIuLi4uLi4qKioqJiYmJiYmJiYmJiYmJiYmJiYqKioqLi4uLi4yMjIyMjIyMi4uLi4uLi4uKioqKiomJiYmJiYmJiYmJiYmJiYqKioqKi4uLi4uLjIyMjIyMjIuLi4uLi4uLioqKioqKiYmJiYmJiYmJiYmJiYqKioqKi4uLi4uLi4yMjIyMi4uLi4uLi4uLi4qKioqKioqJiYmJiYmJiYmJiYqKioqKi4uLi4uLi4uLjIyMi4uLi4uLi4uLi4qKioqKioqKiYqKioqKioqKioqKioqKi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uKioqKioqKioqKioqKioqKioqKioqLi4uLi4uLi4uLi4uLi4uLi4uLi4uLioqKioqKioqKioqKioqKioqKioqKi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4qKioqKioqK')
              audio.volume = 0.3
              audio.play().catch(() => {})
            } catch {}
          }
          // Show toast
          useUiStore.getState().addToast('success', t('toolbar.focusTimerComplete'))
          return POMODORO_DURATION
        }
        return prev - 1
      })
    }, 1000)
    return () => {
      if (focusTimerRef.current) clearInterval(focusTimerRef.current)
    }
  }, [focusTimerActive, prefs.notifySound, t, POMODORO_DURATION])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (focusTimerRef.current) clearInterval(focusTimerRef.current)
    }
  }, [])

  // Stopwatch (count-up timer)
  const [stopwatchActive, setStopwatchActive] = useState(false)
  const [stopwatchElapsed, setStopwatchElapsed] = useState(0)
  const stopwatchRef = useRef<number>(0)
  const stopwatchLastClickRef = useRef<number>(0)

  const handleStopwatchClick = useCallback(() => {
    const now = Date.now()
    // Double-click within 400ms: reset
    if (now - stopwatchLastClickRef.current < 400 && !stopwatchActive) {
      setStopwatchElapsed(0)
      stopwatchLastClickRef.current = 0
      return
    }
    stopwatchLastClickRef.current = now

    if (stopwatchActive) {
      // Stop
      if (stopwatchRef.current) clearInterval(stopwatchRef.current)
      stopwatchRef.current = 0
      setStopwatchActive(false)
    } else {
      // Start
      setStopwatchActive(true)
    }
  }, [stopwatchActive])

  useEffect(() => {
    if (!stopwatchActive) return
    stopwatchRef.current = window.setInterval(() => {
      setStopwatchElapsed(prev => prev + 1)
    }, 1000)
    return () => {
      if (stopwatchRef.current) clearInterval(stopwatchRef.current)
    }
  }, [stopwatchActive])

  // Cleanup stopwatch on unmount
  useEffect(() => {
    return () => {
      if (stopwatchRef.current) clearInterval(stopwatchRef.current)
    }
  }, [])

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
            title={t('toolbar.contextUsed', { percent: String(contextPct), used: fmt(lastContextUsage!.used), total: fmt(lastContextUsage!.total) })}
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
          onClick={toggleFocusTimer}
          title={focusTimerActive ? t('toolbar.stopFocusTimer') : t('toolbar.startFocusTimer')}
          style={{
            background: focusTimerActive ? 'rgba(255,255,255,0.15)' : 'none',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            padding: '1px 5px',
            borderRadius: 4,
            fontSize: 10,
            opacity: focusTimerActive ? 1 : 0.6,
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = focusTimerActive ? '1' : '0.6' }}
        >
          {focusTimerActive ? (
            <>
              <Timer size={10} style={{ color: '#4ade80' }} />
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                {Math.floor(focusTimerRemaining / 60)}:{String(focusTimerRemaining % 60).padStart(2, '0')}
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
          onClick={handleStopwatchClick}
          title={stopwatchActive ? t('toolbar.stopStopwatch') : stopwatchElapsed > 0 ? t('toolbar.resumeStopwatch') : t('toolbar.startStopwatch')}
          style={{
            background: stopwatchActive ? 'rgba(255,255,255,0.15)' : 'none',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            padding: '1px 5px',
            borderRadius: 4,
            fontSize: 10,
            opacity: stopwatchActive || stopwatchElapsed > 0 ? 1 : 0.6,
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = (stopwatchActive || stopwatchElapsed > 0) ? '1' : '0.6' }}
        >
          <StopCircle size={10} style={{ color: stopwatchActive ? '#f59e0b' : undefined }} />
          {stopwatchActive || stopwatchElapsed > 0 ? (
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatDuration(stopwatchElapsed * 1000)}
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
            {fmt(lastUsage.inputTokens)}
            <ArrowDown size={9} />
            {fmt(lastUsage.outputTokens)}
            {lastUsage.cacheTokens > 0 && (
              <>
                <Recycle size={9} style={{ opacity: 0.7 }} />
                {fmt(lastUsage.cacheTokens)}
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
        {personas.length > 0 && (
          <div style={{ position: 'relative' }} ref={personaPickerRef}>
            <button
              onClick={() => setShowPersonaPicker(!showPersonaPicker)}
              style={{
                padding: '1px 6px',
                borderRadius: 8,
                background: activePersona
                  ? `${activePersona.color}33`
                  : showPersonaPicker ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.15)',
                fontSize: 10,
                fontWeight: 500,
                whiteSpace: 'nowrap',
                opacity: 0.9,
                border: activePersona ? `1px solid ${activePersona.color}66` : 'none',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                transition: 'background 0.15s',
              }}
              title={activePersona ? t('persona.personaActive', { name: activePersona.name }) : t('persona.selectPersona')}
            >
              {activePersona ? (
                <>
                  <span style={{ fontSize: 11 }}>{activePersona.emoji}</span>
                  {activePersona.name}
                </>
              ) : (
                <>
                  <User size={10} />
                  {t('persona.selectPersona')}
                </>
              )}
              <ChevronUp size={8} style={{ opacity: 0.6, transform: showPersonaPicker ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </button>
            {showPersonaPicker && (
              <div
                className="popup-enter"
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  right: 0,
                  marginBottom: 4,
                  background: 'var(--popup-bg)',
                  border: '1px solid var(--popup-border)',
                  boxShadow: 'var(--popup-shadow)',
                  borderRadius: 8,
                  padding: '4px 0',
                  minWidth: 160,
                  zIndex: 100,
                }}
              >
                <button
                  onClick={() => handlePersonaSelect(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    width: '100%',
                    padding: '5px 12px',
                    background: !prefs.activePersonaId ? 'var(--popup-item-hover)' : 'transparent',
                    border: 'none',
                    color: !prefs.activePersonaId ? 'var(--accent)' : 'var(--text-primary)',
                    cursor: 'pointer',
                    fontSize: 11,
                    textAlign: 'left',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (prefs.activePersonaId) (e.currentTarget as HTMLElement).style.background = 'var(--popup-item-hover)' }}
                  onMouseLeave={e => { if (prefs.activePersonaId) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  {!prefs.activePersonaId && <Check size={11} />}
                  <span style={{ marginLeft: !prefs.activePersonaId ? 0 : 17 }}>{t('persona.noPersona')}</span>
                </button>
                {personas.map(p => {
                  const isActive = p.id === prefs.activePersonaId
                  return (
                    <button
                      key={p.id}
                      onClick={() => handlePersonaSelect(p.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        width: '100%',
                        padding: '5px 12px',
                        background: isActive ? 'var(--popup-item-hover)' : 'transparent',
                        border: 'none',
                        color: isActive ? p.color : 'var(--text-primary)',
                        cursor: 'pointer',
                        fontSize: 11,
                        textAlign: 'left',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--popup-item-hover)' }}
                      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      {isActive && <Check size={11} />}
                      <span style={{ marginLeft: isActive ? 0 : 17 }}>
                        {p.emoji} {p.name}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Model badge (clickable) */}
        <div style={{ position: 'relative' }} ref={modelPickerRef}>
          <button
            onClick={() => setShowModelPicker(!showModelPicker)}
            style={{
              padding: '1px 6px',
              borderRadius: 8,
              background: showModelPicker ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.15)',
              fontSize: 10,
              fontWeight: 500,
              whiteSpace: 'nowrap',
              opacity: 0.9,
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              transition: 'background 0.15s',
            }}
            title={t('chat.switchModel')}
          >
            {shortModel}
            <ChevronUp size={8} style={{ opacity: 0.6, transform: showModelPicker ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>
          {showModelPicker && (
            <div
              className="popup-enter"
              style={{
                position: 'absolute',
                bottom: '100%',
                right: 0,
                marginBottom: 4,
                background: 'var(--popup-bg)',
                border: '1px solid var(--popup-border)',
                boxShadow: 'var(--popup-shadow)',
                borderRadius: 8,
                padding: '4px 0',
                minWidth: 180,
                zIndex: 100,
              }}
            >
              {MODEL_OPTIONS.map(opt => {
                const isActive = opt.id === (prefs.model || 'claude-sonnet-4-6')
                return (
                  <button
                    key={opt.id}
                    onClick={() => handleModelSelect(opt.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      width: '100%',
                      padding: '5px 12px',
                      background: isActive ? 'var(--popup-item-hover)' : 'transparent',
                      border: 'none',
                      color: isActive ? 'var(--accent)' : 'var(--text-primary)',
                      cursor: 'pointer',
                      fontSize: 11,
                      textAlign: 'left',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--popup-item-hover)' }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    {isActive && <Check size={11} />}
                    <span style={{ marginLeft: isActive ? 0 : 17 }}>{t(opt.labelKey)}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

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
