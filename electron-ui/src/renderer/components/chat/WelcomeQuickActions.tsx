import React from 'react'
import { Zap } from 'lucide-react'
import { useT } from '../../i18n'
import type { LucideIcon } from 'lucide-react'

interface QuickAction {
  label: string
  icon: LucideIcon
  shortcut: string
  action: () => void
}

interface FloatingAction {
  label: string
  icon: LucideIcon
  prompt: string
}

interface WelcomeQuickActionsProps {
  quickActions: QuickAction[]
  floatingActions: FloatingAction[]
  onFloatingAction: (prompt: string) => void
}

/**
 * Quick action buttons + floating action bar for the welcome screen.
 * Extracted from WelcomeScreen.tsx (Iteration 454).
 */
export default function WelcomeQuickActions({
  quickActions,
  floatingActions,
  onFloatingAction,
}: WelcomeQuickActionsProps) {
  const t = useT()

  return (
    <>
      {/* Quick action buttons */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {quickActions.map(({ label, icon: QIcon, shortcut, action }) => (
          <button
            key={label}
            onClick={action}
            title={`${label} (${shortcut})`}
            style={{
              background: 'none', border: '1px solid var(--card-border)', borderRadius: 6,
              padding: '5px 14px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12,
              display: 'inline-flex', alignItems: 'center', gap: 5,
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)'
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--card-border)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'
            }}
          >
            <QIcon size={12} />
            {label}
            <kbd style={{
              fontSize: 9, opacity: 0.5, fontFamily: 'monospace', background: 'rgba(255,255,255,0.06)',
              padding: '1px 4px', borderRadius: 3, border: '1px solid rgba(255,255,255,0.1)',
            }}>{shortcut}</kbd>
          </button>
        ))}
      </div>

      {/* Floating quick action bar -- clipboard & task actions */}
      <div style={{
        display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center',
        padding: '10px 16px', background: 'var(--card-bg)', border: '1px solid var(--card-border)',
        borderRadius: 12, width: '100%', maxWidth: 420,
      }}>
        <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
          <Zap size={11} color="var(--accent)" />
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {t('welcome.floatingBar')}
          </span>
        </div>
        {floatingActions.map(({ label, icon: FAIcon, prompt }) => (
          <button
            key={label}
            onClick={() => onFloatingAction(prompt)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px',
              background: 'transparent', border: '1px solid var(--card-border)',
              borderRadius: 8, color: 'var(--text-primary)', cursor: 'pointer', fontSize: 11,
              transition: 'background 0.15s, border-color 0.15s, transform 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--action-btn-hover)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)';
              (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.03)'
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--card-border)';
              (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'
            }}
          >
            <FAIcon size={13} />
            {label}
          </button>
        ))}
      </div>
    </>
  )
}
