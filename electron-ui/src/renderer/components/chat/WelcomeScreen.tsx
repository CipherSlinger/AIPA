import React, { useState, useEffect, useMemo } from 'react'
import { Bot, Mail, FileText, ClipboardList, Lightbulb, Settings, Terminal, FolderOpen, Keyboard, History, X, MessageSquare, Layers, Clock, ArrowRight, Sparkles } from 'lucide-react'
import { useUiStore, useSessionStore, usePrefsStore } from '../../store'
import { useT } from '../../i18n'

/** Returns a time-of-day greeting key */
function getGreetingKey(): string {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return 'welcome.greetingMorning'
  if (hour >= 12 && hour < 18) return 'welcome.greetingAfternoon'
  return 'welcome.greetingEvening'
}

interface Props {
  onSuggestion: (text: string, templateId?: string) => void
  onOpenSession?: (sessionId: string) => void
}

export default function WelcomeScreen({ onSuggestion, onOpenSession }: Props) {
  const t = useT()
  const [greeting, setGreeting] = useState(getGreetingKey())
  const sessions = useSessionStore(s => s.sessions)
  const personas = usePrefsStore(s => s.prefs.personas) || []
  const activePersonaId = usePrefsStore(s => s.prefs.activePersonaId)
  const activePersona = personas.find(p => p.id === activePersonaId)

  // Update greeting every minute in case the user leaves the app open across time boundaries
  useEffect(() => {
    const interval = setInterval(() => {
      setGreeting(getGreetingKey())
    }, 60000)
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
    // Count sessions from today
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

  // Persona-specific starters based on active persona name
  const personaStarters = useMemo(() => {
    if (!activePersona) return null
    const name = activePersona.name.toLowerCase()
    if (name.includes('writ')) {
      return [
        { icon: Mail, text: t('welcome.starter.draftEmail') },
        { icon: FileText, text: t('welcome.starter.proofread') },
        { icon: ClipboardList, text: t('welcome.starter.blogPost') },
        { icon: Lightbulb, text: t('welcome.starter.rewriteTone') },
      ]
    }
    if (name.includes('research') || name.includes('analyst')) {
      return [
        { icon: FileText, text: t('welcome.starter.analyzeTopic') },
        { icon: ClipboardList, text: t('welcome.starter.compareOptions') },
        { icon: Lightbulb, text: t('welcome.starter.summarizeArticle') },
        { icon: Mail, text: t('welcome.starter.factCheck') },
      ]
    }
    if (name.includes('creative') || name.includes('art')) {
      return [
        { icon: Lightbulb, text: t('welcome.starter.brainstorm') },
        { icon: FileText, text: t('welcome.starter.storyIdea') },
        { icon: ClipboardList, text: t('welcome.starter.namingIdeas') },
        { icon: Mail, text: t('welcome.starter.creativeAngle') },
      ]
    }
    if (name.includes('tutor') || name.includes('study') || name.includes('teach')) {
      return [
        { icon: Lightbulb, text: t('welcome.starter.explainSimply') },
        { icon: FileText, text: t('welcome.starter.quizMe') },
        { icon: ClipboardList, text: t('welcome.starter.studyPlan') },
        { icon: Mail, text: t('welcome.starter.practiceProblems') },
      ]
    }
    if (name.includes('productiv') || name.includes('coach') || name.includes('plan')) {
      return [
        { icon: ClipboardList, text: t('welcome.starter.planMyDay') },
        { icon: FileText, text: t('welcome.starter.breakdownGoal') },
        { icon: Lightbulb, text: t('welcome.starter.prioritizeTasks') },
        { icon: Mail, text: t('welcome.starter.weeklyReview') },
      ]
    }
    return null
  }, [activePersona, t])

  const suggestions = personaStarters || [
    { icon: Mail, text: t('welcome.suggestion.draftEmail'), templateId: 'writing-assistant' },
    { icon: FileText, text: t('welcome.suggestion.summarizeDoc'), templateId: 'research-analyst' },
    { icon: ClipboardList, text: t('welcome.suggestion.weeklyReport'), templateId: 'writing-assistant' },
    { icon: Lightbulb, text: t('welcome.suggestion.explainConcept'), templateId: 'language-tutor' },
  ]

  const shortcuts = [
    { keys: 'Ctrl+Shift+Space', desc: t('welcome.shortcut.toggleWindow') },
    { keys: 'Ctrl+Shift+G', desc: t('welcome.shortcut.clipboardAction') },
    { keys: 'Ctrl+Shift+P', desc: t('welcome.shortcut.commandPalette') },
    { keys: 'Ctrl+B', desc: t('welcome.shortcut.toggleSidebar') },
    { keys: 'Ctrl+L', desc: t('welcome.shortcut.focusInput') },
    { keys: '@file', desc: t('welcome.shortcut.referenceFiles') },
  ]

  const quickActions = [
    { label: t('welcome.openSettings'), icon: Settings, shortcut: 'Ctrl+,', action: () => { useUiStore.getState().setSidebarOpen(true); useUiStore.getState().setSidebarTab('settings') } },
    { label: t('welcome.openTerminal'), icon: Terminal, shortcut: 'Ctrl+`', action: () => useUiStore.getState().toggleTerminal() },
    { label: t('welcome.openFiles'), icon: FolderOpen, shortcut: 'Ctrl+B', action: () => { useUiStore.getState().setSidebarOpen(true); useUiStore.getState().setSidebarTab('files') } },
    { label: t('welcome.showShortcuts'), icon: Keyboard, shortcut: 'Ctrl+/', action: () => window.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, key: '/' })) },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: 24, padding: '0 20px' }}>
      {/* Hero icon */}
      <div className="onboard-icon" style={{
        width: 80,
        height: 80,
        borderRadius: '50%',
        background: activePersona ? `${activePersona.color}20` : 'rgba(0,122,204,0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {activePersona
          ? <span style={{ fontSize: 44, lineHeight: 1 }}>{activePersona.emoji}</span>
          : <Bot size={48} color="var(--accent)" strokeWidth={1.5} />
        }
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 28, color: 'var(--text-bright)', fontWeight: 700, letterSpacing: '-0.02em' }}>{t(greeting)}</div>
        {activePersona && (
          <div style={{ fontSize: 13, color: activePersona.color, marginTop: 4, fontWeight: 500 }}>
            {t('persona.personaGreeting', { name: activePersona.name })}
          </div>
        )}
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, opacity: 0.7 }}>
          {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8, maxWidth: 360, lineHeight: 1.7 }}>
          {t('welcome.subtitle')}
        </div>
      </div>

      {/* Usage stats bar */}
      {usageStats.totalSessions > 0 && (
        <div style={{
          display: 'flex',
          gap: 20,
          justifyContent: 'center',
          alignItems: 'center',
          padding: '8px 16px',
          background: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          borderRadius: 20,
          fontSize: 11,
          color: 'var(--text-muted)',
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
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 20px',
            background: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
            borderRadius: 12,
            color: 'var(--text-primary)',
            cursor: 'pointer',
            fontSize: 13,
            width: '100%',
            maxWidth: 420,
            transition: 'background 0.15s, border-color 0.15s',
            textAlign: 'left',
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
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'rgba(0,122,204,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
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
                    usePrefsStore.getState().setPrefs({
                      activePersonaId: p.id,
                      model: p.model,
                      systemPrompt: p.systemPrompt,
                    })
                    window.electronAPI.prefsSet('activePersonaId', p.id)
                    window.electronAPI.prefsSet('model', p.model)
                    window.electronAPI.prefsSet('systemPrompt', p.systemPrompt)
                    useUiStore.getState().addToast('success', t('persona.switchedTo', { name: p.name }))
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 14px',
                    background: isActive ? `${p.color}18` : 'var(--card-bg)',
                    border: `1px solid ${isActive ? p.color : 'var(--card-border)'}`,
                    borderRadius: 10,
                    color: isActive ? p.color : 'var(--text-primary)',
                    cursor: isActive ? 'default' : 'pointer',
                    fontSize: 12,
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
                      fontSize: 8,
                      background: p.color,
                      color: '#fff',
                      padding: '1px 5px',
                      borderRadius: 6,
                      fontWeight: 600,
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
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
              padding: '20px 16px',
              background: 'var(--card-bg)',
              border: '1px solid var(--card-border)',
              borderRadius: 12,
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: 13,
              minWidth: 130,
              maxWidth: 150,
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
            <div style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: activePersona ? `${activePersona.color}14` : 'rgba(0,122,204,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Icon size={24} color={activePersona ? activePersona.color : 'var(--accent)'} />
            </div>
            <span style={{ textAlign: 'center', lineHeight: 1.4 }}>{text}</span>
          </button>
        ))}
      </div>

      {/* Keyboard shortcuts */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, auto)',
        gap: '8px 20px',
        padding: '14px 20px',
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        borderRadius: 10,
      }}>
        {shortcuts.map(({ keys, desc }) => (
          <div key={keys} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <kbd style={{
              background: 'var(--popup-bg)',
              border: '1px solid var(--popup-border)',
              borderRadius: 4,
              padding: '2px 8px',
              fontSize: 10,
              fontFamily: 'monospace',
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
            }}>{keys}</kbd>
            <span style={{ color: 'var(--text-muted)' }}>{desc}</span>
          </div>
        ))}
      </div>

      {/* Recent prompts */}
      {recentPrompts.length > 0 && (
        <div style={{ width: '100%', maxWidth: 420 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <History size={11} />
            <span style={{ flex: 1 }}>{t('welcome.recentPrompts')}</span>
            <button
              onClick={clearRecentPrompts}
              title={t('welcome.clearHistory')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '1px 3px',
                borderRadius: 3,
                fontSize: 10,
                gap: 2,
                opacity: 0.7,
                transition: 'color 150ms, opacity 150ms',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--error)'; (e.currentTarget as HTMLElement).style.opacity = '1' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.opacity = '0.7' }}
            >
              <X size={10} />
              {t('welcome.clearHistory')}
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {recentPrompts.map((prompt, i) => (
              <button
                key={i}
                onClick={() => onSuggestion(prompt)}
                style={{
                  background: 'var(--card-bg)',
                  border: '1px solid var(--card-border)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: 12,
                  textAlign: 'left',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  transition: 'background 0.15s, border-color 0.15s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--action-btn-hover)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--card-bg)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--card-border)'
                }}
                title={prompt}
              >
                {prompt.length > 80 ? prompt.slice(0, 80) + '...' : prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quick action buttons */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {quickActions.map(({ label, icon: QIcon, shortcut, action }) => (
          <button
            key={label}
            onClick={action}
            title={`${label} (${shortcut})`}
            style={{
              background: 'none',
              border: '1px solid var(--card-border)',
              borderRadius: 6,
              padding: '5px 14px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 12,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)'
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--card-border)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'
            }}
          >
            <QIcon size={12} />
            {label}
            <kbd style={{
              fontSize: 9,
              opacity: 0.5,
              fontFamily: 'monospace',
              background: 'rgba(255,255,255,0.06)',
              padding: '1px 4px',
              borderRadius: 3,
              border: '1px solid rgba(255,255,255,0.1)',
            }}>{shortcut}</kbd>
          </button>
        ))}
      </div>
    </div>
  )
}
