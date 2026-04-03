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
        transition: 'opacity 150ms ease, transform 150ms ease',
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
          gap: 5,
          minWidth: 36,
          height: 36,
          borderRadius: unreadCount > 0 ? 18 : '50%',
          padding: unreadCount > 0 ? '0 14px' : 0,
          background: 'var(--accent)',
          border: 'none',
          color: '#fff',
          cursor: 'pointer',
          boxShadow: '0 3px 12px rgba(0,0,0,0.35)',
          fontSize: 12,
          fontWeight: 600,
          transition: 'border-radius 150ms ease, padding 150ms ease, box-shadow 150ms ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.45)' }}
        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 3px 12px rgba(0,0,0,0.35)' }}
      >
        <ArrowDown size={15} />
        {unreadCount > 0 && (
          <span aria-live="polite" aria-atomic="true">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
        {/* Pulsing dot on unread (subtle attention signal) */}
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: 'var(--warning, #fbbf24)',
              border: '2px solid var(--bg-chat, #1e1e2e)',
              animation: 'dot-wave 1.4s ease-in-out infinite',
            }}
          />
        )}
      </button>
    </div>
  )
}
