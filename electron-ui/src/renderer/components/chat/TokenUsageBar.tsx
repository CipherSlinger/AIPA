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
      return { pct: 0, fillColor: 'linear-gradient(90deg, rgba(99,102,241,0.7), rgba(139,92,246,0.6))' }
    }
    const p = Math.min(100, (lastContextUsage.used / lastContextUsage.total) * 100)
    let color: string
    if (p >= 90) color = 'linear-gradient(90deg, rgba(239,68,68,0.85), rgba(220,38,38,0.75))'
    else if (p >= 70) color = 'linear-gradient(90deg, rgba(251,191,36,0.8), rgba(245,158,11,0.7))'
    else color = 'linear-gradient(90deg, rgba(99,102,241,0.7), rgba(139,92,246,0.6))'
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
        height: 10,
        display: 'flex',
        alignItems: 'center',
        cursor: 'default',
        flexShrink: 0,
        background: 'transparent',
        overflow: 'visible',
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
          height: 2,
          background: 'rgba(255,255,255,0.06)',
          overflow: 'hidden',
        }}
      >
        {/* Fill */}
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            borderRadius: '0 1px 1px 0',
            background: fillColor,
            transition: 'width 0.15s ease, background 0.15s ease',
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
            background: 'rgba(15,15,25,0.92)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 8,
            padding: '8px 12px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            zIndex: 100,
            whiteSpace: 'nowrap',
            fontSize: 11,
            color: 'rgba(255,255,255,0.82)',
            lineHeight: 1.6,
          }}
        >
          <div>{t('context.usage', { used: usedStr, total: totalStr, percent: pctStr })}</div>
          {lastUsage && (
            <div style={{ color: 'rgba(255,255,255,0.45)' }}>
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
