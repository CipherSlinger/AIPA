// RewindDialog — confirmation dialog for conversation rewind (extracted Iteration 456)
import React from 'react'
import { useT } from '../../i18n'

interface RewindDialogProps {
  count: number
  onConfirm: () => void
  onCancel: () => void
}

export default function RewindDialog({ count, onConfirm, onCancel }: RewindDialogProps) {
  const t = useT()

  return (
    <div
      style={{
        position: 'absolute', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.70)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        animation: 'fadeIn 0.15s ease',
      }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--popup-bg)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          boxShadow: '0 16px 48px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)',
          maxWidth: 360,
          width: '90%',
          overflow: 'hidden',
          animation: 'slideUp 0.15s ease',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', textAlign: 'center', lineHeight: 1.3 }}>
            {t('rewind.title')}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Description */}
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, textAlign: 'center' }}>
            {t('rewind.confirm', { count: String(count) })}
          </div>

          {/* Warning box — amber icon + amber tinted bg */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              background: 'rgba(251,191,36,0.10)',
              border: '1px solid rgba(251,191,36,0.30)',
              borderRadius: 8,
              padding: '10px 14px',
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>⚠️</span>
            <span style={{ color: 'rgba(251,191,36,0.82)' }}>
              {t('rewind.warning')}
            </span>
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button
              onClick={onCancel}
              style={{
                padding: '7px 18px',
                fontSize: 13,
                borderRadius: 8,
                background: 'var(--bg-hover)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--border)'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'
                e.currentTarget.style.color = 'var(--text-primary)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'var(--bg-hover)'
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.color = 'var(--text-secondary)'
              }}
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={onConfirm}
              style={{
                padding: '7px 18px',
                fontSize: 13,
                borderRadius: 8,
                background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
                border: 'none',
                color: 'rgba(255,255,255,0.95)',
                cursor: 'pointer',
                fontWeight: 600,
                transition: 'all 0.15s ease',
                boxShadow: '0 2px 8px rgba(99,102,241,0.30)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,0.96), rgba(139,92,246,0.96))'
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.40)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))'
                e.currentTarget.style.transform = ''
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(99,102,241,0.30)'
              }}
            >
              {t('rewind.button')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
