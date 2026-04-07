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
      display: 'flex', justifyContent: 'flex-end',
      padding: '2px 0 0',
    }}>
      <span style={{
        fontSize: 10,
        fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
        color: input.length >= 50000
          ? 'var(--error, #d9534f)'
          : input.length >= 10000
          ? 'var(--warning, #f0ad4e)'
          : 'var(--text-muted)',
        opacity: input.length >= 10000 ? 1 : 0.6,
        transition: 'color 200ms ease',
        userSelect: 'none',
      }}>
        {wordCount} {t('chat.words')} | {input.length.toLocaleString()} {t('chat.chars')} | ~{tokenEst.toLocaleString()} {t('chat.tokens')}
      </span>
    </div>
  )
}

