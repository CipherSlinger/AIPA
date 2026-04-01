import React, { useState, useMemo } from 'react'
import { useChatStore } from '../../store'
import { useT } from '../../i18n'

/** Format a number with thousands separators */
function fmtNum(n: number): string {
  return n.toLocaleString()
}

export default function TokenUsageBar() {
  const t = useT()
  const lastContextUsage = useChatStore(s => s.lastContextUsage)
  const lastUsage = useChatStore(s => s.lastUsage)
  const [hovered, setHovered] = useState(false)

  const { pct, fillColor } = useMemo(() => {
    if (!lastContextUsage || lastContextUsage.total <= 0) {
      return { pct: 0, fillColor: 'var(--success)' }
    }
    const p = Math.min(100, (lastContextUsage.used / lastContextUsage.total) * 100)
    let color = 'var(--success)'
    if (p >= 80) color = 'var(--error)'
    else if (p >= 60) color = 'var(--warning)'
    return { pct: p, fillColor: color }
  }, [lastContextUsage])

  // Don't render when no usage data
  if (!lastContextUsage || lastContextUsage.total <= 0) return null

  const pctStr = pct.toFixed(1)
  const usedStr = fmtNum(lastContextUsage.used)
  const totalStr = fmtNum(lastContextUsage.total)

  return (
    <div
      style={{
        position: 'relative',
        height: 11,
        display: 'flex',
        alignItems: 'center',
        cursor: 'default',
        flexShrink: 0,
        paddingTop: 4,
        paddingBottom: 4,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Track */}
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Context usage: ${pctStr}%`}
        style={{
          width: '100%',
          height: 3,
          borderRadius: 1.5,
          background: 'color-mix(in srgb, var(--border) 40%, transparent)',
          overflow: 'hidden',
        }}
      >
        {/* Fill */}
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            borderRadius: 1.5,
            background: fillColor,
            transition: 'width 0.5s ease, background-color 0.3s ease',
          }}
        />
      </div>

      {/* Tooltip */}
      {hovered && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginTop: 4,
            background: 'var(--popup-bg)',
            border: '1px solid var(--popup-border)',
            borderRadius: 8,
            padding: '8px 12px',
            boxShadow: 'var(--popup-shadow)',
            zIndex: 100,
            whiteSpace: 'nowrap',
            fontSize: 11,
            color: 'var(--text-primary)',
            lineHeight: 1.6,
          }}
        >
          <div>{t('context.usage', { used: usedStr, total: totalStr, percent: pctStr })}</div>
          {lastUsage && (
            <div style={{ color: 'var(--text-muted)' }}>
              {t('context.breakdown', {
                input: fmtNum(lastUsage.inputTokens),
                output: fmtNum(lastUsage.outputTokens),
                cache: fmtNum(lastUsage.cacheTokens),
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
