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

const SEP = (
  <span style={{
    display: 'inline-block',
    width: 3, height: 3, borderRadius: '50%',
    background: 'rgba(255,255,255,0.15)',
    flexShrink: 0,
  }} />
)

export default function ChatInputComposeStatus({ input, typingWpm, calcResult, hasInputHistory }: ChatInputComposeStatusProps) {
  const t = useT()
  const trimmed = input.trim()

  const isOverLimit = input.length > 10000
  const isNearLimit = input.length > 5000

  const charColor = isOverLimit ? '#fca5a5' : isNearLimit ? '#fbbf24' : 'var(--text-faint)'

  return (
    <>
      {/* Compose status */}
      {trimmed.length > 0 && (
        <div style={{
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6,
          padding: '3px 12px',
          background: 'var(--glass-bg-low)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderTop: '1px solid var(--glass-border)',
          transition: 'all 0.15s ease',
          lineHeight: 1.5,
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>
            {trimmed.split(/\s+/).filter(w => w.length > 0).length} {t('chat.words')}
          </span>
          {SEP}
          <span style={{ fontSize: 10, color: charColor, fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"', fontWeight: isOverLimit ? 600 : 400 }}>
            {input.length.toLocaleString()} {t('chat.chars')}{isOverLimit ? ` (${t('chat.veryLong')})` : isNearLimit ? ` (${t('chat.long')})` : ''}
          </span>
          {SEP}
          <span style={{ fontSize: 10, color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>
            {t('message.approxTokens', { count: String(Math.ceil(input.length / 4)) })}
          </span>
          {typingWpm > 0 && (
            <>
              {SEP}
              <span style={{ fontSize: 10, color: typingWpm > 60 ? 'rgba(165,180,252,0.60)' : 'var(--text-faint)', fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>
                {typingWpm} {t('chat.wpm')}
              </span>
            </>
          )}
        </div>
      )}
      {/* Inline calculator result */}
      {calcResult && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '3px 12px',
          background: 'var(--glass-bg-low)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderTop: '1px solid var(--glass-border)',
        }}>
          <Calculator size={13} style={{ color: '#a5b4fc', opacity: 0.8 }} />
          <span style={{ fontSize: 11, color: '#a5b4fc', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>= {calcResult}</span>
          <span style={{ fontSize: 9, color: 'var(--text-faint)', marginLeft: 4 }}>{t('chat.calcTabHint')}</span>
        </div>
      )}
      {/* Input history hint */}
      {input.length === 0 && hasInputHistory && (
        <div style={{
          display: 'flex', justifyContent: 'center', padding: '3px 12px',
          background: 'var(--glass-bg-low)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderTop: '1px solid var(--glass-border)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('chat.inputHistoryHint')}</span>
        </div>
      )}
    </>
  )
}
