// StatusBarTokenPopup — token usage detail popup from StatusBar (Iteration 517)
// Shows input/output/cache token breakdown, context window usage, and estimated cost

import React from 'react'
import { ArrowUp, ArrowDown, Recycle, Database, Archive } from 'lucide-react'
import { useT } from '../../i18n'
import { fmtNumber } from './statusBarConstants'

interface StatusBarTokenPopupProps {
  lastUsage: { inputTokens: number; outputTokens: number; cacheTokens: number } | null
  lastContextUsage: { used: number; total: number } | null
  contextPct: number | null
  ctxColor: string
  totalSessionCost: number
  isStreaming: boolean
  onCompact: () => void
}

export default function StatusBarTokenPopup({
  lastUsage,
  lastContextUsage,
  contextPct,
  ctxColor,
  totalSessionCost,
  isStreaming,
  onCompact,
}: StatusBarTokenPopupProps) {
  const t = useT()

  return (
    <div
      className="popup-enter"
      style={{
        position: 'absolute',
        bottom: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        marginBottom: 4,
        background: 'rgba(15,15,25,0.96)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.09)',
        boxShadow: '0 8px 28px rgba(0,0,0,0.55)',
        borderRadius: 10,
        padding: '12px 14px',
        minWidth: 240,
        zIndex: 100,
      }}
    >
      {/* Title */}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)', marginBottom: 6 }}>
        {t('token.contextWindow')}
      </div>

      {/* Context Window progress bar (large) */}
      {lastContextUsage && contextPct !== null && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
            <span style={{ color: 'rgba(255,255,255,0.82)' }}>
              {fmtNumber(lastContextUsage.used)} / {fmtNumber(lastContextUsage.total)}
            </span>
            <span style={{ color: ctxColor, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{contextPct}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={contextPct}
            aria-valuemin={0}
            aria-valuemax={100}
            style={{
              width: '100%',
              height: 4,
              background: 'rgba(255,255,255,0.07)',
              borderRadius: 3,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${contextPct}%`,
                height: '100%',
                background: contextPct >= 80
                  ? ctxColor
                  : 'linear-gradient(90deg, rgba(99,102,241,0.9), rgba(129,140,248,0.9))',
                borderRadius: 3,
                transition: 'all 0.15s ease',
              }}
            />
          </div>
        </div>
      )}

      {/* Token breakdown */}
      {lastUsage && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6, marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, marginBottom: 4 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>
              <ArrowUp size={9} />
              {t('token.inputTokens')}
            </span>
            <span style={{ color: '#818cf8', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {lastUsage.inputTokens.toLocaleString()}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, marginBottom: 4 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>
              <ArrowDown size={9} />
              {t('token.outputTokens')}
            </span>
            <span style={{ color: '#818cf8', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {lastUsage.outputTokens.toLocaleString()}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>
              <Recycle size={9} />
              {t('token.cacheTokens')}
            </span>
            <span style={{ color: lastUsage.cacheTokens > 0 ? '#818cf8' : 'rgba(255,255,255,0.45)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {lastUsage.cacheTokens > 0 ? lastUsage.cacheTokens.toLocaleString() : 'N/A'}
            </span>
          </div>
        </div>
      )}

      {/* Session cost */}
      {totalSessionCost > 0 && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6, marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>
              <Database size={9} />
              {t('token.sessionTotal')}
            </span>
            <span style={{
              color: '#fbbf24',
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
            }}>
              ${totalSessionCost < 0.001 ? '<0.001' : totalSessionCost.toFixed(3)}
            </span>
          </div>
        </div>
      )}

      {/* Compact button when usage is high */}
      {contextPct !== null && contextPct >= 60 && !isStreaming && (
        <button
          onClick={onCompact}
          title={t('chat.compactHint')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            width: '100%',
            padding: '4px 0',
            fontSize: 10,
            fontWeight: 500,
            background: 'rgba(99,102,241,0.15)',
            border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: 6,
            color: '#818cf8',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.25)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.15)' }}
        >
          <Archive size={10} />
          {t('token.compactAction')}
        </button>
      )}
    </div>
  )
}
