// SessionEmptyState — Friendly empty state for the session list (Iteration 461)
// Shows when there are no sessions (fresh install or after deleting all).
// Theme-aware: uses CSS variables from the design system.
import React from 'react'
import { MessageSquarePlus } from 'lucide-react'
import { useT } from '../../i18n'

interface Props {
  onNewChat: () => void
}

export default function SessionEmptyState({ onNewChat }: Props) {
  const t = useT()

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
        gap: 12,
        textAlign: 'center',
        flex: 1,
      }}
      aria-label={t('session.emptyState.noConversations')}
    >
      {/* Illustration: chat bubble icon */}
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'var(--bg-hover)',
          border: '1.5px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 4,
        }}
      >
        <MessageSquarePlus
          size={26}
          style={{ color: 'var(--text-muted)', opacity: 0.6 }}
        />
      </div>

      {/* Primary text */}
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
        {t('session.emptyState.noConversations')}
      </div>

      {/* Subtitle */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, maxWidth: 180 }}>
        {t('session.emptyState.subtitle')}
      </div>

      {/* CTA button */}
      <button
        onClick={onNewChat}
        style={{
          marginTop: 4,
          padding: '7px 18px',
          borderRadius: 20,
          background: 'var(--accent)',
          border: 'none',
          color: '#fff',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
          transition: 'opacity 150ms ease, box-shadow 150ms ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '0.9'
          e.currentTarget.style.boxShadow = '0 3px 10px rgba(0,0,0,0.3)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '1'
          e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)'
        }}
      >
        {t('session.emptyState.startNewChat')}
      </button>
    </div>
  )
}
