// ContextUsageMeter — shows context window usage bar in ChatInput (extracted Iteration 455)
import React from 'react'
import { Archive } from 'lucide-react'
import { useT } from '../../i18n'

interface ContextUsageMeterProps {
  used: number
  total: number
  isStreaming: boolean
  onCompact: () => void
}

export default function ContextUsageMeter({ used, total, isStreaming, onCompact }: ContextUsageMeterProps) {
  const t = useT()
  const pct = Math.round((used / total) * 100)
  if (pct < 40) return null
  const barColor = pct >= 85 ? 'var(--error)' : pct >= 70 ? '#f97316' : pct >= 55 ? 'var(--warning)' : 'var(--accent)'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '2px 4px', marginBottom: 4,
    }}>
      <div style={{
        flex: 1, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden',
      }}>
        <div style={{
          width: `${Math.min(pct, 100)}%`, height: '100%', background: barColor,
          borderRadius: 2, transition: 'width 300ms ease, background 300ms ease',
        }} />
      </div>
      <span style={{ fontSize: 9, color: barColor, fontWeight: 500, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
        {pct}%
      </span>
      {pct >= 60 && !isStreaming && (
        <button
          onClick={onCompact}
          title={t('chat.compactHint')}
          style={{
            display: 'flex', alignItems: 'center', gap: 3,
            padding: '1px 6px', fontSize: 9, fontWeight: 500,
            background: 'rgba(0, 122, 204, 0.08)', border: '1px solid rgba(0, 122, 204, 0.2)',
            borderRadius: 8, color: 'var(--accent)', cursor: 'pointer',
            transition: 'background 150ms, border-color 150ms', whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0, 122, 204, 0.15)'; e.currentTarget.style.borderColor = 'var(--accent)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0, 122, 204, 0.08)'; e.currentTarget.style.borderColor = 'rgba(0, 122, 204, 0.2)' }}
        >
          <Archive size={9} />
          {t('chat.compactBtn')}
        </button>
      )}
    </div>
  )
}
