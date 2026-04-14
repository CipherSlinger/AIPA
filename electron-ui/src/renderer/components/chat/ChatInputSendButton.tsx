// ChatInputSendButton — extracted from ChatInput.tsx (Iteration 432 decomposition)
// Renders the send/stop button with progress ring indicator.

import React from 'react'
import { Send, Square } from 'lucide-react'
import { useT } from '../../i18n'

interface Props {
  isStreaming: boolean
  inputLength: number
  hasContent: boolean  // input.trim() || attachments.length > 0 || fileAttachments.length > 0
  onSend: () => void
  onAbort: () => void
}

export default function ChatInputSendButton({ isStreaming, inputLength, hasContent, onSend, onAbort }: Props) {
  const t = useT()

  return (
    <div style={{ position: 'relative', flexShrink: 0, alignSelf: 'flex-end' }}>
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
              ? 'rgba(255,255,255,0.08)'
              : 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
          border: isStreaming ? '1px solid rgba(239,68,68,0.40)' : 'none',
          borderRadius: 8, width: 36, height: 36,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: isStreaming ? '#f87171' : !hasContent ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.95)',
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
        {!isStreaming && (
          <span style={{ position: 'absolute', bottom: -14, fontSize: 9, color: 'var(--text-muted)', opacity: 0.5, whiteSpace: 'nowrap', fontFamily: 'inherit' }}>Enter</span>
        )}
      </button>
    </div>
  )
}
