import React, { useState, useMemo, useCallback } from 'react'
import { useChatStore } from '../../store'
import { useT } from '../../i18n'

/** Format a number with thousands separators */
function fmtNum(n: number): string {
  return n.toLocaleString()
}

/** Threshold above which the compact button is shown */
const COMPACT_THRESHOLD = 75
/** Threshold above which the button switches to red/critical styling */
const CRITICAL_THRESHOLD = 90

export default function TokenUsageBar() {
  const t = useT()
  const lastContextUsage = useChatStore(s => s.lastContextUsage)
  const lastUsage = useChatStore(s => s.lastUsage)
  const currentSessionId = useChatStore(s => s.currentSessionId)
  const isStreaming = useChatStore(s => s.isStreaming)
  const [hovered, setHovered] = useState(false)
  const [compactCooldown, setCompactCooldown] = useState(false)
  const [btnHovered, setBtnHovered] = useState(false)

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

  const showCompactButton = pct >= COMPACT_THRESHOLD
  const isCritical = pct >= CRITICAL_THRESHOLD
  const canCompact = !!(currentSessionId && !isStreaming && !compactCooldown)

  const handleCompact = useCallback(async () => {
    if (!canCompact) return
    setCompactCooldown(true)

    // Record context usage before compact so useStreamJson can show before/after diff
    const chatState = useChatStore.getState()
    if (chatState.lastContextUsage) {
      chatState.setContextBeforeCompact({
        used: chatState.lastContextUsage.used,
        total: chatState.lastContextUsage.total,
      })
    }
    chatState.setCompacting(true)

    try {
      await window.electronAPI.cliSendMessage({
        prompt: '/compact',
        sessionId: currentSessionId,
      })
    } catch {
      // ignore errors — the chat panel event system will surface them
      useChatStore.getState().setCompacting(false)
    }
    setTimeout(() => setCompactCooldown(false), 1500)
  }, [canCompact, currentSessionId])

  // Don't render when no usage data
  if (!lastContextUsage || lastContextUsage.total <= 0) return null

  const pctStr = pct.toFixed(1)
  const pctRounded = Math.round(pct)
  const usedStr = fmtNum(lastContextUsage.used)
  const totalStr = fmtNum(lastContextUsage.total)

  // Compact button base styles
  const compactBase: React.CSSProperties = isCritical
    ? {
        border: '1px solid rgba(239,68,68,0.40)',
        background: 'rgba(239,68,68,0.12)',
        color: 'rgba(239,68,68,0.80)',
      }
    : {
        border: '1px solid rgba(255,165,0,0.35)',
        background: 'rgba(255,165,0,0.10)',
        color: 'rgba(255,165,0,0.80)',
      }

  const compactHover: React.CSSProperties = isCritical
    ? {
        border: '1px solid rgba(239,68,68,0.55)',
        background: 'rgba(239,68,68,0.20)',
      }
    : {
        border: '1px solid rgba(255,165,0,0.50)',
        background: 'rgba(255,165,0,0.18)',
      }

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
        gap: 6,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Track — grows to fill available space */}
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Context usage: ${pctStr}%`}
        style={{
          flex: 1,
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

      {/* Percentage label */}
      <span
        style={{
          fontSize: 11,
          fontVariantNumeric: 'tabular-nums',
          fontFeatureSettings: '"tnum"',
          color: 'rgba(255,255,255,0.38)',
          lineHeight: 1,
          flexShrink: 0,
          userSelect: 'none',
        }}
      >
        {pctRounded}%
      </span>

      {/* Compact button — only shown at >= 75% */}
      {showCompactButton && (
        <button
          onClick={handleCompact}
          disabled={!canCompact}
          onMouseEnter={() => setBtnHovered(true)}
          onMouseLeave={() => setBtnHovered(false)}
          title={canCompact ? 'Compress context window (/compact)' : isStreaming ? 'Wait for response to finish' : 'No active session'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.07em',
            textTransform: 'uppercase' as const,
            cursor: canCompact ? 'pointer' : 'not-allowed',
            transition: 'all 0.15s ease',
            flexShrink: 0,
            lineHeight: 1,
            // When disabled (no session or streaming) — grey out
            ...(canCompact
              ? { ...(btnHovered ? { ...compactBase, ...compactHover } : compactBase) }
              : {
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.05)',
                  color: 'rgba(255,255,255,0.25)',
                }),
          }}
        >
          {isCritical ? (
            <>
              <span>&#x26A0;</span>
              <span>COMPACT</span>
            </>
          ) : (
            <span>COMPACT</span>
          )}
        </button>
      )}

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
