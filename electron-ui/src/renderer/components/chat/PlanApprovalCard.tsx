import React, { useState } from 'react'
import { ClipboardList, Check, X, ChevronDown, ChevronUp, User } from 'lucide-react'
import { useT } from '../../i18n'

interface Props {
  sessionId: string
  requestId: string
  from: string
  planContent: string
  planFilePath: string
  onApprove: (requestId: string) => void
  onReject: (requestId: string, feedback?: string) => void
}

export default function PlanApprovalCard({
  sessionId: _sessionId,
  requestId,
  from,
  planContent,
  planFilePath,
  onApprove,
  onReject,
}: Props) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [decided, setDecided] = useState<'approved' | 'rejected' | null>(null)

  const PREVIEW_LINES = 6
  const lines = planContent.split('\n')
  const isLong = lines.length > PREVIEW_LINES
  const displayContent = expanded || !isLong
    ? planContent
    : lines.slice(0, PREVIEW_LINES).join('\n') + '\n…'

  const handleApprove = () => {
    if (decided) return
    setDecided('approved')
    onApprove(requestId)
  }

  const handleReject = () => {
    if (decided) return
    setDecided('rejected')
    onReject(requestId, feedback.trim() || undefined)
  }

  const isPending = decided === null

  return (
    <div
      style={{
        margin: '8px auto',
        maxWidth: 440,
        background: 'var(--glass-bg-mid)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid var(--glass-border)',
        borderLeft: decided === 'approved'
          ? '3px solid rgba(34,197,94,0.60)'
          : decided === 'rejected'
            ? '3px solid rgba(239,68,68,0.50)'
            : '3px solid rgba(251,191,36,0.60)',
        borderRadius: 10,
        boxShadow: 'var(--glass-shadow)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          borderBottom: '1px solid var(--glass-border)',
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'rgba(251,191,36,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: '#fbbf24',
            opacity: isPending ? 1 : 0.6,
            transition: 'opacity 0.15s ease',
          }}
        >
          <ClipboardList size={16} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                color: 'var(--text-faint)',
              }}
            >
              {t('plan.approvalRequired')}
            </span>
            {isPending && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  padding: '1px 5px',
                  borderRadius: 6,
                  background: 'rgba(251,191,36,0.15)',
                  color: '#fbbf24',
                }}
              >
                PENDING
              </span>
            )}
          </div>
          {from && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                color: 'var(--text-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              <User size={10} style={{ flexShrink: 0 }} />
              <span>{t('plan.from')}: <code style={{ fontFamily: 'monospace', color: '#fbbf24', fontSize: 10 }}>{from}</code></span>
            </div>
          )}
        </div>
        {!isPending && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: decided === 'approved' ? '#4ade80' : '#f87171',
              flexShrink: 0,
            }}
          >
            {decided === 'approved' ? t('plan.approved') : t('plan.rejected')}
          </span>
        )}
      </div>

      {/* Plan content */}
      <div style={{ padding: '10px 14px' }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--text-faint)',
            marginBottom: 6,
          }}
        >
          {t('plan.planDetails')}
          {planFilePath && (
            <span style={{ marginLeft: 6, fontWeight: 400, color: 'rgba(251,191,36,0.55)', fontSize: 9 }}>
              {planFilePath.split('/').at(-1)}
            </span>
          )}
        </div>
        <pre
          style={{
            margin: 0,
            fontSize: 11,
            lineHeight: 1.65,
            color: 'var(--text-secondary)',
            background: 'rgba(0,0,0,0.25)',
            border: '1px solid var(--border)',
            borderRadius: 7,
            padding: '8px 10px',
            fontFamily: 'inherit',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: 280,
            overflowY: 'auto',
          }}
        >
          {displayContent}
        </pre>
        {isLong && (
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              marginTop: 4,
              background: 'transparent',
              border: 'none',
              color: 'rgba(251,191,36,0.70)',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 4px',
              borderRadius: 6,
              opacity: 0.8,
              transition: 'opacity 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.8' }}
          >
            {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            {expanded ? 'Show less' : `Show all ${lines.length} lines`}
          </button>
        )}
      </div>

      {/* Actions */}
      {isPending ? (
        <div
          style={{
            padding: '8px 14px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            borderTop: '1px solid var(--glass-border)',
          }}
        >
          {showFeedback && (
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Optional rejection reason..."
              rows={2}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                borderRadius: 6,
                border: '1px solid var(--border)',
                padding: '6px 10px',
                fontSize: 12,
                resize: 'vertical',
                background: 'var(--bg-hover)',
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
                outline: 'none',
                transition: 'border-color 0.15s ease',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#fbbf24' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
            />
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleApprove}
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = 'brightness(1.1)'
                e.currentTarget.style.transform = 'scale(1.02)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = 'brightness(1)'
                e.currentTarget.style.transform = 'scale(1)'
              }}
              style={{
                flex: 1,
                height: 34,
                background: 'linear-gradient(135deg, rgba(34,197,94,0.72), rgba(16,185,129,0.72))',
                border: 'none',
                borderRadius: 7,
                color: 'rgba(255,255,255,0.95)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                boxShadow: '0 2px 8px rgba(34,197,94,0.28)',
                transition: 'all 0.15s ease',
              }}
            >
              <Check size={13} /> {t('plan.approve')}
            </button>
            <button
              onClick={handleReject}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(239,68,68,0.16)'
                e.currentTarget.style.borderColor = 'rgba(239,68,68,0.35)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(239,68,68,0.08)'
                e.currentTarget.style.borderColor = 'rgba(239,68,68,0.22)'
              }}
              style={{
                flex: 1,
                height: 34,
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.22)',
                borderRadius: 7,
                color: '#fca5a5',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                transition: 'all 0.15s ease',
              }}
            >
              <X size={13} /> {t('plan.reject')}
            </button>
          </div>

          <div style={{ display: 'flex' }}>
            <button
              onClick={() => setShowFeedback(!showFeedback)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(251,191,36,0.65)',
                cursor: 'pointer',
                fontSize: 10,
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                padding: '2px 4px',
                borderRadius: 6,
                opacity: 0.8,
                transition: 'opacity 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.8' }}
            >
              {showFeedback ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              {showFeedback ? 'Hide feedback' : 'Add rejection feedback'}
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{
            padding: '8px 14px 10px',
            borderTop: '1px solid var(--glass-border)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: decided === 'approved' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
              color: decided === 'approved' ? '#4ade80' : '#f87171',
              borderRadius: 12,
              padding: '3px 10px',
              fontWeight: 600,
            }}
          >
            {decided === 'approved' ? <Check size={12} /> : <X size={12} />}
            {decided === 'approved' ? t('plan.approved') : t('plan.rejected')}
          </span>
        </div>
      )}
    </div>
  )
}
