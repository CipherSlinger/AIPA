// PlanModeBanner — shown above the textarea when Plan Mode is active (Iteration 520)
// Iteration 540: added Approve and Reject/Modify buttons
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { ClipboardList, X, Check, MessageSquareDiff } from 'lucide-react'
import { useT } from '../../i18n'

interface PlanModeBannerProps {
  onExit: () => void
  onSend?: (text: string) => Promise<void>
}

export default function PlanModeBanner({ onExit, onSend }: PlanModeBannerProps) {
  const t = useT()
  const [showReject, setShowReject] = useState(false)
  const [rejectText, setRejectText] = useState('')
  const rejectRef = useRef<HTMLDivElement>(null)
  const rejectInputRef = useRef<HTMLTextAreaElement>(null)

  // Close reject popover on outside click
  useEffect(() => {
    if (!showReject) return
    const handler = (e: MouseEvent) => {
      if (rejectRef.current && !rejectRef.current.contains(e.target as Node)) {
        setShowReject(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showReject])

  // Focus reject textarea when opened
  useEffect(() => {
    if (showReject && rejectInputRef.current) {
      rejectInputRef.current.focus()
    }
  }, [showReject])

  const handleApprove = useCallback(async () => {
    if (!onSend) return
    await onSend('approved')
    onExit()
  }, [onSend, onExit])

  const handleRejectSend = useCallback(async () => {
    if (!onSend) return
    const text = rejectText.trim()
    if (!text) return
    await onSend(text)
    setRejectText('')
    setShowReject(false)
    onExit()
  }, [onSend, rejectText, onExit])

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 14px',
        marginBottom: 4,
        background: 'rgba(99,102,241,0.12)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(99,102,241,0.25)',
        borderRadius: 8,
      }}
    >
      <ClipboardList size={14} style={{ flexShrink: 0, color: '#818cf8' }} />
      <span
        style={{
          flex: 1,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          color: 'var(--text-primary)',
        }}
      >
        {t('plan.banner')}
      </span>

      {/* Approve button — sends "approved" to CLI */}
      {onSend && (
        <button
          onClick={handleApprove}
          title={t('plan.approve')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            padding: '2px 10px',
            fontSize: 11,
            fontWeight: 600,
            background: 'rgba(34,197,94,0.15)',
            color: 'rgba(34,197,94,0.90)',
            border: '1px solid rgba(34,197,94,0.30)',
            borderRadius: 6,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(34,197,94,0.25)'
            e.currentTarget.style.borderColor = 'rgba(34,197,94,0.50)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(34,197,94,0.15)'
            e.currentTarget.style.borderColor = 'rgba(34,197,94,0.30)'
          }}
        >
          <Check size={10} />
          {t('plan.approve')}
        </button>
      )}

      {/* Reject/Modify button — opens feedback popover */}
      {onSend && (
        <div ref={rejectRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setShowReject(prev => !prev)}
            title={t('plan.reject')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              padding: '2px 10px',
              fontSize: 11,
              fontWeight: 600,
              background: showReject ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.10)',
              color: 'rgba(239,68,68,0.85)',
              border: `1px solid ${showReject ? 'rgba(239,68,68,0.40)' : 'rgba(239,68,68,0.25)'}`,
              borderRadius: 6,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(239,68,68,0.18)'
              e.currentTarget.style.borderColor = 'rgba(239,68,68,0.40)'
            }}
            onMouseLeave={(e) => {
              if (!showReject) {
                e.currentTarget.style.background = 'rgba(239,68,68,0.10)'
                e.currentTarget.style.borderColor = 'rgba(239,68,68,0.25)'
              }
            }}
          >
            <MessageSquareDiff size={10} />
            {t('plan.reject')}
          </button>

          {/* Reject feedback popover */}
          {showReject && (
            <div style={{
              position: 'absolute',
              bottom: 'calc(100% + 8px)',
              right: 0,
              width: 280,
              background: 'var(--popup-bg)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 12,
              zIndex: 200,
              boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                {t('plan.rejectFeedbackTitle')}
              </div>
              <textarea
                ref={rejectInputRef}
                value={rejectText}
                onChange={(e) => setRejectText(e.target.value.slice(0, 1000))}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setShowReject(false) }
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { handleRejectSend() }
                }}
                placeholder={t('plan.rejectFeedbackPlaceholder')}
                rows={3}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
                style={{
                  width: '100%',
                  fontSize: 11,
                  padding: '6px 8px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  color: 'var(--text-primary)',
                  resize: 'vertical',
                  outline: 'none',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s ease',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
                <button
                  onClick={() => setShowReject(false)}
                  style={{
                    fontSize: 11,
                    padding: '4px 10px',
                    background: 'var(--bg-hover)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleRejectSend}
                  disabled={!rejectText.trim()}
                  style={{
                    fontSize: 11,
                    padding: '4px 12px',
                    background: rejectText.trim()
                      ? 'rgba(239,68,68,0.82)'
                      : 'rgba(239,68,68,0.30)',
                    border: 'none',
                    borderRadius: 8,
                    color: 'rgba(255,255,255,0.95)',
                    cursor: rejectText.trim() ? 'pointer' : 'not-allowed',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {t('plan.rejectSend')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Exit button */}
      <button
        onClick={onExit}
        title={t('plan.exitHint')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          padding: '2px 8px',
          fontSize: 11,
          fontWeight: 500,
          background: 'rgba(255,255,255,0.06)',
          color: 'var(--text-muted)',
          border: '1px solid var(--glass-border-md)',
          borderRadius: 6,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(99,102,241,0.18)'
          e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'
          e.currentTarget.style.color = 'var(--text-primary)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
          e.currentTarget.style.borderColor = 'var(--glass-border-md)'
          e.currentTarget.style.color = 'var(--text-muted)'
        }}
      >
        <X size={10} />
        {t('plan.bannerExit')}
      </button>
    </div>
  )
}
