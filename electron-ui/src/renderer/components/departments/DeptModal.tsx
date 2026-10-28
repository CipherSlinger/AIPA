// Shared chrome for the department dialogs (hire, position editor, handbook).
//
// The same glass panel and header rhythm as RecruitEmployeeModal. Split out so
// the three new dialogs do not each re-implement Escape-to-close and the
// click-outside guard, and so they cannot drift apart visually.

import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '../../hooks/useFocusTrap'

interface DeptModalProps {
  title: string
  subtitle?: string
  accent?: string
  icon?: ReactNode
  width?: number
  onClose: () => void
  children: ReactNode
  footer: ReactNode
}

export default function DeptModal({
  title, subtitle, accent = '#6366f1', icon, width = 460, onClose, children, footer,
}: DeptModalProps) {
  const dialogRef = useFocusTrap(true)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const dialog = (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--glass-overlay)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        animation: 'fadeIn 0.15s ease',
      }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          background: 'var(--popup-bg)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid var(--border)', borderRadius: 16,
          boxShadow: 'var(--dialog-shadow)',
          width, maxWidth: 'calc(100vw - 48px)',
          maxHeight: 'calc(100vh - 48px)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          animation: 'slideUp 0.15s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid var(--bg-hover)', flexShrink: 0 }}>
          {icon && (
            <div style={{
              width: 30, height: 30, borderRadius: 10, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `${accent}22`, border: `1px solid ${accent}44`, color: accent,
            }}>
              {icon}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3, letterSpacing: '-0.01em' }}>
              {title}
            </span>
            {subtitle && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.45 }}>{subtitle}</span>
            )}
          </div>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', minHeight: 0 }}>
          {children}
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          padding: '12px 20px', borderTop: '1px solid var(--bg-hover)',
        }}>
          {footer}
        </div>
      </div>
    </div>
  )

  return createPortal(dialog, document.body)
}

export const modalFieldStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box' as const,
  padding: '8px 11px',
  borderRadius: 9,
  border: '1px solid var(--bg-active)',
  background: 'var(--bg-hover)',
  color: 'var(--text-primary)',
  fontSize: 12.5,
  lineHeight: 1.65,
  fontFamily: 'inherit',
  outline: 'none',
}

export const modalLabelStyle: CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
  textTransform: 'uppercase' as const, color: 'var(--text-muted)',
}

export const modalPrimaryButtonStyle: CSSProperties = {
  background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
  border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 13,
  color: 'rgba(255,255,255,0.95)', fontWeight: 600, cursor: 'pointer',
  display: 'flex', alignItems: 'center', gap: 6,
  boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)',
  transition: 'all 0.15s ease',
}

export const modalSecondaryButtonStyle: CSSProperties = {
  background: 'var(--bg-hover)', border: '1px solid var(--bg-active)', borderRadius: 8,
  padding: '7px 16px', fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer',
  transition: 'all 0.15s ease',
}
