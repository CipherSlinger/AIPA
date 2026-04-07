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
        background: 'var(--popup-bg)',
        border: '1px solid var(--popup-border)',
        boxShadow: 'var(--popup-shadow)',
        borderRadius: 8,
        padding: '8px 12px',
        minWidth: 240,
        zIndex: 100,
      }}
    >
      {/* Title */}
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
        {t('token.contextWindow')}
      </div>

      {/* Context Window progress bar (large) */}
      {lastContextUsage && contextPct !== null && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
            <span style={{ color: 'var(--text-primary)' }}>
              {fmtNumber(lastContextUsage.used)} / {fmtNumber(lastContextUsage.total)}
            </span>
            <span style={{ color: ctxColor, fontWeight: 600 }}>{contextPct}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={contextPct}
            aria-valuemin={0}
            aria-valuemax={100}
            style={{
              width: '100%',
              height: 6,
              background: 'rgba(255,255,255,0.1)',
              borderRadius: 3,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${contextPct}%`,
                height: '100%',
                background: ctxColor,
                borderRadius: 3,
                transition: 'width 0.3s ease, background 0.3s ease',
              }}
            />
          </div>
        </div>
      )}

      {/* Token breakdown */}
      {lastUsage && (
        <div style={{ borderTop: '1px solid var(--popup-border)', paddingTop: 6, marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, marginBottom: 4 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
              <ArrowUp size={9} />
              {t('token.inputTokens')}
            </span>
            <span style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {lastUsage.inputTokens.toLocaleString()}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, marginBottom: 4 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
              <ArrowDown size={9} />
              {t('token.outputTokens')}
            </span>
            <span style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {lastUsage.outputTokens.toLocaleString()}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
              <Recycle size={9} />
              {t('token.cacheTokens')}
            </span>
            <span style={{ color: lastUsage.cacheTokens > 0 ? 'var(--text-primary)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
              {lastUsage.cacheTokens > 0 ? lastUsage.cacheTokens.toLocaleString() : 'N/A'}
            </span>
          </div>
        </div>
      )}

      {/* Session cost */}
      {totalSessionCost > 0 && (
        <div style={{ borderTop: '1px solid var(--popup-border)', paddingTop: 6, marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
              <Database size={9} />
              {t('token.sessionTotal')}
            </span>
            <span style={{
              color: totalSessionCost >= 5 ? '#f87171' : totalSessionCost >= 1 ? '#fbbf24' : '#4ade80',
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
            background: 'rgba(0, 122, 204, 0.08)',
            border: '1px solid rgba(0, 122, 204, 0.2)',
            borderRadius: 6,
            color: 'var(--accent)',
            cursor: 'pointer',
            transition: 'background 150ms',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0, 122, 204, 0.15)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0, 122, 204, 0.08)' }}
        >
          <Archive size={10} />
          {t('token.compactAction')}
        </button>
      )}
    </div>
  )
}
