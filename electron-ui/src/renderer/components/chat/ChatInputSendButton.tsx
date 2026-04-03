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
              inputLength > 10000 ? 'var(--error)'
                : inputLength > 8000 ? '#f97316'
                : inputLength > 5000 ? 'var(--warning)'
                : 'var(--accent)'
            }
            strokeWidth={2}
            strokeDasharray={2 * Math.PI * 20}
            strokeDashoffset={2 * Math.PI * 20 * (1 - Math.min(inputLength / 12000, 1))}
            strokeLinecap="round"
            opacity={0.6}
            style={{ transition: 'stroke-dashoffset 300ms ease, stroke 300ms ease' }}
          />
        </svg>
      )}
      <button
        onClick={isStreaming ? onAbort : onSend}
        disabled={!isStreaming && !hasContent}
        title={isStreaming ? t('chat.stopGenerating') : t('chat.sendEnter')}
        style={{
          background: isStreaming ? 'var(--error)' : 'var(--accent)', border: 'none', borderRadius: 10, width: 36, height: 36,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
          cursor: isStreaming || hasContent ? 'pointer' : 'not-allowed',
          opacity: !isStreaming && !hasContent ? 0.4 : 1,
          flexShrink: 0, transition: 'background 150ms, opacity 150ms', position: 'relative',
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
