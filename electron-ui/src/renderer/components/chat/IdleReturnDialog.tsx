import React from 'react'
import { Clock, MessageSquarePlus, X, Sparkles, Loader, Coffee } from 'lucide-react'
import { useChatStore } from '../../store'
import { useT } from '../../i18n'

interface IdleReturnDialogProps {
  idleDuration: string
  awaySummary?: string | null
  summaryLoading?: boolean
  onContinue: () => void
  onNewConversation: () => void
  onNeverAsk: () => void
}

export default function IdleReturnDialog({
  idleDuration,
  awaySummary,
  summaryLoading,
  onContinue,
  onNewConversation,
  onNeverAsk,
}: IdleReturnDialogProps) {
  const t = useT()
  const lastContextUsage = useChatStore(s => s.lastContextUsage)

  const contextPct = lastContextUsage && lastContextUsage.total > 0
    ? Math.round((lastContextUsage.used / lastContextUsage.total) * 100)
    : null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.70)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 200,
        animation: 'fadeIn 0.15s ease',
      }}
      onClick={onContinue}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--popup-bg)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '24px 28px',
          maxWidth: 420,
          width: '90%',
          boxShadow: '0 16px 48px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)',
          animation: 'slideUp 0.15s ease',
        }}
      >
        {/* Icon + Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
          {/* Amber/indigo icon cluster */}
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: 'rgba(251,191,36,0.10)',
            border: '1px solid rgba(251,191,36,0.22)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 2px 8px rgba(251,191,36,0.10)',
          }}>
            <Coffee size={20} style={{ color: '#fbbf24' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: 'rgba(251,191,36,0.70)',
              marginBottom: 4,
            }}>
              {t('idle.awayLabel') || 'Away'}
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.3 }}>
              {(() => {
                const full = t('idle.title', { duration: idleDuration })
                const idx = full.indexOf(idleDuration)
                if (idx === -1) return full
                return <>{full.slice(0, idx)}<span style={{
                  fontSize: 26,
                  fontWeight: 700,
                  color: '#fbbf24',
                  fontVariantNumeric: 'tabular-nums',
                  fontFeatureSettings: '"tnum"',
                  lineHeight: 1.2,
                }}>{idleDuration}</span>{full.slice(idx + idleDuration.length)}</>
              })()}
            </span>
          </div>
        </div>

        {/* Description */}
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px 0', lineHeight: 1.5 }}>
          {t('idle.description')}
        </p>

        {/* Away summary */}
        {(summaryLoading || awaySummary) && (
          <div style={{
            margin: '0 0 12px 0',
            padding: '12px',
            background: 'rgba(99,102,241,0.06)',
            borderRadius: 8,
            border: '1px solid rgba(99,102,241,0.18)',
            fontSize: 13,
          }}>
            <div style={{
              fontSize: 10,
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontWeight: 700,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}>
              {summaryLoading ? (
                <Loader size={12} style={{ color: '#818cf8', animation: 'spin 1s linear infinite' }} />
              ) : (
                <Sparkles size={12} style={{ color: '#818cf8' }} />
              )}
              <span style={{ color: '#818cf8' }}>
                {summaryLoading ? t('idle.generatingSummary') : t('idle.summary')}
              </span>
            </div>
            {awaySummary && (
              <div style={{
                fontSize: 13,
                lineHeight: 1.5,
                color: 'var(--text-primary)',
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical' as const,
                overflow: 'hidden',
              }}>
                {awaySummary}
              </div>
            )}
          </div>
        )}

        {/* Context usage info */}
        {contextPct !== null && (
          <p style={{
            fontSize: 12,
            color: contextPct >= 60 ? '#fbbf24' : 'var(--text-muted)',
            margin: '0 0 18px 0',
            fontVariantNumeric: 'tabular-nums',
            fontFeatureSettings: '"tnum"',
          }}>
            {t('idle.contextUsage', { percent: String(contextPct) })}
          </p>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Continue — indigo gradient CTA */}
          <button
            onClick={onContinue}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '9px 20px',
              borderRadius: 8,
              border: 'none',
              background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
              color: 'rgba(255,255,255,0.95)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              width: '100%',
              transition: 'all 0.15s ease',
              boxShadow: '0 2px 8px rgba(99,102,241,0.25)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,0.96), rgba(139,92,246,0.96))'
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.40)'
              e.currentTarget.style.transform = 'translateY(-1px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))'
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(99,102,241,0.25)'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            <MessageSquarePlus size={15} style={{ opacity: 0.85 }} />
            {t('idle.continue')}
          </button>

          {/* New conversation — ghost */}
          <button
            onClick={() => { onNewConversation(); onContinue() }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '9px 20px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-hover)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
              width: '100%',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--border)'
              e.currentTarget.style.borderColor = 'var(--border-strong)'
              e.currentTarget.style.color = 'var(--text-primary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--bg-hover)'
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.color = 'var(--text-secondary)'
            }}
          >
            <X size={14} style={{ opacity: 0.7 }} />
            {t('idle.startNew')}
          </button>
        </div>

        {/* Don't ask again — micro text button */}
        <button
          onClick={onNeverAsk}
          style={{
            display: 'block',
            margin: '12px auto 0',
            padding: '4px 8px',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: 11,
            cursor: 'pointer',
            transition: 'color 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          {t('idle.neverAsk')}
        </button>
      </div>
    </div>
  )
}
