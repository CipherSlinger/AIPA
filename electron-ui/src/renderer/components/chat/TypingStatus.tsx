// TypingStatus — Compact AI activity indicator shown between MessageList and ChatInput (Iteration 461)
// Shows contextual status: tool name when using tools, "Writing..." during textDelta, "Thinking..." by default.
// Replaces ThinkingIndicator in the ChatPanel footer area (ThinkingIndicator stays for the avatar-style bubble).
// Iteration 491: useMinDisplayTime prevents label from flickering during rapid tool cycling.
// Iteration 494: useElapsedTime shows live elapsed time since streaming began.
import React from 'react'
import { useChatStore, usePrefsStore } from '../../store'
import { StandardChatMessage } from '../../types/app.types'
import { useT } from '../../i18n'
import { useMinDisplayTime } from '../../hooks/useMinDisplayTime'
import { useElapsedTime } from '../../hooks/useElapsedTime'

export default function TypingStatus() {
  const t = useT()
  const messages = useChatStore(s => s.messages)
  const pendingToolUses = useChatStore(s => s.pendingToolUses)
  const isStreaming = useChatStore(s => s.isStreaming)

  // Track stream start time
  const streamStartRef = React.useRef<number>(0)
  React.useEffect(() => {
    if (isStreaming) streamStartRef.current = Date.now()
  }, [isStreaming])

  // Live elapsed time since streaming began
  const elapsed = useElapsedTime(streamStartRef.current, isStreaming)

  // Persona color for accent
  const sessionPersonaId = useChatStore(s => s.sessionPersonaId)
  const defaultPersonaId = usePrefsStore(s => s.prefs.activePersonaId)
  const effectivePersonaId = sessionPersonaId || defaultPersonaId
  const personas = usePrefsStore(s => s.prefs.personas)
  const activePersona = effectivePersonaId ? personas?.find(p => p.id === effectivePersonaId) : null
  const dotColor = activePersona?.color || '#6366f1'

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
        gap: 8,
        padding: '4px 14px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
        minHeight: 28,
        background: 'rgba(15,15,25,0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
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
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: 'rgba(165,180,252,0.75)',
            animation: `dot-wave 1.2s ease-in-out ${i * 0.15}s infinite`,
            flexShrink: 0,
          }}
        />
      ))}
      <span
        style={{
          fontSize: 12,
          color: 'rgba(255,255,255,0.45)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: 260,
        }}
      >
        {label}…
      </span>
      {/* Elapsed time (shown after 3s to avoid flashing on fast responses) */}
      {streamStartRef.current > 0 && elapsed !== '0s' && elapsed !== '1s' && elapsed !== '2s' && (
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', marginLeft: 2, fontVariantNumeric: 'tabular-nums' }}>
          {elapsed}
        </span>
      )}
    </div>
  )
}

