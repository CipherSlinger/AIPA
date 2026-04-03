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
        background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)',
      }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--popup-bg)', border: '1px solid var(--popup-border)',
          borderRadius: 12, padding: '20px 24px', maxWidth: 360,
          boxShadow: 'var(--popup-shadow)', textAlign: 'center',
          animation: 'popup-in 0.15s ease-out',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-bright)', marginBottom: 10 }}>
          {t('rewind.title')}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 18, lineHeight: 1.6 }}>
          {t('rewind.confirm', { count: String(count) })}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '7px 18px', fontSize: 12, borderRadius: 6,
              background: 'none', border: '1px solid var(--border)',
              color: 'var(--text-primary)', cursor: 'pointer',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--popup-item-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '7px 18px', fontSize: 12, borderRadius: 6,
              background: 'var(--error)', border: 'none',
              color: '#fff', cursor: 'pointer', fontWeight: 600,
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            {t('rewind.button')}
          </button>
        </div>
      </div>
    </div>
  )
}
