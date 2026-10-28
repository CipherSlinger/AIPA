// Shared shell for the two "reuse this conversation" preview dialogs.
// Keeps the overlay, Escape handling, header and footer in one place so both
// dialogs differ only in their editor body.

import React, { useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useT } from '../../i18n'
import { useClickOutside } from '../../hooks/useClickOutside'

interface Props {
  title: string
  subtitle: string
  icon: React.ReactNode
  width?: number
  onClose: () => void
  footer: React.ReactNode
  children: React.ReactNode
  testId: string
}

export default function SessionReuseDialogShell({
  title,
  subtitle,
  icon,
  width = 520,
  onClose,
  footer,
  children,
  testId,
}: Props) {
  const t = useT()
  const dialogRef = useRef<HTMLDivElement>(null)
  useClickOutside(dialogRef, true, onClose)

  // The menu lives inside the chat header, whose backdrop blur creates a
  // stacking context below the message list — without the portal the chat
  // paints over the dialog and `position: fixed` no longer means "viewport".
  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'var(--glass-overlay)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999,
        animation: 'fadeIn 0.15s ease',
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-session-reuse={testId}
        onKeyDown={e => { if (e.key === 'Escape') onClose() }}
        style={{
          width,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: '82vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--popup-bg)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          boxShadow: '0 16px 48px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)',
          animation: 'slideUp 0.15s ease',
          overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '16px 18px 12px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <span style={{ color: '#818cf8', marginTop: 1, flexShrink: 0 }}>{icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              {title}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.45 }}>
              {subtitle}
            </div>
          </div>
          <button
            onClick={onClose}
            title={t('common.close')}
            aria-label={t('common.close')}
            style={{
              background: 'transparent', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', padding: 4, borderRadius: 8, display: 'flex',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--border)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 18px' }}>
          {children}
        </div>

        <div style={{
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
          gap: 8, padding: '12px 18px',
          borderTop: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          {footer}
        </div>
      </div>
    </div>,
    document.body,
  )
}
