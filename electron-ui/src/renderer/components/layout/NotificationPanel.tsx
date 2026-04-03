import React, { useEffect } from 'react'
import { CheckCircle, XCircle, Info, AlertTriangle, Trash2 } from 'lucide-react'
import { useUiStore, NotificationEntry } from '../../store'
import { useT } from '../../i18n'

const ICONS: Record<string, React.ElementType> = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
}

const COLORS: Record<string, string> = {
  success: 'var(--success, #0dbc79)',
  error: 'var(--error, #f44747)',
  info: 'var(--accent, #0e639c)',
  warning: '#e5a50a',
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

function NotificationItem({ entry }: { entry: NotificationEntry }) {
  const Icon = ICONS[entry.type] || Info
  const color = COLORS[entry.type] || COLORS.info

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      padding: '10px 12px',
      borderBottom: '1px solid var(--border)',
    }}>
      <Icon size={14} color={color} style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12,
          color: 'var(--text-primary)',
          lineHeight: 1.4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical' as any,
        }}>
          {entry.message}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
          {formatRelativeTime(entry.timestamp)}
        </div>
      </div>
    </div>
  )
}

export default function NotificationPanel() {
  const notifications = useUiStore(s => s.notifications)
  const clearNotifications = useUiStore(s => s.clearNotifications)
  const markRead = useUiStore(s => s.markNotificationsRead)
  const t = useT()

  // Mark as read when panel opens
  useEffect(() => {
    markRead()
  }, [])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 12px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
          {t('notifications.title')}
        </span>
        {notifications.length > 0 && (
          <button
            onClick={clearNotifications}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 11,
            }}
            title={t('notifications.clearAll')}
          >
            <Trash2 size={12} />
            {t('notifications.clearAll')}
          </button>
        )}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {notifications.length === 0 ? (
          <div style={{
            padding: '32px 16px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: 12,
          }}>
            <Info size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
            <div>{t('notifications.empty')}</div>
          </div>
        ) : (
          notifications.map(entry => (
            <NotificationItem key={entry.id} entry={entry} />
          ))
        )}
      </div>
    </div>
  )
}
