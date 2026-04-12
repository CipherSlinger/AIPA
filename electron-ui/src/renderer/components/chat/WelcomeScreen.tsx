import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { History, X, MessageSquare, Layers, Clock, ArrowRight, Lightbulb } from 'lucide-react'
import { useUiStore, useSessionStore, usePrefsStore, useChatStore } from '../../store'
import { useT } from '../../i18n'
import { getGreetingKey, getPersonaStarters, getDefaultSuggestions, getShortcuts, getQuickActions, getFloatingActions } from './welcomeScreenConstants'
import { useTips } from '../../hooks/useTips'
import TemplatesSection from './TemplatesSection'
import DailySummaryCard from './DailySummaryCard'
import WelcomeHero from './WelcomeHero'
import WelcomeRecentPrompts from './WelcomeRecentPrompts'
import WelcomeQuickActions from './WelcomeQuickActions'

const EMPTY_PERSONAS: never[] = []
const EMPTY_HISTORY: never[] = []

interface Props {
  onSuggestion: (text: string, templateId?: string) => void
  onOpenSession?: (sessionId: string) => void
}

export default function WelcomeScreen({ onSuggestion, onOpenSession }: Props) {
  const t = useT()
  const [greeting, setGreeting] = useState(getGreetingKey())
  const sessions = useSessionStore(s => s.sessions)
  const personas = usePrefsStore(s => s.prefs.personas ?? EMPTY_PERSONAS)
  const sessionPersonaId = useChatStore(s => s.sessionPersonaId)
  const defaultPersonaId = usePrefsStore(s => s.prefs.activePersonaId)
  const activePersonaId = sessionPersonaId || defaultPersonaId
  const activePersona = personas.find(p => p.id === activePersonaId)
  const displayName = usePrefsStore(s => s.prefs.displayName)

  // Update greeting every minute in case the user leaves the app open across time boundaries
  useEffect(() => {
    const interval = setInterval(() => { setGreeting(getGreetingKey()) }, 60000)
    return () => clearInterval(interval)
  }, [])

  // Load recent prompts from persistent input history
  const initialRecentPrompts = useMemo<string[]>(() => {
    try {
      const stored = localStorage.getItem('aipa:input-history')
      if (!stored) return []
      const history: string[] = JSON.parse(stored)
      return history.slice(0, 3).filter(h => h.length > 0)
    } catch { return [] }
  }, [])
  const [recentPrompts, setRecentPrompts] = useState(initialRecentPrompts)

  const clearRecentPrompts = () => {
    try { localStorage.removeItem('aipa:input-history') } catch { /* ignore */ }
    setRecentPrompts([])
  }

  // Compute usage stats from session store
  const usageStats = useMemo(() => {
    const totalSessions = sessions.length
    const totalMessages = sessions.reduce((sum, s) => sum + (s.messageCount || 0), 0)
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayTs = todayStart.getTime()
    const sessionsToday = sessions.filter(s => s.timestamp >= todayTs).length
    return { totalSessions, totalMessages, sessionsToday }
  }, [sessions])

  // Most recent session for "Continue Last Conversation" card
  const lastSession = useMemo(() => {
    if (sessions.length === 0) return null
    const sorted = [...sessions].sort((a, b) => b.timestamp - a.timestamp)
    return sorted[0]
  }, [sessions])

  // Suggestions: persona-specific starters or defaults
  const suggestions = useMemo(() => {
    return getPersonaStarters(activePersona?.presetKey || activePersona?.name, t) || getDefaultSuggestions(t)
  }, [activePersona, t])

  const shortcuts = useMemo(() => getShortcuts(t), [t])
  const quickActions = useMemo(() => getQuickActions(t), [t])
  const floatingActions = useMemo(() => getFloatingActions(t), [t])
  const { tip, dismissTip, nextTip } = useTips()

  // Floating action bar handler: read clipboard if action involves it, else just send prompt
  const handleFloatingAction = useCallback(async (prompt: string) => {
    const isClipboardAction = prompt.includes('{clipboard}')
    if (isClipboardAction) {
      try {
        const text = await navigator.clipboard.readText()
        if (text && text.trim()) {
          onSuggestion(prompt.replace('{clipboard}', text.trim()))
        } else {
          useUiStore.getState().addToast('info', t('clipboard.emptyClipboard'))
        }
      } catch {
        useUiStore.getState().addToast('error', t('clipboard.clipboardError'))
      }
    } else {
      onSuggestion(prompt)
    }
  }, [onSuggestion, t])

  // Top prompts from prompt history (sorted by count, max 3)
  const promptHistory = usePrefsStore(s => s.prefs.promptHistory ?? EMPTY_HISTORY)
  const topPrompts = useMemo(() => {
    return [...promptHistory]
      .filter(p => p.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
  }, [promptHistory])

  const toggleFavorite = (id: string) => {
    const history = usePrefsStore.getState().prefs.promptHistory || []
    const updated = history.map(item =>
      item.id === id ? { ...item, favorite: !item.favorite } : item
    )
    usePrefsStore.getState().setPrefs({ promptHistory: updated })
    window.electronAPI?.prefsSet('promptHistory', updated)
  }

  const accentTint = activePersona ? `${activePersona.color}20` : 'rgba(99,102,241,0.10)'
  const accentColor = activePersona?.color || '#6366f1'

  // Adaptive layout: measure container height and hide low-priority sections when space is tight
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerHeight, setContainerHeight] = useState(800)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const h = entries[0]?.contentRect?.height ?? 800
      setContainerHeight(h)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // Thresholds: hide sections progressively as height decreases (Iteration 459: tightened to prevent scrollbar)
  const showKeyboardShortcuts = containerHeight > 700
  const showTemplates = containerHeight > 650
  const showTips = containerHeight > 600
  const showRecentPrompts = containerHeight > 550
  const showQuickActions = containerHeight > 480
  const showDailySummary = containerHeight > 430
  const showUsageStats = containerHeight > 370
  const showContinueLastChat = containerHeight > 320
  const compactGap = containerHeight < 500 ? 8 : containerHeight < 650 ? 12 : 20

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        height: '100%',
        color: 'rgba(255,255,255,0.45)',
        overflow: 'hidden',
        background: 'transparent',
        animation: 'fadeIn 0.3s ease',
      }}
    >
      {/* Spacer that auto-shrinks: when content fits, it centers; when content overflows, it collapses */}
      <div style={{ flex: '1 1 auto', minHeight: 8 }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: compactGap, padding: '0 20px', width: '100%', flexShrink: 1, minHeight: 0 }}>
      {/* Daily summary card (Iteration 459: adaptive hide) */}
      {showDailySummary && <DailySummaryCard />}

      {/* Hero: icon + greeting + date + subtitle (Iteration 454) */}
      <WelcomeHero
        greeting={greeting}
        displayName={displayName}
        activePersona={activePersona}
        accentTint={accentTint}
      />

      {/* Usage stats bar */}
      {showUsageStats && usageStats.totalSessions > 0 && (
        <div style={{
          display: 'flex', gap: 20, justifyContent: 'center', alignItems: 'center',
          padding: '8px 16px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 20,
          fontSize: 11,
          color: 'rgba(255,255,255,0.45)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Layers size={12} style={{ opacity: 0.6 }} />
            <span><b style={{ color: 'rgba(255,255,255,0.82)', fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>{usageStats.totalSessions}</b> {t('welcome.statsSessions')}</span>
          </div>
          <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.12)', opacity: 0.5 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <MessageSquare size={12} style={{ opacity: 0.6 }} />
            <span><b style={{ color: 'rgba(255,255,255,0.82)', fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>{usageStats.totalMessages}</b> {t('welcome.statsMessages')}</span>
          </div>
          {usageStats.sessionsToday > 0 && (
            <>
              <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.12)', opacity: 0.5 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Clock size={12} style={{ opacity: 0.6 }} />
                <span><b style={{ color: 'rgba(99,102,241,0.9)', fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>{usageStats.sessionsToday}</b> {t('welcome.statsToday')}</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Continue Last Conversation card (Iteration 459: adaptive hide) */}
      {showContinueLastChat && lastSession && onOpenSession && (
        <button
          onClick={() => onOpenSession(lastSession.sessionId)}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 20px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 16,
            color: 'rgba(255,255,255,0.82)', cursor: 'pointer', fontSize: 13,
            width: '100%', maxWidth: 420, transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s', textAlign: 'left',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(99,102,241,0.35)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 16px rgba(99,102,241,0.12)'
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.07)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none'
          }}
        >
          <div style={{
            width: 36, height: 36, borderRadius: '50%', background: 'rgba(99,102,241,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <History size={18} color="#6366f1" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t('welcome.continueLastChat')}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {lastSession.title || lastSession.lastPrompt || t('session.untitled')}
            </div>
          </div>
          <ArrowRight size={16} style={{ color: 'rgba(255,255,255,0.38)', flexShrink: 0 }} />
        </button>
      )}


      {/* Suggestion cards */}
      <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
        {suggestions.map(({ icon: Icon, text, templateId }: { icon: any; text: string; templateId?: string }) => (
          <button
            key={text}
            onClick={() => onSuggestion(text, templateId)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              padding: '4px 12px',
              background: 'rgba(99,102,241,0.10)',
              border: '1px solid rgba(99,102,241,0.20)',
              borderRadius: 20,
              color: '#a5b4fc',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              minWidth: 110, maxWidth: 160,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.18)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(99,102,241,0.40)';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)';
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.10)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(99,102,241,0.20)';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'
            }}
          >
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: activePersona ? `${activePersona.color}14` : 'rgba(99,102,241,0.10)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon size={18} color={accentColor} />
            </div>
            <span style={{ textAlign: 'center', lineHeight: 1.4 }}>{text}</span>
          </button>
        ))}
      </div>

      {/* Conversation templates (Iteration 459: adaptive hide) */}
      {showTemplates && <TemplatesSection onUseTemplate={onSuggestion} />}

      {/* Keyboard shortcuts */}
      {showKeyboardShortcuts && (
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: '8px 20px',
        padding: '14px 20px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12,
      }}>
        {shortcuts.map(({ keys, desc }) => (
          <div key={keys} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <kbd style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 6,
              padding: '2px 8px', fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.60)', whiteSpace: 'nowrap',
            }}>{keys}</kbd>
            <span style={{ color: 'rgba(255,255,255,0.45)' }}>{desc}</span>
          </div>
        ))}
      </div>
      )}

      {/* Contextual tip */}
      {showTips && tip && (
        <div style={{
          width: '100%', maxWidth: 420, padding: '10px 14px',
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 10, display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <Lightbulb size={16} color="#fbbf24" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, color: '#fbbf24', fontWeight: 600, marginBottom: 4 }}>
              {t('tips.title')}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.60)', lineHeight: 1.5 }}>
              {t(tip.contentKey)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <button
              onClick={nextTip}
              title={t('tips.nextTip')}
              style={{
                background: 'none', border: 'none', color: 'rgba(255,255,255,0.45)', cursor: 'pointer',
                padding: '2px 4px', borderRadius: 6, fontSize: 10, transition: 'color 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.82)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.45)')}
            >
              {t('tips.nextTip')}
            </button>
            <button
              onClick={dismissTip}
              title={t('tips.dismiss')}
              style={{
                background: 'none', border: 'none', color: 'rgba(255,255,255,0.45)', cursor: 'pointer',
                padding: '2px', borderRadius: 6, transition: 'color 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.82)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.45)')}
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Recent & top prompts (Iteration 454) */}
      {showRecentPrompts && (
      <WelcomeRecentPrompts
        recentPrompts={recentPrompts}
        topPrompts={topPrompts}
        onSuggestion={onSuggestion}
        onClearHistory={clearRecentPrompts}
        onToggleFavorite={toggleFavorite}
      />
      )}

      {/* Quick actions + floating bar (Iteration 454) */}
      {showQuickActions && (
      <WelcomeQuickActions
        quickActions={quickActions}
        floatingActions={floatingActions}
        onFloatingAction={handleFloatingAction}
      />
      )}
      </div>
      {/* Bottom spacer that auto-shrinks: mirrors the top spacer for centering */}
      <div style={{ flex: '1 1 auto', minHeight: 8 }} />
    </div>
  )
}
