// TypingStatus — Compact AI activity indicator shown between MessageList and ChatInput (Iteration 461)
// Shows contextual status: tool name when using tools, "Writing..." during textDelta, "Thinking..." by default.
// Replaces ThinkingIndicator in the ChatPanel footer area (ThinkingIndicator stays for the avatar-style bubble).
// Iteration 491: useMinDisplayTime prevents label from flickering during rapid tool cycling.
import React from 'react'
import { useChatStore, usePrefsStore } from '../../store'
import { StandardChatMessage } from '../../types/app.types'
import { useT } from '../../i18n'
import { useMinDisplayTime } from '../../hooks/useMinDisplayTime'

export default function TypingStatus() {
  const t = useT()
  const messages = useChatStore(s => s.messages)
  const pendingToolUses = useChatStore(s => s.pendingToolUses)

  // Persona color for accent
  const sessionPersonaId = useChatStore(s => s.sessionPersonaId)
  const defaultPersonaId = usePrefsStore(s => s.prefs.activePersonaId)
  const effectivePersonaId = sessionPersonaId || defaultPersonaId
  const personas = usePrefsStore(s => s.prefs.personas)
  const activePersona = effectivePersonaId ? personas?.find(p => p.id === effectivePersonaId) : null
  const dotColor = activePersona?.color || 'var(--accent)'

  // Determine contextual label
  let rawLabel = t('chat.typingStatus.thinking')
  if (pendingToolUses.size > 0) {
    const [, firstTool] = Array.from(pendingToolUses.entries())[0]
    rawLabel = t('chat.typingStatus.usingTool', { tool: firstTool.name })
  } else {
    const last = messages[messages.length - 1]
    if (last && last.role === 'assistant' && (last as StandardChatMessage).isStreaming) {
      rawLabel = t('chat.typingStatus.writing')
    }
  }

  // Throttle label changes: each label stays visible at least 400ms to prevent flicker
  const label = useMinDisplayTime(rawLabel, 400)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 16px',
        borderTop: '1px solid var(--border)',
        flexShrink: 0,
        minHeight: 28,
        background: 'var(--bg-chat)',
      }}
      aria-live="polite"
      aria-label={`${label}...`}
    >
      {/* Animated dots */}
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            display: 'inline-block',
            width: 4,
            height: 4,
            borderRadius: '50%',
            background: dotColor,
            animation: `dot-wave 1.2s ease-in-out ${i * 0.15}s infinite`,
            flexShrink: 0,
          }}
        />
      ))}
      <span
        style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: 260,
        }}
      >
        {label}…
      </span>
    </div>
  )
}
