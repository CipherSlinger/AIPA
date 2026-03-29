import React, { useState, useEffect } from 'react'
import { Bot } from 'lucide-react'
import { useChatStore, usePrefsStore } from '../../store'
import { StandardChatMessage } from '../../types/app.types'
import { useT } from '../../i18n'

export default function ThinkingIndicator() {
  const messages = useChatStore(s => s.messages)
  const pendingToolUses = useChatStore(s => s.pendingToolUses)
  const t = useT()
  const [elapsed, setElapsed] = useState(0)

  // Persona awareness
  const activePersonaId = usePrefsStore(s => s.prefs.activePersonaId)
  const personas = usePrefsStore(s => s.prefs.personas)
  const activePersona = activePersonaId ? personas?.find(p => p.id === activePersonaId) : null

  // Elapsed timer
  useEffect(() => {
    setElapsed(0)
    const id = setInterval(() => setElapsed(prev => prev + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // Determine what Claude is currently doing
  let activityLabel = t('message.thinking')
  if (pendingToolUses.size > 0) {
    const [, firstTool] = Array.from(pendingToolUses.entries())[0]
    const toolLabels: Record<string, string> = {
      Bash: t('message.runningCommand'),
      Read: t('message.readingFile'),
      Write: t('message.writingFile'),
      Edit: t('message.editingFile'),
      MultiEdit: t('message.editingFiles'),
      Glob: t('message.searchingFiles'),
      Grep: t('message.searchingContent'),
      WebFetch: t('message.fetchingWebPage'),
      WebSearch: t('message.searchingWeb'),
      LS: t('message.listingDirectory'),
    }
    activityLabel = toolLabels[firstTool.name] || t('message.usingTool', { tool: firstTool.name })
  } else {
    // Check if last message has streaming content
    const last = messages[messages.length - 1]
    if (last && last.role === 'assistant' && (last as StandardChatMessage).isStreaming) {
      activityLabel = t('message.writing')
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        padding: '8px 16px',
        alignItems: 'flex-start',
      }}
      aria-live="polite"
      aria-label={`${activityLabel}...`}
      className="message-enter-left"
    >
      {/* Mini AI avatar — persona-aware */}
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: activePersona?.color
            ? `${activePersona.color}22`
            : 'var(--bubble-ai)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          border: activePersona?.color
            ? `1.5px solid ${activePersona.color}44`
            : 'none',
        }}
      >
        {activePersona?.emoji ? (
          <span style={{ fontSize: 15, lineHeight: 1 }}>{activePersona.emoji}</span>
        ) : (
          <Bot size={16} color="var(--bubble-ai-text)" />
        )}
      </div>

      {/* Mini bubble */}
      <div
        style={{
          background: 'var(--bubble-ai)',
          borderRadius: '2px 12px 12px 12px',
          padding: '8px 14px',
          minWidth: 80,
          maxWidth: 200,
        }}
      >
        {/* Dots + activity label row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: activePersona?.color || 'var(--accent)',
                animation: `dot-wave 1.2s ease-in-out ${i * 0.15}s infinite`,
              }}
            />
          ))}
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 2, whiteSpace: 'nowrap' }}>
            {activityLabel}...
          </span>
        </div>

        {/* Elapsed timer */}
        <div style={{
          fontSize: 10,
          color: 'var(--text-muted)',
          opacity: 0.7,
          marginTop: 3,
        }}>
          {elapsed}s
        </div>
      </div>
    </div>
  )
}
