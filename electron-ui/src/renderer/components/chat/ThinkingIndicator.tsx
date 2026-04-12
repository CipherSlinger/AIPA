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

  // Persona awareness (per-session, Iteration 407)
  const sessionPersonaId = useChatStore(s => s.sessionPersonaId)
  const defaultPersonaId = usePrefsStore(s => s.prefs.activePersonaId)
  const effectivePersonaId = sessionPersonaId || defaultPersonaId
  const personas = usePrefsStore(s => s.prefs.personas)
  const activePersona = effectivePersonaId ? personas?.find(p => p.id === effectivePersonaId) : null

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
        gap: 6,
        padding: '6px 12px',
        alignItems: 'center',
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
            : 'rgba(25,25,35,0.95)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          border: activePersona?.color
            ? `1.5px solid ${activePersona.color}44`
            : '1.5px solid rgba(99,102,241,0.25)',
        }}
      >
        {activePersona?.emoji ? (
          <span style={{ fontSize: 15, lineHeight: 1 }}>{activePersona.emoji}</span>
        ) : (
          <Bot size={16} color="rgba(255,255,255,0.82)" />
        )}
      </div>

      {/* Mini bubble — indigo-tinted glass */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 14px',
          background: 'rgba(99,102,241,0.06)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: '1px solid rgba(99,102,241,0.15)',
          borderRadius: 20,
          minWidth: 80,
          maxWidth: 240,
          boxShadow: '0 2px 12px rgba(99,102,241,0.08)',
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
                background: 'rgba(165,180,252,0.75)',
                animation: `pulse 1.2s ease-in-out ${i * 150}ms infinite`,
                flexShrink: 0,
              }}
            />
          ))}
          <span
            style={{
              fontSize: 12,
              fontStyle: 'italic',
              marginLeft: 2,
              whiteSpace: 'nowrap',
              color: 'rgba(255,255,255,0.60)',
            }}
          >
            {activityLabel}...
          </span>
        </div>

        {/* Elapsed timer */}
        <div style={{
          fontSize: 10,
          color: 'rgba(255,255,255,0.38)',
          flexShrink: 0,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {elapsed}s
        </div>
      </div>
    </div>
  )
}
