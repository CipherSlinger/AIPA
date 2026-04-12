import React, { useState } from 'react'
import { Zap } from 'lucide-react'
import { useT } from '../../i18n'
import type { LucideIcon } from 'lucide-react'

interface QuickAction {
  label: string
  icon: LucideIcon
  shortcut: string
  action: () => void
  color?: string
  description?: string
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
  const [hoveredQuick, setHoveredQuick] = useState<string | null>(null)
  const [hoveredFloat, setHoveredFloat] = useState<string | null>(null)

  return (
    <>
      {/* Quick action buttons */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {quickActions.map(({ label, icon: QIcon, shortcut, action, color = 'rgba(99,102,241,1)', description }) => {
          const isHovered = hoveredQuick === label
          const iconBg = color.startsWith('rgba') ? color.replace(/[\d.]+\)$/, '0.2)') : 'rgba(99,102,241,0.2)'
          return (
            <button
              key={label}
              onClick={action}
              title={description ?? `${label} (${shortcut})`}
              onMouseEnter={() => setHoveredQuick(label)}
              onMouseLeave={() => setHoveredQuick(null)}
              style={{
                background: isHovered ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.06)',
                border: isHovered ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10,
                padding: '12px 14px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                transform: isHovered ? 'translateY(-1px)' : 'translateY(0)',
                boxShadow: isHovered ? '0 4px 16px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{
                width: 32, height: 32, borderRadius: 8,
                background: iconBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <QIcon size={15} color={color} />
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.82)' }}>{label}</span>
                {description && (
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>{description}</span>
                )}
              </span>
              <kbd style={{
                fontSize: 10,
                fontFamily: 'monospace',
                background: 'rgba(255,255,255,0.07)',
                padding: '2px 5px',
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.45)',
                marginLeft: 'auto',
                flexShrink: 0,
              }}>{shortcut}</kbd>
            </button>
          )
        })}
      </div>

      {/* Floating quick action bar -- clipboard & task actions */}
      <div style={{
        display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center',
        padding: '10px 16px',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 12, width: '100%', maxWidth: 420,
      }}>
        <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
          <Zap size={11} color="#818cf8" />
          <span style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.07em', color: 'rgba(255,255,255,0.38)',
          }}>
            {t('welcome.floatingBar')}
          </span>
        </div>
        {floatingActions.map(({ label, icon: FAIcon, prompt }) => {
          const isHovered = hoveredFloat === label
          return (
            <button
              key={label}
              onClick={() => onFloatingAction(prompt)}
              onMouseEnter={() => setHoveredFloat(label)}
              onMouseLeave={() => setHoveredFloat(null)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px',
                background: isHovered ? 'rgba(255,255,255,0.08)' : 'transparent',
                border: isHovered ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(255,255,255,0.09)',
                borderRadius: 8,
                color: 'rgba(255,255,255,0.82)',
                cursor: 'pointer', fontSize: 11,
                transform: isHovered ? 'translateY(-1px)' : 'translateY(0)',
                boxShadow: isHovered ? '0 4px 16px rgba(0,0,0,0.3)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <FAIcon size={13} />
              {label}
            </button>
          )
        })}
      </div>
    </>
  )
}
