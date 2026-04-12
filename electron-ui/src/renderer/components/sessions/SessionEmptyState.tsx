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
      {/* Illustration: chat bubble icon — indigo glow */}
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'rgba(99,102,241,0.14)',
          border: '1px solid rgba(99,102,241,0.28)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 4,
          boxShadow: '0 4px 16px rgba(99,102,241,0.15), 0 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        <MessageSquarePlus size={28} style={{ color: 'rgba(99,102,241,0.85)' }} />
      </div>

      {/* Primary text */}
      <div style={{
        fontSize: 14,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.60)',
        marginBottom: 2,
        lineHeight: 1.3,
      }}>
        {t('session.emptyState.noConversations')}
      </div>

      {/* Subtitle */}
      <div style={{
        fontSize: 12,
        color: 'rgba(255,255,255,0.38)',
        lineHeight: 1.55,
        maxWidth: 180,
      }}>
        {t('session.emptyState.subtitle')}
      </div>

      {/* CTA button — indigo gradient */}
      <button
        onClick={onNewChat}
        style={{
          marginTop: 8,
          padding: '8px 20px',
          borderRadius: 8,
          background: 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))',
          border: '1px solid rgba(99,102,241,0.35)',
          color: 'rgba(255,255,255,0.82)',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          boxShadow: '0 2px 8px rgba(99,102,241,0.20)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,0.95), rgba(139,92,246,0.95))'
          e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.40), 0 1px 4px rgba(0,0,0,0.3)'
          e.currentTarget.style.transform = 'translateY(-1px)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,0.88), rgba(139,92,246,0.88))'
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(99,102,241,0.20)'
          e.currentTarget.style.transform = 'translateY(0)'
        }}
      >
        {t('session.emptyState.startNewChat')}
      </button>
    </div>
  )
}
