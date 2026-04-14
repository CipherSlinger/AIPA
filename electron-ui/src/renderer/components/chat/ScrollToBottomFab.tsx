// ScrollToBottomFab — Floating action button for scrolling to bottom (Iteration 461)
// Appears when user scrolls >300px from bottom. Shows unread badge.
// Does not appear during auto-scroll (AI streaming when near bottom).
import React from 'react'
import { ArrowDown } from 'lucide-react'
import { useT } from '../../i18n'

interface Props {
  show: boolean
  unreadCount: number
  onClick: () => void
}

export default function ScrollToBottomFab({ show, unreadCount, onClick }: Props) {
  const t = useT()

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        zIndex: 20,
        pointerEvents: show ? 'auto' : 'none',
        opacity: show ? 1 : 0,
        transform: show ? 'translateY(0)' : 'translateY(12px)',
        transition: 'opacity 0.15s ease, transform 0.15s ease',
        animation: show ? 'slideUp 0.15s ease' : undefined,
      }}
    >
      <button
        onClick={onClick}
        title={unreadCount > 0
          ? t(unreadCount > 1 ? 'chat.newMessagesPlural' : 'chat.newMessages', { count: String(unreadCount) })
          : t('chat.scrollToBottom')
        }
        aria-label={t('chat.scrollToBottom')}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 36,
          borderRadius: '50%',
          padding: 0,
          background: 'var(--glass-bg-raised)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid var(--glass-border-md)',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          boxShadow: 'var(--glass-shadow)',
          fontSize: 12,
          fontWeight: 600,
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLButtonElement
          el.style.background = 'var(--glass-bg-popup)'
          el.style.borderColor = 'rgba(99,102,241,0.40)'
          el.style.color = 'rgba(255,255,255,0.95)'
          el.style.boxShadow = '0 8px 32px rgba(0,0,0,0.5)'
          el.style.transform = 'scale(1.08)'
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLButtonElement
          el.style.background = 'var(--glass-bg-raised)'
          el.style.borderColor = 'rgba(255,255,255,0.12)'
          el.style.color = 'var(--text-primary)'
          el.style.boxShadow = '0 4px 16px rgba(0,0,0,0.4)'
          el.style.transform = 'scale(1)'
        }}
      >
        <ArrowDown size={15} />
        {unreadCount > 0 && (
          <span
            aria-live="polite"
            aria-atomic="true"
            style={{
              position: 'absolute',
              top: -6,
              right: -6,
              background: '#6366f1',
              color: 'rgba(255,255,255,0.95)',
              borderRadius: 10,
              minWidth: 16,
              height: 16,
              padding: '0 4px',
              fontSize: 10,
              fontWeight: 700,
              boxShadow: '0 2px 8px rgba(99,102,241,0.5)',
              lineHeight: '16px',
              whiteSpace: 'nowrap',
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
    </div>
  )
}
