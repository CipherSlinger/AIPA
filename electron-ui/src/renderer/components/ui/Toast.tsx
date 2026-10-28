import React, { useEffect, useState } from 'react'
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react'
import { useT } from '../../i18n'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastAction {
  label: string
  onClick: () => void
  // Spoken name when `label` is terse ("Open") and needs the object it acts on.
  ariaLabel?: string
}

export interface ToastItem {
  id: string
  type: ToastType
  message: string
  duration?: number  // ms, default 4000
  action?: ToastAction
}

interface ToastProps {
  toast: ToastItem
  onDismiss: (id: string) => void
}

const ICONS: Record<ToastType, React.ElementType> = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
}

const VARIANT_STYLES: Record<ToastType, { bg: string; border: string; color: string; iconColor: string }> = {
  success: {
    bg: 'rgba(34,197,94,0.12)',
    border: '1px solid rgba(34,197,94,0.25)',
    color: 'var(--text-primary)',
    iconColor: '#4ade80',
  },
  error: {
    bg: 'rgba(239,68,68,0.12)',
    border: '1px solid rgba(239,68,68,0.25)',
    color: 'var(--text-primary)',
    iconColor: '#f87171',
  },
  info: {
    bg: 'rgba(99,102,241,0.10)',
    border: '1px solid rgba(99,102,241,0.22)',
    color: 'var(--text-primary)',
    iconColor: '#818cf8',
  },
  warning: {
    bg: 'rgba(251,191,36,0.10)',
    border: '1px solid rgba(251,191,36,0.22)',
    color: 'var(--text-primary)',
    iconColor: '#fbbf24',
  },
}

const TOAST_STYLES = `
@keyframes toast-in {
  from { opacity: 0; transform: translateY(12px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
/* The type accent tints the border and hover wash; the focus ring uses the
   theme accent because the pastel type colours do not clear 3:1 on the light
   popup surface. The global reduced-motion rule collapses the transition. */
.aipa-toast-action {
  flex-shrink: 0;
  align-self: flex-start;
  margin-top: 1px;
  padding: 1px 8px;
  border-radius: 6px;
  border: 1px solid var(--toast-accent);
  background: transparent;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.aipa-toast-action:hover {
  background: var(--toast-accent-soft);
}
.aipa-toast-action:focus-visible {
  outline: 2px solid var(--accent-solid);
  outline-offset: 2px;
}
`

export function Toast({ toast, onDismiss }: ToastProps) {
  const { id, type, message, duration = 4000, action } = toast
  const Icon = ICONS[type]
  const v = VARIANT_STYLES[type]
  const t = useT()
  const [closeBtnHover, setCloseBtnHover] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), duration)
    return () => clearTimeout(timer)
  }, [id, duration, onDismiss])

  // Dismiss in `finally`: a handler that throws must not leave a dead button
  // on screen until the timer catches up.
  const runAction = () => {
    if (!action) return
    try {
      action.onClick()
    } finally {
      onDismiss(id)
    }
  }

  return (
    <>
      <style>{TOAST_STYLES}</style>
      <div
        role={type === 'error' || type === 'warning' ? 'alert' : 'status'}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: '10px 14px',
          background: 'var(--popup-bg)',
          borderLeft: `3px solid ${v.iconColor}`,
          border: `1px solid var(--border)`,
          borderRadius: 12,
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
          maxWidth: 360,
          color: v.color,
          animation: 'toast-in 0.15s ease',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Type-accent left strip */}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
          background: v.iconColor, borderRadius: '12px 0 0 12px',
        }} />
        <Icon size={16} color={v.iconColor} style={{ flexShrink: 0, marginTop: 1, marginLeft: 8 }} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 500, lineHeight: 1.4, color: 'var(--text-primary)' }}>{message}</span>
        {action && (
          <button
            type="button"
            className="aipa-toast-action"
            onClick={runAction}
            aria-label={action.ariaLabel ?? action.label}
            style={{
              // Custom properties carry the per-type accent into the stylesheet
              // rules for hover and focus, which inline styles cannot express.
              '--toast-accent': v.iconColor,
              '--toast-accent-soft': `${v.iconColor}22`,
            } as React.CSSProperties}
          >
            {action.label}
          </button>
        )}
        <button
          onClick={() => onDismiss(id)}
          style={{
            background: closeBtnHover ? 'var(--border)' : 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            padding: '3px 4px',
            marginLeft: 'auto',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            borderRadius: 6,
            transition: 'all 0.15s ease',
          }}
          aria-label={t('a11y.dismiss')}
          onMouseEnter={() => setCloseBtnHover(true)}
          onMouseLeave={() => setCloseBtnHover(false)}
        >
          <X size={14} />
        </button>
      </div>
    </>
  )
}

interface ToastContainerProps {
  toasts: ToastItem[]
  onDismiss: (id: string) => void
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  const t = useT()
  if (toasts.length === 0) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 40,
        right: 20,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}
      aria-live="assertive"
      aria-label={t('a11y.notifications')}
    >
      {toasts.map(toast => (
        <div key={toast.id} style={{ pointerEvents: 'all' }}>
          <Toast toast={toast} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  )
}
