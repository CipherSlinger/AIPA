import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { History, X, MessageSquare, Layers, Clock, ArrowRight, Sparkles, Lightbulb } from 'lucide-react'
import { useUiStore, useSessionStore, usePrefsStore, useChatStore } from '../../store'
import { useT } from '../../i18n'
import { getGreetingKey, getPersonaStarters, getDefaultSuggestions, getShortcuts, getQuickActions, getTimeSuggestions, getFloatingActions } from './welcomeScreenConstants'
import { useTips } from '../../hooks/useTips'
import TemplatesSection from './TemplatesSection'
import DailySummaryCard from './DailySummaryCard'
import WelcomeHero from './WelcomeHero'
import WelcomeRecentPrompts from './WelcomeRecentPrompts'
import WelcomeQuickActions from './WelcomeQuickActions'

interface Props {
  onSuggestion: (text: string, templateId?: string) => void
  onOpenSession?: (sessionId: string) => void
}

export default function WelcomeScreen({ onSuggestion, onOpenSession }: Props) {
  const t = useT()
  const [greeting, setGreeting] = useState(getGreetingKey())
  const sessions = useSessionStore(s => s.sessions)
  const personas = usePrefsStore(s => s.prefs.personas) || []
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
  const timeSuggestions = useMemo(() => getTimeSuggestions(t), [t, greeting])
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
  const promptHistory = usePrefsStore(s => s.prefs.promptHistory) || []
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

  const accentTint = activePersona ? `${activePersona.color}20` : 'rgba(0,122,204,0.1)'
  const accentColor = activePersona?.color || 'var(--accent)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', color: 'var(--text-muted)', overflowY: 'auto', overflowX: 'hidden' }}>
      {/* Spacer that auto-shrinks: when content fits, it centers; when content overflows, it collapses */}
      <div style={{ flex: '1 1 auto', minHeight: 16 }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '0 20px', width: '100%', flexShrink: 0 }}>
      {/* Daily summary card */}
      <DailySummaryCard />

      {/* Hero: icon + greeting + date + subtitle (Iteration 454) */}
      <WelcomeHero
        greeting={greeting}
        displayName={displayName}
        activePersona={activePersona}
        accentTint={accentTint}
      />

      {/* Time-contextual suggestions */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {timeSuggestions.map(({ icon: TSIcon, textKey }) => (
          <button
            key={textKey}
            onClick={() => onSuggestion(t(textKey))}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px',
              background: 'var(--card-bg)', border: '1px solid var(--card-border)',
              borderRadius: 20, color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12,
              transition: 'background 0.15s, border-color 0.15s, transform 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--action-btn-hover)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)';
              (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.03)'
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--card-bg)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--card-border)';
              (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'
            }}
          >
            <TSIcon size={14} color="var(--accent)" />
            <span>{t(textKey)}</span>
          </button>
        ))}
      </div>

      {/* Usage stats bar */}
      {usageStats.totalSessions > 0 && (
        <div style={{
          display: 'flex', gap: 20, justifyContent: 'center', alignItems: 'center',
          padding: '8px 16px', background: 'var(--card-bg)', border: '1px solid var(--card-border)',
          borderRadius: 20, fontSize: 11, color: 'var(--text-muted)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Layers size={12} style={{ opacity: 0.6 }} />
            <span><b style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{usageStats.totalSessions}</b> {t('welcome.statsSessions')}</span>
          </div>
          <div style={{ width: 1, height: 14, background: 'var(--border)', opacity: 0.5 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <MessageSquare size={12} style={{ opacity: 0.6 }} />
            <span><b style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{usageStats.totalMessages}</b> {t('welcome.statsMessages')}</span>
          </div>
          {usageStats.sessionsToday > 0 && (
            <>
              <div style={{ width: 1, height: 14, background: 'var(--border)', opacity: 0.5 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Clock size={12} style={{ opacity: 0.6 }} />
                <span><b style={{ color: 'var(--accent)', fontWeight: 600 }}>{usageStats.sessionsToday}</b> {t('welcome.statsToday')}</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Continue Last Conversation card */}
      {lastSession && onOpenSession && (
        <button
          onClick={() => onOpenSession(lastSession.sessionId)}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
            background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 12,
            color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13,
            width: '100%', maxWidth: 420, transition: 'background 0.15s, border-color 0.15s', textAlign: 'left',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--action-btn-hover)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--card-bg)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--card-border)'
          }}
        >
          <div style={{
            width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,122,204,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <History size={18} color="var(--accent)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t('welcome.continueLastChat')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {lastSession.title || lastSession.lastPrompt || t('session.untitled')}
            </div>
          </div>
          <ArrowRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        </button>
      )}

      {/* Persona quick-start cards */}
      {personas.length > 0 && (
        <div style={{ width: '100%', maxWidth: 420 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Sparkles size={11} />
            <span>{t('persona.title')}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {personas.slice(0, 4).map(p => {
              const isActive = p.id === activePersonaId
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    if (isActive) return
                    const resolvedPrompt = p.presetKey ? t(`persona.presetPrompt.${p.presetKey}`) : p.systemPrompt
                    useChatStore.getState().setSessionPersonaId(p.id)
                    usePrefsStore.getState().setPrefs({
                      model: p.model,
                      systemPrompt: resolvedPrompt,
                    })
                    window.electronAPI.prefsSet('model', p.model)
                    window.electronAPI.prefsSet('systemPrompt', resolvedPrompt)
                    useUiStore.getState().addToast('success', t('persona.switchedTo', { name: p.presetKey ? t(`persona.preset.${p.presetKey}`) : p.name }))
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                    background: isActive ? `${p.color}18` : 'var(--card-bg)',
                    border: `1px solid ${isActive ? p.color : 'var(--card-border)'}`,
                    borderRadius: 10, color: isActive ? p.color : 'var(--text-primary)',
                    cursor: isActive ? 'default' : 'pointer', fontSize: 12,
                    transition: 'background 0.15s, border-color 0.15s, transform 0.15s',
                    fontWeight: isActive ? 600 : 400,
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = p.color;
                      (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.03)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--card-border)';
                      (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'
                    }
                  }}
                >
                  <span style={{ fontSize: 18 }}>{p.emoji}</span>
                  <span>{p.name}</span>
                  {isActive && (
                    <span style={{
                      fontSize: 8, background: p.color, color: '#fff',
                      padding: '1px 5px', borderRadius: 6, fontWeight: 600,
                    }}>
                      {t('persona.active')}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Suggestion cards */}
      <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
        {suggestions.map(({ icon: Icon, text, templateId }: { icon: any; text: string; templateId?: string }) => (
          <button
            key={text}
            onClick={() => onSuggestion(text, templateId)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              padding: '14px 14px', background: 'var(--card-bg)', border: '1px solid var(--card-border)',
              borderRadius: 12, color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12,
              minWidth: 110, maxWidth: 140, transition: 'background 0.15s, border-color 0.15s, transform 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--action-btn-hover)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)';
              (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.03)'
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--card-bg)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--card-border)';
              (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: activePersona ? `${activePersona.color}14` : 'rgba(0,122,204,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon size={20} color={accentColor} />
            </div>
            <span style={{ textAlign: 'center', lineHeight: 1.4 }}>{text}</span>
          </button>
        ))}
      </div>

      {/* Conversation templates */}
      <TemplatesSection onUseTemplate={onSuggestion} />

      {/* Keyboard shortcuts */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: '8px 20px',
        padding: '14px 20px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 10,
      }}>
        {shortcuts.map(({ keys, desc }) => (
          <div key={keys} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <kbd style={{
              background: 'var(--popup-bg)', border: '1px solid var(--popup-border)', borderRadius: 4,
              padding: '2px 8px', fontSize: 10, fontFamily: 'monospace', color: 'var(--text-primary)', whiteSpace: 'nowrap',
            }}>{keys}</kbd>
            <span style={{ color: 'var(--text-muted)' }}>{desc}</span>
          </div>
        ))}
      </div>

      {/* Contextual tip */}
      {tip && (
        <div style={{
          width: '100%', maxWidth: 420, padding: '10px 14px',
          background: 'var(--card-bg)', border: '1px solid var(--card-border)',
          borderRadius: 10, display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <Lightbulb size={16} color="var(--warning)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, color: 'var(--warning)', fontWeight: 600, marginBottom: 4 }}>
              {t('tips.title')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5 }}>
              {t(tip.contentKey)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <button
              onClick={nextTip}
              title={t('tips.nextTip')}
              style={{
                background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
                padding: '2px 4px', borderRadius: 3, fontSize: 10,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              {t('tips.nextTip')}
            </button>
            <button
              onClick={dismissTip}
              title={t('tips.dismiss')}
              style={{
                background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
                padding: '2px', borderRadius: 3,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Recent & top prompts (Iteration 454) */}
      <WelcomeRecentPrompts
        recentPrompts={recentPrompts}
        topPrompts={topPrompts}
        onSuggestion={onSuggestion}
        onClearHistory={clearRecentPrompts}
        onToggleFavorite={toggleFavorite}
      />

      {/* Quick actions + floating bar (Iteration 454) */}
      <WelcomeQuickActions
        quickActions={quickActions}
        floatingActions={floatingActions}
        onFloatingAction={handleFloatingAction}
      />
      </div>
      {/* Bottom spacer that auto-shrinks: mirrors the top spacer for centering */}
      <div style={{ flex: '1 1 auto', minHeight: 16 }} />
    </div>
  )
}
