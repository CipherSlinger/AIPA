// ChatInput compose status bar — extracted from ChatInput.tsx (Iteration 314)
// Displays word/char/token counts, WPM, calculator result, and input history hint.

import React from 'react'
import { Calculator } from 'lucide-react'
import { useT } from '../../i18n'

interface ChatInputComposeStatusProps {
  input: string
  typingWpm: number
  calcResult: string | null
  hasInputHistory: boolean
}

export default function ChatInputComposeStatus({ input, typingWpm, calcResult, hasInputHistory }: ChatInputComposeStatusProps) {
  const t = useT()
  const trimmed = input.trim()

  return (
    <>
      {/* Compose status */}
      {trimmed.length > 0 && (
        <div style={{
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, padding: '3px 4px 0', fontSize: 10,
          color: input.length > 10000 ? 'var(--error)' : input.length > 5000 ? 'var(--warning)' : 'var(--text-muted)',
          fontWeight: input.length > 10000 ? 600 : 400, opacity: 0.7, transition: 'color 200ms, opacity 200ms',
        }}>
          <span>{trimmed.split(/\s+/).filter(w => w.length > 0).length} {t('chat.words')}</span>
          <span style={{ opacity: 0.4 }}>|</span>
          <span>{input.length.toLocaleString()} {t('chat.chars')}{input.length > 10000 ? ` (${t('chat.veryLong')})` : input.length > 5000 ? ` (${t('chat.long')})` : ''}</span>
          <span style={{ opacity: 0.4 }}>|</span>
          <span>{t('message.approxTokens', { count: String(Math.ceil(input.length / 4)) })}</span>
          {typingWpm > 0 && (
            <>
              <span style={{ opacity: 0.4 }}>|</span>
              <span style={{ color: typingWpm > 60 ? 'var(--accent)' : 'var(--text-muted)' }}>{typingWpm} {t('chat.wpm')}</span>
            </>
          )}
        </div>
      )}
      {/* Inline calculator result */}
      {calcResult && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px 0', fontSize: 12,
          color: 'var(--accent)', fontWeight: 500, opacity: 0.9,
        }}>
          <Calculator size={13} style={{ opacity: 0.7 }} />
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>= {calcResult}</span>
          <span style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.5, marginLeft: 4 }}>{t('chat.calcTabHint')}</span>
        </div>
      )}
      {/* Input history hint */}
      {input.length === 0 && hasInputHistory && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 0 0', fontSize: 10, color: 'var(--text-muted)', opacity: 0.4 }}>
          <span>{t('chat.inputHistoryHint')}</span>
        </div>
      )}
    </>
  )
}
