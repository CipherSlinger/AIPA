/**
 * AskUserQuestionCard.tsx
 * Extracted from ToolUseBlock.tsx (Iteration 585)
 *
 * Interactive card rendered when the agent invokes AskUserQuestion.
 * Shows the question, optional option buttons, and a free-text reply input.
 * Dispatches 'aipa:sendMessage' to route the reply back through the chat stream.
 */

import React, { useState } from 'react'
import { HelpCircle, Check } from 'lucide-react'
import { useT } from '../../../i18n'

export interface AskUserQuestionCardProps {
  question: string
  options?: string[]
  isAnswered: boolean
  answer?: string
}

export function AskUserQuestionCard({ question, options, isAnswered, answer }: AskUserQuestionCardProps) {
  const t = useT()
  const [selected, setSelected] = useState<string | null>(null)
  const [customText, setCustomText] = useState('')
  const [sent, setSent] = useState(false)

  const sendReply = (text: string) => {
    if (!text.trim() || sent) return
    setSent(true)
    window.dispatchEvent(new CustomEvent('aipa:sendMessage', { detail: { text } }))
  }

  // If the tool has already been answered (result exists), show the answered state
  if (isAnswered && answer) {
    return (
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderLeft: '3px solid rgba(99,102,241,0.60)',
        borderRadius: 10,
        marginBottom: 6,
        overflow: 'hidden',
      }}>
        <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <HelpCircle size={14} style={{ color: '#818cf8', flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
              {question}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <Check size={11} style={{ color: '#4ade80', flexShrink: 0 }} />
            <span style={{ color: 'var(--text-secondary)' }}>{answer}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--bg-secondary)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid rgba(99,102,241,0.30)',
      borderLeft: '3px solid rgba(99,102,241,0.60)',
      borderRadius: 10,
      marginBottom: 6,
      overflow: 'hidden',
    }}>
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Question label + text */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <HelpCircle size={15} style={{ color: '#818cf8', flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.5 }}>
            {question}
          </span>
        </div>

        {/* Option buttons (if provided) */}
        {options && options.length > 0 && !sent && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 23 }}>
            {options.map((opt, i) => (
              <button
                key={i}
                onClick={() => { setSelected(opt); sendReply(opt) }}
                disabled={sent}
                style={{
                  fontSize: 12,
                  padding: '5px 12px',
                  borderRadius: 8,
                  border: `1px solid ${selected === opt ? 'rgba(99,102,241,0.60)' : 'rgba(99,102,241,0.30)'}`,
                  background: selected === opt ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.10)',
                  color: 'rgba(165,180,252,0.90)',
                  cursor: 'pointer',
                  fontWeight: 500,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.22)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.55)' }}
                onMouseLeave={(e) => {
                  if (selected !== opt) {
                    e.currentTarget.style.background = 'rgba(99,102,241,0.10)'
                    e.currentTarget.style.borderColor = 'rgba(99,102,241,0.30)'
                  }
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        {/* Custom text input (always shown when no options, or as fallback) */}
        {!sent && (
          <div style={{ display: 'flex', gap: 6, paddingLeft: options && options.length > 0 ? 23 : 0, alignItems: 'flex-end' }}>
            <input
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendReply(customText) } }}
              placeholder={options && options.length > 0 ? t('askUser.customReply') : t('askUser.typeReply')}
              style={{
                flex: 1,
                fontSize: 12,
                padding: '6px 10px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text-primary)',
                outline: 'none',
                fontFamily: 'inherit',
                transition: 'border-color 0.15s ease',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
            />
            <button
              onClick={() => sendReply(customText)}
              disabled={!customText.trim()}
              style={{
                fontSize: 12,
                padding: '6px 14px',
                borderRadius: 8,
                border: 'none',
                background: customText.trim() ? 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))' : 'rgba(99,102,241,0.25)',
                color: 'rgba(255,255,255,0.95)',
                cursor: customText.trim() ? 'pointer' : 'not-allowed',
                fontWeight: 600,
                transition: 'all 0.15s ease',
                flexShrink: 0,
              }}
            >
              {t('askUser.send')}
            </button>
          </div>
        )}

        {/* Sent indicator */}
        {sent && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#4ade80', paddingLeft: 23 }}>
            <Check size={11} />
            {t('askUser.sent')}
          </div>
        )}
      </div>
    </div>
  )
}
