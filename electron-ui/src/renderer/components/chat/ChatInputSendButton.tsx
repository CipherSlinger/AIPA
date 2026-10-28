// ChatInputSendButton — extracted from ChatInput.tsx (Iteration 432 decomposition)
// Renders the send/stop button with progress ring indicator.
//
// While a Codex turn is streaming, sending does not start a new turn: it steers
// the running one. The stop affordance must survive that change, so the turn is
// still stopped by the red button and the guidance send appears beside it —
// same gesture, different meaning, stated by the tooltip and the composer hint.

import React from 'react'
import { Send, Square } from 'lucide-react'
import { useT } from '../../i18n'

interface Props {
  isStreaming: boolean
  inputLength: number
  hasContent: boolean  // input.trim() || attachments.length > 0 || fileAttachments.length > 0
  /** The running turn is a Codex turn, so a send can steer it. */
  canSteer?: boolean
  /** The engine has announced the live turn id; a steer can address it. */
  steerReady?: boolean
  onSend: () => void
  onAbort: () => void
}

export default function ChatInputSendButton({
  isStreaming, inputLength, hasContent, canSteer = false, steerReady = false, onSend, onAbort,
}: Props) {
  const t = useT()
  const showSteer = isStreaming && canSteer

  return (
    <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignSelf: 'flex-end' }}>
      {showSteer && (
        <button
          onClick={onSend}
          disabled={!hasContent || !steerReady}
          title={steerReady ? t('chat.steer.sendTooltip') : t('chat.steer.waitingTurn')}
          aria-label={t('chat.steer.sendTooltip')}
          style={{
            background: hasContent && steerReady
              ? 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))'
              : 'var(--bg-hover)',
            border: 'none',
            borderRadius: 8, width: 36, height: 36,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: hasContent && steerReady ? 'rgba(255,255,255,0.95)' : 'var(--text-muted)',
            fontWeight: 700,
            cursor: hasContent && steerReady ? 'pointer' : 'not-allowed',
            boxShadow: hasContent && steerReady ? '0 2px 12px rgba(99,102,241,0.4)' : 'none',
            flexShrink: 0,
            opacity: hasContent && steerReady ? 1 : 0.4,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            if (hasContent && steerReady) {
              e.currentTarget.style.boxShadow = '0 4px 20px rgba(99,102,241,0.55)'
              e.currentTarget.style.transform = 'translateY(-1px)'
            }
          }}
          onMouseLeave={(e) => {
            if (hasContent && steerReady) {
              e.currentTarget.style.boxShadow = '0 2px 12px rgba(99,102,241,0.4)'
              e.currentTarget.style.transform = 'translateY(0)'
            }
          }}
        >
          <Send size={14} />
        </button>
      )}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {/* Progress ring (only when input has content and not streaming) */}
        {!isStreaming && inputLength > 0 && (
          <svg
            width={44}
            height={44}
            style={{
              position: 'absolute', top: -4, left: -4,
              transform: 'rotate(-90deg)', pointerEvents: 'none',
            }}
          >
            <circle
              cx={22}
              cy={22}
              r={20}
              fill="none"
              stroke={
                inputLength > 10000 ? '#f87171'
                  : inputLength > 8000 ? '#f97316'
                  : inputLength > 5000 ? '#fbbf24'
                  : '#818cf8'
              }
              strokeWidth={2}
              strokeDasharray={2 * Math.PI * 20}
              strokeDashoffset={2 * Math.PI * 20 * (1 - Math.min(inputLength / 12000, 1))}
              strokeLinecap="round"
              opacity={0.6}
              style={{ transition: 'all 0.15s ease' }}
            />
          </svg>
        )}
        <button
          onClick={isStreaming ? onAbort : onSend}
          disabled={!isStreaming && !hasContent}
          title={isStreaming ? t('chat.stopGenerating') : t('chat.sendEnter')}
          style={{
            background: isStreaming
              ? 'rgba(239,68,68,0.15)'
              : !hasContent
                ? 'var(--bg-hover)'
                : 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
            border: isStreaming ? '1px solid rgba(239,68,68,0.40)' : 'none',
            borderRadius: 8, width: 36, height: 36,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: isStreaming ? '#f87171' : !hasContent ? 'var(--text-muted)' : 'rgba(255,255,255,0.95)',
            fontWeight: 700,
            cursor: isStreaming || hasContent ? 'pointer' : 'not-allowed',
            boxShadow: isStreaming || !hasContent ? 'none' : '0 2px 12px rgba(99,102,241,0.4)',
            flexShrink: 0,
            transition: 'all 0.15s ease',
            position: 'relative',
            opacity: !isStreaming && !hasContent ? 0.4 : 1,
          }}
          onMouseEnter={(e) => {
            if (isStreaming) {
              e.currentTarget.style.background = 'rgba(239,68,68,0.25)'
              e.currentTarget.style.borderColor = 'rgba(239,68,68,0.55)'
            } else if (hasContent) {
              e.currentTarget.style.boxShadow = '0 4px 20px rgba(99,102,241,0.55)'
              e.currentTarget.style.transform = 'translateY(-1px)'
            }
          }}
          onMouseLeave={(e) => {
            if (isStreaming) {
              e.currentTarget.style.background = 'rgba(239,68,68,0.15)'
              e.currentTarget.style.borderColor = 'rgba(239,68,68,0.40)'
            } else if (hasContent) {
              e.currentTarget.style.boxShadow = '0 2px 12px rgba(99,102,241,0.4)'
              e.currentTarget.style.transform = 'translateY(0)'
            }
          }}
        >
          {isStreaming ? <Square size={14} /> : <Send size={14} />}
        </button>
      </div>
    </div>
  )
}
