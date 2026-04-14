// CharWordCounter — input character/word counter display (extracted Iteration 455)
// Iteration 496: added ~token estimate (content.length / 4, from sourcemap roughTokenCountEstimation)
import React from 'react'
import { useT } from '../../i18n'

interface CharWordCounterProps {
  input: string
}

export default function CharWordCounter({ input }: CharWordCounterProps) {
  const t = useT()

  if (input.length <= 50) return null

  const wordCount = input.trim().split(/\s+/).filter(Boolean).length
  // Rough token estimate: ~4 chars per token (sourcemap roughTokenCountEstimation)
  const tokenEst = Math.round(input.length / 4)

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      justifyContent: 'flex-end',
      padding: '2px 0 0',
    }}>
      <span style={{
        fontSize: 11,
        fontVariantNumeric: 'tabular-nums',
        fontFeatureSettings: '"tnum"',
        color: input.length >= 50000
          ? '#f87171'
          : input.length >= 10000
          ? '#fbbf24'
          : 'var(--text-faint)',
        transition: 'color 0.15s ease',
        userSelect: 'none',
      }}>
        {wordCount} {t('chat.words')}
        <span style={{ color: 'rgba(255,255,255,0.18)', margin: '0 4px' }}>|</span>
        {input.length.toLocaleString()} {t('chat.chars')}
        <span style={{ color: 'rgba(255,255,255,0.18)', margin: '0 4px' }}>|</span>
        ~{tokenEst.toLocaleString()} {t('chat.tokens')}
      </span>
    </div>
  )
}

