import React, { useEffect } from 'react'
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react'
import { useT } from '../../i18n'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastItem {
  id: string
  type: ToastType
  message: string
  duration?: number  // ms, default 4000
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

const COLORS: Record<ToastType, string> = {
  success: 'var(--success, #0dbc79)',
  error: 'var(--error, #f44747)',
  info: 'var(--accent, #0e639c)',
  warning: '#e5a50a',
}

export function Toast({ toast, onDismiss }: ToastProps) {
  const { id, type, message, duration = 4000 } = toast
  const Icon = ICONS[type]
  const color = COLORS[type]
  const t = useT()

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), duration)
    return () => clearTimeout(timer)
  }, [id, duration, onDismiss])

  return (
    <div
      role={type === 'error' || type === 'warning' ? 'alert' : 'status'}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '10px 14px',
        background: 'var(--bg-secondary, #252526)',
        border: `1px solid ${color}`,
        borderLeft: `4px solid ${color}`,
        borderRadius: 6,
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        minWidth: 280,
        maxWidth: 400,
        color: 'var(--text-primary, #ccc)',
        fontSize: 13,
        animation: 'toast-in 0.2s ease',
      }}
    >
      <Icon size={16} color={color} style={{ flexShrink: 0, marginTop: 1 }} />
      <span style={{ flex: 1, lineHeight: 1.5 }}>{message}</span>
      <button
        onClick={() => onDismiss(id)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-muted, #858585)',
          padding: 0,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
        }}
        aria-label={t('a11y.dismiss')}
      >
        <X size={14} />
      </button>
    </div>
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
