import React, { useState, useEffect, useMemo } from 'react'
import { Bot, Mail, FileText, ClipboardList, Lightbulb, Settings, Terminal, FolderOpen, Keyboard, History } from 'lucide-react'
import { useUiStore } from '../../store'
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
}

export default function WelcomeScreen({ onSuggestion }: Props) {
  const t = useT()
  const [greeting, setGreeting] = useState(getGreetingKey())

  // Update greeting every minute in case the user leaves the app open across time boundaries
  useEffect(() => {
    const interval = setInterval(() => {
      setGreeting(getGreetingKey())
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  // Load recent prompts from persistent input history
  const recentPrompts = useMemo<string[]>(() => {
    try {
      const stored = localStorage.getItem('aipa:input-history')
      if (!stored) return []
      const history: string[] = JSON.parse(stored)
      // Show up to 3 recent prompts, each truncated to 60 chars
      return history.slice(0, 3).filter(h => h.length > 0)
    } catch { return [] }
  }, [])

  const suggestions = [
    { icon: Mail, text: t('welcome.suggestion.draftEmail'), templateId: 'writing-assistant' },
    { icon: FileText, text: t('welcome.suggestion.summarizeDoc'), templateId: 'research-analyst' },
    { icon: ClipboardList, text: t('welcome.suggestion.weeklyReport'), templateId: 'writing-assistant' },
    { icon: Lightbulb, text: t('welcome.suggestion.explainConcept'), templateId: 'language-tutor' },
  ]

  const shortcuts = [
    { keys: 'Ctrl+Shift+P', desc: t('welcome.shortcut.commandPalette') },
    { keys: 'Ctrl+B', desc: t('welcome.shortcut.toggleSidebar') },
    { keys: 'Ctrl+`', desc: t('welcome.shortcut.toggleTerminal') },
    { keys: 'Ctrl+L', desc: t('welcome.shortcut.focusInput') },
    { keys: '@file', desc: t('welcome.shortcut.referenceFiles') },
    { keys: '/cmd', desc: t('welcome.shortcut.slashCommands') },
  ]

  const quickActions = [
    { label: t('welcome.openSettings'), icon: Settings, action: () => { useUiStore.getState().setSidebarOpen(true); useUiStore.getState().setSidebarTab('settings') } },
    { label: t('welcome.openTerminal'), icon: Terminal, action: () => useUiStore.getState().toggleTerminal() },
    { label: t('welcome.openFiles'), icon: FolderOpen, action: () => { useUiStore.getState().setSidebarOpen(true); useUiStore.getState().setSidebarTab('files') } },
    { label: t('welcome.showShortcuts'), icon: Keyboard, action: () => window.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, key: '/' })) },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: 24, padding: '0 20px' }}>
      {/* Hero icon */}
      <div className="onboard-icon" style={{
        width: 80,
        height: 80,
        borderRadius: '50%',
        background: 'rgba(0,122,204,0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Bot size={48} color="var(--accent)" strokeWidth={1.5} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 28, color: 'var(--text-bright)', fontWeight: 700, letterSpacing: '-0.02em' }}>{t(greeting)}</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, opacity: 0.7 }}>
          {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8, maxWidth: 360, lineHeight: 1.7 }}>
          {t('welcome.subtitle')}
        </div>
      </div>

      {/* Suggestion cards */}
      <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
        {suggestions.map(({ icon: Icon, text, templateId }) => (
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
              background: 'rgba(0,122,204,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Icon size={24} color="var(--accent)" />
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
            {t('welcome.recentPrompts')}
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
        {quickActions.map(({ label, icon: QIcon, action }) => (
          <button
            key={label}
            onClick={action}
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
          </button>
        ))}
      </div>
    </div>
  )
}
