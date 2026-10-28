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
        // 20px keeps the FAB clear of the composer's 12px bottom margin plus
        // its own focus ring; at 16px an armed button visually touched the
        // input bar when a toast or status row was not present.
        bottom: 20,
        right: 20,
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
          // Same surface, blur and elevation as the composer below it:
          // --popup-bg / blur(16px) / --popup-shadow. The old 12px blur and
          // pair of black drop shadows were a second, heavier elevation model.
          background: 'var(--popup-bg)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          boxShadow: 'var(--popup-shadow)',
          fontSize: 12,
          fontWeight: 600,
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLButtonElement
          el.style.borderColor = 'var(--accent-border)'
          el.style.color = 'var(--text-primary)'
          el.style.boxShadow = 'var(--glass-shadow)'
          el.style.transform = 'scale(1.04)'
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLButtonElement
          el.style.borderColor = 'var(--border)'
          el.style.color = 'var(--text-primary)'
          el.style.boxShadow = 'var(--popup-shadow)'
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
              background: 'var(--accent)',
              // White on indigo is the one place a literal is required:
              // --text-bright is black in the light theme, which would drop
              // to 3.3:1 on the badge fill.
              color: 'rgba(255,255,255,0.95)',
              borderRadius: 10,
              minWidth: 16,
              height: 16,
              padding: '0 4px',
              fontSize: 10,
              fontWeight: 700,
              boxShadow: '0 2px 8px var(--accent-border)',
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
