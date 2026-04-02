import React from 'react'
import { Clock, MessageSquarePlus, X, Sparkles, Loader } from 'lucide-react'
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
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
      }}
      onClick={onContinue}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--popup-bg)',
          border: '1px solid var(--popup-border)',
          borderRadius: 12,
          padding: '24px 28px',
          maxWidth: 420,
          width: '90%',
          boxShadow: 'var(--popup-shadow)',
          animation: 'popup-in 0.2s ease',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Clock size={20} style={{ color: 'var(--warning)', flexShrink: 0 }} />
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-bright)' }}>
            {t('idle.title', { duration: idleDuration })}
          </span>
        </div>

        {/* Description */}
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 8px 0', lineHeight: 1.5 }}>
          {t('idle.description')}
        </p>

        {/* Away summary */}
        {(summaryLoading || awaySummary) && (
          <div style={{
            margin: '12px 0',
            padding: '10px 14px',
            background: 'var(--card-bg)',
            borderRadius: 8,
            border: '1px solid var(--card-border)',
          }}>
            <div style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              {summaryLoading ? (
                <Loader size={12} style={{ color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />
              ) : (
                <Sparkles size={14} style={{ color: 'var(--accent)' }} />
              )}
              <span>{summaryLoading ? t('idle.generatingSummary') : t('idle.summary')}</span>
            </div>
            {awaySummary && (
              <div style={{
                fontSize: 13,
                lineHeight: 1.5,
                color: 'var(--text-primary)',
                marginTop: 6,
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
            color: contextPct >= 60 ? 'var(--warning)' : 'var(--text-muted)',
            margin: '0 0 20px 0',
          }}>
            {t('idle.contextUsage', { percent: String(contextPct) })}
          </p>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={onContinue}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 16px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--action-btn-bg)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
              transition: 'background 150ms',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--action-btn-bg)')}
          >
            <MessageSquarePlus size={16} style={{ opacity: 0.7 }} />
            {t('idle.continue')}
          </button>

          <button
            onClick={() => { onNewConversation(); onContinue() }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 16px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
              transition: 'opacity 150ms',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            <X size={16} style={{ opacity: 0.7 }} />
            {t('idle.startNew')}
          </button>
        </div>

        {/* Don't ask again */}
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
            textDecoration: 'underline',
            opacity: 0.7,
          }}
        >
          {t('idle.neverAsk')}
        </button>
      </div>
    </div>
  )
}
