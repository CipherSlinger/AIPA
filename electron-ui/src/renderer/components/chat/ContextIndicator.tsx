// ContextIndicator — extracted from ChatHeader.tsx (Iteration 446 decomposition)
// Contains: CostBadge, ContextBadge (with detail popover), ContextProgressBar
import React, { useState, useRef, useEffect } from 'react'
import { DollarSign } from 'lucide-react'
import { useChatStore, useUiStore } from '../../store'
import { useT } from '../../i18n'

/** Inline session cost badge — shows total cost with color thresholds */
export function CostBadge() {
  const t = useT()
  const totalCost = useChatStore(s => s.totalSessionCost)
  const addToast = useUiStore(s => s.addToast)

  if (totalCost < 0.01) return null

  const costStr = totalCost < 1 ? `$${totalCost.toFixed(3)}` : `$${totalCost.toFixed(2)}`
  const color = totalCost >= 5 ? '#f87171' : totalCost >= 1 ? '#fbbf24' : 'rgba(255,255,255,0.45)'
  const bgColor = totalCost >= 5 ? 'rgba(239,68,68,0.12)' : totalCost >= 1 ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.04)'
  const borderColor = totalCost >= 5 ? 'rgba(239,68,68,0.3)' : totalCost >= 1 ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.08)'

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(costStr).then(() => {
          addToast('info', t('toolbar.costCopied'))
        }).catch(() => {})
      }}
      title={t('toolbar.sessionTotal', { total: totalCost.toFixed(4) })}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        padding: '2px 8px',
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 12,
        color,
        cursor: 'pointer',
        fontSize: 10,
        fontWeight: 600,
        fontFamily: 'monospace',
        flexShrink: 0,
        transition: 'all 0.15s ease',
        lineHeight: 1,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = '#6366f1'
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = borderColor
      }}
    >
      <DollarSign size={10} />
      {costStr}
    </button>
  )
}

/** Compact context window usage indicator with detail popover */
export function ContextBadge({ onNewConversation }: { onNewConversation: () => void }) {
  const t = useT()
  const ctx = useChatStore(s => s.lastContextUsage)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const badgeRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Close popover on outside click or Escape
  useEffect(() => {
    if (!popoverOpen) return
    const handleClick = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        badgeRef.current && !badgeRef.current.contains(e.target as Node)
      ) {
        setPopoverOpen(false)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setPopoverOpen(false) }
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('keydown', handleKey) }
  }, [popoverOpen])

  if (!ctx || ctx.total === 0) return null

  const pct = Math.round((ctx.used / ctx.total) * 100)
  if (pct < 5) return null // Don't show when nearly empty

  const isCritical = pct >= 90
  const isWarning = pct >= 80 && pct < 90
  const color = isCritical ? '#f87171' : isWarning ? '#fbbf24' : 'rgba(255,255,255,0.45)'
  const chipBg = isCritical ? 'rgba(239,68,68,0.08)' : isWarning ? 'rgba(245,158,11,0.08)' : 'rgba(99,102,241,0.08)'
  const chipBorder = isCritical ? 'rgba(239,68,68,0.2)' : isWarning ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.08)'
  const barFill = isCritical ? '#f87171' : isWarning ? '#fbbf24' : 'rgba(99,102,241,0.8)'
  const remaining = ctx.total - ctx.used
  // Rough estimate: avg ~800 tokens per exchange (user+assistant)
  const estMsgsRemaining = Math.max(0, Math.floor(remaining / 800))

  const newSessionBg = pct >= 80
    ? 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))'
    : 'rgba(255,255,255,0.06)'

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        ref={badgeRef}
        onClick={() => setPopoverOpen(!popoverOpen)}
        title={t('toolbar.contextUsed', { percent: String(pct), used: String(ctx.used), total: String(ctx.total) })}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 10px',
          background: chipBg,
          border: `1px solid ${chipBorder}`,
          borderRadius: 6,
          color,
          cursor: 'pointer',
          fontSize: 11,
          fontWeight: 600,
          fontFamily: 'monospace',
          flexShrink: 0,
          transition: 'all 0.15s ease',
          lineHeight: 1,
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#6366f1' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = chipBorder }}
      >
        <span style={{ fontSize: 9, opacity: 0.7, flexShrink: 0 }}>{t('toolbar.context')}</span>
        <div style={{
          width: 40, height: 3, background: 'rgba(255,255,255,0.08)',
          borderRadius: 2, overflow: 'hidden', position: 'relative', flexShrink: 0,
        }}>
          <div style={{
            width: `${pct}%`, height: '100%',
            background: barFill,
            borderRadius: 2, transition: 'width 0.15s ease',
          }} />
        </div>
        <span style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
      </button>

      {/* Context Detail Popover */}
      {popoverOpen && (
        <div
          ref={popoverRef}
          className="popup-enter"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 6,
            width: 260,
            background: 'rgba(15,15,25,0.92)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 10,
            boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
            padding: '14px 16px',
            zIndex: 100,
            animation: 'slideUp 0.15s ease',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.82)', marginBottom: 10 }}>
            {t('toolbar.contextPopoverTitle')}
          </div>

          {/* Usage bar */}
          <div style={{
            width: '100%', height: 6, background: 'rgba(255,255,255,0.08)',
            borderRadius: 3, overflow: 'hidden', marginBottom: 12,
          }}>
            <div style={{
              width: `${pct}%`, height: '100%', background: barFill,
              borderRadius: 3, transition: 'width 0.15s ease',
            }} />
          </div>

          {/* Stats rows */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>
            <span>{t('toolbar.contextPopoverUsed')}</span>
            <span style={{ color, fontWeight: 600, fontFamily: 'monospace' }}>{ctx.used.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>
            <span>{t('toolbar.contextPopoverRemaining')}</span>
            <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{remaining.toLocaleString()}</span>
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', marginBottom: 12, opacity: 0.8 }}>
            {t('toolbar.contextPopoverEstMsgs', { count: String(estMsgsRemaining) })}
          </div>

          {/* Start new session button */}
          <button
            onClick={() => { setPopoverOpen(false); onNewConversation() }}
            style={{
              width: '100%',
              padding: '7px 0',
              fontSize: 11,
              fontWeight: 600,
              background: newSessionBg,
              border: pct >= 80 ? 'none' : '1px solid rgba(255,255,255,0.10)',
              borderRadius: 6,
              color: pct >= 80 ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.82)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
          >
            {t('toolbar.contextPopoverNewSession')}
          </button>
        </div>
      )}
    </div>
  )
}

/** Context window progress bar — 3px at bottom edge of header */
export function ContextProgressBar() {
  const ctx = useChatStore(s => s.lastContextUsage)
  const t = useT()
  if (!ctx || ctx.total === 0) return null
  const pct = Math.round((ctx.used / ctx.total) * 100)
  if (pct < 5) return null
  const isCritical = pct >= 90
  const barFill = isCritical ? '#f87171' : pct >= 80 ? '#fbbf24' : 'rgba(99,102,241,0.8)'
  return (
    <div
      title={t('toolbar.contextBarTooltip', { percent: String(pct), used: String(ctx.used), total: String(ctx.total) })}
      style={{
        height: 2,
        width: '100%',
        background: 'rgba(255,255,255,0.07)',
        flexShrink: 0,
        transition: 'all 0.15s ease',
      }}
    >
      <div style={{
        height: '100%',
        width: `${pct}%`,
        background: barFill,
        transition: 'all 0.15s ease',
        borderRadius: '0 1px 1px 0',
      }} />
    </div>
  )
}
